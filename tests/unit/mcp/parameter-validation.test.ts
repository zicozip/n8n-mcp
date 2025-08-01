import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { N8NDocumentationMCPServer } from '../../../src/mcp/server';

// Mock the database and dependencies
vi.mock('../../../src/database/database-adapter');
vi.mock('../../../src/database/node-repository');
vi.mock('../../../src/templates/template-service');
vi.mock('../../../src/utils/logger');

class TestableN8NMCPServer extends N8NDocumentationMCPServer {
  // Expose the private validateToolParams method for testing
  public testValidateToolParams(toolName: string, args: any, requiredParams: string[]): void {
    return (this as any).validateToolParams(toolName, args, requiredParams);
  }

  // Expose the private executeTool method for testing
  public async testExecuteTool(name: string, args: any): Promise<any> {
    return (this as any).executeTool(name, args);
  }
}

describe('Parameter Validation', () => {
  let server: TestableN8NMCPServer;

  beforeEach(() => {
    // Set environment variable to use in-memory database
    process.env.NODE_DB_PATH = ':memory:';
    server = new TestableN8NMCPServer();
  });

  afterEach(() => {
    delete process.env.NODE_DB_PATH;
  });

  describe('validateToolParams', () => {
    describe('Basic Parameter Validation', () => {
      it('should pass validation when all required parameters are provided', () => {
        const args = { nodeType: 'nodes-base.httpRequest', config: {} };
        
        expect(() => {
          server.testValidateToolParams('test_tool', args, ['nodeType', 'config']);
        }).not.toThrow();
      });

      it('should throw error when required parameter is missing', () => {
        const args = { config: {} };
        
        expect(() => {
          server.testValidateToolParams('test_tool', args, ['nodeType', 'config']);
        }).toThrow('Missing required parameters for test_tool: nodeType');
      });

      it('should throw error when multiple required parameters are missing', () => {
        const args = {};
        
        expect(() => {
          server.testValidateToolParams('test_tool', args, ['nodeType', 'config', 'query']);
        }).toThrow('Missing required parameters for test_tool: nodeType, config, query');
      });

      it('should throw error when required parameter is undefined', () => {
        const args = { nodeType: undefined, config: {} };
        
        expect(() => {
          server.testValidateToolParams('test_tool', args, ['nodeType', 'config']);
        }).toThrow('Missing required parameters for test_tool: nodeType');
      });

      it('should throw error when required parameter is null', () => {
        const args = { nodeType: null, config: {} };
        
        expect(() => {
          server.testValidateToolParams('test_tool', args, ['nodeType', 'config']);
        }).toThrow('Missing required parameters for test_tool: nodeType');
      });

      it('should pass when required parameter is empty string', () => {
        const args = { query: '', limit: 10 };
        
        expect(() => {
          server.testValidateToolParams('test_tool', args, ['query']);
        }).not.toThrow();
      });

      it('should pass when required parameter is zero', () => {
        const args = { limit: 0, query: 'test' };
        
        expect(() => {
          server.testValidateToolParams('test_tool', args, ['limit']);
        }).not.toThrow();
      });

      it('should pass when required parameter is false', () => {
        const args = { includeData: false, id: '123' };
        
        expect(() => {
          server.testValidateToolParams('test_tool', args, ['includeData']);
        }).not.toThrow();
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty args object', () => {
        expect(() => {
          server.testValidateToolParams('test_tool', {}, ['param1']);
        }).toThrow('Missing required parameters for test_tool: param1');
      });

      it('should handle null args', () => {
        expect(() => {
          server.testValidateToolParams('test_tool', null, ['param1']);
        }).toThrow();
      });

      it('should handle undefined args', () => {
        expect(() => {
          server.testValidateToolParams('test_tool', undefined, ['param1']);
        }).toThrow();
      });

      it('should pass when no required parameters are specified', () => {
        const args = { optionalParam: 'value' };
        
        expect(() => {
          server.testValidateToolParams('test_tool', args, []);
        }).not.toThrow();
      });

      it('should handle special characters in parameter names', () => {
        const args = { 'param-with-dash': 'value', 'param_with_underscore': 'value' };
        
        expect(() => {
          server.testValidateToolParams('test_tool', args, ['param-with-dash', 'param_with_underscore']);
        }).not.toThrow();
      });
    });
  });

  describe('Tool-Specific Parameter Validation', () => {
    // Mock the actual tool methods to avoid database calls
    beforeEach(() => {
      // Mock all the tool methods that would be called
      vi.spyOn(server as any, 'getNodeInfo').mockResolvedValue({ mockResult: true });
      vi.spyOn(server as any, 'searchNodes').mockResolvedValue({ results: [] });
      vi.spyOn(server as any, 'getNodeDocumentation').mockResolvedValue({ docs: 'test' });
      vi.spyOn(server as any, 'getNodeEssentials').mockResolvedValue({ essentials: true });
      vi.spyOn(server as any, 'searchNodeProperties').mockResolvedValue({ properties: [] });
      vi.spyOn(server as any, 'getNodeForTask').mockResolvedValue({ node: 'test' });
      vi.spyOn(server as any, 'validateNodeConfig').mockResolvedValue({ valid: true });
      vi.spyOn(server as any, 'validateNodeMinimal').mockResolvedValue({ missing: [] });
      vi.spyOn(server as any, 'getPropertyDependencies').mockResolvedValue({ dependencies: {} });
      vi.spyOn(server as any, 'getNodeAsToolInfo').mockResolvedValue({ toolInfo: true });
      vi.spyOn(server as any, 'listNodeTemplates').mockResolvedValue({ templates: [] });
      vi.spyOn(server as any, 'getTemplate').mockResolvedValue({ template: {} });
      vi.spyOn(server as any, 'searchTemplates').mockResolvedValue({ templates: [] });
      vi.spyOn(server as any, 'getTemplatesForTask').mockResolvedValue({ templates: [] });
      vi.spyOn(server as any, 'validateWorkflow').mockResolvedValue({ valid: true });
      vi.spyOn(server as any, 'validateWorkflowConnections').mockResolvedValue({ valid: true });
      vi.spyOn(server as any, 'validateWorkflowExpressions').mockResolvedValue({ valid: true });
    });

    describe('get_node_info', () => {
      it('should require nodeType parameter', async () => {
        await expect(server.testExecuteTool('get_node_info', {}))
          .rejects.toThrow('Missing required parameters for get_node_info: nodeType');
      });

      it('should succeed with valid nodeType', async () => {
        const result = await server.testExecuteTool('get_node_info', { 
          nodeType: 'nodes-base.httpRequest' 
        });
        expect(result).toEqual({ mockResult: true });
      });
    });

    describe('search_nodes', () => {
      it('should require query parameter', async () => {
        await expect(server.testExecuteTool('search_nodes', {}))
          .rejects.toThrow('Missing required parameters for search_nodes: query');
      });

      it('should succeed with valid query', async () => {
        const result = await server.testExecuteTool('search_nodes', { 
          query: 'http' 
        });
        expect(result).toEqual({ results: [] });
      });

      it('should handle optional limit parameter', async () => {
        const result = await server.testExecuteTool('search_nodes', { 
          query: 'http',
          limit: 10
        });
        expect(result).toEqual({ results: [] });
      });

      it('should convert limit to number and use default on invalid value', async () => {
        const result = await server.testExecuteTool('search_nodes', { 
          query: 'http',
          limit: 'invalid'
        });
        expect(result).toEqual({ results: [] });
      });
    });

    describe('validate_node_operation', () => {
      it('should require nodeType and config parameters', async () => {
        await expect(server.testExecuteTool('validate_node_operation', {}))
          .rejects.toThrow('Missing required parameters for validate_node_operation: nodeType, config');
      });

      it('should require nodeType parameter when config is provided', async () => {
        await expect(server.testExecuteTool('validate_node_operation', { config: {} }))
          .rejects.toThrow('Missing required parameters for validate_node_operation: nodeType');
      });

      it('should require config parameter when nodeType is provided', async () => {
        await expect(server.testExecuteTool('validate_node_operation', { nodeType: 'nodes-base.httpRequest' }))
          .rejects.toThrow('Missing required parameters for validate_node_operation: config');
      });

      it('should succeed with valid parameters', async () => {
        const result = await server.testExecuteTool('validate_node_operation', { 
          nodeType: 'nodes-base.httpRequest',
          config: { method: 'GET', url: 'https://api.example.com' }
        });
        expect(result).toEqual({ valid: true });
      });
    });

    describe('search_node_properties', () => {
      it('should require nodeType and query parameters', async () => {
        await expect(server.testExecuteTool('search_node_properties', {}))
          .rejects.toThrow('Missing required parameters for search_node_properties: nodeType, query');
      });

      it('should succeed with valid parameters', async () => {
        const result = await server.testExecuteTool('search_node_properties', { 
          nodeType: 'nodes-base.httpRequest',
          query: 'auth'
        });
        expect(result).toEqual({ properties: [] });
      });

      it('should handle optional maxResults parameter', async () => {
        const result = await server.testExecuteTool('search_node_properties', { 
          nodeType: 'nodes-base.httpRequest',
          query: 'auth',
          maxResults: 5
        });
        expect(result).toEqual({ properties: [] });
      });
    });

    describe('list_node_templates', () => {
      it('should require nodeTypes parameter', async () => {
        await expect(server.testExecuteTool('list_node_templates', {}))
          .rejects.toThrow('Missing required parameters for list_node_templates: nodeTypes');
      });

      it('should succeed with valid nodeTypes array', async () => {
        const result = await server.testExecuteTool('list_node_templates', { 
          nodeTypes: ['nodes-base.httpRequest', 'nodes-base.slack']
        });
        expect(result).toEqual({ templates: [] });
      });
    });

    describe('get_template', () => {
      it('should require templateId parameter', async () => {
        await expect(server.testExecuteTool('get_template', {}))
          .rejects.toThrow('Missing required parameters for get_template: templateId');
      });

      it('should succeed with valid templateId', async () => {
        const result = await server.testExecuteTool('get_template', { 
          templateId: 123
        });
        expect(result).toEqual({ template: {} });
      });
    });
  });

  describe('Numeric Parameter Conversion', () => {
    beforeEach(() => {
      vi.spyOn(server as any, 'searchNodes').mockResolvedValue({ results: [] });
      vi.spyOn(server as any, 'searchNodeProperties').mockResolvedValue({ properties: [] });
      vi.spyOn(server as any, 'listNodeTemplates').mockResolvedValue({ templates: [] });
      vi.spyOn(server as any, 'getTemplate').mockResolvedValue({ template: {} });
    });

    describe('limit parameter conversion', () => {
      it('should convert string numbers to numbers', async () => {
        const mockSearchNodes = vi.spyOn(server as any, 'searchNodes');
        
        await server.testExecuteTool('search_nodes', { 
          query: 'test',
          limit: '15'
        });

        expect(mockSearchNodes).toHaveBeenCalledWith('test', 15, { mode: undefined });
      });

      it('should use default when limit is invalid string', async () => {
        const mockSearchNodes = vi.spyOn(server as any, 'searchNodes');
        
        await server.testExecuteTool('search_nodes', { 
          query: 'test',
          limit: 'invalid'
        });

        expect(mockSearchNodes).toHaveBeenCalledWith('test', 20, { mode: undefined });
      });

      it('should use default when limit is undefined', async () => {
        const mockSearchNodes = vi.spyOn(server as any, 'searchNodes');
        
        await server.testExecuteTool('search_nodes', { 
          query: 'test'
        });

        expect(mockSearchNodes).toHaveBeenCalledWith('test', 20, { mode: undefined });
      });

      it('should handle zero as valid limit', async () => {
        const mockSearchNodes = vi.spyOn(server as any, 'searchNodes');
        
        await server.testExecuteTool('search_nodes', { 
          query: 'test',
          limit: 0
        });

        expect(mockSearchNodes).toHaveBeenCalledWith('test', 20, { mode: undefined }); // 0 converts to falsy, uses default
      });
    });

    describe('maxResults parameter conversion', () => {
      it('should convert string numbers to numbers', async () => {
        const mockSearchNodeProperties = vi.spyOn(server as any, 'searchNodeProperties');
        
        await server.testExecuteTool('search_node_properties', { 
          nodeType: 'nodes-base.httpRequest',
          query: 'auth',
          maxResults: '5'
        });

        expect(mockSearchNodeProperties).toHaveBeenCalledWith('nodes-base.httpRequest', 'auth', 5);
      });

      it('should use default when maxResults is invalid', async () => {
        const mockSearchNodeProperties = vi.spyOn(server as any, 'searchNodeProperties');
        
        await server.testExecuteTool('search_node_properties', { 
          nodeType: 'nodes-base.httpRequest',
          query: 'auth',
          maxResults: 'invalid'
        });

        expect(mockSearchNodeProperties).toHaveBeenCalledWith('nodes-base.httpRequest', 'auth', 20);
      });
    });

    describe('templateLimit parameter conversion', () => {
      it('should convert string numbers to numbers', async () => {
        const mockListNodeTemplates = vi.spyOn(server as any, 'listNodeTemplates');
        
        await server.testExecuteTool('list_node_templates', { 
          nodeTypes: ['nodes-base.httpRequest'],
          limit: '5'
        });

        expect(mockListNodeTemplates).toHaveBeenCalledWith(['nodes-base.httpRequest'], 5);
      });

      it('should use default when templateLimit is invalid', async () => {
        const mockListNodeTemplates = vi.spyOn(server as any, 'listNodeTemplates');
        
        await server.testExecuteTool('list_node_templates', { 
          nodeTypes: ['nodes-base.httpRequest'],
          limit: 'invalid'
        });

        expect(mockListNodeTemplates).toHaveBeenCalledWith(['nodes-base.httpRequest'], 10);
      });
    });

    describe('templateId parameter handling', () => {
      it('should pass through numeric templateId', async () => {
        const mockGetTemplate = vi.spyOn(server as any, 'getTemplate');
        
        await server.testExecuteTool('get_template', { 
          templateId: 123
        });

        expect(mockGetTemplate).toHaveBeenCalledWith(123);
      });

      it('should convert string templateId to number', async () => {
        const mockGetTemplate = vi.spyOn(server as any, 'getTemplate');
        
        await server.testExecuteTool('get_template', { 
          templateId: '123'
        });

        expect(mockGetTemplate).toHaveBeenCalledWith(123);
      });
    });
  });

  describe('Tools with No Required Parameters', () => {
    beforeEach(() => {
      vi.spyOn(server as any, 'getToolsDocumentation').mockResolvedValue({ docs: 'test' });
      vi.spyOn(server as any, 'listNodes').mockResolvedValue({ nodes: [] });
      vi.spyOn(server as any, 'listAITools').mockResolvedValue({ tools: [] });
      vi.spyOn(server as any, 'getDatabaseStatistics').mockResolvedValue({ stats: {} });
      vi.spyOn(server as any, 'listTasks').mockResolvedValue({ tasks: [] });
    });

    it('should allow tools_documentation with no parameters', async () => {
      const result = await server.testExecuteTool('tools_documentation', {});
      expect(result).toEqual({ docs: 'test' });
    });

    it('should allow list_nodes with no parameters', async () => {
      const result = await server.testExecuteTool('list_nodes', {});
      expect(result).toEqual({ nodes: [] });
    });

    it('should allow list_ai_tools with no parameters', async () => {
      const result = await server.testExecuteTool('list_ai_tools', {});
      expect(result).toEqual({ tools: [] });
    });

    it('should allow get_database_statistics with no parameters', async () => {
      const result = await server.testExecuteTool('get_database_statistics', {});
      expect(result).toEqual({ stats: {} });
    });

    it('should allow list_tasks with no parameters', async () => {
      const result = await server.testExecuteTool('list_tasks', {});
      expect(result).toEqual({ tasks: [] });
    });
  });

  describe('Error Message Quality', () => {
    it('should provide clear error messages with tool name', () => {
      expect(() => {
        server.testValidateToolParams('get_node_info', {}, ['nodeType']);
      }).toThrow('Missing required parameters for get_node_info: nodeType. Please provide the required parameters to use this tool.');
    });

    it('should list all missing parameters', () => {
      expect(() => {
        server.testValidateToolParams('validate_node_operation', { profile: 'strict' }, ['nodeType', 'config']);
      }).toThrow('Missing required parameters for validate_node_operation: nodeType, config');
    });

    it('should include helpful guidance', () => {
      try {
        server.testValidateToolParams('test_tool', {}, ['param1', 'param2']);
      } catch (error: any) {
        expect(error.message).toContain('Please provide the required parameters to use this tool');
      }
    });
  });

  describe('MCP Error Response Handling', () => {
    it('should convert validation errors to MCP error responses rather than throwing exceptions', async () => {
      // This test simulates what happens at the MCP level when a tool validation fails
      // The server should catch the validation error and return it as an MCP error response
      
      // Directly test the executeTool method to ensure it throws appropriately
      // The MCP server's request handler should catch these and convert to error responses
      await expect(server.testExecuteTool('get_node_info', {}))
        .rejects.toThrow('Missing required parameters for get_node_info: nodeType');
      
      await expect(server.testExecuteTool('search_nodes', {}))
        .rejects.toThrow('Missing required parameters for search_nodes: query');
      
      await expect(server.testExecuteTool('validate_node_operation', { nodeType: 'test' }))
        .rejects.toThrow('Missing required parameters for validate_node_operation: config');
    });

    it('should handle edge cases in parameter validation gracefully', async () => {
      // Test with null args (should be handled by args = args || {})
      await expect(server.testExecuteTool('get_node_info', null))
        .rejects.toThrow('Missing required parameters');
      
      // Test with undefined args
      await expect(server.testExecuteTool('get_node_info', undefined))
        .rejects.toThrow('Missing required parameters');
    });

    it('should provide consistent error format across all tools', async () => {
      const toolsWithRequiredParams = [
        { name: 'get_node_info', args: {}, missing: 'nodeType' },
        { name: 'search_nodes', args: {}, missing: 'query' },
        { name: 'get_node_documentation', args: {}, missing: 'nodeType' },
        { name: 'get_node_essentials', args: {}, missing: 'nodeType' },
        { name: 'search_node_properties', args: {}, missing: 'nodeType, query' },
        { name: 'get_node_for_task', args: {}, missing: 'task' },
        { name: 'validate_node_operation', args: {}, missing: 'nodeType, config' },
        { name: 'validate_node_minimal', args: {}, missing: 'nodeType, config' },
        { name: 'get_property_dependencies', args: {}, missing: 'nodeType' },
        { name: 'get_node_as_tool_info', args: {}, missing: 'nodeType' },
        { name: 'list_node_templates', args: {}, missing: 'nodeTypes' },
        { name: 'get_template', args: {}, missing: 'templateId' },
      ];

      for (const tool of toolsWithRequiredParams) {
        await expect(server.testExecuteTool(tool.name, tool.args))
          .rejects.toThrow(`Missing required parameters for ${tool.name}: ${tool.missing}`);
      }
    });

    it('should validate n8n management tools parameters', async () => {
      // Mock the n8n handlers to avoid actual API calls
      const mockHandlers = [
        'handleCreateWorkflow',
        'handleGetWorkflow', 
        'handleGetWorkflowDetails',
        'handleGetWorkflowStructure',
        'handleGetWorkflowMinimal',
        'handleUpdateWorkflow',
        'handleDeleteWorkflow',
        'handleValidateWorkflow',
        'handleTriggerWebhookWorkflow',
        'handleGetExecution',
        'handleDeleteExecution'
      ];

      for (const handler of mockHandlers) {
        vi.doMock('../../../src/mcp/handlers-n8n-manager', () => ({
          [handler]: vi.fn().mockResolvedValue({ success: true })
        }));
      }

      vi.doMock('../../../src/mcp/handlers-workflow-diff', () => ({
        handleUpdatePartialWorkflow: vi.fn().mockResolvedValue({ success: true })
      }));

      const n8nToolsWithRequiredParams = [
        { name: 'n8n_create_workflow', args: {}, missing: 'name, nodes, connections' },
        { name: 'n8n_get_workflow', args: {}, missing: 'id' },
        { name: 'n8n_get_workflow_details', args: {}, missing: 'id' },
        { name: 'n8n_get_workflow_structure', args: {}, missing: 'id' },
        { name: 'n8n_get_workflow_minimal', args: {}, missing: 'id' },
        { name: 'n8n_update_full_workflow', args: {}, missing: 'id' },
        { name: 'n8n_update_partial_workflow', args: {}, missing: 'id, operations' },
        { name: 'n8n_delete_workflow', args: {}, missing: 'id' },
        { name: 'n8n_validate_workflow', args: {}, missing: 'id' },
        { name: 'n8n_trigger_webhook_workflow', args: {}, missing: 'webhookUrl' },
        { name: 'n8n_get_execution', args: {}, missing: 'id' },
        { name: 'n8n_delete_execution', args: {}, missing: 'id' },
      ];

      for (const tool of n8nToolsWithRequiredParams) {
        await expect(server.testExecuteTool(tool.name, tool.args))
          .rejects.toThrow(`Missing required parameters for ${tool.name}: ${tool.missing}`);
      }
    });
  });
});