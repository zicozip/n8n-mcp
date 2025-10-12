/**
 * Integration tests for Session Lifecycle Events (Phase 3) and Retry Policy (Phase 4)
 *
 * Tests complete event flow and retry behavior in realistic scenarios
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { N8NMCPEngine } from '../../src/mcp-engine';
import { InstanceContext } from '../../src/types/instance-context';
import { SessionRestoreHook, SessionState } from '../../src/types/session-restoration';
import type { Request, Response } from 'express';

// In-memory session storage for testing
const sessionStorage: Map<string, SessionState> = new Map();

/**
 * Mock session store with failure simulation
 */
class MockSessionStore {
  private failureCount = 0;
  private maxFailures = 0;

  /**
   * Configure transient failures for retry testing
   */
  setTransientFailures(count: number): void {
    this.failureCount = 0;
    this.maxFailures = count;
  }

  async saveSession(sessionState: SessionState): Promise<void> {
    sessionStorage.set(sessionState.sessionId, {
      ...sessionState,
      lastAccess: sessionState.lastAccess || new Date(),
      expiresAt: sessionState.expiresAt || new Date(Date.now() + 30 * 60 * 1000)
    });
  }

  async loadSession(sessionId: string): Promise<InstanceContext | null> {
    // Simulate transient failures
    if (this.failureCount < this.maxFailures) {
      this.failureCount++;
      throw new Error(`Transient database error (attempt ${this.failureCount})`);
    }

    const session = sessionStorage.get(sessionId);
    if (!session) return null;

    // Check if expired
    if (session.expiresAt < new Date()) {
      sessionStorage.delete(sessionId);
      return null;
    }

    return session.instanceContext;
  }

  async deleteSession(sessionId: string): Promise<void> {
    sessionStorage.delete(sessionId);
  }

  clear(): void {
    sessionStorage.clear();
    this.failureCount = 0;
    this.maxFailures = 0;
  }
}

describe('Session Lifecycle Events & Retry Policy Integration Tests', () => {
  const TEST_AUTH_TOKEN = 'lifecycle-retry-test-token-32-chars-min';
  let mockStore: MockSessionStore;
  let originalEnv: NodeJS.ProcessEnv;

  // Event tracking
  let eventLog: Array<{ event: string; sessionId: string; timestamp: number }> = [];

  beforeEach(() => {
    // Save and set environment
    originalEnv = { ...process.env };
    process.env.AUTH_TOKEN = TEST_AUTH_TOKEN;
    process.env.PORT = '0';
    process.env.NODE_ENV = 'test';

    // Clear storage and events
    mockStore = new MockSessionStore();
    mockStore.clear();
    eventLog = [];
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
    mockStore.clear();
    eventLog = [];
    vi.clearAllMocks();
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

  // Helper to track events
  function createEventTracker() {
    return {
      onSessionCreated: vi.fn((sessionId: string) => {
        eventLog.push({ event: 'created', sessionId, timestamp: Date.now() });
      }),
      onSessionRestored: vi.fn((sessionId: string) => {
        eventLog.push({ event: 'restored', sessionId, timestamp: Date.now() });
      }),
      onSessionAccessed: vi.fn((sessionId: string) => {
        eventLog.push({ event: 'accessed', sessionId, timestamp: Date.now() });
      }),
      onSessionExpired: vi.fn((sessionId: string) => {
        eventLog.push({ event: 'expired', sessionId, timestamp: Date.now() });
      }),
      onSessionDeleted: vi.fn((sessionId: string) => {
        eventLog.push({ event: 'deleted', sessionId, timestamp: Date.now() });
      })
    };
  }

  describe('Phase 3: Session Lifecycle Events', () => {
    it('should emit onSessionCreated for new sessions', async () => {
      const events = createEventTracker();
      const engine = new N8NMCPEngine({
        sessionEvents: events
      });

      const context: InstanceContext = {
        n8nApiUrl: 'https://test.n8n.cloud',
        n8nApiKey: 'test-key',
        instanceId: 'test-instance'
      };

      // Create session using public API
      const sessionId = 'instance-test-abc-new-session-lifecycle-test';
      const created = engine.restoreSession(sessionId, context);

      expect(created).toBe(true);

      // Give fire-and-forget events a moment
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should have emitted onSessionCreated
      expect(events.onSessionCreated).toHaveBeenCalledTimes(1);
      expect(events.onSessionCreated).toHaveBeenCalledWith(sessionId, context);

      await engine.shutdown();
    });

    it('should emit onSessionRestored when restoring from storage', async () => {
      const context: InstanceContext = {
        n8nApiUrl: 'https://tenant1.n8n.cloud',
        n8nApiKey: 'tenant1-key',
        instanceId: 'tenant-1'
      };

      const sessionId = 'instance-tenant-1-abc-restored-session-test';

      // Persist session
      await mockStore.saveSession({
        sessionId,
        instanceContext: context,
        createdAt: new Date(),
        lastAccess: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000)
      });

      const restorationHook: SessionRestoreHook = async (sid) => {
        return await mockStore.loadSession(sid);
      };

      const events = createEventTracker();
      const engine = new N8NMCPEngine({
        onSessionNotFound: restorationHook,
        sessionEvents: events
      });

      // Process request that triggers restoration (DON'T pass context - let it restore)
      const { req: mockReq, res: mockRes } = createMockReqRes(sessionId);
      await engine.processRequest(mockReq, mockRes);

      // Give fire-and-forget events a moment
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should emit onSessionRestored (not onSessionCreated)
      // Note: If context was passed to processRequest, it would create instead of restore
      expect(events.onSessionRestored).toHaveBeenCalledTimes(1);
      expect(events.onSessionRestored).toHaveBeenCalledWith(sessionId, context);

      await engine.shutdown();
    });

    it('should emit onSessionDeleted when session is manually deleted', async () => {
      const events = createEventTracker();
      const engine = new N8NMCPEngine({
        sessionEvents: events
      });

      const context: InstanceContext = {
        n8nApiUrl: 'https://test.n8n.cloud',
        n8nApiKey: 'test-key',
        instanceId: 'test-instance'
      };

      const sessionId = 'instance-testinstance-abc-550e8400e29b41d4a716446655440001';

      // Create session by calling restoreSession
      const created = engine.restoreSession(sessionId, context);
      expect(created).toBe(true);

      // Verify session exists
      expect(engine.getActiveSessions()).toContain(sessionId);

      // Give creation event time to fire
      await new Promise(resolve => setTimeout(resolve, 50));

      // Delete session
      const deleted = engine.deleteSession(sessionId);
      expect(deleted).toBe(true);

      // Verify session was deleted
      expect(engine.getActiveSessions()).not.toContain(sessionId);

      // Give deletion event time to fire
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should emit onSessionDeleted
      expect(events.onSessionDeleted).toHaveBeenCalledTimes(1);
      expect(events.onSessionDeleted).toHaveBeenCalledWith(sessionId);

      await engine.shutdown();
    });

    it('should handle event handler errors gracefully', async () => {
      const errorHandler = vi.fn(() => {
        throw new Error('Event handler error');
      });

      const engine = new N8NMCPEngine({
        sessionEvents: {
          onSessionCreated: errorHandler
        }
      });

      const context: InstanceContext = {
        n8nApiUrl: 'https://test.n8n.cloud',
        n8nApiKey: 'test-key',
        instanceId: 'test-instance'
      };

      const sessionId = 'instance-test-abc-error-handler-test';

      // Should not throw despite handler error
      expect(() => {
        engine.restoreSession(sessionId, context);
      }).not.toThrow();

      // Session should still be created
      expect(engine.getActiveSessions()).toContain(sessionId);

      await engine.shutdown();
    });

    it('should emit events with correct metadata', async () => {
      const events = createEventTracker();
      const engine = new N8NMCPEngine({
        sessionEvents: events
      });

      const context: InstanceContext = {
        n8nApiUrl: 'https://test.n8n.cloud',
        n8nApiKey: 'test-key',
        instanceId: 'test-instance',
        metadata: {
          userId: 'user-456',
          tier: 'enterprise'
        }
      };

      const sessionId = 'instance-test-abc-metadata-test';
      engine.restoreSession(sessionId, context);

      // Give event time to fire
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(events.onSessionCreated).toHaveBeenCalledWith(
        sessionId,
        expect.objectContaining({
          metadata: {
            userId: 'user-456',
            tier: 'enterprise'
          }
        })
      );

      await engine.shutdown();
    });
  });

  describe('Phase 4: Retry Policy', () => {
    it('should retry transient failures and eventually succeed', async () => {
      const context: InstanceContext = {
        n8nApiUrl: 'https://test.n8n.cloud',
        n8nApiKey: 'test-key',
        instanceId: 'test-instance'
      };

      const sessionId = 'instance-testinst-abc-550e8400e29b41d4a716446655440002';

      // Persist session
      await mockStore.saveSession({
        sessionId,
        instanceContext: context,
        createdAt: new Date(),
        lastAccess: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000)
      });

      // Configure to fail twice, then succeed
      mockStore.setTransientFailures(2);

      const restorationHook: SessionRestoreHook = async (sid) => {
        return await mockStore.loadSession(sid);
      };

      const events = createEventTracker();
      const engine = new N8NMCPEngine({
        onSessionNotFound: restorationHook,
        sessionRestorationRetries: 3, // Allow up to 3 retries
        sessionRestorationRetryDelay: 50, // Fast retries for testing
        sessionEvents: events
      });

      const { req: mockReq, res: mockRes } = createMockReqRes(sessionId);
      await engine.processRequest(mockReq, mockRes); // Don't pass context - let it restore

      // Give events time to fire
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should have succeeded (not 500 error)
      expect(mockRes.status).not.toHaveBeenCalledWith(500);

      // Should emit onSessionRestored after successful retry
      expect(events.onSessionRestored).toHaveBeenCalledTimes(1);

      await engine.shutdown();
    });

    it('should fail after exhausting all retries', async () => {
      const context: InstanceContext = {
        n8nApiUrl: 'https://test.n8n.cloud',
        n8nApiKey: 'test-key',
        instanceId: 'test-instance'
      };

      const sessionId = 'instance-test-abc-retry-exhaust-test';

      // Persist session
      await mockStore.saveSession({
        sessionId,
        instanceContext: context,
        createdAt: new Date(),
        lastAccess: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000)
      });

      // Configure to fail 5 times (more than max retries)
      mockStore.setTransientFailures(5);

      const restorationHook: SessionRestoreHook = async (sid) => {
        return await mockStore.loadSession(sid);
      };

      const engine = new N8NMCPEngine({
        onSessionNotFound: restorationHook,
        sessionRestorationRetries: 2, // Only 2 retries
        sessionRestorationRetryDelay: 50
      });

      const { req: mockReq, res: mockRes } = createMockReqRes(sessionId);
      await engine.processRequest(mockReq, mockRes); // Don't pass context

      // Should fail with 500 error
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

    it('should not retry timeout errors', async () => {
      const slowHook: SessionRestoreHook = async () => {
        // Simulate very slow query
        await new Promise(resolve => setTimeout(resolve, 500));
        return {
          n8nApiUrl: 'https://test.n8n.cloud',
          n8nApiKey: 'test-key',
          instanceId: 'test'
        };
      };

      const engine = new N8NMCPEngine({
        onSessionNotFound: slowHook,
        sessionRestorationRetries: 3,
        sessionRestorationRetryDelay: 50,
        sessionRestorationTimeout: 100 // Very short timeout
      });

      const { req: mockReq, res: mockRes } = createMockReqRes('instance-test-abc-timeout-no-retry');
      await engine.processRequest(mockReq, mockRes);

      // Should timeout with 408
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

    it('should respect overall timeout across all retry attempts', async () => {
      const context: InstanceContext = {
        n8nApiUrl: 'https://test.n8n.cloud',
        n8nApiKey: 'test-key',
        instanceId: 'test-instance'
      };

      const sessionId = 'instance-test-abc-overall-timeout-test';

      // Persist session
      await mockStore.saveSession({
        sessionId,
        instanceContext: context,
        createdAt: new Date(),
        lastAccess: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000)
      });

      // Configure many failures
      mockStore.setTransientFailures(10);

      const restorationHook: SessionRestoreHook = async (sid) => {
        // Each attempt takes 100ms
        await new Promise(resolve => setTimeout(resolve, 100));
        return await mockStore.loadSession(sid);
      };

      const engine = new N8NMCPEngine({
        onSessionNotFound: restorationHook,
        sessionRestorationRetries: 10, // Many retries
        sessionRestorationRetryDelay: 100,
        sessionRestorationTimeout: 300 // Overall timeout for ALL attempts
      });

      const { req: mockReq, res: mockRes } = createMockReqRes(sessionId);
      await engine.processRequest(mockReq, mockRes); // Don't pass context

      // Should timeout before exhausting retries
      expect(mockRes.status).toHaveBeenCalledWith(408);

      await engine.shutdown();
    });
  });

  describe('Phase 3 + 4: Combined Behavior', () => {
    it('should emit onSessionRestored after successful retry', async () => {
      const context: InstanceContext = {
        n8nApiUrl: 'https://test.n8n.cloud',
        n8nApiKey: 'test-key',
        instanceId: 'test-instance'
      };

      const sessionId = 'instance-testinst-abc-550e8400e29b41d4a716446655440003';

      await mockStore.saveSession({
        sessionId,
        instanceContext: context,
        createdAt: new Date(),
        lastAccess: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000)
      });

      // Fail once, then succeed
      mockStore.setTransientFailures(1);

      const restorationHook: SessionRestoreHook = async (sid) => {
        return await mockStore.loadSession(sid);
      };

      const events = createEventTracker();
      const engine = new N8NMCPEngine({
        onSessionNotFound: restorationHook,
        sessionRestorationRetries: 2,
        sessionRestorationRetryDelay: 50,
        sessionEvents: events
      });

      const { req: mockReq, res: mockRes } = createMockReqRes(sessionId);
      await engine.processRequest(mockReq, mockRes); // Don't pass context

      // Give events time to fire
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should have succeeded
      expect(mockRes.status).not.toHaveBeenCalledWith(500);

      // Should emit onSessionRestored after successful retry
      expect(events.onSessionRestored).toHaveBeenCalledTimes(1);
      expect(events.onSessionRestored).toHaveBeenCalledWith(sessionId, context);

      await engine.shutdown();
    });

    it('should not emit events if all retries fail', async () => {
      const context: InstanceContext = {
        n8nApiUrl: 'https://test.n8n.cloud',
        n8nApiKey: 'test-key',
        instanceId: 'test-instance'
      };

      const sessionId = 'instance-test-abc-retry-fail-no-event';

      await mockStore.saveSession({
        sessionId,
        instanceContext: context,
        createdAt: new Date(),
        lastAccess: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000)
      });

      // Always fail
      mockStore.setTransientFailures(10);

      const restorationHook: SessionRestoreHook = async (sid) => {
        return await mockStore.loadSession(sid);
      };

      const events = createEventTracker();
      const engine = new N8NMCPEngine({
        onSessionNotFound: restorationHook,
        sessionRestorationRetries: 2,
        sessionRestorationRetryDelay: 50,
        sessionEvents: events
      });

      const { req: mockReq, res: mockRes } = createMockReqRes(sessionId);
      await engine.processRequest(mockReq, mockRes); // Don't pass context

      // Give events time to fire (they shouldn't)
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should have failed
      expect(mockRes.status).toHaveBeenCalledWith(500);

      // Should NOT emit onSessionRestored
      expect(events.onSessionRestored).not.toHaveBeenCalled();
      expect(events.onSessionCreated).not.toHaveBeenCalled();

      await engine.shutdown();
    });

    it('should handle event handler errors during retry workflow', async () => {
      const context: InstanceContext = {
        n8nApiUrl: 'https://test.n8n.cloud',
        n8nApiKey: 'test-key',
        instanceId: 'test-instance'
      };

      const sessionId = 'instance-testinst-abc-550e8400e29b41d4a716446655440004';

      await mockStore.saveSession({
        sessionId,
        instanceContext: context,
        createdAt: new Date(),
        lastAccess: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000)
      });

      // Fail once, then succeed
      mockStore.setTransientFailures(1);

      const restorationHook: SessionRestoreHook = async (sid) => {
        return await mockStore.loadSession(sid);
      };

      const errorHandler = vi.fn(() => {
        throw new Error('Event handler error');
      });

      const engine = new N8NMCPEngine({
        onSessionNotFound: restorationHook,
        sessionRestorationRetries: 2,
        sessionRestorationRetryDelay: 50,
        sessionEvents: {
          onSessionRestored: errorHandler
        }
      });

      const { req: mockReq, res: mockRes } = createMockReqRes(sessionId);

      // Should not throw despite event handler error
      await engine.processRequest(mockReq, mockRes); // Don't pass context

      // Give event handler time to fail
      await new Promise(resolve => setTimeout(resolve, 100));

      // Request should still succeed (event error is non-blocking)
      expect(mockRes.status).not.toHaveBeenCalledWith(500);

      // Handler was called
      expect(errorHandler).toHaveBeenCalledTimes(1);

      await engine.shutdown();
    });
  });

  describe('Backward Compatibility', () => {
    it('should work without lifecycle events configured', async () => {
      const context: InstanceContext = {
        n8nApiUrl: 'https://test.n8n.cloud',
        n8nApiKey: 'test-key',
        instanceId: 'test-instance'
      };

      const sessionId = 'instance-testinst-abc-550e8400e29b41d4a716446655440005';

      await mockStore.saveSession({
        sessionId,
        instanceContext: context,
        createdAt: new Date(),
        lastAccess: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000)
      });

      const restorationHook: SessionRestoreHook = async (sid) => {
        return await mockStore.loadSession(sid);
      };

      const engine = new N8NMCPEngine({
        onSessionNotFound: restorationHook
        // No sessionEvents configured
      });

      const { req: mockReq, res: mockRes } = createMockReqRes(sessionId);
      await engine.processRequest(mockReq, mockRes); // Don't pass context

      // Should work normally
      expect(mockRes.status).not.toHaveBeenCalledWith(500);

      await engine.shutdown();
    });

    it('should work with 0 retries (default behavior)', async () => {
      const context: InstanceContext = {
        n8nApiUrl: 'https://test.n8n.cloud',
        n8nApiKey: 'test-key',
        instanceId: 'test-instance'
      };

      const sessionId = 'instance-test-abc-zero-retries';

      await mockStore.saveSession({
        sessionId,
        instanceContext: context,
        createdAt: new Date(),
        lastAccess: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000)
      });

      // Fail once
      mockStore.setTransientFailures(1);

      const restorationHook: SessionRestoreHook = async (sid) => {
        return await mockStore.loadSession(sid);
      };

      const engine = new N8NMCPEngine({
        onSessionNotFound: restorationHook
        // No sessionRestorationRetries - defaults to 0
      });

      const { req: mockReq, res: mockRes } = createMockReqRes(sessionId);
      await engine.processRequest(mockReq, mockRes, context);

      // Should fail immediately (no retries)
      expect(mockRes.status).toHaveBeenCalledWith(500);

      await engine.shutdown();
    });
  });
});
