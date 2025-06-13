# Claude Desktop Configuration for n8n-MCP

## Setup Options

You can set up n8n-MCP with Claude Desktop in three ways:

### Option 1: Docker (Recommended) 🐳

The easiest way to get started is using Docker:

#### 1a. Docker with HTTP Mode (Remote Access)
```json
{
  "mcpServers": {
    "n8n-remote": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/mcp-remote@latest",
        "connect",
        "http://localhost:3000/mcp"
      ],
      "env": {
        "MCP_AUTH_TOKEN": "your-auth-token-here"
      }
    }
  }
}
```

**Setup steps:**
1. Create a `.env` file:
   ```bash
   echo "AUTH_TOKEN=$(openssl rand -base64 32)" > .env
   ```
2. Start the server:
   ```bash
   docker compose up -d
   ```
3. Copy the AUTH_TOKEN to your Claude config

#### 1b. Docker with stdio Mode (Direct)
```json
{
  "mcpServers": {
    "n8n-docker": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-e", "MCP_MODE=stdio",
        "-v", "n8n-mcp-data:/app/data",
        "ghcr.io/czlonkowski/n8n-mcp:latest"
      ]
    }
  }
}
```

### Option 2: Local Installation

1. **Build the project first:**
   ```bash
   cd /path/to/n8n-mcp
   npm install
   npm run build
   npm run rebuild
   ```

2. **Add to Claude Desktop config:**
   ```json
   {
     "mcpServers": {
       "n8n-documentation": {
         "command": "node",
         "args": [
           "/path/to/n8n-mcp/dist/mcp/index.js"
         ],
         "env": {
           "NODE_ENV": "production"
         }
       }
     }
   }
   ```

### Option 3: NPM Global Install (Coming Soon)

```json
{
  "mcpServers": {
    "n8n-documentation": {
      "command": "npx",
      "args": [
        "-y",
        "n8n-mcp@latest"
      ]
    }
  }
}
```

## Configuration File Locations

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

After updating the config, **restart Claude Desktop** to load the new configuration.

## Available Tools

Once configured, you'll have access to these tools in Claude:

- **`list_nodes`** - List and filter n8n nodes
  ```
  list_nodes({ package: "n8n-nodes-base", limit: 10 })
  ```

- **`get_node_info`** - Get detailed information about a specific node
  ```
  get_node_info({ nodeType: "httpRequest" })
  ```

- **`search_nodes`** - Search across all node documentation
  ```
  search_nodes({ query: "webhook", limit: 20 })
  ```

- **`list_ai_tools`** - List nodes that can be used as AI Agent tools
  ```
  list_ai_tools({})
  ```

- **`get_node_documentation`** - Get full documentation for a node
  ```
  get_node_documentation({ nodeType: "slack" })
  ```

- **`get_database_statistics`** - Get statistics about the node database
  ```
  get_database_statistics({})
  ```

## Troubleshooting

### Docker Issues

1. **Container fails to start:**
   ```bash
   # Check logs
   docker compose logs -f
   
   # Check if port is in use
   lsof -i :3000
   ```

2. **Authentication errors:**
   - Ensure AUTH_TOKEN matches in .env and Claude config
   - Token should be at least 32 characters
   - Check quotes in JSON config

3. **Database not found:**
   - The container will auto-initialize on first run
   - To rebuild: `docker compose exec n8n-mcp npm run rebuild`

### Local Installation Issues

1. **If the server doesn't appear in Claude:**
   - Check that the path in `args` is absolute and correct
   - Ensure you've run `npm run build` and `npm run rebuild`
   - Verify Node.js version compatibility

2. **If tools return errors:**
   - Ensure the database exists: `data/nodes.db`
   - Run `npm run validate` to check the database
   - Rebuild if necessary: `npm run rebuild`

3. **For development/testing:**
   ```json
   {
     "mcpServers": {
       "n8n-documentation": {
         "command": "node",
         "args": [
           "/path/to/your/n8n-mcp/dist/mcp/index.js"
         ],
         "env": {
           "NODE_ENV": "development",
           "LOG_LEVEL": "debug"
         }
       }
     }
   }
   ```

### Common Solutions

- **Restart Claude Desktop** after config changes
- **Check file permissions** on Unix systems
- **Use absolute paths** in configuration
- **Verify JSON syntax** in claude_desktop_config.json