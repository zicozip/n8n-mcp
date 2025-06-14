# Stream Fix v2.3.2 - Critical Fix for "stream is not readable" Error

## Problem

The "stream is not readable" error was persisting even after implementing the Single-Session architecture in v2.3.1. The error occurred when StreamableHTTPServerTransport tried to read the request stream.

## Root Cause

Express.js middleware `express.json()` was consuming the request body stream before StreamableHTTPServerTransport could read it. In Node.js, streams can only be read once - after consumption, they cannot be read again.

### Code Issue
```javascript
// OLD CODE - This consumed the stream!
app.use(express.json({ 
  limit: '1mb',
  strict: true
}));
```

When StreamableHTTPServerTransport later tried to read the request stream, it was already consumed, resulting in "stream is not readable" error.

## Solution

Remove all body parsing middleware for the `/mcp` endpoint, allowing StreamableHTTPServerTransport to read the raw stream directly.

### Fix Applied
```javascript
// NEW CODE - No body parsing for /mcp endpoint
// DON'T use any body parser globally - StreamableHTTPServerTransport needs raw stream
// Only use JSON parser for specific endpoints that need it
```

## Changes Made

1. **Removed global `express.json()` middleware** from both:
   - `src/http-server-single-session.ts`
   - `src/http-server.ts`

2. **Removed `req.body` access** in logging since body is no longer parsed

3. **Updated version** to 2.3.2 to reflect this critical fix

## Technical Details

### Why This Happens
1. Express middleware runs in order
2. `express.json()` reads the entire request stream and parses it
3. The stream position is at the end after reading
4. StreamableHTTPServerTransport expects to read from position 0
5. Node.js streams are not seekable - once consumed, they're done

### Why StreamableHTTPServerTransport Needs Raw Streams
The transport implements its own request handling and needs to:
- Read the raw JSON-RPC request
- Handle streaming responses via Server-Sent Events (SSE)
- Manage its own parsing and validation

## Testing

After this fix:
1. The MCP server should accept requests without "stream is not readable" errors
2. Authentication still works (uses headers, not body)
3. Health endpoint continues to function (GET request, no body)

## Lessons Learned

1. **Be careful with middleware order** - Body parsing middleware consumes streams
2. **StreamableHTTPServerTransport has specific requirements** - It needs raw access to the request stream
3. **Not all MCP transports are the same** - StreamableHTTP has different needs than stdio transport

## Future Considerations

If we need to log request methods or validate requests before passing to StreamableHTTPServerTransport, we would need to:
1. Implement a custom middleware that buffers the stream
2. Create a new readable stream from the buffer
3. Attach the new stream to the request object

For now, the simplest solution is to not parse the body at all for the `/mcp` endpoint.