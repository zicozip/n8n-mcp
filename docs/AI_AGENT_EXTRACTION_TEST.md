# AI Agent Node Extraction Test Guide

This document describes how to test the MCP server's ability to extract and provide the AI Agent node source code from n8n.

## Test Scenario

An MCP client (like an AI assistant) requests the source code for n8n's AI Agent node, and the MCP server successfully extracts and returns it.

## Implementation Overview

### 1. New MCP Tools Added

- **`get_node_source_code`**: Extracts source code for any n8n node
- **`list_available_nodes`**: Lists all available n8n nodes

### 2. New Components

- **`NodeSourceExtractor`** (`src/utils/node-source-extractor.ts`): Handles file system access to extract node source code
- **Resource endpoint**: `nodes://source/{nodeType}` for accessing node code via resources

### 3. Test Infrastructure

- **Docker setup** (`docker-compose.test.yml`): Mounts n8n's node_modules for source access
- **Test scripts**: Multiple test approaches for different scenarios

## Running the Tests

### Option 1: Docker-based Test

```bash
# Build the project
npm run build

# Run the comprehensive test
./scripts/test-ai-agent-extraction.sh
```

This script will:
1. Build Docker containers
2. Start n8n and MCP server
3. Check for AI Agent node availability
4. Test source code extraction

### Option 2: Standalone MCP Test

```bash
# Build the project
npm run build

# Ensure n8n is running (locally or in Docker)
docker-compose -f docker-compose.test.yml up -d n8n

# Run the MCP client test
node tests/test-mcp-extraction.js
```

### Option 3: Manual Testing

1. Start the environment:
```bash
docker-compose -f docker-compose.test.yml up -d
```

2. Use any MCP client to connect and request:
```json
{
  "method": "tools/call",
  "params": {
    "name": "get_node_source_code",
    "arguments": {
      "nodeType": "@n8n/n8n-nodes-langchain.Agent",
      "includeCredentials": true
    }
  }
}
```

## Expected Results

### Successful Extraction Response

```json
{
  "nodeType": "@n8n/n8n-nodes-langchain.Agent",
  "sourceCode": "/* AI Agent node JavaScript code */",
  "location": "/usr/local/lib/node_modules/n8n/node_modules/@n8n/n8n-nodes-langchain/dist/nodes/agents/Agent/Agent.node.js",
  "credentialCode": "/* Optional credential code */",
  "packageInfo": {
    "name": "@n8n/n8n-nodes-langchain",
    "version": "1.x.x",
    "description": "LangChain nodes for n8n"
  }
}
```

## How It Works

1. **MCP Client Request**: Client calls `get_node_source_code` tool with node type
2. **Server Processing**: MCP server receives request and invokes `NodeSourceExtractor`
3. **File System Search**: Extractor searches known n8n paths for the node file
4. **Source Extraction**: Reads the JavaScript source code and optional credential files
5. **Response Formation**: Returns structured data with source code and metadata

## Troubleshooting

### Node Not Found

If the AI Agent node is not found:

1. Check if langchain nodes are installed:
```bash
docker exec n8n-test ls /usr/local/lib/node_modules/n8n/node_modules/@n8n/
```

2. Install langchain nodes:
```bash
docker exec n8n-test npm install -g @n8n/n8n-nodes-langchain
```

### Permission Issues

Ensure the MCP container has read access to n8n's node_modules:
```yaml
volumes:
  - n8n_modules:/usr/local/lib/node_modules/n8n/node_modules:ro
```

### Alternative Node Types

You can test with other built-in nodes:
- `n8n-nodes-base.HttpRequest`
- `n8n-nodes-base.Code`
- `n8n-nodes-base.If`

## Success Criteria

The test is successful when:
1. ✅ MCP server starts and accepts connections
2. ✅ Client can discover the `get_node_source_code` tool
3. ✅ Server locates the AI Agent node in the file system
4. ✅ Complete source code is extracted and returned
5. ✅ Response includes metadata (location, package info)

## Security Considerations

- Source code extraction is read-only
- Access is limited to n8n's node_modules directory
- Authentication token required for MCP server access
- No modification of files is possible

## Next Steps

After successful testing:
1. Deploy to production environment
2. Configure proper authentication
3. Set up monitoring for extraction requests
4. Document available node types for users