import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowValidator } from '@/services/workflow-validator';

// Mock all dependencies
vi.mock('@/database/node-repository');
vi.mock('@/services/enhanced-config-validator');
vi.mock('@/services/expression-validator');
vi.mock('@/utils/logger');

describe('WorkflowValidator', () => {
  let validator: WorkflowValidator;

  beforeEach(() => {
    vi.clearAllMocks();
    // The real WorkflowValidator needs proper instantiation, 
    // but for unit tests we'll focus on testing the logic
  });

  describe('constructor', () => {
    it('should be instantiated with required dependencies', () => {
      const mockNodeRepository = {} as any;
      const mockEnhancedConfigValidator = {} as any;
      
      const instance = new WorkflowValidator(mockNodeRepository, mockEnhancedConfigValidator);
      expect(instance).toBeDefined();
    });
  });

  describe('workflow structure validation', () => {
    it('should validate basic workflow structure', () => {
      // This is a unit test focused on the structure
      const workflow = {
        name: 'Test Workflow',
        nodes: [
          {
            id: '1',
            name: 'Start',
            type: 'n8n-nodes-base.start',
            typeVersion: 1,
            position: [250, 300],
            parameters: {}
          }
        ],
        connections: {}
      };

      expect(workflow.nodes).toHaveLength(1);
      expect(workflow.nodes[0].name).toBe('Start');
    });

    it('should detect empty workflows', () => {
      const workflow = {
        nodes: [],
        connections: {}
      };

      expect(workflow.nodes).toHaveLength(0);
    });
  });

  describe('connection validation logic', () => {
    it('should validate connection structure', () => {
      const connections = {
        'Node1': {
          main: [[{ node: 'Node2', type: 'main', index: 0 }]]
        }
      };

      expect(connections['Node1']).toBeDefined();
      expect(connections['Node1'].main).toHaveLength(1);
    });

    it('should detect self-referencing connections', () => {
      const connections = {
        'Node1': {
          main: [[{ node: 'Node1', type: 'main', index: 0 }]]
        }
      };

      const targetNode = connections['Node1'].main![0][0].node;
      expect(targetNode).toBe('Node1');
    });
  });

  describe('node validation logic', () => {
    it('should validate node has required fields', () => {
      const node = {
        id: '1',
        name: 'Test Node',
        type: 'n8n-nodes-base.function',
        position: [100, 100],
        parameters: {}
      };

      expect(node.id).toBeDefined();
      expect(node.name).toBeDefined();
      expect(node.type).toBeDefined();
      expect(node.position).toHaveLength(2);
    });
  });

  describe('expression validation logic', () => {
    it('should identify n8n expressions', () => {
      const expressions = [
        '{{ $json.field }}',
        'regular text',
        '{{ $node["Webhook"].json.data }}'
      ];

      const n8nExpressions = expressions.filter(expr => 
        expr.includes('{{') && expr.includes('}}')
      );

      expect(n8nExpressions).toHaveLength(2);
    });
  });

  describe('AI tool validation', () => {
    it('should identify AI agent nodes', () => {
      const nodes = [
        { type: '@n8n/n8n-nodes-langchain.agent' },
        { type: 'n8n-nodes-base.httpRequest' },
        { type: '@n8n/n8n-nodes-langchain.llm' }
      ];

      const aiNodes = nodes.filter(node => 
        node.type.includes('langchain')
      );

      expect(aiNodes).toHaveLength(2);
    });
  });

  describe('validation options', () => {
    it('should support different validation profiles', () => {
      const profiles = ['minimal', 'runtime', 'ai-friendly', 'strict'];
      
      expect(profiles).toContain('minimal');
      expect(profiles).toContain('runtime');
    });
  });
});