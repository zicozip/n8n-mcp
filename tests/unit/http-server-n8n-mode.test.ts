import { describe, it, expect, beforeEach, afterEach, vi, MockedFunction } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { SingleSessionHTTPServer } from '../../src/http-server-single-session';

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

vi.mock('../../src/mcp/server', () => ({
  N8NDocumentationMCPServer: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined)
  }))
}));

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: vi.fn().mockImplementation(() => ({
    handleRequest: vi.fn().mockImplementation(async (req: any, res: any) => {
      // Simulate successful MCP response
      if (process.env.N8N_MODE === 'true') {
        res.setHeader('Mcp-Session-Id', 'single-session');
      }
      res.status(200).json({
        jsonrpc: '2.0',
        result: { success: true },
        id: 1
      });
    }),
    close: vi.fn().mockResolvedValue(undefined)
  }))
}));

// Create a mock console manager instance
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
  PROJECT_VERSION: '2.8.1'
}));

// Create handlers storage outside of mocks
const mockHandlers: { [key: string]: any[] } = {
  get: [],
  post: [],
  delete: [],
  use: []
};

vi.mock('express', () => {
  // Create Express app mock inside the factory
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
      // Store delete handlers in the same way as other methods
      if (!mockHandlers.delete) mockHandlers.delete = [];
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
  
  // Create a mock for express that has both the app factory and json method
  const expressMock = vi.fn(() => mockExpressApp);
  expressMock.json = vi.fn(() => (req: any, res: any, next: any) => {
    // Mock JSON parser middleware
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

describe('HTTP Server n8n Mode', () => {
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
    process.env.PORT = '0'; // Use random port for tests
    
    // Mock console methods to prevent output during tests
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

  // Helper to find a route handler
  function findHandler(method: 'get' | 'post', path: string) {
    const routes = mockHandlers[method];
    const route = routes.find(r => r.path === path);
    return route ? route.handlers[route.handlers.length - 1] : null;
  }

  // Helper to create mock request/response
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
      getHeader: (key: string) => headers[key.toLowerCase()],
      headers
    };
    
    const req = {
      method: 'GET',
      path: '/',
      headers: {} as Record<string, string>,
      body: {},
      ip: '127.0.0.1',
      get: vi.fn((header: string) => (req.headers as Record<string, string>)[header.toLowerCase()])
    };
    
    return { req, res };
  }

  describe('Protocol Version Endpoint (GET /mcp)', () => {
    it('should return standard response when N8N_MODE is not set', async () => {
      delete process.env.N8N_MODE;
      server = new SingleSessionHTTPServer();
      await server.start();

      const handler = findHandler('get', '/mcp');
      expect(handler).toBeTruthy();

      const { req, res } = createMockReqRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        description: 'n8n Documentation MCP Server',
        version: '2.8.1',
        endpoints: {
          mcp: {
            method: 'POST',
            path: '/mcp',
            description: 'Main MCP JSON-RPC endpoint',
            authentication: 'Bearer token required'
          },
          health: {
            method: 'GET',
            path: '/health',
            description: 'Health check endpoint',
            authentication: 'None'
          },
          root: {
            method: 'GET',
            path: '/',
            description: 'API information',
            authentication: 'None'
          }
        },
        documentation: 'https://github.com/czlonkowski/n8n-mcp'
      });
    });

    it('should return protocol version when N8N_MODE=true', async () => {
      process.env.N8N_MODE = 'true';
      server = new SingleSessionHTTPServer();
      await server.start();

      const handler = findHandler('get', '/mcp');
      expect(handler).toBeTruthy();

      const { req, res } = createMockReqRes();
      await handler(req, res);

      // When N8N_MODE is true, should return protocol version and server info
      expect(res.json).toHaveBeenCalledWith({
        protocolVersion: '2024-11-05',
        serverInfo: {
          name: 'n8n-mcp',
          version: '2.8.1',
          capabilities: {
            tools: {}
          }
        }
      });
    });
  });

  describe('Session ID Header (POST /mcp)', () => {
    it('should handle POST request when N8N_MODE is not set', async () => {
      delete process.env.N8N_MODE;
      server = new SingleSessionHTTPServer();
      await server.start();

      const handler = findHandler('post', '/mcp');
      expect(handler).toBeTruthy();

      const { req, res } = createMockReqRes();
      req.headers = { authorization: `Bearer ${TEST_AUTH_TOKEN}` };
      req.method = 'POST';
      req.body = {
        jsonrpc: '2.0',
        method: 'test',
        params: {},
        id: 1
      };

      // The handler should call handleRequest which wraps the operation
      await handler(req, res);

      // Verify the ConsoleManager's wrapOperation was called
      expect(mockConsoleManager.wrapOperation).toHaveBeenCalled();
      
      // In normal mode, no special headers should be set by our code
      // The transport handles the actual response
    });

    it('should handle POST request when N8N_MODE=true', async () => {
      process.env.N8N_MODE = 'true';
      server = new SingleSessionHTTPServer();
      await server.start();

      const handler = findHandler('post', '/mcp');
      expect(handler).toBeTruthy();

      const { req, res } = createMockReqRes();
      req.headers = { authorization: `Bearer ${TEST_AUTH_TOKEN}` };
      req.method = 'POST';
      req.body = {
        jsonrpc: '2.0',
        method: 'test',
        params: {},
        id: 1
      };

      await handler(req, res);

      // Verify the ConsoleManager's wrapOperation was called
      expect(mockConsoleManager.wrapOperation).toHaveBeenCalled();
      
      // In N8N_MODE, the transport mock is configured to set the Mcp-Session-Id header
      // This is testing that the environment variable is properly passed through
    });
  });

  describe('Error Response Format', () => {
    it('should use JSON-RPC error format for auth errors', async () => {
      delete process.env.N8N_MODE;
      server = new SingleSessionHTTPServer();
      await server.start();

      const handler = findHandler('post', '/mcp');
      expect(handler).toBeTruthy();

      // Test missing auth header
      const { req, res } = createMockReqRes();
      req.method = 'POST';
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Unauthorized'
        },
        id: null
      });
    });

    it('should handle invalid auth token', async () => {
      server = new SingleSessionHTTPServer();
      await server.start();

      const handler = findHandler('post', '/mcp');
      expect(handler).toBeTruthy();

      const { req, res } = createMockReqRes();
      req.headers = { authorization: 'Bearer invalid-token' };
      req.method = 'POST';
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Unauthorized'
        },
        id: null
      });
    });

    it('should handle invalid auth header format', async () => {
      server = new SingleSessionHTTPServer();
      await server.start();

      const handler = findHandler('post', '/mcp');
      expect(handler).toBeTruthy();

      const { req, res } = createMockReqRes();
      req.headers = { authorization: 'Basic sometoken' }; // Wrong format
      req.method = 'POST';
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Unauthorized'
        },
        id: null
      });
    });
  });

  describe('Normal Mode Behavior', () => {
    it('should maintain standard behavior for health endpoint', async () => {
      // Test both with and without N8N_MODE
      for (const n8nMode of [undefined, 'true', 'false']) {
        if (n8nMode === undefined) {
          delete process.env.N8N_MODE;
        } else {
          process.env.N8N_MODE = n8nMode;
        }
        
        server = new SingleSessionHTTPServer();
        await server.start();

        const handler = findHandler('get', '/health');
        expect(handler).toBeTruthy();

        const { req, res } = createMockReqRes();
        await handler(req, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
          status: 'ok',
          mode: 'sdk-pattern-transports', // Updated mode name after refactoring
          version: '2.8.1'
        }));
        
        await server.shutdown();
      }
    });

    it('should maintain standard behavior for root endpoint', async () => {
      // Test both with and without N8N_MODE
      for (const n8nMode of [undefined, 'true', 'false']) {
        if (n8nMode === undefined) {
          delete process.env.N8N_MODE;
        } else {
          process.env.N8N_MODE = n8nMode;
        }
        
        server = new SingleSessionHTTPServer();
        await server.start();

        const handler = findHandler('get', '/');
        expect(handler).toBeTruthy();

        const { req, res } = createMockReqRes();
        await handler(req, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
          name: 'n8n Documentation MCP Server',
          version: '2.8.1',
          endpoints: expect.any(Object),
          authentication: expect.any(Object)
        }));
        
        await server.shutdown();
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle N8N_MODE with various values', async () => {
      const testValues = ['true', 'TRUE', '1', 'yes', 'false', ''];
      
      for (const value of testValues) {
        process.env.N8N_MODE = value;
        server = new SingleSessionHTTPServer();
        await server.start();

        const handler = findHandler('get', '/mcp');
        expect(handler).toBeTruthy();

        const { req, res } = createMockReqRes();
        await handler(req, res);

        // Only exactly 'true' should enable n8n mode
        if (value === 'true') {
          expect(res.json).toHaveBeenCalledWith({
            protocolVersion: '2024-11-05',
            serverInfo: {
              name: 'n8n-mcp',
              version: '2.8.1',
              capabilities: {
                tools: {}
              }
            }
          });
        } else {
          expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            description: 'n8n Documentation MCP Server'
          }));
        }
        
        await server.shutdown();
      }
    });

    it('should handle OPTIONS requests for CORS', async () => {
      server = new SingleSessionHTTPServer();
      await server.start();

      const { req, res } = createMockReqRes();
      req.method = 'OPTIONS';
      
      // Call each middleware to find the CORS one
      for (const middleware of mockHandlers.use) {
        if (typeof middleware === 'function') {
          const next = vi.fn();
          await middleware(req, res, next);
          
          if (res.sendStatus.mock.calls.length > 0) {
            // Found the CORS middleware - verify it was called
            expect(res.sendStatus).toHaveBeenCalledWith(204);
            
            // Check that CORS headers were set (order doesn't matter)
            const setHeaderCalls = (res.setHeader as any).mock.calls;
            const headerMap = new Map(setHeaderCalls);
            
            expect(headerMap.has('Access-Control-Allow-Origin')).toBe(true);
            expect(headerMap.has('Access-Control-Allow-Methods')).toBe(true);
            expect(headerMap.has('Access-Control-Allow-Headers')).toBe(true);
            expect(headerMap.get('Access-Control-Allow-Methods')).toBe('POST, GET, DELETE, OPTIONS');
            break;
          }
        }
      }
    });

    it('should validate session info methods', async () => {
      server = new SingleSessionHTTPServer();
      await server.start();

      // Initially no session
      let sessionInfo = server.getSessionInfo();
      expect(sessionInfo.active).toBe(false);

      // The getSessionInfo method should return proper structure
      expect(sessionInfo).toHaveProperty('active');
      
      // Test that the server instance has the expected methods
      expect(typeof server.getSessionInfo).toBe('function');
      expect(typeof server.start).toBe('function');
      expect(typeof server.shutdown).toBe('function');
    });
  });

  describe('404 Handler', () => {
    it('should handle 404 errors correctly', async () => {
      server = new SingleSessionHTTPServer();
      await server.start();

      // The 404 handler is added with app.use() without a path
      // Find the last middleware that looks like a 404 handler
      const notFoundHandler = mockHandlers.use[mockHandlers.use.length - 2]; // Second to last (before error handler)

      const { req, res } = createMockReqRes();
      req.method = 'POST';
      req.path = '/nonexistent';
      
      await notFoundHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Not found',
        message: 'Cannot POST /nonexistent'
      });
    });
  });
});