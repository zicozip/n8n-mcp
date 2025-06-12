#!/bin/bash

# Claude Desktop Configuration Installer for n8n-MCP

echo "🔧 n8n-MCP Claude Desktop Configuration Installer"
echo "================================================"

# Get the current directory
CURRENT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Detect OS and set config path
if [[ "$OSTYPE" == "darwin"* ]]; then
    CONFIG_PATH="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    CONFIG_PATH="$APPDATA/Claude/claude_desktop_config.json"
else
    CONFIG_PATH="$HOME/.config/Claude/claude_desktop_config.json"
fi

echo ""
echo "📍 Detected config location: $CONFIG_PATH"
echo "📂 n8n-MCP installation path: $CURRENT_DIR"

# Create directory if it doesn't exist
CONFIG_DIR=$(dirname "$CONFIG_PATH")
if [ ! -d "$CONFIG_DIR" ]; then
    echo "📁 Creating config directory..."
    mkdir -p "$CONFIG_DIR"
fi

# Backup existing config if it exists
if [ -f "$CONFIG_PATH" ]; then
    echo "💾 Backing up existing config to ${CONFIG_PATH}.backup"
    cp "$CONFIG_PATH" "${CONFIG_PATH}.backup"
fi

# Create the new config
cat > "$CONFIG_PATH" << EOF
{
  "mcpServers": {
    "n8n-documentation": {
      "command": "node",
      "args": [
        "$CURRENT_DIR/dist/mcp/index.js"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
EOF

echo "✅ Configuration installed!"
echo ""
echo "📋 Next steps:"
echo "1. Build the project: npm run build"
echo "2. Rebuild database: npm run rebuild"
echo "3. Restart Claude Desktop"
echo ""
echo "🚀 The n8n-documentation server will be available in Claude!"