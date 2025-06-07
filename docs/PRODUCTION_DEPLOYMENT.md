# Production Deployment Guide for n8n-MCP

This guide provides instructions for deploying n8n-MCP in a production environment.

## Prerequisites

- Docker and Docker Compose v2 installed
- Node.js 18+ installed (for building)
- At least 2GB of available RAM
- 1GB of available disk space

## Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/n8n-mcp.git
   cd n8n-mcp
   ```

2. **Run the deployment script**
   ```bash
   ./scripts/deploy-production.sh
   ```

   This script will:
   - Check prerequisites
   - Create a secure `.env` file with generated passwords
   - Build the project
   - Create Docker images
   - Start all services
   - Initialize the node database

3. **Access n8n**
   - URL: `http://localhost:5678`
   - Use the credentials displayed during deployment

## Manual Deployment

If you prefer manual deployment:

1. **Create .env file**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

2. **Build the project**
   ```bash
   npm install
   npm run build
   ```

3. **Start services**
   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `N8N_BASIC_AUTH_USER` | n8n admin username | admin |
| `N8N_BASIC_AUTH_PASSWORD` | n8n admin password | (generated) |
| `N8N_HOST` | n8n hostname | localhost |
| `N8N_API_KEY` | API key for n8n access | (generated) |
| `NODE_DB_PATH` | SQLite database path | /app/data/nodes.db |
| `LOG_LEVEL` | Logging level | info |

### Volumes

The deployment creates persistent volumes:
- `n8n-data`: n8n workflows and credentials
- `mcp-data`: MCP node database
- `n8n-node-modules`: Read-only n8n node modules

## Management

Use the management script for common operations:

```bash
# Check service status
./scripts/manage-production.sh status

# View logs
./scripts/manage-production.sh logs

# Rebuild node database
./scripts/manage-production.sh rebuild-db

# Show database statistics
./scripts/manage-production.sh db-stats

# Create backup
./scripts/manage-production.sh backup

# Update services
./scripts/manage-production.sh update
```

## Database Management

### Initial Database Population

The database is automatically populated on first startup. To manually rebuild:

```bash
docker compose -f docker-compose.prod.yml exec n8n-mcp node dist/scripts/rebuild-database.js
```

### Database Queries

Search for nodes:
```bash
docker compose -f docker-compose.prod.yml exec n8n-mcp sqlite3 /app/data/nodes.db \
  "SELECT node_type, display_name FROM nodes WHERE name LIKE '%webhook%';"
```

## Security Considerations

1. **Change default passwords**: Always change the generated passwords in production
2. **Use HTTPS**: Configure a reverse proxy (nginx, traefik) for HTTPS
3. **Firewall**: Restrict access to ports 5678
4. **API Keys**: Keep API keys secure and rotate regularly
5. **Backups**: Regular backup of data volumes

## Monitoring

### Health Checks

Both services include health checks:
- n8n: `http://localhost:5678/healthz`
- MCP: Database file existence check

### Logs

View logs for debugging:
```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker-compose.prod.yml logs -f n8n-mcp
```

## Troubleshooting

### Database Issues

If the database is corrupted or needs rebuilding:
```bash
# Stop services
docker compose -f docker-compose.prod.yml stop

# Remove database
docker compose -f docker-compose.prod.yml exec n8n-mcp rm /app/data/nodes.db

# Start services (database will rebuild)
docker compose -f docker-compose.prod.yml start
```

### Memory Issues

If services run out of memory, increase Docker memory limits:
```yaml
# In docker-compose.prod.yml
services:
  n8n-mcp:
    deploy:
      resources:
        limits:
          memory: 1G
```

### Connection Issues

If n8n can't connect to MCP:
1. Check both services are running: `docker compose -f docker-compose.prod.yml ps`
2. Verify network connectivity: `docker compose -f docker-compose.prod.yml exec n8n ping n8n-mcp`
3. Check MCP logs: `docker compose -f docker-compose.prod.yml logs n8n-mcp`

## Scaling

For high-availability deployments:

1. **Database Replication**: Use external SQLite replication or migrate to PostgreSQL
2. **Load Balancing**: Deploy multiple MCP instances behind a load balancer
3. **Caching**: Implement Redis caching for frequently accessed nodes

## Updates

To update to the latest version:

```bash
# Pull latest code
git pull

# Rebuild and restart
./scripts/manage-production.sh update
```

## Support

For issues and questions:
- GitHub Issues: [your-repo-url]/issues
- Documentation: [your-docs-url]