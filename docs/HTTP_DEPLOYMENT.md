# HTTP Deployment Guide

This guide explains how to deploy n8n-MCP as a private HTTP server for remote access.

## Overview

The HTTP mode allows you to run n8n-MCP on a remote server and connect to it from Claude Desktop using the mcp-remote adapter. This is designed for single-user private deployments.

## Deployment Options

### Option 1: Docker Deployment (Recommended) 🐳

The easiest way to deploy n8n-MCP is using Docker:

#### Quick Start
```bash
# 1. Create configuration
cat > .env << EOF
AUTH_TOKEN=$(openssl rand -base64 32)
USE_FIXED_HTTP=true
EOF

# 2. Start with Docker Compose
docker compose up -d

# 3. Check health
curl http://localhost:3000/health
```

#### Production Deployment
```bash
# 1. Clone repository
git clone https://github.com/yourusername/n8n-mcp.git
cd n8n-mcp

# 2. Create production .env
cat > .env << EOF
AUTH_TOKEN=$(openssl rand -base64 32)
USE_FIXED_HTTP=true
NODE_ENV=production
LOG_LEVEL=info
PORT=3000
EOF

# 3. Deploy with Docker Compose
docker compose up -d

# 4. Check logs
docker compose logs -f
```

#### Using Pre-built Images
```yaml
# docker-compose.yml
version: '3.8'
services:
  n8n-mcp:
    image: ghcr.io/czlonkowski/n8n-mcp:latest
    environment:
      MCP_MODE: http
      AUTH_TOKEN: ${AUTH_TOKEN:?Required}
    ports:
      - "3000:3000"
    volumes:
      - n8n-mcp-data:/app/data
    restart: unless-stopped

volumes:
  n8n-mcp-data:
```

### Option 2: Manual Installation

If you prefer not to use Docker:

#### 1. Clone and Build
```bash
git clone https://github.com/yourusername/n8n-mcp.git
cd n8n-mcp
npm install
npm run build
npm run rebuild
```

#### 2. Configure Environment
```bash
cp .env.example .env
```

Edit `.env`:
```env
# HTTP mode configuration
MCP_MODE=http
USE_FIXED_HTTP=true  # Important: Use the fixed implementation (v2.3.2+)
PORT=3000
HOST=0.0.0.0

# Generate secure token
AUTH_TOKEN=your-secure-token-here

# Other settings
NODE_DB_PATH=./data/nodes.db
MCP_LOG_LEVEL=info
NODE_ENV=production
```

#### 3. Start the Server
```bash
# Using the deployment script
./scripts/deploy-http.sh

# Or manually
MCP_MODE=http npm start
```

The server will start on `http://0.0.0.0:3000`

### 4. Setup HTTPS Proxy (Recommended)

#### Using nginx:

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### Using Caddy:

```caddyfile
your-domain.com {
    reverse_proxy localhost:3000
}
```

## Client Setup

### 1. Install mcp-remote

```bash
npm install -g mcp-remote
```

### 2. Configure Claude Desktop

Edit Claude Desktop config:

**Option 1: Using global mcp-remote installation**
```json
{
  "mcpServers": {
    "n8n-remote": {
      "command": "mcp-remote",
      "args": [
        "connect",
        "https://your-domain.com/mcp"
      ],
      "env": {
        "MCP_AUTH_TOKEN": "your-secure-token-here"
      }
    }
  }
}
```

**Option 2: Using npx (no installation required)**
```json
{
  "mcpServers": {
    "n8n-remote": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/mcp-remote@latest",
        "connect",
        "https://your-domain.com/mcp"
      ],
      "env": {
        "MCP_AUTH_TOKEN": "your-secure-token-here"
      }
    }
  }
}
```

**Option 3: Using custom headers (if needed)**
```json
{
  "mcpServers": {
    "n8n-remote": {
      "command": "mcp-remote",
      "args": [
        "connect",
        "https://your-domain.com/mcp",
        "--header",
        "Authorization: Bearer your-secure-token-here"
      ]
    }
  }
}
```

### 3. Test Connection

1. Restart Claude Desktop
2. The MCP tools should be available
3. Test with: "List all n8n nodes"

## Security Considerations

1. **Always use HTTPS** in production
2. **Keep AUTH_TOKEN secret** - treat it like a password
3. **Firewall rules** - Only expose necessary ports
4. **Regular updates** - Keep dependencies updated
5. **Monitor logs** - Check for unauthorized access attempts

## Health Monitoring

Check server health:
```bash
curl https://your-domain.com/health
```

Expected response:
```json
{
  "status": "ok",
  "mode": "http",
  "version": "2.3.0"
}
```

## Testing

Use the included test script to verify your HTTP server:

```bash
# Test local server
./scripts/test-http.sh

# Test remote server
./scripts/test-http.sh https://your-domain.com

# Test with custom token
AUTH_TOKEN=your-token ./scripts/test-http.sh

# Verbose output
VERBOSE=1 ./scripts/test-http.sh
```

The test script checks:
- Health endpoint
- CORS preflight
- Authentication
- Valid MCP requests
- Error handling
- Request size limits

## Troubleshooting

### Docker-specific Issues

#### Container won't start
```bash
# Check logs
docker compose logs n8n-mcp

# Check if port is already in use
lsof -i :3000

# Rebuild and restart
docker compose down
docker compose up -d --build
```

#### Database initialization fails
```bash
# Copy existing database
docker cp data/nodes.db n8n-mcp:/app/data/

# Or rebuild inside container
docker compose exec n8n-mcp npm run rebuild
```

#### Permission issues
```bash
# Fix volume permissions
docker compose exec n8n-mcp chown -R nodejs:nodejs /app/data
```

### General Issues

#### Connection Refused
- Check firewall rules
- Verify server is running
- Check nginx/proxy configuration
- Run the test script to diagnose
- For Docker: ensure ports are mapped correctly

#### Authentication Failed
- Verify AUTH_TOKEN matches in both server and client
- Check Authorization header format
- Token should be at least 32 characters
- Docker: check .env file is loaded

#### MCP Tools Not Available
- Restart Claude Desktop
- Check mcp-remote installation
- Verify server logs for errors
- Ensure CORS headers are working
- Docker: check container health status

## Performance Tips

1. Use a VPS with good network connectivity
2. Enable gzip compression in your proxy
3. For Docker deployments:
   - Use `--restart unless-stopped` for reliability
   - Monitor with `docker stats n8n-mcp`
   - Set memory limits in docker-compose.yml
4. For manual deployments, use PM2:
   ```bash
   pm2 start npm --name "n8n-mcp" -- run start:http
   ```

## Production Deployment Examples

### Using Docker with Systemd

Create `/etc/systemd/system/n8n-mcp-docker.service`:

```ini
[Unit]
Description=n8n MCP Docker Container
After=docker.service
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=/opt/n8n-mcp
ExecStart=/usr/bin/docker compose up
ExecStop=/usr/bin/docker compose down
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

### Manual Installation with Systemd

Create `/etc/systemd/system/n8n-mcp.service`:

```ini
[Unit]
Description=n8n MCP HTTP Server
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/n8n-mcp
ExecStart=/usr/bin/npm run start:http
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable n8n-mcp
sudo systemctl start n8n-mcp
```

## Limitations

- Single-user design (no multi-tenancy)
- Stateless (no session persistence)
- No built-in rate limiting
- Basic token authentication only

For multi-user deployments, consider implementing a proper API gateway with user management.