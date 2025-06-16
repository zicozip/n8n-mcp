# Docker MCP Initialization Timeout Fix Plan

## Problem Summary

The n8n-MCP Docker container fails to work with Claude Desktop due to MCP initialization timeout:

1. Claude sends `initialize` request
2. Server receives it (logs show "Message from client: {"method":"initialize"...}")
3. Server appears to connect successfully
4. **No response is sent back to Claude**
5. Claude times out after 60 seconds
6. Container outputs "Shutting down..." which breaks JSON-RPC protocol

## Root Cause Analysis

### 1. **Stdout Buffering in Docker**

Docker containers often buffer stdout, especially when not running with TTY (`-t` flag). This is the most likely culprit:

- Node.js/JavaScript may buffer stdout when not connected to a TTY
- Docker's stdout handling differs from direct execution
- The MCP response might be stuck in the buffer

**Evidence:**
- Common Docker issue (moby/moby#1385, docker/compose#1549)
- Python requires `-u` flag for unbuffered output in Docker
- Different base images have different buffering behavior

### 2. **MCP SDK Server Connection Issue**

The server might not be properly completing the connection handshake:

```typescript
const transport = new StdioServerTransport();
await server.connect(transport);  // This might not complete properly
```

### 3. **Missing Initialize Handler**

While the MCP SDK should handle `initialize` automatically, there might be an issue with:
- Handler registration order
- Server capabilities configuration
- Transport initialization timing

### 4. **Process Lifecycle Management**

The container might be:
- Exiting too early
- Not keeping the event loop alive
- Missing proper signal handling

## Fixing Plan

### Phase 1: Immediate Fixes (High Priority)

#### 1.1 Force Stdout Flushing

**File:** `src/mcp/server-update.ts`

Add explicit stdout flushing after server connection:

```typescript
async run(): Promise<void> {
  await this.ensureInitialized();
  
  const transport = new StdioServerTransport();
  await this.server.connect(transport);
  
  // Force flush stdout
  if (process.stdout.isTTY === false) {
    process.stdout.write('', () => {}); // Force flush
  }
  
  logger.info('n8n Documentation MCP Server running on stdio transport');
  
  // Keep process alive
  process.stdin.resume();
}
```

#### 1.2 Add TTY Support to Docker

**File:** `Dockerfile`

Add environment variable to detect Docker:

```dockerfile
ENV IS_DOCKER=true
ENV NODE_OPTIONS="--max-old-space-size=2048"
```

**File:** Update Docker command in README

```json
{
  "mcpServers": {
    "n8n-mcp": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-t",  // Add TTY allocation
        "--init",  // Proper signal handling
        "-e", "MCP_MODE=stdio",
        "-e", "LOG_LEVEL=error",
        "-e", "DISABLE_CONSOLE_OUTPUT=true",
        "ghcr.io/czlonkowski/n8n-mcp:latest"
      ]
    }
  }
}
```

### Phase 2: Robust Fixes (Medium Priority)

#### 2.1 Implement Explicit Initialize Handler

**File:** `src/mcp/server-update.ts`

Add explicit initialize handler to ensure response:

```typescript
import { 
  InitializeRequestSchema,
  InitializeResult 
} from '@modelcontextprotocol/sdk/types.js';

private setupHandlers(): void {
  // Add explicit initialize handler
  this.server.setRequestHandler(InitializeRequestSchema, async (request) => {
    logger.debug('Handling initialize request', request);
    
    const result: InitializeResult = {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {}
      },
      serverInfo: {
        name: "n8n-documentation-mcp",
        version: "1.0.0"
      }
    };
    
    // Force immediate flush
    if (process.stdout.isTTY === false) {
      process.stdout.write('', () => {});
    }
    
    return result;
  });

  // ... existing handlers
}
```

#### 2.2 Add Docker-Specific Stdio Handling

**File:** Create `src/utils/docker-stdio.ts`

```typescript
export class DockerStdioTransport extends StdioServerTransport {
  constructor() {
    super();
    
    // Disable buffering for Docker
    if (process.env.IS_DOCKER === 'true') {
      process.stdout.setDefaultEncoding('utf8');
      if (process.stdout._handle && process.stdout._handle.setBlocking) {
        process.stdout._handle.setBlocking(true);
      }
    }
  }
  
  protected async writeMessage(message: string): Promise<void> {
    await super.writeMessage(message);
    
    // Force flush in Docker
    if (process.env.IS_DOCKER === 'true') {
      process.stdout.write('', () => {});
    }
  }
}
```

### Phase 3: Alternative Approaches (Low Priority)

#### 3.1 Use Wrapper Script

Create a Node.js wrapper that ensures proper buffering:

**File:** `docker-entrypoint.js`

```javascript
#!/usr/bin/env node

// Disable all buffering
process.stdout._handle?.setBlocking?.(true);
process.stdin.setRawMode?.(false);

// Import and run the actual server
require('./dist/mcp/index.js');
```

#### 3.2 Switch to HTTP Transport for Docker

Consider using HTTP transport instead of stdio for Docker deployments, as it doesn't have buffering issues.

## Testing Plan

1. **Local Testing:**
   ```bash
   # Test with Docker TTY
   docker run -it --rm ghcr.io/czlonkowski/n8n-mcp:latest
   
   # Test initialize response
   echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05"},"id":1}' | \
     docker run -i --rm ghcr.io/czlonkowski/n8n-mcp:latest
   ```

2. **Claude Desktop Testing:**
   - Apply fixes incrementally
   - Test with each configuration change
   - Monitor Claude Desktop logs

3. **Debug Output:**
   Add temporary debug logging to stderr:
   ```typescript
   console.error('DEBUG: Received initialize');
   console.error('DEBUG: Sending response');
   ```

## Implementation Priority

1. **Immediate:** Add `-t` flag to Docker command (no code changes)
2. **High:** Force stdout flushing in server code
3. **Medium:** Add explicit initialize handler
4. **Low:** Create Docker-specific transport class

## Success Criteria

- Claude Desktop connects without timeout
- No "Shutting down..." message in JSON stream
- Tools are accessible after connection
- Connection remains stable

## References

- [Docker stdout buffering issue](https://github.com/moby/moby/issues/1385)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Python unbuffered mode in Docker](https://stackoverflow.com/questions/39486327/stdout-being-buffered-in-docker-container)
- [MCP initialization timeout issues](https://github.com/modelcontextprotocol/servers/issues/57)