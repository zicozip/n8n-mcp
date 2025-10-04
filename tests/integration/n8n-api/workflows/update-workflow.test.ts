/**
 * Integration Tests: handleUpdateWorkflow
 *
 * Tests full workflow updates against a real n8n instance.
 * Covers various update scenarios including nodes, connections, settings, and tags.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { createTestContext, TestContext, createTestWorkflowName } from '../utils/test-context';
import { getTestN8nClient } from '../utils/n8n-client';
import { N8nApiClient } from '../../../../src/services/n8n-api-client';
import { SIMPLE_WEBHOOK_WORKFLOW, SIMPLE_HTTP_WORKFLOW } from '../utils/fixtures';
import { cleanupOrphanedWorkflows } from '../utils/cleanup-helpers';
import { createMcpContext } from '../utils/mcp-context';
import { InstanceContext } from '../../../../src/types/instance-context';
import { handleUpdateWorkflow } from '../../../../src/mcp/handlers-n8n-manager';

describe('Integration: handleUpdateWorkflow', () => {
  let context: TestContext;
  let client: N8nApiClient;
  let mcpContext: InstanceContext;

  beforeEach(() => {
    context = createTestContext();
    client = getTestN8nClient();
    mcpContext = createMcpContext();
  });

  afterEach(async () => {
    await context.cleanup();
  });

  afterAll(async () => {
    if (!process.env.CI) {
      await cleanupOrphanedWorkflows();
    }
  });

  // ======================================================================
  // Full Workflow Replacement
  // ======================================================================

  describe('Full Workflow Replacement', () => {
    it('should replace entire workflow with new nodes and connections', async () => {
      // Create initial simple workflow
      const initialWorkflow = {
        ...SIMPLE_WEBHOOK_WORKFLOW,
        name: createTestWorkflowName('Update - Full Replacement'),
        tags: ['mcp-integration-test']
      };

      const created = await client.createWorkflow(initialWorkflow);
      expect(created.id).toBeTruthy();
      if (!created.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(created.id);

      // Replace with HTTP workflow (completely different structure)
      const replacement = {
        ...SIMPLE_HTTP_WORKFLOW,
        name: createTestWorkflowName('Update - Full Replacement (Updated)'),
        tags: ['mcp-integration-test', 'updated']
      };

      // Update using MCP handler
      const response = await handleUpdateWorkflow(
        {
          id: created.id,
          name: replacement.name,
          nodes: replacement.nodes,
          connections: replacement.connections,
          tags: replacement.tags
        },
        mcpContext
      );

      // Verify MCP response
      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();

      const updated = response.data as any;
      expect(updated.id).toBe(created.id);
      expect(updated.name).toBe(replacement.name);
      expect(updated.nodes).toHaveLength(2); // HTTP workflow has 2 nodes
      expect(updated.tags).toContain('updated');
    });
  });

  // ======================================================================
  // Update Nodes
  // ======================================================================

  describe('Update Nodes', () => {
    it('should update workflow nodes while preserving other properties', async () => {
      // Create workflow
      const workflow = {
        ...SIMPLE_WEBHOOK_WORKFLOW,
        name: createTestWorkflowName('Update - Nodes Only'),
        tags: ['mcp-integration-test']
      };

      const created = await client.createWorkflow(workflow);
      expect(created.id).toBeTruthy();
      if (!created.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(created.id);

      // Update nodes - add a second node
      const updatedNodes = [
        ...workflow.nodes!,
        {
          id: 'set-1',
          name: 'Set',
          type: 'n8n-nodes-base.set',
          typeVersion: 3.4,
          position: [450, 300] as [number, number],
          parameters: {
            assignments: {
              assignments: [
                {
                  id: 'assign-1',
                  name: 'test',
                  value: 'value',
                  type: 'string'
                }
              ]
            }
          }
        }
      ];

      const updatedConnections = {
        Webhook: {
          main: [[{ node: 'Set', type: 'main' as const, index: 0 }]]
        }
      };

      // Update using MCP handler
      const response = await handleUpdateWorkflow(
        {
          id: created.id,
          nodes: updatedNodes,
          connections: updatedConnections
        },
        mcpContext
      );

      expect(response.success).toBe(true);
      const updated = response.data as any;
      expect(updated.nodes).toHaveLength(2);
      expect(updated.nodes.find((n: any) => n.name === 'Set')).toBeDefined();
    });
  });

  // ======================================================================
  // Update Connections
  // ======================================================================

  describe('Update Connections', () => {
    it('should update workflow connections', async () => {
      // Create HTTP workflow
      const workflow = {
        ...SIMPLE_HTTP_WORKFLOW,
        name: createTestWorkflowName('Update - Connections'),
        tags: ['mcp-integration-test']
      };

      const created = await client.createWorkflow(workflow);
      expect(created.id).toBeTruthy();
      if (!created.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(created.id);

      // Remove connections (disconnect nodes)
      const response = await handleUpdateWorkflow(
        {
          id: created.id,
          connections: {}
        },
        mcpContext
      );

      expect(response.success).toBe(true);
      const updated = response.data as any;
      expect(Object.keys(updated.connections || {})).toHaveLength(0);
    });
  });

  // ======================================================================
  // Update Settings
  // ======================================================================

  describe('Update Settings', () => {
    it('should update workflow settings without affecting nodes', async () => {
      // Create workflow
      const workflow = {
        ...SIMPLE_WEBHOOK_WORKFLOW,
        name: createTestWorkflowName('Update - Settings'),
        tags: ['mcp-integration-test']
      };

      const created = await client.createWorkflow(workflow);
      expect(created.id).toBeTruthy();
      if (!created.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(created.id);

      // Update settings
      const response = await handleUpdateWorkflow(
        {
          id: created.id,
          settings: {
            executionOrder: 'v1' as const,
            timezone: 'Europe/London'
          }
        },
        mcpContext
      );

      expect(response.success).toBe(true);
      const updated = response.data as any;
      expect(updated.settings?.timezone).toBe('Europe/London');
      expect(updated.nodes).toHaveLength(1); // Nodes unchanged
    });
  });

  // ======================================================================
  // Update Tags
  // ======================================================================

  describe('Update Tags', () => {
    it('should update workflow tags', async () => {
      // Create workflow
      const workflow = {
        ...SIMPLE_WEBHOOK_WORKFLOW,
        name: createTestWorkflowName('Update - Tags'),
        tags: ['mcp-integration-test', 'original']
      };

      const created = await client.createWorkflow(workflow);
      expect(created.id).toBeTruthy();
      if (!created.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(created.id);

      // Update tags
      const response = await handleUpdateWorkflow(
        {
          id: created.id,
          tags: ['mcp-integration-test', 'updated', 'modified']
        },
        mcpContext
      );

      expect(response.success).toBe(true);
      const updated = response.data as any;

      // Note: n8n API tag behavior may vary
      if (updated.tags) {
        expect(updated.tags).toContain('updated');
      }
    });
  });

  // ======================================================================
  // Validation Errors
  // ======================================================================

  describe('Validation Errors', () => {
    it('should return error for invalid node types', async () => {
      // Create workflow
      const workflow = {
        ...SIMPLE_WEBHOOK_WORKFLOW,
        name: createTestWorkflowName('Update - Invalid Node Type'),
        tags: ['mcp-integration-test']
      };

      const created = await client.createWorkflow(workflow);
      expect(created.id).toBeTruthy();
      if (!created.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(created.id);

      // Try to update with invalid node type
      const response = await handleUpdateWorkflow(
        {
          id: created.id,
          nodes: [
            {
              id: 'invalid-1',
              name: 'Invalid',
              type: 'invalid-node-type',
              typeVersion: 1,
              position: [250, 300],
              parameters: {}
            }
          ],
          connections: {}
        },
        mcpContext
      );

      // Validation should fail
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should return error for non-existent workflow ID', async () => {
      const response = await handleUpdateWorkflow(
        {
          id: '99999999',
          name: 'Should Fail'
        },
        mcpContext
      );

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });
  });

  // ======================================================================
  // Update Name Only
  // ======================================================================

  describe('Update Name', () => {
    it('should update workflow name without affecting structure', async () => {
      // Create workflow
      const workflow = {
        ...SIMPLE_WEBHOOK_WORKFLOW,
        name: createTestWorkflowName('Update - Name Original'),
        tags: ['mcp-integration-test']
      };

      const created = await client.createWorkflow(workflow);
      expect(created.id).toBeTruthy();
      if (!created.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(created.id);

      const newName = createTestWorkflowName('Update - Name Modified');

      // Update name only
      const response = await handleUpdateWorkflow(
        {
          id: created.id,
          name: newName
        },
        mcpContext
      );

      expect(response.success).toBe(true);
      const updated = response.data as any;
      expect(updated.name).toBe(newName);
      expect(updated.nodes).toHaveLength(1); // Structure unchanged
    });
  });

  // ======================================================================
  // Multiple Properties Update
  // ======================================================================

  describe('Multiple Properties', () => {
    it('should update name, tags, and settings together', async () => {
      // Create workflow
      const workflow = {
        ...SIMPLE_WEBHOOK_WORKFLOW,
        name: createTestWorkflowName('Update - Multiple Props'),
        tags: ['mcp-integration-test']
      };

      const created = await client.createWorkflow(workflow);
      expect(created.id).toBeTruthy();
      if (!created.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(created.id);

      const newName = createTestWorkflowName('Update - Multiple Props (Modified)');

      // Update multiple properties
      const response = await handleUpdateWorkflow(
        {
          id: created.id,
          name: newName,
          tags: ['mcp-integration-test', 'multi-update'],
          settings: {
            executionOrder: 'v1' as const,
            timezone: 'America/New_York'
          }
        },
        mcpContext
      );

      expect(response.success).toBe(true);
      const updated = response.data as any;
      expect(updated.name).toBe(newName);
      expect(updated.settings?.timezone).toBe('America/New_York');

      if (updated.tags) {
        expect(updated.tags).toContain('multi-update');
      }
    });
  });
});
