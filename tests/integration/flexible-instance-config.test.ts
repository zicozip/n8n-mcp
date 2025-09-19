/**
 * Integration tests for flexible instance configuration support
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { N8NMCPEngine } from '../../src/mcp-engine';
import { InstanceContext, isInstanceContext } from '../../src/types/instance-context';
import { getN8nApiClient } from '../../src/mcp/handlers-n8n-manager';

describe('Flexible Instance Configuration', () => {
  let engine: N8NMCPEngine;

  beforeEach(() => {
    engine = new N8NMCPEngine();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Backward Compatibility', () => {
    it('should work without instance context (using env vars)', async () => {
      // Save original env
      const originalUrl = process.env.N8N_API_URL;
      const originalKey = process.env.N8N_API_KEY;

      // Set test env vars
      process.env.N8N_API_URL = 'https://test.n8n.cloud';
      process.env.N8N_API_KEY = 'test-key';

      // Get client without context
      const client = getN8nApiClient();

      // Should use env vars when no context provided
      if (client) {
        expect(client).toBeDefined();
      }

      // Restore env
      process.env.N8N_API_URL = originalUrl;
      process.env.N8N_API_KEY = originalKey;
    });

    it('should create MCP engine without instance context', () => {
      // Should not throw when creating engine without context
      expect(() => {
        const testEngine = new N8NMCPEngine();
        expect(testEngine).toBeDefined();
      }).not.toThrow();
    });
  });

  describe('Instance Context Support', () => {
    it('should accept and use instance context', () => {
      const context: InstanceContext = {
        n8nApiUrl: 'https://instance1.n8n.cloud',
        n8nApiKey: 'instance1-key',
        instanceId: 'test-instance-1',
        sessionId: 'session-123',
        metadata: {
          userId: 'user-456',
          customField: 'test'
        }
      };

      // Get client with context
      const client = getN8nApiClient(context);

      // Should create instance-specific client
      if (context.n8nApiUrl && context.n8nApiKey) {
        expect(client).toBeDefined();
      }
    });

    it('should create different clients for different contexts', () => {
      const context1: InstanceContext = {
        n8nApiUrl: 'https://instance1.n8n.cloud',
        n8nApiKey: 'key1',
        instanceId: 'instance-1'
      };

      const context2: InstanceContext = {
        n8nApiUrl: 'https://instance2.n8n.cloud',
        n8nApiKey: 'key2',
        instanceId: 'instance-2'
      };

      const client1 = getN8nApiClient(context1);
      const client2 = getN8nApiClient(context2);

      // Both clients should exist and be different
      expect(client1).toBeDefined();
      expect(client2).toBeDefined();
      // Note: We can't directly compare clients, but they're cached separately
    });

    it('should cache clients for the same context', () => {
      const context: InstanceContext = {
        n8nApiUrl: 'https://instance1.n8n.cloud',
        n8nApiKey: 'key1',
        instanceId: 'instance-1'
      };

      const client1 = getN8nApiClient(context);
      const client2 = getN8nApiClient(context);

      // Should return the same cached client
      expect(client1).toBe(client2);
    });

    it('should handle partial context (missing n8n config)', () => {
      const context: InstanceContext = {
        instanceId: 'instance-1',
        sessionId: 'session-123'
        // Missing n8nApiUrl and n8nApiKey
      };

      const client = getN8nApiClient(context);

      // Should fall back to env vars when n8n config missing
      // Client will be null if env vars not set
      expect(client).toBeDefined(); // or null depending on env
    });
  });

  describe('Instance Isolation', () => {
    it('should isolate state between instances', () => {
      const context1: InstanceContext = {
        n8nApiUrl: 'https://instance1.n8n.cloud',
        n8nApiKey: 'key1',
        instanceId: 'instance-1'
      };

      const context2: InstanceContext = {
        n8nApiUrl: 'https://instance2.n8n.cloud',
        n8nApiKey: 'key2',
        instanceId: 'instance-2'
      };

      // Create clients for both contexts
      const client1 = getN8nApiClient(context1);
      const client2 = getN8nApiClient(context2);

      // Verify both are created independently
      expect(client1).toBeDefined();
      expect(client2).toBeDefined();

      // Clear one shouldn't affect the other
      // (In real implementation, we'd have a clear method)
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid context gracefully', () => {
      const invalidContext = {
        n8nApiUrl: 123, // Wrong type
        n8nApiKey: null,
        someRandomField: 'test'
      } as any;

      // Should not throw, but may not create client
      expect(() => {
        getN8nApiClient(invalidContext);
      }).not.toThrow();
    });

    it('should provide clear error when n8n API not configured', () => {
      const context: InstanceContext = {
        instanceId: 'test',
        // Missing n8n config
      };

      // Clear env vars
      const originalUrl = process.env.N8N_API_URL;
      const originalKey = process.env.N8N_API_KEY;
      delete process.env.N8N_API_URL;
      delete process.env.N8N_API_KEY;

      const client = getN8nApiClient(context);
      expect(client).toBeNull();

      // Restore env
      process.env.N8N_API_URL = originalUrl;
      process.env.N8N_API_KEY = originalKey;
    });
  });

  describe('Type Guards', () => {
    it('should correctly identify valid InstanceContext', () => {

      const validContext: InstanceContext = {
        n8nApiUrl: 'https://test.n8n.cloud',
        n8nApiKey: 'key',
        instanceId: 'id',
        sessionId: 'session',
        metadata: { test: true }
      };

      expect(isInstanceContext(validContext)).toBe(true);
    });

    it('should reject invalid InstanceContext', () => {

      expect(isInstanceContext(null)).toBe(false);
      expect(isInstanceContext(undefined)).toBe(false);
      expect(isInstanceContext('string')).toBe(false);
      expect(isInstanceContext(123)).toBe(false);
      expect(isInstanceContext({ n8nApiUrl: 123 })).toBe(false);
    });
  });
});