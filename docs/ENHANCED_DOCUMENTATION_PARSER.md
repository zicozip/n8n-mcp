# Enhanced Documentation Parser for n8n-MCP

## Overview

We have successfully enhanced the markdown parser in DocumentationFetcher to extract rich, structured content from n8n documentation. This enhancement enables AI agents to have deeper understanding of n8n nodes, their operations, API mappings, and usage patterns.

## Key Features Implemented

### 1. Enhanced Documentation Structure

The `EnhancedDocumentationFetcher` class extracts and structures documentation into:

```typescript
interface EnhancedNodeDocumentation {
  markdown: string;              // Raw markdown content
  url: string;                   // Documentation URL
  title?: string;                // Node title
  description?: string;          // Node description
  operations?: OperationInfo[];  // Structured operations
  apiMethods?: ApiMethodMapping[]; // API endpoint mappings
  examples?: CodeExample[];      // Code examples
  templates?: TemplateInfo[];    // Template references
  relatedResources?: RelatedResource[]; // Related docs
  requiredScopes?: string[];     // OAuth scopes
  metadata?: DocumentationMetadata; // Frontmatter data
}
```

### 2. Operations Extraction

The parser correctly identifies and extracts hierarchical operations:

- **Resource Level**: e.g., "Channel", "Message", "User"
- **Operation Level**: e.g., "Archive", "Send", "Get"
- **Descriptions**: Detailed operation descriptions

Example from Slack node:
- Channel.Archive: "a channel"
- Message.Send: "a message"
- User.Get: "information about a user"

### 3. API Method Mapping

Extracts mappings between n8n operations and actual API endpoints from markdown tables:

```
Channel.Archive → conversations.archive (https://api.slack.com/methods/conversations.archive)
Message.Send → chat.postMessage (https://api.slack.com/methods/chat.postMessage)
```

### 4. Enhanced Database Schema

Created a new schema to store the rich documentation:

- `nodes` table: Extended with documentation fields
- `node_operations`: Stores all operations for each node
- `node_api_methods`: Maps operations to API endpoints
- `node_examples`: Stores code examples
- `node_resources`: Related documentation links
- `node_scopes`: Required OAuth scopes

### 5. Full-Text Search Enhancement

The FTS index now includes:
- Documentation title and description
- Operations and their descriptions
- API method names
- Full markdown content

## Usage Examples

### Basic Usage

```javascript
const fetcher = new EnhancedDocumentationFetcher();
const doc = await fetcher.getEnhancedNodeDocumentation('n8n-nodes-base.slack');

// Access structured data
console.log(`Operations: ${doc.operations.length}`);
console.log(`API Methods: ${doc.apiMethods.length}`);
```

### With Database Storage

```javascript
const storage = new EnhancedSQLiteStorageService();
const nodeInfo = await extractor.extractNodeSource('n8n-nodes-base.slack');
const storedNode = await storage.storeNodeWithDocumentation(nodeInfo);

// Access counts
console.log(`Stored ${storedNode.operationCount} operations`);
console.log(`Stored ${storedNode.apiMethodCount} API methods`);
```

## Benefits for AI Agents

1. **Comprehensive Understanding**: AI agents can now understand not just what a node does, but exactly which operations are available and how they map to API endpoints.

2. **Better Search**: Enhanced FTS allows searching across operations, descriptions, and documentation content.

3. **Structured Data**: Operations and API methods are stored as structured data, making it easier for AI to reason about node capabilities.

4. **Rich Context**: Related resources, examples, and metadata provide additional context for better AI responses.

## Implementation Files

- `/src/utils/enhanced-documentation-fetcher.ts`: Main parser implementation
- `/src/services/enhanced-sqlite-storage-service.ts`: Database storage with rich schema
- `/src/db/enhanced-schema.sql`: Enhanced database schema
- `/tests/demo-enhanced-documentation.js`: Working demonstration

## Future Enhancements

1. **Example Extraction**: Improve code example extraction from documentation
2. **Parameter Parsing**: Extract operation parameters and their types
3. **Credential Requirements**: Parse specific credential field requirements
4. **Version Tracking**: Track documentation versions and changes
5. **Caching**: Implement smart caching for documentation fetches

## Testing

Run the demo to see the enhanced parser in action:

```bash
npm run build
node tests/demo-enhanced-documentation.js
```

This will show:
- Extraction of 40+ operations from Slack node
- API method mappings with URLs
- Resource grouping and organization
- Related documentation links