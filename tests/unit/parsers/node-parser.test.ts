import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NodeParser } from '@/parsers/node-parser';
import { PropertyExtractor } from '@/parsers/property-extractor';
import {
  programmaticNodeFactory,
  declarativeNodeFactory,
  triggerNodeFactory,
  webhookNodeFactory,
  aiToolNodeFactory,
  versionedNodeClassFactory,
  versionedNodeTypeClassFactory,
  malformedNodeFactory,
  nodeClassFactory,
  propertyFactory,
  stringPropertyFactory,
  optionsPropertyFactory
} from '@tests/fixtures/factories/parser-node.factory';

// Mock PropertyExtractor
vi.mock('@/parsers/property-extractor');

describe('NodeParser', () => {
  let parser: NodeParser;
  let mockPropertyExtractor: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup mock property extractor
    mockPropertyExtractor = {
      extractProperties: vi.fn().mockReturnValue([]),
      extractCredentials: vi.fn().mockReturnValue([]),
      detectAIToolCapability: vi.fn().mockReturnValue(false),
      extractOperations: vi.fn().mockReturnValue([])
    };
    
    (PropertyExtractor as any).mockImplementation(() => mockPropertyExtractor);
    
    parser = new NodeParser();
  });

  describe('parse method', () => {
    it('should parse a basic programmatic node', () => {
      const nodeDefinition = programmaticNodeFactory.build();
      const NodeClass = nodeClassFactory.build({ description: nodeDefinition });
      
      mockPropertyExtractor.extractProperties.mockReturnValue(nodeDefinition.properties);
      mockPropertyExtractor.extractCredentials.mockReturnValue(nodeDefinition.credentials);
      
      const result = parser.parse(NodeClass, 'n8n-nodes-base');
      
      expect(result).toMatchObject({
        style: 'programmatic',
        nodeType: `nodes-base.${nodeDefinition.name}`,
        displayName: nodeDefinition.displayName,
        description: nodeDefinition.description,
        category: nodeDefinition.group?.[0] || 'misc',
        packageName: 'n8n-nodes-base'
      });
      
      // Check specific properties separately to avoid strict matching
      expect(result.isVersioned).toBe(false);
      expect(result.version).toBe(nodeDefinition.version?.toString() || '1');
      
      expect(mockPropertyExtractor.extractProperties).toHaveBeenCalledWith(NodeClass);
      expect(mockPropertyExtractor.extractCredentials).toHaveBeenCalledWith(NodeClass);
    });

    it('should parse a declarative node', () => {
      const nodeDefinition = declarativeNodeFactory.build();
      const NodeClass = nodeClassFactory.build({ description: nodeDefinition });
      
      const result = parser.parse(NodeClass, 'n8n-nodes-base');
      
      expect(result.style).toBe('declarative');
      expect(result.nodeType).toBe(`nodes-base.${nodeDefinition.name}`);
    });

    it('should handle node type with package prefix already included', () => {
      const nodeDefinition = programmaticNodeFactory.build({
        name: 'nodes-base.slack'
      });
      const NodeClass = nodeClassFactory.build({ description: nodeDefinition });
      
      const result = parser.parse(NodeClass, 'n8n-nodes-base');
      
      expect(result.nodeType).toBe('nodes-base.slack');
    });

    it('should detect trigger nodes', () => {
      const nodeDefinition = triggerNodeFactory.build();
      const NodeClass = nodeClassFactory.build({ description: nodeDefinition });
      
      const result = parser.parse(NodeClass, 'n8n-nodes-base');
      
      expect(result.isTrigger).toBe(true);
    });

    it('should detect webhook nodes', () => {
      const nodeDefinition = webhookNodeFactory.build();
      const NodeClass = nodeClassFactory.build({ description: nodeDefinition });
      
      const result = parser.parse(NodeClass, 'n8n-nodes-base');
      
      expect(result.isWebhook).toBe(true);
    });

    it('should detect AI tool capability', () => {
      const nodeDefinition = aiToolNodeFactory.build();
      const NodeClass = nodeClassFactory.build({ description: nodeDefinition });
      
      mockPropertyExtractor.detectAIToolCapability.mockReturnValue(true);
      
      const result = parser.parse(NodeClass, 'n8n-nodes-base');
      
      expect(result.isAITool).toBe(true);
    });

    it('should parse versioned nodes with VersionedNodeType class', () => {
      // Create a simple versioned node class without modifying function properties
      const VersionedNodeClass = class VersionedNodeType {
        baseDescription = {
          name: 'versionedNode',
          displayName: 'Versioned Node',
          description: 'A versioned node',
          defaultVersion: 2
        };
        nodeVersions = {
          1: { description: { properties: [] } },
          2: { description: { properties: [] } }
        };
        currentVersion = 2;
      };
      
      mockPropertyExtractor.extractProperties.mockReturnValue([
        propertyFactory.build(),
        propertyFactory.build()
      ]);
      
      const result = parser.parse(VersionedNodeClass, 'n8n-nodes-base');
      
      expect(result.isVersioned).toBe(true);
      expect(result.version).toBe('2');
      expect(result.nodeType).toBe('nodes-base.versionedNode');
    });

    it('should handle versioned nodes with nodeVersions property', () => {
      const versionedDef = versionedNodeClassFactory.build();
      const NodeClass = class {
        nodeVersions = versionedDef.nodeVersions;
        baseDescription = versionedDef.baseDescription;
      };
      
      const result = parser.parse(NodeClass, 'n8n-nodes-base');
      
      expect(result.isVersioned).toBe(true);
      expect(result.version).toBe('2');
    });

    it('should handle nodes with version array', () => {
      const nodeDefinition = programmaticNodeFactory.build({
        version: [1, 1.1, 1.2, 2]
      });
      const NodeClass = nodeClassFactory.build({ description: nodeDefinition });
      
      const result = parser.parse(NodeClass, 'n8n-nodes-base');
      
      expect(result.isVersioned).toBe(true);
      expect(result.version).toBe('2'); // Should return max version
    });

    it('should throw error for nodes without name property', () => {
      const nodeDefinition = malformedNodeFactory.build();
      const NodeClass = nodeClassFactory.build({ description: nodeDefinition });
      
      expect(() => parser.parse(NodeClass, 'n8n-nodes-base')).toThrow('Node is missing name property');
    });

    it('should handle nodes that fail to instantiate', () => {
      const NodeClass = class {
        static description = programmaticNodeFactory.build();
        constructor() {
          throw new Error('Cannot instantiate');
        }
      };
      
      const result = parser.parse(NodeClass, 'n8n-nodes-base');
      
      expect(result.displayName).toBe(NodeClass.description.displayName);
    });

    it('should extract category from different property names', () => {
      const testCases = [
        { group: ['transform'], expected: 'transform' },
        { categories: ['output'], expected: 'output' },
        { category: 'trigger', expected: 'trigger' },
        { /* no category */ expected: 'misc' }
      ];
      
      testCases.forEach(({ group, categories, category, expected }) => {
        const nodeDefinition = programmaticNodeFactory.build({
          group,
          categories,
          category
        } as any);
        const NodeClass = nodeClassFactory.build({ description: nodeDefinition });
        
        const result = parser.parse(NodeClass, 'n8n-nodes-base');
        
        expect(result.category).toBe(expected);
      });
    });

    it('should detect polling trigger nodes', () => {
      const nodeDefinition = programmaticNodeFactory.build({
        polling: true
      });
      const NodeClass = nodeClassFactory.build({ description: nodeDefinition });
      
      const result = parser.parse(NodeClass, 'n8n-nodes-base');
      
      expect(result.isTrigger).toBe(true);
    });

    it('should detect event trigger nodes', () => {
      const nodeDefinition = programmaticNodeFactory.build({
        eventTrigger: true
      });
      const NodeClass = nodeClassFactory.build({ description: nodeDefinition });
      
      const result = parser.parse(NodeClass, 'n8n-nodes-base');
      
      expect(result.isTrigger).toBe(true);
    });

    it('should detect trigger nodes by name', () => {
      const nodeDefinition = programmaticNodeFactory.build({
        name: 'myTrigger'
      });
      const NodeClass = nodeClassFactory.build({ description: nodeDefinition });
      
      const result = parser.parse(NodeClass, 'n8n-nodes-base');
      
      expect(result.isTrigger).toBe(true);
    });

    it('should detect webhook nodes by name', () => {
      const nodeDefinition = programmaticNodeFactory.build({
        name: 'customWebhook'
      });
      const NodeClass = nodeClassFactory.build({ description: nodeDefinition });
      
      const result = parser.parse(NodeClass, 'n8n-nodes-base');
      
      expect(result.isWebhook).toBe(true);
    });

    it('should handle instance-based nodes', () => {
      const nodeDefinition = programmaticNodeFactory.build();
      const nodeInstance = {
        description: nodeDefinition
      };
      
      mockPropertyExtractor.extractProperties.mockReturnValue(nodeDefinition.properties);
      
      const result = parser.parse(nodeInstance, 'n8n-nodes-base');
      
      expect(result.displayName).toBe(nodeDefinition.displayName);
    });

    it('should handle different package name formats', () => {
      const nodeDefinition = programmaticNodeFactory.build();
      const NodeClass = nodeClassFactory.build({ description: nodeDefinition });
      
      const testCases = [
        { packageName: '@n8n/n8n-nodes-langchain', expectedPrefix: 'nodes-langchain' },
        { packageName: 'n8n-nodes-custom', expectedPrefix: 'nodes-custom' },
        { packageName: 'custom-package', expectedPrefix: 'custom-package' }
      ];
      
      testCases.forEach(({ packageName, expectedPrefix }) => {
        const result = parser.parse(NodeClass, packageName);
        expect(result.nodeType).toBe(`${expectedPrefix}.${nodeDefinition.name}`);
      });
    });
  });

  describe('version extraction', () => {
    it('should extract version from baseDescription.defaultVersion', () => {
      const NodeClass = class {
        baseDescription = {
          name: 'test',
          displayName: 'Test',
          defaultVersion: 3
        };
      };
      
      const result = parser.parse(NodeClass, 'n8n-nodes-base');
      
      expect(result.version).toBe('3');
    });

    it('should extract version from nodeVersions keys', () => {
      const NodeClass = class {
        description = { name: 'test', displayName: 'Test' };
        nodeVersions = {
          1: { description: {} },
          2: { description: {} },
          3: { description: {} }
        };
      };
      
      const result = parser.parse(NodeClass, 'n8n-nodes-base');
      
      expect(result.version).toBe('3');
    });

    it('should extract version from instance nodeVersions', () => {
      const NodeClass = class {
        description = { name: 'test', displayName: 'Test' };
        
        constructor() {
          (this as any).nodeVersions = {
            1: { description: {} },
            2: { description: {} },
            4: { description: {} }
          };
        }
      };
      
      const result = parser.parse(NodeClass, 'n8n-nodes-base');
      
      expect(result.version).toBe('4');
    });

    it('should handle version as number in description', () => {
      const nodeDefinition = programmaticNodeFactory.build({
        version: 2
      });
      const NodeClass = nodeClassFactory.build({ description: nodeDefinition });
      
      const result = parser.parse(NodeClass, 'n8n-nodes-base');
      
      expect(result.version).toBe('2');
    });

    it('should handle version as string in description', () => {
      const nodeDefinition = programmaticNodeFactory.build({
        version: '1.5' as any
      });
      const NodeClass = nodeClassFactory.build({ description: nodeDefinition });
      
      const result = parser.parse(NodeClass, 'n8n-nodes-base');
      
      expect(result.version).toBe('1.5');
    });

    it('should default to version 1 when no version found', () => {
      const nodeDefinition = programmaticNodeFactory.build();
      delete (nodeDefinition as any).version;
      const NodeClass = nodeClassFactory.build({ description: nodeDefinition });
      
      const result = parser.parse(NodeClass, 'n8n-nodes-base');
      
      expect(result.version).toBe('1');
    });
  });

  describe('versioned node detection', () => {
    it('should detect versioned nodes with nodeVersions', () => {
      const NodeClass = class {
        description = { name: 'test', displayName: 'Test' };
        nodeVersions = { 1: {}, 2: {} };
      };
      
      const result = parser.parse(NodeClass, 'n8n-nodes-base');
      
      expect(result.isVersioned).toBe(true);
    });

    it('should detect versioned nodes with defaultVersion', () => {
      const NodeClass = class {
        baseDescription = {
          name: 'test',
          displayName: 'Test',
          defaultVersion: 2
        };
      };
      
      const result = parser.parse(NodeClass, 'n8n-nodes-base');
      
      expect(result.isVersioned).toBe(true);
    });

    it('should detect versioned nodes with version array in instance', () => {
      const NodeClass = class {
        description = {
          name: 'test',
          displayName: 'Test',
          version: [1, 1.1, 2]
        };
      };
      
      const result = parser.parse(NodeClass, 'n8n-nodes-base');
      
      expect(result.isVersioned).toBe(true);
    });

    it('should not detect non-versioned nodes as versioned', () => {
      const nodeDefinition = programmaticNodeFactory.build({
        version: 1
      });
      const NodeClass = nodeClassFactory.build({ description: nodeDefinition });
      
      const result = parser.parse(NodeClass, 'n8n-nodes-base');
      
      expect(result.isVersioned).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle null/undefined description gracefully', () => {
      const NodeClass = class {
        description = null;
      };
      
      expect(() => parser.parse(NodeClass, 'n8n-nodes-base')).toThrow();
    });

    it('should handle empty routing object for declarative nodes', () => {
      const nodeDefinition = declarativeNodeFactory.build({
        routing: {} as any
      });
      const NodeClass = nodeClassFactory.build({ description: nodeDefinition });
      
      const result = parser.parse(NodeClass, 'n8n-nodes-base');
      
      expect(result.style).toBe('declarative');
    });

    it('should handle complex nested versioned structure', () => {
      const NodeClass = class VersionedNodeType {
        constructor() {
          (this as any).baseDescription = {
            name: 'complex',
            displayName: 'Complex Node',
            defaultVersion: 3
          };
          (this as any).nodeVersions = {
            1: { description: { properties: [] } },
            2: { description: { properties: [] } },
            3: { description: { properties: [] } }
          };
        }
      };
      
      // Override constructor name check
      Object.defineProperty(NodeClass.prototype.constructor, 'name', {
        value: 'VersionedNodeType'
      });
      
      const result = parser.parse(NodeClass, 'n8n-nodes-base');
      
      expect(result.isVersioned).toBe(true);
      expect(result.version).toBe('3');
    });
  });
});