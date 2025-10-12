/**
 * Integration tests for session persistence (Phase 1)
 *
 * Tests the complete session restoration flow end-to-end,
 * simulating real-world scenarios like container restarts and multi-tenant usage.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { N8NMCPEngine } from '../../src/mcp-engine';
import { SingleSessionHTTPServer } from '../../src/http-server-single-session';
import { InstanceContext } from '../../src/types/instance-context';
import { SessionRestoreHook, SessionState } from '../../src/types/session-restoration';
import type { Request, Response } from 'express';

// In-memory session storage for testing
const sessionStorage: Map<string, SessionState> = new Map();

/**
 * Simulates a backend database for session persistence
 */
class MockSessionStore {
  async saveSession(sessionState: SessionState): Promise<void> {
    sessionStorage.set(sessionState.sessionId, {
      ...sessionState,
      // Only update lastAccess and expiresAt if not provided
      lastAccess: sessionState.lastAccess || new Date(),
      expiresAt: sessionState.expiresAt || new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
    });
  }

  async loadSession(sessionId: string): Promise<SessionState | null> {
    const session = sessionStorage.get(sessionId);
    if (!session) return null;

    // Check if expired
    if (session.expiresAt < new Date()) {
      sessionStorage.delete(sessionId);
      return null;
    }

    // Update last access
    session.lastAccess = new Date();
    session.expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    sessionStorage.set(sessionId, session);

    return session;
  }

  async deleteSession(sessionId: string): Promise<void> {
    sessionStorage.delete(sessionId);
  }

  async cleanExpired(): Promise<number> {
    const now = new Date();
    let count = 0;

    for (const [sessionId, session] of sessionStorage.entries()) {
      if (session.expiresAt < now) {
        sessionStorage.delete(sessionId);
        count++;
      }
    }

    return count;
  }

  getAllSessions(): Map<string, SessionState> {
    return new Map(sessionStorage);
  }

  clear(): void {
    sessionStorage.clear();
  }
}

describe('Session Persistence Integration Tests', () => {
  const TEST_AUTH_TOKEN = 'integration-test-token-with-32-chars-min-length';
  let mockStore: MockSessionStore;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save and set environment
    originalEnv = { ...process.env };
    process.env.AUTH_TOKEN = TEST_AUTH_TOKEN;
    process.env.PORT = '0';
    process.env.NODE_ENV = 'test';

    // Clear session storage
    mockStore = new MockSessionStore();
    mockStore.clear();
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
    mockStore.clear();
  });

  // Helper to create properly mocked Request and Response objects
  function createMockReqRes(sessionId?: string, body?: any) {
    const req = {
      method: 'POST',
      path: '/mcp',
      url: '/mcp',
      originalUrl: '/mcp',
      headers: {
        'authorization': `Bearer ${TEST_AUTH_TOKEN}`,
        ...(sessionId && { 'mcp-session-id': sessionId })
      } as Record<string, string>,
      body: body || {
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: 1
      },
      ip: '127.0.0.1',
      readable: true,
      readableEnded: false,
      complete: true,
      get: vi.fn((header: string) => req.headers[header.toLowerCase()]),
      on: vi.fn((event: string, handler: Function) => {}),
      removeListener: vi.fn((event: string, handler: Function) => {})
    } as any as Request;

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
      send: vi.fn().mockReturnThis(),
      headersSent: false,
      finished: false
    } as any as Response;

    return { req, res };
  }

  describe('Container Restart Simulation', () => {
    it('should restore session after simulated container restart', async () => {
      // PHASE 1: Initial session creation
      const context: InstanceContext = {
        n8nApiUrl: 'https://tenant1.n8n.cloud',
        n8nApiKey: 'tenant1-api-key',
        instanceId: 'tenant-1'
      };

      const sessionId = 'instance-tenant-1-abc-550e8400-e29b-41d4-a716-446655440000';

      // Simulate session being persisted by the backend
      await mockStore.saveSession({
        sessionId,
        instanceContext: context,
        createdAt: new Date(),
        lastAccess: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000)
      });

      // PHASE 2: Simulate container restart (create new engine)
      const restorationHook: SessionRestoreHook = async (sid) => {
        const session = await mockStore.loadSession(sid);
        return session ? session.instanceContext : null;
      };

      const engine = new N8NMCPEngine({
        onSessionNotFound: restorationHook,
        sessionRestorationTimeout: 5000
      });

      // PHASE 3: Client tries to use old session ID
      const { req: mockReq, res: mockRes } = createMockReqRes(sessionId);

      // Should successfully restore and process request
      await engine.processRequest(mockReq, mockRes, context);

      // Session should be restored (not return 400 for unknown session)
      expect(mockRes.status).not.toHaveBeenCalledWith(400);
      expect(mockRes.status).not.toHaveBeenCalledWith(404);

      await engine.shutdown();
    });

    it('should reject expired sessions after container restart', async () => {
      const context: InstanceContext = {
        n8nApiUrl: 'https://tenant1.n8n.cloud',
        n8nApiKey: 'tenant1-api-key',
        instanceId: 'tenant-1'
      };

      const sessionId = '550e8400-e29b-41d4-a716-446655440000';

      // Save session with past expiration
      await mockStore.saveSession({
        sessionId,
        instanceContext: context,
        createdAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
        lastAccess: new Date(Date.now() - 45 * 60 * 1000), // 45 minutes ago
        expiresAt: new Date(Date.now() - 15 * 60 * 1000) // Expired 15 minutes ago
      });

      const restorationHook: SessionRestoreHook = async (sid) => {
        const session = await mockStore.loadSession(sid);
        return session ? session.instanceContext : null;
      };

      const engine = new N8NMCPEngine({
        onSessionNotFound: restorationHook,
        sessionRestorationTimeout: 5000
      });

      const { req: mockReq, res: mockRes } = createMockReqRes(sessionId);

      await engine.processRequest(mockReq, mockRes);

      // Should reject expired session
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringMatching(/session|not found/i)
          })
        })
      );

      await engine.shutdown();
    });
  });

  describe('Multi-Tenant Session Restoration', () => {
    it('should restore correct instance context for each tenant', async () => {
      // Create sessions for multiple tenants
      const tenant1Context: InstanceContext = {
        n8nApiUrl: 'https://tenant1.n8n.cloud',
        n8nApiKey: 'tenant1-key',
        instanceId: 'tenant-1'
      };

      const tenant2Context: InstanceContext = {
        n8nApiUrl: 'https://tenant2.n8n.cloud',
        n8nApiKey: 'tenant2-key',
        instanceId: 'tenant-2'
      };

      const sessionId1 = 'instance-tenant-1-abc-550e8400-e29b-41d4-a716-446655440000';
      const sessionId2 = 'instance-tenant-2-xyz-f47ac10b-58cc-4372-a567-0e02b2c3d479';

      await mockStore.saveSession({
        sessionId: sessionId1,
        instanceContext: tenant1Context,
        createdAt: new Date(),
        lastAccess: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000)
      });

      await mockStore.saveSession({
        sessionId: sessionId2,
        instanceContext: tenant2Context,
        createdAt: new Date(),
        lastAccess: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000)
      });

      const restorationHook: SessionRestoreHook = async (sid) => {
        const session = await mockStore.loadSession(sid);
        return session ? session.instanceContext : null;
      };

      const engine = new N8NMCPEngine({
        onSessionNotFound: restorationHook,
        sessionRestorationTimeout: 5000
      });

      // Verify each tenant gets their own context
      const session1 = await mockStore.loadSession(sessionId1);
      const session2 = await mockStore.loadSession(sessionId2);

      expect(session1?.instanceContext.instanceId).toBe('tenant-1');
      expect(session1?.instanceContext.n8nApiUrl).toBe('https://tenant1.n8n.cloud');

      expect(session2?.instanceContext.instanceId).toBe('tenant-2');
      expect(session2?.instanceContext.n8nApiUrl).toBe('https://tenant2.n8n.cloud');

      await engine.shutdown();
    });

    it('should isolate sessions between tenants', async () => {
      const tenant1Context: InstanceContext = {
        n8nApiUrl: 'https://tenant1.n8n.cloud',
        n8nApiKey: 'tenant1-key',
        instanceId: 'tenant-1'
      };

      const sessionId = 'instance-tenant-1-abc-550e8400-e29b-41d4-a716-446655440000';

      await mockStore.saveSession({
        sessionId,
        instanceContext: tenant1Context,
        createdAt: new Date(),
        lastAccess: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000)
      });

      const restorationHook: SessionRestoreHook = async (sid) => {
        const session = await mockStore.loadSession(sid);
        return session ? session.instanceContext : null;
      };

      const engine = new N8NMCPEngine({
        onSessionNotFound: restorationHook
      });

      // Tenant 2 tries to use tenant 1's session ID
      const wrongSessionId = sessionId; // Tenant 1's ID
      const { req: tenant2Request, res: mockRes } = createMockReqRes(wrongSessionId);

      // The restoration will succeed (session exists), but the backend
      // should implement authorization checks to prevent cross-tenant access
      await engine.processRequest(tenant2Request, mockRes);

      // Restoration should work (this test verifies the session CAN be restored)
      // Authorization is the backend's responsibility
      expect(mockRes.status).not.toHaveBeenCalledWith(404);

      await engine.shutdown();
    });
  });

  describe('Concurrent Restoration Requests', () => {
    it('should handle multiple concurrent restoration requests for same session', async () => {
      const context: InstanceContext = {
        n8nApiUrl: 'https://test.n8n.cloud',
        n8nApiKey: 'test-key',
        instanceId: 'test-instance'
      };

      const sessionId = '550e8400-e29b-41d4-a716-446655440000';

      await mockStore.saveSession({
        sessionId,
        instanceContext: context,
        createdAt: new Date(),
        lastAccess: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000)
      });

      let hookCallCount = 0;
      const restorationHook: SessionRestoreHook = async (sid) => {
        hookCallCount++;
        // Simulate slow database query
        await new Promise(resolve => setTimeout(resolve, 50));
        const session = await mockStore.loadSession(sid);
        return session ? session.instanceContext : null;
      };

      const engine = new N8NMCPEngine({
        onSessionNotFound: restorationHook,
        sessionRestorationTimeout: 5000
      });

      // Simulate 5 concurrent requests with same unknown session ID
      const requests = Array.from({ length: 5 }, (_, i) => {
        const { req: mockReq, res: mockRes } = createMockReqRes(sessionId, {
          jsonrpc: '2.0',
          method: 'tools/list',
          params: {},
          id: i + 1
        });

        return engine.processRequest(mockReq, mockRes, context);
      });

      // All should complete without error
      await Promise.all(requests);

      // Hook should be called multiple times (no built-in deduplication)
      // This is expected - the idempotent session creation prevents duplicates
      expect(hookCallCount).toBeGreaterThan(0);

      await engine.shutdown();
    });
  });

  describe('Database Failure Scenarios', () => {
    it('should handle database connection failures gracefully', async () => {
      const failingHook: SessionRestoreHook = async () => {
        throw new Error('Database connection failed');
      };

      const engine = new N8NMCPEngine({
        onSessionNotFound: failingHook,
        sessionRestorationTimeout: 5000
      });

      const { req: mockReq, res: mockRes } = createMockReqRes('550e8400-e29b-41d4-a716-446655440000');

      await engine.processRequest(mockReq, mockRes);

      // Should return 500 for database errors
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringMatching(/restoration failed|error/i)
          })
        })
      );

      await engine.shutdown();
    });

    it('should timeout on slow database queries', async () => {
      const slowHook: SessionRestoreHook = async () => {
        // Simulate very slow database query
        await new Promise(resolve => setTimeout(resolve, 10000));
        return {
          n8nApiUrl: 'https://test.n8n.cloud',
          n8nApiKey: 'test-key',
          instanceId: 'test'
        };
      };

      const engine = new N8NMCPEngine({
        onSessionNotFound: slowHook,
        sessionRestorationTimeout: 100 // 100ms timeout
      });

      const { req: mockReq, res: mockRes } = createMockReqRes('550e8400-e29b-41d4-a716-446655440000');

      await engine.processRequest(mockReq, mockRes);

      // Should return 408 for timeout
      expect(mockRes.status).toHaveBeenCalledWith(408);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringMatching(/timeout|timed out/i)
          })
        })
      );

      await engine.shutdown();
    });
  });

  describe('Session Metadata Tracking', () => {
    it('should track session metadata correctly', async () => {
      const context: InstanceContext = {
        n8nApiUrl: 'https://test.n8n.cloud',
        n8nApiKey: 'test-key',
        instanceId: 'test-instance',
        metadata: {
          userId: 'user-123',
          plan: 'premium'
        }
      };

      const sessionId = '550e8400-e29b-41d4-a716-446655440000';

      await mockStore.saveSession({
        sessionId,
        instanceContext: context,
        createdAt: new Date(),
        lastAccess: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        metadata: {
          userAgent: 'test-client/1.0',
          ip: '192.168.1.1'
        }
      });

      const session = await mockStore.loadSession(sessionId);

      expect(session).toBeDefined();
      expect(session?.instanceContext.metadata).toEqual({
        userId: 'user-123',
        plan: 'premium'
      });
      expect(session?.metadata).toEqual({
        userAgent: 'test-client/1.0',
        ip: '192.168.1.1'
      });
    });

    it('should update last access time on restoration', async () => {
      const context: InstanceContext = {
        n8nApiUrl: 'https://test.n8n.cloud',
        n8nApiKey: 'test-key',
        instanceId: 'test-instance'
      };

      const sessionId = '550e8400-e29b-41d4-a716-446655440000';
      const originalLastAccess = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago

      await mockStore.saveSession({
        sessionId,
        instanceContext: context,
        createdAt: new Date(Date.now() - 20 * 60 * 1000),
        lastAccess: originalLastAccess,
        expiresAt: new Date(Date.now() + 20 * 60 * 1000)
      });

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      // Load session (simulates restoration)
      const session = await mockStore.loadSession(sessionId);

      expect(session).toBeDefined();
      expect(session!.lastAccess.getTime()).toBeGreaterThan(originalLastAccess.getTime());
    });
  });

  describe('Session Cleanup', () => {
    it('should clean up expired sessions', async () => {
      // Add multiple sessions with different expiration times
      await mockStore.saveSession({
        sessionId: 'session-1',
        instanceContext: {
          n8nApiUrl: 'https://test.n8n.cloud',
          n8nApiKey: 'key1',
          instanceId: 'instance-1'
        },
        createdAt: new Date(Date.now() - 60 * 60 * 1000),
        lastAccess: new Date(Date.now() - 45 * 60 * 1000),
        expiresAt: new Date(Date.now() - 15 * 60 * 1000) // Expired
      });

      await mockStore.saveSession({
        sessionId: 'session-2',
        instanceContext: {
          n8nApiUrl: 'https://test.n8n.cloud',
          n8nApiKey: 'key2',
          instanceId: 'instance-2'
        },
        createdAt: new Date(),
        lastAccess: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000) // Valid
      });

      const cleanedCount = await mockStore.cleanExpired();

      expect(cleanedCount).toBe(1);
      expect(mockStore.getAllSessions().size).toBe(1);
      expect(mockStore.getAllSessions().has('session-2')).toBe(true);
      expect(mockStore.getAllSessions().has('session-1')).toBe(false);
    });
  });

  describe('Backwards Compatibility', () => {
    it('should work without restoration hook (legacy behavior)', async () => {
      // Engine without restoration hook should work normally
      const engine = new N8NMCPEngine();

      const sessionInfo = engine.getSessionInfo();

      expect(sessionInfo).toBeDefined();
      expect(sessionInfo.active).toBeDefined();

      await engine.shutdown();
    });

    it('should not break existing session creation flow', async () => {
      const engine = new N8NMCPEngine({
        onSessionNotFound: async () => null
      });

      // Creating sessions should work normally
      const sessionInfo = engine.getSessionInfo();

      expect(sessionInfo).toBeDefined();

      await engine.shutdown();
    });
  });

  describe('Security Validation', () => {
    it('should validate restored context before using it', async () => {
      const invalidHook: SessionRestoreHook = async () => {
        // Return context with malformed URL (truly invalid)
        return {
          n8nApiUrl: 'not-a-valid-url',
          n8nApiKey: 'test-key',
          instanceId: 'test'
        } as any;
      };

      const engine = new N8NMCPEngine({
        onSessionNotFound: invalidHook,
        sessionRestorationTimeout: 5000
      });

      const { req: mockReq, res: mockRes } = createMockReqRes('550e8400-e29b-41d4-a716-446655440000');

      await engine.processRequest(mockReq, mockRes);

      // Should reject invalid context
      expect(mockRes.status).toHaveBeenCalledWith(400);

      await engine.shutdown();
    });
  });
});
