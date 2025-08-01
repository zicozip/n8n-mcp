#!/bin/bash

# Test script for n8n MCP integration fixes
set -e

echo "🔧 Testing n8n MCP Integration Fixes"
echo "===================================="

# Configuration
MCP_PORT=${MCP_PORT:-3001}
AUTH_TOKEN=${AUTH_TOKEN:-"test-token-for-n8n-testing-minimum-32-chars"}

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}🧹 Cleaning up...${NC}"
    if [ -n "$MCP_PID" ] && kill -0 $MCP_PID 2>/dev/null; then
        echo "Stopping MCP server..."
        kill $MCP_PID 2>/dev/null || true
        wait $MCP_PID 2>/dev/null || true
    fi
    echo -e "${GREEN}✅ Cleanup complete${NC}"
}

trap cleanup EXIT INT TERM

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "dist" ]; then
    echo -e "${RED}❌ Error: Must run from n8n-mcp directory${NC}"
    exit 1
fi

# Build the project (our fixes)
echo -e "${YELLOW}📦 Building project with fixes...${NC}"
npm run build

# Start MCP server in n8n mode
echo -e "\n${GREEN}🚀 Starting MCP server in n8n mode...${NC}"
N8N_MODE=true \
MCP_MODE=http \
AUTH_TOKEN="${AUTH_TOKEN}" \
PORT=${MCP_PORT} \
DEBUG_MCP=true \
node dist/mcp/index.js > /tmp/mcp-n8n-test.log 2>&1 &

MCP_PID=$!
echo -e "${YELLOW}📄 MCP server logs: /tmp/mcp-n8n-test.log${NC}"

# Wait for server to start
echo -e "${YELLOW}⏳ Waiting for MCP server to start...${NC}"
for i in {1..15}; do
    if curl -s http://localhost:${MCP_PORT}/health >/dev/null 2>&1; then
        echo -e "${GREEN}✅ MCP server is ready!${NC}"
        break
    fi
    if [ $i -eq 15 ]; then
        echo -e "${RED}❌ MCP server failed to start${NC}"
        echo "Server logs:"
        cat /tmp/mcp-n8n-test.log
        exit 1
    fi
    sleep 1
done

# Test the protocol fixes
echo -e "\n${BLUE}🧪 Testing protocol fixes...${NC}"

# Run our debug script
echo -e "${YELLOW}Running comprehensive MCP protocol tests...${NC}"
node scripts/debug-n8n-mode.js

echo -e "\n${GREEN}🎉 Test complete!${NC}"
echo -e "\n📋 Summary of fixes applied:"
echo -e "  ✅ Fixed protocol version mismatch (now using 2025-03-26)"
echo -e "  ✅ Enhanced tool response formatting and size validation"
echo -e "  ✅ Added comprehensive parameter validation"
echo -e "  ✅ Improved error handling and logging"
echo -e "  ✅ Added initialization request debugging"

echo -e "\n📝 Next steps:"
echo -e "  1. If tests pass, the n8n schema validation errors should be resolved"
echo -e "  2. Test with actual n8n MCP Client Tool node"
echo -e "  3. Monitor logs at /tmp/mcp-n8n-test.log for any remaining issues"

echo -e "\n${YELLOW}Press any key to view recent server logs, or Ctrl+C to exit...${NC}"
read -n 1

echo -e "\n${BLUE}📄 Recent server logs:${NC}"
tail -50 /tmp/mcp-n8n-test.log