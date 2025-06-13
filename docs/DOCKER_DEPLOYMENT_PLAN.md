# Docker Deployment Plan for n8n-MCP (v2)

## Executive Summary

This document outlines a phased plan to enhance the developer experience of n8n-MCP through Docker deployment. We'll start with a simple, working solution and progressively add features like nginx HTTPS support based on user needs.

## Goals

1. **One-Command Deployment**: Users should be able to run `docker compose up -d` after minimal configuration
2. **Progressive Enhancement**: Start simple, add complexity only when needed
3. **Dual Mode Support**: Single Docker image supporting both stdio (local) and HTTP (remote) modes
4. **Automated Builds**: GitHub Actions workflow for building and publishing to GitHub Container Registry (ghcr.io)
5. **Database Persistence**: Reliable SQLite database persistence with proper volume management
6. **Cross-Platform Support**: Multi-architecture images (amd64, arm64) for broad compatibility

## Implementation Strategy

### Phase 1: Simple Docker (Week 1)
- Basic Dockerfile without nginx
- Simple docker-compose.yml
- Essential features only
- Focus on ease of use

### Phase 2: Enhanced Security (Week 2)
- Optional nginx support
- HTTPS capabilities
- Advanced configurations
- Production-ready features

### Phase 3: CI/CD & Documentation (Week 3)
- GitHub Actions setup
- Comprehensive documentation
- Community feedback integration

## Architecture Overview

### Phase 1: Simple Container Architecture

```
┌─────────────────────────────────────────┐
│      n8n-MCP Docker Image (Simple)      │
├─────────────────────────────────────────┤
│  Layer 1: Base Runtime                  │
│  - Node.js 20 Alpine (minimal)          │
│  - Essential system dependencies        │
├─────────────────────────────────────────┤
│  Layer 2: Application                   │
│  - Production npm packages              │
│  - Pre-built JavaScript from TypeScript │
├─────────────────────────────────────────┤
│  Layer 3: Data & Config                 │
│  - SQLite database with auto-init       │
│  - Environment-based configuration      │
└─────────────────────────────────────────┘
```

### Phase 2: Enhanced Architecture (Optional)

```
┌─────────────────────────────────────────┐
│    n8n-MCP Docker Image (Enhanced)      │
├─────────────────────────────────────────┤
│  Layer 1: Extended Runtime              │
│  - Node.js 20 Alpine                    │
│  - nginx (optional via USE_NGINX)       │
│  - supervisor (when nginx enabled)      │
├─────────────────────────────────────────┤
│  Layer 2: Application                   │
│  - Production npm packages              │
│  - Pre-built JavaScript                 │
├─────────────────────────────────────────┤
│  Layer 3: Security & Config             │
│  - Auto-generated SSL certificates      │
│  - nginx configurations                 │
│  - Enhanced security headers            │
└─────────────────────────────────────────┘
```

### Dual Mode Operation

```
                 ┌─────────────────┐
                 │ Docker Container │
                 └────────┬─────────┘
                          │
            ┌─────────────┴─────────────┐
            │   Check MCP_MODE env var  │
            └─────────────┬─────────────┘
                          │
        ┌─────────────────┴─────────────────┐
        │                                   │
   [stdio mode]                        [http mode]
        │                                   │
        ▼                                   ▼
┌───────────────┐              ┌─────────────────────┐
│  MCP Server   │              │   Check USE_NGINX   │
│   (stdio)     │              └──────────┬──────────┘
└───────────────┘                         │
        │                     ┌───────────┴───────────┐
        │                     │                       │
        │                [USE_NGINX=false]    [USE_NGINX=true]
        │                     │                       │
        │                     ▼                       ▼
        │              ┌─────────────┐        ┌──────────────┐
        │              │  Node.js    │        │  supervisor  │
        │              │  HTTP :3000 │        ├──────┬───────┤
        │              └─────────────┘        │nginx │Node.js│
        │                                     │:443  │:3000  │
        │                                     └──────┴───────┘
        ▼                                              │
┌───────────────┐                             ┌───────────────┐
│ Claude Desktop│                             │  mcp-remote   │
└───────────────┘                             └───────────────┘
```

## Implementation Plan

### Phase 1: Simple Docker Implementation

#### 1.1 Basic Multi-Stage Dockerfile

```dockerfile
# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
# Install all dependencies including dev for building
RUN npm ci

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build TypeScript
RUN npm run build
# Rebuild database during image build (if possible)
RUN npm run rebuild || echo "Database will be initialized at runtime"

# Stage 3: Simple Runtime
FROM node:20-alpine AS runtime
WORKDIR /app

# Install only essential tools
RUN apk add --no-cache curl && \
    rm -rf /var/cache/apk/*

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/data ./data 2>/dev/null || mkdir -p ./data

# Copy necessary files
COPY .env.example .env.example
COPY LICENSE LICENSE
COPY README.md README.md

# Add container labels
LABEL org.opencontainers.image.source="https://github.com/czlonkowski/n8n-mcp"
LABEL org.opencontainers.image.description="n8n MCP Server - Simple Version"
LABEL org.opencontainers.image.licenses="Sustainable-Use-1.0"
LABEL org.opencontainers.image.vendor="n8n-mcp"
LABEL org.opencontainers.image.title="n8n-mcp"

# Create data directory and fix permissions
RUN mkdir -p /app/data && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

# Copy entrypoint script
COPY docker/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Switch to non-root user
USER nodejs

# Expose HTTP port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://127.0.0.1:3000/health || exit 1

# Entrypoint
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/mcp/index.js"]
```

#### 1.2 Simple Entrypoint Script

```bash
#!/bin/sh
set -e

# Environment variable validation
if [ "$MCP_MODE" = "http" ] && [ -z "$AUTH_TOKEN" ]; then
    echo "ERROR: AUTH_TOKEN is required for HTTP mode"
    exit 1
fi

# Database initialization with file locking to prevent race conditions
if [ ! -f "/app/data/nodes.db" ]; then
    echo "Database not found. Initializing..."
    # Use a lock file to prevent multiple containers from initializing simultaneously
    (
        flock -x 200
        # Double-check inside the lock
        if [ ! -f "/app/data/nodes.db" ]; then
            echo "Initializing database..."
            cd /app && node dist/scripts/rebuild.js || {
                echo "ERROR: Database initialization failed"
                exit 1
            }
        fi
    ) 200>/app/data/.db.lock
fi

# Fix permissions if running as root (for development)
if [ "$(id -u)" = "0" ]; then
    echo "Running as root, fixing permissions..."
    chown -R nodejs:nodejs /app/data
    # Switch to nodejs user
    exec su-exec nodejs "$@"
fi

# Trap signals for graceful shutdown
trap 'echo "Shutting down..."; kill -TERM $PID' TERM INT

# Execute the main command in background
"$@" &
PID=$!
wait $PID
```

#### 1.3 .dockerignore File

```dockerignore
# .dockerignore
node_modules
npm-debug.log
.git
.gitignore
.env
.env.local
data/nodes.db
data/*.db
dist
.DS_Store
*.log
coverage
.nyc_output
.vscode
.idea
*.swp
*.swo
*~
```

#### 1.4 Simple docker-compose.yml

```yaml
# docker-compose.yml
version: '3.8'

services:
  n8n-mcp:
    image: ghcr.io/czlonkowski/n8n-mcp:latest
    container_name: n8n-mcp
    restart: unless-stopped
    
    # Environment configuration
    environment:
      # Mode configuration
      MCP_MODE: ${MCP_MODE:-http}
      AUTH_TOKEN: ${AUTH_TOKEN:?AUTH_TOKEN is required for HTTP mode}
      
      # Application settings
      NODE_ENV: ${NODE_ENV:-production}
      LOG_LEVEL: ${LOG_LEVEL:-info}
      PORT: ${PORT:-3000}
      
      # Database
      NODE_DB_PATH: ${NODE_DB_PATH:-/app/data/nodes.db}
      REBUILD_ON_START: ${REBUILD_ON_START:-false}
    
    # Volumes for persistence
    volumes:
      - n8n-mcp-data:/app/data
    
    # Port mapping
    ports:
      - "${PORT:-3000}:3000"
    
    # Resource limits
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M
    
    # Health check
    healthcheck:
      test: ["CMD", "curl", "-f", "http://127.0.0.1:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

# Named volume for data persistence
volumes:
  n8n-mcp-data:
    driver: local
```

#### 1.5 Environment Variable Documentation

```bash
# .env.example
# n8n-MCP Docker Configuration

# Mode configuration
# - stdio: For Claude Desktop integration
# - http: For remote access via HTTP/HTTPS
MCP_MODE=http

# Authentication token for HTTP mode (required)
# Generate with: openssl rand -base64 32
AUTH_TOKEN=your-secure-token-here

# Server configuration
PORT=3000
NODE_ENV=production
LOG_LEVEL=info

# Database configuration
NODE_DB_PATH=/app/data/nodes.db
REBUILD_ON_START=false

# Optional: For future nginx support
USE_NGINX=false
```

#### 1.6 Docker-specific Environment Template

```bash
# .env.docker
# Docker-specific environment template
# Copy to .env and fill in values

# Required for HTTP mode
AUTH_TOKEN=

# Server configuration
PORT=3000
HTTP_PORT=80
HTTPS_PORT=443

# Application settings
NODE_ENV=production
LOG_LEVEL=info
MCP_MODE=http

# Database
NODE_DB_PATH=/app/data/nodes.db
REBUILD_ON_START=false

# Optional nginx mode
USE_NGINX=false
```

#### 1.7 Development Override File

```yaml
# docker-compose.override.yml
# Local development overrides (git-ignored)
version: '3.8'

services:
  n8n-mcp:
    environment:
      NODE_ENV: development
      LOG_LEVEL: debug
      REBUILD_ON_START: "true"
    volumes:
      # Mount source for hot reload
      - ./src:/app/src:ro
      - ./scripts:/app/scripts:ro
```

### Phase 2: Enhanced Docker with nginx (Week 2)

#### 2.1 Enhanced Dockerfile with nginx Support

```dockerfile
# Dockerfile.nginx - Enhanced version with HTTPS support
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
RUN npm run rebuild || echo "Database will be initialized at runtime"

FROM node:20-alpine AS runtime
WORKDIR /app

# Install nginx, supervisor, openssl
RUN apk add --no-cache nginx supervisor openssl curl su-exec && \
    rm -rf /var/cache/apk/*

# Copy application
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/data ./data 2>/dev/null || mkdir -p ./data

# Setup users and directories
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    mkdir -p /app/data /app/certs /var/log/supervisor /var/log/nginx \
             /var/cache/nginx /var/run /etc/nginx/conf.d && \
    chown -R nodejs:nodejs /app && \
    chown -R nginx:nginx /var/log/nginx /var/cache/nginx

# Add container labels
LABEL org.opencontainers.image.source="https://github.com/czlonkowski/n8n-mcp"
LABEL org.opencontainers.image.description="n8n MCP Server - nginx Enhanced Version"
LABEL org.opencontainers.image.licenses="Sustainable-Use-1.0"
LABEL org.opencontainers.image.vendor="n8n-mcp"
LABEL org.opencontainers.image.title="n8n-mcp-nginx"

# Copy configurations
COPY docker/ /docker/
RUN chmod +x /docker/docker-entrypoint-nginx.sh

# Generate self-signed certificate
RUN openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /app/certs/server.key \
    -out /app/certs/server.crt \
    -subj "/C=US/ST=State/L=City/O=n8n-MCP/CN=localhost" && \
    chown -R nodejs:nodejs /app/certs

EXPOSE 80 443 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD /docker/healthcheck.sh

ENTRYPOINT ["/docker/docker-entrypoint-nginx.sh"]
```

#### 2.2 nginx Configuration (Simplified)

```nginx
# /docker/nginx.conf
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';
    access_log /var/log/nginx/access.log main;
    
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    server_tokens off;
    client_max_body_size 1m;
    
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=mcp_limit:10m rate=10r/s;
    
    upstream mcp_backend {
        server 127.0.0.1:3000;
    }
    
    server {
        listen 80;
        listen [::]:80;
        return 301 https://$host$request_uri;
    }
    
    server {
        listen 443 ssl http2;
        listen [::]:443 ssl http2;
        
        ssl_certificate /app/certs/server.crt;
        ssl_certificate_key /app/certs/server.key;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;
        
        # Security headers
        add_header X-Frame-Options "DENY" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Strict-Transport-Security "max-age=31536000" always;
        
        # Rate limiting
        limit_req zone=mcp_limit burst=20 nodelay;
        
        location /mcp {
            # Let Node.js handle auth - nginx just proxies
            proxy_pass http://mcp_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Authorization $http_authorization;
            proxy_cache_bypass $http_upgrade;
            proxy_read_timeout 60s;
        }
        
        location /health {
            proxy_pass http://mcp_backend/health;
            access_log off;
        }
        
        location / {
            return 301 /health;
        }
    }
}
```

#### 2.3 Supervisor Configuration with Log Rotation

```ini
# /docker/supervisord.conf
[supervisord]
nodaemon=true
user=root
logfile=/var/log/supervisor/supervisord.log
pidfile=/var/run/supervisord.pid
logfile_maxbytes=10MB
logfile_backups=3

[program:nginx]
command=/usr/sbin/nginx -g "daemon off;"
autostart=true
autorestart=true
stdout_logfile=/var/log/supervisor/nginx.log
stderr_logfile=/var/log/supervisor/nginx.error.log
stdout_logfile_maxbytes=10MB
stdout_logfile_backups=3
stderr_logfile_maxbytes=10MB
stderr_logfile_backups=3
priority=10

[program:mcp-server]
command=su-exec nodejs node /app/dist/mcp/index.js
directory=/app
autostart=true
autorestart=true
environment=NODE_ENV="production"
stdout_logfile=/var/log/supervisor/mcp.log
stderr_logfile=/var/log/supervisor/mcp.error.log
stdout_logfile_maxbytes=10MB
stdout_logfile_backups=3
stderr_logfile_maxbytes=10MB
stderr_logfile_backups=3
priority=20

[group:mcp]
programs=nginx,mcp-server
```

#### 2.4 Enhanced docker-compose.nginx.yml

```yaml
# docker-compose.nginx.yml - For HTTPS deployments
version: '3.8'

services:
  n8n-mcp:
    image: ghcr.io/czlonkowski/n8n-mcp:nginx
    container_name: n8n-mcp-https
    restart: unless-stopped
    
    environment:
      MCP_MODE: http
      AUTH_TOKEN: ${AUTH_TOKEN:?AUTH_TOKEN is required}
      USE_NGINX: "true"
      NODE_ENV: ${NODE_ENV:-production}
      LOG_LEVEL: ${LOG_LEVEL:-info}
    
    volumes:
      - n8n-mcp-data:/app/data
      # Optional: Custom certificates
      # - ./certs/server.crt:/app/certs/server.crt:ro
      # - ./certs/server.key:/app/certs/server.key:ro
    
    ports:
      - "${HTTP_PORT:-80}:80"
      - "${HTTPS_PORT:-443}:443"
    
    # Resource limits
    deploy:
      resources:
        limits:
          memory: 768M
        reservations:
          memory: 512M
    
    healthcheck:
      test: ["CMD", "/docker/healthcheck.sh"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  n8n-mcp-data:
    driver: local
```

#### 2.5 Enhanced Entrypoint for nginx Mode

```bash
#!/bin/sh
# /docker/docker-entrypoint-nginx.sh
set -e

# Environment variable validation
if [ "$MCP_MODE" = "http" ] && [ -z "$AUTH_TOKEN" ]; then
    echo "ERROR: AUTH_TOKEN is required for HTTP mode"
    exit 1
fi

# Database initialization with locking
if [ ! -f "/app/data/nodes.db" ]; then
    (
        flock -x 200
        if [ ! -f "/app/data/nodes.db" ]; then
            echo "Initializing database..."
            su-exec nodejs node /app/dist/scripts/rebuild.js || exit 1
        fi
    ) 200>/app/data/.db.lock
fi

# Fix permissions
chown -R nodejs:nodejs /app/data

if [ "$USE_NGINX" = "true" ] && [ "$MCP_MODE" = "http" ]; then
    echo "Starting with nginx HTTPS support..."
    exec /usr/bin/supervisord -c /docker/supervisord.conf
else
    echo "Starting Node.js directly..."
    # Trap signals for graceful shutdown
    trap 'echo "Shutting down..."; kill -TERM $PID' TERM INT
    
    su-exec nodejs node /app/dist/mcp/index.js &
    PID=$!
    wait $PID
fi
```

#### 2.6 Health Check Script

```bash
#!/bin/sh
# /docker/healthcheck.sh

if [ "$USE_NGINX" = "true" ]; then
    # Check nginx first
    curl -f -k https://127.0.0.1/health || \
    curl -f http://127.0.0.1:3000/health || exit 1
else
    # Direct Node.js check
    curl -f http://127.0.0.1:3000/health || exit 1
fi
```


### Phase 3: CI/CD & Documentation (Week 3)

#### 3.1 GitHub Actions Workflow

```yaml
# .github/workflows/docker-build.yml
name: Build and Push Docker Images

on:
  push:
    branches:
      - main
    tags:
      - 'v*'
  pull_request:
    branches:
      - main
  workflow_dispatch:

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  build-simple:
    name: Build Simple Docker Image
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
      
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        
      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3
        
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
        
      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
          
      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=ref,event=pr
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=sha,prefix={{branch}}-,format=short
            type=raw,value=latest,enable={{is_default_branch}}
            
      - name: Build and push simple Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./Dockerfile
          platforms: linux/amd64,linux/arm64
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  build-nginx:
    name: Build nginx-enhanced Docker Image
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
      
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        
      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3
        
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
        
      - name: Log in to GitHub Container Registry
        if: github.event_name != 'pull_request'
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
          
      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          flavor: |
            suffix=-nginx
          tags: |
            type=ref,event=branch
            type=ref,event=pr
            type=semver,pattern={{version}}
            type=raw,value=nginx,enable={{is_default_branch}}
            
      - name: Build and push nginx Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./Dockerfile.nginx
          platforms: linux/amd64,linux/arm64
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

#### 3.2 Quick Start Documentation

```markdown
# Docker Quick Start Guide

## Option 1: Simple HTTP Server (Recommended to Start)

1. Create a `.env` file:
```bash
# Required for HTTP mode
AUTH_TOKEN=$(openssl rand -base64 32)
echo "AUTH_TOKEN=$AUTH_TOKEN" > .env
```

2. Run with Docker Compose:
```bash
docker compose up -d
```

3. Test the server:
```bash
curl http://localhost:3000/health
```

4. Configure Claude Desktop with mcp-remote:
```json
{
  "mcpServers": {
    "n8n-remote": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/mcp-remote@latest",
        "connect",
        "http://localhost:3000/mcp"
      ],
      "env": {
        "MCP_AUTH_TOKEN": "your-auth-token-here"
      }
    }
  }
}
```

## Option 2: Local stdio Mode (Claude Desktop Direct)

```json
{
  "mcpServers": {
    "n8n-docker": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-e", "MCP_MODE=stdio",
        "-v", "n8n-mcp-data:/app/data",
        "ghcr.io/czlonkowski/n8n-mcp:latest"
      ]
    }
  }
}
```

## Option 3: HTTPS with nginx (Production)

```bash
# Use the nginx-enhanced image
docker compose -f docker-compose.nginx.yml up -d
```

Access via HTTPS: https://your-server/mcp
```

## Implementation Details

### Critical Issues Addressed

#### 1. nginx Auth Token Validation
Instead of trying to validate tokens in nginx configuration, we:
- Let nginx act as a simple proxy
- Pass Authorization header to Node.js
- Node.js handles all authentication logic
- This avoids nginx string interpolation issues

#### 2. Database Race Condition Prevention
Implemented file locking in entrypoint script:
```bash
(
  flock -x 200
  if [ ! -f "/app/data/nodes.db" ]; then
    echo "Initializing database..."
    su-exec nodejs node /app/dist/scripts/rebuild.js || exit 1
  fi
) 200>/app/data/.db.lock
```

#### 3. Volume Permissions
- Use `su-exec` for proper user switching
- Fix permissions at runtime in entrypoint
- Consistent nodejs user (UID 1001)

#### 4. Simplified Architecture
- Phase 1: Simple Node.js-only Docker image
- Phase 2: Optional nginx enhancement
- Users choose based on their needs

#### 5. Essential Files Structure
```
docker/
├── docker-entrypoint.sh           # Simple entrypoint
├── docker-entrypoint-nginx.sh     # Enhanced entrypoint
├── nginx.conf                     # Main nginx config
├── supervisord.conf               # Process manager config
└── healthcheck.sh                 # Health check script
```

### Testing Strategy

#### Test Script for Docker Deployment

```bash
#!/bin/bash
# scripts/test-docker.sh

echo "🧪 Testing n8n-MCP Docker Deployment"

# Test 1: Build simple image
echo "1. Building simple Docker image..."
docker build -t n8n-mcp:test .

# Test 2: Test stdio mode
echo "2. Testing stdio mode..."
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | \
  docker run --rm -i -e MCP_MODE=stdio n8n-mcp:test

# Test 3: Test HTTP mode
echo "3. Testing HTTP mode..."
docker run -d --name test-http \
  -e MCP_MODE=http \
  -e AUTH_TOKEN=test-token \
  -p 3001:3000 \
  n8n-mcp:test

sleep 5

# Check health
curl -f http://localhost:3001/health || echo "Health check failed"

# Test auth
curl -H "Authorization: Bearer test-token" \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' \
     http://localhost:3001/mcp

docker stop test-http && docker rm test-http

# Test 4: Volume persistence
echo "4. Testing volume persistence..."
docker volume create test-data
docker run -d --name test-persist \
  -v test-data:/app/data \
  -e MCP_MODE=http \
  -e AUTH_TOKEN=test \
  -p 3002:3000 \
  n8n-mcp:test

sleep 10
docker exec test-persist ls -la /app/data/nodes.db
docker stop test-persist && docker rm test-persist
docker volume rm test-data

echo "✅ Docker tests completed!"
```

## Success Metrics

1. **Ease of Use**: Setup time < 2 minutes
2. **Performance**: < 5 second startup time  
3. **Compatibility**: Works on Linux, macOS, Windows (Docker Desktop)
4. **Reliability**: Automatic database initialization
5. **Security**: Built-in auth token validation

## Implementation Checklist

### Week 1: Phase 1 - Simple Docker
- [ ] Create `Dockerfile` with labels
- [ ] Create `docker/docker-entrypoint.sh` with validation and graceful shutdown
- [ ] Create `.dockerignore`
- [ ] Create `docker-compose.yml` with resource limits
- [ ] Create `.env.docker` template
- [ ] Create `scripts/test-docker.sh`
- [ ] Test both stdio and HTTP modes
- [ ] Update README with Docker quick start

### Week 2: Phase 2 - Enhanced Features  
- [ ] Create `Dockerfile.nginx` with labels
- [ ] Create `docker/docker-entrypoint-nginx.sh`
- [ ] Create `docker/nginx.conf`
- [ ] Create `docker/supervisord.conf` with log rotation
- [ ] Create `docker/healthcheck.sh`
- [ ] Create `docker-compose.nginx.yml` with resource limits
- [ ] Test HTTPS functionality
- [ ] Document SSL certificate options

### Week 3: Phase 3 - CI/CD & Polish
- [ ] Set up GitHub Actions workflow
- [ ] Configure GHCR permissions
- [ ] Test multi-architecture builds
- [ ] Create Docker quick start guide
- [ ] Add `docker-compose.override.yml` to `.gitignore`
- [ ] Tag first release
- [ ] Create troubleshooting guide
- [ ] Gather community feedback

## Key Decisions

### 1. Progressive Enhancement Strategy
- Start with simple Node.js-only image
- Add nginx as optional enhancement
- Let users choose complexity level

### 2. Authentication Strategy
- Node.js handles all auth validation
- nginx acts as simple proxy
- Avoids complex nginx configurations

### 3. File Structure
```
.
├── Dockerfile                 # Simple version
├── Dockerfile.nginx          # Enhanced version
├── docker-compose.yml        # Simple deployment
├── docker-compose.nginx.yml  # HTTPS deployment
├── .dockerignore
└── docker/
    ├── docker-entrypoint.sh
    ├── docker-entrypoint-nginx.sh
    ├── nginx.conf
    ├── supervisord.conf
    └── healthcheck.sh
```

### 4. Image Tags
- `ghcr.io/czlonkowski/n8n-mcp:latest` - Simple version
- `ghcr.io/czlonkowski/n8n-mcp:nginx` - nginx-enhanced
- `ghcr.io/czlonkowski/n8n-mcp:v1.0.0` - Version tags

## Conclusion

This revised Docker deployment plan addresses all critical issues identified in the review while maintaining a pragmatic, phased approach. By starting simple and progressively adding features, we ensure that users can quickly get started while still having access to production-grade features when needed. The plan prioritizes ease of use, security, and maintainability.