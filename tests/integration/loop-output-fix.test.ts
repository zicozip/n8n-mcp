import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NodeParser } from '@/parsers/node-parser';
import { NodeRepository } from '@/database/node-repository';
import { WorkflowValidator } from '@/services/workflow-validator';
import { DocsMapper } from '@/mappers/docs-mapper';
import { EnhancedConfigValidator } from '@/services/enhanced-config-validator';
import { DatabaseAdapter } from '@/database/database-adapter';
import { promises as fs } from 'fs';

// Mock file system for DocsMapper
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn()
  }
}));

// Mock external dependencies
vi.mock('@/parsers/property-extractor', () => {
  const mockInstance = {
    extractProperties: vi.fn().mockReturnValue([]),
    extractCredentials: vi.fn().mockReturnValue([]),
    detectAIToolCapability: vi.fn().mockReturnValue(false),
    extractOperations: vi.fn().mockReturnValue([])
  };
  
  return {
    PropertyExtractor: vi.fn().mockImplementation(() => mockInstance)
  };
});
vi.mock('@/services/enhanced-config-validator');

describe('Integration: SplitInBatches Loop Output Fix', () => {
  let nodeParser: NodeParser;
  let nodeRepository: NodeRepository;
  let mockNodeRepository: any;
  let workflowValidator: WorkflowValidator;
  let docsMapper: DocsMapper;
  let mockDb: DatabaseAdapter;
  let mockStatement: any;
  let mockNodeValidator: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup mock database
    mockStatement = {
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn()
    };

    mockDb = {
      prepare: vi.fn().mockReturnValue(mockStatement),
      transaction: vi.fn(),
      exec: vi.fn(),
      close: vi.fn(),
      pragma: vi.fn()
    } as any;

    // PropertyExtractor is mocked at module level

    // Setup mock node validator
    mockNodeValidator = {
      validateWithMode: vi.fn().mockReturnValue({
        errors: [],
        warnings: []
      })
    };

    // Apply mocks after setup
    vi.mocked(EnhancedConfigValidator).validateWithMode = mockNodeValidator.validateWithMode;

    // Setup mock node repository
    mockNodeRepository = {
      getNode: vi.fn(),
      saveNode: vi.fn(),
      getNodeByType: vi.fn(),
      getAllNodes: vi.fn()
    };

    // Initialize components
    nodeParser = new NodeParser();
    nodeRepository = new NodeRepository(mockDb);
    workflowValidator = new WorkflowValidator(mockNodeRepository, EnhancedConfigValidator);
    docsMapper = new DocsMapper();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Complete SplitInBatches Flow', () => {
    it('should parse, store, retrieve, and validate SplitInBatches node with outputs', async () => {
      // 1. PARSING PHASE: Parse a SplitInBatches node with outputs
      const splitInBatchesNodeClass = class {
        description = {
          name: 'splitInBatches',
          displayName: 'Split In Batches',
          description: 'Split data into batches and iterate over each batch',
          group: ['transform'],
          version: 3,
          outputs: [
            {
              displayName: 'Done',
              name: 'done',
              type: 'main',
              hint: 'Receives the final data after all batches have been processed'
            },
            {
              displayName: 'Loop',
              name: 'loop',
              type: 'main',
              hint: 'Receives the current batch data during each iteration'
            }
          ],
          outputNames: ['done', 'loop']
        };
      };

      const parsedNode = nodeParser.parse(splitInBatchesNodeClass, 'n8n-nodes-base');

      // Verify parsing extracted outputs correctly
      expect(parsedNode.outputs).toHaveLength(2);
      expect(parsedNode.outputs[0].displayName).toBe('Done');
      expect(parsedNode.outputs[1].displayName).toBe('Loop');
      expect(parsedNode.outputNames).toEqual(['done', 'loop']);
      expect(parsedNode.nodeType).toBe('nodes-base.splitInBatches');

      // 2. STORAGE PHASE: Save node to database
      nodeRepository.saveNode(parsedNode);

      expect(mockStatement.run).toHaveBeenCalledWith(
        'nodes-base.splitInBatches',
        'n8n-nodes-base',
        'Split In Batches',
        'Split data into batches and iterate over each batch',
        'transform',
        'programmatic',
        0, // is_ai_tool
        0, // is_trigger
        0, // is_webhook
        0, // is_versioned
        '3', // version
        null, // documentation
        JSON.stringify([], null, 2), // properties
        JSON.stringify([], null, 2), // operations
        JSON.stringify([], null, 2), // credentials
        JSON.stringify(parsedNode.outputs, null, 2), // outputs
        JSON.stringify(parsedNode.outputNames, null, 2) // output_names
      );

      // 3. RETRIEVAL PHASE: Get node from database
      const mockRow = {
        node_type: 'nodes-base.splitInBatches',
        display_name: 'Split In Batches',
        description: 'Split data into batches and iterate over each batch',
        category: 'transform',
        development_style: 'programmatic',
        package_name: 'n8n-nodes-base',
        is_ai_tool: 0,
        is_trigger: 0,
        is_webhook: 0,
        is_versioned: 0,
        version: '3',
        properties_schema: JSON.stringify([]),
        operations: JSON.stringify([]),
        credentials_required: JSON.stringify([]),
        documentation: null,
        outputs: JSON.stringify(parsedNode.outputs),
        output_names: JSON.stringify(parsedNode.outputNames)
      };

      mockStatement.get.mockReturnValue(mockRow);
      const retrievedNode = nodeRepository.getNode('nodes-base.splitInBatches');

      // Verify retrieval preserved output order and structure
      expect(retrievedNode.outputs).toEqual(parsedNode.outputs);
      expect(retrievedNode.outputNames).toEqual(['done', 'loop']);
      expect(retrievedNode.outputs[0].displayName).toBe('Done'); // Index 0 = Done
      expect(retrievedNode.outputs[1].displayName).toBe('Loop'); // Index 1 = Loop

      // 4. VALIDATION PHASE: Validate workflows using this node
      mockNodeRepository.getNode.mockReturnValue(retrievedNode);

      // Test correct connections (should pass)
      const correctWorkflow = {
        name: 'Correct Loop Workflow',
        nodes: [
          {
            id: '1',
            name: 'Manual Trigger',
            type: 'n8n-nodes-base.manualTrigger',
            position: [100, 100],
            parameters: {}
          },
          {
            id: '2',
            name: 'Split In Batches',
            type: 'n8n-nodes-base.splitInBatches',
            position: [300, 100],
            parameters: { batchSize: 10 }
          },
          {
            id: '3',
            name: 'Process Item',
            type: 'n8n-nodes-base.function',
            position: [500, 50],
            parameters: {}
          },
          {
            id: '4',
            name: 'Send Summary',
            type: 'n8n-nodes-base.emailSend',
            position: [500, 150],
            parameters: {}
          }
        ],
        connections: {
          'Manual Trigger': {
            main: [
              [{ node: 'Split In Batches', type: 'main', index: 0 }]
            ]
          },
          'Split In Batches': {
            main: [
              [{ node: 'Send Summary', type: 'main', index: 0 }],    // Done output (0) -> Final action
              [{ node: 'Process Item', type: 'main', index: 0 }]     // Loop output (1) -> Processing
            ]
          },
          'Process Item': {
            main: [
              [{ node: 'Split In Batches', type: 'main', index: 0 }]  // Loop back
            ]
          }
        }
      };

      const correctResult = await workflowValidator.validateWorkflow(correctWorkflow);

      // Should not have loop-specific errors for correct setup
      const loopErrors = correctResult.errors.filter(e => 
        e.message?.includes('SplitInBatches') || e.message?.includes('reversed')
      );
      expect(loopErrors).toHaveLength(0);

      // Test reversed connections (should error)
      const reversedWorkflow = {
        name: 'Reversed Loop Workflow',
        nodes: [
          {
            id: '1',
            name: 'Manual Trigger',
            type: 'n8n-nodes-base.manualTrigger',
            position: [100, 100],
            parameters: {}
          },
          {
            id: '2',
            name: 'Split In Batches',
            type: 'n8n-nodes-base.splitInBatches',
            position: [300, 100],
            parameters: { batchSize: 10 }
          },
          {
            id: '3',
            name: 'Process Item',
            type: 'n8n-nodes-base.function',
            position: [500, 50],
            parameters: {}
          },
          {
            id: '4',
            name: 'Send Summary',
            type: 'n8n-nodes-base.emailSend',
            position: [500, 150],
            parameters: {}
          }
        ],
        connections: {
          'Manual Trigger': {
            main: [
              [{ node: 'Split In Batches', type: 'main', index: 0 }]
            ]
          },
          'Split In Batches': {
            main: [
              [{ node: 'Process Item', type: 'main', index: 0 }],     // WRONG: Processing on Done (0)
              [{ node: 'Send Summary', type: 'main', index: 0 }]      // WRONG: Final on Loop (1)
            ]
          },
          'Process Item': {
            main: [
              [{ node: 'Split In Batches', type: 'main', index: 0 }]  // Loop back (proves it's processing)
            ]
          }
        }
      };

      const reversedResult = await workflowValidator.validateWorkflow(reversedWorkflow);

      // Should detect reversed connections
      const reversedErrors = reversedResult.errors.filter(e => 
        e.message?.includes('SplitInBatches outputs appear reversed')
      );
      expect(reversedErrors).toHaveLength(1);
      expect(reversedErrors[0].message).toContain('Output 0 = "done"');
      expect(reversedErrors[0].message).toContain('Output 1 = "loop"');
    });

    it('should enhance documentation with critical output guidance', async () => {
      // 5. DOCUMENTATION PHASE: Test documentation enhancement
      const originalDocs = `# Split In Batches Node

This node splits data into batches for processing.

## When to use

Use when you need to process large datasets in smaller chunks to avoid memory issues.

## Parameters

- **Batch Size**: Number of items to process in each batch
`;

      vi.mocked(fs.readFile).mockResolvedValueOnce(originalDocs);

      const enhancedDocs = await docsMapper.fetchDocumentation('splitInBatches');

      // Verify critical guidance was added
      expect(enhancedDocs).toContain('CRITICAL OUTPUT CONNECTION INFORMATION');
      expect(enhancedDocs).toContain('⚠️ OUTPUT INDICES ARE COUNTERINTUITIVE ⚠️');
      expect(enhancedDocs).toContain('Output 0 (index 0) = "done"');
      expect(enhancedDocs).toContain('Output 1 (index 1) = "loop"');
      expect(enhancedDocs).toContain('AI assistants often connect these backwards');

      // Verify guidance appears before the original "When to use" section
      const guidanceIndex = enhancedDocs.indexOf('CRITICAL OUTPUT CONNECTION INFORMATION');
      const whenToUseIndex = enhancedDocs.indexOf('## When to use');
      expect(guidanceIndex).toBeLessThan(whenToUseIndex);
      expect(guidanceIndex).toBeGreaterThan(0);

      // Verify specific connection patterns are explained
      expect(enhancedDocs).toContain('Connect nodes that PROCESS items inside the loop to **Output 1 ("loop")**');
      expect(enhancedDocs).toContain('Connect nodes that run AFTER the loop completes to **Output 0 ("done")**');
    });
  });

  describe('IF Node Integration Flow', () => {
    it('should handle IF node outputs correctly throughout the flow', async () => {
      // 1. Parse IF node with outputs
      const ifNodeClass = class {
        description = {
          name: 'if',
          displayName: 'IF',
          description: 'Route items to different outputs based on conditions',
          group: ['transform'],
          version: 2,
          outputs: [
            {
              displayName: 'True',
              name: 'true',
              type: 'main',
              hint: 'Items that match the condition'
            },
            {
              displayName: 'False',
              name: 'false',
              type: 'main',
              hint: 'Items that do not match the condition'
            }
          ],
          outputNames: ['true', 'false']
        };
      };

      const parsedNode = nodeParser.parse(ifNodeClass, 'n8n-nodes-base');

      expect(parsedNode.outputs).toHaveLength(2);
      expect(parsedNode.outputs[0].displayName).toBe('True');
      expect(parsedNode.outputs[1].displayName).toBe('False');
      expect(parsedNode.outputNames).toEqual(['true', 'false']);

      // 2. Store and retrieve
      nodeRepository.saveNode(parsedNode);

      const mockRow = {
        node_type: 'nodes-base.if',
        display_name: 'IF',
        description: 'Route items to different outputs based on conditions',
        category: 'transform',
        development_style: 'programmatic',
        package_name: 'n8n-nodes-base',
        is_ai_tool: 0,
        is_trigger: 0,
        is_webhook: 0,
        is_versioned: 0,
        version: '2',
        properties_schema: JSON.stringify([]),
        operations: JSON.stringify([]),
        credentials_required: JSON.stringify([]),
        documentation: null,
        outputs: JSON.stringify(parsedNode.outputs),
        output_names: JSON.stringify(parsedNode.outputNames)
      };

      mockStatement.get.mockReturnValue(mockRow);
      const retrievedNode = nodeRepository.getNode('nodes-base.if');

      expect(retrievedNode.outputs[0].displayName).toBe('True');
      expect(retrievedNode.outputs[1].displayName).toBe('False');

      // 3. Test documentation enhancement
      const originalDocs = `# IF Node

Route items based on conditions.

## Node parameters

Configure your condition here.
`;

      vi.mocked(fs.readFile).mockResolvedValueOnce(originalDocs);
      const enhancedDocs = await docsMapper.fetchDocumentation('nodes-base.if');

      expect(enhancedDocs).toContain('Output Connection Information');
      expect(enhancedDocs).toContain('Output 0 (index 0) = "true"');
      expect(enhancedDocs).toContain('Output 1 (index 1) = "false"');
    });
  });

  describe('Edge Cases Integration', () => {
    it('should handle nodes without outputs gracefully', async () => {
      // Parse node without outputs
      const httpRequestClass = class {
        description = {
          name: 'httpRequest',
          displayName: 'HTTP Request',
          description: 'Make HTTP requests',
          group: ['input'],
          version: 4
          // No outputs or outputNames
        };
      };

      const parsedNode = nodeParser.parse(httpRequestClass, 'n8n-nodes-base');

      expect(parsedNode.outputs).toBeUndefined();
      expect(parsedNode.outputNames).toBeUndefined();

      // Store and retrieve
      nodeRepository.saveNode(parsedNode);

      const mockRow = {
        node_type: 'nodes-base.httpRequest',
        display_name: 'HTTP Request',
        description: 'Make HTTP requests',
        category: 'input',
        development_style: 'programmatic',
        package_name: 'n8n-nodes-base',
        is_ai_tool: 0,
        is_trigger: 0,
        is_webhook: 0,
        is_versioned: 0,
        version: '4',
        properties_schema: JSON.stringify([]),
        operations: JSON.stringify([]),
        credentials_required: JSON.stringify([]),
        documentation: null,
        outputs: null,
        output_names: null
      };

      mockStatement.get.mockReturnValue(mockRow);
      const retrievedNode = nodeRepository.getNode('nodes-base.httpRequest');

      expect(retrievedNode.outputs).toBe(null);
      expect(retrievedNode.outputNames).toBe(null);

      // Validation should handle gracefully
      const workflow = {
        name: 'Simple HTTP Workflow',
        nodes: [
          {
            id: '1',
            name: 'HTTP Request',
            type: 'n8n-nodes-base.httpRequest',
            position: [100, 100],
            parameters: { url: 'https://example.com' }
          }
        ],
        connections: {}
      };

      mockNodeRepository.getNode.mockReturnValue(retrievedNode);
      const result = await workflowValidator.validateWorkflow(workflow);

      // Should not crash and should not have output-specific errors
      expect(result).toBeDefined();
      const outputErrors = result.errors.filter(e => 
        e.message?.includes('output') || e.message?.includes('SplitInBatches')
      );
      expect(outputErrors).toHaveLength(0);
    });

    it('should handle malformed output data in database', async () => {
      // Simulate malformed JSON in database
      const mockRow = {
        node_type: 'nodes-base.malformed',
        display_name: 'Malformed Node',
        description: 'Node with malformed output data',
        category: 'misc',
        development_style: 'programmatic',
        package_name: 'n8n-nodes-base',
        is_ai_tool: 0,
        is_trigger: 0,
        is_webhook: 0,
        is_versioned: 0,
        version: '1',
        properties_schema: JSON.stringify([]),
        operations: JSON.stringify([]),
        credentials_required: JSON.stringify([]),
        documentation: null,
        outputs: '{invalid json}',
        output_names: '[malformed, json'
      };

      mockStatement.get.mockReturnValue(mockRow);
      const retrievedNode = nodeRepository.getNode('nodes-base.malformed');

      // Should handle gracefully with null fallbacks
      expect(retrievedNode.outputs).toBe(null);
      expect(retrievedNode.outputNames).toBe(null);
    });

    it('should handle complex versioned node output extraction', async () => {
      // Test versioned node with outputs in different versions
      const versionedNodeClass = class {
        description = {
          name: 'versionedSwitch',
          displayName: 'Versioned Switch'
          // No outputs in base description
        };

        nodeVersions = {
          1: {
            description: {
              outputs: [
                { displayName: 'Output 1' },
                { displayName: 'Output 2' }
              ]
            }
          },
          2: {
            description: {
              outputs: [
                { displayName: 'Branch 1' },
                { displayName: 'Branch 2' },
                { displayName: 'Default' }
              ],
              outputNames: ['branch1', 'branch2', 'default']
            }
          }
        };
      };

      const parsedNode = nodeParser.parse(versionedNodeClass, 'n8n-nodes-base');

      // Should extract from latest version (2)
      expect(parsedNode.outputs).toHaveLength(3);
      expect(parsedNode.outputs[0].displayName).toBe('Branch 1');
      expect(parsedNode.outputs[2].displayName).toBe('Default');
      expect(parsedNode.outputNames).toEqual(['branch1', 'branch2', 'default']);
    });
  });

  describe('MCP Server Integration Flow', () => {
    it('should provide enhanced node information through getNodeInfo', async () => {
      // Simulate MCP server getNodeInfo call that uses NodeRepository
      const mockSplitInBatchesRow = {
        node_type: 'nodes-base.splitInBatches',
        display_name: 'Split In Batches',
        description: 'Split data into batches and iterate over each batch',
        category: 'transform',
        development_style: 'programmatic',
        package_name: 'n8n-nodes-base',
        is_ai_tool: 0,
        is_trigger: 0,
        is_webhook: 0,
        is_versioned: 0,
        version: '3',
        properties_schema: JSON.stringify([]),
        operations: JSON.stringify([]),
        credentials_required: JSON.stringify([]),
        documentation: null,
        outputs: JSON.stringify([
          { displayName: 'Done', name: 'done', description: 'Final results when loop completes' },
          { displayName: 'Loop', name: 'loop', description: 'Current batch data during iteration' }
        ]),
        output_names: JSON.stringify(['done', 'loop'])
      };

      mockStatement.get.mockReturnValue(mockSplitInBatchesRow);
      const nodeInfo = nodeRepository.getNode('nodes-base.splitInBatches');

      // MCP server would return this enhanced information to AI assistants
      expect(nodeInfo.outputs).toBeDefined();
      expect(nodeInfo.outputs).toHaveLength(2);
      expect(nodeInfo.outputs[0].displayName).toBe('Done');
      expect(nodeInfo.outputs[1].displayName).toBe('Loop');
      expect(nodeInfo.outputNames).toEqual(['done', 'loop']);

      // AI assistant can now see:
      // - Output 0 is "Done" (final results)
      // - Output 1 is "Loop" (current batch)
      // This should help them connect correctly: processing nodes to Loop (1), final nodes to Done (0)
    });

    it('should provide workflow validation that detects reversed connections', async () => {
      // Simulate AI assistant creating workflow with reversed connections
      const aiWorkflow = {
        name: 'AI Generated Workflow',
        nodes: [
          {
            id: 'trigger1',
            name: 'Manual Trigger',
            type: 'n8n-nodes-base.manualTrigger',
            position: [100, 100],
            parameters: {}
          },
          {
            id: 'split1',
            name: 'Split In Batches',
            type: 'n8n-nodes-base.splitInBatches',
            position: [300, 100],
            parameters: { batchSize: 5 }
          },
          {
            id: 'process1',
            name: 'Transform Each',
            type: 'n8n-nodes-base.function',
            position: [500, 50],
            parameters: { functionCode: 'return items.map(item => ({ ...item, processed: true }));' }
          },
          {
            id: 'notify1',
            name: 'Send Final Email',
            type: 'n8n-nodes-base.emailSend',
            position: [500, 150],
            parameters: { subject: 'Processing Complete' }
          }
        ],
        connections: {
          'Manual Trigger': {
            main: [
              [{ node: 'Split In Batches', type: 'main', index: 0 }]
            ]
          },
          'Split In Batches': {
            main: [
              // AI mistakenly connects processing to "done" and final to "loop"
              [{ node: 'Transform Each', type: 'main', index: 0 }],    // WRONG: Processing -> Done (0)
              [{ node: 'Send Final Email', type: 'main', index: 0 }]   // WRONG: Final -> Loop (1)
            ]
          },
          'Transform Each': {
            main: [
              [{ node: 'Split In Batches', type: 'main', index: 0 }]  // Loop back (proves it's processing)
            ]
          }
        }
      };

      // Mock node repository for validation
      mockNodeRepository.getNode.mockReturnValue({
        nodeType: 'nodes-base.splitInBatches',
        properties: [],
        outputs: [
          { displayName: 'Done', name: 'done', type: 'main' },
          { displayName: 'Loop', name: 'loop', type: 'main' }
        ],
        outputNames: ['done', 'loop']
      });

      const validationResult = await workflowValidator.validateWorkflow(aiWorkflow);

      // Should catch the reversal mistake
      const reversedErrors = validationResult.errors.filter(e => 
        e.message?.includes('SplitInBatches outputs appear reversed')
      );

      expect(reversedErrors).toHaveLength(1);
      expect(reversedErrors[0].message).toContain('Transform Each');
      expect(reversedErrors[0].message).toContain('connected to output 0 ("done")');
      expect(reversedErrors[0].message).toContain('should be connected to output 1 ("loop")');

      // The validation provides clear guidance to fix the mistake
      expect(reversedErrors[0].message).toContain('Output 0 = "done" (post-loop)');
      expect(reversedErrors[0].message).toContain('Output 1 = "loop" (inside loop)');
    });
  });
});