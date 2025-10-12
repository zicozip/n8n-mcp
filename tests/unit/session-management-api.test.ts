/**
 * Unit tests for Session Management API (Phase 2 - REQ-5)
 * Tests the public API methods for session management in v2.19.0
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { N8NMCPEngine } from '../../src/mcp-engine';
import { InstanceContext } from '../../src/types/instance-context';

describe('Session Management API (Phase 2 - REQ-5)', () => {
  let engine: N8NMCPEngine;
  const testContext: InstanceContext = {
    n8nApiUrl: 'https://test.n8n.cloud',
    n8nApiKey: 'test-api-key',
    instanceId: 'test-instance'
  };

  beforeEach(() => {
    // Set required AUTH_TOKEN environment variable for testing
    process.env.AUTH_TOKEN = 'test-token-for-session-management-testing-32chars';

    // Create engine with session restoration disabled for these tests
    engine = new N8NMCPEngine({
      sessionTimeout: 30 * 60 * 1000 // 30 minutes
    });
  });

  describe('getActiveSessions()', () => {
    it('should return empty array when no sessions exist', () => {
      const sessionIds = engine.getActiveSessions();
      expect(sessionIds).toEqual([]);
    });

    it('should return session IDs after session creation via restoreSession', () => {
      // Create session using direct API (not through HTTP request)
      const sessionId = 'instance-test-abc123-uuid-session-test-1';
      engine.restoreSession(sessionId, testContext);

      const sessionIds = engine.getActiveSessions();
      expect(sessionIds.length).toBe(1);
      expect(sessionIds).toContain(sessionId);
    });

    it('should return multiple session IDs when multiple sessions exist', () => {
      // Create multiple sessions using direct API
      const sessions = [
        { id: 'instance-test1-abc123-uuid-session-1', context: { ...testContext, instanceId: 'instance-1' } },
        { id: 'instance-test2-abc123-uuid-session-2', context: { ...testContext, instanceId: 'instance-2' } }
      ];

      sessions.forEach(({ id, context }) => {
        engine.restoreSession(id, context);
      });

      const sessionIds = engine.getActiveSessions();
      expect(sessionIds.length).toBe(2);
      expect(sessionIds).toContain(sessions[0].id);
      expect(sessionIds).toContain(sessions[1].id);
    });
  });

  describe('getSessionState()', () => {
    it('should return null for non-existent session', () => {
      const state = engine.getSessionState('non-existent-session-id');
      expect(state).toBeNull();
    });

    it('should return session state for existing session', () => {
      // Create a session using direct API
      const sessionId = 'instance-test-abc123-uuid-session-state-test';
      engine.restoreSession(sessionId, testContext);

      const state = engine.getSessionState(sessionId);
      expect(state).not.toBeNull();
      expect(state).toMatchObject({
        sessionId: sessionId,
        instanceContext: expect.objectContaining({
          n8nApiUrl: testContext.n8nApiUrl,
          n8nApiKey: testContext.n8nApiKey,
          instanceId: testContext.instanceId
        }),
        createdAt: expect.any(Date),
        lastAccess: expect.any(Date),
        expiresAt: expect.any(Date)
      });
    });

    it('should include metadata in session state if available', () => {
      const contextWithMetadata: InstanceContext = {
        ...testContext,
        metadata: { userId: 'user-123', tier: 'premium' }
      };

      const sessionId = 'instance-test-abc123-uuid-metadata-test';
      engine.restoreSession(sessionId, contextWithMetadata);

      const state = engine.getSessionState(sessionId);

      expect(state?.metadata).toEqual({ userId: 'user-123', tier: 'premium' });
    });

    it('should calculate correct expiration time', () => {
      const sessionId = 'instance-test-abc123-uuid-expiry-test';
      engine.restoreSession(sessionId, testContext);

      const state = engine.getSessionState(sessionId);

      expect(state).not.toBeNull();
      if (state) {
        const expectedExpiry = new Date(state.lastAccess.getTime() + 30 * 60 * 1000);
        const actualExpiry = state.expiresAt;

        // Allow 1 second difference for test timing
        expect(Math.abs(actualExpiry.getTime() - expectedExpiry.getTime())).toBeLessThan(1000);
      }
    });
  });

  describe('getAllSessionStates()', () => {
    it('should return empty array when no sessions exist', () => {
      const states = engine.getAllSessionStates();
      expect(states).toEqual([]);
    });

    it('should return all session states', () => {
      // Create two sessions using direct API
      const session1Id = 'instance-test1-abc123-uuid-all-states-1';
      const session2Id = 'instance-test2-abc123-uuid-all-states-2';

      engine.restoreSession(session1Id, {
        ...testContext,
        instanceId: 'instance-1'
      });

      engine.restoreSession(session2Id, {
        ...testContext,
        instanceId: 'instance-2'
      });

      const states = engine.getAllSessionStates();
      expect(states.length).toBe(2);
      expect(states[0]).toMatchObject({
        sessionId: expect.any(String),
        instanceContext: expect.objectContaining({
          n8nApiUrl: testContext.n8nApiUrl
        }),
        createdAt: expect.any(Date),
        lastAccess: expect.any(Date),
        expiresAt: expect.any(Date)
      });
    });

    it('should filter out sessions without state', () => {
      // Create session using direct API
      const sessionId = 'instance-test-abc123-uuid-filter-test';
      engine.restoreSession(sessionId, testContext);

      // Get states
      const states = engine.getAllSessionStates();
      expect(states.length).toBe(1);

      // All returned states should be non-null
      states.forEach(state => {
        expect(state).not.toBeNull();
      });
    });
  });

  describe('restoreSession()', () => {
    it('should create a new session with provided ID and context', () => {
      const sessionId = 'instance-test-abc123-uuid-test-session-id';
      const result = engine.restoreSession(sessionId, testContext);

      expect(result).toBe(true);
      expect(engine.getActiveSessions()).toContain(sessionId);
    });

    it('should be idempotent - return true for existing session', () => {
      const sessionId = 'instance-test-abc123-uuid-test-session-id2';

      // First restoration
      const result1 = engine.restoreSession(sessionId, testContext);
      expect(result1).toBe(true);

      // Second restoration with same ID
      const result2 = engine.restoreSession(sessionId, testContext);
      expect(result2).toBe(true);

      // Should still only have one session
      const sessionIds = engine.getActiveSessions();
      expect(sessionIds.filter(id => id === sessionId).length).toBe(1);
    });

    it('should return false for invalid session ID format', () => {
      const invalidSessionIds = [
        '',                           // Empty string
        'a'.repeat(101),              // Too long (101 chars, exceeds max)
        "'; DROP TABLE sessions--",  // SQL injection attempt (invalid characters: ', ;, space)
        '../../../etc/passwd',        // Path traversal attempt (invalid characters: ., /)
        'has spaces here',            // Invalid character (space)
        'special@chars#here'          // Invalid characters (@, #)
      ];

      invalidSessionIds.forEach(sessionId => {
        const result = engine.restoreSession(sessionId, testContext);
        expect(result).toBe(false);
      });
    });

    it('should accept short session IDs (relaxed for MCP proxy compatibility)', () => {
      const validShortIds = [
        'short',                      // 5 chars - now valid
        'a',                          // 1 char - now valid
        'only-nineteen-chars',        // 19 chars - now valid
        '12345'                       // 5 digit ID - now valid
      ];

      validShortIds.forEach(sessionId => {
        const result = engine.restoreSession(sessionId, testContext);
        expect(result).toBe(true);
        expect(engine.getActiveSessions()).toContain(sessionId);
      });
    });

    it('should return false for invalid instance context', () => {
      const sessionId = 'instance-test-abc123-uuid-test-session-id3';
      const invalidContext = {
        n8nApiUrl: 'not-a-valid-url', // Invalid URL
        n8nApiKey: 'test-key',
        instanceId: 'test'
      } as any;

      const result = engine.restoreSession(sessionId, invalidContext);
      expect(result).toBe(false);
    });

    it('should create session that can be retrieved with getSessionState', () => {
      const sessionId = 'instance-test-abc123-uuid-test-session-id4';
      engine.restoreSession(sessionId, testContext);

      const state = engine.getSessionState(sessionId);
      expect(state).not.toBeNull();
      expect(state?.sessionId).toBe(sessionId);
      expect(state?.instanceContext).toEqual(testContext);
    });
  });

  describe('deleteSession()', () => {
    it('should return false for non-existent session', () => {
      const result = engine.deleteSession('non-existent-session-id');
      expect(result).toBe(false);
    });

    it('should delete existing session and return true', () => {
      // Create a session using direct API
      const sessionId = 'instance-test-abc123-uuid-delete-test';
      engine.restoreSession(sessionId, testContext);

      // Delete the session
      const result = engine.deleteSession(sessionId);
      expect(result).toBe(true);

      // Session should no longer exist
      expect(engine.getActiveSessions()).not.toContain(sessionId);
      expect(engine.getSessionState(sessionId)).toBeNull();
    });

    it('should return false when trying to delete already deleted session', () => {
      // Create and delete session using direct API
      const sessionId = 'instance-test-abc123-uuid-double-delete-test';
      engine.restoreSession(sessionId, testContext);

      engine.deleteSession(sessionId);

      // Try to delete again
      const result = engine.deleteSession(sessionId);
      expect(result).toBe(false);
    });
  });

  describe('Integration workflows', () => {
    it('should support periodic backup workflow', () => {
      // Create multiple sessions using direct API
      for (let i = 0; i < 3; i++) {
        const sessionId = `instance-test${i}-abc123-uuid-backup-${i}`;
        engine.restoreSession(sessionId, {
          ...testContext,
          instanceId: `instance-${i}`
        });
      }

      // Simulate periodic backup
      const states = engine.getAllSessionStates();
      expect(states.length).toBe(3);

      // Each state should be serializable
      states.forEach(state => {
        const serialized = JSON.stringify(state);
        expect(serialized).toBeTruthy();

        const deserialized = JSON.parse(serialized);
        expect(deserialized.sessionId).toBe(state.sessionId);
      });
    });

    it('should support bulk restore workflow', () => {
      const sessionData = [
        { sessionId: 'instance-test1-abc123-uuid-bulk-session-1', context: { ...testContext, instanceId: 'user-1' } },
        { sessionId: 'instance-test2-abc123-uuid-bulk-session-2', context: { ...testContext, instanceId: 'user-2' } },
        { sessionId: 'instance-test3-abc123-uuid-bulk-session-3', context: { ...testContext, instanceId: 'user-3' } }
      ];

      // Restore all sessions
      for (const { sessionId, context } of sessionData) {
        const restored = engine.restoreSession(sessionId, context);
        expect(restored).toBe(true);
      }

      // Verify all sessions exist
      const sessionIds = engine.getActiveSessions();
      expect(sessionIds.length).toBe(3);

      sessionData.forEach(({ sessionId }) => {
        expect(sessionIds).toContain(sessionId);
      });
    });

    it('should support session lifecycle workflow (create → get → delete)', () => {
      // 1. Create session using direct API
      const sessionId = 'instance-test-abc123-uuid-lifecycle-test';
      engine.restoreSession(sessionId, testContext);

      // 2. Get session state
      const state = engine.getSessionState(sessionId);
      expect(state).not.toBeNull();

      // 3. Simulate saving to database (serialization test)
      const serialized = JSON.stringify(state);
      expect(serialized).toBeTruthy();

      // 4. Delete session
      const deleted = engine.deleteSession(sessionId);
      expect(deleted).toBe(true);

      // 5. Verify deletion
      expect(engine.getSessionState(sessionId)).toBeNull();
      expect(engine.getActiveSessions()).not.toContain(sessionId);
    });
  });
});
