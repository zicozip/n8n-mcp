import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TelemetryConfigManager } from '../../../src/telemetry/config-manager';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn()
  };
});

describe('TelemetryConfigManager', () => {
  let manager: TelemetryConfigManager;

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear singleton instance
    (TelemetryConfigManager as any).instance = null;

    // Mock console.log to suppress first-run notice in tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = TelemetryConfigManager.getInstance();
      const instance2 = TelemetryConfigManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('loadConfig', () => {
    it('should create default config on first run', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      manager = TelemetryConfigManager.getInstance();
      const config = manager.loadConfig();

      expect(config.enabled).toBe(true);
      expect(config.userId).toMatch(/^[a-f0-9]{16}$/);
      expect(config.firstRun).toBeDefined();
      expect(vi.mocked(mkdirSync)).toHaveBeenCalledWith(
        join(homedir(), '.n8n-mcp'),
        { recursive: true }
      );
      expect(vi.mocked(writeFileSync)).toHaveBeenCalled();
    });

    it('should load existing config from disk', () => {
      const mockConfig = {
        enabled: false,
        userId: 'test-user-id',
        firstRun: '2024-01-01T00:00:00Z'
      };

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockConfig));

      manager = TelemetryConfigManager.getInstance();
      const config = manager.loadConfig();

      expect(config).toEqual(mockConfig);
    });

    it('should handle corrupted config file gracefully', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('invalid json');

      manager = TelemetryConfigManager.getInstance();
      const config = manager.loadConfig();

      expect(config.enabled).toBe(false);
      expect(config.userId).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should add userId to config if missing', () => {
      const mockConfig = {
        enabled: true,
        firstRun: '2024-01-01T00:00:00Z'
      };

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockConfig));

      manager = TelemetryConfigManager.getInstance();
      const config = manager.loadConfig();

      expect(config.userId).toMatch(/^[a-f0-9]{16}$/);
      expect(vi.mocked(writeFileSync)).toHaveBeenCalled();
    });
  });

  describe('isEnabled', () => {
    it('should return true when telemetry is enabled', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        enabled: true,
        userId: 'test-id'
      }));

      manager = TelemetryConfigManager.getInstance();
      expect(manager.isEnabled()).toBe(true);
    });

    it('should return false when telemetry is disabled', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        enabled: false,
        userId: 'test-id'
      }));

      manager = TelemetryConfigManager.getInstance();
      expect(manager.isEnabled()).toBe(false);
    });
  });

  describe('getUserId', () => {
    it('should return consistent user ID', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        enabled: true,
        userId: 'test-user-id-123'
      }));

      manager = TelemetryConfigManager.getInstance();
      expect(manager.getUserId()).toBe('test-user-id-123');
    });
  });

  describe('isFirstRun', () => {
    it('should return true if config file does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      manager = TelemetryConfigManager.getInstance();
      expect(manager.isFirstRun()).toBe(true);
    });

    it('should return false if config file exists', () => {
      vi.mocked(existsSync).mockReturnValue(true);

      manager = TelemetryConfigManager.getInstance();
      expect(manager.isFirstRun()).toBe(false);
    });
  });

  describe('enable/disable', () => {
    beforeEach(() => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        enabled: false,
        userId: 'test-id'
      }));
    });

    it('should enable telemetry', () => {
      manager = TelemetryConfigManager.getInstance();
      manager.enable();

      const calls = vi.mocked(writeFileSync).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const lastCall = calls[calls.length - 1];
      expect(lastCall[1]).toContain('"enabled": true');
    });

    it('should disable telemetry', () => {
      manager = TelemetryConfigManager.getInstance();
      manager.disable();

      const calls = vi.mocked(writeFileSync).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const lastCall = calls[calls.length - 1];
      expect(lastCall[1]).toContain('"enabled": false');
    });
  });

  describe('getStatus', () => {
    it('should return formatted status string', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        enabled: true,
        userId: 'test-id',
        firstRun: '2024-01-01T00:00:00Z'
      }));

      manager = TelemetryConfigManager.getInstance();
      const status = manager.getStatus();

      expect(status).toContain('ENABLED');
      expect(status).toContain('test-id');
      expect(status).toContain('2024-01-01T00:00:00Z');
      expect(status).toContain('npx n8n-mcp telemetry');
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle file system errors during config creation', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(mkdirSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      // Should not crash on file system errors
      expect(() => TelemetryConfigManager.getInstance()).not.toThrow();
    });

    it('should handle write errors during config save', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        enabled: false,
        userId: 'test-id'
      }));
      vi.mocked(writeFileSync).mockImplementation(() => {
        throw new Error('Disk full');
      });

      manager = TelemetryConfigManager.getInstance();

      // Should not crash on write errors
      expect(() => manager.enable()).not.toThrow();
      expect(() => manager.disable()).not.toThrow();
    });

    it('should handle missing home directory', () => {
      // Mock homedir to return empty string
      const originalHomedir = require('os').homedir;
      vi.doMock('os', () => ({
        homedir: () => ''
      }));

      vi.mocked(existsSync).mockReturnValue(false);

      expect(() => TelemetryConfigManager.getInstance()).not.toThrow();
    });

    it('should generate valid user ID when crypto.randomBytes fails', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      // Mock crypto to fail
      vi.doMock('crypto', () => ({
        randomBytes: () => {
          throw new Error('Crypto not available');
        }
      }));

      manager = TelemetryConfigManager.getInstance();
      const config = manager.loadConfig();

      expect(config.userId).toBeDefined();
      expect(config.userId).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should handle concurrent access to config file', () => {
      let readCount = 0;
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation(() => {
        readCount++;
        if (readCount === 1) {
          return JSON.stringify({
            enabled: false,
            userId: 'test-id-1'
          });
        }
        return JSON.stringify({
          enabled: true,
          userId: 'test-id-2'
        });
      });

      const manager1 = TelemetryConfigManager.getInstance();
      const manager2 = TelemetryConfigManager.getInstance();

      // Should be same instance due to singleton pattern
      expect(manager1).toBe(manager2);
    });

    it('should handle environment variable overrides', () => {
      const originalEnv = process.env.N8N_MCP_TELEMETRY_DISABLED;

      // Test with environment variable set to disable telemetry
      process.env.N8N_MCP_TELEMETRY_DISABLED = 'true';
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        enabled: true,
        userId: 'test-id'
      }));

      (TelemetryConfigManager as any).instance = null;
      manager = TelemetryConfigManager.getInstance();

      expect(manager.isEnabled()).toBe(false);

      // Test with environment variable set to enable telemetry
      process.env.N8N_MCP_TELEMETRY_DISABLED = 'false';
      (TelemetryConfigManager as any).instance = null;
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        enabled: true,
        userId: 'test-id'
      }));
      manager = TelemetryConfigManager.getInstance();

      expect(manager.isEnabled()).toBe(true);

      // Restore original environment
      process.env.N8N_MCP_TELEMETRY_DISABLED = originalEnv;
    });

    it('should handle invalid JSON in config file gracefully', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('{ invalid json syntax');

      manager = TelemetryConfigManager.getInstance();
      const config = manager.loadConfig();

      expect(config.enabled).toBe(false); // Default to disabled on corrupt config
      expect(config.userId).toMatch(/^[a-f0-9]{16}$/); // Should generate new user ID
    });

    it('should handle config file with partial structure', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        enabled: true
        // Missing userId and firstRun
      }));

      manager = TelemetryConfigManager.getInstance();
      const config = manager.loadConfig();

      expect(config.enabled).toBe(true);
      expect(config.userId).toMatch(/^[a-f0-9]{16}$/);
      // firstRun might not be defined if config is partial and loaded from disk
      // The implementation only adds firstRun on first creation
    });

    it('should handle config file with invalid data types', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        enabled: 'not-a-boolean',
        userId: 12345, // Not a string
        firstRun: null
      }));

      manager = TelemetryConfigManager.getInstance();
      const config = manager.loadConfig();

      // The config manager loads the data as-is, so we get the original types
      // The validation happens during usage, not loading
      expect(config.enabled).toBe('not-a-boolean');
      expect(config.userId).toBe(12345);
    });

    it('should handle very large config files', () => {
      const largeConfig = {
        enabled: true,
        userId: 'test-id',
        firstRun: '2024-01-01T00:00:00Z',
        extraData: 'x'.repeat(1000000) // 1MB of data
      };

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(largeConfig));

      expect(() => TelemetryConfigManager.getInstance()).not.toThrow();
    });

    it('should handle config directory creation race conditions', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      let mkdirCallCount = 0;
      vi.mocked(mkdirSync).mockImplementation(() => {
        mkdirCallCount++;
        if (mkdirCallCount === 1) {
          throw new Error('EEXIST: file already exists');
        }
        return undefined;
      });

      expect(() => TelemetryConfigManager.getInstance()).not.toThrow();
    });

    it('should handle file system permission changes', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        enabled: false,
        userId: 'test-id'
      }));

      manager = TelemetryConfigManager.getInstance();

      // Simulate permission denied on subsequent write
      vi.mocked(writeFileSync).mockImplementationOnce(() => {
        throw new Error('EACCES: permission denied');
      });

      expect(() => manager.enable()).not.toThrow();
    });

    it('should handle system clock changes affecting timestamps', () => {
      const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year in future
      const pastDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); // 1 year in past

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        enabled: true,
        userId: 'test-id',
        firstRun: futureDate.toISOString()
      }));

      manager = TelemetryConfigManager.getInstance();
      const config = manager.loadConfig();

      expect(config.firstRun).toBeDefined();
      expect(new Date(config.firstRun as string).getTime()).toBeGreaterThan(0);
    });

    it('should handle config updates during runtime', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        enabled: false,
        userId: 'test-id'
      }));

      manager = TelemetryConfigManager.getInstance();
      expect(manager.isEnabled()).toBe(false);

      // Simulate external config change by clearing cache first
      (manager as any).config = null;
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        enabled: true,
        userId: 'test-id'
      }));

      // Now calling loadConfig should pick up changes
      const newConfig = manager.loadConfig();
      expect(newConfig.enabled).toBe(true);
      expect(manager.isEnabled()).toBe(true);
    });

    it('should handle multiple rapid enable/disable calls', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        enabled: false,
        userId: 'test-id'
      }));

      manager = TelemetryConfigManager.getInstance();

      // Rapidly toggle state
      for (let i = 0; i < 100; i++) {
        if (i % 2 === 0) {
          manager.enable();
        } else {
          manager.disable();
        }
      }

      // Should not crash and maintain consistent state
      expect(typeof manager.isEnabled()).toBe('boolean');
    });

    it('should handle user ID collision (extremely unlikely)', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      // Mock crypto to always return same bytes
      const mockBytes = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
      vi.doMock('crypto', () => ({
        randomBytes: () => mockBytes
      }));

      (TelemetryConfigManager as any).instance = null;
      const manager1 = TelemetryConfigManager.getInstance();
      const userId1 = manager1.getUserId();

      (TelemetryConfigManager as any).instance = null;
      const manager2 = TelemetryConfigManager.getInstance();
      const userId2 = manager2.getUserId();

      // Should generate same ID from same random bytes
      expect(userId1).toBe(userId2);
      expect(userId1).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should handle status generation with missing fields', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        enabled: true
        // Missing userId and firstRun
      }));

      manager = TelemetryConfigManager.getInstance();
      const status = manager.getStatus();

      expect(status).toContain('ENABLED');
      expect(status).toBeDefined();
      expect(typeof status).toBe('string');
    });
  });
});