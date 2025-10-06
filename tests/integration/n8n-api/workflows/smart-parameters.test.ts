/**
 * Integration Tests: Smart Parameters with Real n8n API
 *
 * These tests verify that smart parameters (branch='true'/'false', case=N)
 * correctly map to n8n's actual connection structure when tested against
 * a real n8n instance.
 *
 * CRITICAL: These tests validate against REAL n8n connection structure:
 *   ✅ workflow.connections.IF.main[0] (correct)
 *   ❌ workflow.connections.IF.true (wrong - what unit tests did)
 *
 * These integration tests would have caught the bugs that unit tests missed:
 * - Bug 1: branch='true' mapping to sourceOutput instead of sourceIndex
 * - Bug 2: Zod schema stripping branch/case parameters
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { createTestContext, TestContext, createTestWorkflowName } from '../utils/test-context';
import { getTestN8nClient } from '../utils/n8n-client';
import { N8nApiClient } from '../../../../src/services/n8n-api-client';
import { cleanupOrphanedWorkflows } from '../utils/cleanup-helpers';
import { createMcpContext } from '../utils/mcp-context';
import { InstanceContext } from '../../../../src/types/instance-context';
import { handleUpdatePartialWorkflow } from '../../../../src/mcp/handlers-workflow-diff';
import { Workflow } from '../../../../src/types/n8n-api';

describe('Integration: Smart Parameters with Real n8n API', () => {
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
  // TEST 1: IF node with branch='true'
  // ======================================================================

  describe('IF Node Smart Parameters', () => {
    it('should handle branch="true" with real n8n API', async () => {
      // Create minimal workflow with IF node
      const workflowName = createTestWorkflowName('Smart Params - IF True Branch');
      const workflow = await client.createWorkflow({
        name: workflowName,
        nodes: [
          {
            id: 'manual-1',
            name: 'Manual',
            type: 'n8n-nodes-base.manualTrigger',
            typeVersion: 1,
            position: [250, 300],
            parameters: {}
          },
          {
            id: 'if-1',
            name: 'IF',
            type: 'n8n-nodes-base.if',
            typeVersion: 2,
            position: [450, 300],
            parameters: {
              conditions: {
                conditions: [
                  {
                    id: 'cond-1',
                    leftValue: '={{ $json.value }}',
                    rightValue: 'test',
                    operation: 'equal'
                  }
                ]
              }
            }
          }
        ],
        connections: {
          Manual: {
            main: [[{ node: 'IF', type: 'main', index: 0 }]]
          }
        },
        tags: ['mcp-integration-test']
      });

      expect(workflow.id).toBeTruthy();
      if (!workflow.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(workflow.id);

      // Add TrueHandler node and connection using branch='true' smart parameter
      const result = await handleUpdatePartialWorkflow(
        {
          id: workflow.id,
          operations: [
            {
              type: 'addNode',
              node: {
                name: 'TrueHandler',
                type: 'n8n-nodes-base.set',
                typeVersion: 3.4,
                position: [650, 200],
                parameters: {
                  assignments: {
                    assignments: [
                      {
                        id: 'assign-1',
                        name: 'handled',
                        value: 'true',
                        type: 'string'
                      }
                    ]
                  }
                }
              }
            },
            {
              type: 'addConnection',
              source: 'IF',
              target: 'TrueHandler',
              branch: 'true'  // Smart parameter
            }
          ]
        },
        mcpContext
      );

      expect(result.success).toBe(true);

      // Fetch actual workflow from n8n API
      const fetchedWorkflow = await client.getWorkflow(workflow.id);

      // CRITICAL: Assert REAL n8n connection structure
      // The connection should be at index 0 of main output array (true branch)
      expect(fetchedWorkflow.connections.IF).toBeDefined();
      expect(fetchedWorkflow.connections.IF.main).toBeDefined();
      expect(fetchedWorkflow.connections.IF.main[0]).toBeDefined();
      expect(fetchedWorkflow.connections.IF.main[0].length).toBe(1);
      expect(fetchedWorkflow.connections.IF.main[0][0].node).toBe('TrueHandler');
      expect(fetchedWorkflow.connections.IF.main[0][0].type).toBe('main');

      // Verify false branch (index 1) is empty or undefined
      expect(fetchedWorkflow.connections.IF.main[1] || []).toHaveLength(0);
    });

    // ======================================================================
    // TEST 2: IF node with branch='false'
    // ======================================================================

    it('should handle branch="false" with real n8n API', async () => {
      // Create minimal workflow with IF node
      const workflowName = createTestWorkflowName('Smart Params - IF False Branch');
      const workflow = await client.createWorkflow({
        name: workflowName,
        nodes: [
          {
            id: 'manual-1',
            name: 'Manual',
            type: 'n8n-nodes-base.manualTrigger',
            typeVersion: 1,
            position: [250, 300],
            parameters: {}
          },
          {
            id: 'if-1',
            name: 'IF',
            type: 'n8n-nodes-base.if',
            typeVersion: 2,
            position: [450, 300],
            parameters: {
              conditions: {
                conditions: [
                  {
                    id: 'cond-1',
                    leftValue: '={{ $json.value }}',
                    rightValue: 'test',
                    operation: 'equal'
                  }
                ]
              }
            }
          }
        ],
        connections: {
          Manual: {
            main: [[{ node: 'IF', type: 'main', index: 0 }]]
          }
        },
        tags: ['mcp-integration-test']
      });

      expect(workflow.id).toBeTruthy();
      if (!workflow.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(workflow.id);

      // Add FalseHandler node and connection using branch='false' smart parameter
      const result = await handleUpdatePartialWorkflow(
        {
          id: workflow.id,
          operations: [
            {
              type: 'addNode',
              node: {
                name: 'FalseHandler',
                type: 'n8n-nodes-base.set',
                typeVersion: 3.4,
                position: [650, 400],
                parameters: {
                  assignments: {
                    assignments: [
                      {
                        id: 'assign-1',
                        name: 'handled',
                        value: 'false',
                        type: 'string'
                      }
                    ]
                  }
                }
              }
            },
            {
              type: 'addConnection',
              source: 'IF',
              target: 'FalseHandler',
              branch: 'false'  // Smart parameter
            }
          ]
        },
        mcpContext
      );

      expect(result.success).toBe(true);

      // Fetch actual workflow from n8n API
      const fetchedWorkflow = await client.getWorkflow(workflow.id);

      // CRITICAL: Assert REAL n8n connection structure
      // The connection should be at index 1 of main output array (false branch)
      expect(fetchedWorkflow.connections.IF).toBeDefined();
      expect(fetchedWorkflow.connections.IF.main).toBeDefined();
      expect(fetchedWorkflow.connections.IF.main[1]).toBeDefined();
      expect(fetchedWorkflow.connections.IF.main[1].length).toBe(1);
      expect(fetchedWorkflow.connections.IF.main[1][0].node).toBe('FalseHandler');
      expect(fetchedWorkflow.connections.IF.main[1][0].type).toBe('main');

      // Verify true branch (index 0) is empty or undefined
      expect(fetchedWorkflow.connections.IF.main[0] || []).toHaveLength(0);
    });

    // ======================================================================
    // TEST 3: IF node with both branches
    // ======================================================================

    it('should handle both branch="true" and branch="false" simultaneously', async () => {
      // Create minimal workflow with IF node
      const workflowName = createTestWorkflowName('Smart Params - IF Both Branches');
      const workflow = await client.createWorkflow({
        name: workflowName,
        nodes: [
          {
            id: 'manual-1',
            name: 'Manual',
            type: 'n8n-nodes-base.manualTrigger',
            typeVersion: 1,
            position: [250, 300],
            parameters: {}
          },
          {
            id: 'if-1',
            name: 'IF',
            type: 'n8n-nodes-base.if',
            typeVersion: 2,
            position: [450, 300],
            parameters: {
              conditions: {
                conditions: [
                  {
                    id: 'cond-1',
                    leftValue: '={{ $json.value }}',
                    rightValue: 'test',
                    operation: 'equal'
                  }
                ]
              }
            }
          }
        ],
        connections: {
          Manual: {
            main: [[{ node: 'IF', type: 'main', index: 0 }]]
          }
        },
        tags: ['mcp-integration-test']
      });

      expect(workflow.id).toBeTruthy();
      if (!workflow.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(workflow.id);

      // Add both handlers and connections in single operation batch
      const result = await handleUpdatePartialWorkflow(
        {
          id: workflow.id,
          operations: [
            {
              type: 'addNode',
              node: {
                name: 'TrueHandler',
                type: 'n8n-nodes-base.set',
                typeVersion: 3.4,
                position: [650, 200],
                parameters: {
                  assignments: {
                    assignments: [
                      {
                        id: 'assign-1',
                        name: 'branch',
                        value: 'true',
                        type: 'string'
                      }
                    ]
                  }
                }
              }
            },
            {
              type: 'addNode',
              node: {
                name: 'FalseHandler',
                type: 'n8n-nodes-base.set',
                typeVersion: 3.4,
                position: [650, 400],
                parameters: {
                  assignments: {
                    assignments: [
                      {
                        id: 'assign-2',
                        name: 'branch',
                        value: 'false',
                        type: 'string'
                      }
                    ]
                  }
                }
              }
            },
            {
              type: 'addConnection',
              source: 'IF',
              target: 'TrueHandler',
              branch: 'true'
            },
            {
              type: 'addConnection',
              source: 'IF',
              target: 'FalseHandler',
              branch: 'false'
            }
          ]
        },
        mcpContext
      );

      expect(result.success).toBe(true);

      // Fetch actual workflow from n8n API
      const fetchedWorkflow = await client.getWorkflow(workflow.id);

      // CRITICAL: Assert both branches exist at separate indices
      expect(fetchedWorkflow.connections.IF).toBeDefined();
      expect(fetchedWorkflow.connections.IF.main).toBeDefined();

      // True branch at index 0
      expect(fetchedWorkflow.connections.IF.main[0]).toBeDefined();
      expect(fetchedWorkflow.connections.IF.main[0].length).toBe(1);
      expect(fetchedWorkflow.connections.IF.main[0][0].node).toBe('TrueHandler');

      // False branch at index 1
      expect(fetchedWorkflow.connections.IF.main[1]).toBeDefined();
      expect(fetchedWorkflow.connections.IF.main[1].length).toBe(1);
      expect(fetchedWorkflow.connections.IF.main[1][0].node).toBe('FalseHandler');
    });
  });

  // ======================================================================
  // TEST 4-6: Switch node with case parameter
  // ======================================================================

  describe('Switch Node Smart Parameters', () => {
    it('should handle case=0, case=1, case=2 with real n8n API', async () => {
      // Create minimal workflow with Switch node
      const workflowName = createTestWorkflowName('Smart Params - Switch Cases');
      const workflow = await client.createWorkflow({
        name: workflowName,
        nodes: [
          {
            id: 'manual-1',
            name: 'Manual',
            type: 'n8n-nodes-base.manualTrigger',
            typeVersion: 1,
            position: [250, 300],
            parameters: {}
          },
          {
            id: 'switch-1',
            name: 'Switch',
            type: 'n8n-nodes-base.switch',
            typeVersion: 3,
            position: [450, 300],
            parameters: {
              mode: 'rules',
              rules: {
                rules: [
                  {
                    id: 'rule-1',
                    conditions: {
                      conditions: [
                        {
                          id: 'cond-1',
                          leftValue: '={{ $json.case }}',
                          rightValue: 'a',
                          operation: 'equal'
                        }
                      ]
                    },
                    output: 0
                  },
                  {
                    id: 'rule-2',
                    conditions: {
                      conditions: [
                        {
                          id: 'cond-2',
                          leftValue: '={{ $json.case }}',
                          rightValue: 'b',
                          operation: 'equal'
                        }
                      ]
                    },
                    output: 1
                  },
                  {
                    id: 'rule-3',
                    conditions: {
                      conditions: [
                        {
                          id: 'cond-3',
                          leftValue: '={{ $json.case }}',
                          rightValue: 'c',
                          operation: 'equal'
                        }
                      ]
                    },
                    output: 2
                  }
                ]
              }
            }
          }
        ],
        connections: {
          Manual: {
            main: [[{ node: 'Switch', type: 'main', index: 0 }]]
          }
        },
        tags: ['mcp-integration-test']
      });

      expect(workflow.id).toBeTruthy();
      if (!workflow.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(workflow.id);

      // Add 3 handler nodes and connections using case smart parameter
      const result = await handleUpdatePartialWorkflow(
        {
          id: workflow.id,
          operations: [
            // Add handlers
            {
              type: 'addNode',
              node: {
                name: 'Handler0',
                type: 'n8n-nodes-base.set',
                typeVersion: 3.4,
                position: [650, 100],
                parameters: {
                  assignments: {
                    assignments: [
                      {
                        id: 'assign-1',
                        name: 'case',
                        value: '0',
                        type: 'string'
                      }
                    ]
                  }
                }
              }
            },
            {
              type: 'addNode',
              node: {
                name: 'Handler1',
                type: 'n8n-nodes-base.set',
                typeVersion: 3.4,
                position: [650, 300],
                parameters: {
                  assignments: {
                    assignments: [
                      {
                        id: 'assign-2',
                        name: 'case',
                        value: '1',
                        type: 'string'
                      }
                    ]
                  }
                }
              }
            },
            {
              type: 'addNode',
              node: {
                name: 'Handler2',
                type: 'n8n-nodes-base.set',
                typeVersion: 3.4,
                position: [650, 500],
                parameters: {
                  assignments: {
                    assignments: [
                      {
                        id: 'assign-3',
                        name: 'case',
                        value: '2',
                        type: 'string'
                      }
                    ]
                  }
                }
              }
            },
            // Add connections with case parameter
            {
              type: 'addConnection',
              source: 'Switch',
              target: 'Handler0',
              case: 0  // Smart parameter
            },
            {
              type: 'addConnection',
              source: 'Switch',
              target: 'Handler1',
              case: 1  // Smart parameter
            },
            {
              type: 'addConnection',
              source: 'Switch',
              target: 'Handler2',
              case: 2  // Smart parameter
            }
          ]
        },
        mcpContext
      );

      expect(result.success).toBe(true);

      // Fetch actual workflow from n8n API
      const fetchedWorkflow = await client.getWorkflow(workflow.id);

      // CRITICAL: Assert connections at correct indices
      expect(fetchedWorkflow.connections.Switch).toBeDefined();
      expect(fetchedWorkflow.connections.Switch.main).toBeDefined();

      // Case 0 at index 0
      expect(fetchedWorkflow.connections.Switch.main[0]).toBeDefined();
      expect(fetchedWorkflow.connections.Switch.main[0].length).toBe(1);
      expect(fetchedWorkflow.connections.Switch.main[0][0].node).toBe('Handler0');

      // Case 1 at index 1
      expect(fetchedWorkflow.connections.Switch.main[1]).toBeDefined();
      expect(fetchedWorkflow.connections.Switch.main[1].length).toBe(1);
      expect(fetchedWorkflow.connections.Switch.main[1][0].node).toBe('Handler1');

      // Case 2 at index 2
      expect(fetchedWorkflow.connections.Switch.main[2]).toBeDefined();
      expect(fetchedWorkflow.connections.Switch.main[2].length).toBe(1);
      expect(fetchedWorkflow.connections.Switch.main[2][0].node).toBe('Handler2');
    });
  });

  // ======================================================================
  // TEST 5: rewireConnection with branch parameter
  // ======================================================================

  describe('RewireConnection with Smart Parameters', () => {
    it('should rewire connection using branch="true" parameter', async () => {
      // Create workflow with IF node and initial connection
      const workflowName = createTestWorkflowName('Smart Params - Rewire IF True');
      const workflow = await client.createWorkflow({
        name: workflowName,
        nodes: [
          {
            id: 'manual-1',
            name: 'Manual',
            type: 'n8n-nodes-base.manualTrigger',
            typeVersion: 1,
            position: [250, 300],
            parameters: {}
          },
          {
            id: 'if-1',
            name: 'IF',
            type: 'n8n-nodes-base.if',
            typeVersion: 2,
            position: [450, 300],
            parameters: {
              conditions: {
                conditions: [
                  {
                    id: 'cond-1',
                    leftValue: '={{ $json.value }}',
                    rightValue: 'test',
                    operation: 'equal'
                  }
                ]
              }
            }
          },
          {
            id: 'handler1',
            name: 'Handler1',
            type: 'n8n-nodes-base.set',
            typeVersion: 3.4,
            position: [650, 200],
            parameters: {
              assignments: {
                assignments: [
                  {
                    id: 'assign-1',
                    name: 'handler',
                    value: '1',
                    type: 'string'
                  }
                ]
              }
            }
          },
          {
            id: 'handler2',
            name: 'Handler2',
            type: 'n8n-nodes-base.set',
            typeVersion: 3.4,
            position: [650, 400],
            parameters: {
              assignments: {
                assignments: [
                  {
                    id: 'assign-2',
                    name: 'handler',
                    value: '2',
                    type: 'string'
                  }
                ]
              }
            }
          }
        ],
        connections: {
          Manual: {
            main: [[{ node: 'IF', type: 'main', index: 0 }]]
          },
          IF: {
            // Initial connection: true branch to Handler1
            main: [[{ node: 'Handler1', type: 'main', index: 0 }], []]
          }
        },
        tags: ['mcp-integration-test']
      });

      expect(workflow.id).toBeTruthy();
      if (!workflow.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(workflow.id);

      // Rewire true branch from Handler1 to Handler2
      const result = await handleUpdatePartialWorkflow(
        {
          id: workflow.id,
          operations: [
            {
              type: 'rewireConnection',
              source: 'IF',
              from: 'Handler1',
              to: 'Handler2',
              branch: 'true'  // Smart parameter
            }
          ]
        },
        mcpContext
      );

      expect(result.success).toBe(true);

      // Fetch actual workflow from n8n API
      const fetchedWorkflow = await client.getWorkflow(workflow.id);

      // CRITICAL: Assert connection rewired at index 0 (true branch)
      expect(fetchedWorkflow.connections.IF).toBeDefined();
      expect(fetchedWorkflow.connections.IF.main).toBeDefined();
      expect(fetchedWorkflow.connections.IF.main[0]).toBeDefined();
      expect(fetchedWorkflow.connections.IF.main[0].length).toBe(1);
      expect(fetchedWorkflow.connections.IF.main[0][0].node).toBe('Handler2');
    });

    // ======================================================================
    // TEST 6: rewireConnection with case parameter
    // ======================================================================

    it('should rewire connection using case=1 parameter', async () => {
      // Create workflow with Switch node and initial connections
      const workflowName = createTestWorkflowName('Smart Params - Rewire Switch Case');
      const workflow = await client.createWorkflow({
        name: workflowName,
        nodes: [
          {
            id: 'manual-1',
            name: 'Manual',
            type: 'n8n-nodes-base.manualTrigger',
            typeVersion: 1,
            position: [250, 300],
            parameters: {}
          },
          {
            id: 'switch-1',
            name: 'Switch',
            type: 'n8n-nodes-base.switch',
            typeVersion: 3,
            position: [450, 300],
            parameters: {
              mode: 'rules',
              rules: {
                rules: [
                  {
                    id: 'rule-1',
                    conditions: {
                      conditions: [
                        {
                          id: 'cond-1',
                          leftValue: '={{ $json.case }}',
                          rightValue: 'a',
                          operation: 'equal'
                        }
                      ]
                    },
                    output: 0
                  },
                  {
                    id: 'rule-2',
                    conditions: {
                      conditions: [
                        {
                          id: 'cond-2',
                          leftValue: '={{ $json.case }}',
                          rightValue: 'b',
                          operation: 'equal'
                        }
                      ]
                    },
                    output: 1
                  }
                ]
              }
            }
          },
          {
            id: 'handler1',
            name: 'OldHandler',
            type: 'n8n-nodes-base.set',
            typeVersion: 3.4,
            position: [650, 300],
            parameters: {
              assignments: {
                assignments: [
                  {
                    id: 'assign-1',
                    name: 'handler',
                    value: 'old',
                    type: 'string'
                  }
                ]
              }
            }
          },
          {
            id: 'handler2',
            name: 'NewHandler',
            type: 'n8n-nodes-base.set',
            typeVersion: 3.4,
            position: [650, 500],
            parameters: {
              assignments: {
                assignments: [
                  {
                    id: 'assign-2',
                    name: 'handler',
                    value: 'new',
                    type: 'string'
                  }
                ]
              }
            }
          }
        ],
        connections: {
          Manual: {
            main: [[{ node: 'Switch', type: 'main', index: 0 }]]
          },
          Switch: {
            // Initial connection: case 1 to OldHandler
            main: [[], [{ node: 'OldHandler', type: 'main', index: 0 }]]
          }
        },
        tags: ['mcp-integration-test']
      });

      expect(workflow.id).toBeTruthy();
      if (!workflow.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(workflow.id);

      // Rewire case 1 from OldHandler to NewHandler
      const result = await handleUpdatePartialWorkflow(
        {
          id: workflow.id,
          operations: [
            {
              type: 'rewireConnection',
              source: 'Switch',
              from: 'OldHandler',
              to: 'NewHandler',
              case: 1  // Smart parameter
            }
          ]
        },
        mcpContext
      );

      expect(result.success).toBe(true);

      // Fetch actual workflow from n8n API
      const fetchedWorkflow = await client.getWorkflow(workflow.id);

      // CRITICAL: Assert connection rewired at index 1 (case 1)
      expect(fetchedWorkflow.connections.Switch).toBeDefined();
      expect(fetchedWorkflow.connections.Switch.main).toBeDefined();
      expect(fetchedWorkflow.connections.Switch.main[1]).toBeDefined();
      expect(fetchedWorkflow.connections.Switch.main[1].length).toBe(1);
      expect(fetchedWorkflow.connections.Switch.main[1][0].node).toBe('NewHandler');
    });
  });

  // ======================================================================
  // TEST 7: Explicit sourceIndex overrides branch
  // ======================================================================

  describe('Parameter Priority', () => {
    it('should prioritize explicit sourceIndex over branch parameter', async () => {
      // Create minimal workflow with IF node
      const workflowName = createTestWorkflowName('Smart Params - Explicit Override Branch');
      const workflow = await client.createWorkflow({
        name: workflowName,
        nodes: [
          {
            id: 'manual-1',
            name: 'Manual',
            type: 'n8n-nodes-base.manualTrigger',
            typeVersion: 1,
            position: [250, 300],
            parameters: {}
          },
          {
            id: 'if-1',
            name: 'IF',
            type: 'n8n-nodes-base.if',
            typeVersion: 2,
            position: [450, 300],
            parameters: {
              conditions: {
                conditions: [
                  {
                    id: 'cond-1',
                    leftValue: '={{ $json.value }}',
                    rightValue: 'test',
                    operation: 'equal'
                  }
                ]
              }
            }
          }
        ],
        connections: {
          Manual: {
            main: [[{ node: 'IF', type: 'main', index: 0 }]]
          }
        },
        tags: ['mcp-integration-test']
      });

      expect(workflow.id).toBeTruthy();
      if (!workflow.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(workflow.id);

      // Add connection with BOTH branch='true' (would be index 0) and explicit sourceIndex=1
      // Explicit sourceIndex should win
      const result = await handleUpdatePartialWorkflow(
        {
          id: workflow.id,
          operations: [
            {
              type: 'addNode',
              node: {
                name: 'Handler',
                type: 'n8n-nodes-base.set',
                typeVersion: 3.4,
                position: [650, 400],
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
            },
            {
              type: 'addConnection',
              source: 'IF',
              target: 'Handler',
              branch: 'true',  // Would map to index 0
              sourceIndex: 1   // Explicit index should override
            }
          ]
        },
        mcpContext
      );

      expect(result.success).toBe(true);

      // Fetch actual workflow from n8n API
      const fetchedWorkflow = await client.getWorkflow(workflow.id);

      // CRITICAL: Assert connection is at index 1 (explicit wins)
      expect(fetchedWorkflow.connections.IF).toBeDefined();
      expect(fetchedWorkflow.connections.IF.main).toBeDefined();
      expect(fetchedWorkflow.connections.IF.main[1]).toBeDefined();
      expect(fetchedWorkflow.connections.IF.main[1].length).toBe(1);
      expect(fetchedWorkflow.connections.IF.main[1][0].node).toBe('Handler');

      // Index 0 should be empty
      expect(fetchedWorkflow.connections.IF.main[0] || []).toHaveLength(0);
    });

    // ======================================================================
    // TEST 8: Explicit sourceIndex overrides case
    // ======================================================================

    it('should prioritize explicit sourceIndex over case parameter', async () => {
      // Create minimal workflow with Switch node
      const workflowName = createTestWorkflowName('Smart Params - Explicit Override Case');
      const workflow = await client.createWorkflow({
        name: workflowName,
        nodes: [
          {
            id: 'manual-1',
            name: 'Manual',
            type: 'n8n-nodes-base.manualTrigger',
            typeVersion: 1,
            position: [250, 300],
            parameters: {}
          },
          {
            id: 'switch-1',
            name: 'Switch',
            type: 'n8n-nodes-base.switch',
            typeVersion: 3,
            position: [450, 300],
            parameters: {
              mode: 'rules',
              rules: {
                rules: [
                  {
                    id: 'rule-1',
                    conditions: {
                      conditions: [
                        {
                          id: 'cond-1',
                          leftValue: '={{ $json.case }}',
                          rightValue: 'a',
                          operation: 'equal'
                        }
                      ]
                    },
                    output: 0
                  },
                  {
                    id: 'rule-2',
                    conditions: {
                      conditions: [
                        {
                          id: 'cond-2',
                          leftValue: '={{ $json.case }}',
                          rightValue: 'b',
                          operation: 'equal'
                        }
                      ]
                    },
                    output: 1
                  }
                ]
              }
            }
          }
        ],
        connections: {
          Manual: {
            main: [[{ node: 'Switch', type: 'main', index: 0 }]]
          }
        },
        tags: ['mcp-integration-test']
      });

      expect(workflow.id).toBeTruthy();
      if (!workflow.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(workflow.id);

      // Add connection with BOTH case=1 (would be index 1) and explicit sourceIndex=2
      // Explicit sourceIndex should win
      const result = await handleUpdatePartialWorkflow(
        {
          id: workflow.id,
          operations: [
            {
              type: 'addNode',
              node: {
                name: 'Handler',
                type: 'n8n-nodes-base.set',
                typeVersion: 3.4,
                position: [650, 500],
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
            },
            {
              type: 'addConnection',
              source: 'Switch',
              target: 'Handler',
              case: 1,         // Would map to index 1
              sourceIndex: 2   // Explicit index should override
            }
          ]
        },
        mcpContext
      );

      expect(result.success).toBe(true);

      // Fetch actual workflow from n8n API
      const fetchedWorkflow = await client.getWorkflow(workflow.id);

      // CRITICAL: Assert connection is at index 2 (explicit wins)
      expect(fetchedWorkflow.connections.Switch).toBeDefined();
      expect(fetchedWorkflow.connections.Switch.main).toBeDefined();
      expect(fetchedWorkflow.connections.Switch.main[2]).toBeDefined();
      expect(fetchedWorkflow.connections.Switch.main[2].length).toBe(1);
      expect(fetchedWorkflow.connections.Switch.main[2][0].node).toBe('Handler');

      // Index 1 should be empty
      expect(fetchedWorkflow.connections.Switch.main[1] || []).toHaveLength(0);
    });
  });

  // ======================================================================
  // ERROR CASES: Invalid smart parameter values
  // ======================================================================

  describe('Error Cases', () => {
    it('should reject invalid branch value', async () => {
      // Create minimal workflow with IF node
      const workflowName = createTestWorkflowName('Smart Params - Invalid Branch');
      const workflow = await client.createWorkflow({
        name: workflowName,
        nodes: [
          {
            id: 'manual-1',
            name: 'Manual',
            type: 'n8n-nodes-base.manualTrigger',
            typeVersion: 1,
            position: [250, 300],
            parameters: {}
          },
          {
            id: 'if-1',
            name: 'IF',
            type: 'n8n-nodes-base.if',
            typeVersion: 2,
            position: [450, 300],
            parameters: {
              conditions: {
                conditions: [
                  {
                    id: 'cond-1',
                    leftValue: '={{ $json.value }}',
                    rightValue: 'test',
                    operation: 'equal'
                  }
                ]
              }
            }
          }
        ],
        connections: {
          Manual: {
            main: [[{ node: 'IF', type: 'main', index: 0 }]]
          }
        },
        tags: ['mcp-integration-test']
      });

      expect(workflow.id).toBeTruthy();
      if (!workflow.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(workflow.id);

      // Try to add connection with invalid branch value
      const result = await handleUpdatePartialWorkflow(
        {
          id: workflow.id,
          operations: [
            {
              type: 'addNode',
              node: {
                name: 'Handler',
                type: 'n8n-nodes-base.set',
                typeVersion: 3.4,
                position: [650, 300],
                parameters: {
                  assignments: {
                    assignments: []
                  }
                }
              }
            },
            {
              type: 'addConnection',
              source: 'IF',
              target: 'Handler',
              branch: 'invalid' as any  // Invalid value
            }
          ]
        },
        mcpContext
      );

      // Should fail validation
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle negative case value gracefully', async () => {
      // NOTE: Currently negative case values are accepted and mapped to sourceIndex=-1
      // which n8n API accepts (though it may not behave correctly at runtime).
      // TODO: Add validation to reject negative case values in future enhancement.

      // Create minimal workflow with Switch node
      const workflowName = createTestWorkflowName('Smart Params - Negative Case');
      const workflow = await client.createWorkflow({
        name: workflowName,
        nodes: [
          {
            id: 'manual-1',
            name: 'Manual',
            type: 'n8n-nodes-base.manualTrigger',
            typeVersion: 1,
            position: [250, 300],
            parameters: {}
          },
          {
            id: 'switch-1',
            name: 'Switch',
            type: 'n8n-nodes-base.switch',
            typeVersion: 3,
            position: [450, 300],
            parameters: {
              mode: 'rules',
              rules: {
                rules: []
              }
            }
          }
        ],
        connections: {
          Manual: {
            main: [[{ node: 'Switch', type: 'main', index: 0 }]]
          }
        },
        tags: ['mcp-integration-test']
      });

      expect(workflow.id).toBeTruthy();
      if (!workflow.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(workflow.id);

      // Add connection with negative case value
      // Currently accepted but should be validated in future
      const result = await handleUpdatePartialWorkflow(
        {
          id: workflow.id,
          operations: [
            {
              type: 'addNode',
              node: {
                name: 'Handler',
                type: 'n8n-nodes-base.set',
                typeVersion: 3.4,
                position: [650, 300],
                parameters: {
                  assignments: {
                    assignments: []
                  }
                }
              }
            },
            {
              type: 'addConnection',
              source: 'Switch',
              target: 'Handler',
              case: -1  // Negative value - should be validated but currently accepted
            }
          ]
        },
        mcpContext
      );

      // Currently succeeds (validation gap)
      // TODO: Should fail validation when enhanced validation is added
      expect(result.success).toBe(true);
    });
  });

  // ======================================================================
  // EDGE CASES: Branch parameter on non-IF node
  // ======================================================================

  describe('Edge Cases', () => {
    it('should ignore branch parameter on non-IF node (fallback to default)', async () => {
      // Create workflow with Set node (not an IF node)
      const workflowName = createTestWorkflowName('Smart Params - Branch on Non-IF');
      const workflow = await client.createWorkflow({
        name: workflowName,
        nodes: [
          {
            id: 'manual-1',
            name: 'Manual',
            type: 'n8n-nodes-base.manualTrigger',
            typeVersion: 1,
            position: [250, 300],
            parameters: {}
          },
          {
            id: 'set-1',
            name: 'Set',
            type: 'n8n-nodes-base.set',
            typeVersion: 3.4,
            position: [450, 300],
            parameters: {
              assignments: {
                assignments: []
              }
            }
          }
        ],
        connections: {
          Manual: {
            main: [[{ node: 'Set', type: 'main', index: 0 }]]
          }
        },
        tags: ['mcp-integration-test']
      });

      expect(workflow.id).toBeTruthy();
      if (!workflow.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(workflow.id);

      // Add connection with branch parameter on non-IF node
      // Should be ignored and use default index 0
      const result = await handleUpdatePartialWorkflow(
        {
          id: workflow.id,
          operations: [
            {
              type: 'addNode',
              node: {
                name: 'Handler',
                type: 'n8n-nodes-base.set',
                typeVersion: 3.4,
                position: [650, 300],
                parameters: {
                  assignments: {
                    assignments: []
                  }
                }
              }
            },
            {
              type: 'addConnection',
              source: 'Set',
              target: 'Handler',
              branch: 'true'  // Should be ignored on non-IF node
            }
          ]
        },
        mcpContext
      );

      expect(result.success).toBe(true);

      // Fetch actual workflow from n8n API
      const fetchedWorkflow = await client.getWorkflow(workflow.id);

      // Connection should be at default index 0 (branch parameter ignored)
      expect(fetchedWorkflow.connections.Set).toBeDefined();
      expect(fetchedWorkflow.connections.Set.main).toBeDefined();
      expect(fetchedWorkflow.connections.Set.main[0]).toBeDefined();
      expect(fetchedWorkflow.connections.Set.main[0].length).toBe(1);
      expect(fetchedWorkflow.connections.Set.main[0][0].node).toBe('Handler');
    });
  });

  // ======================================================================
  // TEST 11: Array Index Preservation (Issue #272 - Critical Bug Fix)
  // ======================================================================
  describe('Array Index Preservation for Multi-Output Nodes', () => {
    it('should preserve array indices when rewiring Switch node connections', async () => {
      // This test verifies the fix for the critical bug where filtering empty arrays
      // caused index shifting in multi-output nodes (Switch, IF with multiple handlers)
      //
      // Bug: workflow.connections[node][output].filter(conns => conns.length > 0)
      // Fix: Only remove trailing empty arrays, preserve intermediate ones

      const workflowName = createTestWorkflowName('Array Index Preservation - Switch');

      // Create workflow with Switch node connected to 4 handlers
      const workflow: Workflow = await client.createWorkflow({
        name: workflowName,
        nodes: [
          {
            id: '1',
            name: 'Start',
            type: 'n8n-nodes-base.manualTrigger',
            typeVersion: 1,
            position: [0, 0],
            parameters: {}
          },
          {
            id: '2',
            name: 'Switch',
            type: 'n8n-nodes-base.switch',
            typeVersion: 3,
            position: [200, 0],
            parameters: {
              options: {},
              rules: {
                rules: [
                  { conditions: { conditions: [{ leftValue: '={{$json.value}}', rightValue: '1', operator: { type: 'string', operation: 'equals' } }] } },
                  { conditions: { conditions: [{ leftValue: '={{$json.value}}', rightValue: '2', operator: { type: 'string', operation: 'equals' } }] } },
                  { conditions: { conditions: [{ leftValue: '={{$json.value}}', rightValue: '3', operator: { type: 'string', operation: 'equals' } }] } }
                ]
              }
            }
          },
          {
            id: '3',
            name: 'Handler0',
            type: 'n8n-nodes-base.noOp',
            typeVersion: 1,
            position: [400, -100],
            parameters: {}
          },
          {
            id: '4',
            name: 'Handler1',
            type: 'n8n-nodes-base.noOp',
            typeVersion: 1,
            position: [400, 0],
            parameters: {}
          },
          {
            id: '5',
            name: 'Handler2',
            type: 'n8n-nodes-base.noOp',
            typeVersion: 1,
            position: [400, 100],
            parameters: {}
          },
          {
            id: '6',
            name: 'Handler3',
            type: 'n8n-nodes-base.noOp',
            typeVersion: 1,
            position: [400, 200],
            parameters: {}
          },
          {
            id: '7',
            name: 'NewHandler1',
            type: 'n8n-nodes-base.noOp',
            typeVersion: 1,
            position: [400, 50],
            parameters: {}
          }
        ],
        connections: {
          Start: {
            main: [[{ node: 'Switch', type: 'main', index: 0 }]]
          },
          Switch: {
            main: [
              [{ node: 'Handler0', type: 'main', index: 0 }],  // case 0
              [{ node: 'Handler1', type: 'main', index: 0 }],  // case 1
              [{ node: 'Handler2', type: 'main', index: 0 }],  // case 2
              [{ node: 'Handler3', type: 'main', index: 0 }]   // case 3 (fallback)
            ]
          }
        }
      });

      expect(workflow.id).toBeTruthy();
      if (!workflow.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(workflow.id);

      // Rewire case 1 from Handler1 to NewHandler1
      // CRITICAL: This should NOT shift indices of case 2 and case 3
      await handleUpdatePartialWorkflow({
        id: workflow.id,
        operations: [
          {
            type: 'rewireConnection',
            source: 'Switch',
            from: 'Handler1',
            to: 'NewHandler1',
            case: 1
          }
        ]
      });

      const fetchedWorkflow = await client.getWorkflow(workflow.id);

      // Verify all indices are preserved correctly
      expect(fetchedWorkflow.connections.Switch).toBeDefined();
      expect(fetchedWorkflow.connections.Switch.main).toBeDefined();

      // case 0: Should still be Handler0
      expect(fetchedWorkflow.connections.Switch.main[0]).toBeDefined();
      expect(fetchedWorkflow.connections.Switch.main[0].length).toBe(1);
      expect(fetchedWorkflow.connections.Switch.main[0][0].node).toBe('Handler0');

      // case 1: Should now be NewHandler1 (rewired)
      expect(fetchedWorkflow.connections.Switch.main[1]).toBeDefined();
      expect(fetchedWorkflow.connections.Switch.main[1].length).toBe(1);
      expect(fetchedWorkflow.connections.Switch.main[1][0].node).toBe('NewHandler1');

      // case 2: Should STILL be Handler2 (index NOT shifted!)
      expect(fetchedWorkflow.connections.Switch.main[2]).toBeDefined();
      expect(fetchedWorkflow.connections.Switch.main[2].length).toBe(1);
      expect(fetchedWorkflow.connections.Switch.main[2][0].node).toBe('Handler2');

      // case 3: Should STILL be Handler3 (index NOT shifted!)
      expect(fetchedWorkflow.connections.Switch.main[3]).toBeDefined();
      expect(fetchedWorkflow.connections.Switch.main[3].length).toBe(1);
      expect(fetchedWorkflow.connections.Switch.main[3][0].node).toBe('Handler3');
    });
  });
});
