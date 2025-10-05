/**
 * Integration Tests: handleListAvailableTools
 *
 * Tests tool listing functionality.
 * Covers tool discovery and configuration status.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createMcpContext } from '../utils/mcp-context';
import { InstanceContext } from '../../../../src/types/instance-context';
import { handleListAvailableTools } from '../../../../src/mcp/handlers-n8n-manager';

describe('Integration: handleListAvailableTools', () => {
  let mcpContext: InstanceContext;

  beforeEach(() => {
    mcpContext = createMcpContext();
  });

  // ======================================================================
  // List All Tools
  // ======================================================================

  describe('Tool Listing', () => {
    it('should list all available tools organized by category', async () => {
      const response = await handleListAvailableTools(mcpContext);

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();

      const data = response.data as any;

      // Verify tools array exists
      expect(data).toHaveProperty('tools');
      expect(Array.isArray(data.tools)).toBe(true);
      expect(data.tools.length).toBeGreaterThan(0);

      // Verify tool categories
      const categories = data.tools.map((cat: any) => cat.category);
      expect(categories).toContain('Workflow Management');
      expect(categories).toContain('Execution Management');
      expect(categories).toContain('System');

      // Verify each category has tools
      data.tools.forEach((category: any) => {
        expect(category).toHaveProperty('category');
        expect(category).toHaveProperty('tools');
        expect(Array.isArray(category.tools)).toBe(true);
        expect(category.tools.length).toBeGreaterThan(0);

        // Verify each tool has required fields
        category.tools.forEach((tool: any) => {
          expect(tool).toHaveProperty('name');
          expect(tool).toHaveProperty('description');
          expect(typeof tool.name).toBe('string');
          expect(typeof tool.description).toBe('string');
        });
      });
    });

    it('should include API configuration status', async () => {
      const response = await handleListAvailableTools(mcpContext);

      expect(response.success).toBe(true);
      const data = response.data as any;

      // Verify configuration status
      expect(data).toHaveProperty('apiConfigured');
      expect(typeof data.apiConfigured).toBe('boolean');

      // Since tests run with API configured, should be true
      expect(data.apiConfigured).toBe(true);

      // Verify configuration details are present when configured
      if (data.apiConfigured) {
        expect(data).toHaveProperty('configuration');
        expect(data.configuration).toBeDefined();
        expect(data.configuration).toHaveProperty('apiUrl');
        expect(data.configuration).toHaveProperty('timeout');
        expect(data.configuration).toHaveProperty('maxRetries');
      }
    });

    it('should include API limitations information', async () => {
      const response = await handleListAvailableTools(mcpContext);

      expect(response.success).toBe(true);
      const data = response.data as any;

      // Verify limitations are documented
      expect(data).toHaveProperty('limitations');
      expect(Array.isArray(data.limitations)).toBe(true);
      expect(data.limitations.length).toBeGreaterThan(0);

      // Verify limitations are informative strings
      data.limitations.forEach((limitation: string) => {
        expect(typeof limitation).toBe('string');
        expect(limitation.length).toBeGreaterThan(0);
      });

      // Common known limitations
      const limitationsText = data.limitations.join(' ');
      expect(limitationsText).toContain('Cannot activate');
      expect(limitationsText).toContain('Cannot execute workflows directly');
    });
  });

  // ======================================================================
  // Workflow Management Tools
  // ======================================================================

  describe('Workflow Management Tools', () => {
    it('should include all workflow management tools', async () => {
      const response = await handleListAvailableTools(mcpContext);
      const data = response.data as any;

      const workflowCategory = data.tools.find((cat: any) => cat.category === 'Workflow Management');
      expect(workflowCategory).toBeDefined();

      const toolNames = workflowCategory.tools.map((t: any) => t.name);

      // Core workflow tools
      expect(toolNames).toContain('n8n_create_workflow');
      expect(toolNames).toContain('n8n_get_workflow');
      expect(toolNames).toContain('n8n_update_workflow');
      expect(toolNames).toContain('n8n_delete_workflow');
      expect(toolNames).toContain('n8n_list_workflows');

      // Enhanced workflow tools
      expect(toolNames).toContain('n8n_get_workflow_details');
      expect(toolNames).toContain('n8n_get_workflow_structure');
      expect(toolNames).toContain('n8n_get_workflow_minimal');
      expect(toolNames).toContain('n8n_validate_workflow');
      expect(toolNames).toContain('n8n_autofix_workflow');
    });
  });

  // ======================================================================
  // Execution Management Tools
  // ======================================================================

  describe('Execution Management Tools', () => {
    it('should include all execution management tools', async () => {
      const response = await handleListAvailableTools(mcpContext);
      const data = response.data as any;

      const executionCategory = data.tools.find((cat: any) => cat.category === 'Execution Management');
      expect(executionCategory).toBeDefined();

      const toolNames = executionCategory.tools.map((t: any) => t.name);

      expect(toolNames).toContain('n8n_trigger_webhook_workflow');
      expect(toolNames).toContain('n8n_get_execution');
      expect(toolNames).toContain('n8n_list_executions');
      expect(toolNames).toContain('n8n_delete_execution');
    });
  });

  // ======================================================================
  // System Tools
  // ======================================================================

  describe('System Tools', () => {
    it('should include system tools', async () => {
      const response = await handleListAvailableTools(mcpContext);
      const data = response.data as any;

      const systemCategory = data.tools.find((cat: any) => cat.category === 'System');
      expect(systemCategory).toBeDefined();

      const toolNames = systemCategory.tools.map((t: any) => t.name);

      expect(toolNames).toContain('n8n_health_check');
      expect(toolNames).toContain('n8n_list_available_tools');
    });
  });

  // ======================================================================
  // Response Format Verification
  // ======================================================================

  describe('Response Format', () => {
    it('should return complete tool list response structure', async () => {
      const response = await handleListAvailableTools(mcpContext);

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();

      const data = response.data as any;

      // Verify all required fields
      expect(data).toHaveProperty('tools');
      expect(data).toHaveProperty('apiConfigured');
      expect(data).toHaveProperty('limitations');

      // Verify optional configuration field
      if (data.apiConfigured) {
        expect(data).toHaveProperty('configuration');
      }

      // Verify data types
      expect(Array.isArray(data.tools)).toBe(true);
      expect(typeof data.apiConfigured).toBe('boolean');
      expect(Array.isArray(data.limitations)).toBe(true);
    });
  });
});
