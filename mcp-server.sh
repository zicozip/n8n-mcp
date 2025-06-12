#!/bin/bash

# n8n-MCP Server Wrapper Script
# This ensures the server runs with the correct environment

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Change to the script directory
cd "$SCRIPT_DIR"

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