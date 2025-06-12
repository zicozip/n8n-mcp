# Claude Desktop Configuration for n8n-MCP

## Setup Instructions

1. **Build the project first:**
   ```bash
   cd /Users/romualdczlonkowski/Pliki/n8n-mcp/n8n-mcp
   npm run build
   npm run rebuild
   ```

2. **Locate your Claude Desktop config file:**
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - Linux: `~/.config/Claude/claude_desktop_config.json`

3. **Add the n8n-documentation server to your config:**
   ```json
   {
     "mcpServers": {
       "n8n-documentation": {
         "command": "node",
         "args": [
           "/Users/romualdczlonkowski/Pliki/n8n-mcp/n8n-mcp/dist/mcp/index.js"
         ],
         "env": {
           "NODE_ENV": "production"
         }
       }
     }
   }
   ```

   **Note**: Update the path in `args` to match your actual installation directory.

   > **New in v2.3**: The project now automatically handles Node.js version mismatches. If Claude Desktop uses a different Node.js version, the database adapter will automatically fall back to a pure JavaScript implementation (sql.js) that works with any version.

4. **Restart Claude Desktop** to load the new configuration.

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

1. **If the server doesn't appear in Claude:**
   - Check that the path in `args` is absolute and correct
   - Ensure you've run `npm run build` and `npm run rebuild`
   - Check Claude Desktop logs: `~/Library/Logs/Claude/mcp*.log`

2. **If tools return errors:**
   - Ensure the database exists: `data/nodes.db`
   - Run `npm run validate` to check the database
   - Rebuild if necessary: `npm run rebuild`

3. **Node.js version issues:**
   - **No action needed!** The project automatically detects version mismatches
   - If better-sqlite3 fails, it falls back to sql.js (pure JavaScript)
   - You'll see a log message indicating which adapter is being used
   - Both adapters provide identical functionality

4. **For development/testing:**
   You can also run with more verbose logging:
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

5. **Checking which database adapter is active:**
   Look for these log messages when the server starts:
   - `Successfully initialized better-sqlite3 adapter` - Using native SQLite
   - `Successfully initialized sql.js adapter` - Using pure JavaScript fallback