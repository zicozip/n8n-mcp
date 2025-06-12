# Changelog

All notable changes to this project will be documented in this file.

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