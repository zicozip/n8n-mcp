# Troubleshooting Guide

Quick solutions for common n8n-MCP issues.

## 🎯 Quick Fixes

| Issue | Solution |
|-------|----------|
| "Stream is not readable" | Set `USE_FIXED_HTTP=true` (fixed in v2.3.2) |
| "TransformStream is not defined" | Update to Node.js 18+ on client |
| Server not appearing in Claude | Restart Claude Desktop completely |
| Authentication failed | Check AUTH_TOKEN matches exactly |
| Database not found | Run `npm run rebuild` or `docker compose exec n8n-mcp npm run rebuild` |

## 🌐 HTTP Server Issues

### "Stream is not readable" Error

**✅ Fixed in v2.3.2** - Set `USE_FIXED_HTTP=true`

```bash
# Docker
docker run -e USE_FIXED_HTTP=true ...

# Local
export USE_FIXED_HTTP=true
npm run start:http
```

### "TransformStream is not defined" (Client)

**Cause**: Node.js < 18 on client machine

**Fix**: Update Node.js
```bash
# Check version
node --version  # Must be v18.0.0+

# Update via nvm
nvm install 18
nvm use 18
```

### Authentication Failed

**Check these:**
1. Token length: `echo -n "$AUTH_TOKEN" | wc -c` (32+ chars)
2. No extra quotes in .env file
3. Exact match between server and client
4. Test with curl:
   ```bash
   curl -H "Authorization: Bearer $AUTH_TOKEN" \
        http://localhost:3000/health
   ```

## 🐳 Docker Issues

### Container Won't Start

```bash
# 1. Check port availability
lsof -i :3000

# 2. View logs
docker compose logs -f

# 3. Clean and retry
docker compose down
docker system prune -f
docker compose up -d
```

### Database Issues

```bash
# Rebuild database inside container
docker compose exec n8n-mcp npm run rebuild

# Or copy from host
docker cp data/nodes.db n8n-mcp:/app/data/
docker compose restart
```

### Environment Variables Not Loading

```bash
# Verify .env file
cat .env

# Check loaded config
docker compose config

# Force reload
docker compose down
docker compose --env-file .env up -d
```

## 📦 Installation Issues

### npm install Fails

```bash
# Clean install
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

**Note**: The project automatically falls back to sql.js if better-sqlite3 fails.

### Build Errors

```bash
# Clean rebuild
rm -rf dist
npm run build

# If TypeScript errors
npm install --save-dev @types/node
npm run typecheck
```

## ⚡ Runtime Errors

### MCP Tools Not Available in Claude

1. **Restart Claude Desktop** (Cmd/Ctrl+R)
2. **Check server status:**
   ```bash
   # Docker
   docker compose ps
   
   # Local
   curl http://localhost:3000/health
   ```
3. **Verify configuration path** is absolute
4. **Check Claude logs**: View > Developer > Logs

## 🖥️ Claude Desktop Issues

### Server Not Appearing

**Checklist:**
- ✅ Used absolute paths (not ~/)
- ✅ Valid JSON syntax
- ✅ Restarted Claude completely
- ✅ Server is running

```bash
# Validate config
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | jq .
```

### Remote Connection Issues

**"TransformStream is not defined":**
- Update to Node.js 18+
- Or use Docker stdio mode instead

**"Server disconnected":**
- Check AUTH_TOKEN matches
- Verify server is accessible
- Check for VPN interference

## 🗄️ Database Problems

### Quick Fixes

```bash
# Rebuild database
npm run rebuild

# Validate
npm run validate
npm run test-nodes

# For Docker
docker compose exec n8n-mcp npm run rebuild
```

### Database Locked

```bash
# Find lock
lsof data/nodes.db

# Force restart
killall node
npm start
```

## 🌐 Network Issues

### Connection Refused

```bash
# Check server
curl http://localhost:3000/health

# Check firewall
sudo ufw status

# Test from outside
curl https://your-server.com/health
```

### SSL Certificate Issues

- Use HTTP for local development
- Use reverse proxy (nginx/Caddy) for HTTPS
- See [HTTP Deployment Guide](./HTTP_DEPLOYMENT.md)

## 🚀 Performance Issues

### Slow Response Times

```bash
# Check memory
docker stats n8n-mcp

# Increase limits
# docker-compose.yml
deploy:
  resources:
    limits:
      memory: 1G
```

**Expected performance:**
- Response time: ~12ms
- Memory usage: 50-100MB
- Database queries: <5ms

## 🆘 Still Need Help?

### Debug Mode

```bash
# Enable verbose logging
LOG_LEVEL=debug npm start

# Docker debug
docker compose logs -f --tail 100
```

### Get Support

1. **Check existing issues**: [GitHub Issues](https://github.com/czlonkowski/n8n-mcp/issues)
2. **Ask questions**: [GitHub Discussions](https://github.com/czlonkowski/n8n-mcp/discussions)
3. **Report bugs**: Include:
   - Error messages
   - Steps to reproduce
   - Environment details
   - Logs with `LOG_LEVEL=debug`

### Common Solutions Summary

1. 🔄 **Always restart Claude** after config changes
2. 📋 **Use exact configuration** from examples
3. 🔍 **Check logs** for specific errors
4. 🆙 **Update Node.js** to v18+ for remote connections
5. 🔒 **Verify AUTH_TOKEN** matches exactly