#!/bin/bash

# Script to install the MCP node into n8n

set -e

echo "Installing n8n MCP node..."

# Build the project
echo "Building project..."
npm run build

# Create custom nodes directory if it doesn't exist
N8N_CUSTOM_DIR="${N8N_CUSTOM_DIR:-$HOME/.n8n/custom}"
mkdir -p "$N8N_CUSTOM_DIR/nodes/n8n-mcp"

# Copy node files
echo "Copying node files to n8n custom directory..."
cp dist/n8n/MCPNode.node.js "$N8N_CUSTOM_DIR/nodes/n8n-mcp/"
cp dist/n8n/MCPApi.credentials.js "$N8N_CUSTOM_DIR/nodes/n8n-mcp/"

# Copy utils for the node to work
mkdir -p "$N8N_CUSTOM_DIR/nodes/n8n-mcp/utils"
cp -r dist/utils/* "$N8N_CUSTOM_DIR/nodes/n8n-mcp/utils/"

# Create package.json for the custom node
cat > "$N8N_CUSTOM_DIR/nodes/n8n-mcp/package.json" << EOF
{
  "name": "n8n-nodes-mcp",
  "version": "1.0.0",
  "description": "MCP integration for n8n",
  "n8n": {
    "n8nNodesApiVersion": 1,
    "credentials": [
      "dist/n8n/MCPApi.credentials.js"
    ],
    "nodes": [
      "dist/n8n/MCPNode.node.js"
    ]
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.1"
  }
}
EOF

echo "MCP node installed successfully!"
echo "Please restart n8n for the changes to take effect."
echo ""
echo "Custom node location: $N8N_CUSTOM_DIR/nodes/n8n-mcp"