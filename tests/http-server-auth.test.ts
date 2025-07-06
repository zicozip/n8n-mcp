import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock dependencies
jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  },
  Logger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  })),
  LogLevel: {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
  }
}));

jest.mock('dotenv');

// Mock other dependencies to prevent side effects
jest.mock('../src/mcp/server', () => ({
  N8NDocumentationMCPServer: jest.fn().mockImplementation(() => ({
    executeTool: jest.fn()
  }))
}));

jest.mock('../src/mcp/tools', () => ({
  n8nDocumentationToolsFinal: []
}));

jest.mock('../src/mcp/tools-n8n-manager', () => ({
  n8nManagementTools: []
}));

jest.mock('../src/utils/version', () => ({
  PROJECT_VERSION: '2.7.4'
}));

jest.mock('../src/config/n8n-api', () => ({
  isN8nApiConfigured: jest.fn().mockReturnValue(false)
}));

// Mock Express to prevent server from starting
jest.mock('express', () => {
  const mockApp = {
    use: jest.fn(),
    get: jest.fn(),
    post: jest.fn(),
    listen: jest.fn().mockReturnValue({
      on: jest.fn()
    })
  };
  const express: any = jest.fn(() => mockApp);
  express.json = jest.fn();
  express.urlencoded = jest.fn();
  express.static = jest.fn();
  express.Request = {};
  express.Response = {};
  express.NextFunction = {};
  return express;
});

describe('HTTP Server Authentication', () => {
  const originalEnv = process.env;
  let tempDir: string;
  let authTokenFile: string;

  beforeEach(() => {
    // Reset modules and environment
    jest.resetModules();
    process.env = { ...originalEnv };
    
    // Create temporary directory for test files
    tempDir = join(tmpdir(), `http-server-auth-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    authTokenFile = join(tempDir, 'auth-token');
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    
    // Clean up temporary directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('loadAuthToken', () => {
    let loadAuthToken: () => string | null;

    beforeEach(() => {
      // Import the function after environment is set up
      const httpServerModule = require('../src/http-server');
      // Access the loadAuthToken function (we'll need to export it)
      loadAuthToken = httpServerModule.loadAuthToken || (() => null);
    });

    it('should load token from AUTH_TOKEN environment variable', () => {
      process.env.AUTH_TOKEN = 'test-token-from-env';
      delete process.env.AUTH_TOKEN_FILE;

      // Re-import to get fresh module with new env
      jest.resetModules();
      const { loadAuthToken } = require('../src/http-server');
      
      const token = loadAuthToken();
      expect(token).toBe('test-token-from-env');
    });

    it('should load token from AUTH_TOKEN_FILE when AUTH_TOKEN is not set', () => {
      delete process.env.AUTH_TOKEN;
      process.env.AUTH_TOKEN_FILE = authTokenFile;
      
      // Write test token to file
      writeFileSync(authTokenFile, 'test-token-from-file\n');

      // Re-import to get fresh module with new env
      jest.resetModules();
      const { loadAuthToken } = require('../src/http-server');
      
      const token = loadAuthToken();
      expect(token).toBe('test-token-from-file');
    });

    it('should trim whitespace from token file', () => {
      delete process.env.AUTH_TOKEN;
      process.env.AUTH_TOKEN_FILE = authTokenFile;
      
      // Write token with whitespace
      writeFileSync(authTokenFile, '  test-token-with-spaces  \n\n');

      jest.resetModules();
      const { loadAuthToken } = require('../src/http-server');
      
      const token = loadAuthToken();
      expect(token).toBe('test-token-with-spaces');
    });

    it('should prefer AUTH_TOKEN over AUTH_TOKEN_FILE', () => {
      process.env.AUTH_TOKEN = 'env-token';
      process.env.AUTH_TOKEN_FILE = authTokenFile;
      writeFileSync(authTokenFile, 'file-token');

      jest.resetModules();
      const { loadAuthToken } = require('../src/http-server');
      
      const token = loadAuthToken();
      expect(token).toBe('env-token');
    });

    it('should return null when AUTH_TOKEN_FILE points to non-existent file', () => {
      delete process.env.AUTH_TOKEN;
      process.env.AUTH_TOKEN_FILE = join(tempDir, 'non-existent-file');

      jest.resetModules();
      const { loadAuthToken } = require('../src/http-server');
      const { logger } = require('../src/utils/logger');
      
      const token = loadAuthToken();
      expect(token).toBeNull();
      expect(logger.error).toHaveBeenCalled();
      const errorCall = logger.error.mock.calls[0];
      expect(errorCall[0]).toContain('Failed to read AUTH_TOKEN_FILE');
      expect(errorCall[1]).toBeInstanceOf(Error);
    });

    it('should return null when neither AUTH_TOKEN nor AUTH_TOKEN_FILE is set', () => {
      delete process.env.AUTH_TOKEN;
      delete process.env.AUTH_TOKEN_FILE;

      jest.resetModules();
      const { loadAuthToken } = require('../src/http-server');
      
      const token = loadAuthToken();
      expect(token).toBeNull();
    });
  });

  describe('validateEnvironment', () => {
    it('should exit when no auth token is available', () => {
      delete process.env.AUTH_TOKEN;
      delete process.env.AUTH_TOKEN_FILE;

      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exited');
      });

      jest.resetModules();
      
      expect(() => {
        require('../src/http-server');
      }).toThrow('Process exited');

      expect(mockExit).toHaveBeenCalledWith(1);
      mockExit.mockRestore();
    });

    it('should warn when token is less than 32 characters', () => {
      process.env.AUTH_TOKEN = 'short-token';

      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exited');
      });

      jest.resetModules();
      const { logger } = require('../src/utils/logger');
      
      try {
        require('../src/http-server');
      } catch (error) {
        // Module loads but may fail on server start
      }

      expect(logger.warn).toHaveBeenCalledWith(
        'AUTH_TOKEN should be at least 32 characters for security'
      );

      mockExit.mockRestore();
    });
  });

  describe('Integration test scenarios', () => {
    it('should successfully authenticate with token from file', () => {
      // This is more of an integration test placeholder
      // In a real scenario, you'd start the server and make HTTP requests
      
      writeFileSync(authTokenFile, 'very-secure-token-with-more-than-32-characters');
      process.env.AUTH_TOKEN_FILE = authTokenFile;
      delete process.env.AUTH_TOKEN;

      jest.resetModules();
      const { loadAuthToken } = require('../src/http-server');
      
      const token = loadAuthToken();
      expect(token).toBe('very-secure-token-with-more-than-32-characters');
    });

    it('should handle Docker secrets pattern', () => {
      // Docker secrets are typically mounted at /run/secrets/
      const dockerSecretPath = join(tempDir, 'run', 'secrets', 'auth_token');
      mkdirSync(join(tempDir, 'run', 'secrets'), { recursive: true });
      writeFileSync(dockerSecretPath, 'docker-secret-token');
      
      process.env.AUTH_TOKEN_FILE = dockerSecretPath;
      delete process.env.AUTH_TOKEN;

      jest.resetModules();
      const { loadAuthToken } = require('../src/http-server');
      
      const token = loadAuthToken();
      expect(token).toBe('docker-secret-token');
    });
  });
});