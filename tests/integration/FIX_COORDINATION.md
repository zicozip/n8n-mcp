# Integration Test Fix Coordination Strategy

## Overview
58 failing integration tests across 6 categories. Each category assigned to a dedicated fix agent working in parallel.

## Test Failure Categories

### 1. Database Isolation (9 tests) - Agent 1
- **Files**: `tests/integration/database/*.test.ts`
- **Key Issues**:
  - Database disk image corruption
  - UNIQUE constraint violations
  - Transaction handling failures
  - Concurrent access issues

### 2. MSW Setup (6 tests) - Agent 2
- **Files**: `tests/integration/msw-setup.test.ts`
- **Key Issues**:
  - Custom handler responses not matching expectations
  - Rate limiting simulation failing
  - Webhook execution response format mismatches
  - Scoped handler registration issues

### 3. MCP Error Handling (16 tests) - Agent 3
- **Files**: `tests/integration/mcp-protocol/error-handling.test.ts`
- **Key Issues**:
  - Invalid params error handling
  - Empty search query validation
  - Malformed workflow structure handling
  - Large payload processing
  - Unicode/special character handling

### 4. FTS5 Search (7 tests) - Agent 4
- **Files**: `tests/integration/database/fts5-search.test.ts`
- **Key Issues**:
  - Multi-column search returning extra results
  - NOT query failures
  - FTS trigger synchronization
  - Performance test data conflicts

### 5. Performance Thresholds (15 tests) - Agent 5
- **Files**: `tests/integration/mcp-protocol/performance.test.ts`, `tests/integration/database/performance.test.ts`
- **Key Issues**:
  - Large data handling timeouts
  - Memory efficiency thresholds
  - Response time benchmarks
  - Concurrent request handling

### 6. Session Management (5 tests) - Agent 6
- **Files**: `tests/integration/mcp-protocol/session-management.test.ts`
- **Key Issues**:
  - Test timeouts
  - Session state persistence
  - Concurrent session handling

## Coordination Rules

### 1. No Conflict Zones
Each agent works on separate test files to avoid merge conflicts:
- Agent 1: `database/*.test.ts` (except fts5-search.test.ts and performance.test.ts)
- Agent 2: `msw-setup.test.ts`
- Agent 3: `mcp-protocol/error-handling.test.ts`
- Agent 4: `database/fts5-search.test.ts`
- Agent 5: `*/performance.test.ts`
- Agent 6: `mcp-protocol/session-management.test.ts`

### 2. Shared Resource Management
- **Database**: Agents 1, 4 must coordinate on database schema changes
- **MSW Handlers**: Agent 2 owns all MSW handler modifications
- **Test Utilities**: Changes to shared test utilities require coordination

### 3. Dependencies
```
Agent 2 (MSW) → Agent 3 (MCP Error) → Agent 6 (Session)
Agent 1 (DB) → Agent 4 (FTS5)
Agent 5 (Performance) depends on all others for stable baselines
```

### 4. Success Criteria
Each agent must achieve:
- [ ] All assigned tests passing
- [ ] No regression in other test suites
- [ ] Performance maintained or improved
- [ ] Clear documentation of changes

### 5. Progress Tracking
Each agent creates a progress file:
- `/tests/integration/fixes/agent-X-progress.md`
- Update after each test fix
- Document any blockers or dependencies

## Common Solutions

### Database Isolation
```typescript
// Use unique database per test
const testDb = `:memory:test-${Date.now()}-${Math.random()}`;

// Proper cleanup
afterEach(async () => {
  await db.close();
  // Force garbage collection if needed
});
```

### MSW Handler Reset
```typescript
// Reset handlers after each test
afterEach(() => {
  server.resetHandlers();
});

// Use scoped handlers for specific tests
server.use(
  rest.post('/api/workflows', (req, res, ctx) => {
    return res.once(ctx.json({ /* test-specific response */ }));
  })
);
```

### Error Validation
```typescript
// Consistent error checking
await expect(async () => {
  await mcpClient.request('tools/call', params);
}).rejects.toThrow(/specific error pattern/);
```

### Performance Baselines
```typescript
// Adjust thresholds based on CI environment
const TIMEOUT = process.env.CI ? 200 : 100;
expect(duration).toBeLessThan(TIMEOUT);
```

## Communication Protocol

1. **Blockers**: Report immediately in progress file
2. **Schema Changes**: Announce in coordination channel
3. **Utility Changes**: Create PR for review
4. **Success**: Update progress file and move to next test

## Final Integration
Once all agents complete:
1. Run full test suite
2. Merge all fixes
3. Update CI configuration if needed
4. Document any new test patterns