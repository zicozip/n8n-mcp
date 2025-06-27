# n8n-MCP

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/czlonkowski/n8n-mcp?style=social)](https://github.com/czlonkowski/n8n-mcp)
[![Version](https://img.shields.io/badge/version-2.7.0-blue.svg)](https://github.com/czlonkowski/n8n-mcp)
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

**Prerequisites:** Docker installed on your system

<details>
<summary><strong>📦 Install Docker</strong> (click to expand)</summary>

**macOS:**
```bash
# Using Homebrew
brew install --cask docker

# Or download from https://www.docker.com/products/docker-desktop/
```

**Linux (Ubuntu/Debian):**
```bash
# Update package index
sudo apt-get update

# Install Docker
sudo apt-get install docker.io

# Start Docker service
sudo systemctl start docker
sudo systemctl enable docker

# Add your user to docker group (optional, to run without sudo)
sudo usermod -aG docker $USER
# Log out and back in for this to take effect
```

**Windows:**
```bash
# Option 1: Using winget (Windows Package Manager)
winget install Docker.DockerDesktop

# Option 2: Using Chocolatey
choco install docker-desktop

# Option 3: Download installer from https://www.docker.com/products/docker-desktop/
```

**Verify installation:**
```bash
docker --version
```
</details>

```bash
# Pull the Docker image (~280MB, no n8n dependencies!)
docker pull ghcr.io/czlonkowski/n8n-mcp:latest
```

> **⚡ Ultra-optimized:** Our Docker image is 82% smaller than typical n8n images because it contains NO n8n dependencies - just the runtime MCP server with a pre-built database!

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

To enable n8n management tools, add these lines before the image name:
```
"-e", "N8N_API_URL=https://your-n8n-instance.com",
"-e", "N8N_API_KEY=your-api-key",
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

# 2. (Optional) Configure n8n API for management tools
cp .env.example .env
# Edit .env to add your N8N_API_URL and N8N_API_KEY

# 3. Test it works
npm start
```

Add to Claude Desktop config:
```json
{
  "mcpServers": {
    "n8n-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/n8n-mcp/dist/mcp/index.js"],
      "env": {
        "MCP_MODE": "stdio",
        "LOG_LEVEL": "error",
        "DISABLE_CONSOLE_OUTPUT": "true"
      }
    }
  }
}
```

**Note:** You can configure n8n API credentials either:
- **Option A:** In a `.env` file (see step 2 above)
- **Option B:** Directly in the Claude config by adding to the `env` section:
  ```json
  "N8N_API_URL": "https://your-n8n-instance.com",
  "N8N_API_KEY": "your-api-key"
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
- **`list_ai_tools`** - List all AI-capable nodes (ANY node can be used as AI tool!)
- **`get_node_as_tool_info`** - Get guidance on using any node as an AI tool

### Advanced Tools
- **`get_node_for_task`** - Pre-configured node settings for common tasks
- **`list_tasks`** - Discover available task templates
- **`validate_node_operation`** - Validate node configurations (operation-aware, profiles support)
- **`validate_node_minimal`** - Quick validation for just required fields
- **`validate_workflow`** - Complete workflow validation including AI tool connections
- **`validate_workflow_connections`** - Check workflow structure and AI tool connections
- **`validate_workflow_expressions`** - Validate n8n expressions including $fromAI()
- **`get_property_dependencies`** - Analyze property visibility conditions
- **`get_node_documentation`** - Get parsed documentation from n8n-docs
- **`get_database_statistics`** - View database metrics and coverage

### n8n Management Tools (NEW! Requires API Configuration)
These tools allow you to manage n8n workflows directly. Configure with `N8N_API_URL` and `N8N_API_KEY`.

#### Workflow Management
- **`n8n_create_workflow`** - Create new workflows with nodes and connections
- **`n8n_get_workflow`** - Get complete workflow by ID
- **`n8n_get_workflow_details`** - Get workflow with execution statistics
- **`n8n_get_workflow_structure`** - Get simplified workflow structure
- **`n8n_get_workflow_minimal`** - Get minimal workflow info (ID, name, active status)
- **`n8n_update_full_workflow`** - Update entire workflow (complete replacement)
- **`n8n_update_partial_workflow`** - Update workflow using diff operations (NEW in v2.7.0!)
- **`n8n_delete_workflow`** - Delete workflows permanently
- **`n8n_list_workflows`** - List workflows with filtering and pagination
- **`n8n_validate_workflow`** - Validate workflows already in n8n by ID (NEW in v2.6.3)

#### Execution Management
- **`n8n_trigger_webhook_workflow`** - Trigger workflows via webhook URL
- **`n8n_get_execution`** - Get execution details by ID
- **`n8n_list_executions`** - List executions with status filtering
- **`n8n_delete_execution`** - Delete execution records

#### System Tools
- **`n8n_health_check`** - Check n8n API connectivity and features
- **`n8n_list_available_tools`** - List all available management tools

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
  config: { method: "POST", url: "..." },
  profile: "runtime" // or "minimal", "ai-friendly", "strict"
})

// Quick required field check
validate_node_minimal({
  nodeType: "nodes-base.slack",
  config: { resource: "message", operation: "send" }
})
```

## 🔧 Claude Desktop Configuration

### Option 1: Docker (Recommended)
See Quick Start above for the simplest setup.

### Option 2: Local Installation
If you prefer running locally:

**Prerequisites:** [Node.js](https://nodejs.org/) installed on your system (any version)

**Method A: Using .env file (recommended for development)**
```bash
# Create .env file from example
cp .env.example .env
# Edit .env to add N8N_API_URL and N8N_API_KEY
```

Then use this config:
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

**Method B: Direct environment variables (simpler)**
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
        "DISABLE_CONSOLE_OUTPUT": "true",
        "N8N_API_URL": "https://your-n8n-instance.com",
        "N8N_API_KEY": "your-api-key"
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
- [Installation Guide](./docs/INSTALLATION.md) - Comprehensive installation instructions
- [Claude Desktop Setup](./docs/README_CLAUDE_SETUP.md) - Detailed Claude configuration
- [Docker Guide](./docs/DOCKER_README.md) - Advanced Docker deployment options

### Usage & Best Practices
- [Claude's Interview](./docs/CLAUDE_INTERVIEW.md) - Real-world impact of n8n-MCP
- [Claude Project Instructions](#claude-project-setup) - Optimal system instructions for n8n workflows
- [MCP Tools List](#-available-mcp-tools) - Complete list of available tools

### Technical Documentation
- [HTTP Deployment (Beta)](./docs/HTTP_DEPLOYMENT.md) - Remote server setup
- [Dependency Updates](./docs/DEPENDENCY_UPDATES.md) - Managing n8n dependencies
- [Validation Improvements](./docs/validation-improvements-v2.4.2.md) - Validation system details

### Troubleshooting
- [Change Log](./docs/CHANGELOG.md) - Version history and updates
- [Docker Fixes](./docs/DOCKER_FIX_IMPLEMENTATION.md) - Docker-specific troubleshooting

## 📊 Metrics & Coverage

Current database coverage (n8n v1.99.1):

- ✅ **525/525** nodes loaded (100%)
- ✅ **520** nodes with properties (99%)
- ✅ **470** nodes with documentation (90%)
- ✅ **263** AI-capable tools detected
- ✅ **AI Agent & LangChain nodes** fully documented
- ⚡ **Average response time**: ~12ms
- 💾 **Database size**: ~15MB (optimized)

## 🔄 Recent Updates

### v2.7.0 - Diff-Based Workflow Editing with Transactional Updates
- ✅ **NEW**: `n8n_update_partial_workflow` tool - Update workflows using diff operations
- ✅ **RENAMED**: `n8n_update_workflow` → `n8n_update_full_workflow` for clarity
- ✅ **80-90% TOKEN SAVINGS**: Only send changes, not entire workflow JSON
- ✅ **13 OPERATIONS**: addNode, removeNode, updateNode, moveNode, enable/disable, connections, settings, tags
- ✅ **TRANSACTIONAL**: Two-pass processing allows adding nodes and connections in any order
- ✅ **5 OPERATION LIMIT**: Ensures reliability and atomic updates
- ✅ **VALIDATION MODE**: Test changes with `validateOnly: true` before applying
- ✅ **IMPROVED DOCS**: Comprehensive parameter documentation and examples

### v2.6.3 - n8n Instance Workflow Validation
- ✅ **NEW**: `n8n_validate_workflow` tool - Validate workflows directly from n8n instance by ID
- ✅ **FETCHES**: Retrieves workflow from n8n API and runs comprehensive validation
- ✅ **CONSISTENT**: Uses same WorkflowValidator for reliability
- ✅ **FLEXIBLE**: Supports all validation profiles and options
- ✅ **INTEGRATED**: Part of complete workflow lifecycle management
- ✅ **SIMPLE**: AI agents need only workflow ID, no JSON required

### v2.6.2 - Enhanced Workflow Creation Validation
- ✅ **NEW**: Node type validation - Verifies node types actually exist in n8n
- ✅ **FIXED**: Critical issue with `nodes-base.webhook` validation - now caught before database lookup
- ✅ **NEW**: Smart suggestions for common mistakes (e.g., `webhook` → `n8n-nodes-base.webhook`)
- ✅ **NEW**: Minimum viable workflow validation - Prevents single-node workflows (except webhooks)
- ✅ **NEW**: Empty connection detection - Catches multi-node workflows with no connections
- ✅ **ENHANCED**: Error messages with clear guidance and examples
- ✅ **PREVENTS**: Broken workflows that show as question marks in n8n UI

### v2.6.1 - Enhanced typeVersion Validation
- ✅ **NEW**: typeVersion validation for all versioned nodes
- ✅ **CATCHES**: Missing typeVersion with correct version suggestions
- ✅ **WARNS**: Outdated node versions in use
- ✅ **PREVENTS**: Invalid versions that exceed maximum supported
- ✅ **HELPS**: AI agents avoid common workflow creation mistakes

### v2.6.0 - n8n Management Tools Integration
- ✅ **NEW**: 14 n8n management tools for complete workflow lifecycle
- ✅ **NEW**: Create, update, execute workflows via API
- ✅ **NEW**: Webhook workflow triggering support
- ✅ **NEW**: Execution monitoring and management
- ✅ **INTEGRATED**: n8n-manager-for-ai-agents functionality
- ✅ **OPTIONAL**: Only enabled when N8N_API_URL and N8N_API_KEY configured

### v2.5.1 - AI Tool Support Enhancement
- ✅ **NEW**: AI tool connection validation in workflows
- ✅ **NEW**: `get_node_as_tool_info` - Guidance for using ANY node as AI tool
- ✅ **ENHANCED**: `get_node_info` now includes aiToolCapabilities section
- ✅ **IMPROVED**: Workflow validation understands ai_tool connections
- ✅ **ADDED**: $fromAI() expression validation for dynamic AI parameters
- ✅ **CLARIFIED**: ANY node can be used as an AI tool, not just usableAsTool nodes

### v2.5.0 - Complete Workflow Validation
- ✅ **NEW**: `validate_workflow` - Validate entire workflows before deployment
- ✅ **NEW**: `validate_workflow_connections` - Check workflow structure
- ✅ **NEW**: `validate_workflow_expressions` - Validate n8n expressions
- ✅ **NEW**: Cycle detection for workflows
- ✅ **NEW**: Expression syntax validation

### v2.4.2 - Professional Validation System
- ✅ **NEW**: `validate_node_operation` - Operation-aware validation with 80% fewer false positives
- ✅ **NEW**: `validate_node_minimal` - Lightning-fast required field checking
- ✅ **NEW**: Validation profiles - Choose between minimal, runtime, ai-friendly, or strict
- ✅ **NEW**: Node validators for Webhook, Postgres, MySQL with SQL safety checks
- ✅ **IMPROVED**: Deduplicates errors, filters internal properties
- ✅ **ADDED**: Basic code syntax validation for JavaScript/Python
- ✅ **ADDED**: SQL injection detection and unsafe query warnings
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

## Core Workflow Process

1. **ALWAYS start with**: `start_here_workflow_guide()` to understand best practices and available tools.

2. **Discovery Phase** - Find the right nodes:
   - `search_nodes({query: 'keyword'})` - Search by functionality
   - `list_nodes({category: 'trigger'})` - Browse by category
   - `list_ai_tools()` - See AI-optimized nodes (but remember: ANY node can be an AI tool!)

3. **Configuration Phase** - Get node details efficiently:
   - `get_node_essentials(nodeType)` - Start here! Only 10-20 essential properties
   - `search_node_properties(nodeType, 'auth')` - Find specific properties
   - `get_node_for_task('send_email')` - Get pre-configured templates
   - `get_node_documentation(nodeType)` - Human-readable docs when needed

4. **Validation Phase** - Ensure correctness:
   - `validate_node_minimal(nodeType, config)` - Quick required fields check
   - `validate_node_operation(nodeType, config, profile)` - Full smart validation
   - `validate_workflow(workflow)` - Complete workflow validation including AI connections
   - `n8n_validate_workflow({id: 'workflow-id'})` - Validate workflows already in n8n (NEW!)

5. **AI Tool Integration** (when building AI workflows):
   - `get_node_as_tool_info(nodeType)` - Learn how to use ANY node as AI tool
   - Remember: Connect ANY node to AI Agent's 'ai_tool' port
   - Use `$fromAI()` expressions for dynamic values
   - Validate with `validate_workflow()` to check ai_tool connections

## Key Insights

- **ANY node can be an AI tool** - not just those with usableAsTool=true
- **Use validate_node_minimal first** - fastest way to check required fields
- **Avoid get_node_info** - returns 100KB+ of data; use get_node_essentials instead
- **Pre-built templates exist** - check get_node_for_task() for common scenarios
- **Validate existing workflows** - use n8n_validate_workflow() to check workflows in n8n

## Response Structure

1. **Analysis**: Brief explanation of the solution approach
2. **Node Selection**: Which nodes to use and why
3. **Configuration**: 
   - Use get_node_essentials for clean configs
   - Show only necessary properties
   - Include validation results
4. **Code Examples**: If using Code node, provide working JavaScript
5. **Validation**: Always validate before providing final solution
6. **Export Options**:
   - Single node JSON if requested
   - Complete workflow JSON for full solutions

## Example Patterns

### Standard Automation
1. search_nodes({query: 'slack'})
2. get_node_essentials('nodes-base.slack')
3. validate_node_minimal('nodes-base.slack', {resource:'message',operation:'post'})
4. get_node_for_task('send_slack_message') // for pre-configured version

### AI Agent with Tools
1. search_nodes({query: 'agent'})
2. get_node_as_tool_info('nodes-base.googleSheets') // ANY node as tool!
3. Configure AI Agent with tool connections
4. Use $fromAI() in tool node configurations
5. validate_workflow(fullWorkflow) // validates ai_tool connections

### Quick Task Solutions
1. list_tasks() // see all available templates
2. get_node_for_task('webhook_with_response')
3. validate_node_minimal() on the configuration
4. Provide ready-to-use solution

### n8n Workflow Management (if API configured)
1. n8n_list_workflows() // see existing workflows
2. n8n_get_workflow({id: 'workflow-id'}) // fetch specific workflow
3. n8n_validate_workflow({id: 'workflow-id'}) // validate existing workflow
4. n8n_update_partial_workflow() // NEW! Update using diff operations (v2.7.0)
5. n8n_update_full_workflow() // Replace entire workflow
6. n8n_trigger_webhook_workflow() // execute via webhook

## Important Rules

- Start with essentials, not full node info
- Validate incrementally (minimal → operation → workflow)
- For AI workflows, explain that ANY node can be a tool
- Always provide working, validated configurations
- State uncertainty clearly and suggest alternatives
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