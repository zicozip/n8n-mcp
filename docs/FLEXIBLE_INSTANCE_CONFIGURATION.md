# Flexible Instance Configuration

## Overview

The Flexible Instance Configuration feature enables n8n-mcp to serve multiple users with different n8n instances dynamically, without requiring separate deployments for each user. This feature is designed for scenarios where n8n-mcp is hosted centrally and needs to connect to different n8n instances based on runtime context.

## Architecture

### Core Components

1. **InstanceContext Interface** (`src/types/instance-context.ts`)
   - Runtime configuration container for instance-specific settings
   - Optional fields for backward compatibility
   - Comprehensive validation with security checks

2. **Dual-Mode API Client**
   - **Singleton Mode**: Uses environment variables (backward compatible)
   - **Instance Mode**: Uses runtime context for multi-instance support
   - Automatic fallback between modes

3. **LRU Cache with Security**
   - SHA-256 hashed cache keys for security
   - 30-minute TTL with automatic cleanup
   - Maximum 100 concurrent instances
   - Secure dispose callbacks without logging sensitive data

4. **Session Management**
   - HTTP server tracks session context
   - Each session can have different instance configuration
   - Automatic cleanup on session end

## Configuration

### InstanceContext Structure

```typescript
interface InstanceContext {
  n8nApiUrl?: string;        // n8n instance URL
  n8nApiKey?: string;        // API key for authentication
  n8nApiTimeout?: number;    // Request timeout in ms (default: 30000)
  n8nApiMaxRetries?: number; // Max retry attempts (default: 3)
  instanceId?: string;       // Unique instance identifier
  sessionId?: string;        // Session identifier
  metadata?: Record<string, any>; // Additional metadata
}
```

### Validation Rules

1. **URL Validation**:
   - Must be valid HTTP/HTTPS URL
   - No file://, javascript:, or other dangerous protocols
   - Proper URL format with protocol and host

2. **API Key Validation**:
   - Non-empty string required when provided
   - No placeholder values (e.g., "YOUR_API_KEY")
   - Case-insensitive placeholder detection

3. **Numeric Validation**:
   - Timeout must be positive number (>0)
   - Max retries must be non-negative (≥0)
   - No Infinity or NaN values

## Usage Examples

### Basic Usage

```typescript
import { getN8nApiClient } from './mcp/handlers-n8n-manager';
import { InstanceContext } from './types/instance-context';

// Create context for a specific instance
const context: InstanceContext = {
  n8nApiUrl: 'https://customer1.n8n.cloud',
  n8nApiKey: 'customer1-api-key',
  instanceId: 'customer1'
};

// Get client for this instance
const client = getN8nApiClient(context);
if (client) {
  // Use client for API operations
  const workflows = await client.getWorkflows();
}
```

### HTTP Server Integration

```typescript
// In HTTP request handler
app.post('/mcp', (req, res) => {
  const context: InstanceContext = {
    n8nApiUrl: req.headers['x-n8n-url'],
    n8nApiKey: req.headers['x-n8n-key'],
    sessionId: req.sessionID
  };

  // Context passed to handlers
  const result = await handleRequest(req.body, context);
  res.json(result);
});
```

### Validation Example

```typescript
import { validateInstanceContext } from './types/instance-context';

const context: InstanceContext = {
  n8nApiUrl: 'https://api.n8n.cloud',
  n8nApiKey: 'valid-key'
};

const validation = validateInstanceContext(context);
if (!validation.valid) {
  console.error('Validation errors:', validation.errors);
} else {
  // Context is valid, proceed
  const client = getN8nApiClient(context);
}
```

## Security Features

### 1. Cache Key Hashing
- All cache keys use SHA-256 hashing
- Prevents sensitive data exposure in logs
- Example: `sha256(url:key:instance)` → 64-char hex string

### 2. Input Validation
- Comprehensive validation before processing
- URL protocol restrictions (HTTP/HTTPS only)
- API key placeholder detection
- Numeric range validation

### 3. Secure Logging
- Only first 8 characters of cache keys logged
- No sensitive data in debug logs
- URL sanitization (domain only, no paths)

### 4. Memory Management
- LRU cache with automatic eviction
- TTL-based expiration (30 minutes)
- Dispose callbacks for cleanup
- Maximum cache size limits

## Performance Optimization

### Cache Strategy
- **Max Size**: 100 instances
- **TTL**: 30 minutes
- **Update on Access**: Age refreshed on each use
- **Eviction**: Least Recently Used policy

### Benefits
- ~12ms average response time
- Minimal memory footprint per instance
- Automatic cleanup of unused instances
- No memory leaks with proper disposal

## Backward Compatibility

The feature maintains 100% backward compatibility:

1. **Environment Variables Still Work**:
   - If no context provided, falls back to env vars
   - Existing deployments continue working unchanged

2. **Optional Parameters**:
   - All context fields are optional
   - Missing fields use defaults or env vars

3. **API Unchanged**:
   - Same handler signatures with optional context
   - No breaking changes to existing code

## Testing

Comprehensive test coverage ensures reliability:

```bash
# Run all flexible instance tests
npm test -- tests/unit/flexible-instance-security-advanced.test.ts
npm test -- tests/unit/mcp/lru-cache-behavior.test.ts
npm test -- tests/unit/types/instance-context-coverage.test.ts
npm test -- tests/unit/mcp/handlers-n8n-manager-simple.test.ts
```

### Test Coverage Areas
- Input validation edge cases
- Cache behavior and eviction
- Security (hashing, sanitization)
- Session management
- Memory leak prevention
- Concurrent access patterns

## Migration Guide

### For Existing Deployments
No changes required - environment variables continue to work.

### For Multi-Instance Support

1. **Update HTTP Server** (if using HTTP mode):
```typescript
// Add context extraction from headers
const context = extractInstanceContext(req);
```

2. **Pass Context to Handlers**:
```typescript
// Old way (still works)
await handleListWorkflows(params);

// New way (with instance context)
await handleListWorkflows(params, context);
```

3. **Configure Clients** to send instance information:
```typescript
// Client sends instance info in headers
headers: {
  'X-N8n-Url': 'https://instance.n8n.cloud',
  'X-N8n-Key': 'api-key',
  'X-Instance-Id': 'customer-123'
}
```

## Monitoring

### Metrics to Track
- Cache hit/miss ratio
- Instance count in cache
- Average TTL utilization
- Memory usage per instance
- API client creation rate

### Debug Logging
Enable debug logs to monitor cache behavior:
```bash
LOG_LEVEL=debug npm start
```

## Limitations

1. **Maximum Instances**: 100 concurrent instances (configurable)
2. **TTL**: 30-minute cache lifetime (configurable)
3. **Memory**: ~1MB per cached instance (estimated)
4. **Validation**: Strict validation may reject edge cases

## Security Considerations

1. **Never Log Sensitive Data**: API keys are never logged
2. **Hash All Identifiers**: Use SHA-256 for cache keys
3. **Validate All Input**: Comprehensive validation before use
4. **Limit Resources**: Cache size and TTL limits
5. **Clean Up Properly**: Dispose callbacks for resource cleanup

## Future Enhancements

Potential improvements for future versions:

1. **Configurable Cache Settings**: Runtime cache size/TTL configuration
2. **Instance Metrics**: Per-instance usage tracking
3. **Rate Limiting**: Per-instance rate limits
4. **Instance Groups**: Logical grouping of instances
5. **Persistent Cache**: Optional Redis/database backing
6. **Instance Discovery**: Automatic instance detection

## Support

For issues or questions about flexible instance configuration:
1. Check validation errors for specific problems
2. Enable debug logging for detailed diagnostics
3. Review test files for usage examples
4. Open an issue on GitHub with details