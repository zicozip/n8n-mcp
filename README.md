# n8n-MCP

A Model Context Protocol (MCP) server that provides AI assistants with comprehensive access to n8n node documentation, properties, and operations.

## Overview

n8n-MCP serves as a bridge between n8n's workflow automation platform and AI models, enabling them to understand and work with n8n nodes effectively. It provides structured access to:

- 📚 **458 n8n nodes** from both n8n-nodes-base and @n8n/n8n-nodes-langchain
- 🔧 **Node properties** - 98.7% coverage with detailed schemas
- ⚡ **Node operations** - 57.9% coverage of available actions
- 📄 **Documentation** - 88.6% coverage from official n8n docs
- 🤖 **AI tools** - 35 AI-capable nodes detected

## Features

- **Comprehensive Node Information**: Access properties, operations, credentials, and documentation for all n8n nodes
- **AI Tool Detection**: Automatically identifies nodes with AI capabilities (usableAsTool)
- **Versioned Node Support**: Handles complex versioned nodes like HTTPRequest and Code
- **Fast Search**: SQLite with FTS5 for instant full-text search across all documentation
- **MCP Protocol**: Standard interface for AI assistants to query n8n knowledge

## Quick Start

### Prerequisites

- Node.js v20.17.0 (required for Claude Desktop compatibility)
- npm or yarn
- Git

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/n8n-mcp.git
cd n8n-mcp
```

2. Clone n8n documentation (required for full documentation coverage):
```bash
git clone https://github.com/n8n-io/n8n-docs.git ../n8n-docs
```

3. Install dependencies:
```bash
npm install
```

4. Build the project:
```bash
npm run build
```

5. Initialize the database:
```bash
npm run rebuild
```

6. Validate the installation:
```bash
npm run test-nodes
```

## Usage

### With Claude Desktop

1. Copy the example configuration:
```bash
cp claude_desktop_config.example.json ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

2. Edit the configuration to point to your installation:
```json
{
  "mcpServers": {
    "n8n-documentation": {
      "command": "/path/to/n8n-mcp/mcp-server-v20.sh",
      "args": []
    }
  }
}
```

3. Make sure the wrapper script is executable:
```bash
chmod +x mcp-server-v20.sh
```

4. Restart Claude Desktop

### Available MCP Tools

- `list_nodes` - List all n8n nodes with filtering options
- `get_node_info` - Get detailed information about a specific node
- `search_nodes` - Full-text search across all node documentation  
- `list_ai_tools` - List all AI-capable nodes
- `get_node_documentation` - Get parsed documentation for a node
- `get_database_statistics` - View database metrics and coverage

### Example Queries

```typescript
// List all trigger nodes
list_nodes({ isTrigger: true })

// Get info about the HTTP Request node
get_node_info({ nodeType: "nodes-base.httpRequest" })

// Search for OAuth-related nodes
search_nodes({ query: "oauth" })

// Find AI-capable tools
list_ai_tools()
```

## Development

### Commands

```bash
npm run build        # Build TypeScript
npm run rebuild      # Rebuild node database
npm run test-nodes   # Test critical nodes
npm run validate     # Validate node data
npm start            # Start MCP server
npm test             # Run tests
npm run typecheck    # Check TypeScript types
```

### Architecture

```
src/
├── loaders/           # Node package loaders
├── parsers/           # Node metadata parsers
├── mappers/           # Documentation mappers
├── database/          # SQLite repository
├── scripts/           # Build and test scripts
└── mcp/              # MCP server implementation
```

### Node.js Version Management

For development with different Node versions:

1. Install nvm (Node Version Manager)
2. Install Node v20.17.0: `nvm install 20.17.0`
3. Use the wrapper script: `./mcp-server-v20.sh`

## Metrics

Current implementation achieves:

- ✅ 458/458 nodes loaded (100%)
- ✅ 452 nodes with properties (98.7%)
- ✅ 265 nodes with operations (57.9%)
- ✅ 406 nodes with documentation (88.6%)
- ✅ 35 AI-capable tools detected
- ✅ All critical nodes validated

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and validation
5. Submit a pull request

## License

This project uses the Sustainable Use License. See LICENSE file for details.

Copyright (c) 2024 AiAdvisors Romuald Czlonkowski

## Acknowledgments

- n8n team for the excellent workflow automation platform
- Anthropic for the Model Context Protocol specification