# Changelog

All notable changes to this project will be documented in this file.

## [2.6.2] - 2025-06-26

### Added
- **Enhanced Workflow Creation Validation**: Major improvements to prevent broken workflows
  - **NEW**: Node type existence validation - Verifies node types actually exist in n8n
  - **NEW**: Smart suggestions for common mistakes - Detects `webhook` and suggests `n8n-nodes-base.webhook`
  - **NEW**: Minimum viable workflow validation - Prevents single-node workflows (except webhooks)
  - **NEW**: Empty connection detection - Catches multi-node workflows with no connections
  - **NEW**: Helper functions - `getWorkflowStructureExample()` and `getWorkflowFixSuggestions()`
  - Enhanced error messages with clear guidance and connection examples
  - Prevents broken workflows that show as question marks in n8n UI

### Fixed
- **Critical**: `nodes-base.webhook` validation - Now caught BEFORE database lookup
  - Previously, `nodes-base.webhook` would pass validation because it existed in the normalized database
  - Now explicitly checks for and rejects `nodes-base.` prefix before any database operations
  - This fixes the exact issue causing workflows to appear broken in n8n UI

### Changed
- Workflow validator now checks node types in order: invalid patterns → database lookup → suggestions
- Connection validation messages now include proper format examples
- Error messages are more actionable with specific fix instructions

## [2.6.1] - 2025-06-26

### Added
- **Enhanced typeVersion Validation**: Comprehensive validation for versioned nodes
  - **NEW**: typeVersion validation enforced on all versioned nodes
  - Catches missing typeVersion and provides correct version to use
  - Warns on outdated versions when newer versions are available
  - Prevents invalid versions that exceed maximum supported
  - Helps AI agents avoid common workflow creation mistakes
  - Test coverage for all typeVersion scenarios

### Changed
- WorkflowValidator now includes typeVersion in its validation pipeline
- Enhanced error messages for typeVersion issues with actionable suggestions

## [2.6.0] - 2025-06-26

### Added
- **n8n Management Tools Integration**: Complete workflow lifecycle management via API
  - **NEW**: 14 n8n management tools for creating, updating, and executing workflows
  - **NEW**: `n8n_create_workflow` - Create workflows programmatically with validation
  - **NEW**: `n8n_update_workflow` - Update existing workflows with safety checks
  - **NEW**: `n8n_trigger_webhook_workflow` - Execute workflows via webhooks
  - **NEW**: `n8n_list_executions` - Monitor workflow executions with filtering
  - **NEW**: `n8n_health_check` - Check n8n instance connectivity and features
  - **NEW**: Workflow management tools with smart error handling
  - **NEW**: Execution management tools for monitoring and debugging
  - Integrated n8n-manager-for-ai-agents functionality
  - Optional feature - only enabled when N8N_API_URL and N8N_API_KEY configured
  - Complete workflow lifecycle: discover → build → validate → deploy → execute
  - Smart error handling for API limitations (activation, direct execution)
  - Conditional tool registration based on configuration

### Changed
- Updated `start_here_workflow_guide` to include n8n management tools documentation
- Enhanced MCP server to conditionally register management tools
- Added comprehensive integration tests for all management features

## [2.5.1] - 2025-01-25

### Added
- **AI Tool Support Enhancement**: Major improvements to AI tool integration
  - **NEW**: `get_node_as_tool_info` tool - Get specific information about using ANY node as an AI tool
  - **ENHANCED**: `get_node_info` now includes `aiToolCapabilities` section for all nodes
  - **ENHANCED**: `list_ai_tools` - Added usage guidance explaining ANY node can be used as a tool
  - **ENHANCED**: `WorkflowValidator` - Now validates `ai_tool` connections in workflows
  - AI workflow pattern detection - Warns when AI Agents have no tools connected
  - Community node detection - Reminds about N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE environment variable
  - **NEW**: AI Tool TaskTemplates - Added use_google_sheets_as_tool, use_slack_as_tool, multi_tool_ai_agent
  - Comprehensive examples showing how to connect regular nodes as AI tools
  - Tool usage documentation with $fromAI() expression examples

### Changed
- Clarified that ANY node can be used as an AI tool, not just nodes with usableAsTool property
- Enhanced workflow validation to understand and validate ai_tool connections
- Improved expression validation to support $fromAI() dynamic AI parameters

## [2.5.0] - 2025-01-20

### Added
- **Complete Workflow Validation**: Professional-grade workflow validation system
  - **NEW**: `validate_workflow` tool - Validate entire workflows before deployment
  - **NEW**: `validate_workflow_connections` tool - Check workflow structure and connections
  - **NEW**: `validate_workflow_expressions` tool - Validate all n8n expressions in a workflow
  - **NEW**: `ExpressionValidator` - Comprehensive n8n expression syntax validation
  - **NEW**: `WorkflowValidator` - Complete workflow structure and logic validation
  - Detects cycles (infinite loops) in workflows
  - Validates node references in expressions ($node["Node Name"])
  - Checks for orphaned nodes and missing connections
  - Expression syntax validation with common mistake detection
  - Workflow best practices analysis with suggestions
  - Supports partial validation (nodes only, connections only, expressions only)
  - Test coverage for all validation scenarios

## [2.4.2] - 2025-01-15

### Added
- **Enhanced Node Configuration Validation**: Operation-aware validation with dramatic accuracy improvements
  - **NEW**: `validate_node_operation` tool - Operation-aware validation with 80%+ fewer false positives
  - **NEW**: `validate_node_minimal` tool - Lightning-fast validation for just required fields
  - **NEW**: Validation profiles - Choose between minimal, runtime, ai-friendly, or strict validation
  - **NEW**: `EnhancedConfigValidator` - Smart validation that only checks relevant properties
  - **NEW**: Node-specific validators - Custom logic for Slack, Google Sheets, OpenAI, MongoDB, Webhook, Postgres, MySQL
  - **NEW**: SQL safety features - Detects SQL injection risks, unsafe DELETE/UPDATE queries
  - Added operation context filtering (only validates properties for selected operation)
  - Integrated working examples in validation responses when errors found
  - Added actionable next steps and auto-fix suggestions
  - Basic code syntax validation for JavaScript/Python in Code node
  - Dramatic improvement for complex multi-operation nodes
  - Test results: Slack validation reduced from 45 errors to 1 error!

### Removed
- Deprecated `validate_node_config` tool in favor of new operation-aware validators

## [2.4.1] - 2025-01-10

### Added
- **n8n Workflow Templates**: Integration with n8n.io template library
  - **NEW**: `list_node_templates` tool - Find workflow templates using specific nodes
  - **NEW**: `get_template` tool - Get complete workflow JSON for import
  - **NEW**: `search_templates` tool - Search templates by keywords
  - **NEW**: `get_templates_for_task` tool - Get curated templates for common tasks
  - Added Templates system with n8n.io API integration
  - Templates filtered to last 6 months only (freshness guarantee)
  - Manual fetch system - not part of regular rebuild
  - Full workflow JSON available for immediate use
  - 10 task categories: AI automation, data sync, webhooks, etc.

## [2.4.0] - 2025-01-05

### Added
- **AI-Optimized MCP Tools**: Dramatically improved AI agent experience
  - **NEW**: `get_node_essentials` tool - Returns only 10-20 essential properties (95% size reduction)
  - **NEW**: `search_node_properties` tool - Search for specific properties within nodes
  - **NEW**: `get_node_for_task` tool - Pre-configured settings for 14 common tasks
  - **NEW**: `list_tasks` tool - Discover available task templates
  - **NEW**: `validate_node_config` tool - Validate configurations before use
  - **NEW**: `get_property_dependencies` tool - Analyze property visibility dependencies
  - Added PropertyFilter service with curated essential properties for 20+ nodes
  - Added ExampleGenerator with working examples for common use cases
  - Added TaskTemplates service with 14 pre-configured tasks
  - Added ConfigValidator service for comprehensive validation
  - Added PropertyDependencies service for dependency analysis
  - Enhanced all property descriptions - 100% coverage
  - Added version information to essentials response
  - Response sizes reduced from 100KB+ to <5KB for common nodes

### Changed
- **License Change**: Changed from Apache 2.0 to MIT License for wider adoption
- Fixed missing AI and LangChain node documentation
- Improved documentation mapping for better coverage

## [2.3.3] - 2025-06-16

### Added
- **Automated Dependency Update System**: Comprehensive solution for keeping n8n packages in sync
  - Custom update script (`scripts/update-n8n-deps.js`) that respects n8n's interdependencies
  - GitHub Actions workflow for weekly automated updates
  - Renovate configuration as an alternative solution
  - Dependency update documentation guide
- Support for automatic n8n package version synchronization
- Documentation updates reflecting current metrics

### Fixed
- **Validation Script Node Type References**: Fixed node type format issues
  - Changed from short names (e.g., 'httpRequest') to full names (e.g., 'nodes-base.httpRequest')
  - Removed versioned check for Code node as it's not consistently detected
  - All validation tests now pass after dependency updates

### Changed
- Updated n8n dependencies to latest versions:
  - n8n: 1.14.1 → 1.97.1
  - n8n-core: 1.14.1 → 1.96.0
  - n8n-workflow: 1.82.0 → 1.94.0
  - @n8n/n8n-nodes-langchain: 1.97.0 → 1.96.1
- Significant increase in detected nodes and capabilities:
  - Total nodes: 458 → 525
  - AI-capable tools: 35 → 263 (major increase due to updated detection)
  - Nodes with properties: 98.7% → 99%
  - Nodes with operations: 57.9% → 63.6%

### Technical Details
- Dependency update script now checks n8n's required dependency versions
- Validation script uses correct database column names
- All critical nodes (httpRequest, code, slack, agent) validate successfully

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