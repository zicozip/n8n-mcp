#!/bin/bash

# Production deployment script for n8n-MCP

set -e

echo "🚀 n8n-MCP Production Deployment Script"
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to generate secure password
generate_password() {
    openssl rand -base64 32 | tr -d "=+/" | cut -c1-25
}

# Check prerequisites
echo -e "\n${YELLOW}Checking prerequisites...${NC}"

if ! command_exists docker; then
    echo -e "${RED}❌ Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

if ! command_exists docker compose; then
    echo -e "${RED}❌ Docker Compose v2 is not installed. Please install Docker Compose v2.${NC}"
    exit 1
fi

if ! command_exists node; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js first.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ All prerequisites met${NC}"

# Check for .env file
if [ ! -f .env ]; then
    echo -e "\n${YELLOW}Creating .env file...${NC}"
    
    # Generate secure passwords
    N8N_BASIC_AUTH_PASSWORD=$(generate_password)
    N8N_API_KEY=$(generate_password)
    
    cat > .env << EOF
# n8n Configuration
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=${N8N_BASIC_AUTH_PASSWORD}
N8N_HOST=localhost
N8N_API_KEY=${N8N_API_KEY}

# MCP Configuration
MCP_LOG_LEVEL=info
NODE_ENV=production
EOF
    
    echo -e "${GREEN}✅ Created .env file with secure defaults${NC}"
    echo -e "${YELLOW}⚠️  Please note your credentials:${NC}"
    echo -e "   n8n Username: admin"
    echo -e "   n8n Password: ${N8N_BASIC_AUTH_PASSWORD}"
    echo -e "   API Key: ${N8N_API_KEY}"
    echo -e "${YELLOW}   Save these credentials securely!${NC}"
else
    echo -e "${GREEN}✅ Using existing .env file${NC}"
fi

# Build the project
echo -e "\n${YELLOW}Building the project...${NC}"
npm install
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed. Please fix the errors and try again.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build completed successfully${NC}"

# Build Docker image
echo -e "\n${YELLOW}Building Docker image...${NC}"
docker compose -f docker-compose.prod.yml build

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Docker build failed. Please check the logs.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Docker image built successfully${NC}"

# Start services
echo -e "\n${YELLOW}Starting services...${NC}"
docker compose -f docker-compose.prod.yml up -d

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to start services. Please check the logs.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Services started successfully${NC}"

# Wait for services to be healthy
echo -e "\n${YELLOW}Waiting for services to be healthy...${NC}"
sleep 10

# Check service health
N8N_HEALTH=$(docker compose -f docker-compose.prod.yml ps n8n --format json | jq -r '.[0].Health // "unknown"')
MCP_HEALTH=$(docker compose -f docker-compose.prod.yml ps n8n-mcp --format json | jq -r '.[0].Health // "unknown"')

if [ "$N8N_HEALTH" = "healthy" ] && [ "$MCP_HEALTH" = "healthy" ]; then
    echo -e "${GREEN}✅ All services are healthy${NC}"
else
    echo -e "${YELLOW}⚠️  Services might still be starting up...${NC}"
    echo -e "   n8n status: $N8N_HEALTH"
    echo -e "   MCP server status: $MCP_HEALTH"
fi

# Display access information
echo -e "\n${GREEN}🎉 Deployment completed successfully!${NC}"
echo -e "\n${YELLOW}Access Information:${NC}"
echo -e "   n8n UI: http://localhost:5678"
echo -e "   MCP Server: Running internally (accessible by n8n)"
echo -e "\n${YELLOW}Next Steps:${NC}"
echo -e "   1. Access n8n at http://localhost:5678"
echo -e "   2. Log in with the credentials from .env file"
echo -e "   3. Create a new workflow and add the MCP node"
echo -e "   4. Configure the MCP node to connect to the internal server"
echo -e "\n${YELLOW}Useful Commands:${NC}"
echo -e "   View logs: docker compose -f docker-compose.prod.yml logs -f"
echo -e "   Stop services: docker compose -f docker-compose.prod.yml down"
echo -e "   Rebuild database: docker compose -f docker-compose.prod.yml exec n8n-mcp node dist/scripts/rebuild-database.js"
echo -e "   View database stats: docker compose -f docker-compose.prod.yml exec n8n-mcp sqlite3 /app/data/nodes.db 'SELECT COUNT(*) as total_nodes FROM nodes;'"