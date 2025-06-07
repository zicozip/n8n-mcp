# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the n8n-mcp repository, a complete integration between n8n (workflow automation tool) and MCP (Model Context Protocol). The project enables bidirectional communication between n8n workflows and AI assistants through MCP.

## Current State

The repository contains a fully implemented integration with:

### Core Components
- **MCP Server** (`src/mcp/server.ts`): Exposes n8n workflows and operations as MCP tools
- **n8n Custom Node** (`src/n8n/MCPNode.node.ts`): Allows n8n workflows to connect to MCP servers
- **Bridge Layer** (`src/utils/bridge.ts`): Converts between n8n and MCP data formats
- **Node Source Extractor** (`src/utils/node-source-extractor.ts`): Extracts n8n node source code

### Available MCP Tools
- `execute_workflow` - Execute an n8n workflow by ID
- `list_workflows` - List all available workflows
- `get_workflow` - Get workflow details
- `create_workflow` - Create new workflows
- `update_workflow` - Update existing workflows
- `delete_workflow` - Delete workflows
- `get_executions` - Get workflow execution history
- `get_execution_data` - Get detailed execution data
- **`get_node_source_code`** - Extract source code of any n8n node (including AI Agent)
- **`list_available_nodes`** - List all available n8n nodes

### Infrastructure
- TypeScript/Node.js project with full build system
- Docker support with multiple compose configurations
- Comprehensive test suite with 100% passing tests
- Authentication and error handling systems

## Development Notes

### Building and Testing
```bash
npm install        # Install dependencies
npm run build      # Build TypeScript
npm test          # Run tests
npm run dev       # Development mode
```

### Testing AI Agent Extraction
The project includes special functionality to extract n8n node source code:
```bash
# Run the AI Agent extraction test
./scripts/test-ai-agent-extraction.sh

# Or test with standalone script
node tests/test-mcp-extraction.js
```

### Docker Operations
```bash
# Development environment
docker-compose -f docker-compose.dev.yml up

# Test environment with AI node extraction
docker-compose -f docker-compose.test.yml up

# Production deployment
docker-compose up
```

## Repository Structure

```
n8n-mcp/
├── src/
│   ├── mcp/          # MCP server implementation
│   │   ├── server.ts
│   │   ├── tools.ts
│   │   ├── resources.ts
│   │   └── prompts.ts
│   ├── n8n/          # n8n node implementation
│   │   ├── MCPNode.node.ts
│   │   └── MCPApi.credentials.ts
│   ├── utils/        # Shared utilities
│   │   ├── bridge.ts
│   │   ├── n8n-client.ts
│   │   ├── mcp-client.ts
│   │   ├── node-source-extractor.ts
│   │   ├── auth.ts
│   │   ├── logger.ts
│   │   └── error-handler.ts
│   └── types/        # TypeScript definitions
├── tests/            # Test files
├── scripts/          # Utility scripts
└── docs/             # Documentation
```

## Key Features Implemented

1. **Bidirectional Integration**
   - n8n workflows can call MCP tools
   - MCP servers can execute n8n workflows

2. **Node Source Extraction**
   - Extract source code of any n8n node
   - Special support for AI Agent node from @n8n/n8n-nodes-langchain
   - Includes credential definitions and package metadata

3. **Comprehensive API**
   - Full CRUD operations on workflows
   - Execution management and history
   - Resource-based access patterns

4. **Security**
   - Token-based authentication
   - Read-only file system access for node extraction
   - Proper error handling and logging

## Important Considerations

### When Adding New Features
1. Update the corresponding tool definitions in `src/mcp/tools.ts`
2. Implement handler methods in `src/mcp/server.ts`
3. Add appropriate error handling
4. Update tests and documentation

### Node Source Extraction Paths
The NodeSourceExtractor searches these paths:
- `/usr/local/lib/node_modules/n8n/node_modules`
- `/app/node_modules`
- `/home/node/.n8n/custom/nodes`
- `./node_modules`

### Testing Considerations
- Always run `npm run build` before testing
- Use `npm run typecheck` to verify TypeScript types
- Docker environments mount n8n's node_modules as read-only volumes

## Current Capabilities

The MCP server can:
- ✅ Execute and manage n8n workflows
- ✅ Extract source code from any n8n node
- ✅ Provide AI assistants with workflow automation capabilities
- ✅ Bridge between n8n's automation and AI decision-making

The n8n node can:
- ✅ Connect to any MCP server
- ✅ Call MCP tools from workflows
- ✅ Read MCP resources
- ✅ Use MCP prompts in automation