# Single-Session HTTP Server Implementation

## Overview

This document describes the implementation of the Hybrid Single-Session architecture that fixes the "stream is not readable" error in the n8n-MCP HTTP server.

## Architecture

The Single-Session architecture maintains one persistent MCP session that is reused across all requests, providing:
- Protocol compliance with StreamableHTTPServerTransport
- Simple state management (one session only)
- Automatic session expiry after 30 minutes of inactivity
- Clean console output management

## Key Components

### 1. ConsoleManager (`src/utils/console-manager.ts`)
Prevents console output from interfering with the StreamableHTTPServerTransport:
- Silences all console methods during MCP request handling
- Automatically restores console after request completion
- Only active in HTTP mode

### 2. SingleSessionHTTPServer (`src/http-server-single-session.ts`)
Core implementation of the single-session architecture:
- Maintains one persistent session with StreamableHTTPServerTransport
- Automatically creates/resets session as needed
- Wraps all operations with ConsoleManager
- Handles authentication and request routing

### 3. N8NMCPEngine (`src/mcp-engine.ts`)
Clean interface for service integration:
- Simple API for processing MCP requests
- Health check capabilities
- Graceful shutdown support
- Ready for multi-tenant wrapper services

## Usage

### Standalone Mode
```bash
# Start the single-session HTTP server
MCP_MODE=http npm start

# Or use the legacy stateless server
npm run start:http:legacy
```

### As a Library
```typescript
import { N8NMCPEngine } from 'n8n-mcp';

const engine = new N8NMCPEngine();

// In your Express app
app.post('/api/mcp', authenticate, async (req, res) => {
  await engine.processRequest(req, res);
});

// Health check
app.get('/health', async (req, res) => {
  const health = await engine.healthCheck();
  res.json(health);
});
```

### Docker Deployment
```yaml
services:
  n8n-mcp:
    image: ghcr.io/czlonkowski/n8n-mcp:latest
    environment:
      - MCP_MODE=http
      - AUTH_TOKEN=${AUTH_TOKEN}
    ports:
      - "3000:3000"
```

## Testing

### Manual Testing
```bash
# Run the test script
npm run test:single-session
```

### Unit Tests
```bash
# Run Jest tests
npm test -- single-session.test.ts
```

### Health Check
```bash
curl http://localhost:3000/health
```

Response includes session information:
```json
{
  "status": "ok",
  "mode": "single-session",
  "version": "2.3.1",
  "sessionActive": true,
  "sessionAge": 45,
  "uptime": 120,
  "memory": {
    "used": 45,
    "total": 128,
    "unit": "MB"
  }
}
```

## Configuration

### Environment Variables
- `AUTH_TOKEN` - Required authentication token (min 32 chars recommended)
- `MCP_MODE` - Set to "http" for HTTP mode
- `PORT` - Server port (default: 3000)
- `HOST` - Server host (default: 0.0.0.0)
- `CORS_ORIGIN` - CORS allowed origin (default: *)

### Session Timeout
The session automatically expires after 30 minutes of inactivity. This is configurable in the SingleSessionHTTPServer constructor.

## Migration from Stateless

The single-session implementation is backward compatible:
1. Same API endpoints
2. Same authentication mechanism
3. Same request/response format
4. Only internal architecture changed

To migrate:
1. Update to latest version
2. No configuration changes needed
3. Monitor logs for any issues
4. Session management is automatic

## Performance

The single-session architecture provides:
- Lower memory usage (one session vs many)
- Faster response times (no session creation overhead)
- Automatic cleanup (session expiry)
- No session accumulation issues

## Troubleshooting

### "Stream is not readable" error
This error should no longer occur with the single-session implementation. If it does:
1. Check console output isn't being written during requests
2. Verify ConsoleManager is properly wrapping operations
3. Check for third-party libraries writing to console

### Session expiry issues
If sessions are expiring too quickly:
1. Increase the timeout in SingleSessionHTTPServer
2. Monitor session age in health endpoint
3. Check for long gaps between requests

### Authentication failures
1. Verify AUTH_TOKEN is set correctly
2. Check authorization header format: `Bearer <token>`
3. Monitor logs for auth failures

## Future Enhancements

1. **Configurable session timeout** - Allow timeout configuration via environment variable
2. **Session metrics** - Track session lifetime, request count, etc.
3. **Graceful session migration** - Handle session updates without dropping requests
4. **Multi-session support** - For future scaling needs (separate repository)