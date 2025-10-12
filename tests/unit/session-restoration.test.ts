import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SingleSessionHTTPServer } from '../../src/http-server-single-session';
import { InstanceContext } from '../../src/types/instance-context';
import { SessionRestoreHook } from '../../src/types/session-restoration';

// Mock dependencies
vi.mock('../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

vi.mock('dotenv');

// Mock UUID generation to make tests predictable
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-session-id-1234-5678-9012-345678901234')
}));

// Mock transport
vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: vi.fn().mockImplementation((options: any) => {
    const mockTransport = {
      handleRequest: vi.fn().mockImplementation(async (req: any, res: any, body?: any) => {
        if (body && body.method === 'initialize') {
          res.setHeader('Mcp-Session-Id', mockTransport.sessionId || 'test-session-id');
        }
        res.status(200).json({
          jsonrpc: '2.0',
          result: { success: true },
          id: body?.id || 1
        });
      }),
      close: vi.fn().mockResolvedValue(undefined),
      sessionId: null as string | null,
      onclose: null as (() => void) | null
    };

    if (options?.sessionIdGenerator) {
      const sessionId = options.sessionIdGenerator();
      mockTransport.sessionId = sessionId;

      if (options.onsessioninitialized) {
        setTimeout(() => {
          options.onsessioninitialized(sessionId);
        }, 0);
      }
    }

    return mockTransport;
  })
}));

vi.mock('@modelcontextprotocol/sdk/server/sse.js', () => ({
  SSEServerTransport: vi.fn().mockImplementation(() => ({
    close: vi.fn().mockResolvedValue(undefined)
  }))
}));

vi.mock('../../src/mcp/server', () => {
  class MockN8NDocumentationMCPServer {
    connect = vi.fn().mockResolvedValue(undefined);
  }
  return {
    N8NDocumentationMCPServer: MockN8NDocumentationMCPServer
  };
});

const mockConsoleManager = {
  wrapOperation: vi.fn().mockImplementation(async (fn: () => Promise<any>) => {
    return await fn();
  })
};

vi.mock('../../src/utils/console-manager', () => ({
  ConsoleManager: vi.fn(() => mockConsoleManager)
}));

vi.mock('../../src/utils/url-detector', () => ({
  getStartupBaseUrl: vi.fn((host: string, port: number) => `http://localhost:${port || 3000}`),
  formatEndpointUrls: vi.fn((baseUrl: string) => ({
    health: `${baseUrl}/health`,
    mcp: `${baseUrl}/mcp`
  })),
  detectBaseUrl: vi.fn((req: any, host: string, port: number) => `http://localhost:${port || 3000}`)
}));

vi.mock('../../src/utils/version', () => ({
  PROJECT_VERSION: '2.19.0'
}));

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  isInitializeRequest: vi.fn((request: any) => {
    return request && request.method === 'initialize';
  })
}));

// Create handlers storage for Express mock
const mockHandlers: { [key: string]: any[] } = {
  get: [],
  post: [],
  delete: [],
  use: []
};

// Mock Express
vi.mock('express', () => {
  const mockExpressApp = {
    get: vi.fn((path: string, ...handlers: any[]) => {
      mockHandlers.get.push({ path, handlers });
      return mockExpressApp;
    }),
    post: vi.fn((path: string, ...handlers: any[]) => {
      mockHandlers.post.push({ path, handlers });
      return mockExpressApp;
    }),
    delete: vi.fn((path: string, ...handlers: any[]) => {
      mockHandlers.delete.push({ path, handlers });
      return mockExpressApp;
    }),
    use: vi.fn((handler: any) => {
      mockHandlers.use.push(handler);
      return mockExpressApp;
    }),
    set: vi.fn(),
    listen: vi.fn((port: number, host: string, callback?: () => void) => {
      if (callback) callback();
      return {
        on: vi.fn(),
        close: vi.fn((cb: () => void) => cb()),
        address: () => ({ port: 3000 })
      };
    })
  };

  interface ExpressMock {
    (): typeof mockExpressApp;
    json(): (req: any, res: any, next: any) => void;
  }

  const expressMock = vi.fn(() => mockExpressApp) as unknown as ExpressMock;
  expressMock.json = vi.fn(() => (req: any, res: any, next: any) => {
    req.body = req.body || {};
    next();
  });

  return {
    default: expressMock,
    Request: {},
    Response: {},
    NextFunction: {}
  };
});

describe('Session Restoration (Phase 1 - REQ-1, REQ-2, REQ-8)', () => {
  const originalEnv = process.env;
  const TEST_AUTH_TOKEN = 'test-auth-token-with-more-than-32-characters';
  let server: SingleSessionHTTPServer;
  let consoleLogSpy: any;
  let consoleWarnSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    process.env.AUTH_TOKEN = TEST_AUTH_TOKEN;
    process.env.PORT = '0';
    process.env.NODE_ENV = 'test';

    // Mock console methods
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Clear all mocks and handlers
    vi.clearAllMocks();
    mockHandlers.get = [];
    mockHandlers.post = [];
    mockHandlers.delete = [];
    mockHandlers.use = [];
  });

  afterEach(async () => {
    // Restore environment
    process.env = originalEnv;

    // Restore console methods
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();

    // Shutdown server if running
    if (server) {
      await server.shutdown();
      server = null as any;
    }
  });

  // Helper functions
  function findHandler(method: 'get' | 'post' | 'delete', path: string) {
    const routes = mockHandlers[method];
    const route = routes.find(r => r.path === path);
    return route ? route.handlers[route.handlers.length - 1] : null;
  }

  function createMockReqRes() {
    const headers: { [key: string]: string } = {};
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      setHeader: vi.fn((key: string, value: string) => {
        headers[key.toLowerCase()] = value;
      }),
      sendStatus: vi.fn().mockReturnThis(),
      headersSent: false,
      finished: false,
      statusCode: 200,
      getHeader: (key: string) => headers[key.toLowerCase()],
      headers
    };

    const req = {
      method: 'POST',
      path: '/mcp',
      url: '/mcp',
      originalUrl: '/mcp',
      headers: {} as Record<string, string>,
      body: {},
      ip: '127.0.0.1',
      readable: true,
      readableEnded: false,
      complete: true,
      get: vi.fn((header: string) => (req.headers as Record<string, string>)[header.toLowerCase()])
    };

    return { req, res };
  }

  describe('REQ-8: Security-Hardened Session ID Validation', () => {
    it('should accept valid UUIDv4 session IDs', () => {
      server = new SingleSessionHTTPServer();

      const validUUIDs = [
        '550e8400-e29b-41d4-a716-446655440000',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        'a1b2c3d4-e5f6-4789-abcd-1234567890ab'
      ];

      for (const sessionId of validUUIDs) {
        expect((server as any).isValidSessionId(sessionId)).toBe(true);
      }
    });

    it('should accept multi-tenant instance session IDs', () => {
      server = new SingleSessionHTTPServer();

      const multiTenantIds = [
        'instance-user123-abc-550e8400-e29b-41d4-a716-446655440000',
        'instance-tenant456-xyz-f47ac10b-58cc-4372-a567-0e02b2c3d479'
      ];

      for (const sessionId of multiTenantIds) {
        expect((server as any).isValidSessionId(sessionId)).toBe(true);
      }
    });

    it('should reject session IDs with SQL injection patterns', () => {
      server = new SingleSessionHTTPServer();

      const sqlInjectionIds = [
        "'; DROP TABLE sessions; --",
        "1' OR '1'='1",
        "admin'--",
        "1'; DELETE FROM sessions WHERE '1'='1"
      ];

      for (const sessionId of sqlInjectionIds) {
        expect((server as any).isValidSessionId(sessionId)).toBe(false);
      }
    });

    it('should reject session IDs with NoSQL injection patterns', () => {
      server = new SingleSessionHTTPServer();

      const nosqlInjectionIds = [
        '{"$ne": null}',
        '{"$gt": ""}',
        '{$where: "1==1"}',
        '[$regex]'
      ];

      for (const sessionId of nosqlInjectionIds) {
        expect((server as any).isValidSessionId(sessionId)).toBe(false);
      }
    });

    it('should reject session IDs with path traversal attempts', () => {
      server = new SingleSessionHTTPServer();

      const pathTraversalIds = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        'session/../admin',
        'session/./../../config'
      ];

      for (const sessionId of pathTraversalIds) {
        expect((server as any).isValidSessionId(sessionId)).toBe(false);
      }
    });

    it('should accept short session IDs (relaxed for MCP proxy compatibility)', () => {
      server = new SingleSessionHTTPServer();

      // Short session IDs are now accepted for MCP proxy compatibility
      // Security is maintained via character whitelist and max length
      const shortIds = [
        'a',
        'ab',
        '123',
        '12345',
        'short-id'
      ];

      for (const sessionId of shortIds) {
        expect((server as any).isValidSessionId(sessionId)).toBe(true);
      }
    });

    it('should reject session IDs that are too long (DoS protection)', () => {
      server = new SingleSessionHTTPServer();

      const tooLongId = 'a'.repeat(101);  // Maximum is 100 chars
      expect((server as any).isValidSessionId(tooLongId)).toBe(false);
    });

    it('should reject empty or null session IDs', () => {
      server = new SingleSessionHTTPServer();

      expect((server as any).isValidSessionId('')).toBe(false);
      expect((server as any).isValidSessionId(null)).toBe(false);
      expect((server as any).isValidSessionId(undefined)).toBe(false);
    });

    it('should reject session IDs with special characters', () => {
      server = new SingleSessionHTTPServer();

      const specialCharIds = [
        'session<script>alert(1)</script>',
        'session!@#$%^&*()',
        'session\x00null-byte',
        'session\r\nnewline'
      ];

      for (const sessionId of specialCharIds) {
        expect((server as any).isValidSessionId(sessionId)).toBe(false);
      }
    });
  });

  describe('REQ-2: Idempotent Session Creation', () => {
    it('should return same session ID for multiple concurrent createSession calls', async () => {
      const mockContext: InstanceContext = {
        n8nApiUrl: 'https://test.n8n.cloud',
        n8nApiKey: 'test-api-key',
        instanceId: 'tenant-123'
      };

      server = new SingleSessionHTTPServer();

      const sessionId = 'instance-tenant123-abc-550e8400-e29b-41d4-a716-446655440000';

      // Call createSession multiple times with same session ID
      const id1 = (server as any).createSession(mockContext, sessionId);
      const id2 = (server as any).createSession(mockContext, sessionId);
      const id3 = (server as any).createSession(mockContext, sessionId);

      // All calls should return the same session ID (idempotent)
      expect(id1).toBe(sessionId);
      expect(id2).toBe(sessionId);
      expect(id3).toBe(sessionId);

      // NOTE: Transport creation is async via callback - tested in integration tests
    });

    it('should skip session creation if session already exists', async () => {
      const mockContext: InstanceContext = {
        n8nApiUrl: 'https://test.n8n.cloud',
        n8nApiKey: 'test-api-key',
        instanceId: 'tenant-123'
      };

      server = new SingleSessionHTTPServer();

      const sessionId = '550e8400-e29b-41d4-a716-446655440000';

      // Create session first time
      (server as any).createSession(mockContext, sessionId);
      const transport1 = (server as any).transports[sessionId];

      // Try to create again
      (server as any).createSession(mockContext, sessionId);
      const transport2 = (server as any).transports[sessionId];

      // Should be the same transport instance
      expect(transport1).toBe(transport2);
    });

    it('should validate session ID format when provided externally', async () => {
      const mockContext: InstanceContext = {
        n8nApiUrl: 'https://test.n8n.cloud',
        n8nApiKey: 'test-api-key',
        instanceId: 'tenant-123'
      };

      server = new SingleSessionHTTPServer();

      const invalidSessionId = "'; DROP TABLE sessions; --";

      expect(() => {
        (server as any).createSession(mockContext, invalidSessionId);
      }).toThrow('Invalid session ID format');
    });
  });

  describe('REQ-1: Session Restoration Hook Configuration', () => {
    it('should store restoration hook when provided', () => {
      const mockHook: SessionRestoreHook = vi.fn().mockResolvedValue({
        n8nApiUrl: 'https://test.n8n.cloud',
        n8nApiKey: 'test-api-key',
        instanceId: 'tenant-123'
      });

      server = new SingleSessionHTTPServer({
        onSessionNotFound: mockHook,
        sessionRestorationTimeout: 5000
      });

      // Verify hook is stored
      expect((server as any).onSessionNotFound).toBe(mockHook);
      expect((server as any).sessionRestorationTimeout).toBe(5000);
    });

    it('should work without restoration hook (backward compatible)', () => {
      server = new SingleSessionHTTPServer();

      // Verify hook is not configured
      expect((server as any).onSessionNotFound).toBeUndefined();
    });

    // NOTE: Full restoration flow tests (success, failure, timeout, validation)
    // are in tests/integration/session-persistence.test.ts which tests the complete
    // end-to-end flow with real HTTP requests
  });

  describe('Backwards Compatibility', () => {
    it('should use default timeout when not specified', () => {
      server = new SingleSessionHTTPServer({
        onSessionNotFound: vi.fn()
      });

      expect((server as any).sessionRestorationTimeout).toBe(5000);
    });

    it('should use custom timeout when specified', () => {
      server = new SingleSessionHTTPServer({
        onSessionNotFound: vi.fn(),
        sessionRestorationTimeout: 10000
      });

      expect((server as any).sessionRestorationTimeout).toBe(10000);
    });

    it('should work without any restoration options', () => {
      server = new SingleSessionHTTPServer();

      expect((server as any).onSessionNotFound).toBeUndefined();
      expect((server as any).sessionRestorationTimeout).toBe(5000);
    });
  });

  describe('Timeout Utility Method', () => {
    it('should reject after specified timeout', async () => {
      server = new SingleSessionHTTPServer();

      const timeoutPromise = (server as any).timeout(100);

      await expect(timeoutPromise).rejects.toThrow('Operation timed out after 100ms');
    });

    it('should create TimeoutError', async () => {
      server = new SingleSessionHTTPServer();

      try {
        await (server as any).timeout(50);
        expect.fail('Should have thrown TimeoutError');
      } catch (error: any) {
        expect(error.name).toBe('TimeoutError');
        expect(error.message).toContain('timed out');
      }
    });
  });

  describe('Session ID Generation', () => {
    it('should generate valid session IDs', () => {
      // Set environment for multi-tenant mode
      process.env.ENABLE_MULTI_TENANT = 'true';
      process.env.MULTI_TENANT_SESSION_STRATEGY = 'instance';

      server = new SingleSessionHTTPServer();

      const context: InstanceContext = {
        n8nApiUrl: 'https://test.n8n.cloud',
        n8nApiKey: 'test-api-key',
        instanceId: 'tenant-123'
      };

      const sessionId = (server as any).generateSessionId(context);

      // Should generate instance-prefixed ID in multi-tenant mode
      expect(sessionId).toContain('instance-');
      expect((server as any).isValidSessionId(sessionId)).toBe(true);

      // Clean up env
      delete process.env.ENABLE_MULTI_TENANT;
      delete process.env.MULTI_TENANT_SESSION_STRATEGY;
    });

    it('should generate standard UUIDs when not in multi-tenant mode', () => {
      // Ensure multi-tenant mode is disabled
      delete process.env.ENABLE_MULTI_TENANT;

      server = new SingleSessionHTTPServer();

      const sessionId = (server as any).generateSessionId();

      // Should be a UUID format (mocked in tests but should be non-empty string with hyphens)
      expect(sessionId).toBeTruthy();
      expect(typeof sessionId).toBe('string');
      expect(sessionId.length).toBeGreaterThan(20); // At minimum should be longer than minimum session ID length
      expect(sessionId).toContain('-');

      // NOTE: In tests, UUID is mocked so it may not pass strict validation
      // In production, generateSessionId uses real uuid.v4() which generates valid UUIDs
    });
  });
});
