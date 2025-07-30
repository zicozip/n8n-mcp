# Agent 6: Session Management Fix Brief

## Assignment
Fix 5 failing tests related to MCP session management and state persistence.

## Files to Fix
- `tests/integration/mcp-protocol/session-management.test.ts` (5 tests)

## Specific Failures to Address
Based on the timeout issue observed, the session management tests are likely failing due to:

1. **Session Creation Timeout**
   - Session initialization taking too long
   - Missing or slow handshake process

2. **Session State Persistence**
   - State not properly saved between requests
   - Session data corruption or loss

3. **Concurrent Session Handling**
   - Race conditions with multiple sessions
   - Session ID conflicts

4. **Session Cleanup**
   - Sessions not properly terminated
   - Resource leaks causing subsequent timeouts

5. **Session Recovery**
   - Failed session recovery after disconnect
   - Invalid session state after errors

## Root Causes
1. **Timeout Configuration**: Default timeout too short for session operations
2. **State Management**: Session state not properly isolated
3. **Resource Cleanup**: Sessions leaving connections open
4. **Synchronization**: Async operations not properly awaited

## Recommended Fixes

### 1. Fix Session Creation and Timeout
```typescript
describe('Session Management', () => {
  let mcpClient: MCPClient;
  let sessionManager: SessionManager;
  
  // Increase timeout for session tests
  jest.setTimeout(30000);
  
  beforeEach(async () => {
    sessionManager = new SessionManager();
    mcpClient = new MCPClient({
      sessionManager,
      timeout: 10000 // Explicit timeout
    });
    
    // Ensure clean session state
    await sessionManager.clearAllSessions();
  });
  
  afterEach(async () => {
    // Proper cleanup
    await mcpClient.close();
    await sessionManager.clearAllSessions();
  });
  
  it('should create new session successfully', async () => {
    const sessionId = await mcpClient.createSession({
      clientId: 'test-client',
      capabilities: ['tools', 'resources']
    });
    
    expect(sessionId).toBeDefined();
    expect(typeof sessionId).toBe('string');
    
    // Verify session is active
    const session = await sessionManager.getSession(sessionId);
    expect(session).toBeDefined();
    expect(session.status).toBe('active');
  });
});
```

### 2. Implement Proper Session State Management
```typescript
class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private locks: Map<string, Promise<void>> = new Map();
  
  async createSession(config: SessionConfig): Promise<string> {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const session: Session = {
      id: sessionId,
      clientId: config.clientId,
      capabilities: config.capabilities,
      state: {},
      status: 'active',
      createdAt: new Date(),
      lastActivity: new Date()
    };
    
    this.sessions.set(sessionId, session);
    
    // Initialize session state
    await this.initializeSessionState(sessionId);
    
    return sessionId;
  }
  
  async getSession(sessionId: string): Promise<Session | null> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
    }
    return session || null;
  }
  
  async updateSessionState(sessionId: string, updates: Partial<SessionState>): Promise<void> {
    // Use lock to prevent concurrent updates
    const lockKey = `update-${sessionId}`;
    
    while (this.locks.has(lockKey)) {
      await this.locks.get(lockKey);
    }
    
    const lockPromise = this._updateSessionState(sessionId, updates);
    this.locks.set(lockKey, lockPromise);
    
    try {
      await lockPromise;
    } finally {
      this.locks.delete(lockKey);
    }
  }
  
  private async _updateSessionState(sessionId: string, updates: Partial<SessionState>): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    session.state = { ...session.state, ...updates };
    session.lastActivity = new Date();
  }
  
  async clearAllSessions(): Promise<void> {
    // Wait for all locks to clear
    await Promise.all(Array.from(this.locks.values()));
    
    // Close all sessions
    for (const session of this.sessions.values()) {
      await this.closeSession(session.id);
    }
    
    this.sessions.clear();
  }
  
  private async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'closed';
      // Cleanup any resources
      if (session.resources) {
        await this.cleanupSessionResources(session);
      }
    }
  }
}
```

### 3. Fix Concurrent Session Tests
```typescript
it('should handle concurrent sessions', async () => {
  const numSessions = 5;
  const sessionPromises = [];
  
  // Create multiple sessions concurrently
  for (let i = 0; i < numSessions; i++) {
    sessionPromises.push(
      mcpClient.createSession({
        clientId: `client-${i}`,
        capabilities: ['tools']
      })
    );
  }
  
  const sessionIds = await Promise.all(sessionPromises);
  
  // All sessions should be unique
  const uniqueIds = new Set(sessionIds);
  expect(uniqueIds.size).toBe(numSessions);
  
  // Each session should be independently accessible
  const verifyPromises = sessionIds.map(async (id) => {
    const session = await sessionManager.getSession(id);
    expect(session).toBeDefined();
    expect(session.status).toBe('active');
  });
  
  await Promise.all(verifyPromises);
});
```

### 4. Implement Session Recovery
```typescript
it('should recover session after disconnect', async () => {
  // Create session
  const sessionId = await mcpClient.createSession({
    clientId: 'test-client',
    capabilities: ['tools']
  });
  
  // Store some state
  await mcpClient.request('session/update', {
    sessionId,
    state: { counter: 5, lastTool: 'list_nodes' }
  });
  
  // Simulate disconnect
  await mcpClient.disconnect();
  
  // Reconnect with same session ID
  const newClient = new MCPClient({ sessionManager });
  await newClient.resumeSession(sessionId);
  
  // Verify state is preserved
  const session = await sessionManager.getSession(sessionId);
  expect(session.state.counter).toBe(5);
  expect(session.state.lastTool).toBe('list_nodes');
});
```

### 5. Add Session Timeout Handling
```typescript
it('should handle session timeouts gracefully', async () => {
  // Create session with short timeout
  const sessionId = await mcpClient.createSession({
    clientId: 'test-client',
    capabilities: ['tools'],
    timeout: 1000 // 1 second
  });
  
  // Wait for timeout
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // Session should be expired
  const session = await sessionManager.getSession(sessionId);
  expect(session.status).toBe('expired');
  
  // Attempting to use expired session should create new one
  const response = await mcpClient.request('tools/list', { sessionId });
  expect(response.newSessionId).toBeDefined();
  expect(response.newSessionId).not.toBe(sessionId);
});
```

### 6. Session Cleanup Helper
```typescript
class SessionCleanupService {
  private cleanupInterval: NodeJS.Timeout | null = null;
  
  start(sessionManager: SessionManager, intervalMs: number = 60000): void {
    this.cleanupInterval = setInterval(async () => {
      await this.cleanupExpiredSessions(sessionManager);
    }, intervalMs);
  }
  
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
  
  async cleanupExpiredSessions(sessionManager: SessionManager): Promise<void> {
    const now = new Date();
    const sessions = await sessionManager.getAllSessions();
    
    for (const session of sessions) {
      const inactiveTime = now.getTime() - session.lastActivity.getTime();
      
      // Expire after 30 minutes of inactivity
      if (inactiveTime > 30 * 60 * 1000) {
        await sessionManager.expireSession(session.id);
      }
    }
  }
}
```

## Testing Strategy
1. Increase timeouts for session tests
2. Ensure proper cleanup between tests
3. Test both success and failure scenarios
4. Verify resource cleanup
5. Test concurrent session scenarios

## Dependencies
- Depends on Agent 3 (MCP Error) for proper error handling
- May need MSW handlers from Agent 2 for session API mocking

## Success Metrics
- [ ] All 5 session management tests pass
- [ ] No timeout errors
- [ ] Sessions properly isolated
- [ ] Resources cleaned up after tests
- [ ] Concurrent sessions handled correctly

## Progress Tracking
Create `/tests/integration/fixes/agent-6-progress.md` and update after each fix:
```markdown
# Agent 6 Progress

## Fixed Tests
- [ ] should create new session successfully
- [ ] should persist session state
- [ ] should handle concurrent sessions
- [ ] should recover session after disconnect
- [ ] should handle session timeouts gracefully

## Blockers
- None yet

## Notes
- [Document session management improvements]
- [Note any timeout adjustments made]
```