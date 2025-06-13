# Troubleshooting Guide

This guide helps resolve common issues with n8n-MCP.

## Table of Contents

- [Docker Issues](#docker-issues)
- [Installation Issues](#installation-issues)
- [Runtime Errors](#runtime-errors)
- [Claude Desktop Issues](#claude-desktop-issues)
- [Database Problems](#database-problems)
- [Network and Authentication](#network-and-authentication)
- [Performance Issues](#performance-issues)

## Docker Issues

### Container Won't Start

#### Symptoms
- `docker compose up` fails
- Container exits immediately
- No logs available

#### Solutions

1. **Check if port is in use:**
   ```bash
   lsof -i :3000
   # or
   netstat -tulpn | grep 3000
   ```

2. **View detailed logs:**
   ```bash
   docker compose logs -f --tail 100
   ```

3. **Check Docker resources:**
   ```bash
   docker system df
   docker system prune -a  # Clean up unused resources
   ```

4. **Verify image download:**
   ```bash
   docker compose pull
   ```

### Database Initialization Fails in Docker

#### Symptoms
- Error: `ENOENT: no such file or directory, open '/app/src/database/schema.sql'`
- Database not found errors

#### Solutions

1. **Rebuild the image with latest Dockerfile:**
   ```bash
   docker compose build --no-cache
   docker compose up -d
   ```

2. **Copy existing database:**
   ```bash
   # From host to container
   docker cp data/nodes.db n8n-mcp:/app/data/
   
   # Restart container
   docker compose restart
   ```

3. **Initialize inside container:**
   ```bash
   docker compose exec n8n-mcp npm run rebuild
   ```

### Permission Denied in Docker

#### Symptoms
- Cannot write to /app/data
- Permission denied errors in logs

#### Solutions

```bash
# Fix permissions
docker compose exec n8n-mcp chown -R nodejs:nodejs /app/data

# Or run as root temporarily
docker compose exec -u root n8n-mcp chown -R nodejs:nodejs /app
```

### Docker Compose Variables Not Loading

#### Symptoms
- AUTH_TOKEN not recognized
- Environment variables missing

#### Solutions

1. **Check .env file location:**
   ```bash
   ls -la .env
   cat .env
   ```

2. **Verify compose file:**
   ```bash
   docker compose config
   ```

3. **Set variables explicitly:**
   ```bash
   AUTH_TOKEN=mytoken docker compose up -d
   ```

## Installation Issues

### npm install Fails

#### Symptoms
- Dependency errors
- Node version mismatch
- Native module compilation fails

#### Solutions

1. **Clear npm cache:**
   ```bash
   npm cache clean --force
   rm -rf node_modules package-lock.json
   npm install
   ```

2. **Check Node version:**
   ```bash
   node --version  # Should be v16+
   npm --version   # Should be v7+
   ```

3. **Use fallback for better-sqlite3:**
   The project automatically falls back to sql.js if native modules fail.

### Build Errors

#### Symptoms
- TypeScript compilation errors
- Missing type definitions

#### Solutions

```bash
# Clean build
rm -rf dist
npm run build

# Check TypeScript version
npx tsc --version

# Install missing types
npm install --save-dev @types/node
```

## Runtime Errors

### MCP Tools Not Available

#### Symptoms
- Tools don't appear in Claude Desktop
- "Unknown tool" errors

#### Solutions

1. **Verify server is running:**
   ```bash
   # For Docker
   docker compose ps
   docker compose logs
   
   # For local
   ps aux | grep node
   ```

2. **Check database:**
   ```bash
   npm run validate
   npm run test-nodes
   ```

3. **Restart Claude Desktop** after configuration changes

### Stream Not Readable Error

#### Symptoms
- Error: "InternalServerError: stream is not readable"
- MCP endpoint returns errors

#### Solutions

1. **Check database initialization:**
   ```bash
   ls -la data/nodes.db
   npm run validate
   ```

2. **Verify HTTP headers:**
   ```bash
   curl -H "Accept: application/json, text/event-stream" \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        http://localhost:3000/mcp
   ```

## Claude Desktop Issues

### Server Not Appearing

#### Solutions

1. **Verify config file location:**
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - Linux: `~/.config/Claude/claude_desktop_config.json`

2. **Check JSON syntax:**
   ```bash
   # Validate JSON
   cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | jq .
   ```

3. **Use absolute paths:**
   ```json
   {
     "mcpServers": {
       "n8n-documentation": {
         "command": "node",
         "args": [
           "/absolute/path/to/n8n-mcp/dist/mcp/index.js"
         ]
       }
     }
   }
   ```

### Authentication Errors with Claude

#### Solutions

1. **Match tokens exactly:**
   ```bash
   # In .env
   AUTH_TOKEN=your-token-here
   
   # In Claude config
   "MCP_AUTH_TOKEN": "your-token-here"
   ```

2. **Check for special characters:**
   - Avoid quotes in token values
   - Use base64 encoding for safety

## Database Problems

### Database Corruption

#### Symptoms
- SQLite errors
- Unexpected results
- Missing nodes

#### Solutions

1. **Rebuild database:**
   ```bash
   # Backup first
   cp data/nodes.db data/nodes.db.bak
   
   # Rebuild
   npm run rebuild
   ```

2. **Validate after rebuild:**
   ```bash
   npm run validate
   npm run test-nodes
   ```

### Database Locked

#### Symptoms
- SQLITE_BUSY errors
- Cannot write to database

#### Solutions

```bash
# Find processes using the database
lsof data/nodes.db

# For Docker
docker compose restart
```

## Network and Authentication

### CORS Errors

#### Symptoms
- Browser console shows CORS errors
- Preflight requests fail

#### Solutions

1. **Check server CORS settings:**
   - Verify MCP_MODE=http
   - Check proxy configuration

2. **Test with curl:**
   ```bash
   curl -X OPTIONS http://localhost:3000/mcp \
        -H "Origin: http://localhost" \
        -H "Access-Control-Request-Method: POST"
   ```

### SSL/HTTPS Issues

#### Solutions

1. **For development, use HTTP:**
   ```json
   "connect", "http://localhost:3000/mcp"
   ```

2. **For production, use reverse proxy:**
   - See nginx/Caddy examples in HTTP_DEPLOYMENT.md

## Performance Issues

### Slow Response Times

#### Solutions

1. **Check resource usage:**
   ```bash
   # Docker
   docker stats n8n-mcp
   
   # System
   top
   htop
   ```

2. **Increase memory limits:**
   ```yaml
   # docker-compose.yml
   deploy:
     resources:
       limits:
         memory: 1G
   ```

3. **Enable query logging:**
   ```bash
   LOG_LEVEL=debug npm start
   ```

### High Memory Usage

#### Solutions

1. **Monitor with Docker:**
   ```bash
   docker compose exec n8n-mcp ps aux
   ```

2. **Restart periodically:**
   ```bash
   # Add to crontab
   0 */6 * * * docker compose restart
   ```

## Getting More Help

1. **Enable debug logging:**
   ```bash
   LOG_LEVEL=debug docker compose up
   ```

2. **Collect diagnostic info:**
   ```bash
   # System info
   uname -a
   node --version
   docker --version
   
   # Project info
   git rev-parse HEAD
   npm list
   ```

3. **Report issues:**
   - GitHub: https://github.com/czlonkowski/n8n-mcp/issues
   - Include logs, environment, and steps to reproduce