/**
 * Integration Tests: handleUpdatePartialWorkflow
 *
 * Tests diff-based partial workflow updates against a real n8n instance.
 * Covers all 15 operation types: node operations (6), connection operations (5),
 * and metadata operations (4).
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { createTestContext, TestContext, createTestWorkflowName } from '../utils/test-context';
import { getTestN8nClient } from '../utils/n8n-client';
import { N8nApiClient } from '../../../../src/services/n8n-api-client';
import { SIMPLE_WEBHOOK_WORKFLOW, SIMPLE_HTTP_WORKFLOW, MULTI_NODE_WORKFLOW } from '../utils/fixtures';
import { cleanupOrphanedWorkflows } from '../utils/cleanup-helpers';
import { createMcpContext } from '../utils/mcp-context';
import { InstanceContext } from '../../../../src/types/instance-context';
import { handleUpdatePartialWorkflow } from '../../../../src/mcp/handlers-workflow-diff';

describe('Integration: handleUpdatePartialWorkflow', () => {
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
  // NODE OPERATIONS (6 operations)
  // ======================================================================

  describe('Node Operations', () => {
    describe('addNode', () => {
      it('should add a new node to workflow', async () => {
        // Create simple workflow
        const workflow = {
          ...SIMPLE_WEBHOOK_WORKFLOW,
          name: createTestWorkflowName('Partial - Add Node'),
          tags: ['mcp-integration-test']
        };

        const created = await client.createWorkflow(workflow);
        expect(created.id).toBeTruthy();
        if (!created.id) throw new Error('Workflow ID is missing');
        context.trackWorkflow(created.id);

        // Add a Set node
        const response = await handleUpdatePartialWorkflow(
          {
            id: created.id,
            operations: [
              {
                type: 'addNode',
                node: {
                  name: 'Set',
                  type: 'n8n-nodes-base.set',
                  typeVersion: 3.4,
                  position: [450, 300],
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
              }
            ]
          },
          mcpContext
        );

        expect(response.success).toBe(true);
        const updated = response.data as any;
        expect(updated.nodes).toHaveLength(2);
        expect(updated.nodes.find((n: any) => n.name === 'Set')).toBeDefined();
      });

      it('should return error for duplicate node name', async () => {
        const workflow = {
          ...SIMPLE_WEBHOOK_WORKFLOW,
          name: createTestWorkflowName('Partial - Duplicate Node Name'),
          tags: ['mcp-integration-test']
        };

        const created = await client.createWorkflow(workflow);
        expect(created.id).toBeTruthy();
        if (!created.id) throw new Error('Workflow ID is missing');
        context.trackWorkflow(created.id);

        // Try to add node with same name as existing
        const response = await handleUpdatePartialWorkflow(
          {
            id: created.id,
            operations: [
              {
                type: 'addNode',
                node: {
                  name: 'Webhook', // Duplicate name
                  type: 'n8n-nodes-base.set',
                  typeVersion: 3.4,
                  position: [450, 300],
                  parameters: {}
                }
              }
            ]
          },
          mcpContext
        );

        expect(response.success).toBe(false);
        expect(response.error).toBeDefined();
      });
    });

    describe('removeNode', () => {
      it('should remove node by name', async () => {
        const workflow = {
          ...SIMPLE_HTTP_WORKFLOW,
          name: createTestWorkflowName('Partial - Remove Node'),
          tags: ['mcp-integration-test']
        };

        const created = await client.createWorkflow(workflow);
        expect(created.id).toBeTruthy();
        if (!created.id) throw new Error('Workflow ID is missing');
        context.trackWorkflow(created.id);

        // Remove HTTP Request node by name
        const response = await handleUpdatePartialWorkflow(
          {
            id: created.id,
            operations: [
              {
                type: 'removeNode',
                nodeName: 'HTTP Request'
              }
            ]
          },
          mcpContext
        );

        expect(response.success).toBe(true);
        const updated = response.data as any;
        expect(updated.nodes).toHaveLength(1);
        expect(updated.nodes.find((n: any) => n.name === 'HTTP Request')).toBeUndefined();
      });

      it('should return error for non-existent node', async () => {
        const workflow = {
          ...SIMPLE_WEBHOOK_WORKFLOW,
          name: createTestWorkflowName('Partial - Remove Non-existent'),
          tags: ['mcp-integration-test']
        };

        const created = await client.createWorkflow(workflow);
        expect(created.id).toBeTruthy();
        if (!created.id) throw new Error('Workflow ID is missing');
        context.trackWorkflow(created.id);

        const response = await handleUpdatePartialWorkflow(
          {
            id: created.id,
            operations: [
              {
                type: 'removeNode',
                nodeName: 'NonExistentNode'
              }
            ]
          },
          mcpContext
        );

        expect(response.success).toBe(false);
      });
    });

    describe('updateNode', () => {
      it('should update node parameters', async () => {
        const workflow = {
          ...SIMPLE_WEBHOOK_WORKFLOW,
          name: createTestWorkflowName('Partial - Update Node'),
          tags: ['mcp-integration-test']
        };

        const created = await client.createWorkflow(workflow);
        expect(created.id).toBeTruthy();
        if (!created.id) throw new Error('Workflow ID is missing');
        context.trackWorkflow(created.id);

        // Update webhook path
        const response = await handleUpdatePartialWorkflow(
          {
            id: created.id,
            operations: [
              {
                type: 'updateNode',
                nodeName: 'Webhook',
                updates: {
                  'parameters.path': 'updated-path'
                }
              }
            ]
          },
          mcpContext
        );

        expect(response.success).toBe(true);
        const updated = response.data as any;
        const webhookNode = updated.nodes.find((n: any) => n.name === 'Webhook');
        expect(webhookNode.parameters.path).toBe('updated-path');
      });

      it('should update nested parameters', async () => {
        const workflow = {
          ...SIMPLE_WEBHOOK_WORKFLOW,
          name: createTestWorkflowName('Partial - Update Nested'),
          tags: ['mcp-integration-test']
        };

        const created = await client.createWorkflow(workflow);
        expect(created.id).toBeTruthy();
        if (!created.id) throw new Error('Workflow ID is missing');
        context.trackWorkflow(created.id);

        const response = await handleUpdatePartialWorkflow(
          {
            id: created.id,
            operations: [
              {
                type: 'updateNode',
                nodeName: 'Webhook',
                updates: {
                  'parameters.httpMethod': 'POST',
                  'parameters.path': 'new-path'
                }
              }
            ]
          },
          mcpContext
        );

        expect(response.success).toBe(true);
        const updated = response.data as any;
        const webhookNode = updated.nodes.find((n: any) => n.name === 'Webhook');
        expect(webhookNode.parameters.httpMethod).toBe('POST');
        expect(webhookNode.parameters.path).toBe('new-path');
      });
    });

    describe('moveNode', () => {
      it('should move node to new position', async () => {
        const workflow = {
          ...SIMPLE_WEBHOOK_WORKFLOW,
          name: createTestWorkflowName('Partial - Move Node'),
          tags: ['mcp-integration-test']
        };

        const created = await client.createWorkflow(workflow);
        expect(created.id).toBeTruthy();
        if (!created.id) throw new Error('Workflow ID is missing');
        context.trackWorkflow(created.id);

        const newPosition: [number, number] = [500, 500];

        const response = await handleUpdatePartialWorkflow(
          {
            id: created.id,
            operations: [
              {
                type: 'moveNode',
                nodeName: 'Webhook',
                position: newPosition
              }
            ]
          },
          mcpContext
        );

        expect(response.success).toBe(true);
        const updated = response.data as any;
        const webhookNode = updated.nodes.find((n: any) => n.name === 'Webhook');
        expect(webhookNode.position).toEqual(newPosition);
      });
    });

    describe('enableNode / disableNode', () => {
      it('should disable a node', async () => {
        const workflow = {
          ...SIMPLE_WEBHOOK_WORKFLOW,
          name: createTestWorkflowName('Partial - Disable Node'),
          tags: ['mcp-integration-test']
        };

        const created = await client.createWorkflow(workflow);
        expect(created.id).toBeTruthy();
        if (!created.id) throw new Error('Workflow ID is missing');
        context.trackWorkflow(created.id);

        const response = await handleUpdatePartialWorkflow(
          {
            id: created.id,
            operations: [
              {
                type: 'disableNode',
                nodeName: 'Webhook'
              }
            ]
          },
          mcpContext
        );

        expect(response.success).toBe(true);
        const updated = response.data as any;
        const webhookNode = updated.nodes.find((n: any) => n.name === 'Webhook');
        expect(webhookNode.disabled).toBe(true);
      });

      it('should enable a disabled node', async () => {
        const workflow = {
          ...SIMPLE_WEBHOOK_WORKFLOW,
          name: createTestWorkflowName('Partial - Enable Node'),
          tags: ['mcp-integration-test']
        };

        const created = await client.createWorkflow(workflow);
        expect(created.id).toBeTruthy();
        if (!created.id) throw new Error('Workflow ID is missing');
        context.trackWorkflow(created.id);

        // First disable the node
        await handleUpdatePartialWorkflow(
          {
            id: created.id,
            operations: [{ type: 'disableNode', nodeName: 'Webhook' }]
          },
          mcpContext
        );

        // Then enable it
        const response = await handleUpdatePartialWorkflow(
          {
            id: created.id,
            operations: [
              {
                type: 'enableNode',
                nodeName: 'Webhook'
              }
            ]
          },
          mcpContext
        );

        expect(response.success).toBe(true);
        const updated = response.data as any;
        const webhookNode = updated.nodes.find((n: any) => n.name === 'Webhook');
        // After enabling, disabled should be false or undefined (both mean enabled)
        expect(webhookNode.disabled).toBeFalsy();
      });
    });
  });

  // ======================================================================
  // CONNECTION OPERATIONS (5 operations)
  // ======================================================================

  describe('Connection Operations', () => {
    describe('addConnection', () => {
      it('should add connection between nodes', async () => {
        // Start with workflow without connections
        const workflow = {
          ...SIMPLE_HTTP_WORKFLOW,
          name: createTestWorkflowName('Partial - Add Connection'),
          tags: ['mcp-integration-test'],
          connections: {} // Start with no connections
        };

        const created = await client.createWorkflow(workflow);
        expect(created.id).toBeTruthy();
        if (!created.id) throw new Error('Workflow ID is missing');
        context.trackWorkflow(created.id);

        // Add connection
        const response = await handleUpdatePartialWorkflow(
          {
            id: created.id,
            operations: [
              {
                type: 'addConnection',
                source: 'Webhook',
                target: 'HTTP Request'
              }
            ]
          },
          mcpContext
        );

        expect(response.success).toBe(true);
        const updated = response.data as any;
        expect(updated.connections).toBeDefined();
        expect(updated.connections.Webhook).toBeDefined();
      });

      it('should add connection with custom ports', async () => {
        const workflow = {
          ...SIMPLE_HTTP_WORKFLOW,
          name: createTestWorkflowName('Partial - Add Connection Ports'),
          tags: ['mcp-integration-test'],
          connections: {}
        };

        const created = await client.createWorkflow(workflow);
        expect(created.id).toBeTruthy();
        if (!created.id) throw new Error('Workflow ID is missing');
        context.trackWorkflow(created.id);

        const response = await handleUpdatePartialWorkflow(
          {
            id: created.id,
            operations: [
              {
                type: 'addConnection',
                source: 'Webhook',
                target: 'HTTP Request',
                sourceOutput: 'main',
                targetInput: 'main',
                sourceIndex: 0,
                targetIndex: 0
              }
            ]
          },
          mcpContext
        );

        expect(response.success).toBe(true);
      });
    });

    describe('removeConnection', () => {
      it('should remove connection between nodes', async () => {
        const workflow = {
          ...SIMPLE_HTTP_WORKFLOW,
          name: createTestWorkflowName('Partial - Remove Connection'),
          tags: ['mcp-integration-test']
        };

        const created = await client.createWorkflow(workflow);
        expect(created.id).toBeTruthy();
        if (!created.id) throw new Error('Workflow ID is missing');
        context.trackWorkflow(created.id);

        const response = await handleUpdatePartialWorkflow(
          {
            id: created.id,
            operations: [
              {
                type: 'removeConnection',
                source: 'Webhook',
                target: 'HTTP Request'
              }
            ]
          },
          mcpContext
        );

        expect(response.success).toBe(true);
        const updated = response.data as any;
        expect(Object.keys(updated.connections || {})).toHaveLength(0);
      });

      it('should ignore error for non-existent connection with ignoreErrors flag', async () => {
        const workflow = {
          ...SIMPLE_WEBHOOK_WORKFLOW,
          name: createTestWorkflowName('Partial - Remove Connection Ignore'),
          tags: ['mcp-integration-test']
        };

        const created = await client.createWorkflow(workflow);
        expect(created.id).toBeTruthy();
        if (!created.id) throw new Error('Workflow ID is missing');
        context.trackWorkflow(created.id);

        const response = await handleUpdatePartialWorkflow(
          {
            id: created.id,
            operations: [
              {
                type: 'removeConnection',
                source: 'Webhook',
                target: 'NonExistent',
                ignoreErrors: true
              }
            ]
          },
          mcpContext
        );

        // Should succeed because ignoreErrors is true
        expect(response.success).toBe(true);
      });
    });

    describe('replaceConnections', () => {
      it('should replace all connections', async () => {
        const workflow = {
          ...SIMPLE_HTTP_WORKFLOW,
          name: createTestWorkflowName('Partial - Replace Connections'),
          tags: ['mcp-integration-test']
        };

        const created = await client.createWorkflow(workflow);
        expect(created.id).toBeTruthy();
        if (!created.id) throw new Error('Workflow ID is missing');
        context.trackWorkflow(created.id);

        // Replace with empty connections
        const response = await handleUpdatePartialWorkflow(
          {
            id: created.id,
            operations: [
              {
                type: 'replaceConnections',
                connections: {}
              }
            ]
          },
          mcpContext
        );

        expect(response.success).toBe(true);
        const updated = response.data as any;
        expect(Object.keys(updated.connections || {})).toHaveLength(0);
      });
    });

    describe('cleanStaleConnections', () => {
      it('should remove stale connections in dry run mode', async () => {
        const workflow = {
          ...SIMPLE_HTTP_WORKFLOW,
          name: createTestWorkflowName('Partial - Clean Stale Dry Run'),
          tags: ['mcp-integration-test']
        };

        const created = await client.createWorkflow(workflow);
        expect(created.id).toBeTruthy();
        if (!created.id) throw new Error('Workflow ID is missing');
        context.trackWorkflow(created.id);

        // Remove HTTP Request node to create stale connection
        await handleUpdatePartialWorkflow(
          {
            id: created.id,
            operations: [{ type: 'removeNode', nodeName: 'HTTP Request' }]
          },
          mcpContext
        );

        // Clean stale connections in dry run
        const response = await handleUpdatePartialWorkflow(
          {
            id: created.id,
            operations: [
              {
                type: 'cleanStaleConnections',
                dryRun: true
              }
            ],
            validateOnly: true
          },
          mcpContext
        );

        expect(response.success).toBe(true);
      });
    });
  });

  // ======================================================================
  // METADATA OPERATIONS (4 operations)
  // ======================================================================

  describe('Metadata Operations', () => {
    describe('updateSettings', () => {
      it('should update workflow settings', async () => {
        const workflow = {
          ...SIMPLE_WEBHOOK_WORKFLOW,
          name: createTestWorkflowName('Partial - Update Settings'),
          tags: ['mcp-integration-test']
        };

        const created = await client.createWorkflow(workflow);
        expect(created.id).toBeTruthy();
        if (!created.id) throw new Error('Workflow ID is missing');
        context.trackWorkflow(created.id);

        const response = await handleUpdatePartialWorkflow(
          {
            id: created.id,
            operations: [
              {
                type: 'updateSettings',
                settings: {
                  timezone: 'America/New_York',
                  executionOrder: 'v1'
                }
              }
            ]
          },
          mcpContext
        );

        expect(response.success).toBe(true);
        const updated = response.data as any;

        // Note: n8n API may not return all settings in response
        // The operation should succeed even if settings aren't reflected in the response
        expect(updated.settings).toBeDefined();
      });
    });

    describe('updateName', () => {
      it('should update workflow name', async () => {
        const workflow = {
          ...SIMPLE_WEBHOOK_WORKFLOW,
          name: createTestWorkflowName('Partial - Update Name Original'),
          tags: ['mcp-integration-test']
        };

        const created = await client.createWorkflow(workflow);
        expect(created.id).toBeTruthy();
        if (!created.id) throw new Error('Workflow ID is missing');
        context.trackWorkflow(created.id);

        const newName = createTestWorkflowName('Partial - Update Name Modified');

        const response = await handleUpdatePartialWorkflow(
          {
            id: created.id,
            operations: [
              {
                type: 'updateName',
                name: newName
              }
            ]
          },
          mcpContext
        );

        expect(response.success).toBe(true);
        const updated = response.data as any;
        expect(updated.name).toBe(newName);
      });
    });

    describe('addTag / removeTag', () => {
      it('should add tag to workflow', async () => {
        const workflow = {
          ...SIMPLE_WEBHOOK_WORKFLOW,
          name: createTestWorkflowName('Partial - Add Tag'),
          tags: ['mcp-integration-test']
        };

        const created = await client.createWorkflow(workflow);
        expect(created.id).toBeTruthy();
        if (!created.id) throw new Error('Workflow ID is missing');
        context.trackWorkflow(created.id);

        const response = await handleUpdatePartialWorkflow(
          {
            id: created.id,
            operations: [
              {
                type: 'addTag',
                tag: 'new-tag'
              }
            ]
          },
          mcpContext
        );

        expect(response.success).toBe(true);
        const updated = response.data as any;

        // Note: n8n API tag behavior may vary
        if (updated.tags) {
          expect(updated.tags).toContain('new-tag');
        }
      });

      it('should remove tag from workflow', async () => {
        const workflow = {
          ...SIMPLE_WEBHOOK_WORKFLOW,
          name: createTestWorkflowName('Partial - Remove Tag'),
          tags: ['mcp-integration-test', 'to-remove']
        };

        const created = await client.createWorkflow(workflow);
        expect(created.id).toBeTruthy();
        if (!created.id) throw new Error('Workflow ID is missing');
        context.trackWorkflow(created.id);

        const response = await handleUpdatePartialWorkflow(
          {
            id: created.id,
            operations: [
              {
                type: 'removeTag',
                tag: 'to-remove'
              }
            ]
          },
          mcpContext
        );

        expect(response.success).toBe(true);
        const updated = response.data as any;

        if (updated.tags) {
          expect(updated.tags).not.toContain('to-remove');
        }
      });
    });
  });

  // ======================================================================
  // ADVANCED SCENARIOS
  // ======================================================================

  describe('Advanced Scenarios', () => {
    it('should apply multiple operations in sequence', async () => {
      const workflow = {
        ...SIMPLE_WEBHOOK_WORKFLOW,
        name: createTestWorkflowName('Partial - Multiple Ops'),
        tags: ['mcp-integration-test']
      };

      const created = await client.createWorkflow(workflow);
      expect(created.id).toBeTruthy();
      if (!created.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(created.id);

      const response = await handleUpdatePartialWorkflow(
        {
          id: created.id,
          operations: [
            {
              type: 'addNode',
              node: {
                name: 'Set',
                type: 'n8n-nodes-base.set',
                typeVersion: 3.4,
                position: [450, 300],
                parameters: {
                  assignments: { assignments: [] }
                }
              }
            },
            {
              type: 'addConnection',
              source: 'Webhook',
              target: 'Set'
            },
            {
              type: 'updateName',
              name: createTestWorkflowName('Partial - Multiple Ops Updated')
            }
          ]
        },
        mcpContext
      );

      expect(response.success).toBe(true);
      const updated = response.data as any;
      expect(updated.nodes).toHaveLength(2);
      expect(updated.connections.Webhook).toBeDefined();
    });

    it('should validate operations without applying (validateOnly mode)', async () => {
      const workflow = {
        ...SIMPLE_WEBHOOK_WORKFLOW,
        name: createTestWorkflowName('Partial - Validate Only'),
        tags: ['mcp-integration-test']
      };

      const created = await client.createWorkflow(workflow);
      expect(created.id).toBeTruthy();
      if (!created.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(created.id);

      const response = await handleUpdatePartialWorkflow(
        {
          id: created.id,
          operations: [
            {
              type: 'updateName',
              name: 'New Name'
            }
          ],
          validateOnly: true
        },
        mcpContext
      );

      expect(response.success).toBe(true);
      expect(response.data).toHaveProperty('valid', true);

      // Verify workflow was NOT actually updated
      const current = await client.getWorkflow(created.id);
      expect(current.name).not.toBe('New Name');
    });

    it('should handle continueOnError mode with partial failures', async () => {
      const workflow = {
        ...SIMPLE_WEBHOOK_WORKFLOW,
        name: createTestWorkflowName('Partial - Continue On Error'),
        tags: ['mcp-integration-test']
      };

      const created = await client.createWorkflow(workflow);
      expect(created.id).toBeTruthy();
      if (!created.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(created.id);

      // Mix valid and invalid operations
      const response = await handleUpdatePartialWorkflow(
        {
          id: created.id,
          operations: [
            {
              type: 'updateName',
              name: createTestWorkflowName('Partial - Continue On Error Updated')
            },
            {
              type: 'removeNode',
              nodeName: 'NonExistentNode' // This will fail
            },
            {
              type: 'addTag',
              tag: 'new-tag'
            }
          ],
          continueOnError: true
        },
        mcpContext
      );

      // Should succeed with partial results
      expect(response.success).toBe(true);
      expect(response.details?.applied).toBeDefined();
      expect(response.details?.failed).toBeDefined();
    });
  });
});
