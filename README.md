# n8n-MCP Integration

Complete integration between n8n workflow automation and Model Context Protocol (MCP), enabling bidirectional communication between n8n workflows and AI assistants.

## Overview

This project provides two main components:
1. **MCP Server**: Allows AI assistants (like Claude) to interact with n8n workflows, execute them, and explore n8n nodes
2. **n8n Custom Node**: Enables n8n workflows to connect to and use MCP servers

**Important**: The MCP server uses stdio transport and is designed to be invoked by AI assistants like Claude Desktop. It's not a standalone HTTP server but rather a tool that AI assistants can call directly.

## Features

- **Bidirectional Integration**: n8n workflows can call MCP tools, and MCP servers can execute n8n workflows
- **Node Source Extraction**: Extract and search source code from any n8n node, including AI Agent nodes
- **SQLite Database**: Full-text search for n8n node documentation and source code (500+ nodes indexed)
- **Production Ready**: Docker-based deployment with persistent storage
- **Comprehensive MCP Tools**: 12+ tools for workflow management, node exploration, and database search
- **Custom n8n Node**: Connect to any MCP server from n8n workflows
- **Auto-indexing**: Automatically builds a searchable database of all n8n nodes on first run

## Prerequisites

- Node.js 18+
- Docker and Docker Compose (for production deployment)
- n8n instance with API access enabled
- (Optional) Claude Desktop for MCP integration

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/n8n-mcp.git
cd n8n-mcp

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
# Edit .env with your n8n credentials

# Build the project
npm run build

# Initialize the database
npm run db:init

# (Optional) Rebuild database with all nodes
npm run db:rebuild
```

### Development

```bash
# Run tests
npm test

# Start development server
npm run dev

# Type checking
npm run typecheck
```

### Production Deployment

```bash
# Use the automated deployment script
./scripts/deploy-production.sh

# Or manually with Docker Compose
docker compose -f docker-compose.prod.yml up -d
```

See [Production Deployment Guide](docs/PRODUCTION_DEPLOYMENT.md) for detailed instructions.

## Configuration

Environment variables (`.env` file):

```env
# n8n Configuration
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=your-password
N8N_HOST=localhost
N8N_API_KEY=your-api-key

# Database
NODE_DB_PATH=/app/data/nodes.db

# Logging
LOG_LEVEL=info
```

## Usage

### Using the MCP Server with Claude

Add the server to your Claude configuration:

```json
{
  "mcpServers": {
    "n8n": {
      "command": "node",
      "args": ["/path/to/n8n-mcp/dist/index.js"],
      "env": {
        "N8N_API_URL": "http://localhost:5678",
        "N8N_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Available MCP Tools

#### Workflow Management
- `execute_workflow` - Execute an n8n workflow by ID
- `list_workflows` - List all workflows with filtering options
- `get_workflow` - Get detailed workflow information
- `create_workflow` - Create new workflows programmatically
- `update_workflow` - Update existing workflows
- `delete_workflow` - Delete workflows
- `get_executions` - Get workflow execution history
- `get_execution_data` - Get detailed execution data

#### Node Exploration & Search
- `list_available_nodes` - List all available n8n nodes
- `get_node_source_code` - Extract source code of any n8n node
- `search_nodes` - Search nodes by name or content using full-text search
- `extract_all_nodes` - Extract and index all nodes to database
- `get_node_statistics` - Get database statistics (total nodes, packages, etc.)

### Using the n8n MCP Node

1. Install the node in n8n:
   ```bash
   # Copy to n8n custom nodes directory
   cp -r dist/n8n/* ~/.n8n/custom/
   # Or use the install script
   ./scripts/install-n8n-node.sh
   ```
2. Restart n8n
3. The MCP node will appear in the nodes panel
4. Configure with your MCP server credentials
5. Select operations: Call Tool, List Tools, Read Resource, etc.

### Example n8n Workflow

```json
{
  "name": "MCP AI Assistant",
  "nodes": [
    {
      "name": "MCP",
      "type": "mcp",
      "parameters": {
        "operation": "callTool",
        "toolName": "generate_text",
        "toolArguments": "{\"prompt\": \"Write a summary\"}"
      }
    }
  ]
}
```

## Architecture

### Components

1. **MCP Server** (`src/mcp/`): Exposes n8n operations as MCP tools
2. **n8n Custom Node** (`src/n8n/`): Allows n8n to connect to MCP servers
3. **SQLite Storage** (`src/services/`): Persistent storage with full-text search
4. **Bridge Layer** (`src/utils/`): Converts between n8n and MCP formats

### Database Management

The SQLite database stores n8n node documentation and source code with full-text search capabilities:

```bash
# Initialize empty database
npm run db:init

# Rebuild the entire database (indexes all nodes)
npm run db:rebuild

# In production
./scripts/manage-production.sh rebuild-db

# View statistics
./scripts/manage-production.sh db-stats
```

#### Search Examples

```javascript
// Search for nodes by name
await mcp.callTool('search_nodes', { query: 'webhook' })

// Search in specific package
await mcp.callTool('search_nodes', { 
  query: 'http',
  packageName: 'n8n-nodes-base'
})

// Get database statistics
await mcp.callTool('get_node_statistics', {})
```

## Testing

### Run All Tests
```bash
npm test
```

### Test Specific Features
```bash
# Test node extraction
node tests/test-mcp-extraction.js

# Test database search
node tests/test-sqlite-search.js

# Test AI Agent extraction
./scripts/test-ai-agent-extraction.sh
```

## API Reference

### MCP Tools

#### execute_workflow
Execute an n8n workflow by ID.

Parameters:
- `workflowId` (string, required): The workflow ID
- `data` (object, optional): Input data for the workflow

#### list_workflows
List all available workflows.

Parameters:
- `active` (boolean, optional): Filter by active status
- `tags` (array, optional): Filter by tags

#### get_node_source_code
Extract source code of any n8n node.

Parameters:
- `nodeType` (string, required): The node type identifier (e.g., `n8n-nodes-base.Webhook`)
- `includeCredentials` (boolean, optional): Include credential type definitions if available

#### search_nodes
Search nodes using full-text search in the SQLite database.

Parameters:
- `query` (string, optional): Search term for node names/descriptions
- `packageName` (string, optional): Filter by package name
- `nodeType` (string, optional): Filter by node type pattern
- `hasCredentials` (boolean, optional): Filter nodes with credentials
- `limit` (number, optional): Limit results (default: 20)

#### extract_all_nodes
Extract and index all available nodes to the database.

Parameters:
- `packageFilter` (string, optional): Filter by package name
- `limit` (number, optional): Limit number of nodes to extract

#### get_node_statistics
Get database statistics including total nodes, packages, and size.

No parameters required.

#### list_available_nodes
List all available n8n nodes in the system.

Parameters:
- `category` (string, optional): Filter by category
- `search` (string, optional): Search term to filter nodes

### MCP Resources

- `workflow://active` - List of active workflows
- `workflow://all` - List of all workflows
- `execution://recent` - Recent execution history
- `credentials://types` - Available credential types
- `nodes://available` - Available n8n nodes
- `nodes://source/{nodeType}` - Source code of specific n8n node

### MCP Prompts

- `create_workflow_prompt` - Generate workflow creation prompts
- `debug_workflow_prompt` - Debug workflow issues
- `optimize_workflow_prompt` - Optimize workflow performance
- `explain_workflow_prompt` - Explain workflow functionality

## Management

Use the management script for production operations:

```bash
# Check status
./scripts/manage-production.sh status

# View logs
./scripts/manage-production.sh logs

# Create backup
./scripts/manage-production.sh backup

# Update services
./scripts/manage-production.sh update
```

## Troubleshooting

### Common Issues

1. **MCP server keeps restarting in Docker**
   - This is expected behavior. The MCP server uses stdio transport and waits for input from AI assistants.
   - For testing, use the development mode or invoke through Claude Desktop.

2. **Database not found**
   - Run `npm run db:init` to create the database
   - Run `npm run db:rebuild` to populate with all nodes

3. **n8n API connection failed**
   - Verify n8n is running and accessible
   - Check API key in `.env` file
   - Ensure n8n API is enabled in settings

4. **Node extraction fails**
   - Ensure Docker volume mounts are correct
   - Check read permissions on node_modules directory

## Documentation

- [Production Deployment Guide](docs/PRODUCTION_DEPLOYMENT.md)
- [AI Agent Extraction Test](docs/AI_AGENT_EXTRACTION_TEST.md)

## Security

- Token-based authentication for n8n API
- Read-only access to node source files
- Isolated Docker containers
- Persistent volume encryption (optional)

## Project Structure

```
n8n-mcp/
├── src/
│   ├── mcp/              # MCP server implementation
│   ├── n8n/              # n8n custom node
│   ├── services/         # SQLite storage service
│   ├── utils/            # Utilities and helpers
│   └── scripts/          # Database management scripts
├── tests/                # Test suite
├── docs/                 # Documentation
├── scripts/              # Deployment and management scripts
└── data/                 # SQLite database (created on init)
```

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Add tests for new features
4. Ensure all tests pass
5. Submit a pull request

## License

ISC License

## Support

- GitHub Issues: [Report bugs or request features](https://github.com/yourusername/n8n-mcp/issues)
- n8n Community: [n8n.io/community](https://community.n8n.io/)
- MCP Documentation: [modelcontextprotocol.io](https://modelcontextprotocol.io/)
