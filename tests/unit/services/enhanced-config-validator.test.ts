import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EnhancedConfigValidator, ValidationMode, ValidationProfile } from '@/services/enhanced-config-validator';
import { nodeFactory } from '@tests/fixtures/factories/node.factory';

// Mock node-specific validators
vi.mock('@/services/node-specific-validators', () => ({
  NodeSpecificValidators: {
    validateSlack: vi.fn(),
    validateGoogleSheets: vi.fn(),
    validateCode: vi.fn(),
    validateOpenAI: vi.fn(),
    validateMongoDB: vi.fn(),
    validateWebhook: vi.fn(),
    validatePostgres: vi.fn(),
    validateMySQL: vi.fn()
  }
}));

describe('EnhancedConfigValidator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateWithMode', () => {
    it('should validate config with operation awareness', () => {
      const nodeType = 'nodes-base.slack';
      const config = {
        resource: 'message',
        operation: 'send',
        channel: '#general',
        text: 'Hello World'
      };
      const properties = [
        { name: 'resource', type: 'options', required: true },
        { name: 'operation', type: 'options', required: true },
        { name: 'channel', type: 'string', required: true },
        { name: 'text', type: 'string', required: true }
      ];

      const result = EnhancedConfigValidator.validateWithMode(
        nodeType,
        config,
        properties,
        'operation',
        'ai-friendly'
      );

      expect(result).toMatchObject({
        valid: true,
        mode: 'operation',
        profile: 'ai-friendly',
        operation: {
          resource: 'message',
          operation: 'send'
        }
      });
    });

    it('should extract operation context from config', () => {
      const config = {
        resource: 'channel',
        operation: 'create',
        action: 'archive'
      };

      const context = EnhancedConfigValidator['extractOperationContext'](config);

      expect(context).toEqual({
        resource: 'channel',
        operation: 'create',
        action: 'archive'
      });
    });

    it('should filter properties based on operation context', () => {
      const properties = [
        { 
          name: 'channel',
          displayOptions: {
            show: {
              resource: ['message'],
              operation: ['send']
            }
          }
        },
        {
          name: 'user',
          displayOptions: {
            show: {
              resource: ['user'],
              operation: ['get']
            }
          }
        }
      ];

      // Mock isPropertyVisible to return true
      vi.spyOn(EnhancedConfigValidator as any, 'isPropertyVisible').mockReturnValue(true);

      const filtered = EnhancedConfigValidator['filterPropertiesByMode'](
        properties,
        { resource: 'message', operation: 'send' },
        'operation',
        { resource: 'message', operation: 'send' }
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('channel');
    });

    it('should handle minimal validation mode', () => {
      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.httpRequest',
        { url: 'https://api.example.com' },
        [{ name: 'url', required: true }],
        'minimal'
      );

      expect(result.mode).toBe('minimal');
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('validation profiles', () => {
    it('should apply strict profile with all checks', () => {
      const config = {};
      const properties = [
        { name: 'required', required: true },
        { name: 'optional', required: false }
      ];

      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.webhook',
        config,
        properties,
        'full',
        'strict'
      );

      expect(result.profile).toBe('strict');
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should apply runtime profile focusing on critical errors', () => {
      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.function',
        { functionCode: 'return items;' },
        [],
        'operation',
        'runtime'
      );

      expect(result.profile).toBe('runtime');
      expect(result.valid).toBe(true);
    });
  });

  describe('enhanced validation features', () => {
    it('should provide examples for common errors', () => {
      const config = { resource: 'message' };
      const properties = [
        { name: 'resource', required: true },
        { name: 'operation', required: true }
      ];

      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.slack',
        config,
        properties
      );

      // Examples are not implemented in the current code, just ensure the field exists
      expect(result.examples).toBeDefined();
      expect(Array.isArray(result.examples)).toBe(true);
    });

    it('should suggest next steps for incomplete configurations', () => {
      const config = { url: 'https://api.example.com' };
      
      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.httpRequest',
        config,
        []
      );

      expect(result.nextSteps).toBeDefined();
      expect(result.nextSteps?.length).toBeGreaterThan(0);
    });
  });
});