# Claude Desktop Configuration for n8n-MCP

This guide helps you connect n8n-MCP to Claude Desktop, giving Claude comprehensive knowledge about n8n's 450+ workflow automation nodes.

## 🎯 Prerequisites

- Claude Desktop installed
- For remote connections: Node.js 18+ on your local machine
- For Docker: Docker Desktop or Docker Engine

## 🛠️ Configuration Methods

### Method 1: Docker (Simplest) 🐳

No installation needed - runs directly from Docker:

```json
{
  "mcpServers": {
    "n8n-docker": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-e", "MCP_MODE=stdio",
        "-v", "n8n-mcp-data:/app/data",
        "ghcr.io/czlonkowski/n8n-mcp:latest"
      ]
    }
  }
}
```

✨ **Benefits**: No setup required, always up-to-date, isolated environment.

### Method 2: Local Installation

1. **Install and build:**
   ```bash
   git clone https://github.com/czlonkowski/n8n-mcp.git
   cd n8n-mcp
   npm install
   npm run build
   npm run rebuild
   ```

2. **Configure Claude Desktop:**
   ```json
   {
     "mcpServers": {
       "n8n-documentation": {
         "command": "node",
         "args": ["/absolute/path/to/n8n-mcp/dist/mcp/index.js"],
         "env": {
           "NODE_ENV": "production"
         }
       }
     }
   }
   ```

⚠️ **Important**: Use absolute paths, not relative paths.

### Method 3: Remote Server Connection

**Requirements**: Node.js 18+ installed locally

```json
{
  "mcpServers": {
    "n8n-remote": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://your-server.com/mcp",
        "--header",
        "Authorization: Bearer ${AUTH_TOKEN}"
      ],
      "env": {
        "AUTH_TOKEN": "your-auth-token"
      }
    }
  }
}
```

📝 **Note**: Remote MCP is also natively supported in Claude Pro/Team/Enterprise via Settings > Integrations.

## 📁 Configuration File Locations

Find your `claude_desktop_config.json` file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

🔄 **Important**: After editing, restart Claude Desktop (Cmd/Ctrl+R or quit and reopen).

## ✅ Verify Installation

After restarting Claude Desktop:

1. Look for "n8n-docker" or "n8n-documentation" in the MCP servers list
2. Try asking Claude: "What n8n nodes are available for working with Slack?"
3. Or use a tool directly: "Use the list_nodes tool to show me trigger nodes"

## 🔧 Available Tools

Once connected, you can ask Claude to:

- **List nodes**: "Show me all n8n nodes for working with databases"
- **Get node details**: "How do I use the HTTP Request node?"
- **Search documentation**: "Find n8n nodes that support OAuth"
- **Find AI tools**: "What AI-capable nodes are available?"
- **View statistics**: "Show me n8n-MCP database statistics"

Claude will automatically use the appropriate tools:
- `list_nodes` - Filter and list nodes
- `get_node_info` - Get detailed node information
- `search_nodes` - Full-text search
- `list_ai_tools` - Find AI-capable nodes
- `get_node_documentation` - Get official docs
- `get_database_statistics` - View coverage metrics

## 🔍 Troubleshooting

### Server Not Appearing in Claude

1. **Check JSON syntax**: 
   ```bash
   # Validate your config file
   cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | jq .
   ```

2. **Verify paths are absolute** (not relative)

3. **Restart Claude Desktop completely** (quit and reopen)

### Remote Connection Issues

**"TransformStream is not defined" error:**
- Cause: Node.js version < 18
- Fix: Update Node.js to v18 or newer
  ```bash
  node --version  # Should be v18.0.0 or higher
  ```

**"Server disconnected" error:**
- Check AUTH_TOKEN matches between server and client
- Verify server is running: `curl https://your-server.com/health`
- Check for VPN interference

### Docker Issues

**"Cannot find image" error:**
```bash
# Pull the latest image
docker pull ghcr.io/czlonkowski/n8n-mcp:latest
```

**Permission denied:**
```bash
# Ensure Docker is running
docker ps
```

### Quick Fixes

- 🔄 **Always restart Claude** after config changes
- 📋 **Copy example configs exactly** (watch for typos)
- 📂 **Use absolute paths** (/Users/... not ~/...)
- 🔍 **Check logs**: View > Developer > Logs in Claude Desktop

For more help, see [Troubleshooting Guide](./TROUBLESHOOTING.md)