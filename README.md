# n8n-MCP

[![Version](https://img.shields.io/badge/version-2.3.2-blue.svg)](https://github.com/czlonkowski/n8n-mcp)
[![Docker](https://img.shields.io/badge/docker-ghcr.io%2Fczlonkowski%2Fn8n--mcp-green.svg)](https://github.com/czlonkowski/n8n-mcp/pkgs/container/n8n-mcp)
[![License](https://img.shields.io/badge/license-Sustainable%20Use-orange.svg)](LICENSE)

A Model Context Protocol (MCP) server that provides AI assistants with comprehensive access to n8n node documentation, properties, and operations. Deploy locally or remotely to give Claude and other AI assistants deep knowledge about n8n's 450+ workflow automation nodes.

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
- **Remote Deployment Ready**: Production-ready HTTP server for multi-user services
- **Universal Compatibility**: Works with any Node.js version through automatic adapter fallback

## Quick Start

Choose your deployment method:

### 🐳 Docker (Recommended)

```bash
# 1. Create environment file
echo "AUTH_TOKEN=$(openssl rand -base64 32)" > .env
echo "USE_FIXED_HTTP=true" >> .env

# 2. Start the server
docker compose up -d

# 3. Check health
curl http://localhost:3000/health
```

That's it! The server is running and ready for connections.

### 💻 Local Installation

**Prerequisites:**
- Node.js (any version - automatic fallback if needed)
- npm or yarn
- Git

```bash
# 1. Clone the repository
git clone https://github.com/czlonkowski/n8n-mcp.git
cd n8n-mcp

# 2. Clone n8n docs (optional but recommended)
git clone https://github.com/n8n-io/n8n-docs.git ../n8n-docs

# 3. Install and build
npm install
npm run build

# 4. Initialize database
npm run rebuild

# 5. Start the server
npm start          # stdio mode for Claude Desktop
npm run start:http # HTTP mode for remote access
```

## 🔧 Claude Desktop Configuration

### For Local Installation (stdio mode)

**macOS/Linux:**
```json
{
  "mcpServers": {
    "n8n-documentation": {
      "command": "node",
      "args": ["/path/to/n8n-mcp/dist/mcp/index.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

### For Docker (stdio mode)

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

### For Remote Server (HTTP mode)

**Important**: Requires Node.js 18+ on your local machine.

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

Configuration file locations:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

⚠️ **Note**: After editing, restart Claude Desktop to apply changes.

## 🚀 Remote Deployment

### Production HTTP Server

For multi-user services and remote deployments:

```bash
# 1. Set environment variables
export AUTH_TOKEN="your-secure-token-min-32-chars"
export USE_FIXED_HTTP=true
export MCP_MODE=http
export PORT=3000

# 2. Start with Docker
docker run -d \
  --name n8n-mcp \
  --restart unless-stopped \
  -e MCP_MODE=$MCP_MODE \
  -e USE_FIXED_HTTP=$USE_FIXED_HTTP \
  -e AUTH_TOKEN=$AUTH_TOKEN \
  -p $PORT:3000 \
  ghcr.io/czlonkowski/n8n-mcp:latest

# 3. Or use Docker Compose
docker compose up -d
```

### Client Requirements

⚠️ **Important**: Remote connections require:
- Node.js 18+ installed locally (for mcp-remote)
- Or Claude Pro/Team/Enterprise (for native remote MCP support)

See [HTTP Deployment Guide](./docs/HTTP_DEPLOYMENT.md) for detailed instructions.

## 📡 Available MCP Tools

Once connected, Claude can use these tools:

### Tools

- **`list_nodes`** - List all n8n nodes with filtering options
- **`get_node_info`** - Get detailed information about a specific node
- **`search_nodes`** - Full-text search across all node documentation  
- **`list_ai_tools`** - List all AI-capable nodes
- **`get_node_documentation`** - Get parsed documentation for a node
- **`get_database_statistics`** - View database metrics and coverage

### Example Usage

```typescript
// List all trigger nodes
list_nodes({ isTrigger: true })

// Get info about the HTTP Request node
get_node_info({ nodeType: "n8n-nodes-base.httpRequest" })

// Search for OAuth-related nodes
search_nodes({ query: "oauth authentication" })

// Find AI-capable tools
list_ai_tools()

// Get Slack node documentation
get_node_documentation({ nodeType: "n8n-nodes-base.slack" })
```

## 🛠️ Development

### Commands

```bash
# Build & Test
npm run build          # Build TypeScript
npm run rebuild        # Rebuild node database
npm run test-nodes     # Test critical nodes
npm run validate       # Validate node data
npm test               # Run all tests
npm run typecheck      # Check TypeScript types

# Update Dependencies
npm run update:n8n:check  # Check for n8n updates
npm run update:n8n        # Update n8n packages

# Run Server
npm start              # Start in stdio mode
npm run start:http     # Start in HTTP mode
npm run dev            # Development with auto-reload
npm run dev:http       # HTTP dev mode

# Docker
docker compose up -d   # Start with Docker
docker compose logs    # View logs
docker compose down    # Stop containers
```

### Automated Updates

n8n releases weekly. This project includes automated dependency updates:
- **GitHub Actions**: Runs weekly to check and update n8n packages
- **Update Script**: `npm run update:n8n` for manual updates
- **Validation**: All updates are tested before merging

See [Dependency Updates Guide](./docs/DEPENDENCY_UPDATES.md) for details.

### Project Structure

```
n8n-mcp/
├── src/
│   ├── loaders/       # NPM package loaders
│   ├── parsers/       # Node metadata extraction
│   ├── mappers/       # Documentation mapping
│   ├── database/      # SQLite with FTS5
│   ├── scripts/       # Build and maintenance
│   ├── mcp/           # MCP server implementation
│   └── utils/         # Shared utilities
├── data/              # SQLite database
├── docs/              # Documentation
└── docker-compose.yml # Docker configuration
```

## 📊 Metrics & Coverage

Current database coverage:

- ✅ **458/458** nodes loaded (100%)
- ✅ **452** nodes with properties (98.7%)
- ✅ **265** nodes with operations (57.9%)
- ✅ **406** nodes with documentation (88.6%)
- ✅ **35** AI-capable tools detected
- ✅ All critical nodes validated

## 📚 Documentation

- [Installation Guide](./docs/INSTALLATION.md) - Detailed setup instructions
- [Claude Desktop Setup](./docs/README_CLAUDE_SETUP.md) - Configure Claude Desktop
- [HTTP Deployment Guide](./docs/HTTP_DEPLOYMENT.md) - Remote server deployment
- [Docker Guide](./docs/DOCKER_README.md) - Container deployment
- [Troubleshooting](./docs/TROUBLESHOOTING.md) - Common issues and solutions
- [Architecture](./docs/ARCHITECTURE.md) - Technical design details

## 🔄 Recent Updates

### v2.3.2 - HTTP Server Fix
- ✅ Fixed "stream is not readable" error
- ✅ Direct JSON-RPC implementation bypassing transport issues
- ✅ Added `USE_FIXED_HTTP=true` for stable HTTP mode
- ✅ Average response time: ~12ms

### v2.3.0 - Universal Compatibility
- ✅ Automatic database adapter fallback
- ✅ Works with ANY Node.js version
- ✅ No manual configuration needed

See [CHANGELOG.md](./docs/CHANGELOG.md) for full version history.

## 📦 License

This project uses the Sustainable Use License. Key points:
- ✅ Free for internal business and personal use
- ✅ Modifications allowed for own use
- ❌ Cannot host as a service without permission
- ❌ Cannot include in commercial products without permission

See [LICENSE](./LICENSE) for full details.

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Run tests (`npm test`)
4. Submit a pull request

## 👏 Acknowledgments

- [n8n](https://n8n.io) team for the workflow automation platform
- [Anthropic](https://anthropic.com) for the Model Context Protocol
- All contributors and users of this project