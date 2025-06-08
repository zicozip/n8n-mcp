# Production Deployment Guide

This guide covers deploying the n8n Documentation MCP Server in production environments.

## Overview

The n8n Documentation MCP Server provides node documentation and source code to AI assistants. It can be deployed:
- **Locally** - Using stdio transport for Claude Desktop on the same machine
- **Remotely** - Using HTTP transport for access over the internet

For remote deployment with full VM setup instructions, see [REMOTE_DEPLOYMENT.md](./REMOTE_DEPLOYMENT.md).

## Local Production Deployment

### Prerequisites

- Node.js 18+ installed
- Git installed
- 500MB available disk space

### Quick Start

1. **Clone and setup**
   ```bash
   git clone https://github.com/yourusername/n8n-mcp.git
   cd n8n-mcp
   npm install
   npm run build
   ```

2. **Initialize database**
   ```bash
   npm run db:rebuild:v2
   ```

3. **Configure Claude Desktop**
   Edit Claude Desktop config (see README.md for paths):
   ```json
   {
     "mcpServers": {
       "n8n-nodes": {
         "command": "node",
         "args": ["/absolute/path/to/n8n-mcp/dist/index-v2.js"],
         "env": {
           "NODE_DB_PATH": "/absolute/path/to/n8n-mcp/data/nodes-v2.db"
         }
       }
     }
   }
   ```

## Docker Deployment

### Using Docker Compose

1. **Create docker-compose.yml**
   ```yaml
   version: '3.8'
   services:
     n8n-docs-mcp:
       build: .
       volumes:
         - ./data:/app/data
       environment:
         - NODE_ENV=production
         - NODE_DB_PATH=/app/data/nodes-v2.db
       command: node dist/index-v2.js
   ```

2. **Build and run**
   ```bash
   docker-compose up -d
   ```

### Using Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy built files
COPY dist/ ./dist/
COPY data/ ./data/

# Set environment
ENV NODE_ENV=production
ENV NODE_DB_PATH=/app/data/nodes-v2.db

# Run the server
CMD ["node", "dist/index-v2.js"]
```

## Database Management

### Automatic Rebuilds

Schedule regular database updates to get latest node documentation:

```bash
# Add to crontab
0 2 * * * cd /path/to/n8n-mcp && npm run db:rebuild:v2
```

### Manual Rebuild

```bash
npm run db:rebuild:v2
```

### Database Location

The SQLite database is stored at: `data/nodes-v2.db`

### Backup

```bash
# Simple backup
cp data/nodes-v2.db data/nodes-v2.db.backup

# Timestamped backup
cp data/nodes-v2.db "data/nodes-v2-$(date +%Y%m%d-%H%M%S).db"
```

## Monitoring

### Database Statistics

Check the database status:

```bash
# Using SQLite directly
sqlite3 data/nodes-v2.db "SELECT COUNT(*) as total_nodes FROM nodes;"

# Using the MCP tool (in Claude)
# "Get database statistics for n8n nodes"
```

### Logs

For local deployment:
```bash
# Run with logging
NODE_ENV=production node dist/index-v2.js 2>&1 | tee app.log
```

## Performance Optimization

### SQLite Optimization

The database uses these optimizations by default:
- WAL mode for better concurrency
- Memory-mapped I/O
- Full-text search indexes

### System Requirements

- **Minimum**: 256MB RAM, 500MB disk
- **Recommended**: 512MB RAM, 1GB disk
- **CPU**: Minimal requirements (mostly I/O bound)

## Security

### Local Deployment

- No network exposure (stdio only)
- File system permissions control access
- No authentication needed

### Remote Deployment

See [REMOTE_DEPLOYMENT.md](./REMOTE_DEPLOYMENT.md) for:
- HTTPS configuration
- Authentication setup
- Firewall rules
- Security best practices

## Troubleshooting

### Database Issues

If the database is missing or corrupted:
```bash
# Rebuild from scratch
rm data/nodes-v2.db
npm run db:rebuild:v2
```

### Memory Issues

If running on limited memory:
```bash
# Limit Node.js memory usage
NODE_OPTIONS="--max-old-space-size=256" node dist/index-v2.js
```

### Permission Issues

Ensure proper file permissions:
```bash
chmod 644 data/nodes-v2.db
chmod 755 data/
```

## Updates

To update to the latest version:

```bash
# Pull latest code
git pull

# Install dependencies
npm install

# Rebuild
npm run build

# Rebuild database
npm run db:rebuild:v2
```

## Support

For issues and questions:
- GitHub Issues: https://github.com/yourusername/n8n-mcp/issues
- Check logs for error messages
- Verify database integrity