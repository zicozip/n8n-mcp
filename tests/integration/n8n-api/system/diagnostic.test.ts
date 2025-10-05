/**
 * Integration Tests: handleDiagnostic
 *
 * Tests system diagnostic functionality.
 * Covers environment checks, API status, and verbose mode.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createMcpContext } from '../utils/mcp-context';
import { InstanceContext } from '../../../../src/types/instance-context';
import { handleDiagnostic } from '../../../../src/mcp/handlers-n8n-manager';
import { DiagnosticResponse } from '../utils/response-types';

describe('Integration: handleDiagnostic', () => {
  let mcpContext: InstanceContext;

  beforeEach(() => {
    mcpContext = createMcpContext();
  });

  // ======================================================================
  // Basic Diagnostic
  // ======================================================================

  describe('Basic Diagnostic', () => {
    it('should run basic diagnostic check', async () => {
      const response = await handleDiagnostic(
        { params: { arguments: {} } },
        mcpContext
      );

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();

      const data = response.data as DiagnosticResponse;

      // Verify core diagnostic fields
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('environment');
      expect(data).toHaveProperty('apiConfiguration');
      expect(data).toHaveProperty('toolsAvailability');
      expect(data).toHaveProperty('troubleshooting');

      // Verify timestamp format
      expect(typeof data.timestamp).toBe('string');
      const timestamp = new Date(data.timestamp);
      expect(timestamp.toString()).not.toBe('Invalid Date');
    });

    it('should include environment variables', async () => {
      const response = await handleDiagnostic(
        { params: { arguments: {} } },
        mcpContext
      );

      const data = response.data as DiagnosticResponse;

      expect(data.environment).toBeDefined();
      expect(data.environment).toHaveProperty('N8N_API_URL');
      expect(data.environment).toHaveProperty('N8N_API_KEY');
      expect(data.environment).toHaveProperty('NODE_ENV');
      expect(data.environment).toHaveProperty('MCP_MODE');

      // API key should be masked
      if (data.environment.N8N_API_KEY) {
        expect(data.environment.N8N_API_KEY).toBe('***configured***');
      }
    });

    it('should check API configuration and connectivity', async () => {
      const response = await handleDiagnostic(
        { params: { arguments: {} } },
        mcpContext
      );

      const data = response.data as DiagnosticResponse;

      expect(data.apiConfiguration).toBeDefined();
      expect(data.apiConfiguration).toHaveProperty('configured');
      expect(data.apiConfiguration).toHaveProperty('status');

      // In test environment, API should be configured
      expect(data.apiConfiguration.configured).toBe(true);

      // Verify API status
      const status = data.apiConfiguration.status;
      expect(status).toHaveProperty('configured');
      expect(status).toHaveProperty('connected');

      // Should successfully connect to n8n API
      expect(status.connected).toBe(true);

      // If connected, should have version info
      if (status.connected) {
        expect(status).toHaveProperty('version');
      }

      // Config details should be present when configured
      if (data.apiConfiguration.configured) {
        expect(data.apiConfiguration).toHaveProperty('config');
        expect(data.apiConfiguration.config).toHaveProperty('baseUrl');
        expect(data.apiConfiguration.config).toHaveProperty('timeout');
        expect(data.apiConfiguration.config).toHaveProperty('maxRetries');
      }
    });

    it('should report tools availability', async () => {
      const response = await handleDiagnostic(
        { params: { arguments: {} } },
        mcpContext
      );

      const data = response.data as DiagnosticResponse;

      expect(data.toolsAvailability).toBeDefined();
      expect(data.toolsAvailability).toHaveProperty('documentationTools');
      expect(data.toolsAvailability).toHaveProperty('managementTools');
      expect(data.toolsAvailability).toHaveProperty('totalAvailable');

      // Documentation tools should always be available
      const docTools = data.toolsAvailability.documentationTools;
      expect(docTools.count).toBeGreaterThan(0);
      expect(docTools.enabled).toBe(true);
      expect(docTools.description).toBeDefined();

      // Management tools should be available when API configured
      const mgmtTools = data.toolsAvailability.managementTools;
      expect(mgmtTools).toHaveProperty('count');
      expect(mgmtTools).toHaveProperty('enabled');
      expect(mgmtTools).toHaveProperty('description');

      // In test environment, management tools should be enabled
      expect(mgmtTools.enabled).toBe(true);
      expect(mgmtTools.count).toBeGreaterThan(0);

      // Total should be sum of both
      expect(data.toolsAvailability.totalAvailable).toBe(
        docTools.count + mgmtTools.count
      );
    });

    it('should include troubleshooting information', async () => {
      const response = await handleDiagnostic(
        { params: { arguments: {} } },
        mcpContext
      );

      const data = response.data as DiagnosticResponse;

      expect(data.troubleshooting).toBeDefined();
      expect(data.troubleshooting).toHaveProperty('steps');
      expect(data.troubleshooting).toHaveProperty('documentation');

      // Troubleshooting steps should be an array
      expect(Array.isArray(data.troubleshooting.steps)).toBe(true);
      expect(data.troubleshooting.steps.length).toBeGreaterThan(0);

      // Documentation link should be present
      expect(typeof data.troubleshooting.documentation).toBe('string');
      expect(data.troubleshooting.documentation).toContain('https://');
    });
  });

  // ======================================================================
  // Verbose Mode
  // ======================================================================

  describe('Verbose Mode', () => {
    it('should include additional debug info in verbose mode', async () => {
      const response = await handleDiagnostic(
        { params: { arguments: { verbose: true } } },
        mcpContext
      );

      expect(response.success).toBe(true);
      const data = response.data as DiagnosticResponse;

      // Verbose mode should add debug section
      expect(data).toHaveProperty('debug');
      expect(data.debug).toBeDefined();

      // Verify debug information
      expect(data.debug).toBeDefined();
      expect(data.debug).toHaveProperty('processEnv');
      expect(data.debug).toHaveProperty('nodeVersion');
      expect(data.debug).toHaveProperty('platform');
      expect(data.debug).toHaveProperty('workingDirectory');

      // Process env should list relevant environment variables
      expect(Array.isArray(data.debug?.processEnv)).toBe(true);

      // Node version should be a string
      expect(typeof data.debug?.nodeVersion).toBe('string');
      expect(data.debug?.nodeVersion).toMatch(/^v\d+\.\d+\.\d+/);

      // Platform should be a string (linux, darwin, win32, etc.)
      expect(typeof data.debug?.platform).toBe('string');
      expect(data.debug && data.debug.platform.length).toBeGreaterThan(0);

      // Working directory should be a path
      expect(typeof data.debug?.workingDirectory).toBe('string');
      expect(data.debug && data.debug.workingDirectory.length).toBeGreaterThan(0);
    });

    it('should not include debug info when verbose is false', async () => {
      const response = await handleDiagnostic(
        { params: { arguments: { verbose: false } } },
        mcpContext
      );

      expect(response.success).toBe(true);
      const data = response.data as DiagnosticResponse;

      // Debug section should not be present
      expect(data.debug).toBeUndefined();
    });

    it('should not include debug info by default', async () => {
      const response = await handleDiagnostic(
        { params: { arguments: {} } },
        mcpContext
      );

      expect(response.success).toBe(true);
      const data = response.data as DiagnosticResponse;

      // Debug section should not be present when verbose not specified
      expect(data.debug).toBeUndefined();
    });
  });

  // ======================================================================
  // Response Format Verification
  // ======================================================================

  describe('Response Format', () => {
    it('should return complete diagnostic response structure', async () => {
      const response = await handleDiagnostic(
        { params: { arguments: {} } },
        mcpContext
      );

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();

      const data = response.data as DiagnosticResponse;

      // Verify all required fields
      const requiredFields = [
        'timestamp',
        'environment',
        'apiConfiguration',
        'toolsAvailability',
        'troubleshooting'
      ];

      requiredFields.forEach(field => {
        expect(data).toHaveProperty(field);
        expect(data[field]).toBeDefined();
      });

      // Verify data types
      expect(typeof data.timestamp).toBe('string');
      expect(typeof data.environment).toBe('object');
      expect(typeof data.apiConfiguration).toBe('object');
      expect(typeof data.toolsAvailability).toBe('object');
      expect(typeof data.troubleshooting).toBe('object');
    });
  });
});
