# n8n Node Documentation MCP Server

An MCP (Model Context Protocol) server that provides n8n node documentation, source code, and usage examples to AI assistants like Claude.

## Purpose

This MCP server serves as a comprehensive knowledge base for AI assistants to understand and work with n8n nodes. It provides:

- **Complete node source code** - The actual TypeScript/JavaScript implementation of each n8n node
- **Official documentation** - Markdown documentation from the n8n-docs repository
- **Usage examples** - Sample workflow JSON showing how to use each node
- **Search capabilities** - Full-text search across node names, descriptions, and documentation

## Features

- 🔍 **Full-text search** - Search nodes by name, description, or documentation content
- 📚 **Complete documentation** - Fetches and indexes official n8n documentation
- 💻 **Source code access** - Provides full source code for each node
- 🎯 **Usage examples** - Auto-generates example workflows for each node type
- 🔄 **Database rebuild** - Rebuilds the entire database with latest node information
- ⚡ **Fast SQLite storage** - All data stored locally for instant access

## Installation

### Prerequisites

- Node.js 18+
- Git (for cloning n8n-docs)

### Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/n8n-mcp.git
cd n8n-mcp

# Install dependencies
npm install

# Build the project
npm run build

# Initialize and rebuild the database with all nodes
npm run db:rebuild:v2
```

## Installing in Claude Desktop

### 1. Build the project first

```bash
npm install
npm run build
npm run db:rebuild:v2  # This indexes all n8n nodes
```

### 2. Locate your Claude Desktop configuration

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

### 3. Edit the configuration file

```json
{
  "mcpServers": {
    "n8n-nodes": {
      "command": "node",
      "args": ["/absolute/path/to/n8n-mcp/dist/index-v2.js"],
      "env": {
        "NODE_DB_PATH": "/absolute/path/to/n8n-mcp/data/nodes-v2.db"
      }
    }
  }
}
```

**Important**: Use absolute paths, not relative paths like `~/` or `./`

### 4. Restart Claude Desktop

After saving the configuration, completely quit and restart Claude Desktop.

### 5. Verify the connection

In Claude, you should see "n8n-nodes" in the MCP connections. Try asking:
- "What n8n nodes are available?"
- "Show me how to use the IF node in n8n"
- "Search for webhook nodes in n8n"
- "Show me the source code for the HTTP Request node"

## Available MCP Tools

### `list_nodes`
Lists all available n8n nodes with basic information.
- Parameters: `category`, `packageName`, `isTrigger` (all optional)

### `get_node_info`
Gets complete information about a specific node including source code, documentation, and examples.
- Parameters: `nodeType` (required) - e.g., "n8n-nodes-base.if", "If", "webhook"

### `search_nodes`
Searches for nodes by name, description, or documentation content.
- Parameters: `query` (required), `category`, `hasDocumentation`, `limit` (optional)

### `get_node_example`
Gets example workflow JSON for a specific node.
- Parameters: `nodeType` (required)

### `get_node_source_code`
Gets only the source code of a node.
- Parameters: `nodeType` (required), `includeCredentials` (optional)

### `get_node_documentation`
Gets only the documentation for a node.
- Parameters: `nodeType` (required), `format` (optional: "markdown" or "plain")

### `rebuild_database`
Rebuilds the entire node database with latest information.
- Parameters: `includeDocumentation` (optional, default: true)

### `get_database_statistics`
Gets statistics about the node database.
- No parameters required

## Example Usage

When you ask Claude about the IF node, it will use the MCP tools to provide:

```json
{
  "nodeType": "n8n-nodes-base.if",
  "name": "If",
  "displayName": "If",
  "description": "Route items based on comparison operations",
  "sourceCode": "// Full TypeScript source code...",
  "documentation": "# If Node\n\nThe If node splits a workflow...",
  "exampleWorkflow": {
    "nodes": [{
      "parameters": {
        "conditions": {
          "conditions": [{
            "leftValue": "={{ $json }}",
            "rightValue": "",
            "operator": {
              "type": "object",
              "operation": "notEmpty"
            }
          }]
        }
      },
      "type": "n8n-nodes-base.if",
      "position": [220, 120],
      "name": "If"
    }],
    "connections": {
      "If": {
        "main": [[], []]
      }
    }
  }
}
```

## Database Management

### Initial Setup

The database is automatically created when you run:
```bash
npm run db:rebuild:v2
```

This process:
1. Clones/updates the n8n-docs repository
2. Extracts source code from all n8n nodes
3. Fetches documentation for each node
4. Generates usage examples
5. Stores everything in SQLite with full-text search

### Manual Rebuild

To update the database with latest nodes:
```bash
npm run db:rebuild:v2
```

### Database Location

The SQLite database is stored at: `data/nodes-v2.db`

## Development

```bash
# Run in development mode
npm run dev:v2

# Run tests
npm run test:v2

# Type checking
npm run typecheck
```

## Troubleshooting

### Claude Desktop doesn't show the MCP server

1. Ensure you've restarted Claude Desktop after editing the config
2. Check the config file is valid JSON (no trailing commas)
3. Verify the absolute paths are correct
4. Check Claude's developer console for errors (Help → Developer)

### "Connection failed" in Claude

1. Ensure the MCP server is built (`npm run build`)
2. Check that the database exists (`data/nodes-v2.db`)
3. Verify the NODE_DB_PATH in Claude config points to the correct database file

### Database rebuild fails

Some nodes may fail to extract (deprecated nodes, triggers without main node file). This is normal. The rebuild will continue and index all available nodes.

### No documentation for some nodes

Not all nodes have documentation in the n8n-docs repository. The server will still provide source code and generated examples for these nodes.

## Project Structure

```
n8n-mcp/
├── src/
│   ├── mcp/
│   │   ├── server-v2.ts      # MCP server implementation
│   │   └── tools-v2.ts       # MCP tool definitions
│   ├── services/
│   │   └── node-documentation-service.ts  # Database service
│   ├── utils/
│   │   ├── documentation-fetcher.ts       # n8n-docs fetcher
│   │   ├── example-generator.ts           # Example generator
│   │   └── node-source-extractor.ts       # Source extractor
│   └── scripts/
│       └── rebuild-database-v2.ts         # Database rebuild
└── data/
    └── nodes-v2.db          # SQLite database
```

## License

ISC

## Support

For issues and questions, please use the GitHub issue tracker.