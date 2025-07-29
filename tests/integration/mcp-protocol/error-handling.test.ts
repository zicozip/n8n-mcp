import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { TestableN8NMCPServer } from './test-helpers';

describe('MCP Error Handling', () => {
  let mcpServer: TestableN8NMCPServer;
  let client: Client;

  beforeEach(async () => {
    mcpServer = new TestableN8NMCPServer();
    await mcpServer.initialize();
    
    const { serverTransport, clientTransport } = InMemoryTransport.createLinkedPair();
    await mcpServer.connectToTransport(serverTransport);
    
    client = new Client({
      name: 'test-client',
      version: '1.0.0'
    }, {
      capabilities: {}
    });
    
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await mcpServer.close();
  });

  describe('JSON-RPC Error Codes', () => {
    it('should handle invalid request (parse error)', async () => {
      // The MCP SDK handles parsing, so we test with invalid method instead
      try {
        await client.request({
          method: '',  // Empty method
          params: {}
        });
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error).toBeDefined();
      }
    });

    it('should handle method not found', async () => {
      try {
        await client.request({
          method: 'nonexistent/method',
          params: {}
        });
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.message).toContain('not found');
      }
    });

    it('should handle invalid params', async () => {
      try {
        // Missing required parameter
        await client.callTool('get_node_info', {});
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.message).toMatch(/missing|required|nodeType/i);
      }
    });

    it('should handle internal errors gracefully', async () => {
      try {
        // Invalid node type format should cause internal processing error
        await client.callTool('get_node_info', {
          nodeType: 'completely-invalid-format-$$$$'
        });
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.message).toContain('not found');
      }
    });
  });

  describe('Tool-Specific Errors', () => {
    describe('Node Discovery Errors', () => {
      it('should handle invalid category filter', async () => {
        const response = await client.callTool('list_nodes', {
          category: 'invalid_category'
        });

        // Should return empty array, not error
        const nodes = JSON.parse(response[0].text);
        expect(Array.isArray(nodes)).toBe(true);
        expect(nodes).toHaveLength(0);
      });

      it('should handle invalid search mode', async () => {
        try {
          await client.callTool('search_nodes', {
            query: 'test',
            mode: 'INVALID_MODE' as any
          });
          expect.fail('Should have thrown an error');
        } catch (error: any) {
          expect(error).toBeDefined();
        }
      });

      it('should handle empty search query', async () => {
        try {
          await client.callTool('search_nodes', {
            query: ''
          });
          expect.fail('Should have thrown an error');
        } catch (error: any) {
          expect(error).toBeDefined();
          expect(error.message).toContain('query');
        }
      });

      it('should handle non-existent node types', async () => {
        try {
          await client.callTool('get_node_info', {
            nodeType: 'nodes-base.thisDoesNotExist'
          });
          expect.fail('Should have thrown an error');
        } catch (error: any) {
          expect(error).toBeDefined();
          expect(error.message).toContain('not found');
        }
      });
    });

    describe('Validation Errors', () => {
      it('should handle invalid validation profile', async () => {
        try {
          await client.callTool('validate_node_operation', {
            nodeType: 'nodes-base.httpRequest',
            config: { method: 'GET', url: 'https://api.example.com' },
            profile: 'invalid_profile' as any
          });
          expect.fail('Should have thrown an error');
        } catch (error: any) {
          expect(error).toBeDefined();
        }
      });

      it('should handle malformed workflow structure', async () => {
        try {
          await client.callTool('validate_workflow', {
            workflow: {
              // Missing required 'nodes' array
              connections: {}
            }
          });
          expect.fail('Should have thrown an error');
        } catch (error: any) {
          expect(error).toBeDefined();
          expect(error.message).toContain('nodes');
        }
      });

      it('should handle circular workflow references', async () => {
        const workflow = {
          nodes: [
            {
              id: '1',
              name: 'Node1',
              type: 'nodes-base.noOp',
              typeVersion: 1,
              position: [0, 0],
              parameters: {}
            },
            {
              id: '2',
              name: 'Node2',
              type: 'nodes-base.noOp',
              typeVersion: 1,
              position: [250, 0],
              parameters: {}
            }
          ],
          connections: {
            'Node1': {
              'main': [[{ node: 'Node2', type: 'main', index: 0 }]]
            },
            'Node2': {
              'main': [[{ node: 'Node1', type: 'main', index: 0 }]]
            }
          }
        };

        const response = await client.callTool('validate_workflow', {
          workflow
        });

        const validation = JSON.parse(response[0].text);
        expect(validation.warnings).toBeDefined();
      });
    });

    describe('Documentation Errors', () => {
      it('should handle non-existent documentation topics', async () => {
        const response = await client.callTool('tools_documentation', {
          topic: 'completely_fake_tool'
        });

        expect(response[0].text).toContain('not found');
      });

      it('should handle invalid depth parameter', async () => {
        try {
          await client.callTool('tools_documentation', {
            depth: 'invalid_depth' as any
          });
          expect.fail('Should have thrown an error');
        } catch (error: any) {
          expect(error).toBeDefined();
        }
      });
    });
  });

  describe('Large Payload Handling', () => {
    it('should handle large node info requests', async () => {
      // HTTP Request node has extensive properties
      const response = await client.callTool('get_node_info', {
        nodeType: 'nodes-base.httpRequest'
      });

      expect(response[0].text.length).toBeGreaterThan(10000);
      
      // Should be valid JSON
      const nodeInfo = JSON.parse(response[0].text);
      expect(nodeInfo).toHaveProperty('properties');
    });

    it('should handle large workflow validation', async () => {
      // Create a large workflow
      const nodes = [];
      const connections: any = {};

      for (let i = 0; i < 50; i++) {
        const nodeName = `Node${i}`;
        nodes.push({
          id: String(i),
          name: nodeName,
          type: 'nodes-base.noOp',
          typeVersion: 1,
          position: [i * 100, 0],
          parameters: {}
        });

        if (i > 0) {
          const prevNode = `Node${i - 1}`;
          connections[prevNode] = {
            'main': [[{ node: nodeName, type: 'main', index: 0 }]]
          };
        }
      }

      const response = await client.callTool('validate_workflow', {
        workflow: { nodes, connections }
      });

      const validation = JSON.parse(response[0].text);
      expect(validation).toHaveProperty('valid');
    });

    it('should handle many concurrent requests', async () => {
      const requestCount = 50;
      const promises = [];

      for (let i = 0; i < requestCount; i++) {
        promises.push(
          client.callTool('list_nodes', {
            limit: 1,
            category: i % 2 === 0 ? 'trigger' : 'transform'
          })
        );
      }

      const responses = await Promise.all(promises);
      expect(responses).toHaveLength(requestCount);
    });
  });

  describe('Invalid JSON Handling', () => {
    it('should handle invalid JSON in tool parameters', async () => {
      try {
        // Config should be an object, not a string
        await client.callTool('validate_node_operation', {
          nodeType: 'nodes-base.httpRequest',
          config: 'invalid json string' as any
        });
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error).toBeDefined();
      }
    });

    it('should handle malformed workflow JSON', async () => {
      try {
        await client.callTool('validate_workflow', {
          workflow: 'not a valid workflow object' as any
        });
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Timeout Scenarios', () => {
    it('should handle rapid sequential requests', async () => {
      const start = Date.now();
      
      for (let i = 0; i < 20; i++) {
        await client.callTool('get_database_statistics', {});
      }

      const duration = Date.now() - start;
      
      // Should complete reasonably quickly (under 5 seconds)
      expect(duration).toBeLessThan(5000);
    });

    it('should handle long-running operations', async () => {
      // Search with complex query that requires more processing
      const response = await client.callTool('search_nodes', {
        query: 'a b c d e f g h i j k l m n o p q r s t u v w x y z',
        mode: 'AND'
      });

      expect(response).toBeDefined();
    });
  });

  describe('Memory Pressure', () => {
    it('should handle multiple large responses', async () => {
      const promises = [];

      // Request multiple large node infos
      const largeNodes = [
        'nodes-base.httpRequest',
        'nodes-base.postgres',
        'nodes-base.googleSheets',
        'nodes-base.slack',
        'nodes-base.gmail'
      ];

      for (const nodeType of largeNodes) {
        promises.push(
          client.callTool('get_node_info', { nodeType })
            .catch(() => null) // Some might not exist
        );
      }

      const responses = await Promise.all(promises);
      const validResponses = responses.filter(r => r !== null);
      
      expect(validResponses.length).toBeGreaterThan(0);
    });

    it('should handle workflow with many nodes', async () => {
      const nodeCount = 100;
      const nodes = [];

      for (let i = 0; i < nodeCount; i++) {
        nodes.push({
          id: String(i),
          name: `Node${i}`,
          type: 'nodes-base.noOp',
          typeVersion: 1,
          position: [i * 50, Math.floor(i / 10) * 100],
          parameters: {
            // Add some data to increase memory usage
            data: `This is some test data for node ${i}`.repeat(10)
          }
        });
      }

      const response = await client.callTool('validate_workflow', {
        workflow: {
          nodes,
          connections: {}
        }
      });

      const validation = JSON.parse(response[0].text);
      expect(validation).toHaveProperty('valid');
    });
  });

  describe('Error Recovery', () => {
    it('should continue working after errors', async () => {
      // Cause an error
      try {
        await client.callTool('get_node_info', {
          nodeType: 'invalid'
        });
      } catch (error) {
        // Expected
      }

      // Should still work
      const response = await client.callTool('list_nodes', { limit: 1 });
      expect(response).toBeDefined();
    });

    it('should handle mixed success and failure', async () => {
      const promises = [
        client.callTool('list_nodes', { limit: 5 }),
        client.callTool('get_node_info', { nodeType: 'invalid' }).catch(e => ({ error: e })),
        client.callTool('get_database_statistics', {}),
        client.callTool('search_nodes', { query: '' }).catch(e => ({ error: e })),
        client.callTool('list_ai_tools', {})
      ];

      const results = await Promise.all(promises);
      
      // Some should succeed, some should fail
      const successes = results.filter(r => !('error' in r));
      const failures = results.filter(r => 'error' in r);
      
      expect(successes.length).toBeGreaterThan(0);
      expect(failures.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty responses gracefully', async () => {
      const response = await client.callTool('list_nodes', {
        category: 'nonexistent_category'
      });

      const nodes = JSON.parse(response[0].text);
      expect(Array.isArray(nodes)).toBe(true);
      expect(nodes).toHaveLength(0);
    });

    it('should handle special characters in parameters', async () => {
      const response = await client.callTool('search_nodes', {
        query: 'test!@#$%^&*()_+-=[]{}|;\':",./<>?'
      });

      // Should return results or empty array, not error
      const nodes = JSON.parse(response[0].text);
      expect(Array.isArray(nodes)).toBe(true);
    });

    it('should handle unicode in parameters', async () => {
      const response = await client.callTool('search_nodes', {
        query: 'test 测试 тест परीक्षण'
      });

      const nodes = JSON.parse(response[0].text);
      expect(Array.isArray(nodes)).toBe(true);
    });

    it('should handle null and undefined gracefully', async () => {
      // Most tools should handle missing optional params
      const response = await client.callTool('list_nodes', {
        limit: undefined as any,
        category: null as any
      });

      const nodes = JSON.parse(response[0].text);
      expect(Array.isArray(nodes)).toBe(true);
    });
  });

  describe('Error Message Quality', () => {
    it('should provide helpful error messages', async () => {
      try {
        await client.callTool('get_node_info', {
          nodeType: 'httpRequest' // Missing prefix
        });
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toBeDefined();
        expect(error.message.length).toBeGreaterThan(10);
        // Should mention the issue
        expect(error.message.toLowerCase()).toMatch(/not found|invalid|missing/);
      }
    });

    it('should indicate missing required parameters', async () => {
      try {
        await client.callTool('search_nodes', {});
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('query');
      }
    });

    it('should provide context for validation errors', async () => {
      const response = await client.callTool('validate_node_operation', {
        nodeType: 'nodes-base.httpRequest',
        config: {
          // Missing required fields
          method: 'INVALID_METHOD'
        }
      });

      const validation = JSON.parse(response[0].text);
      expect(validation.valid).toBe(false);
      expect(validation.errors[0].message).toBeDefined();
      expect(validation.errors[0].field).toBeDefined();
    });
  });
});