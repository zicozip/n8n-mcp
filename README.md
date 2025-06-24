# n8n-MCP

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/czlonkowski/n8n-mcp?style=social)](https://github.com/czlonkowski/n8n-mcp)
[![Version](https://img.shields.io/badge/version-2.4.2-blue.svg)](https://github.com/czlonkowski/n8n-mcp)
[![Docker](https://img.shields.io/badge/docker-ghcr.io%2Fczlonkowski%2Fn8n--mcp-green.svg)](https://github.com/czlonkowski/n8n-mcp/pkgs/container/n8n-mcp)

A Model Context Protocol (MCP) server that provides AI assistants with comprehensive access to n8n node documentation, properties, and operations. Deploy in minutes to give Claude and other AI assistants deep knowledge about n8n's 525+ workflow automation nodes.

## Overview

n8n-MCP serves as a bridge between n8n's workflow automation platform and AI models, enabling them to understand and work with n8n nodes effectively. It provides structured access to:

- 📚 **525 n8n nodes** from both n8n-nodes-base and @n8n/n8n-nodes-langchain
- 🔧 **Node properties** - 99% coverage with detailed schemas
- ⚡ **Node operations** - 63.6% coverage of available actions
- 📄 **Documentation** - 90% coverage from official n8n docs (including AI nodes)
- 🤖 **AI tools** - 263 AI-capable nodes detected with full documentation

## 💬 Why n8n-MCP? A Testimonial from Claude

> *"Before MCP, I was translating. Now I'm composing. And that changes everything about how we can build automation."*

When Claude, Anthropic's AI assistant, tested n8n-MCP, the results were transformative:

**Without MCP:** "I was basically playing a guessing game. 'Is it `scheduleTrigger` or `schedule`? Does it take `interval` or `rule`?' I'd write what seemed logical, but n8n has its own conventions that you can't just intuit. I made six different configuration errors in a simple HackerNews scraper."

**With MCP:** "Everything just... worked. Instead of guessing, I could ask `get_node_essentials()` and get exactly what I needed - not a 100KB JSON dump, but the actual 5-10 properties that matter. What took 45 minutes now takes 3 minutes."

**The Real Value:** "It's about confidence. When you're building automation workflows, uncertainty is expensive. One wrong parameter and your workflow fails at 3 AM. With MCP, I could validate my configuration before deployment. That's not just time saved - that's peace of mind."

[Read the full interview →](docs/CLAUDE_INTERVIEW.md)

## 🚀 Quick Start

Get n8n-MCP running in 5 minutes:

### Option 1: Docker (Easiest) 🚀

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed on your system

```bash
# Pull the Docker image (~200MB, no n8n dependencies!)
docker pull ghcr.io/czlonkowski/n8n-mcp:latest
```

> **⚡ Ultra-optimized:** Our Docker image is 87% smaller than typical n8n images because it contains NO n8n dependencies - just the runtime MCP server with a pre-built database!

Add to Claude Desktop config:
```json
{
  "mcpServers": {
    "n8n-mcp": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e", "MCP_MODE=stdio",
        "-e", "LOG_LEVEL=error",
        "-e", "DISABLE_CONSOLE_OUTPUT=true",
        "ghcr.io/czlonkowski/n8n-mcp:latest"
      ]
    }
  }
}
```

**Important:** The `-i` flag is required for MCP stdio communication.

**Configuration file locations:**
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

**Restart Claude Desktop after updating configuration** - That's it! 🎉

### Option 2: Local Installation

**Prerequisites:** [Node.js](https://nodejs.org/) installed on your system

```bash
# 1. Clone and setup
git clone https://github.com/czlonkowski/n8n-mcp.git
cd n8n-mcp
npm install
npm run build
npm run rebuild

# 2. Test it works
npm start
```

Add to Claude Desktop config:
```json
{
  "mcpServers": {
    "n8n-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/n8n-mcp/dist/mcp/index.js"]
    }
  }
}
```


## Features

- **🔍 Smart Node Search**: Find nodes by name, category, or functionality
- **📖 Essential Properties**: Get only the 10-20 properties that matter (NEW in v2.4.0)
- **🎯 Task Templates**: Pre-configured settings for common automation tasks
- **✅ Config Validation**: Validate node configurations before deployment
- **🔗 Dependency Analysis**: Understand property relationships and conditions
- **💡 Working Examples**: Real-world examples for immediate use
- **⚡ Fast Response**: Average query time ~12ms with optimized SQLite
- **🌐 Universal Compatibility**: Works with any Node.js version

## 📡 Available MCP Tools

Once connected, Claude can use these powerful tools:

### Core Tools
- **`start_here_workflow_guide`** - Essential guide and best practices (START HERE!)
- **`list_nodes`** - List all n8n nodes with filtering options
- **`get_node_info`** - Get comprehensive information about a specific node
- **`get_node_essentials`** - Get only essential properties with examples (10-20 properties instead of 200+)
- **`search_nodes`** - Full-text search across all node documentation
- **`search_node_properties`** - Find specific properties within nodes
- **`list_ai_tools`** - List all AI-capable nodes

### Advanced Tools
- **`get_node_for_task`** - Pre-configured node settings for common tasks
- **`list_tasks`** - Discover available task templates
- **`validate_node_operation`** - Validate node configurations (operation-aware, 80% fewer false positives)
- **`get_property_dependencies`** - Analyze property visibility conditions
- **`get_node_documentation`** - Get parsed documentation from n8n-docs
- **`get_database_statistics`** - View database metrics and coverage

### Example Usage

```typescript
// Get essentials for quick configuration
get_node_essentials("nodes-base.httpRequest")

// Find nodes for a specific task
search_nodes({ query: "send email gmail" })

// Get pre-configured settings
get_node_for_task("send_email")

// Validate before deployment
validate_node_operation({
  nodeType: "nodes-base.httpRequest",
  config: { method: "POST", url: "..." }
})
```

## 🔧 Claude Desktop Configuration

### Option 1: Docker (Recommended)
See Quick Start above for the simplest setup.

### Option 2: Local Installation
If you prefer running locally:

**Prerequisites:** [Node.js](https://nodejs.org/) installed on your system (any version)

```json
{
  "mcpServers": {
    "n8n-mcp": {
      "command": "node",
      "args": ["/path/to/n8n-mcp/dist/mcp/index.js"],
      "env": {
        "NODE_ENV": "production",
        "LOG_LEVEL": "error",
        "MCP_MODE": "stdio",
        "DISABLE_CONSOLE_OUTPUT": "true"
      }
    }
  }
}
```

### Option 3: Remote Server (Beta)
⚠️ **Note**: HTTP mode is under development and not thoroughly tested. Use with caution.

For team deployments:

**Prerequisites:** [Node.js](https://nodejs.org/) 18+ installed locally (for mcp-http-client)

```json
{
  "mcpServers": {
    "n8n-remote": {
      "command": "node",
      "args": [
        "/path/to/n8n-mcp/scripts/mcp-http-client.js",
        "http://your-server.com:3000/mcp"
      ],
      "env": {
        "MCP_AUTH_TOKEN": "your-auth-token"
      }
    }
  }
}
```

**Configuration file locations:**
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

## 💻 Local Development Setup

For contributors and advanced users:

**Prerequisites:**
- [Node.js](https://nodejs.org/) (any version - automatic fallback if needed)
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

### Development Commands

```bash
# Build & Test
npm run build          # Build TypeScript
npm run rebuild        # Rebuild node database
npm run test-nodes     # Test critical nodes
npm run validate       # Validate node data
npm test               # Run all tests

# Update Dependencies
npm run update:n8n:check  # Check for n8n updates
npm run update:n8n        # Update n8n packages

# Run Server
npm run dev            # Development with auto-reload
npm run dev:http       # HTTP dev mode
```

## 🚀 Production Deployment

### HTTP Server for Teams (Beta)

⚠️ **Note**: HTTP mode is under development and not thoroughly tested. Use with caution in production.

Deploy n8n-MCP as a shared service:

```bash
# Using Docker
docker run -d \
  --name n8n-mcp \
  --restart unless-stopped \
  -e MCP_MODE=http \
  -e USE_FIXED_HTTP=true \
  -e AUTH_TOKEN=$AUTH_TOKEN \
  -p 3000:3000 \
  ghcr.io/czlonkowski/n8n-mcp:latest

# Using Docker Compose
cat > docker-compose.yml << 'EOF'
services:
  n8n-mcp:
    image: ghcr.io/czlonkowski/n8n-mcp:latest
    container_name: n8n-mcp
    ports:
      - "3000:3000"
    environment:
      - MCP_MODE=http
      - USE_FIXED_HTTP=true
      - AUTH_TOKEN=${AUTH_TOKEN}
    volumes:
      - n8n-mcp-data:/app/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  n8n-mcp-data:
EOF

docker compose up -d
```

See [HTTP Deployment Guide](./docs/HTTP_DEPLOYMENT.md) for detailed instructions.

## 📚 Documentation

### Setup Guides
- [Quick Start Guide](./docs/QUICKSTART.md) - Get running in 5 minutes
- [Claude Desktop Setup](./docs/CLAUDE_DESKTOP_SETUP.md) - Detailed Claude configuration
- [Docker Guide](./docs/DOCKER_README.md) - Advanced Docker deployment options

### Usage & Best Practices
- [Claude's Interview](./docs/CLAUDE_INTERVIEW.md) - Real-world impact of n8n-MCP
- [Claude Project Instructions](#claude-project-setup) - Optimal system instructions for n8n workflows
- [MCP Tools Reference](./docs/TOOLS_REFERENCE.md) - Detailed tool documentation

### Technical Documentation
- [Architecture Overview](./docs/ARCHITECTURE.md) - System design and components
- [HTTP Deployment (Beta)](./docs/HTTP_DEPLOYMENT.md) - Remote server setup
- [Development Guide](./docs/DEVELOPMENT.md) - Contributing and local development

### Troubleshooting
- [Common Issues](./docs/TROUBLESHOOTING.md) - Solutions to frequent problems
- [FAQ](./docs/FAQ.md) - Frequently asked questions

## 📊 Metrics & Coverage

Current database coverage (n8n v1.97.1):

- ✅ **525/525** nodes loaded (100%)
- ✅ **520** nodes with properties (99%)
- ✅ **470** nodes with documentation (90%)
- ✅ **263** AI-capable tools detected
- ✅ **AI Agent & LangChain nodes** fully documented
- ⚡ **Average response time**: ~12ms
- 💾 **Database size**: ~15MB (optimized)

## 🔄 Recent Updates

### v2.4.2 - Enhanced Validation System
- ✅ **NEW**: `validate_node_operation` - Operation-aware validation with 80% fewer false positives
- ✅ **IMPROVED**: Deduplicates errors, filters internal properties
- ✅ **ADDED**: Basic code syntax validation for JavaScript/Python
- ✅ **FIXED**: Removed deprecated `validate_node_config` tool

### v2.4.0 - AI-Optimized Tools & MIT License
- ✅ **NEW**: `get_node_essentials` - 95% smaller responses
- ✅ **NEW**: Task templates for common automations
- ✅ **NEW**: Configuration validation
- ✅ Fixed missing AI/LangChain documentation
- ✅ Changed to MIT License for wider adoption

### v2.3.3 - Automated Updates
- ✅ Weekly automated n8n dependency updates
- ✅ GitHub Actions workflow
- ✅ AI-capable nodes: 35 → 263

### v2.3.0 - Universal Compatibility
- ✅ Works with ANY Node.js version
- ✅ Automatic database adapter fallback
- ✅ No manual configuration needed

See [CHANGELOG.md](./docs/CHANGELOG.md) for full version history.

## 📦 License

MIT License - see [LICENSE](LICENSE) for details.

**Attribution appreciated!** If you use n8n-MCP, consider:
- ⭐ Starring this repository
- 💬 Mentioning it in your project
- 🔗 Linking back to this repo

## 🤖 Claude Project Setup

For the best results when using n8n-MCP with Claude Projects, use these system instructions:

```markdown
You are an expert in n8n automation software. Your role is to answer questions about how to deliver specific functionalities that users ask for, or design and implement single nodes or entire workflows.

## Instructions

1. Read the user's question and analyze what functionality they're trying to achieve.

2. **ALWAYS** use the n8n-MCP tools in this order:
   - `start_here_workflow_guide` - Get best practices and common patterns
   - `search_nodes` - Find relevant nodes for the task
   - `get_node_essentials` - Get essential configuration (prefer over get_node_info)
   - `get_node_documentation` - Read full documentation before implementing

3. First, check if standard n8n nodes can achieve the functionality. If so, propose these nodes and explain their configuration.

4. If standard nodes aren't sufficient, propose a Code node:
   - Explain why it's necessary
   - Plan the solution architecture carefully
   - Use JavaScript syntax required by n8n's Code node
   - Access input data with `$input.all()` or `items[0].json`
   - Return data in n8n's expected format

5. Structure your answer as:
   a. Brief explanation of the solution
   b. List of nodes and their configuration
   c. Code examples if using Code node
   d. Additional tips or considerations
   e. **Single node JSON** if requested - provide copyable node JSON
   f. **Full workflow JSON** if requested - provide complete workflow JSON

## Important Rules

- ALWAYS check node documentation via MCP before implementing
- Use `get_node_essentials` instead of `get_node_info` for faster responses
- Validate configurations with `validate_node_operation` before finalizing
- State clearly if you're unsure about any aspect
- Provide practical, working solutions that users can immediately use in n8n

## Example Workflow

1. User asks: "How do I send Slack messages when a Google Sheet updates?"
2. Use `search_nodes({ query: "slack" })` and `search_nodes({ query: "google sheets" })`
3. Use `get_node_essentials("nodes-base.googleSheetsTrigger")`
4. Use `get_node_essentials("nodes-base.slack")`
5. Read documentation for both nodes
6. Provide complete workflow with proper configuration
```

Save these instructions in your Claude Project for optimal n8n workflow assistance.

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

---

<div align="center">
  <strong>Built with ❤️ for the n8n community</strong><br>
  <sub>Making AI + n8n workflow creation delightful</sub>
</div>