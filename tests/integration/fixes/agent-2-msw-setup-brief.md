# Agent 2: MSW Setup Fix Brief

## Assignment
Fix 6 failing tests in MSW (Mock Service Worker) setup and configuration.

## Files to Fix
- `tests/integration/msw-setup.test.ts` (6 tests)

## Specific Failures to Address

### 1. Workflow Creation with Custom Response (3 retries)
```
FAIL: should handle workflow creation with custom response
Expected: { id: 'custom-workflow-123', name: 'Custom Workflow', active: true }
Actual: { id: 'workflow_1753821017065', ... }
```

### 2. Error Response Handling (3 retries)
```
FAIL: should handle error responses
Expected: { message: 'Workflow not found', code: 'WORKFLOW_NOT_FOUND' }
Actual: { message: 'Workflow not found' } (missing code field)
```

### 3. Rate Limiting Simulation (3 retries)
```
FAIL: should simulate rate limiting
AxiosError: Request failed with status code 501
Expected: Proper rate limit response with 429 status
```

### 4. Webhook Execution (3 retries)
```
FAIL: should handle webhook execution
Expected: { processed: true, workflowId: 'test-workflow' }
Actual: { success: true, ... } (different response structure)
```

### 5. Scoped Handlers (3 retries)
```
FAIL: should work with scoped handlers
AxiosError: Request failed with status code 501
Handler not properly registered or overridden
```

## Root Causes
1. **Handler Override Issues**: Test-specific handlers not properly overriding defaults
2. **Response Structure Mismatch**: Mock responses don't match expected format
3. **Handler Registration Timing**: Handlers registered after server starts
4. **Missing Handler Implementation**: Some endpoints return 501 (Not Implemented)

## Recommended Fixes

### 1. Fix Custom Response Handler
```typescript
it('should handle workflow creation with custom response', async () => {
  // Use res.once() for test-specific override
  server.use(
    rest.post(`${API_BASE_URL}/workflows`, (req, res, ctx) => {
      return res.once(
        ctx.status(201),
        ctx.json({
          data: {
            id: 'custom-workflow-123',
            name: 'Custom Workflow',
            active: true,
            // Include all required fields from the actual response
            nodes: [],
            connections: {},
            settings: {},
            staticData: null,
            tags: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        })
      );
    })
  );

  const response = await axios.post(`${API_BASE_URL}/workflows`, {
    name: 'Custom Workflow',
    nodes: [],
    connections: {}
  });

  expect(response.status).toBe(201);
  expect(response.data.data).toMatchObject({
    id: 'custom-workflow-123',
    name: 'Custom Workflow',
    active: true
  });
});
```

### 2. Fix Error Response Structure
```typescript
it('should handle error responses', async () => {
  server.use(
    rest.get(`${API_BASE_URL}/workflows/:id`, (req, res, ctx) => {
      return res.once(
        ctx.status(404),
        ctx.json({
          message: 'Workflow not found',
          code: 'WORKFLOW_NOT_FOUND',
          status: 'error' // Add any other required fields
        })
      );
    })
  );

  try {
    await axios.get(`${API_BASE_URL}/workflows/non-existent`);
    fail('Should have thrown an error');
  } catch (error: any) {
    expect(error.response.status).toBe(404);
    expect(error.response.data).toEqual({
      message: 'Workflow not found',
      code: 'WORKFLOW_NOT_FOUND',
      status: 'error'
    });
  }
});
```

### 3. Implement Rate Limiting Handler
```typescript
it('should simulate rate limiting', async () => {
  let requestCount = 0;
  
  server.use(
    rest.get(`${API_BASE_URL}/workflows`, (req, res, ctx) => {
      requestCount++;
      
      // Rate limit after 3 requests
      if (requestCount > 3) {
        return res(
          ctx.status(429),
          ctx.json({
            message: 'Rate limit exceeded',
            retryAfter: 60
          }),
          ctx.set('X-RateLimit-Limit', '3'),
          ctx.set('X-RateLimit-Remaining', '0'),
          ctx.set('X-RateLimit-Reset', String(Date.now() + 60000))
        );
      }
      
      return res(
        ctx.status(200),
        ctx.json({ data: [] })
      );
    })
  );

  // Make requests until rate limited
  for (let i = 0; i < 3; i++) {
    const response = await axios.get(`${API_BASE_URL}/workflows`);
    expect(response.status).toBe(200);
  }

  // This should be rate limited
  try {
    await axios.get(`${API_BASE_URL}/workflows`);
    fail('Should have been rate limited');
  } catch (error: any) {
    expect(error.response.status).toBe(429);
    expect(error.response.data.message).toContain('Rate limit');
  }
});
```

### 4. Fix Webhook Handler Response
```typescript
it('should handle webhook execution', async () => {
  const webhookPath = '/webhook-test/abc-123';
  
  server.use(
    rest.post(`${API_BASE_URL}${webhookPath}`, async (req, res, ctx) => {
      const body = await req.json();
      
      return res(
        ctx.status(200),
        ctx.json({
          processed: true,
          workflowId: 'test-workflow',
          receivedData: body,
          executionId: `exec-${Date.now()}`,
          timestamp: new Date().toISOString()
        })
      );
    })
  );

  const testData = { test: 'data' };
  const response = await axios.post(`${API_BASE_URL}${webhookPath}`, testData);

  expect(response.status).toBe(200);
  expect(response.data).toMatchObject({
    processed: true,
    workflowId: 'test-workflow',
    receivedData: testData
  });
});
```

### 5. Setup Proper Handler Scoping
```typescript
describe('scoped handlers', () => {
  // Ensure clean handler state
  beforeEach(() => {
    server.resetHandlers();
  });

  it('should work with scoped handlers', async () => {
    // Register handler for this test only
    server.use(
      rest.get(`${API_BASE_URL}/test-endpoint`, (req, res, ctx) => {
        return res.once(
          ctx.status(200),
          ctx.json({ scoped: true })
        );
      })
    );

    const response = await axios.get(`${API_BASE_URL}/test-endpoint`);
    expect(response.status).toBe(200);
    expect(response.data).toEqual({ scoped: true });

    // Verify handler is not available in next request
    try {
      await axios.get(`${API_BASE_URL}/test-endpoint`);
      // Should fall back to default handler or 404
    } catch (error: any) {
      expect(error.response.status).toBe(404);
    }
  });
});
```

## Testing Strategy
1. Fix one test at a time
2. Ensure handlers are properly reset between tests
3. Verify no interference between test cases
4. Test both success and error scenarios

## Dependencies
- MSW server configuration affects all integration tests
- Changes here may impact Agent 3 (MCP Error) and Agent 6 (Session)

## Success Metrics
- [ ] All 6 MSW setup tests pass
- [ ] No handler conflicts between tests
- [ ] Proper error response formats
- [ ] Rate limiting works correctly
- [ ] Webhook handling matches n8n behavior

## Progress Tracking
Create `/tests/integration/fixes/agent-2-progress.md` and update after each fix:
```markdown
# Agent 2 Progress

## Fixed Tests
- [ ] should handle workflow creation with custom response
- [ ] should handle error responses
- [ ] should simulate rate limiting
- [ ] should handle webhook execution
- [ ] should work with scoped handlers
- [ ] (identify 6th test from full run)

## Blockers
- None yet

## Notes
- [Document any MSW configuration changes]
- [Note any handler patterns established]
```