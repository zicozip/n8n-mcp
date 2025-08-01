# n8n-MCP Deployment Guide

This guide covers how to deploy n8n-MCP and connect it to your n8n instance. Whether you're testing locally or deploying to production, we'll show you how to set up n8n-MCP for use with n8n's MCP Client Tool node.

## Table of Contents
- [Overview](#overview)
- [Local Testing](#local-testing)
- [Production Deployment](#production-deployment)
  - [Same Server as n8n](#same-server-as-n8n)
  - [Different Server (Cloud Deployment)](#different-server-cloud-deployment)
- [Connecting n8n to n8n-MCP](#connecting-n8n-to-n8n-mcp)
- [Security & Best Practices](#security--best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

n8n-MCP is a Model Context Protocol server that provides AI assistants with comprehensive access to n8n node documentation and management capabilities. When connected to n8n via the MCP Client Tool node, it enables:
- AI-powered workflow creation and validation
- Access to documentation for 500+ n8n nodes
- Workflow management through the n8n API
- Real-time configuration validation

## Local Testing

### Quick Test Script

Test n8n-MCP locally with the provided test script:

```bash
# Clone the repository
git clone https://github.com/czlonkowski/n8n-mcp.git
cd n8n-mcp

# Build the project
npm install
npm run build

# Run the test script
./scripts/test-n8n-mode.sh
```

This script will:
1. Start n8n-MCP in n8n mode on port 3001
2. Enable debug logging for troubleshooting
3. Run comprehensive protocol tests
4. Display results and any issues found

### Manual Local Setup

For development or custom testing:

1. **Prerequisites**:
   - n8n instance running (local or remote)
   - n8n API key (from n8n Settings → API)

2. **Start n8n-MCP**:
```bash
# Set environment variables
export N8N_MODE=true
export N8N_API_URL=http://localhost:5678  # Your n8n instance URL
export N8N_API_KEY=your-api-key-here       # Your n8n API key
export MCP_AUTH_TOKEN=test-token-minimum-32-chars-long
export PORT=3001

# Start the server
npm start
```

3. **Verify it's running**:
```bash
# Check health
curl http://localhost:3001/health

# Check MCP protocol endpoint
curl http://localhost:3001/mcp
# Should return: {"protocolVersion":"2024-11-05"} for n8n compatibility
```

## Production Deployment

### Same Server as n8n

If you're running n8n-MCP on the same server as your n8n instance:

1. **Using Docker** (Recommended):
```bash
# Create a Docker network if n8n uses one
docker network create n8n-net

# Run n8n-MCP container
docker run -d \
  --name n8n-mcp \
  --network n8n-net \
  -p 3000:3000 \
  -e N8N_MODE=true \
  -e N8N_API_URL=http://n8n:5678 \
  -e N8N_API_KEY=your-n8n-api-key \
  -e MCP_AUTH_TOKEN=$(openssl rand -hex 32) \
  -e LOG_LEVEL=info \
  --restart unless-stopped \
  ghcr.io/czlonkowski/n8n-mcp:latest
```

2. **Using systemd** (for native installation):
```bash
# Create service file
sudo cat > /etc/systemd/system/n8n-mcp.service << EOF
[Unit]
Description=n8n-MCP Server
After=network.target

[Service]
Type=simple
User=nodejs
WorkingDirectory=/opt/n8n-mcp
Environment="N8N_MODE=true"
Environment="N8N_API_URL=http://localhost:5678"
Environment="N8N_API_KEY=your-n8n-api-key"
Environment="MCP_AUTH_TOKEN=your-secure-token"
Environment="PORT=3000"
ExecStart=/usr/bin/node /opt/n8n-mcp/dist/mcp/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
sudo systemctl enable n8n-mcp
sudo systemctl start n8n-mcp
```

### Different Server (Cloud Deployment)

Deploy n8n-MCP on a separate server from your n8n instance:

#### Quick Docker Deployment

```bash
# On your cloud server (Hetzner, AWS, DigitalOcean, etc.)
docker run -d \
  --name n8n-mcp \
  -p 3000:3000 \
  -e N8N_MODE=true \
  -e N8N_API_URL=https://your-n8n-instance.com \
  -e N8N_API_KEY=your-n8n-api-key \
  -e MCP_AUTH_TOKEN=$(openssl rand -hex 32) \
  -e LOG_LEVEL=info \
  --restart unless-stopped \
  ghcr.io/czlonkowski/n8n-mcp:latest

# Save the MCP_AUTH_TOKEN for later use!
```

#### Full Production Setup (Hetzner/AWS/DigitalOcean)

1. **Server Requirements**:
   - **Minimal**: 1 vCPU, 1GB RAM (CX11 on Hetzner)
   - **Recommended**: 2 vCPU, 2GB RAM
   - **OS**: Ubuntu 22.04 LTS

2. **Initial Setup**:
```bash
# SSH into your server
ssh root@your-server-ip

# Update and install Docker
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
```

3. **Deploy n8n-MCP with SSL** (using Caddy for automatic HTTPS):
```bash
# Create docker-compose.yml
cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  n8n-mcp:
    image: ghcr.io/czlonkowski/n8n-mcp:latest
    container_name: n8n-mcp
    restart: unless-stopped
    environment:
      - N8N_MODE=true
      - N8N_API_URL=${N8N_API_URL}
      - N8N_API_KEY=${N8N_API_KEY}
      - MCP_AUTH_TOKEN=${MCP_AUTH_TOKEN}
      - PORT=3000
      - LOG_LEVEL=info
    networks:
      - web

  caddy:
    image: caddy:2-alpine
    container_name: caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    networks:
      - web

networks:
  web:
    driver: bridge

volumes:
  caddy_data:
  caddy_config:
EOF

# Create Caddyfile
cat > Caddyfile << 'EOF'
mcp.yourdomain.com {
    reverse_proxy n8n-mcp:3000
}
EOF

# Create .env file
cat > .env << EOF
N8N_API_URL=https://your-n8n-instance.com
N8N_API_KEY=your-n8n-api-key-here
MCP_AUTH_TOKEN=$(openssl rand -hex 32)
EOF

# Save the MCP_AUTH_TOKEN!
echo "Your MCP_AUTH_TOKEN is:"
grep MCP_AUTH_TOKEN .env

# Start services
docker compose up -d
```

#### Cloud Provider Tips

**AWS EC2**:
- Security Group: Open port 3000 (or 443 with HTTPS)
- Instance Type: t3.micro is sufficient
- Use Elastic IP for stable addressing

**DigitalOcean**:
- Droplet: Basic ($6/month) is enough
- Enable backups for production use

**Google Cloud**:
- Machine Type: e2-micro (free tier eligible)
- Use Cloud Load Balancer for SSL

## Connecting n8n to n8n-MCP

### Configure n8n MCP Client Tool

1. **In your n8n workflow**, add the **MCP Client Tool** node

2. **Configure the connection**:
   ```
   Server URL: 
   - Same server: http://localhost:3000
   - Docker network: http://n8n-mcp:3000
   - Different server: https://mcp.yourdomain.com
   
   Auth Token: [Your MCP_AUTH_TOKEN]
   
   Transport: HTTP Streamable (SSE)
   ```

3. **Test the connection** by selecting a simple tool like `list_nodes`

### Available Tools

Once connected, you can use these MCP tools in n8n:

**Documentation Tools** (No API key required):
- `list_nodes` - List all n8n nodes with filtering
- `search_nodes` - Search nodes by keyword
- `get_node_info` - Get detailed node information
- `get_node_essentials` - Get only essential properties
- `validate_workflow` - Validate workflow configurations
- `get_node_documentation` - Get human-readable docs

**Management Tools** (Requires n8n API key):
- `n8n_create_workflow` - Create new workflows
- `n8n_update_workflow` - Update existing workflows
- `n8n_get_workflow` - Retrieve workflow details
- `n8n_list_workflows` - List all workflows
- `n8n_trigger_webhook_workflow` - Trigger webhook workflows

### Using with AI Agents

Connect n8n-MCP to AI Agent nodes for intelligent automation:

1. **Add an AI Agent node** (e.g., OpenAI, Anthropic)
2. **Connect MCP Client Tool** to the Agent's tool input
3. **Configure prompts** for workflow creation:

```
You are an n8n workflow expert. Use the MCP tools to:
1. Search for appropriate nodes using search_nodes
2. Get configuration details with get_node_essentials
3. Validate configurations with validate_workflow
4. Create the workflow if all validations pass
```

## Security & Best Practices

### Authentication
- **MCP_AUTH_TOKEN**: Always use a strong, random token (32+ characters)
- **N8N_API_KEY**: Only required for workflow management features
- Store tokens in environment variables or secure vaults

### Network Security
- **Use HTTPS** in production (Caddy/Nginx/Traefik)
- **Firewall**: Only expose necessary ports (3000 or 443)
- **IP Whitelisting**: Consider restricting access to known n8n instances

### Docker Security
- Run containers with `--read-only` flag if possible
- Use specific image versions instead of `:latest` in production
- Regular updates: `docker pull ghcr.io/czlonkowski/n8n-mcp:latest`

## Troubleshooting

### Connection Issues

**"Connection refused" in n8n MCP Client Tool**
- Check n8n-MCP is running: `docker ps` or `systemctl status n8n-mcp`
- Verify port is accessible: `curl http://your-server:3000/health`
- Check firewall rules allow port 3000

**"Invalid auth token"**
- Ensure MCP_AUTH_TOKEN matches exactly (no extra spaces)
- Token must be at least 32 characters long
- Check for special characters that might need escaping

**"Cannot connect to n8n API"**
- Verify N8N_API_URL is correct (include http:// or https://)
- Check n8n API key is valid and has necessary permissions
- Ensure n8n instance is accessible from n8n-MCP server

### Protocol Issues

**"Protocol version mismatch"**
- n8n-MCP automatically uses version 2024-11-05 for n8n
- Update to latest n8n-MCP version if issues persist
- Check `/mcp` endpoint returns correct version

**"Schema validation errors"**
- Known issue with n8n's nested output handling
- n8n-MCP includes workarounds
- Enable debug mode to see detailed errors

### Debugging

1. **Enable debug mode**:
```bash
docker run -d \
  --name n8n-mcp \
  -e DEBUG_MCP=true \
  -e LOG_LEVEL=debug \
  # ... other settings
```

2. **Check logs**:
```bash
# Docker
docker logs n8n-mcp -f --tail 100

# Systemd
journalctl -u n8n-mcp -f
```

3. **Test endpoints**:
```bash
# Health check
curl http://localhost:3000/health

# Protocol version
curl http://localhost:3000/mcp

# List tools (requires auth)
curl -X POST http://localhost:3000 \
  -H "Authorization: Bearer YOUR_MCP_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

## Performance Tips

- **Minimal deployment**: 1 vCPU, 1GB RAM is sufficient
- **Database**: Pre-built SQLite database (~15MB) loads quickly
- **Response time**: Average 12ms for queries
- **Caching**: Built-in 15-minute cache for repeated queries

## Next Steps

- Test your setup with the [MCP Client Tool in n8n](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.mcpclienttool/)
- Explore [available MCP tools](../README.md#-available-mcp-tools)
- Build AI-powered workflows with [AI Agent nodes](https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmagent/)
- Join the [n8n Community](https://community.n8n.io) for ideas and support

---

Need help? Open an issue on [GitHub](https://github.com/czlonkowski/n8n-mcp/issues) or check the [n8n forums](https://community.n8n.io).