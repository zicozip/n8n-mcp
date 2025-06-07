# Changelog

All notable changes to this project will be documented in this file.

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