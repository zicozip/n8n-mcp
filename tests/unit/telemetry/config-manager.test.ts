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
});