#!/bin/bash

# Script to test n8n integration with n8n-mcp server
set -e

echo "🚀 Starting n8n integration test environment..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
N8N_PORT=5678
MCP_PORT=3001
AUTH_TOKEN="test-token-for-n8n-testing-minimum-32-chars"

# n8n data directory for persistence
N8N_DATA_DIR="$HOME/.n8n-mcp-test"

# Function to cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}🧹 Cleaning up...${NC}"
    
    # Stop n8n container
    if docker ps -q -f name=n8n-test > /dev/null 2>&1; then
        echo "Stopping n8n container..."
        docker stop n8n-test >/dev/null 2>&1 || true
        docker rm n8n-test >/dev/null 2>&1 || true
    fi
    
    # Kill MCP server if running
    if [ -n "$MCP_PID" ] && kill -0 $MCP_PID 2>/dev/null; then
        echo "Stopping MCP server..."
        kill $MCP_PID 2>/dev/null || true
    fi
    
    echo -e "${GREEN}✅ Cleanup complete${NC}"
}

# Set trap to cleanup on exit
trap cleanup EXIT INT TERM

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "dist" ]; then
    echo -e "${RED}❌ Error: Must run from n8n-mcp directory${NC}"
    echo "Please cd to /Users/romualdczlonkowski/Pliki/n8n-mcp/n8n-mcp"
    exit 1
fi

# Always build the project to ensure latest changes
echo -e "${YELLOW}📦 Building project...${NC}"
npm run build

# Create n8n data directory if it doesn't exist
if [ ! -d "$N8N_DATA_DIR" ]; then
    echo -e "${YELLOW}📁 Creating n8n data directory: $N8N_DATA_DIR${NC}"
    mkdir -p "$N8N_DATA_DIR"
fi

# Start n8n in Docker with persistent volume
echo -e "\n${GREEN}🐳 Starting n8n container with persistent data...${NC}"
docker run -d \
  --name n8n-test \
  -p ${N8N_PORT}:5678 \
  -v "${N8N_DATA_DIR}:/home/node/.n8n" \
  -e N8N_BASIC_AUTH_ACTIVE=false \
  -e N8N_HOST=localhost \
  -e N8N_PORT=5678 \
  -e N8N_PROTOCOL=http \
  -e NODE_ENV=development \
  -e N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true \
  n8nio/n8n:latest

# Wait for n8n to be ready
echo -e "${YELLOW}⏳ Waiting for n8n to start...${NC}"
for i in {1..30}; do
    if curl -s http://localhost:${N8N_PORT}/ >/dev/null 2>&1; then
        echo -e "${GREEN}✅ n8n is ready!${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}❌ n8n failed to start${NC}"
        exit 1
    fi
    sleep 1
done

# Start MCP server
echo -e "\n${GREEN}🚀 Starting MCP server in n8n mode...${NC}"
N8N_MODE=true \
MCP_MODE=http \
AUTH_TOKEN="${AUTH_TOKEN}" \
PORT=${MCP_PORT} \
node dist/mcp/index.js > /tmp/mcp-server.log 2>&1 &

MCP_PID=$!

# Show log file location
echo -e "${YELLOW}📄 MCP server logs: /tmp/mcp-server.log${NC}"

# Wait for MCP server to be ready
echo -e "${YELLOW}⏳ Waiting for MCP server to start...${NC}"
for i in {1..10}; do
    if curl -s http://localhost:${MCP_PORT}/health >/dev/null 2>&1; then
        echo -e "${GREEN}✅ MCP server is ready!${NC}"
        break
    fi
    if [ $i -eq 10 ]; then
        echo -e "${RED}❌ MCP server failed to start${NC}"
        exit 1
    fi
    sleep 1
done

# Show status and test endpoints
echo -e "\n${GREEN}🎉 Both services are running!${NC}"
echo -e "\n📍 Service URLs:"
echo -e "  • n8n:        http://localhost:${N8N_PORT}"
echo -e "  • MCP server: http://localhost:${MCP_PORT}"
echo -e "\n🔑 Auth token: ${AUTH_TOKEN}"
echo -e "\n💾 n8n data stored in: ${N8N_DATA_DIR}"
echo -e "   (Your workflows, credentials, and settings are preserved between runs)"

# Test MCP protocol endpoint
echo -e "\n${YELLOW}🧪 Testing MCP protocol endpoint...${NC}"
echo "Response from GET /mcp:"
curl -s http://localhost:${MCP_PORT}/mcp | jq '.' || curl -s http://localhost:${MCP_PORT}/mcp

# Test MCP initialization
echo -e "\n${YELLOW}🧪 Testing MCP initialization...${NC}"
echo "Response from POST /mcp (initialize):"
curl -s -X POST http://localhost:${MCP_PORT}/mcp \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}},"id":1}' \
  | jq '.' || echo "(Install jq for pretty JSON output)"

echo -e "\n${GREEN}✅ Setup complete!${NC}"
echo -e "\n📝 Next steps:"
echo -e "  1. Open n8n at http://localhost:${N8N_PORT}"
echo -e "  2. Create a workflow with the AI Agent node"
echo -e "  3. Add MCP Client Tool node"
echo -e "  4. Configure it with:"
echo -e "     • Transport: HTTP"
echo -e "     • URL: http://host.docker.internal:${MCP_PORT}/mcp"
echo -e "     • Auth: Bearer ${AUTH_TOKEN}"
echo -e "\n${YELLOW}Press Ctrl+C to stop both services${NC}"
echo -e "\n${YELLOW}📋 To monitor MCP logs: tail -f /tmp/mcp-server.log${NC}"
echo -e "${YELLOW}📋 To monitor n8n logs: docker logs -f n8n-test${NC}"

# Wait for interrupt
wait $MCP_PID