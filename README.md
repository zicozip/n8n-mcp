# n8n-mcp

Integration between n8n workflow automation and Model Context Protocol (MCP). This project provides:

- An MCP server that exposes n8n workflows and operations to AI assistants
- A custom n8n node for connecting to MCP servers from within workflows

## Features

- **MCP Server**: Expose n8n workflows as tools, resources, and prompts for AI assistants
- **n8n Node**: Connect to any MCP server from n8n workflows
- **Bidirectional Integration**: Use AI capabilities in n8n and n8n automation in AI contexts
- **Node Source Extraction**: Extract source code from any n8n node, including AI Agent nodes
- **Authentication**: Secure token-based authentication
- **Flexible Transport**: Support for WebSocket and stdio connections

## Quick Start

### Prerequisites

- Node.js 18+ 
- n8n instance with API access enabled
- MCP-compatible AI assistant (Claude, etc.)

### Installation

```bash
# Clone the repository
git clone https://github.com/czlonkowski/n8n-mcp.git
cd n8n-mcp

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Configure your n8n API credentials
# Edit .env with your n8n instance details
```

### Running the MCP Server

```bash
# Build the project
npm run build

# Start the MCP server
npm start
```

For development:
```bash
npm run dev
```

## Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```env
# MCP Server Configuration
MCP_SERVER_PORT=3000
MCP_SERVER_HOST=localhost

# n8n Configuration
N8N_API_URL=http://localhost:5678
N8N_API_KEY=your-n8n-api-key

# Authentication
MCP_AUTH_TOKEN=your-secure-token

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

- `execute_workflow` - Execute an n8n workflow by ID
- `list_workflows` - List all available workflows
- `get_workflow` - Get details of a specific workflow
- `create_workflow` - Create a new workflow
- `update_workflow` - Update an existing workflow
- `delete_workflow` - Delete a workflow
- `get_executions` - Get workflow execution history
- `get_execution_data` - Get detailed execution data
- `get_node_source_code` - Extract source code of any n8n node
- `list_available_nodes` - List all available n8n nodes

### Using the n8n MCP Node

1. Copy the node files to your n8n custom nodes directory
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

### Project Structure

```
n8n-mcp/
├── src/
│   ├── mcp/          # MCP server implementation
│   ├── n8n/          # n8n node implementation
│   ├── utils/        # Shared utilities
│   └── types/        # TypeScript type definitions
├── tests/            # Test files
└── dist/             # Compiled output
```

### Key Components

- **MCP Server**: Handles MCP protocol requests and translates to n8n API calls
- **n8n API Client**: Manages communication with n8n instance
- **Bridge Layer**: Converts between n8n and MCP data formats
- **Authentication**: Validates tokens and manages access control

## Development

### Running Tests

```bash
npm test
```

### Building

```bash
npm run build
```

### Type Checking

```bash
npm run typecheck
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
- `nodeType` (string, required): The node type identifier (e.g., `@n8n/n8n-nodes-langchain.Agent`)
- `includeCredentials` (boolean, optional): Include credential type definitions if available

#### list_available_nodes
List all available n8n nodes in the system.

Parameters:
- `category` (string, optional): Filter by category (e.g., AI, Data Transformation)
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

## Troubleshooting

### Common Issues

1. **Connection refused**: Ensure n8n is running and API is enabled
2. **Authentication failed**: Check your API key in .env
3. **Workflow not found**: Verify workflow ID exists in n8n
4. **MCP connection failed**: Check server is running and accessible

### Debug Mode

Enable debug logging:
```env
LOG_LEVEL=debug
```

## Special Features

### AI Agent Node Extraction

The MCP server can extract source code from n8n nodes, particularly useful for AI Agent nodes:

```bash
# Test AI Agent extraction
./scripts/test-ai-agent-extraction.sh

# Or use the standalone test
node tests/test-mcp-extraction.js
```

This feature allows AI assistants to:
- Understand n8n node implementations
- Generate compatible code
- Debug workflow issues
- Create custom variations

### Docker Volumes for Node Access

When running in Docker, mount n8n's node_modules for source extraction:

```yaml
volumes:
  - n8n_modules:/usr/local/lib/node_modules/n8n/node_modules:ro
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

ISC License - see LICENSE file for details

## Support

- Issues: https://github.com/czlonkowski/n8n-mcp/issues
- n8n Documentation: https://docs.n8n.io
- MCP Specification: https://modelcontextprotocol.io
