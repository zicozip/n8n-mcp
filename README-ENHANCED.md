# n8n-MCP Enhanced Documentation System

This is the enhanced n8n-MCP integration that provides comprehensive node documentation, including operations, API methods, examples, and rich metadata through the Model Context Protocol (MCP).

## Overview

The enhanced system provides:

- **Rich Node Documentation**: Complete documentation including markdown content, operations, API methods, and code examples
- **Full-Text Search**: SQLite FTS5-powered search across node names, descriptions, and documentation
- **Comprehensive Node Information**: Source code, credentials, examples, templates, and metadata in a single query
- **Automatic Documentation Extraction**: Fetches and parses documentation from the official n8n-docs repository

## Available MCP Tools

### 1. `get_node_info`
Get comprehensive information about a specific n8n node.

**Parameters:**
- `nodeType` (string, required): The node type identifier (e.g., 'n8n-nodes-base.slack')

**Returns:**
- Complete node information including:
  - Basic metadata (name, displayName, description, category)
  - Documentation (markdown, URL, title)
  - Operations and API methods
  - Code examples and templates
  - Related resources and required scopes
  - Source code (node and credential)
  - Example workflow and parameters

### 2. `search_nodes`
Search n8n nodes with full-text search and advanced filtering.

**Parameters:**
- `query` (string, optional): Search query for full-text search
- `category` (string, optional): Filter by node category
- `packageName` (string, optional): Filter by package name
- `hasCredentials` (boolean, optional): Filter nodes that require credentials
- `isTrigger` (boolean, optional): Filter trigger nodes only
- `limit` (number, optional): Maximum results to return (default: 20)

**Returns:**
- Array of matching nodes with summary information

### 3. `get_node_statistics`
Get statistics about the node documentation database.

**Returns:**
- Total nodes, packages, and storage statistics
- Nodes with documentation, examples, and credentials
- Package distribution

### 4. `rebuild_documentation_database`
Rebuild the node documentation database with the latest information.

**Parameters:**
- `packageFilter` (string, optional): Only rebuild nodes from specific package

**Returns:**
- Rebuild statistics and status

## Database Schema

The system uses a SQLite database with the following main table:

```sql
CREATE TABLE nodes (
  node_type TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  display_name TEXT,
  description TEXT,
  category TEXT,
  source_code TEXT NOT NULL,
  documentation_markdown TEXT,
  operations TEXT,        -- JSON array of OperationInfo
  api_methods TEXT,       -- JSON array of ApiMethodMapping
  documentation_examples TEXT,  -- JSON array of CodeExample
  templates TEXT,         -- JSON array of TemplateInfo
  related_resources TEXT, -- JSON array of RelatedResource
  -- ... additional fields
);
```

## Building the Documentation Database

To build or rebuild the documentation database:

```bash
# Using npm script
npm run docs:rebuild

# Or directly
npx ts-node src/scripts/rebuild-database.ts
```

This will:
1. Clone/update the n8n-docs repository
2. Extract source code for all available nodes
3. Parse and extract enhanced documentation
4. Generate example workflows
5. Store everything in the SQLite database

## Usage Example

```typescript
// Get comprehensive information about the Slack node
const slackInfo = await mcpClient.callTool('get_node_info', {
  nodeType: 'n8n-nodes-base.slack'
});

// Search for all trigger nodes with credentials
const triggers = await mcpClient.callTool('search_nodes', {
  isTrigger: true,
  hasCredentials: true
});

// Get database statistics
const stats = await mcpClient.callTool('get_node_statistics', {});
```

## Architecture

The enhanced system consists of:

1. **NodeDocumentationService**: Main service that manages the SQLite database
2. **EnhancedDocumentationFetcher**: Fetches and parses documentation from n8n-docs
3. **ExampleGenerator**: Generates example workflows and parameters
4. **MCP Server**: Exposes the tools through the Model Context Protocol

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test

# Start MCP server
npm start
```

## Environment Variables

- `NODE_DB_PATH`: Path to the SQLite database (default: `./data/nodes.db`)
- `N8N_API_URL`: n8n instance URL
- `N8N_API_KEY`: n8n API key for workflow operations

## License

Licensed under the Sustainable Use License v1.0