#!/bin/bash

# n8n-MCP Server Wrapper Script for Node v20.17.0
# This ensures the server runs with the correct Node version

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Change to the script directory
cd "$SCRIPT_DIR"

# Use Node v20.17.0 specifically (what Claude Desktop uses)
export PATH="/Users/romualdczlonkowski/.nvm/versions/node/v20.17.0/bin:$PATH"

# Verify we're using the right version
NODE_VERSION=$(node --version)
if [ "$NODE_VERSION" != "v20.17.0" ]; then
    echo "Error: Wrong Node.js version. Expected v20.17.0, got $NODE_VERSION" >&2
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Error: node_modules not found. Please run 'npm install' first." >&2
    exit 1
fi

# Check if database exists
if [ ! -f "data/nodes.db" ]; then
    echo "Error: Database not found. Please run 'npm run rebuild' first." >&2
    exit 1
fi

# Check if dist directory exists
if [ ! -d "dist" ]; then
    echo "Error: dist directory not found. Please run 'npm run build' first." >&2
    exit 1
fi

# Run the MCP server
exec node "$SCRIPT_DIR/dist/mcp/index.js"