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

- Node.js (any version - automatic fallback to pure JavaScript if needed)
- npm or yarn
- Git

> **Note**: The project uses an intelligent database adapter that automatically falls back to a pure JavaScript implementation (sql.js) if native dependencies fail to load. This ensures compatibility with any Node.js version, including Claude Desktop's bundled runtime.

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

1. Edit your Claude Desktop configuration:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - Linux: `~/.config/Claude/claude_desktop_config.json`

2. Add the n8n-documentation server:
```json
{
  "mcpServers": {
    "n8n-documentation": {
      "command": "node",
      "args": [
        "/path/to/n8n-mcp/dist/mcp/index.js"
      ]
    }
  }
}
```

3. Restart Claude Desktop

> **Note**: The Node.js wrapper script (`mcp-server-v20.sh`) is no longer required! The project now automatically handles version mismatches.

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

### Node.js Version Compatibility

The project works with any Node.js version thanks to automatic adapter fallback:

- **Primary**: Uses `better-sqlite3` when compatible (faster)
- **Fallback**: Uses `sql.js` when version mismatch detected (pure JS)
- **Automatic**: No manual configuration needed

## Technical Architecture

### Database Adapter

The project features an intelligent database adapter that ensures compatibility across different Node.js versions:

1. **Primary**: Attempts to use `better-sqlite3` for optimal performance
2. **Fallback**: Automatically switches to `sql.js` (pure JavaScript) if:
   - Native modules fail to load
   - Node.js version mismatch is detected
   - Running in restricted environments (like Claude Desktop)

This dual-adapter approach means:
- ✅ Works with any Node.js version
- ✅ No compilation required in fallback mode
- ✅ Maintains full functionality with either adapter
- ✅ Automatic persistence with sql.js

### Performance Characteristics

- **better-sqlite3**: Native performance, ~10-50x faster
- **sql.js**: Pure JavaScript, ~2-5x slower but still responsive
- Both adapters support the same API for seamless operation

## Metrics

Current implementation achieves:

- ✅ 458/458 nodes loaded (100%)
- ✅ 452 nodes with properties (98.7%)
- ✅ 265 nodes with operations (57.9%)
- ✅ 406 nodes with documentation (88.6%)
- ✅ 35 AI-capable tools detected
- ✅ All critical nodes validated

## Remote Deployment

### HTTP Server Mode

n8n-MCP now supports HTTP mode for remote deployments. This allows you to:
- Host the MCP server on a cloud VPS
- Connect from Claude Desktop using mcp-remote
- Single-user design for private use
- Simple token-based authentication

### Quick Start for HTTP Mode

1. On your server:
```bash
# Set environment variables
export MCP_MODE=http
export AUTH_TOKEN=$(openssl rand -base64 32)

# Start the server
npm run start:http
```

2. On your client, configure Claude Desktop with mcp-remote:
```json
{
  "mcpServers": {
    "n8n-remote": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/mcp-remote@latest",
        "connect",
        "https://your-server.com/mcp"
      ],
      "env": {
        "MCP_AUTH_TOKEN": "your-auth-token"
      }
    }
  }
}
```

For detailed instructions, see [HTTP Deployment Guide](./docs/HTTP_DEPLOYMENT.md).

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