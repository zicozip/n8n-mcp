# Quick Deployment Guide for n8ndocumentation.aiservices.pl

This guide walks through deploying the n8n Documentation MCP Server to a VM.

## Prerequisites

- Ubuntu 20.04+ VM with root access
- Domain pointing to your VM (e.g., n8ndocumentation.aiservices.pl)
- Node.js 18+ installed on your local machine
- Git installed locally

## Step 1: Prepare Local Environment

```bash
# Clone the repository
git clone https://github.com/yourusername/n8n-mcp.git
cd n8n-mcp

# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
```

## Step 2: Configure for Production

Edit `.env` file:

```bash
# Change these values:
NODE_ENV=production
MCP_DOMAIN=n8ndocumentation.aiservices.pl
MCP_CORS=true

# Generate and set auth token:
openssl rand -hex 32
# Copy the output and set:
MCP_AUTH_TOKEN=your-generated-token-here
```

## Step 3: Build and Deploy

```bash
# Build the project
npm run build

# Run the deployment script
./scripts/deploy-to-vm.sh
```

If you don't have SSH key authentication set up, you'll be prompted for the server password.

## Step 4: Server Setup (First Time Only)

SSH into your server and run:

```bash
# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2
sudo npm install -g pm2

# Install Nginx
sudo apt install -y nginx

# Copy Nginx configuration
sudo cp /opt/n8n-mcp/scripts/nginx-n8n-mcp.conf /etc/nginx/sites-available/n8n-mcp
sudo ln -s /etc/nginx/sites-available/n8n-mcp /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Get SSL certificate
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d n8ndocumentation.aiservices.pl

# Setup PM2 startup
pm2 startup
# Follow the instructions it provides
```

## Step 5: Configure Claude Desktop

Add to your Claude Desktop configuration:

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
        "MCP_AUTH_TOKEN": "your-auth-token-from-env-file"
      }
    }
  }
}
```

## Verify Deployment

Test the endpoints:

```bash
# Health check
curl https://n8ndocumentation.aiservices.pl/health

# Statistics (public)
curl https://n8ndocumentation.aiservices.pl/stats

# MCP endpoint (requires auth)
curl -X POST https://n8ndocumentation.aiservices.pl/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-auth-token" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'
```

## Management Commands

On the server:

```bash
# View logs
pm2 logs n8n-docs-mcp

# Restart service
pm2 restart n8n-docs-mcp

# View status
pm2 status

# Rebuild database
cd /opt/n8n-mcp
npm run db:rebuild:v2
pm2 restart n8n-docs-mcp
```

## Troubleshooting

### Service won't start
```bash
# Check logs
pm2 logs n8n-docs-mcp --lines 50

# Check if port is in use
sudo lsof -i :3000
```

### SSL issues
```bash
# Renew certificate
sudo certbot renew
```

### Database issues
```bash
# Rebuild database
cd /opt/n8n-mcp
rm data/nodes-v2.db
npm run db:rebuild:v2
```

## Security Notes

1. Keep your `MCP_AUTH_TOKEN` secret
2. Regularly update dependencies: `npm update`
3. Monitor logs for suspicious activity
4. Use fail2ban to prevent brute force attacks
5. Keep your VM updated: `sudo apt update && sudo apt upgrade`