# Multi-App Integration Guide

This guide explains how session restoration works in n8n-mcp for multi-tenant deployments.

## Session Restoration: Warm Start Pattern

When a container restarts, existing client sessions are lost. The warm start pattern allows clients to seamlessly restore sessions without manual intervention.

### How It Works

1. **Client sends request** with existing session ID after restart
2. **Server detects** unknown session ID
3. **Restoration hook** is called to load session context from your database
4. **New session created** using restored context
5. **Current request handled** immediately through new transport
6. **Client receives** standard MCP error `-32000` (Server not initialized)
7. **Client auto-retries** with initialize request on same connection
8. **Session fully restored** and client continues normally

### Key Features

- **Zero client changes**: Standard MCP clients auto-retry on -32000
- **Single HTTP round-trip**: No extra network requests needed
- **Concurrent-safe**: Idempotency guards prevent duplicate restoration
- **Automatic cleanup**: Failed restorations clean up resources automatically

### Implementation

```typescript
import { SingleSessionHTTPServer } from 'n8n-mcp';

const server = new SingleSessionHTTPServer({
  // Hook to load session context from your storage
  onSessionNotFound: async (sessionId) => {
    const session = await database.loadSession(sessionId);
    if (!session || session.expired) {
      return null; // Reject restoration
    }
    return session.instanceContext; // Restore session
  },

  // Optional: Configure timeouts and retries
  sessionRestorationTimeout: 5000, // 5 seconds (default)
  sessionRestorationRetries: 2,    // Retry on transient failures
  sessionRestorationRetryDelay: 100 // Delay between retries
});
```

### Session Lifecycle Events

Track session restoration for metrics and debugging:

```typescript
const server = new SingleSessionHTTPServer({
  sessionEvents: {
    onSessionRestored: (sessionId, context) => {
      console.log(`Session ${sessionId} restored`);
      metrics.increment('session.restored');
    }
  }
});
```

### Error Handling

The restoration hook can return three outcomes:

- **Return context**: Session is restored successfully
- **Return null/undefined**: Session is rejected (client gets 400 Bad Request)
- **Throw error**: Restoration failed (client gets 500 Internal Server Error)

Timeout errors are never retried (already took too long).

### Concurrency Safety

Multiple concurrent requests for the same session ID are handled safely:

- First request triggers restoration
- Subsequent requests reuse the restored session
- No duplicate session creation
- No race conditions

This ensures correct behavior even under high load or network retries.
