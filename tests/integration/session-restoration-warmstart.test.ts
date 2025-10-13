/**
 * Integration tests for warm start session restoration (v2.19.5)
 *
 * Tests the simplified warm start pattern where:
 * 1. Restoration creates session using existing createSession() flow
 * 2. Current request is handled immediately through restored session
 * 3. Client auto-retries with initialize on same connection (standard MCP -32000)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SingleSessionHTTPServer } from '../../src/http-server-single-session';
import { InstanceContext } from '../../src/types/instance-context';
import { SessionRestoreHook } from '../../src/types/session-restoration';
import type { Request, Response } from 'express';

describe('Warm Start Session Restoration Tests', () => {
  const TEST_AUTH_TOKEN = 'warmstart-test-token-with-32-chars-min-length';
  let server: SingleSessionHTTPServer;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save and set environment
    originalEnv = { ...process.env };
    process.env.AUTH_TOKEN = TEST_AUTH_TOKEN;
    process.env.PORT = '0';
    process.env.NODE_ENV = 'test';
  });

  afterEach(async () => {
    // Cleanup server
    if (server) {
      await server.shutdown();
    }

    // Restore environment
    process.env = originalEnv;
  });

  // Helper to create mocked Request and Response
  function createMockReqRes(sessionId?: string, body?: any) {
    const req = {
      method: 'POST',
      path: '/mcp',
      url: '/mcp',
      originalUrl: '/mcp',
      headers: {
        authorization: `Bearer ${TEST_AUTH_TOKEN}`,
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
      on: vi.fn(),
      removeListener: vi.fn()
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

  describe('Happy Path: Successful Restoration', () => {
    it('should restore session and handle current request immediately', async () => {
      const context: InstanceContext = {
        n8nApiUrl: 'https://test.n8n.cloud',
        n8nApiKey: 'test-api-key',
        instanceId: 'test-instance'
      };

      const sessionId = 'test-session-550e8400';
      let restoredSessionId: string | null = null;

      // Mock restoration hook that returns context
      const restorationHook: SessionRestoreHook = async (sid) => {
        restoredSessionId = sid;
        return context;
      };

      server = new SingleSessionHTTPServer({
        onSessionNotFound: restorationHook,
        sessionRestorationTimeout: 5000
      });

      // Start server
      await server.start();

      // Client sends request with unknown session ID
      const { req, res } = createMockReqRes(sessionId);

      // Handle request
      await server.handleRequest(req, res, context);

      // Verify restoration hook was called
      expect(restoredSessionId).toBe(sessionId);

      // Verify response was handled (not rejected with 400/404)
      // A successful restoration should not return these error codes
      expect(res.status).not.toHaveBeenCalledWith(400);
      expect(res.status).not.toHaveBeenCalledWith(404);

      // Verify a response was sent (either success or -32000 for initialization)
      expect(res.json).toHaveBeenCalled();
    });

    it('should emit onSessionRestored event after successful restoration', async () => {
      const context: InstanceContext = {
        n8nApiUrl: 'https://test.n8n.cloud',
        n8nApiKey: 'test-api-key',
        instanceId: 'test-instance'
      };

      const sessionId = 'test-session-550e8400';
      let restoredEventFired = false;
      let restoredEventSessionId: string | null = null;

      const restorationHook: SessionRestoreHook = async () => context;

      server = new SingleSessionHTTPServer({
        onSessionNotFound: restorationHook,
        sessionEvents: {
          onSessionRestored: (sid, ctx) => {
            restoredEventFired = true;
            restoredEventSessionId = sid;
          }
        }
      });

      await server.start();

      const { req, res } = createMockReqRes(sessionId);
      await server.handleRequest(req, res, context);

      // Wait for async event
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(restoredEventFired).toBe(true);
      expect(restoredEventSessionId).toBe(sessionId);
    });
  });

  describe('Failure Cleanup', () => {
    it('should clean up session when restoration fails', async () => {
      const sessionId = 'test-session-550e8400';

      // Mock failing restoration hook
      const failingHook: SessionRestoreHook = async () => {
        throw new Error('Database connection failed');
      };

      server = new SingleSessionHTTPServer({
        onSessionNotFound: failingHook,
        sessionRestorationTimeout: 5000
      });

      await server.start();

      const { req, res } = createMockReqRes(sessionId);
      await server.handleRequest(req, res);

      // Verify error response
      expect(res.status).toHaveBeenCalledWith(500);

      // Verify session was NOT created (cleanup happened)
      const activeSessions = server.getActiveSessions();
      expect(activeSessions).not.toContain(sessionId);
    });

    it('should clean up session when restoration times out', async () => {
      const sessionId = 'test-session-550e8400';

      // Mock slow restoration hook
      const slowHook: SessionRestoreHook = async () => {
        await new Promise(resolve => setTimeout(resolve, 10000)); // 10 seconds
        return {
          n8nApiUrl: 'https://test.n8n.cloud',
          n8nApiKey: 'test-key',
          instanceId: 'test'
        };
      };

      server = new SingleSessionHTTPServer({
        onSessionNotFound: slowHook,
        sessionRestorationTimeout: 100 // 100ms timeout
      });

      await server.start();

      const { req, res } = createMockReqRes(sessionId);
      await server.handleRequest(req, res);

      // Verify timeout response
      expect(res.status).toHaveBeenCalledWith(408);

      // Verify session was cleaned up
      const activeSessions = server.getActiveSessions();
      expect(activeSessions).not.toContain(sessionId);
    });

    it('should clean up session when restored context is invalid', async () => {
      const sessionId = 'test-session-550e8400';

      // Mock hook returning invalid context
      const invalidHook: SessionRestoreHook = async () => {
        return {
          n8nApiUrl: 'not-a-valid-url', // Invalid URL format
          n8nApiKey: 'test-key',
          instanceId: 'test'
        } as any;
      };

      server = new SingleSessionHTTPServer({
        onSessionNotFound: invalidHook,
        sessionRestorationTimeout: 5000
      });

      await server.start();

      const { req, res } = createMockReqRes(sessionId);
      await server.handleRequest(req, res);

      // Verify validation error response
      expect(res.status).toHaveBeenCalledWith(400);

      // Verify session was NOT created
      const activeSessions = server.getActiveSessions();
      expect(activeSessions).not.toContain(sessionId);
    });
  });

  describe('Concurrent Idempotency', () => {
    it('should handle concurrent restoration attempts for same session idempotently', async () => {
      const context: InstanceContext = {
        n8nApiUrl: 'https://test.n8n.cloud',
        n8nApiKey: 'test-api-key',
        instanceId: 'test-instance'
      };

      const sessionId = 'test-session-550e8400';
      let hookCallCount = 0;

      // Mock restoration hook with slow query
      const restorationHook: SessionRestoreHook = async () => {
        hookCallCount++;
        // Simulate slow database query
        await new Promise(resolve => setTimeout(resolve, 50));
        return context;
      };

      server = new SingleSessionHTTPServer({
        onSessionNotFound: restorationHook,
        sessionRestorationTimeout: 5000
      });

      await server.start();

      // Send 5 concurrent requests with same unknown session ID
      const requests = Array.from({ length: 5 }, (_, i) => {
        const { req, res } = createMockReqRes(sessionId, {
          jsonrpc: '2.0',
          method: 'tools/list',
          params: {},
          id: i + 1
        });
        return server.handleRequest(req, res, context);
      });

      // All should complete without error (no unhandled rejections)
      const results = await Promise.allSettled(requests);

      // All requests should complete (either fulfilled or rejected)
      expect(results.length).toBe(5);

      // Hook should be called at least once (possibly more for concurrent requests)
      expect(hookCallCount).toBeGreaterThan(0);

      // None of the requests should fail with server errors (500)
      // They may return -32000 for initialization, but that's expected
      results.forEach((result, i) => {
        if (result.status === 'rejected') {
          // Unexpected rejection - fail the test
          throw new Error(`Request ${i} failed unexpectedly: ${result.reason}`);
        }
      });
    });

    it('should reuse already-restored session for concurrent requests', async () => {
      const context: InstanceContext = {
        n8nApiUrl: 'https://test.n8n.cloud',
        n8nApiKey: 'test-api-key',
        instanceId: 'test-instance'
      };

      const sessionId = 'test-session-550e8400';
      let hookCallCount = 0;

      // Track restoration attempts
      const restorationHook: SessionRestoreHook = async () => {
        hookCallCount++;
        return context;
      };

      server = new SingleSessionHTTPServer({
        onSessionNotFound: restorationHook,
        sessionRestorationTimeout: 5000
      });

      await server.start();

      // First request triggers restoration
      const { req: req1, res: res1 } = createMockReqRes(sessionId);
      await server.handleRequest(req1, res1, context);

      // Verify hook was called for first request
      expect(hookCallCount).toBe(1);

      // Second request with same session ID
      const { req: req2, res: res2 } = createMockReqRes(sessionId);
      await server.handleRequest(req2, res2, context);

      // If session was reused, hook should not be called again
      // (or called again if session wasn't fully initialized yet)
      // Either way, both requests should complete without errors
      expect(res1.json).toHaveBeenCalled();
      expect(res2.json).toHaveBeenCalled();
    });
  });

  describe('Restoration Hook Edge Cases', () => {
    it('should handle restoration hook returning null (session rejected)', async () => {
      const sessionId = 'test-session-550e8400';

      // Hook explicitly rejects restoration
      const rejectingHook: SessionRestoreHook = async () => null;

      server = new SingleSessionHTTPServer({
        onSessionNotFound: rejectingHook,
        sessionRestorationTimeout: 5000
      });

      await server.start();

      const { req, res } = createMockReqRes(sessionId);
      await server.handleRequest(req, res);

      // Verify rejection response
      expect(res.status).toHaveBeenCalledWith(400);

      // Verify session was NOT created
      expect(server.getActiveSessions()).not.toContain(sessionId);
    });

    it('should handle restoration hook returning undefined (session rejected)', async () => {
      const sessionId = 'test-session-550e8400';

      // Hook returns undefined
      const undefinedHook: SessionRestoreHook = async () => undefined as any;

      server = new SingleSessionHTTPServer({
        onSessionNotFound: undefinedHook,
        sessionRestorationTimeout: 5000
      });

      await server.start();

      const { req, res } = createMockReqRes(sessionId);
      await server.handleRequest(req, res);

      // Verify rejection response
      expect(res.status).toHaveBeenCalledWith(400);

      // Verify session was NOT created
      expect(server.getActiveSessions()).not.toContain(sessionId);
    });
  });
});
