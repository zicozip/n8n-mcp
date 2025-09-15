import { describe, it, expect } from 'vitest';
import { n8nDocumentationToolsFinal } from '@/mcp/tools';
import { z } from 'zod';

describe('n8nDocumentationToolsFinal', () => {
  describe('Tool Structure Validation', () => {
    it('should have all required properties for each tool', () => {
      n8nDocumentationToolsFinal.forEach(tool => {
        // Check required properties exist
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');

        // Check property types
        expect(typeof tool.name).toBe('string');
        expect(typeof tool.description).toBe('string');
        expect(tool.inputSchema).toBeTypeOf('object');

        // Name should be non-empty
        expect(tool.name.length).toBeGreaterThan(0);
        
        // Description should be meaningful
        expect(tool.description.length).toBeGreaterThan(10);
      });
    });

    it('should have unique tool names', () => {
      const names = n8nDocumentationToolsFinal.map(tool => tool.name);
      const uniqueNames = new Set(names);
      expect(names.length).toBe(uniqueNames.size);
    });

    it('should have valid JSON Schema for all inputSchemas', () => {
      // Define a minimal JSON Schema validator using Zod
      const jsonSchemaValidator = z.object({
        type: z.literal('object'),
        properties: z.record(z.any()).optional(),
        required: z.array(z.string()).optional(),
      });

      n8nDocumentationToolsFinal.forEach(tool => {
        expect(() => {
          jsonSchemaValidator.parse(tool.inputSchema);
        }).not.toThrow();
      });
    });
  });

  describe('Individual Tool Validation', () => {
    describe('tools_documentation', () => {
      const tool = n8nDocumentationToolsFinal.find(t => t.name === 'tools_documentation');

      it('should exist', () => {
        expect(tool).toBeDefined();
      });

      it('should have correct schema', () => {
        expect(tool?.inputSchema).toMatchObject({
          type: 'object',
          properties: {
            topic: {
              type: 'string',
              description: expect.any(String)
            },
            depth: {
              type: 'string',
              enum: ['essentials', 'full'],
              description: expect.any(String),
              default: 'essentials'
            }
          }
        });
      });

      it('should have helpful description', () => {
        expect(tool?.description).toContain('documentation');
        expect(tool?.description).toContain('MCP tools');
      });
    });

    describe('list_nodes', () => {
      const tool = n8nDocumentationToolsFinal.find(t => t.name === 'list_nodes');

      it('should exist', () => {
        expect(tool).toBeDefined();
      });

      it('should have correct schema properties', () => {
        const properties = tool?.inputSchema.properties;
        expect(properties).toHaveProperty('package');
        expect(properties).toHaveProperty('category');
        expect(properties).toHaveProperty('developmentStyle');
        expect(properties).toHaveProperty('isAITool');
        expect(properties).toHaveProperty('limit');
      });

      it('should have correct defaults', () => {
        expect(tool?.inputSchema.properties.limit.default).toBe(50);
      });

      it('should have proper enum values', () => {
        expect(tool?.inputSchema.properties.developmentStyle.enum).toEqual(['declarative', 'programmatic']);
      });
    });

    describe('get_node_info', () => {
      const tool = n8nDocumentationToolsFinal.find(t => t.name === 'get_node_info');

      it('should exist', () => {
        expect(tool).toBeDefined();
      });

      it('should have nodeType as required parameter', () => {
        expect(tool?.inputSchema.required).toContain('nodeType');
      });

      it('should mention performance implications in description', () => {
        expect(tool?.description).toMatch(/100KB\+|large|full/i);
      });
    });

    describe('search_nodes', () => {
      const tool = n8nDocumentationToolsFinal.find(t => t.name === 'search_nodes');

      it('should exist', () => {
        expect(tool).toBeDefined();
      });

      it('should have query as required parameter', () => {
        expect(tool?.inputSchema.required).toContain('query');
      });

      it('should have mode enum with correct values', () => {
        expect(tool?.inputSchema.properties.mode.enum).toEqual(['OR', 'AND', 'FUZZY']);
        expect(tool?.inputSchema.properties.mode.default).toBe('OR');
      });

      it('should have limit with default value', () => {
        expect(tool?.inputSchema.properties.limit.default).toBe(20);
      });
    });

    describe('validate_workflow', () => {
      const tool = n8nDocumentationToolsFinal.find(t => t.name === 'validate_workflow');

      it('should exist', () => {
        expect(tool).toBeDefined();
      });

      it('should have workflow as required parameter', () => {
        expect(tool?.inputSchema.required).toContain('workflow');
      });

      it('should have options with correct validation settings', () => {
        const options = tool?.inputSchema.properties.options.properties;
        expect(options).toHaveProperty('validateNodes');
        expect(options).toHaveProperty('validateConnections');
        expect(options).toHaveProperty('validateExpressions');
        expect(options).toHaveProperty('profile');
      });

      it('should have correct profile enum values', () => {
        const profile = tool?.inputSchema.properties.options.properties.profile;
        expect(profile.enum).toEqual(['minimal', 'runtime', 'ai-friendly', 'strict']);
        expect(profile.default).toBe('runtime');
      });
    });

    describe('get_templates_for_task', () => {
      const tool = n8nDocumentationToolsFinal.find(t => t.name === 'get_templates_for_task');

      it('should exist', () => {
        expect(tool).toBeDefined();
      });

      it('should have task as required parameter', () => {
        expect(tool?.inputSchema.required).toContain('task');
      });

      it('should have correct task enum values', () => {
        const expectedTasks = [
          'ai_automation',
          'data_sync',
          'webhook_processing',
          'email_automation',
          'slack_integration',
          'data_transformation',
          'file_processing',
          'scheduling',
          'api_integration',
          'database_operations'
        ];
        expect(tool?.inputSchema.properties.task.enum).toEqual(expectedTasks);
      });
    });
  });

  describe('Tool Description Quality', () => {
    it('should have concise descriptions that fit in one line', () => {
      n8nDocumentationToolsFinal.forEach(tool => {
        // Descriptions should be informative but not overly long
        expect(tool.description.length).toBeLessThan(300);
      });
    });

    it('should include examples or key information in descriptions', () => {
      const toolsWithExamples = [
        'list_nodes',
        'get_node_info',
        'search_nodes',
        'get_node_essentials',
        'get_node_documentation'
      ];

      toolsWithExamples.forEach(toolName => {
        const tool = n8nDocumentationToolsFinal.find(t => t.name === toolName);
        // Should include either example usage, format information, or "nodes-base"
        expect(tool?.description).toMatch(/example|Example|format|Format|nodes-base|Common:/i);
      });
    });
  });

  describe('Schema Consistency', () => {
    it('should use consistent parameter naming', () => {
      const toolsWithNodeType = n8nDocumentationToolsFinal.filter(tool => 
        tool.inputSchema.properties?.nodeType
      );

      toolsWithNodeType.forEach(tool => {
        const nodeTypeParam = tool.inputSchema.properties.nodeType;
        expect(nodeTypeParam.type).toBe('string');
        // Should mention the prefix requirement
        expect(nodeTypeParam.description).toMatch(/nodes-base|prefix/i);
      });
    });

    it('should have consistent limit parameter defaults', () => {
      const toolsWithLimit = n8nDocumentationToolsFinal.filter(tool => 
        tool.inputSchema.properties?.limit
      );

      toolsWithLimit.forEach(tool => {
        const limitParam = tool.inputSchema.properties.limit;
        expect(limitParam.type).toBe('number');
        expect(limitParam.default).toBeDefined();
        expect(limitParam.default).toBeGreaterThan(0);
      });
    });
  });

  describe('Tool Categories Coverage', () => {
    it('should have tools for all major categories', () => {
      const categories = {
        discovery: ['list_nodes', 'search_nodes', 'list_ai_tools'],
        configuration: ['get_node_info', 'get_node_essentials', 'get_node_documentation'],
        validation: ['validate_node_operation', 'validate_workflow', 'validate_node_minimal'],
        templates: ['list_tasks', 'get_node_for_task', 'search_templates', 'list_templates', 'get_template', 'list_node_templates'],
        documentation: ['tools_documentation']
      };

      Object.entries(categories).forEach(([category, expectedTools]) => {
        expectedTools.forEach(toolName => {
          const tool = n8nDocumentationToolsFinal.find(t => t.name === toolName);
          expect(tool).toBeDefined();
        });
      });
    });
  });

  describe('Parameter Validation', () => {
    it('should have proper type definitions for all parameters', () => {
      const validTypes = ['string', 'number', 'boolean', 'object', 'array'];

      n8nDocumentationToolsFinal.forEach(tool => {
        if (tool.inputSchema.properties) {
          Object.entries(tool.inputSchema.properties).forEach(([paramName, param]) => {
            expect(validTypes).toContain(param.type);
            expect(param.description).toBeDefined();
          });
        }
      });
    });

    it('should mark required parameters correctly', () => {
      const toolsWithRequired = n8nDocumentationToolsFinal.filter(tool => 
        tool.inputSchema.required && tool.inputSchema.required.length > 0
      );

      toolsWithRequired.forEach(tool => {
        tool.inputSchema.required!.forEach(requiredParam => {
          expect(tool.inputSchema.properties).toHaveProperty(requiredParam);
        });
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle tools with no parameters', () => {
      const toolsWithNoParams = ['list_ai_tools', 'get_database_statistics'];
      
      toolsWithNoParams.forEach(toolName => {
        const tool = n8nDocumentationToolsFinal.find(t => t.name === toolName);
        expect(tool).toBeDefined();
        expect(Object.keys(tool?.inputSchema.properties || {}).length).toBe(0);
      });
    });

    it('should have array parameters defined correctly', () => {
      const toolsWithArrays = ['list_node_templates'];
      
      toolsWithArrays.forEach(toolName => {
        const tool = n8nDocumentationToolsFinal.find(t => t.name === toolName);
        const arrayParam = tool?.inputSchema.properties.nodeTypes;
        expect(arrayParam?.type).toBe('array');
        expect(arrayParam?.items).toBeDefined();
        expect(arrayParam?.items.type).toBe('string');
      });
    });
  });

  describe('New Template Tools', () => {
    describe('list_templates', () => {
      const tool = n8nDocumentationToolsFinal.find(t => t.name === 'list_templates');

      it('should exist and be properly defined', () => {
        expect(tool).toBeDefined();
        expect(tool?.description).toContain('minimal data');
      });

      it('should have correct parameters', () => {
        expect(tool?.inputSchema.properties).toHaveProperty('limit');
        expect(tool?.inputSchema.properties).toHaveProperty('offset');
        expect(tool?.inputSchema.properties).toHaveProperty('sortBy');

        const limitParam = tool?.inputSchema.properties.limit;
        expect(limitParam.type).toBe('number');
        expect(limitParam.minimum).toBe(1);
        expect(limitParam.maximum).toBe(100);

        const offsetParam = tool?.inputSchema.properties.offset;
        expect(offsetParam.type).toBe('number');
        expect(offsetParam.minimum).toBe(0);

        const sortByParam = tool?.inputSchema.properties.sortBy;
        expect(sortByParam.enum).toEqual(['views', 'created_at', 'name']);
      });

      it('should have no required parameters', () => {
        expect(tool?.inputSchema.required).toBeUndefined();
      });
    });

    describe('get_template (enhanced)', () => {
      const tool = n8nDocumentationToolsFinal.find(t => t.name === 'get_template');

      it('should exist and support mode parameter', () => {
        expect(tool).toBeDefined();
        expect(tool?.description).toContain('mode');
      });

      it('should have mode parameter with correct values', () => {
        expect(tool?.inputSchema.properties).toHaveProperty('mode');

        const modeParam = tool?.inputSchema.properties.mode;
        expect(modeParam.enum).toEqual(['nodes_only', 'structure', 'full']);
        expect(modeParam.default).toBe('full');
      });

      it('should require templateId parameter', () => {
        expect(tool?.inputSchema.required).toContain('templateId');
      });
    });

    describe('search_templates_by_metadata', () => {
      const tool = n8nDocumentationToolsFinal.find(t => t.name === 'search_templates_by_metadata');

      it('should exist in the tools array', () => {
        expect(tool).toBeDefined();
        expect(tool?.name).toBe('search_templates_by_metadata');
      });

      it('should have proper description', () => {
        expect(tool?.description).toContain('Search templates by AI-generated metadata');
        expect(tool?.description).toContain('category');
        expect(tool?.description).toContain('complexity');
      });

      it('should have correct input schema structure', () => {
        expect(tool?.inputSchema.type).toBe('object');
        expect(tool?.inputSchema.properties).toBeDefined();
        expect(tool?.inputSchema.required).toBeUndefined(); // All parameters are optional
      });

      it('should have category parameter with proper schema', () => {
        const categoryProp = tool?.inputSchema.properties?.category;
        expect(categoryProp).toBeDefined();
        expect(categoryProp.type).toBe('string');
        expect(categoryProp.description).toContain('category');
      });

      it('should have complexity parameter with enum values', () => {
        const complexityProp = tool?.inputSchema.properties?.complexity;
        expect(complexityProp).toBeDefined();
        expect(complexityProp.enum).toEqual(['simple', 'medium', 'complex']);
        expect(complexityProp.description).toContain('complexity');
      });

      it('should have time-based parameters with numeric constraints', () => {
        const maxTimeProp = tool?.inputSchema.properties?.maxSetupMinutes;
        const minTimeProp = tool?.inputSchema.properties?.minSetupMinutes;
        
        expect(maxTimeProp).toBeDefined();
        expect(maxTimeProp.type).toBe('number');
        expect(maxTimeProp.maximum).toBe(480);
        expect(maxTimeProp.minimum).toBe(5);
        
        expect(minTimeProp).toBeDefined();
        expect(minTimeProp.type).toBe('number');
        expect(minTimeProp.maximum).toBe(480);
        expect(minTimeProp.minimum).toBe(5);
      });

      it('should have service and audience parameters', () => {
        const serviceProp = tool?.inputSchema.properties?.requiredService;
        const audienceProp = tool?.inputSchema.properties?.targetAudience;
        
        expect(serviceProp).toBeDefined();
        expect(serviceProp.type).toBe('string');
        expect(serviceProp.description).toContain('service');
        
        expect(audienceProp).toBeDefined();
        expect(audienceProp.type).toBe('string');
        expect(audienceProp.description).toContain('audience');
      });

      it('should have pagination parameters', () => {
        const limitProp = tool?.inputSchema.properties?.limit;
        const offsetProp = tool?.inputSchema.properties?.offset;
        
        expect(limitProp).toBeDefined();
        expect(limitProp.type).toBe('number');
        expect(limitProp.default).toBe(20);
        expect(limitProp.maximum).toBe(100);
        expect(limitProp.minimum).toBe(1);
        
        expect(offsetProp).toBeDefined();
        expect(offsetProp.type).toBe('number');
        expect(offsetProp.default).toBe(0);
        expect(offsetProp.minimum).toBe(0);
      });

      it('should include all expected properties', () => {
        const properties = Object.keys(tool?.inputSchema.properties || {});
        const expectedProperties = [
          'category',
          'complexity', 
          'maxSetupMinutes',
          'minSetupMinutes',
          'requiredService',
          'targetAudience',
          'limit',
          'offset'
        ];
        
        expectedProperties.forEach(prop => {
          expect(properties).toContain(prop);
        });
      });

      it('should have appropriate additionalProperties setting', () => {
        expect(tool?.inputSchema.additionalProperties).toBe(false);
      });
    });

    describe('Enhanced pagination support', () => {
      const paginatedTools = ['list_node_templates', 'search_templates', 'get_templates_for_task', 'search_templates_by_metadata'];

      paginatedTools.forEach(toolName => {
        describe(toolName, () => {
          const tool = n8nDocumentationToolsFinal.find(t => t.name === toolName);

          it('should support limit parameter', () => {
            expect(tool?.inputSchema.properties).toHaveProperty('limit');
            const limitParam = tool?.inputSchema.properties.limit;
            expect(limitParam.type).toBe('number');
            expect(limitParam.minimum).toBeGreaterThanOrEqual(1);
            expect(limitParam.maximum).toBeGreaterThanOrEqual(50);
          });

          it('should support offset parameter', () => {
            expect(tool?.inputSchema.properties).toHaveProperty('offset');
            const offsetParam = tool?.inputSchema.properties.offset;
            expect(offsetParam.type).toBe('number');
            expect(offsetParam.minimum).toBe(0);
          });
        });
      });
    });
  });
});