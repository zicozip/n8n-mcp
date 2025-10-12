/**
 * Unit tests for Session Lifecycle Events (Phase 3 - REQ-4)
 * Tests event emission configuration and error handling
 *
 * Note: Events are fire-and-forget (non-blocking), so we test:
 * 1. Configuration works without errors
 * 2. Operations complete successfully even if handlers fail
 * 3. Handlers don't block operations
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { N8NMCPEngine } from '../../src/mcp-engine';
import { InstanceContext } from '../../src/types/instance-context';

describe('Session Lifecycle Events (Phase 3 - REQ-4)', () => {
  let engine: N8NMCPEngine;
  const testContext: InstanceContext = {
    n8nApiUrl: 'https://test.n8n.cloud',
    n8nApiKey: 'test-api-key',
    instanceId: 'test-instance'
  };

  beforeEach(() => {
    // Set required AUTH_TOKEN environment variable for testing
    process.env.AUTH_TOKEN = 'test-token-for-session-lifecycle-events-testing-32chars';
  });

  describe('onSessionCreated event', () => {
    it('should configure onSessionCreated handler without error', () => {
      const onSessionCreated = vi.fn();

      engine = new N8NMCPEngine({
        sessionEvents: { onSessionCreated }
      });

      const sessionId = 'instance-test-abc123-uuid-created-test-1';
      const result = engine.restoreSession(sessionId, testContext);

      // Session should be created successfully
      expect(result).toBe(true);
      expect(engine.getActiveSessions()).toContain(sessionId);
    });

    it('should create session successfully even with handler error', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('Event handler error');
      });

      engine = new N8NMCPEngine({
        sessionEvents: { onSessionCreated: errorHandler }
      });

      const sessionId = 'instance-test-abc123-uuid-error-test';

      // Should not throw despite handler error (non-blocking)
      expect(() => {
        engine.restoreSession(sessionId, testContext);
      }).not.toThrow();

      // Session should still be created successfully
      expect(engine.getActiveSessions()).toContain(sessionId);
    });

    it('should support async handlers without blocking', () => {
      const asyncHandler = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      engine = new N8NMCPEngine({
        sessionEvents: { onSessionCreated: asyncHandler }
      });

      const sessionId = 'instance-test-abc123-uuid-async-test';

      // Should return immediately (non-blocking)
      const startTime = Date.now();
      engine.restoreSession(sessionId, testContext);
      const endTime = Date.now();

      // Should complete quickly (not wait for async handler)
      expect(endTime - startTime).toBeLessThan(50);
      expect(engine.getActiveSessions()).toContain(sessionId);
    });
  });

  describe('onSessionDeleted event', () => {
    it('should configure onSessionDeleted handler without error', () => {
      const onSessionDeleted = vi.fn();

      engine = new N8NMCPEngine({
        sessionEvents: { onSessionDeleted }
      });

      const sessionId = 'instance-test-abc123-uuid-deleted-test';

      // Create and delete session
      engine.restoreSession(sessionId, testContext);
      const result = engine.deleteSession(sessionId);

      // Deletion should succeed
      expect(result).toBe(true);
      expect(engine.getActiveSessions()).not.toContain(sessionId);
    });

    it('should not configure onSessionDeleted for non-existent session', () => {
      const onSessionDeleted = vi.fn();

      engine = new N8NMCPEngine({
        sessionEvents: { onSessionDeleted }
      });

      // Try to delete non-existent session
      const result = engine.deleteSession('non-existent-session-id');

      // Should return false (session not found)
      expect(result).toBe(false);
    });

    it('should delete session successfully even with handler error', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('Deletion event error');
      });

      engine = new N8NMCPEngine({
        sessionEvents: { onSessionDeleted: errorHandler }
      });

      const sessionId = 'instance-test-abc123-uuid-delete-error-test';

      // Create session
      engine.restoreSession(sessionId, testContext);

      // Delete should succeed despite handler error
      const deleted = engine.deleteSession(sessionId);
      expect(deleted).toBe(true);

      // Session should still be deleted
      expect(engine.getActiveSessions()).not.toContain(sessionId);
    });
  });

  describe('Multiple events configuration', () => {
    it('should support multiple events configured together', () => {
      const onSessionCreated = vi.fn();
      const onSessionDeleted = vi.fn();

      engine = new N8NMCPEngine({
        sessionEvents: {
          onSessionCreated,
          onSessionDeleted
        }
      });

      const sessionId = 'instance-test-abc123-uuid-multi-event-test';

      // Create session
      engine.restoreSession(sessionId, testContext);
      expect(engine.getActiveSessions()).toContain(sessionId);

      // Delete session
      engine.deleteSession(sessionId);
      expect(engine.getActiveSessions()).not.toContain(sessionId);
    });

    it('should handle mix of sync and async handlers', () => {
      const syncHandler = vi.fn();
      const asyncHandler = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      engine = new N8NMCPEngine({
        sessionEvents: {
          onSessionCreated: syncHandler,
          onSessionDeleted: asyncHandler
        }
      });

      const sessionId = 'instance-test-abc123-uuid-mixed-handlers';

      // Create session
      const startTime = Date.now();
      engine.restoreSession(sessionId, testContext);
      const createTime = Date.now();

      // Should not block for async handler
      expect(createTime - startTime).toBeLessThan(50);

      // Delete session
      engine.deleteSession(sessionId);
      const deleteTime = Date.now();

      // Should not block for async handler
      expect(deleteTime - createTime).toBeLessThan(50);
    });
  });

  describe('Event handler error behavior', () => {
    it('should not propagate errors from event handlers to caller', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('Test error');
      });

      engine = new N8NMCPEngine({
        sessionEvents: {
          onSessionCreated: errorHandler
        }
      });

      const sessionId = 'instance-test-abc123-uuid-no-propagate';

      // Should not throw (non-blocking error handling)
      expect(() => {
        engine.restoreSession(sessionId, testContext);
      }).not.toThrow();

      // Session was created successfully
      expect(engine.getActiveSessions()).toContain(sessionId);
    });

    it('should allow operations to complete if event handler fails', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('Handler error');
      });

      engine = new N8NMCPEngine({
        sessionEvents: {
          onSessionDeleted: errorHandler
        }
      });

      const sessionId = 'instance-test-abc123-uuid-continue-on-error';

      engine.restoreSession(sessionId, testContext);

      // Delete should succeed despite handler error
      const result = engine.deleteSession(sessionId);
      expect(result).toBe(true);

      // Session should be deleted
      expect(engine.getActiveSessions()).not.toContain(sessionId);
    });
  });

  describe('Event handler with metadata', () => {
    it('should configure handlers with metadata support', () => {
      const onSessionCreated = vi.fn();

      engine = new N8NMCPEngine({
        sessionEvents: { onSessionCreated }
      });

      const sessionId = 'instance-test-abc123-uuid-metadata-test';
      const contextWithMetadata = {
        ...testContext,
        metadata: {
          userId: 'user-456',
          tier: 'enterprise',
          region: 'us-east-1'
        }
      };

      engine.restoreSession(sessionId, contextWithMetadata);

      // Session created successfully
      expect(engine.getActiveSessions()).toContain(sessionId);

      // State includes metadata
      const state = engine.getSessionState(sessionId);
      expect(state?.metadata).toEqual({
        userId: 'user-456',
        tier: 'enterprise',
        region: 'us-east-1'
      });
    });
  });

  describe('Configuration validation', () => {
    it('should accept empty sessionEvents object', () => {
      expect(() => {
        engine = new N8NMCPEngine({
          sessionEvents: {}
        });
      }).not.toThrow();
    });

    it('should accept undefined sessionEvents', () => {
      expect(() => {
        engine = new N8NMCPEngine({
          sessionEvents: undefined
        });
      }).not.toThrow();
    });

    it('should work without sessionEvents configured', () => {
      engine = new N8NMCPEngine();

      const sessionId = 'instance-test-abc123-uuid-no-events';

      // Should work normally
      engine.restoreSession(sessionId, testContext);
      expect(engine.getActiveSessions()).toContain(sessionId);

      engine.deleteSession(sessionId);
      expect(engine.getActiveSessions()).not.toContain(sessionId);
    });
  });
});
