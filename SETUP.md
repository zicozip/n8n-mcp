# n8n-MCP Setup Guide

This guide will help you set up n8n-MCP with Claude Desktop.

## Prerequisites

- Node.js v20.17.0 (required for Claude Desktop)
- npm (comes with Node.js)
- Git
- Claude Desktop app

## Step 1: Install Node.js v20.17.0

### Using nvm (recommended)

```bash
# Install nvm if you haven't already
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Install Node v20.17.0
nvm install 20.17.0
nvm use 20.17.0
```

### Direct installation

Download and install Node.js v20.17.0 from [nodejs.org](https://nodejs.org/)

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

1. Copy the example configuration:
```bash
cp claude_desktop_config.example.json ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

2. Edit the configuration file:
```bash
nano ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

3. Update the path to your installation:
```json
{
  "mcpServers": {
    "n8n-documentation": {
      "command": "/Users/yourusername/path/to/n8n-mcp/mcp-server-v20.sh",
      "args": []
    }
  }
}
```

### Windows

1. Copy the example configuration:
```bash
copy claude_desktop_config.example.json %APPDATA%\Claude\claude_desktop_config.json
```

2. Edit the configuration with the full path to your installation.

## Step 5: Create the Wrapper Script

1. Copy the example wrapper script:
```bash
cp mcp-server-v20.example.sh mcp-server-v20.sh
chmod +x mcp-server-v20.sh
```

2. Edit the script if your nvm path is different:
```bash
nano mcp-server-v20.sh
```

## Step 6: Restart Claude Desktop

1. Quit Claude Desktop completely
2. Start Claude Desktop again
3. You should see "n8n-documentation" in the MCP tools menu

## Troubleshooting

### Node version mismatch

If you see errors about NODE_MODULE_VERSION:
```bash
# Make sure you're using Node v20.17.0
node --version  # Should output: v20.17.0

# Rebuild native modules
npm rebuild better-sqlite3
```

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
# Make sure you're using Node v20.17.0
nvm use 20.17.0

# Run in development mode
npm run dev
```