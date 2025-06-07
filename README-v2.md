# n8n Node Documentation MCP Server

An MCP (Model Context Protocol) server that provides n8n node documentation, source code, and usage examples to AI assistants.

## Purpose

This MCP server serves as a knowledge base for AI assistants (like Claude) to understand and work with n8n nodes. It provides:

- **Complete node source code** - The actual implementation of each n8n node
- **Official documentation** - Markdown documentation from the n8n-docs repository
- **Usage examples** - Sample workflow JSON showing how to use each node
- **Search capabilities** - Full-text search across node names, descriptions, and documentation

## Features

- 🔍 **Full-text search** - Search nodes by name, description, or documentation content
- 📚 **Complete documentation** - Fetches and indexes official n8n documentation
- 💻 **Source code access** - Provides full source code for each node
- 🎯 **Usage examples** - Generates example workflows for each node type
- 🔄 **Auto-rebuild** - Rebuilds the entire database on startup or on demand
- ⚡ **Fast SQLite storage** - All data stored locally for instant access

## Installation

### Prerequisites

- Node.js 18+
- n8n instance (for node extraction)
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

# Rebuild the database with all nodes
npm run db:rebuild
```

## Usage with Claude Desktop

### 1. Configure Claude Desktop

Add to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "n8n-nodes": {
      "command": "node",
      "args": ["/absolute/path/to/n8n-mcp/dist/index-v2.js"],
      "env": {
        "NODE_DB_PATH": "/absolute/path/to/n8n-mcp/data/nodes.db",
        "REBUILD_ON_START": "false"
      }
    }
  }
}
```

### 2. Available MCP Tools

Once configured, you can ask Claude to:

- **List all n8n nodes**: "Show me all available n8n nodes"
- **Get node information**: "Show me the IF node documentation and code"
- **Search for nodes**: "Find all webhook-related nodes"
- **Get examples**: "Show me an example of using the HTTP Request node"

### MCP Tools Reference

#### `list_nodes`
Lists all available n8n nodes with basic information.

```
Parameters:
- category (optional): Filter by category
- packageName (optional): Filter by package
- isTrigger (optional): Show only trigger nodes
```

#### `get_node_info`
Gets complete information about a specific node including source code, documentation, and examples.

```
Parameters:
- nodeType (required): The node type (e.g., "n8n-nodes-base.if", "If", "webhook")
```

#### `search_nodes`
Searches for nodes by name, description, or documentation content.

```
Parameters:
- query (required): Search query
- category (optional): Filter by category
- hasDocumentation (optional): Only show nodes with docs
- limit (optional): Max results (default: 20)
```

#### `get_node_example`
Gets example workflow JSON for a specific node.

```
Parameters:
- nodeType (required): The node type
```

#### `get_node_source_code`
Gets only the source code of a node.

```
Parameters:
- nodeType (required): The node type
- includeCredentials (optional): Include credential definitions
```

#### `get_node_documentation`
Gets only the documentation for a node.

```
Parameters:
- nodeType (required): The node type
- format (optional): "markdown" or "plain" (default: markdown)
```

## Database Management

### Initial Setup

```bash
# Build and populate the database
npm run db:rebuild
```

### Database Structure

The SQLite database stores:
- Node source code
- Official documentation from n8n-docs
- Generated usage examples
- Node metadata (category, triggers, webhooks, etc.)

### Rebuild Process

The rebuild process:
1. Clears the existing database
2. Fetches latest n8n-docs repository
3. Extracts source code from all n8n nodes
4. Fetches documentation for each node
5. Generates usage examples
6. Stores everything in SQLite with full-text search

## Example Responses

### IF Node Example

When asking for the IF node, the server returns:

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
          "options": {
            "caseSensitive": true,
            "leftValue": "",
            "typeValidation": "strict",
            "version": 2
          },
          "conditions": [{
            "id": "871274c8-dabf-465a-a6cf-655a1786aa55",
            "leftValue": "={{ $json }}",
            "rightValue": "",
            "operator": {
              "type": "object",
              "operation": "notEmpty",
              "singleValue": true
            }
          }],
          "combinator": "and"
        },
        "options": {}
      },
      "type": "n8n-nodes-base.if",
      "typeVersion": 2.2,
      "position": [220, 120],
      "id": "64b5d49f-ac2e-4456-bfa9-2d6eb9c7a624",
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

## Development

### Running in Development Mode

```bash
# Start with auto-reload
npm run dev

# Run tests
npm test

# Type checking
npm run typecheck
```

### Environment Variables

```env
# Database location
NODE_DB_PATH=/path/to/nodes.db

# Rebuild database on server start
REBUILD_ON_START=true

# Logging
LOG_LEVEL=debug

# Documentation repository location (optional)
DOCS_REPO_PATH=/path/to/n8n-docs
```

## Architecture

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
    └── nodes.db              # SQLite database
```

## Troubleshooting

### Database not found
```bash
npm run db:rebuild
```

### No documentation for some nodes
Some nodes may not have documentation in the n8n-docs repository. The server will still provide source code and generated examples.

### Rebuild takes too long
The initial rebuild processes 500+ nodes and fetches documentation. Subsequent starts use the cached database unless `REBUILD_ON_START=true`.

## License

ISC