# n8n-MCP Setup Guide

This guide will help you set up n8n-MCP with Claude Desktop.

## Prerequisites

- Node.js (any version - the project handles compatibility automatically)
- npm (comes with Node.js)
- Git
- Claude Desktop app

## Step 1: Install Node.js

### Using nvm (recommended for development)

```bash
# Install nvm if you haven't already
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Install latest Node.js
nvm install node
nvm use node
```

### Direct installation

Download and install the latest Node.js from [nodejs.org](https://nodejs.org/)

> **Note**: Version 2.3+ includes automatic database adapter fallback. If your Node.js version doesn't match the native SQLite module, it will automatically use a pure JavaScript implementation.

## Step 2: Clone the Repository

```bash
# Clone n8n-mcp
git clone https://github.com/yourusername/n8n-mcp.git
cd n8n-mcp

# Clone n8n documentation (required)
git clone https://github.com/n8n-io/n8n-docs.git ../n8n-docs
```

## Step 3: Install and Build

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Initialize the database
npm run rebuild

# Verify installation
npm run test-nodes
```

Expected output:
```
🧪 Running node tests...
✅ nodes-base.httpRequest passed all checks
✅ nodes-base.slack passed all checks
✅ nodes-base.code passed all checks
📊 Test Results: 3 passed, 0 failed
```

## Step 4: Configure Claude Desktop

### macOS

1. Edit the Claude Desktop configuration:
```bash
nano ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

2. Add the n8n-documentation server:
```json
{
  "mcpServers": {
    "n8n-documentation": {
      "command": "node",
      "args": [
        "/Users/yourusername/path/to/n8n-mcp/dist/mcp/index.js"
      ]
    }
  }
}
```

### Windows

1. Edit the configuration:
```bash
notepad %APPDATA%\Claude\claude_desktop_config.json
```

2. Add the n8n-documentation server with your full path:
```json
{
  "mcpServers": {
    "n8n-documentation": {
      "command": "node",
      "args": [
        "C:\\Users\\yourusername\\path\\to\\n8n-mcp\\dist\\mcp\\index.js"
      ]
    }
  }
}
```

## Step 5: Verify Installation

Run the validation script to ensure everything is working:
```bash
npm run validate
```

## Step 6: Restart Claude Desktop

1. Quit Claude Desktop completely
2. Start Claude Desktop again
3. You should see "n8n-documentation" in the MCP tools menu

## Troubleshooting

### Node version mismatch

**This is now handled automatically!** If you see messages about NODE_MODULE_VERSION:
- The system will automatically fall back to sql.js (pure JavaScript)
- No manual intervention required
- Both adapters provide identical functionality
- Check logs to see which adapter is active

### Database not found

```bash
# Rebuild the database
npm run rebuild
```

### Permission denied

```bash
# Make the wrapper script executable
chmod +x mcp-server-v20.sh
```

### Claude Desktop doesn't see the MCP server

1. Check the config file location:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

2. Verify the path in the config is absolute and correct

3. Check Claude Desktop logs:
   - macOS: `~/Library/Logs/Claude/mcp.log`

## Testing the Integration

Once configured, you can test the integration in Claude Desktop:

1. Open a new conversation
2. Ask: "What MCP tools are available?"
3. You should see the n8n documentation tools listed

Example queries to test:
- "List all n8n trigger nodes"
- "Show me the properties of the HTTP Request node"
- "Search for nodes that work with Slack"
- "What AI tools are available in n8n?"

## Updating

To update to the latest version:

```bash
git pull
npm install
npm run build
npm run rebuild
```

## Development Mode

For development with hot reloading:

```bash
# Run in development mode
npm run dev
```

### Database Adapter Information

When the server starts, you'll see one of these messages:
- `Successfully initialized better-sqlite3 adapter` - Using native SQLite (faster)
- `Successfully initialized sql.js adapter` - Using pure JavaScript (compatible with any Node.js version)

Both adapters provide identical functionality, so the user experience is the same regardless of which one is used.