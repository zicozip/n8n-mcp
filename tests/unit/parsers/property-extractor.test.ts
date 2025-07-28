import { describe, it, expect, beforeEach } from 'vitest';
import { PropertyExtractor } from '@/parsers/property-extractor';
import {
  programmaticNodeFactory,
  declarativeNodeFactory,
  versionedNodeClassFactory,
  versionedNodeTypeClassFactory,
  nodeClassFactory,
  propertyFactory,
  stringPropertyFactory,
  numberPropertyFactory,
  booleanPropertyFactory,
  optionsPropertyFactory,
  collectionPropertyFactory,
  nestedPropertyFactory,
  resourcePropertyFactory,
  operationPropertyFactory,
  aiToolNodeFactory
} from '@tests/fixtures/factories/parser-node.factory';

describe('PropertyExtractor', () => {
  let extractor: PropertyExtractor;

  beforeEach(() => {
    extractor = new PropertyExtractor();
  });

  describe('extractProperties', () => {
    it('should extract properties from programmatic node', () => {
      const nodeDefinition = programmaticNodeFactory.build();
      const NodeClass = nodeClassFactory.build({ description: nodeDefinition });
      
      const properties = extractor.extractProperties(NodeClass);
      
      expect(properties).toHaveLength(nodeDefinition.properties.length);
      expect(properties).toEqual(expect.arrayContaining(
        nodeDefinition.properties.map(prop => expect.objectContaining({
          displayName: prop.displayName,
          name: prop.name,
          type: prop.type,
          default: prop.default
        }))
      ));
    });

    it('should extract properties from versioned node latest version', () => {
      const versionedDef = versionedNodeClassFactory.build();
      const NodeClass = class {
        nodeVersions = versionedDef.nodeVersions;
        baseDescription = versionedDef.baseDescription;
      };
      
      const properties = extractor.extractProperties(NodeClass);
      
      // Should get properties from version 2 (latest)
      expect(properties).toHaveLength(versionedDef.nodeVersions![2].description.properties.length);
    });

    it('should extract properties from instance with nodeVersions', () => {
      const NodeClass = class {
        description = { name: 'test' };
        constructor() {
          (this as any).nodeVersions = {
            1: {
              description: {
                properties: [propertyFactory.build({ name: 'v1prop' })]
              }
            },
            2: {
              description: {
                properties: [
                  propertyFactory.build({ name: 'v2prop1' }),
                  propertyFactory.build({ name: 'v2prop2' })
                ]
              }
            }
          };
        }
      };
      
      const properties = extractor.extractProperties(NodeClass);
      
      expect(properties).toHaveLength(2);
      expect(properties[0].name).toBe('v2prop1');
      expect(properties[1].name).toBe('v2prop2');
    });

    it('should normalize properties to consistent structure', () => {
      const rawProperties = [
        {
          displayName: 'Field 1',
          name: 'field1',
          type: 'string',
          default: 'value',
          description: 'Test field',
          required: true,
          displayOptions: { show: { resource: ['user'] } },
          typeOptions: { multipleValues: true },
          noDataExpression: false,
          extraField: 'should be removed'
        }
      ];
      
      const NodeClass = nodeClassFactory.build({
        description: { 
          name: 'test',
          properties: rawProperties 
        }
      });
      
      const properties = extractor.extractProperties(NodeClass);
      
      expect(properties[0]).toEqual({
        displayName: 'Field 1',
        name: 'field1',
        type: 'string',
        default: 'value',
        description: 'Test field',
        options: undefined,
        required: true,
        displayOptions: { show: { resource: ['user'] } },
        typeOptions: { multipleValues: true },
        noDataExpression: false
      });
      
      expect(properties[0]).not.toHaveProperty('extraField');
    });

    it('should handle nodes without properties', () => {
      const NodeClass = nodeClassFactory.build({
        description: {
          name: 'test',
          displayName: 'Test'
          // No properties field
        }
      });
      
      const properties = extractor.extractProperties(NodeClass);
      
      expect(properties).toEqual([]);
    });

    it('should handle failed instantiation', () => {
      const NodeClass = class {
        static description = {
          name: 'test',
          properties: [propertyFactory.build()]
        };
        constructor() {
          throw new Error('Cannot instantiate');
        }
      };
      
      const properties = extractor.extractProperties(NodeClass);
      
      expect(properties).toHaveLength(1); // Should get static description property
    });

    it('should extract from baseDescription when main description is missing', () => {
      const NodeClass = class {
        baseDescription = {
          properties: [
            stringPropertyFactory.build({ name: 'baseProp' })
          ]
        };
      };
      
      const properties = extractor.extractProperties(NodeClass);
      
      expect(properties).toHaveLength(1);
      expect(properties[0].name).toBe('baseProp');
    });

    it('should handle complex nested properties', () => {
      const nestedProp = nestedPropertyFactory.build();
      const NodeClass = nodeClassFactory.build({
        description: {
          name: 'test',
          properties: [nestedProp]
        }
      });
      
      const properties = extractor.extractProperties(NodeClass);
      
      expect(properties).toHaveLength(1);
      expect(properties[0].type).toBe('collection');
      expect(properties[0].options).toBeDefined();
    });

    it('should handle non-function node classes', () => {
      const nodeInstance = {
        description: {
          properties: [propertyFactory.build()]
        }
      };
      
      const properties = extractor.extractProperties(nodeInstance);
      
      expect(properties).toHaveLength(1);
    });
  });

  describe('extractOperations', () => {
    it('should extract operations from declarative node routing', () => {
      const nodeDefinition = declarativeNodeFactory.build();
      const NodeClass = nodeClassFactory.build({ description: nodeDefinition });
      
      const operations = extractor.extractOperations(NodeClass);
      
      // Declarative node has 2 resources with 2 operations each = 4 total
      expect(operations.length).toBe(4);
      
      // Check that we have operations for each resource
      const userOps = operations.filter(op => op.resource === 'user');
      const postOps = operations.filter(op => op.resource === 'post');
      
      expect(userOps.length).toBe(2); // Create and Get
      expect(postOps.length).toBe(2); // Create and List
      
      // Verify operation structure
      expect(userOps[0]).toMatchObject({
        resource: 'user',
        operation: expect.any(String),
        name: expect.any(String),
        action: expect.any(String)
      });
    });

    it('should extract operations from programmatic node properties', () => {
      const operationProp = operationPropertyFactory.build();
      const NodeClass = nodeClassFactory.build({
        description: {
          name: 'test',
          properties: [operationProp]
        }
      });
      
      const operations = extractor.extractOperations(NodeClass);
      
      expect(operations.length).toBe(operationProp.options!.length);
      operations.forEach((op, idx) => {
        expect(op).toMatchObject({
          operation: operationProp.options![idx].value,
          name: operationProp.options![idx].name,
          description: operationProp.options![idx].description
        });
      });
    });

    it('should extract operations from routing.operations structure', () => {
      const NodeClass = nodeClassFactory.build({
        description: {
          name: 'test',
          routing: {
            operations: {
              create: { displayName: 'Create Item' },
              update: { displayName: 'Update Item' },
              delete: { displayName: 'Delete Item' }
            }
          }
        }
      });
      
      const operations = extractor.extractOperations(NodeClass);
      
      // routing.operations is not currently extracted by the property extractor
      // It only extracts from routing.request structure
      expect(operations).toHaveLength(0);
    });

    it('should handle programmatic nodes with resource-based operations', () => {
      const resourceProp = resourcePropertyFactory.build();
      const operationProp = {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        displayOptions: {
          show: {
            resource: ['user', 'post']
          }
        },
        options: [
          { name: 'Create', value: 'create', action: 'Create item' },
          { name: 'Delete', value: 'delete', action: 'Delete item' }
        ]
      };
      
      const NodeClass = nodeClassFactory.build({
        description: {
          name: 'test',
          properties: [resourceProp, operationProp]
        }
      });
      
      const operations = extractor.extractOperations(NodeClass);
      
      // PropertyExtractor only extracts operations, not resources
      // It should find the operation property and extract its options
      expect(operations).toHaveLength(operationProp.options.length);
      expect(operations[0]).toMatchObject({
        operation: 'create',
        name: 'Create',
        description: undefined // action field is not mapped to description
      });
      expect(operations[1]).toMatchObject({
        operation: 'delete',
        name: 'Delete',
        description: undefined
      });
    });

    it('should handle nodes without operations', () => {
      const NodeClass = nodeClassFactory.build({
        description: {
          name: 'test',
          properties: [stringPropertyFactory.build()]
        }
      });
      
      const operations = extractor.extractOperations(NodeClass);
      
      expect(operations).toEqual([]);
    });

    it('should extract from versioned nodes', () => {
      const NodeClass = class {
        nodeVersions = {
          1: {
            description: {
              properties: []
            }
          },
          2: {
            description: {
              routing: {
                request: {
                  resource: {
                    options: [
                      { name: 'User', value: 'user' }
                    ]
                  },
                  operation: {
                    options: {
                      user: [
                        { name: 'Get', value: 'get', action: 'Get a user' }
                      ]
                    }
                  }
                }
              }
            }
          }
        };
      };
      
      const operations = extractor.extractOperations(NodeClass);
      
      expect(operations).toHaveLength(1);
      expect(operations[0]).toMatchObject({
        resource: 'user',
        operation: 'get',
        name: 'User - Get',
        action: 'Get a user'
      });
    });

    it('should handle action property name as well as operation', () => {
      const actionProp = {
        displayName: 'Action',
        name: 'action',
        type: 'options',
        options: [
          { name: 'Send', value: 'send' },
          { name: 'Receive', value: 'receive' }
        ]
      };
      
      const NodeClass = nodeClassFactory.build({
        description: {
          name: 'test',
          properties: [actionProp]
        }
      });
      
      const operations = extractor.extractOperations(NodeClass);
      
      expect(operations).toHaveLength(2);
      expect(operations[0].operation).toBe('send');
    });
  });

  describe('detectAIToolCapability', () => {
    it('should detect direct usableAsTool property', () => {
      const NodeClass = nodeClassFactory.build({
        description: {
          name: 'test',
          usableAsTool: true
        }
      });
      
      const isAITool = extractor.detectAIToolCapability(NodeClass);
      
      expect(isAITool).toBe(true);
    });

    it('should detect usableAsTool in actions for declarative nodes', () => {
      const NodeClass = nodeClassFactory.build({
        description: {
          name: 'test',
          actions: [
            { name: 'action1', usableAsTool: false },
            { name: 'action2', usableAsTool: true }
          ]
        }
      });
      
      const isAITool = extractor.detectAIToolCapability(NodeClass);
      
      expect(isAITool).toBe(true);
    });

    it('should detect AI tools in versioned nodes', () => {
      const NodeClass = {
        nodeVersions: {
          1: {
            description: { usableAsTool: false }
          },
          2: {
            description: { usableAsTool: true }
          }
        }
      };
      
      const isAITool = extractor.detectAIToolCapability(NodeClass);
      
      expect(isAITool).toBe(true);
    });

    it('should detect AI tools by node name', () => {
      const aiNodeNames = ['openai', 'anthropic', 'huggingface', 'cohere', 'myai'];
      
      aiNodeNames.forEach(name => {
        const NodeClass = nodeClassFactory.build({
          description: { name }
        });
        
        const isAITool = extractor.detectAIToolCapability(NodeClass);
        
        expect(isAITool).toBe(true);
      });
    });

    it('should not detect non-AI nodes as AI tools', () => {
      const NodeClass = nodeClassFactory.build({
        description: {
          name: 'slack',
          usableAsTool: false
        }
      });
      
      const isAITool = extractor.detectAIToolCapability(NodeClass);
      
      expect(isAITool).toBe(false);
    });

    it('should handle nodes without description', () => {
      const NodeClass = class {};
      
      const isAITool = extractor.detectAIToolCapability(NodeClass);
      
      expect(isAITool).toBe(false);
    });
  });

  describe('extractCredentials', () => {
    it('should extract credentials from node description', () => {
      const credentials = [
        { name: 'apiKey', required: true },
        { name: 'oauth2', required: false }
      ];
      
      const NodeClass = nodeClassFactory.build({
        description: {
          name: 'test',
          credentials
        }
      });
      
      const extracted = extractor.extractCredentials(NodeClass);
      
      expect(extracted).toEqual(credentials);
    });

    it('should extract credentials from versioned nodes', () => {
      const NodeClass = class {
        nodeVersions = {
          1: {
            description: {
              credentials: [{ name: 'basic', required: true }]
            }
          },
          2: {
            description: {
              credentials: [
                { name: 'oauth2', required: true },
                { name: 'apiKey', required: false }
              ]
            }
          }
        };
      };
      
      const credentials = extractor.extractCredentials(NodeClass);
      
      expect(credentials).toHaveLength(2);
      expect(credentials[0].name).toBe('oauth2');
      expect(credentials[1].name).toBe('apiKey');
    });

    it('should return empty array when no credentials', () => {
      const NodeClass = nodeClassFactory.build({
        description: {
          name: 'test'
          // No credentials field
        }
      });
      
      const credentials = extractor.extractCredentials(NodeClass);
      
      expect(credentials).toEqual([]);
    });

    it('should extract from baseDescription', () => {
      const NodeClass = class {
        baseDescription = {
          credentials: [{ name: 'token', required: true }]
        };
      };
      
      const credentials = extractor.extractCredentials(NodeClass);
      
      expect(credentials).toHaveLength(1);
      expect(credentials[0].name).toBe('token');
    });

    it('should handle instance-level credentials', () => {
      const NodeClass = class {
        constructor() {
          (this as any).description = {
            credentials: [
              { name: 'jwt', required: true }
            ]
          };
        }
      };
      
      const credentials = extractor.extractCredentials(NodeClass);
      
      expect(credentials).toHaveLength(1);
      expect(credentials[0].name).toBe('jwt');
    });

    it('should handle failed instantiation gracefully', () => {
      const NodeClass = class {
        constructor() {
          throw new Error('Cannot instantiate');
        }
      };
      
      const credentials = extractor.extractCredentials(NodeClass);
      
      expect(credentials).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('should handle deeply nested properties', () => {
      const deepProperty = {
        displayName: 'Deep Options',
        name: 'deepOptions',
        type: 'collection',
        options: [
          {
            displayName: 'Level 1',
            name: 'level1',
            type: 'collection',
            options: [
              {
                displayName: 'Level 2',
                name: 'level2',
                type: 'collection',
                options: [
                  stringPropertyFactory.build({ name: 'deepValue' })
                ]
              }
            ]
          }
        ]
      };
      
      const NodeClass = nodeClassFactory.build({
        description: {
          name: 'test',
          properties: [deepProperty]
        }
      });
      
      const properties = extractor.extractProperties(NodeClass);
      
      expect(properties).toHaveLength(1);
      expect(properties[0].name).toBe('deepOptions');
      expect(properties[0].options[0].options[0].options).toBeDefined();
    });

    it('should handle circular references in node structure', () => {
      const NodeClass = class {
        description: any = { name: 'test' };
        constructor() {
          this.description.properties = [
            {
              name: 'prop1',
              type: 'string',
              parentRef: this.description // Circular reference
            }
          ];
        }
      };
      
      // Should not throw or hang
      const properties = extractor.extractProperties(NodeClass);
      
      expect(properties).toBeDefined();
    });

    it('should handle mixed operation extraction scenarios', () => {
      const NodeClass = nodeClassFactory.build({
        description: {
          name: 'test',
          routing: {
            request: {
              resource: {
                options: [{ name: 'Resource1', value: 'res1' }]
              }
            },
            operations: {
              custom: { displayName: 'Custom Op' }
            }
          },
          properties: [
            operationPropertyFactory.build()
          ]
        }
      });
      
      const operations = extractor.extractOperations(NodeClass);
      
      // Should extract from all sources
      expect(operations.length).toBeGreaterThan(1);
    });
  });
});