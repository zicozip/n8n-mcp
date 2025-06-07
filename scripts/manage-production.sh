#!/bin/bash

# Production management script for n8n-MCP

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Display usage
usage() {
    echo -e "${BLUE}n8n-MCP Production Management Script${NC}"
    echo -e "${YELLOW}Usage:${NC} $0 [command]"
    echo
    echo -e "${YELLOW}Commands:${NC}"
    echo "  status      - Show service status"
    echo "  logs        - View service logs"
    echo "  start       - Start all services"
    echo "  stop        - Stop all services"
    echo "  restart     - Restart all services"
    echo "  rebuild-db  - Rebuild the node database"
    echo "  db-stats    - Show database statistics"
    echo "  backup      - Backup data volumes"
    echo "  restore     - Restore data volumes from backup"
    echo "  update      - Update services to latest versions"
    echo "  shell       - Open shell in MCP container"
    echo
    exit 1
}

# Check if docker compose file exists
if [ ! -f "docker-compose.prod.yml" ]; then
    echo -e "${RED}❌ docker-compose.prod.yml not found. Run this script from the project root.${NC}"
    exit 1
fi

# Main command handling
case "$1" in
    status)
        echo -e "${YELLOW}Service Status:${NC}"
        docker compose -f docker-compose.prod.yml ps
        ;;
        
    logs)
        if [ -z "$2" ]; then
            docker compose -f docker-compose.prod.yml logs -f --tail=100
        else
            docker compose -f docker-compose.prod.yml logs -f --tail=100 "$2"
        fi
        ;;
        
    start)
        echo -e "${YELLOW}Starting services...${NC}"
        docker compose -f docker-compose.prod.yml up -d
        echo -e "${GREEN}✅ Services started${NC}"
        ;;
        
    stop)
        echo -e "${YELLOW}Stopping services...${NC}"
        docker compose -f docker-compose.prod.yml down
        echo -e "${GREEN}✅ Services stopped${NC}"
        ;;
        
    restart)
        echo -e "${YELLOW}Restarting services...${NC}"
        docker compose -f docker-compose.prod.yml restart
        echo -e "${GREEN}✅ Services restarted${NC}"
        ;;
        
    rebuild-db)
        echo -e "${YELLOW}Rebuilding node database...${NC}"
        docker compose -f docker-compose.prod.yml exec n8n-mcp node dist/scripts/rebuild-database.js
        ;;
        
    db-stats)
        echo -e "${YELLOW}Database Statistics:${NC}"
        docker compose -f docker-compose.prod.yml exec n8n-mcp sqlite3 /app/data/nodes.db << 'EOF'
.headers on
.mode column
SELECT 
    COUNT(*) as total_nodes,
    COUNT(DISTINCT package_name) as total_packages,
    ROUND(SUM(code_length) / 1024.0 / 1024.0, 2) as total_size_mb,
    ROUND(AVG(code_length) / 1024.0, 2) as avg_size_kb
FROM nodes;

.print
.print "Top 10 packages by node count:"
SELECT package_name, COUNT(*) as node_count
FROM nodes
GROUP BY package_name
ORDER BY node_count DESC
LIMIT 10;
EOF
        ;;
        
    backup)
        BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)"
        echo -e "${YELLOW}Creating backup in ${BACKUP_DIR}...${NC}"
        mkdir -p "$BACKUP_DIR"
        
        # Stop services for consistent backup
        docker compose -f docker-compose.prod.yml stop
        
        # Backup volumes
        docker run --rm -v n8n-mcp_n8n-data:/source -v $(pwd)/$BACKUP_DIR:/backup alpine tar czf /backup/n8n-data.tar.gz -C /source .
        docker run --rm -v n8n-mcp_mcp-data:/source -v $(pwd)/$BACKUP_DIR:/backup alpine tar czf /backup/mcp-data.tar.gz -C /source .
        
        # Copy .env file
        cp .env "$BACKUP_DIR/"
        
        # Restart services
        docker compose -f docker-compose.prod.yml start
        
        echo -e "${GREEN}✅ Backup completed in ${BACKUP_DIR}${NC}"
        ;;
        
    restore)
        if [ -z "$2" ]; then
            echo -e "${RED}❌ Please specify backup directory (e.g., backups/20240107_120000)${NC}"
            exit 1
        fi
        
        if [ ! -d "$2" ]; then
            echo -e "${RED}❌ Backup directory $2 not found${NC}"
            exit 1
        fi
        
        echo -e "${YELLOW}⚠️  This will replace all current data! Continue? (y/N)${NC}"
        read -r confirm
        if [ "$confirm" != "y" ]; then
            echo "Restore cancelled"
            exit 0
        fi
        
        echo -e "${YELLOW}Restoring from $2...${NC}"
        
        # Stop services
        docker compose -f docker-compose.prod.yml down
        
        # Restore volumes
        docker run --rm -v n8n-mcp_n8n-data:/target -v $(pwd)/$2:/backup alpine tar xzf /backup/n8n-data.tar.gz -C /target
        docker run --rm -v n8n-mcp_mcp-data:/target -v $(pwd)/$2:/backup alpine tar xzf /backup/mcp-data.tar.gz -C /target
        
        # Start services
        docker compose -f docker-compose.prod.yml up -d
        
        echo -e "${GREEN}✅ Restore completed${NC}"
        ;;
        
    update)
        echo -e "${YELLOW}Updating services...${NC}"
        
        # Pull latest images
        docker compose -f docker-compose.prod.yml pull
        
        # Rebuild MCP image
        docker compose -f docker-compose.prod.yml build
        
        # Restart with new images
        docker compose -f docker-compose.prod.yml up -d
        
        echo -e "${GREEN}✅ Services updated${NC}"
        ;;
        
    shell)
        echo -e "${YELLOW}Opening shell in MCP container...${NC}"
        docker compose -f docker-compose.prod.yml exec n8n-mcp /bin/sh
        ;;
        
    *)
        usage
        ;;
esac