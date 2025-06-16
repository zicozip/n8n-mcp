# Docker stdio Fix Implementation Plan for n8n-MCP

Based on community research and successful MCP Docker deployments, here's a streamlined fix for the initialization timeout issue.

## Root Cause

Docker treats container stdout as a pipe (not TTY), causing block buffering. The MCP server's JSON-RPC responses sit in the buffer instead of being immediately sent to Claude Desktop, causing a 60-second timeout.

## Implementation Steps

### Step 1: Test Simple Interactive Mode

First, verify if just using `-i` flag solves the issue:

**Update README.md:**
```json
{
  "mcpServers": {
    "n8n-mcp": {
      "command": "docker",
      "args": [
        "run",
        "-i",  // Interactive mode - keeps stdin open
        "--rm",
        "-e", "MCP_MODE=stdio",
        "-e", "LOG_LEVEL=error", 
        "-e", "DISABLE_CONSOLE_OUTPUT=true",
        "ghcr.io/czlonkowski/n8n-mcp:latest"
      ]
    }
  }
}
```

**Test command:**
```bash
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05"},"id":1}' | \
  docker run -i --rm \
    -e MCP_MODE=stdio \
    -e LOG_LEVEL=error \
    -e DISABLE_CONSOLE_OUTPUT=true \
    ghcr.io/czlonkowski/n8n-mcp:latest
```

Expected: Should receive a JSON response immediately.

### Step 2: Add Explicit Stdout Flushing (If Needed)

If Step 1 doesn't work, add minimal flushing to the Node.js server:

**File: `src/mcp/server-update.ts`**

Update the `run()` method:
```typescript
async run(): Promise<void> {
  await this.ensureInitialized();
  
  const transport = new StdioServerTransport();
  await this.server.connect(transport);
  
  // Ensure stdout is not buffered in Docker
  if (!process.stdout.isTTY && process.env.IS_DOCKER) {
    // Force unbuffered stdout
    process.stdout.write('');
  }
  
  logger.info('n8n Documentation MCP Server running on stdio transport');
  
  // Keep process alive
  process.stdin.resume();
}
```

**File: `Dockerfile`**

Add environment variable:
```dockerfile
ENV IS_DOCKER=true
```

### Step 3: System-Level Unbuffering (Last Resort)

Only if Steps 1-2 fail, implement stdbuf wrapper:

**File: `docker-entrypoint.sh`**
```bash
#!/bin/sh
# Force line buffering for stdio communication
exec stdbuf -oL -eL node /app/dist/mcp/index.js
```

**File: `Dockerfile`**
```dockerfile
# Add stdbuf utility
RUN apk add --no-cache coreutils

# Copy and setup entrypoint
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
```

## Testing Protocol

### 1. Local Docker Test
```bash
# Build test image
docker build -t n8n-mcp:test .

# Test with echo pipe
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05"},"id":1}' | \
  docker run -i --rm n8n-mcp:test | head -1

# Should see immediate JSON response
```

### 2. Claude Desktop Test
1. Update `claude_desktop_config.json` with new configuration
2. Restart Claude Desktop
3. Check Developer tab for "running" status
4. Test a simple MCP command

### 3. Debug if Needed
```bash
# Run with stderr output for debugging
docker run -i --rm \
  -e MCP_MODE=stdio \
  -e LOG_LEVEL=debug \
  ghcr.io/czlonkowski/n8n-mcp:latest 2>debug.log
```

## Success Criteria

- [ ] No timeout errors in Claude Desktop logs
- [ ] MCP tools are accessible immediately
- [ ] No "Shutting down..." messages in stdout
- [ ] Simple `-i` flag configuration works

## Rollout Plan

1. **Test locally** with simple `-i` flag first
2. **Update Docker image** only if code changes needed
3. **Update README** with working configuration
4. **Community announcement** with simple Docker instructions

## Key Insights from Research

- Most MCP Docker deployments work with just `-i` flag
- Complex solutions often unnecessary
- Node.js typically doesn't need explicit unbuffering (unlike Python with `-u`)
- Claude Desktop only supports stdio for local servers (not HTTP)
- Proper testing can quickly identify if buffering is the actual issue

## What NOT to Do

- Don't add TTY flag (`-t`) - it's for terminal UI, not needed for MCP
- Don't implement complex multi-phase solutions
- Don't switch to HTTP transport (Claude Desktop doesn't support it locally)
- Don't modify MCP protocol handling
- Don't add unnecessary wrapper scripts unless proven necessary

The solution should be as simple as possible - likely just the `-i` flag in the Docker command.