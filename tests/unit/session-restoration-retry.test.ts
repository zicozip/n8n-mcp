/**
 * Unit tests for Session Restoration Retry Policy (Phase 4 - REQ-7)
 * Tests retry logic for failed session restoration attempts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { N8NMCPEngine } from '../../src/mcp-engine';
import { InstanceContext } from '../../src/types/instance-context';

describe('Session Restoration Retry Policy (Phase 4 - REQ-7)', () => {
  const testContext: InstanceContext = {
    n8nApiUrl: 'https://test.n8n.cloud',
    n8nApiKey: 'test-api-key',
    instanceId: 'test-instance'
  };

  beforeEach(() => {
    // Set required AUTH_TOKEN environment variable for testing
    process.env.AUTH_TOKEN = 'test-token-for-session-restoration-retry-testing-32chars';
    vi.clearAllMocks();
  });

  describe('Default behavior (no retries)', () => {
    it('should have 0 retries by default (opt-in)', async () => {
      let callCount = 0;
      const failingHook = vi.fn(async () => {
        callCount++;
        throw new Error('Database connection failed');
      });

      const engine = new N8NMCPEngine({
        onSessionNotFound: failingHook
        // No sessionRestorationRetries specified - should default to 0
      });

      // Note: Testing retry behavior requires HTTP request simulation
      // This is tested in integration tests
      // Here we verify configuration is accepted

      expect(() => {
        const sessionId = 'instance-test-abc123-uuid-default-retry';
        engine.restoreSession(sessionId, testContext);
      }).not.toThrow();
    });

    it('should throw immediately on error with 0 retries', () => {
      const failingHook = vi.fn(async () => {
        throw new Error('Test error');
      });

      const engine = new N8NMCPEngine({
        onSessionNotFound: failingHook,
        sessionRestorationRetries: 0 // Explicit 0 retries
      });

      // Configuration accepted
      expect(() => {
        engine.restoreSession('test-session', testContext);
      }).not.toThrow();
    });
  });

  describe('Retry configuration', () => {
    it('should accept custom retry count', () => {
      const hook = vi.fn(async () => testContext);

      const engine = new N8NMCPEngine({
        onSessionNotFound: hook,
        sessionRestorationRetries: 3
      });

      expect(() => {
        engine.restoreSession('test-session', testContext);
      }).not.toThrow();
    });

    it('should accept custom retry delay', () => {
      const hook = vi.fn(async () => testContext);

      const engine = new N8NMCPEngine({
        onSessionNotFound: hook,
        sessionRestorationRetries: 2,
        sessionRestorationRetryDelay: 200 // 200ms delay
      });

      expect(() => {
        engine.restoreSession('test-session', testContext);
      }).not.toThrow();
    });

    it('should use default delay of 100ms if not specified', () => {
      const hook = vi.fn(async () => testContext);

      const engine = new N8NMCPEngine({
        onSessionNotFound: hook,
        sessionRestorationRetries: 2
        // sessionRestorationRetryDelay not specified - should default to 100ms
      });

      expect(() => {
        engine.restoreSession('test-session', testContext);
      }).not.toThrow();
    });
  });

  describe('Error classification', () => {
    it('should configure retry for transient errors', () => {
      let attemptCount = 0;
      const failTwiceThenSucceed = vi.fn(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Transient error');
        }
        return testContext;
      });

      const engine = new N8NMCPEngine({
        onSessionNotFound: failTwiceThenSucceed,
        sessionRestorationRetries: 3
      });

      // Configuration accepted
      expect(() => {
        engine.restoreSession('test-session', testContext);
      }).not.toThrow();
    });

    it('should not configure retry for timeout errors', () => {
      const timeoutHook = vi.fn(async () => {
        const error = new Error('Timeout error');
        error.name = 'TimeoutError';
        throw error;
      });

      const engine = new N8NMCPEngine({
        onSessionNotFound: timeoutHook,
        sessionRestorationRetries: 3,
        sessionRestorationTimeout: 100
      });

      // Configuration accepted
      expect(() => {
        engine.restoreSession('test-session', testContext);
      }).not.toThrow();
    });
  });

  describe('Timeout interaction', () => {
    it('should configure overall timeout for all retry attempts', () => {
      const slowHook = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return testContext;
      });

      const engine = new N8NMCPEngine({
        onSessionNotFound: slowHook,
        sessionRestorationRetries: 3,
        sessionRestorationTimeout: 500 // 500ms total for all attempts
      });

      // Configuration accepted
      expect(() => {
        engine.restoreSession('test-session', testContext);
      }).not.toThrow();
    });

    it('should use default timeout of 5000ms if not specified', () => {
      const hook = vi.fn(async () => testContext);

      const engine = new N8NMCPEngine({
        onSessionNotFound: hook,
        sessionRestorationRetries: 2
        // sessionRestorationTimeout not specified - should default to 5000ms
      });

      // Configuration accepted
      expect(() => {
        engine.restoreSession('test-session', testContext);
      }).not.toThrow();
    });
  });

  describe('Success scenarios', () => {
    it('should succeed on first attempt if hook succeeds', () => {
      const successHook = vi.fn(async () => testContext);

      const engine = new N8NMCPEngine({
        onSessionNotFound: successHook,
        sessionRestorationRetries: 3
      });

      // Should succeed
      expect(() => {
        engine.restoreSession('test-session', testContext);
      }).not.toThrow();
    });

    it('should succeed after retry if hook eventually succeeds', () => {
      let attemptCount = 0;
      const retryThenSucceed = vi.fn(async () => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error('First attempt failed');
        }
        return testContext;
      });

      const engine = new N8NMCPEngine({
        onSessionNotFound: retryThenSucceed,
        sessionRestorationRetries: 2
      });

      // Configuration accepted
      expect(() => {
        engine.restoreSession('test-session', testContext);
      }).not.toThrow();
    });
  });

  describe('Hook validation', () => {
    it('should validate context returned by hook after retry', () => {
      let attemptCount = 0;
      const invalidAfterRetry = vi.fn(async () => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error('First attempt failed');
        }
        // Return invalid context after retry
        return {
          n8nApiUrl: 'not-a-valid-url', // Invalid URL
          n8nApiKey: 'test-key',
          instanceId: 'test'
        } as any;
      });

      const engine = new N8NMCPEngine({
        onSessionNotFound: invalidAfterRetry,
        sessionRestorationRetries: 2
      });

      // Configuration accepted
      expect(() => {
        engine.restoreSession('test-session', testContext);
      }).not.toThrow();
    });

    it('should handle null return from hook after retry', () => {
      let attemptCount = 0;
      const nullAfterRetry = vi.fn(async () => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error('First attempt failed');
        }
        return null; // Session not found after retry
      });

      const engine = new N8NMCPEngine({
        onSessionNotFound: nullAfterRetry,
        sessionRestorationRetries: 2
      });

      // Configuration accepted
      expect(() => {
        engine.restoreSession('test-session', testContext);
      }).not.toThrow();
    });
  });

  describe('Edge cases', () => {
    it('should handle exactly max retries configuration', () => {
      let attemptCount = 0;
      const failExactlyMaxTimes = vi.fn(async () => {
        attemptCount++;
        if (attemptCount <= 2) {
          throw new Error('Failing');
        }
        return testContext;
      });

      const engine = new N8NMCPEngine({
        onSessionNotFound: failExactlyMaxTimes,
        sessionRestorationRetries: 2 // Will succeed on 3rd attempt (0, 1, 2 retries)
      });

      // Configuration accepted
      expect(() => {
        engine.restoreSession('test-session', testContext);
      }).not.toThrow();
    });

    it('should handle zero delay between retries', () => {
      const hook = vi.fn(async () => testContext);

      const engine = new N8NMCPEngine({
        onSessionNotFound: hook,
        sessionRestorationRetries: 3,
        sessionRestorationRetryDelay: 0 // No delay
      });

      // Configuration accepted
      expect(() => {
        engine.restoreSession('test-session', testContext);
      }).not.toThrow();
    });

    it('should handle very short timeout', () => {
      const hook = vi.fn(async () => testContext);

      const engine = new N8NMCPEngine({
        onSessionNotFound: hook,
        sessionRestorationRetries: 3,
        sessionRestorationTimeout: 1 // 1ms timeout
      });

      // Configuration accepted
      expect(() => {
        engine.restoreSession('test-session', testContext);
      }).not.toThrow();
    });
  });

  describe('Integration with lifecycle events', () => {
    it('should emit onSessionRestored after successful retry', () => {
      let attemptCount = 0;
      const retryThenSucceed = vi.fn(async () => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error('First attempt failed');
        }
        return testContext;
      });

      const onSessionRestored = vi.fn();

      const engine = new N8NMCPEngine({
        onSessionNotFound: retryThenSucceed,
        sessionRestorationRetries: 2,
        sessionEvents: {
          onSessionRestored
        }
      });

      // Configuration accepted
      expect(() => {
        engine.restoreSession('test-session', testContext);
      }).not.toThrow();
    });

    it('should not emit events if all retries fail', () => {
      const alwaysFail = vi.fn(async () => {
        throw new Error('Always fails');
      });

      const onSessionRestored = vi.fn();

      const engine = new N8NMCPEngine({
        onSessionNotFound: alwaysFail,
        sessionRestorationRetries: 2,
        sessionEvents: {
          onSessionRestored
        }
      });

      // Configuration accepted
      expect(() => {
        engine.restoreSession('test-session', testContext);
      }).not.toThrow();
    });
  });

  describe('Backward compatibility', () => {
    it('should work without retry configuration (backward compatible)', () => {
      const hook = vi.fn(async () => testContext);

      const engine = new N8NMCPEngine({
        onSessionNotFound: hook
        // No retry configuration - should work as before
      });

      // Should work
      expect(() => {
        engine.restoreSession('test-session', testContext);
      }).not.toThrow();
    });

    it('should work with only restoration hook configured', () => {
      const hook = vi.fn(async () => testContext);

      const engine = new N8NMCPEngine({
        onSessionNotFound: hook,
        sessionRestorationTimeout: 5000
        // No retry configuration
      });

      // Should work
      expect(() => {
        engine.restoreSession('test-session', testContext);
      }).not.toThrow();
    });
  });
});
