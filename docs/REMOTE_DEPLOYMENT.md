# Remote Deployment Guide

This guide explains how to deploy the n8n Documentation MCP Server to a remote VM (such as Hetzner) and connect to it from Claude Desktop.

**Quick Start**: For a streamlined deployment to n8ndocumentation.aiservices.pl, see [DEPLOYMENT_QUICKSTART.md](./DEPLOYMENT_QUICKSTART.md).

## Overview

The n8n Documentation MCP Server can be deployed as a remote HTTP service, allowing Claude Desktop to access n8n node documentation over the internet. This is useful for:

- Centralized documentation serving for teams
- Accessing documentation without local n8n installation
- Cloud-based AI development workflows

## Architecture

```
Claude Desktop → Internet → MCP Server (HTTPS) → SQLite Database
                                ↓
                         n8n Documentation
```

## Prerequisites

- A VM with Ubuntu 20.04+ or similar Linux distribution
- Node.js 18+ installed
- A domain name (e.g., `n8ndocumentation.aiservices.pl`)
- SSL certificate (Let's Encrypt recommended)
- Basic knowledge of Linux server administration

## Deployment Steps

### 1. Server Setup

SSH into your VM and prepare the environment:

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+ (if not already installed)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install git and build essentials
sudo apt install -y git build-essential

# Install PM2 for process management
sudo npm install -g pm2

# Create application directory
sudo mkdir -p /opt/n8n-mcp
sudo chown $USER:$USER /opt/n8n-mcp
```

### 2. Clone and Build

```bash
cd /opt
git clone https://github.com/yourusername/n8n-mcp.git
cd n8n-mcp

# Install dependencies
npm install

# Build the project
npm run build

# Initialize database
npm run db:rebuild:v2
```

### 3. Configure Environment

Create the production environment file:

```bash
cp .env.example .env
nano .env
```

Configure with your domain and security settings:

```env
# Remote Server Configuration
MCP_PORT=3000
MCP_HOST=0.0.0.0
MCP_DOMAIN=n8ndocumentation.aiservices.pl

# Authentication - REQUIRED for production
# Generate secure token: openssl rand -hex 32
MCP_AUTH_TOKEN=your-generated-secure-token-here

# Enable CORS for browser access
MCP_CORS=true

# Database path
NODE_DB_PATH=/opt/n8n-mcp/data/nodes-v2.db

# Production environment
NODE_ENV=production
MCP_LOG_LEVEL=info
```

### 4. Setup SSL with Nginx

Install and configure Nginx as a reverse proxy with SSL:

```bash
# Install Nginx and Certbot
sudo apt install -y nginx certbot python3-certbot-nginx

# Create Nginx configuration
sudo nano /etc/nginx/sites-available/n8n-mcp
```

Add the following configuration:

```nginx
server {
    listen 80;
    server_name n8ndocumentation.aiservices.pl;

    location / {
        return 301 https://$server_name$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name n8ndocumentation.aiservices.pl;

    # SSL will be configured by Certbot
    
    # Security headers
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header X-XSS-Protection "1; mode=block";
    
    # Proxy settings
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Increase timeouts for MCP operations
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

Enable the site and obtain SSL certificate:

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/n8n-mcp /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Obtain SSL certificate
sudo certbot --nginx -d n8ndocumentation.aiservices.pl
```

### 5. Start with PM2

Create PM2 ecosystem file:

```bash
nano /opt/n8n-mcp/ecosystem.config.js
```

```javascript
module.exports = {
  apps: [{
    name: 'n8n-mcp',
    script: './dist/index-http.js',
    cwd: '/opt/n8n-mcp',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    },
    error_file: '/opt/n8n-mcp/logs/error.log',
    out_file: '/opt/n8n-mcp/logs/out.log',
    log_file: '/opt/n8n-mcp/logs/combined.log',
    time: true
  }]
};
```

Start the application:

```bash
# Create logs directory
mkdir -p /opt/n8n-mcp/logs

# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

### 6. Configure Firewall

```bash
# Allow SSH, HTTP, and HTTPS
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## Claude Desktop Configuration

### 1. Get your auth token

From your server, get the configured auth token:

```bash
grep MCP_AUTH_TOKEN /opt/n8n-mcp/.env
```

### 2. Configure Claude Desktop

Edit your Claude Desktop configuration:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**Linux**: `~/.config/Claude/claude_desktop_config.json`

Add the remote MCP server:

```json
{
  "mcpServers": {
    "n8n-nodes-remote": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/client-http",
        "https://n8ndocumentation.aiservices.pl/mcp"
      ],
      "env": {
        "MCP_AUTH_TOKEN": "your-auth-token-here"
      }
    }
  }
}
```

### 3. Restart Claude Desktop

Quit and restart Claude Desktop to load the new configuration.

## Server Management

### Viewing Logs

```bash
# View real-time logs
pm2 logs n8n-mcp

# View error logs
tail -f /opt/n8n-mcp/logs/error.log

# View Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Rebuilding Database

To update the node documentation database:

```bash
cd /opt/n8n-mcp

# Stop the server
pm2 stop n8n-mcp

# Rebuild database
npm run db:rebuild:v2

# Restart server
pm2 restart n8n-mcp
```

### Updating the Server

```bash
cd /opt/n8n-mcp

# Pull latest changes
git pull

# Install dependencies
npm install

# Build
npm run build

# Restart
pm2 restart n8n-mcp
```

## Security Considerations

1. **Authentication Token**: Always use a strong, randomly generated token
   ```bash
   openssl rand -hex 32
   ```

2. **HTTPS**: Always use HTTPS in production. The setup above includes automatic SSL with Let's Encrypt.

3. **Firewall**: Only open necessary ports (22, 80, 443)

4. **Updates**: Keep the system and Node.js updated regularly

5. **Monitoring**: Set up monitoring for the service:
   ```bash
   # PM2 monitoring
   pm2 install pm2-logrotate
   pm2 set pm2-logrotate:max_size 10M
   pm2 set pm2-logrotate:retain 7
   ```

## API Endpoints

Once deployed, your server provides:

- `GET https://n8ndocumentation.aiservices.pl/` - Server information
- `GET https://n8ndocumentation.aiservices.pl/health` - Health check
- `GET https://n8ndocumentation.aiservices.pl/stats` - Database statistics
- `POST https://n8ndocumentation.aiservices.pl/mcp` - MCP protocol endpoint
- `POST https://n8ndocumentation.aiservices.pl/rebuild` - Rebuild database (requires auth)

## Troubleshooting

### Connection Issues

1. Check if the server is running:
   ```bash
   pm2 status
   curl https://n8ndocumentation.aiservices.pl/health
   ```

2. Verify Nginx is working:
   ```bash
   sudo nginx -t
   sudo systemctl status nginx
   ```

3. Check firewall:
   ```bash
   sudo ufw status
   ```

### Authentication Failures

1. Verify the token matches in both `.env` and Claude config
2. Check server logs for auth errors:
   ```bash
   pm2 logs n8n-mcp --lines 100
   ```

### Database Issues

1. Check database exists:
   ```bash
   ls -la /opt/n8n-mcp/data/nodes-v2.db
   ```

2. Rebuild if necessary:
   ```bash
   cd /opt/n8n-mcp
   npm run db:rebuild:v2
   ```

## Monitoring and Maintenance

### Health Monitoring

Set up external monitoring (e.g., UptimeRobot) to check:
- `https://n8ndocumentation.aiservices.pl/health`

### Backup

Regular backups of the database:

```bash
# Create backup script
cat > /opt/n8n-mcp/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/n8n-mcp/backups"
mkdir -p $BACKUP_DIR
cp /opt/n8n-mcp/data/nodes-v2.db "$BACKUP_DIR/nodes-v2-$(date +%Y%m%d-%H%M%S).db"
# Keep only last 7 backups
find $BACKUP_DIR -name "nodes-v2-*.db" -mtime +7 -delete
EOF

chmod +x /opt/n8n-mcp/backup.sh

# Add to crontab (daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/n8n-mcp/backup.sh") | crontab -
```

## Cost Optimization

For a small Hetzner VM (CX11 - 1 vCPU, 2GB RAM):
- Monthly cost: ~€4-5
- Sufficient for serving documentation to multiple Claude instances
- Can handle hundreds of concurrent connections

## Support

For issues specific to remote deployment:
1. Check server logs first
2. Verify network connectivity
3. Ensure all dependencies are installed
4. Check GitHub issues for similar problems