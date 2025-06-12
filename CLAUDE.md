# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

n8n-mcp is a comprehensive documentation and knowledge server that provides AI assistants with complete access to n8n node information through the Model Context Protocol (MCP). It serves as a bridge between n8n's workflow automation platform and AI models, enabling them to understand and work with n8n nodes effectively.

## 🚧 ACTIVE REFACTOR IN PROGRESS

**We are currently implementing a major refactor based on IMPLEMENTATION_PLAN.md v2.1 Final**

### Refactor Goals:
- Fix documentation mapping issues (HTTP Request, Code, Webhook nodes)
- Add support for @n8n/n8n-nodes-langchain package
- Simplify architecture to align with n8n's LoadNodesAndCredentials patterns
- Implement proper VersionedNodeType handling
- Add AI tool detection (usableAsTool flag)

### New Architecture (In Progress):
```
src/
├── loaders/
│   └── node-loader.ts         # Simple npm package loader
├── parsers/
│   └── simple-parser.ts       # Single parser for all nodes
├── mappers/
│   └── docs-mapper.ts         # Deterministic documentation mapping
├── scripts/
│   ├── rebuild.ts             # One-command rebuild
│   └── validate.ts            # Validation script
└── mcp/
    └── server.ts              # Enhanced MCP server
```

### Timeline:
- Week 1: Core implementation (loaders, parsers, mappers)
- Week 2: Testing, validation, and MCP updates

See IMPLEMENTATION_PLAN.md for complete details.

## Key Commands

```bash
# Development
npm install          # Install dependencies
npm run build        # Build TypeScript (required before running)
npm run dev          # Run in development mode with auto-reload
npm test             # Run Jest tests
npm run typecheck    # TypeScript type checking
npm run lint         # Check TypeScript types (alias for typecheck)

# NEW Commands (After Refactor):
npm run rebuild      # Rebuild node database with new architecture
npm run validate     # Validate critical nodes (HTTP Request, Code, Slack, AI Agent)

# Database Management (Current - being replaced)
npm run db:rebuild   # Rebuild the node database (run after build)
npm run db:init      # Initialize empty database
npm run docs:rebuild # Rebuild documentation from TypeScript source

# Production
npm start            # Run built application
```

## High-Level Architecture

The project implements MCP (Model Context Protocol) to expose n8n node documentation, source code, and examples to AI assistants. Key architectural components:

### Core Services
- **NodeDocumentationService** (`src/services/node-documentation-service.ts`): Main database service using SQLite with FTS5 for fast searching
- **MCP Server** (`src/mcp/server.ts`): Implements MCP protocol with tools for querying n8n nodes
- **Node Source Extractor** (`src/utils/node-source-extractor.ts`): Extracts node implementations from n8n packages
- **Enhanced Documentation Fetcher** (`src/utils/enhanced-documentation-fetcher.ts`): Fetches and parses official n8n documentation

### MCP Tools Available
- `list_nodes` - List all available n8n nodes with filtering
- `get_node_info` - Get comprehensive information about a specific node
- `search_nodes` - Full-text search across all node documentation
- `get_node_example` - Generate example workflows for nodes
- `get_node_source_code` - Extract complete node source code
- `get_node_documentation` - Get parsed documentation from n8n-docs
- `rebuild_database` - Rebuild the entire node database
- `get_database_statistics` - Get database usage statistics

### Database Structure
Uses SQLite with enhanced schema:
- **nodes** table: Core node information with FTS5 indexing
- **node_documentation**: Parsed markdown documentation
- **node_examples**: Generated workflow examples
- **node_source_code**: Complete TypeScript/JavaScript implementations

## Important Development Notes

### Initial Setup Requirements

#### Current Setup:
1. **Build First**: Always run `npm run build` before any other commands
2. **Database Initialization**: Run `npm run db:rebuild` after building to populate the node database
3. **Documentation Fetching**: The rebuild process clones n8n-docs repository temporarily

#### New Setup (After Refactor):
1. **Clone n8n-docs**: `git clone https://github.com/n8n-io/n8n-docs.git ../n8n-docs`
2. **Build**: `npm run build`
3. **Rebuild Database**: `npm run rebuild`
4. **Validate**: `npm run validate`

### Current Implementation Status
The existing implementation has several gaps that the active refactor addresses:
- ✅ Documentation mapping issues → Being fixed with KNOWN_FIXES mapping
- ✅ Limited to n8n-nodes-base → Adding @n8n/n8n-nodes-langchain support
- ⏳ Incomplete property schemas → Keeping n8n's structure as-is (MVP approach)
- ⏳ No version tracking → Only tracking current version (deferred post-MVP)
- ⏳ Generic examples → Using actual n8n-docs examples (deferred enhancement)

### Testing Workflow
```bash
npm run build        # Always build first
npm test             # Run all tests
npm run typecheck    # Verify TypeScript types
```

### Docker Development
```bash
# Local development with stdio
docker-compose -f docker-compose.local.yml up

# HTTP server mode
docker-compose -f docker-compose.http.yml up
```

### Authentication (HTTP mode)
When running in HTTP mode, use Bearer token authentication:
```
Authorization: Bearer your-auth-token
```

## Architecture Patterns

### Service Layer Pattern
All major functionality is implemented as services in `src/services/`. When adding new features:
1. Create a service class with clear responsibilities
2. Use dependency injection where appropriate
3. Implement proper error handling with custom error types
4. Add comprehensive logging using the logger utility

### MCP Tool Implementation
When adding new MCP tools:
1. Define the tool in `src/mcp/tools.ts`
2. Implement handler in `src/mcp/server.ts`
3. Add proper input validation
4. Return structured responses matching MCP expectations

### Database Access Pattern
- Use prepared statements for all queries
- Implement proper transaction handling
- Use FTS5 for text searching
- Cache frequently accessed data in memory

## Environment Configuration

Required environment variables (see `.env.example`):
```
# Server Configuration
NODE_ENV=development
PORT=3000
AUTH_TOKEN=your-secure-token

# MCP Configuration  
MCP_SERVER_NAME=n8n-documentation-mcp
MCP_SERVER_VERSION=1.0.0

# Logging
LOG_LEVEL=info
```

## License Note

This project uses the Sustainable Use License. Key points:
- ✅ Free for internal business and personal use
- ✅ Modifications allowed for own use
- ❌ Cannot host as a service without permission
- ❌ Cannot include in commercial products without permission