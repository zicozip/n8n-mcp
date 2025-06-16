# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

n8n-mcp is a comprehensive documentation and knowledge server that provides AI assistants with complete access to n8n node information through the Model Context Protocol (MCP). It serves as a bridge between n8n's workflow automation platform and AI models, enabling them to understand and work with n8n nodes effectively.

## ✅ Latest Updates (v2.4.0)

### Update (v2.4.0) - AI-Optimized MCP Tools:
- ✅ **NEW: get_node_essentials tool** - Returns only 10-20 essential properties (95% size reduction)
- ✅ **NEW: search_node_properties tool** - Search for specific properties within nodes
- ✅ **NEW: get_node_for_task tool** - Pre-configured settings for 14 common tasks
- ✅ **NEW: list_tasks tool** - Discover available task templates
- ✅ **NEW: validate_node_config tool** - Validate configurations before use
- ✅ **NEW: get_property_dependencies tool** - Analyze property visibility dependencies
- ✅ Added PropertyFilter service with curated essential properties for 20+ nodes
- ✅ Added ExampleGenerator with working examples for common use cases
- ✅ Added TaskTemplates service with 14 pre-configured tasks
- ✅ Added ConfigValidator service for comprehensive validation
- ✅ Added PropertyDependencies service for dependency analysis
- ✅ Enhanced all property descriptions - 100% coverage
- ✅ Added version information to essentials response
- ✅ Dramatically improved AI agent experience for workflow building
- ✅ Response sizes reduced from 100KB+ to <5KB for common nodes

### Update (v2.3.3) - Automated Dependency Updates & Validation Fixes:
- ✅ Implemented automated n8n dependency update system
- ✅ Created GitHub Actions workflow for weekly updates
- ✅ Fixed validation script to use correct node type format
- ✅ Successfully updated to n8n v1.97.1 with all dependencies in sync
- ✅ All 525 nodes loading correctly with validation passing

### Previous Update (v2.3.2) - Complete MCP HTTP Fix:
- ✅ Fixed "stream is not readable" error by removing body parsing middleware
- ✅ Fixed "Server not initialized" error with direct JSON-RPC implementation
- ✅ Created http-server-fixed.ts that bypasses StreamableHTTPServerTransport issues
- ✅ Full MCP protocol compatibility without transport complications
- ✅ Use `USE_FIXED_HTTP=true` environment variable to enable the fixed server

### Previous Update (v2.3) - Universal Node.js Compatibility:
- ✅ Automatic database adapter fallback system implemented
- ✅ Works with ANY Node.js version (no more v20.17.0 requirement)
- ✅ Seamless fallback from better-sqlite3 to sql.js
- ✅ No manual configuration needed for Claude Desktop
- ✅ Maintains full functionality with either adapter

## ✅ Previous Achievements (v2.2)

**The major refactor has been successfully completed based on IMPLEMENTATION_PLAN.md v2.2**

### Achieved Goals:
- ✅ Fixed property/operation extraction (452/458 nodes have properties)
- ✅ Added AI tool detection (35 AI tools detected)
- ✅ Full support for @n8n/n8n-nodes-langchain package
- ✅ Proper VersionedNodeType handling
- ✅ Fixed documentation mapping issues

### Current Architecture:
```
src/
├── loaders/
│   └── node-loader.ts         # NPM package loader for both packages
├── parsers/
│   ├── node-parser.ts         # Enhanced parser with version support
│   └── property-extractor.ts  # Dedicated property/operation extraction
├── mappers/
│   └── docs-mapper.ts         # Documentation mapping with fixes
├── database/
│   ├── schema.sql             # SQLite schema
│   ├── node-repository.ts     # Data access layer
│   └── database-adapter.ts    # Universal database adapter (NEW in v2.3)
├── services/
│   ├── property-filter.ts     # Filters properties to essentials (NEW in v2.4)
│   ├── example-generator.ts   # Generates working examples (NEW in v2.4)
│   ├── task-templates.ts      # Pre-configured node settings (NEW in v2.4)
│   ├── config-validator.ts    # Configuration validation (NEW in v2.4)
│   └── property-dependencies.ts # Dependency analysis (NEW in v2.4)
├── scripts/
│   ├── rebuild.ts             # Database rebuild with validation
│   ├── validate.ts            # Node validation
│   ├── test-nodes.ts          # Critical node tests
│   └── test-essentials.ts     # Test new essentials tools (NEW in v2.4)
├── mcp/
│   ├── server-update.ts       # MCP server with enhanced tools
│   ├── tools-update.ts        # Tool definitions including new essentials
│   └── index.ts               # Main entry point with mode selection
├── utils/
│   ├── console-manager.ts     # Console output isolation (NEW in v2.3.1)
│   └── logger.ts              # Logging utility with HTTP awareness
├── http-server-single-session.ts  # Single-session HTTP server (NEW in v2.3.1)
├── mcp-engine.ts              # Clean API for service integration (NEW in v2.3.1)
└── index.ts                   # Library exports
```

### Key Metrics:
- 525 nodes successfully loaded (100%) - Updated to n8n v1.97.1
- 520 nodes with properties (99%)
- 334 nodes with operations (63.6%)
- 457 nodes with documentation (87%)
- 263 AI-capable tools detected (major increase)
- All critical nodes pass validation

## Key Commands

```bash
# Development
npm install          # Install dependencies
npm run build        # Build TypeScript (required before running)
npm run dev          # Run in development mode with auto-reload
npm test             # Run Jest tests
npm run typecheck    # TypeScript type checking
npm run lint         # Check TypeScript types (alias for typecheck)

# Core Commands:
npm run rebuild      # Rebuild node database
npm run rebuild:optimized  # Build database with embedded source code
npm run validate     # Validate critical nodes
npm run test-nodes   # Test critical node properties/operations

# Dependency Update Commands:
npm run update:n8n:check  # Check for n8n updates (dry run)
npm run update:n8n        # Update n8n packages to latest versions

# HTTP Server Commands:
npm run start:http   # Start server in HTTP mode
npm run http         # Build and start HTTP server
npm run dev:http     # HTTP server with auto-reload

# Legacy Commands (deprecated):
npm run db:rebuild   # Old rebuild command
npm run db:init      # Initialize empty database
npm run docs:rebuild # Rebuild documentation from TypeScript source

# Production
npm start            # Run built application (stdio mode)
npm run start:http   # Run in HTTP mode for remote access

# Docker Commands:
docker compose up -d        # Start with Docker Compose
docker compose logs -f      # View logs
docker compose down         # Stop containers
docker compose down -v      # Stop and remove volumes
./scripts/test-docker.sh    # Test Docker deployment

```

## Docker Deployment

The project includes optimized Docker support for easy deployment:

### Quick Start with Docker
```bash
# Create .env file with auth token
echo "AUTH_TOKEN=$(openssl rand -base64 32)" > .env

# Start the server
docker compose up -d

# Check health
curl http://localhost:3000/health
```

### Docker Features
- **Optimized image size** (~283MB with pre-built database)
- **Multi-stage builds** for minimal runtime dependencies
- **Dual mode support** (stdio and HTTP) in single image
- **Pre-built database** with all 525 nodes included
- **Non-root user** execution for security
- **Health checks** built into the image
- **Resource limits** configured in compose file

### Docker Images
- `ghcr.io/czlonkowski/n8n-mcp:latest` - Optimized production image
- Multi-architecture support (amd64, arm64)
- ~283MB compressed size

### Docker Development
```bash
# Use override file for development
cp docker-compose.override.yml.example docker-compose.override.yml

# Build and run locally
docker compose up --build

# Run tests
./scripts/test-docker.sh
```

For detailed Docker documentation, see [DOCKER_README.md](./DOCKER_README.md).

## High-Level Architecture

The project implements MCP (Model Context Protocol) to expose n8n node documentation, source code, and examples to AI assistants. Key architectural components:

### Core Services
- **NodeDocumentationService** (`src/services/node-documentation-service.ts`): Main database service using SQLite with FTS5 for fast searching
- **MCP Server** (`src/mcp/server.ts`): Implements MCP protocol with tools for querying n8n nodes
- **Node Source Extractor** (`src/utils/node-source-extractor.ts`): Extracts node implementations from n8n packages
- **Enhanced Documentation Fetcher** (`src/utils/enhanced-documentation-fetcher.ts`): Fetches and parses official n8n documentation

### MCP Tools Available
- `list_nodes` - List all available n8n nodes with filtering
- `get_node_info` - Get comprehensive information about a specific node (properties, operations, credentials)
- `get_node_essentials` - **NEW** Get only essential properties (10-20) with examples (95% smaller)
- `search_nodes` - Full-text search across all node documentation
- `search_node_properties` - **NEW** Search for specific properties within a node
- `get_node_for_task` - **NEW** Get pre-configured node settings for common tasks
- `list_tasks` - **NEW** List all available task templates
- `validate_node_config` - **NEW** Validate node configuration before use
- `get_property_dependencies` - **NEW** Analyze property dependencies and visibility conditions
- `list_ai_tools` - List all AI-capable nodes (usableAsTool: true)
- `get_node_documentation` - Get parsed documentation from n8n-docs
- `get_database_statistics` - Get database usage statistics and metrics

### Database Structure
Uses SQLite with enhanced schema:
- **nodes** table: Core node information with FTS5 indexing
- **node_documentation**: Parsed markdown documentation
- **node_examples**: Generated workflow examples
- **node_source_code**: Complete TypeScript/JavaScript implementations

## Important Development Notes

### Initial Setup Requirements

1. **Clone n8n-docs**: `git clone https://github.com/n8n-io/n8n-docs.git ../n8n-docs`
2. **Install Dependencies**: `npm install`
3. **Build**: `npm run build`
4. **Rebuild Database**: `npm run rebuild`
5. **Validate**: `npm run test-nodes`

### Key Technical Decisions (v2.3)

1. **Database Adapter Implementation**:
   - Created `DatabaseAdapter` interface to abstract database operations
   - Implemented `BetterSQLiteAdapter` and `SQLJSAdapter` classes
   - Used factory pattern in `createDatabaseAdapter()` for automatic selection
   - Added persistence layer for sql.js with debounced saves (100ms)

2. **Compatibility Strategy**:
   - Primary: Try better-sqlite3 first for performance
   - Fallback: Catch native module errors and switch to sql.js
   - Detection: Check for NODE_MODULE_VERSION errors specifically
   - Logging: Clear messages about which adapter is active

3. **Performance Considerations**:
   - better-sqlite3: ~10-50x faster for most operations
   - sql.js: ~2-5x slower but acceptable for this use case
   - Auto-save: 100ms debounce prevents excessive disk writes with sql.js
   - Memory: sql.js uses more memory but manageable for our dataset size

### Node.js Version Compatibility

The project now features automatic database adapter fallback for universal Node.js compatibility:

1. **Primary adapter**: Uses `better-sqlite3` for optimal performance when available
2. **Fallback adapter**: Automatically switches to `sql.js` (pure JavaScript) if:
   - Native modules fail to load
   - Node.js version mismatch detected
   - Running in Claude Desktop or other restricted environments

This means the project works with ANY Node.js version without manual intervention. The adapter selection is automatic and transparent.

### Implementation Status
- ✅ Property/operation extraction for 98.7% of nodes
- ✅ Support for both n8n-nodes-base and @n8n/n8n-nodes-langchain
- ✅ AI tool detection (35 tools with usableAsTool property)
- ✅ Versioned node support (HTTPRequest, Code, etc.)
- ✅ Documentation coverage for 88.6% of nodes
- ⏳ Version history tracking (deferred - only current version)
- ⏳ Workflow examples (deferred - using documentation)

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

### Database Adapter Pattern (NEW in v2.3)
The project uses a database adapter pattern for universal compatibility:
- **Primary adapter**: `better-sqlite3` - Native SQLite bindings for optimal performance
- **Fallback adapter**: `sql.js` - Pure JavaScript implementation for compatibility
- **Automatic selection**: The system detects and handles version mismatches automatically
- **Unified interface**: Both adapters implement the same `DatabaseAdapter` interface
- **Transparent operation**: Application code doesn't need to know which adapter is active

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

## HTTP Remote Deployment (v2.3.0)

### ✅ HTTP Server Implementation Complete

The project now includes a simplified HTTP server mode for remote deployments:
- **Single-user design**: Stateless architecture for private deployments
- **Simple token auth**: Bearer token authentication
- **MCP-compatible**: Works with mcp-remote adapter for Claude Desktop
- **Easy deployment**: Minimal configuration required

### Quick Start
```bash
# Server setup
export MCP_MODE=http
export AUTH_TOKEN=$(openssl rand -base64 32)
npm run start:http

# Client setup (Claude Desktop config)
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

### Available Scripts
- `npm run start:http` - Start in HTTP mode
- `npm run http` - Build and start HTTP server
- `npm run dev:http` - Development mode with auto-reload
- `./scripts/deploy-http.sh` - Deployment helper script

For detailed deployment instructions, see [HTTP Deployment Guide](./docs/HTTP_DEPLOYMENT.md).

## Recent Problem Solutions

### MCP HTTP Server Errors (Solved in v2.3.2)
**Problem**: Two critical errors prevented the HTTP server from working:
1. "stream is not readable" - Express.json() middleware consumed the request stream
2. "Server not initialized" - StreamableHTTPServerTransport initialization issues

**Solution**: Two-phase fix:
1. Removed body parsing middleware to preserve raw stream
2. Created direct JSON-RPC implementation bypassing StreamableHTTPServerTransport

**Technical Details**:
- `src/http-server-single-session.ts` - Single-session implementation (partial fix)
- `src/http-server-fixed.ts` - Direct JSON-RPC implementation (complete fix)
- `src/utils/console-manager.ts` - Console output isolation
- Use `USE_FIXED_HTTP=true` to enable the fixed implementation

### SQLite Version Mismatch (Solved in v2.3)
**Problem**: Claude Desktop bundles Node.js v16.19.1, causing NODE_MODULE_VERSION errors with better-sqlite3 compiled for different versions.

**Solution**: Implemented dual-adapter system:
1. Database adapter abstraction layer
2. Automatic fallback from better-sqlite3 to sql.js
3. Transparent operation regardless of Node.js version
4. No manual configuration required

**Technical Details**:
- `src/database/database-adapter.ts` - Adapter interface and implementations
- `createDatabaseAdapter()` - Factory function with automatic selection
- Modified all database operations to use adapter interface
- Added sql.js with persistence support

### Property Extraction Issues (Solved in v2.2)
**Problem**: Many nodes had empty properties/operations arrays.

**Solution**: Created dedicated `PropertyExtractor` class that handles:
1. Instance-level property extraction
2. Versioned node support
3. Both programmatic and declarative styles
4. Complex nested property structures

### Dependency Update Issues (Solved in v2.3.3)
**Problem**: n8n packages have interdependent version requirements. Updating them independently causes version mismatches.

**Solution**: Implemented smart dependency update system:
1. Check n8n's required dependency versions
2. Update all packages to match n8n's requirements
3. Validate database after updates
4. Fix node type references in validation script

**Technical Details**:
- `scripts/update-n8n-deps.js` - Smart dependency updater
- `.github/workflows/update-n8n-deps.yml` - GitHub Actions automation
- `renovate.json` - Alternative Renovate configuration
- Fixed validation to use 'nodes-base.httpRequest' format instead of 'httpRequest'

### AI-Optimized Tools (NEW in v2.4.0)
**Problem**: get_node_info returns 100KB+ of JSON with 200+ properties, making it nearly impossible for AI agents to efficiently configure nodes.

**Solution**: Created new tools that provide progressive disclosure of information:
1. `get_node_essentials` - Returns only the 10-20 most important properties
2. `search_node_properties` - Find specific properties without downloading everything

**Results**:
- 95% reduction in response size (100KB → 5KB)
- Only essential and commonly-used properties returned
- Includes working examples for immediate use
- AI agents can now configure nodes in seconds instead of minutes

**Technical Implementation**:
- `src/services/property-filter.ts` - Curated essential properties for 20+ nodes
- `src/services/example-generator.ts` - Working examples for common use cases
- Smart property search with relevance scoring
- Automatic fallback for unconfigured nodes

**Usage Recommendation**:
```bash
# OLD approach (avoid):
get_node_info("nodes-base.httpRequest")  # 100KB+ response

# NEW approach (preferred):
get_node_essentials("nodes-base.httpRequest")  # <5KB response with examples
search_node_properties("nodes-base.httpRequest", "auth")  # Find specific options
```