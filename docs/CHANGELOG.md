# Changelog

All notable changes to this project will be documented in this file.

## [2.3.2] - 2025-06-14

### Fixed
- **HTTP Server Stream Error**: Complete fix for "stream is not readable" error
  - Removed Express body parsing middleware that was consuming request streams
  - Fixed "Server not initialized" error with direct JSON-RPC implementation
  - Added `USE_FIXED_HTTP=true` environment variable for stable HTTP mode
  - Bypassed problematic StreamableHTTPServerTransport implementation
- HTTP server now works reliably with average response time of ~12ms
- Updated all HTTP server implementations to preserve raw streams

### Added
- `http-server-fixed.ts` - Direct JSON-RPC implementation
- `ConsoleManager` utility for stream isolation
- `MCP Engine` interface for service integration
- Comprehensive documentation for HTTP server fixes

### Changed
- Default HTTP mode now uses fixed implementation when `USE_FIXED_HTTP=true`
- Updated Docker configuration to use fixed implementation by default
- Improved error handling and logging in HTTP mode

## [2.3.1] - 2025-06-14

### Added
- **Single-Session Architecture**: Initial attempt to fix HTTP server issues
  - Implemented session reuse across requests
  - Added console output isolation
  - Created engine interface for service integration

### Fixed
- Partial fix for "stream is not readable" error (completed in v2.3.2)

## [2.3.0] - 2024-12-06

### Added
- **HTTP Remote Deployment**: Single-user HTTP server for remote access
  - Stateless architecture for simple deployments
  - Bearer token authentication
  - Compatible with mcp-remote adapter for Claude Desktop
  - New HTTP mode scripts and deployment helper
- **Universal Node.js Compatibility**: Automatic database adapter fallback system
  - Primary adapter: `better-sqlite3` for optimal performance
  - Fallback adapter: `sql.js` (pure JavaScript) for version mismatches
  - Automatic detection and switching between adapters
  - No manual configuration required
- Database adapter abstraction layer (`src/database/database-adapter.ts`)
- Version detection and logging for troubleshooting
- sql.js dependency for pure JavaScript SQLite implementation
- HTTP server implementation (`src/http-server.ts`)
- Deployment documentation and scripts

### Changed
- Updated all database operations to use the adapter interface
- Removed Node.js v20.17.0 requirement - now works with ANY version
- Simplified Claude Desktop setup - no wrapper scripts needed
- Enhanced error messages for database initialization
- Made all MCP tool handlers async for proper initialization

### Fixed
- NODE_MODULE_VERSION mismatch errors with Claude Desktop
- Native module compilation issues in restricted environments
- Compatibility issues when running with different Node.js versions
- Database initialization race conditions in HTTP mode

### Technical Details
- Better-sqlite3: ~10-50x faster (when compatible)
- sql.js: ~2-5x slower but universally compatible
- Both adapters maintain identical API and functionality
- Automatic persistence for sql.js with 100ms debounced saves
- HTTP server uses StreamableHTTPServerTransport for MCP compatibility

## [2.2.0] - 2024-12-06

### Added
- PropertyExtractor class for dedicated property/operation extraction
- NodeRepository for proper JSON serialization/deserialization  
- Support for @n8n/n8n-nodes-langchain package (59 AI nodes)
- AI tool detection (35 tools with usableAsTool property)
- Test suite for critical node validation
- Comprehensive documentation (README, SETUP, CHANGELOG)
- Example configuration files for Claude Desktop
- Node.js v20.17.0 wrapper scripts for compatibility

### Fixed
- Empty properties/operations arrays (now 98.7% nodes have properties)
- Versioned node detection (HTTPRequest, Code properly identified)
- Documentation mapping for nodes with directory-based docs
- Critical node validation (httpRequest, slack, code all pass)

### Changed
- Refactored parser to handle instance-level properties
- Updated MCP server to use NodeRepository
- Improved rebuild script with validation
- Enhanced database schema with proper typing

### Metrics
- 458 total nodes (100% success rate)
- 452 nodes with properties (98.7%)
- 265 nodes with operations (57.9%) 
- 406 nodes with documentation (88.6%)
- 35 AI-capable tools detected
- All critical nodes validated

## [2.1.0] - 2025-01-08

### Added
- Remote deployment capabilities via HTTP/JSON-RPC transport
- Domain configuration through environment variables (`MCP_DOMAIN`)
- Bearer token authentication for remote access
- Comprehensive remote deployment documentation
- PM2 and Nginx configuration examples
- HTTP server mode (`npm run start:http`)

### Enhanced
- Support for both local (stdio) and remote (HTTP) deployment modes
- Production deployment guide for VM/cloud environments
- Claude Desktop configuration for remote servers

## [2.0.0] - 2025-01-08

### Major Refactoring
- **BREAKING CHANGE**: Refocused project to serve only n8n node documentation
- Removed all workflow execution and management features
- Removed bidirectional n8n-MCP integration
- Simplified to be a read-only documentation server

### Added
- SQLite database with full-text search (FTS5) for node documentation
- Integration with n8n-docs repository for official documentation
- Automatic example workflow generation for each node type
- Comprehensive node information including:
  - Source code
  - Official documentation
  - Usage examples
  - Properties schema
  - Credential definitions

### New MCP Tools
- `list_nodes` - List available nodes with filtering
- `get_node_info` - Get complete node information
- `search_nodes` - Full-text search across nodes
- `get_node_example` - Get example workflow for a node
- `get_node_source_code` - Get only source code
- `get_node_documentation` - Get only documentation
- `rebuild_database` - Rebuild entire node database
- `get_database_statistics` - Database statistics

### Infrastructure
- New database schema optimized for documentation storage
- `DocumentationFetcher` for n8n-docs repository integration
- `ExampleGenerator` for creating node usage examples
- `NodeDocumentationService` for database management

## [1.1.0] - 2024-01-07

### Added
- Node source code extraction capability via `get_node_source_code` tool
- List available nodes functionality with `list_available_nodes` tool
- `NodeSourceExtractor` utility for file system access to n8n nodes
- Resource endpoint `nodes://source/{nodeType}` for accessing node source code
- Docker test environment with mounted n8n node_modules
- Comprehensive test suite for AI Agent node extraction
- Test documentation in `docs/AI_AGENT_EXTRACTION_TEST.md`

### Enhanced
- MCP server can now access and extract n8n node implementations
- Support for extracting credential definitions alongside node code
- Package metadata included in extraction results

## [1.0.0] - 2024-01-07

### Initial Release
- Complete n8n-MCP integration implementation
- MCP server exposing n8n workflows as tools, resources, and prompts
- Custom n8n node for connecting to MCP servers
- Bidirectional data format conversion bridge
- Token-based authentication system
- Comprehensive error handling and logging
- Full test coverage for core components
- Docker support with production and development configurations
- Installation scripts for n8n custom node deployment

### MCP Tools
- `execute_workflow` - Execute n8n workflows
- `list_workflows` - List available workflows
- `get_workflow` - Get workflow details
- `create_workflow` - Create new workflows
- `update_workflow` - Update existing workflows
- `delete_workflow` - Delete workflows
- `get_executions` - Get execution history
- `get_execution_data` - Get execution details

### MCP Resources
- `workflow://active` - Active workflows
- `workflow://all` - All workflows
- `execution://recent` - Recent executions
- `credentials://types` - Credential types
- `nodes://available` - Available nodes

### MCP Prompts
- `create_workflow_prompt` - Workflow creation
- `debug_workflow_prompt` - Workflow debugging
- `optimize_workflow_prompt` - Workflow optimization
- `explain_workflow_prompt` - Workflow explanation