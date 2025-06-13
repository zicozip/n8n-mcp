# Docker Deployment Guide for n8n-MCP

This guide provides comprehensive instructions for deploying n8n-MCP using Docker.

## Table of Contents

- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Deployment Options](#deployment-options)
- [Development Setup](#development-setup)
- [Production Deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)

## Quick Start

### Using Pre-built Images

The fastest way to get started is using our pre-built Docker images from GitHub Container Registry:

```bash
# 1. Create a .env file with your authentication token
echo "AUTH_TOKEN=$(openssl rand -base64 32)" > .env

# 2. Start the container
docker compose up -d

# 3. Check it's running
docker compose ps
docker compose logs
```

### Building Locally

To build the image yourself:

```bash
# Build the image
docker build -t n8n-mcp:local .

# Run with docker compose (update image in docker-compose.yml first)
docker compose up -d
```

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```bash
# Required for HTTP mode
AUTH_TOKEN=your-secure-token-here

# Server configuration
PORT=3000
NODE_ENV=production
LOG_LEVEL=info

# MCP mode (stdio or http)
MCP_MODE=http

# Database
NODE_DB_PATH=/app/data/nodes.db
REBUILD_ON_START=false
```

### Docker Compose Options

The project includes several Docker Compose configurations:

- `docker-compose.yml` - Production HTTP server
- `docker-compose.override.yml.example` - Development overrides template
- `docker-compose.nginx.yml` - HTTPS with nginx (Phase 2)

## Deployment Options

### Option 1: HTTP Server Mode

Best for remote access and integration with Claude Desktop via mcp-remote:

```bash
# Start the server
docker compose up -d

# Test the health endpoint
curl http://localhost:3000/health

# Test with authentication
curl -H "Authorization: Bearer $AUTH_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' \
     http://localhost:3000/mcp
```

Configure Claude Desktop:
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

### Option 2: stdio Mode (Direct)

For local-only usage without network exposure:

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

### Option 3: HTTPS with nginx (Coming Soon)

For production deployments with SSL/TLS:

```bash
# Use the nginx-enhanced compose file
docker compose -f docker-compose.nginx.yml up -d
```

## Development Setup

### Local Development with Docker

1. Copy the override template:
```bash
cp docker-compose.override.yml.example docker-compose.override.yml
```

2. Customize for your needs:
```yaml
# docker-compose.override.yml
version: '3.8'

services:
  n8n-mcp:
    build: .  # Build locally instead of using pre-built
    environment:
      NODE_ENV: development
      LOG_LEVEL: debug
      REBUILD_ON_START: "true"
    volumes:
      # Mount source for development
      - ./src:/app/src:ro
      - ./scripts:/app/scripts:ro
      - ./dist:/app/dist:rw
```

3. Start in development mode:
```bash
docker compose up --build
```

### Testing Docker Builds

Run the test script to validate your Docker setup:

```bash
./scripts/test-docker.sh
```

This script will:
- Build the Docker image
- Test stdio mode functionality
- Test HTTP mode with authentication
- Verify volume persistence
- Check health endpoints

## Production Deployment

### Security Considerations

1. **Authentication**: Always set a strong `AUTH_TOKEN`:
   ```bash
   openssl rand -base64 32
   ```

2. **Network Security**: Consider using a reverse proxy (nginx, Traefik) for:
   - SSL/TLS termination
   - Rate limiting
   - Access control

3. **Resource Limits**: The compose file includes memory limits:
   ```yaml
   deploy:
     resources:
       limits:
         memory: 512M
       reservations:
         memory: 256M
   ```

### Deployment Checklist

- [ ] Generate secure AUTH_TOKEN
- [ ] Configure environment variables
- [ ] Set up volume backups for `/app/data`
- [ ] Configure monitoring/logging
- [ ] Set up SSL/TLS (if exposing publicly)
- [ ] Test health endpoints
- [ ] Verify Claude Desktop connectivity

### Multi-Architecture Support

The images support both amd64 and arm64 architectures:

```bash
# The correct architecture is automatically selected
docker pull ghcr.io/czlonkowski/n8n-mcp:latest
```

## Troubleshooting

### Common Issues

#### Container fails to start
```bash
# Check logs
docker compose logs -f

# Verify environment variables
docker compose config

# Check file permissions
docker compose exec n8n-mcp ls -la /app/data
```

#### Database initialization fails
```bash
# Manually initialize
docker compose exec n8n-mcp node dist/scripts/rebuild.js

# Check database file
docker compose exec n8n-mcp ls -la /app/data/nodes.db
```

#### Authentication errors
```bash
# Verify token is set
echo $AUTH_TOKEN

# Test with curl
curl -v -H "Authorization: Bearer $AUTH_TOKEN" http://localhost:3000/health
```

### Debug Mode

Enable debug logging:
```bash
LOG_LEVEL=debug docker compose up
```

### Volume Management

```bash
# List volumes
docker volume ls | grep n8n-mcp

# Inspect volume
docker volume inspect n8n-mcp-data

# Remove volume (WARNING: deletes data)
docker compose down -v
```

## Advanced Configuration

### Custom Certificates (Phase 2)

For the nginx-enhanced version:
```yaml
volumes:
  - ./certs/server.crt:/app/certs/server.crt:ro
  - ./certs/server.key:/app/certs/server.key:ro
```

### Database Persistence

The SQLite database is stored in a named volume for persistence:
```yaml
volumes:
  n8n-mcp-data:
    driver: local
```

To backup:
```bash
docker run --rm -v n8n-mcp-data:/data -v $(pwd):/backup alpine \
  tar czf /backup/n8n-mcp-backup.tar.gz -C /data .
```

## Next Steps

- Check [GitHub Releases](https://github.com/czlonkowski/n8n-mcp/releases) for updates
- Report issues at [GitHub Issues](https://github.com/czlonkowski/n8n-mcp/issues)
- Join discussions in [GitHub Discussions](https://github.com/czlonkowski/n8n-mcp/discussions)

## License

This project uses the Sustainable Use License. See [LICENSE](./LICENSE) for details.