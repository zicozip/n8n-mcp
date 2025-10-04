/**
 * Integration Tests: handleCreateWorkflow
 *
 * Tests workflow creation against a real n8n instance.
 * Verifies the P0 bug fix (FULL vs SHORT node type formats)
 * and covers all major workflow creation scenarios.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { createTestContext, TestContext, createTestWorkflowName } from '../utils/test-context';
import { getTestN8nClient } from '../utils/n8n-client';
import { N8nApiClient } from '../../../../src/services/n8n-api-client';
import {
  SIMPLE_WEBHOOK_WORKFLOW,
  SIMPLE_HTTP_WORKFLOW,
  MULTI_NODE_WORKFLOW,
  ERROR_HANDLING_WORKFLOW,
  AI_AGENT_WORKFLOW,
  EXPRESSION_WORKFLOW,
  getFixture
} from '../utils/fixtures';
import { cleanupOrphanedWorkflows } from '../utils/cleanup-helpers';

describe('Integration: handleCreateWorkflow', () => {
  let context: TestContext;
  let client: N8nApiClient;

  beforeEach(() => {
    context = createTestContext();
    client = getTestN8nClient();
  });

  afterEach(async () => {
    await context.cleanup();
  });

  // Global cleanup after all tests to catch any orphaned workflows
  // (e.g., from test retries or failures)
  afterAll(async () => {
    await cleanupOrphanedWorkflows();
  });

  // ======================================================================
  // P0: Critical Bug Verification
  // ======================================================================

  describe('P0: Node Type Format Bug Fix', () => {
    it('should create workflow with webhook node using FULL node type format', async () => {
      // This test verifies the P0 bug fix where SHORT node type format
      // (e.g., "webhook") was incorrectly normalized to FULL format
      // causing workflow creation failures.
      //
      // The fix ensures FULL format (e.g., "n8n-nodes-base.webhook")
      // is preserved and passed to n8n API correctly.

      const workflowName = createTestWorkflowName('P0 Bug Verification - Webhook Node');
      const workflow = {
        name: workflowName,
        ...getFixture('simple-webhook')
      };

      // Create workflow
      const result = await client.createWorkflow(workflow);

      // Verify workflow created successfully
      expect(result).toBeDefined();
      expect(result.id).toBeTruthy();
      if (!result.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(result.id);
      expect(result.name).toBe(workflowName);
      expect(result.nodes).toHaveLength(1);

      // Critical: Verify FULL node type format is preserved
      expect(result.nodes[0].type).toBe('n8n-nodes-base.webhook');
      expect(result.nodes[0].name).toBe('Webhook');
      expect(result.nodes[0].parameters).toBeDefined();
    });
  });

  // ======================================================================
  // P1: Base Nodes (High Priority)
  // ======================================================================

  describe('P1: Base n8n Nodes', () => {
    it('should create workflow with HTTP Request node', async () => {
      const workflowName = createTestWorkflowName('HTTP Request Node');
      const workflow = {
        name: workflowName,
        ...getFixture('simple-http')
      };

      const result = await client.createWorkflow(workflow);

      expect(result).toBeDefined();
      expect(result.id).toBeTruthy();
      if (!result.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(result.id);
      expect(result.name).toBe(workflowName);
      expect(result.nodes).toHaveLength(2);

      // Verify both nodes created with FULL type format
      const webhookNode = result.nodes.find(n => n.name === 'Webhook');
      const httpNode = result.nodes.find(n => n.name === 'HTTP Request');

      expect(webhookNode).toBeDefined();
      expect(webhookNode!.type).toBe('n8n-nodes-base.webhook');

      expect(httpNode).toBeDefined();
      expect(httpNode!.type).toBe('n8n-nodes-base.httpRequest');

      // Verify connections
      expect(result.connections).toBeDefined();
      expect(result.connections.Webhook).toBeDefined();
    });

    it('should create workflow with langchain agent node', async () => {
      const workflowName = createTestWorkflowName('Langchain Agent Node');
      const workflow = {
        name: workflowName,
        ...getFixture('ai-agent')
      };

      const result = await client.createWorkflow(workflow);

      expect(result).toBeDefined();
      expect(result.id).toBeTruthy();
      if (!result.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(result.id);
      expect(result.name).toBe(workflowName);
      expect(result.nodes).toHaveLength(2);

      // Verify langchain node type format
      const agentNode = result.nodes.find(n => n.name === 'AI Agent');
      expect(agentNode).toBeDefined();
      expect(agentNode!.type).toBe('@n8n/n8n-nodes-langchain.agent');
    });

    it('should create complex multi-node workflow', async () => {
      const workflowName = createTestWorkflowName('Multi-Node Workflow');
      const workflow = {
        name: workflowName,
        ...getFixture('multi-node')
      };

      const result = await client.createWorkflow(workflow);

      expect(result).toBeDefined();
      expect(result.id).toBeTruthy();
      if (!result.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(result.id);
      expect(result.name).toBe(workflowName);
      expect(result.nodes).toHaveLength(4);

      // Verify all node types preserved
      const nodeTypes = result.nodes.map(n => n.type);
      expect(nodeTypes).toContain('n8n-nodes-base.webhook');
      expect(nodeTypes).toContain('n8n-nodes-base.set');
      expect(nodeTypes).toContain('n8n-nodes-base.merge');

      // Verify complex connections
      expect(result.connections.Webhook.main[0]).toHaveLength(2); // Branches to 2 nodes
    });
  });

  // ======================================================================
  // P2: Advanced Features (Medium Priority)
  // ======================================================================

  describe('P2: Advanced Workflow Features', () => {
    it('should create workflow with complex connections and branching', async () => {
      const workflowName = createTestWorkflowName('Complex Connections');
      const workflow = {
        name: workflowName,
        ...getFixture('multi-node')
      };

      const result = await client.createWorkflow(workflow);

      expect(result).toBeDefined();
      expect(result.id).toBeTruthy();
      if (!result.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(result.id);
      expect(result.connections).toBeDefined();

      // Verify branching: Webhook -> Set 1 and Set 2
      const webhookConnections = result.connections.Webhook.main[0];
      expect(webhookConnections).toHaveLength(2);

      // Verify merging: Set 1 -> Merge (port 0), Set 2 -> Merge (port 1)
      const set1Connections = result.connections['Set 1'].main[0];
      const set2Connections = result.connections['Set 2'].main[0];

      expect(set1Connections[0].node).toBe('Merge');
      expect(set1Connections[0].index).toBe(0);

      expect(set2Connections[0].node).toBe('Merge');
      expect(set2Connections[0].index).toBe(1);
    });

    it('should create workflow with custom settings', async () => {
      const workflowName = createTestWorkflowName('Custom Settings');
      const workflow = {
        name: workflowName,
        ...getFixture('error-handling'),
        settings: {
          executionOrder: 'v1' as const,
          timezone: 'America/New_York',
          saveDataErrorExecution: 'all' as const,
          saveDataSuccessExecution: 'all' as const,
          saveExecutionProgress: true
        }
      };

      const result = await client.createWorkflow(workflow);

      expect(result).toBeDefined();
      expect(result.id).toBeTruthy();
      if (!result.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(result.id);
      expect(result.settings).toBeDefined();
      expect(result.settings!.executionOrder).toBe('v1');
    });

    it('should create workflow with n8n expressions', async () => {
      const workflowName = createTestWorkflowName('n8n Expressions');
      const workflow = {
        name: workflowName,
        ...getFixture('expression')
      };

      const result = await client.createWorkflow(workflow);

      expect(result).toBeDefined();
      expect(result.id).toBeTruthy();
      if (!result.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(result.id);
      expect(result.nodes).toHaveLength(2);

      // Verify Set node with expressions
      const setNode = result.nodes.find(n => n.name === 'Set Variables');
      expect(setNode).toBeDefined();
      expect(setNode!.parameters.assignments).toBeDefined();

      // Verify expressions are preserved
      const assignmentsData = setNode!.parameters.assignments as { assignments: Array<{ value: string }> };
      expect(assignmentsData.assignments).toHaveLength(3);
      expect(assignmentsData.assignments[0].value).toContain('$now');
      expect(assignmentsData.assignments[1].value).toContain('$json');
      expect(assignmentsData.assignments[2].value).toContain('$node');
    });

    it('should create workflow with error handling configuration', async () => {
      const workflowName = createTestWorkflowName('Error Handling');
      const workflow = {
        name: workflowName,
        ...getFixture('error-handling')
      };

      const result = await client.createWorkflow(workflow);

      expect(result).toBeDefined();
      expect(result.id).toBeTruthy();
      if (!result.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(result.id);
      expect(result.nodes).toHaveLength(3);

      // Verify HTTP node with error handling
      const httpNode = result.nodes.find(n => n.name === 'HTTP Request');
      expect(httpNode).toBeDefined();
      expect(httpNode!.continueOnFail).toBe(true);
      expect(httpNode!.onError).toBe('continueErrorOutput');

      // Verify error connection
      expect(result.connections['HTTP Request'].error).toBeDefined();
      expect(result.connections['HTTP Request'].error[0][0].node).toBe('Handle Error');
    });
  });

  // ======================================================================
  // Error Scenarios (P1 Priority)
  // ======================================================================

  describe('Error Scenarios', () => {
    it('should accept workflow with invalid node type (fails at execution time)', async () => {
      // Note: n8n API accepts workflows with invalid node types at creation time.
      // The error only occurs when trying to execute the workflow.
      // This documents the actual API behavior.

      const workflowName = createTestWorkflowName('Invalid Node Type');
      const workflow = {
        name: workflowName,
        nodes: [
          {
            id: 'invalid-1',
            name: 'Invalid Node',
            type: 'n8n-nodes-base.nonexistentnode',
            typeVersion: 1,
            position: [250, 300] as [number, number],
            parameters: {}
          }
        ],
        connections: {},
        settings: { executionOrder: 'v1' as const }
      };

      // n8n API accepts the workflow (validation happens at execution time)
      const result = await client.createWorkflow(workflow);

      expect(result).toBeDefined();
      expect(result.id).toBeTruthy();
      if (!result.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(result.id);
      expect(result.nodes[0].type).toBe('n8n-nodes-base.nonexistentnode');
    });

    it('should accept workflow with missing required node parameters (fails at execution time)', async () => {
      const workflowName = createTestWorkflowName('Missing Parameters');
      const workflow = {
        name: workflowName,
        nodes: [
          {
            id: 'http-1',
            name: 'HTTP Request',
            type: 'n8n-nodes-base.httpRequest',
            typeVersion: 4.2,
            position: [250, 300] as [number, number],
            parameters: {
              // Missing required 'url' parameter
              method: 'GET'
            }
          }
        ],
        connections: {},
        settings: { executionOrder: 'v1' as const }
      };

      // n8n API accepts this during creation but fails during execution
      // This test documents the actual API behavior
      const result = await client.createWorkflow(workflow);

      expect(result).toBeDefined();
      expect(result.id).toBeTruthy();
      if (!result.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(result.id);
      // Note: Validation happens at execution time, not creation time
    });

    it('should handle workflow with duplicate node names', async () => {
      const workflowName = createTestWorkflowName('Duplicate Node Names');
      const workflow = {
        name: workflowName,
        nodes: [
          {
            id: 'set-1',
            name: 'Set',
            type: 'n8n-nodes-base.set',
            typeVersion: 3.4,
            position: [250, 300] as [number, number],
            parameters: {
              assignments: { assignments: [] },
              options: {}
            }
          },
          {
            id: 'set-2',
            name: 'Set', // Duplicate name
            type: 'n8n-nodes-base.set',
            typeVersion: 3.4,
            position: [450, 300] as [number, number],
            parameters: {
              assignments: { assignments: [] },
              options: {}
            }
          }
        ],
        connections: {},
        settings: { executionOrder: 'v1' as const }
      };

      // n8n API should handle this - it may auto-rename or reject
      const result = await client.createWorkflow(workflow);

      expect(result).toBeDefined();
      expect(result.id).toBeTruthy();
      if (!result.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(result.id);
      // Verify n8n's handling of duplicate names
      const nodeNames = result.nodes.map(n => n.name);
      // Either both have same name or n8n renamed one
      expect(nodeNames.length).toBe(2);
    });

    it('should accept workflow with invalid connection references (fails at execution time)', async () => {
      // Note: n8n API accepts workflows with invalid connection references at creation time.
      // The error only occurs when trying to execute the workflow.
      // This documents the actual API behavior.

      const workflowName = createTestWorkflowName('Invalid Connections');
      const workflow = {
        name: workflowName,
        nodes: [
          {
            id: 'webhook-1',
            name: 'Webhook',
            type: 'n8n-nodes-base.webhook',
            typeVersion: 2,
            position: [250, 300] as [number, number],
            parameters: {
              httpMethod: 'GET',
              path: 'test'
            }
          }
        ],
        connections: {
          // Connection references non-existent node
          Webhook: {
            main: [[{ node: 'NonExistent', type: 'main', index: 0 }]]
          }
        },
        settings: { executionOrder: 'v1' as const }
      };

      // n8n API accepts the workflow (validation happens at execution time)
      const result = await client.createWorkflow(workflow);

      expect(result).toBeDefined();
      expect(result.id).toBeTruthy();
      if (!result.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(result.id);
      // Connection is preserved even though it references non-existent node
      expect(result.connections.Webhook).toBeDefined();
      expect(result.connections.Webhook.main[0][0].node).toBe('NonExistent');
    });
  });

  // ======================================================================
  // Additional Edge Cases
  // ======================================================================

  describe('Edge Cases', () => {
    it('should create minimal workflow with single node', async () => {
      const workflowName = createTestWorkflowName('Minimal Single Node');
      const workflow = {
        name: workflowName,
        nodes: [
          {
            id: 'manual-1',
            name: 'Manual Trigger',
            type: 'n8n-nodes-base.manualTrigger',
            typeVersion: 1,
            position: [250, 300] as [number, number],
            parameters: {}
          }
        ],
        connections: {},
        settings: { executionOrder: 'v1' as const }
      };

      const result = await client.createWorkflow(workflow);

      expect(result).toBeDefined();
      expect(result.id).toBeTruthy();
      if (!result.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(result.id);
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].type).toBe('n8n-nodes-base.manualTrigger');
    });

    it('should create workflow with empty connections object', async () => {
      const workflowName = createTestWorkflowName('Empty Connections');
      const workflow = {
        name: workflowName,
        nodes: [
          {
            id: 'set-1',
            name: 'Set',
            type: 'n8n-nodes-base.set',
            typeVersion: 3.4,
            position: [250, 300] as [number, number],
            parameters: {
              assignments: { assignments: [] },
              options: {}
            }
          }
        ],
        connections: {}, // Explicitly empty
        settings: { executionOrder: 'v1' as const }
      };

      const result = await client.createWorkflow(workflow);

      expect(result).toBeDefined();
      expect(result.id).toBeTruthy();
      if (!result.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(result.id);
      expect(result.connections).toEqual({});
    });

    it('should create workflow without settings object', async () => {
      const workflowName = createTestWorkflowName('No Settings');
      const workflow = {
        name: workflowName,
        nodes: [
          {
            id: 'manual-1',
            name: 'Manual Trigger',
            type: 'n8n-nodes-base.manualTrigger',
            typeVersion: 1,
            position: [250, 300] as [number, number],
            parameters: {}
          }
        ],
        connections: {}
        // No settings property
      };

      const result = await client.createWorkflow(workflow);

      expect(result).toBeDefined();
      expect(result.id).toBeTruthy();
      if (!result.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(result.id);
      // n8n should apply default settings
      expect(result.settings).toBeDefined();
    });
  });
});
