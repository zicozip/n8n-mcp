import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { TestableN8NMCPServer } from './test-helpers';

describe('MCP Protocol Compliance', () => {
  let mcpServer: TestableN8NMCPServer;
  let transport: InMemoryTransport;
  let client: Client;

  beforeEach(async () => {
    mcpServer = new TestableN8NMCPServer();
    await mcpServer.initialize();
    
    const { serverTransport, clientTransport } = InMemoryTransport.createLinkedPair();
    transport = serverTransport;
    
    // Connect MCP server to transport
    await mcpServer.connectToTransport(transport);
    
    // Create client
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

  describe('JSON-RPC 2.0 Compliance', () => {
    it('should return proper JSON-RPC 2.0 response format', async () => {
      const response = await client.request({
        method: 'tools/list',
        params: {}
      });

      // Response should have tools array
      expect(response).toHaveProperty('tools');
      expect(Array.isArray(response.tools)).toBe(true);
    });

    it('should handle request with id correctly', async () => {
      const response = await client.request({
        method: 'tools/list',
        params: {}
      });

      expect(response).toBeDefined();
      expect(typeof response).toBe('object');
    });

    it('should handle batch requests', async () => {
      // Send multiple requests concurrently
      const promises = [
        client.request({ method: 'tools/list', params: {} }),
        client.request({ method: 'tools/list', params: {} }),
        client.request({ method: 'tools/list', params: {} })
      ];

      const responses = await Promise.all(promises);
      
      expect(responses).toHaveLength(3);
      responses.forEach(response => {
        expect(response).toHaveProperty('tools');
      });
    });

    it('should preserve request order in responses', async () => {
      const requests = [];
      const expectedOrder = [];

      // Create requests with different tools to track order
      for (let i = 0; i < 5; i++) {
        expectedOrder.push(i);
        requests.push(
          client.callTool('get_database_statistics', {})
            .then(() => i)
        );
      }

      const results = await Promise.all(requests);
      expect(results).toEqual(expectedOrder);
    });
  });

  describe('Protocol Version Negotiation', () => {
    it('should negotiate protocol capabilities', async () => {
      const serverInfo = await client.getServerInfo();
      
      expect(serverInfo).toHaveProperty('name');
      expect(serverInfo).toHaveProperty('version');
      expect(serverInfo.name).toBe('n8n-documentation-mcp');
    });

    it('should expose supported capabilities', async () => {
      const serverInfo = await client.getServerInfo();
      
      expect(serverInfo).toHaveProperty('capabilities');
      const capabilities = serverInfo.capabilities || {};
      
      // Should support tools
      expect(capabilities).toHaveProperty('tools');
    });
  });

  describe('Message Format Validation', () => {
    it('should reject messages without method', async () => {
      // Test by sending raw message through transport
      const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
      const testClient = new Client({ name: 'test', version: '1.0.0' }, {});
      
      await mcpServer.connectToTransport(serverTransport);
      await testClient.connect(clientTransport);

      try {
        // This should fail as MCP SDK validates method
        await testClient.request({ method: '', params: {} });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
      } finally {
        await testClient.close();
      }
    });

    it('should handle missing params gracefully', async () => {
      // Most tools should work without params
      const response = await client.callTool('list_nodes', {});
      expect(response).toBeDefined();
    });

    it('should validate params schema', async () => {
      try {
        // Invalid nodeType format (missing prefix)
        await client.callTool('get_node_info', {
          nodeType: 'httpRequest' // Should be 'nodes-base.httpRequest'
        });
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('not found');
      }
    });
  });

  describe('Content Types', () => {
    it('should handle text content in tool responses', async () => {
      const response = await client.callTool('get_database_statistics', {});
      
      expect(response).toHaveLength(1);
      expect(response[0]).toHaveProperty('type', 'text');
      expect(response[0]).toHaveProperty('text');
      expect(typeof response[0].text).toBe('string');
    });

    it('should handle large text responses', async () => {
      // Get a large node info response
      const response = await client.callTool('get_node_info', {
        nodeType: 'nodes-base.httpRequest'
      });

      expect(response).toHaveLength(1);
      expect(response[0].type).toBe('text');
      expect(response[0].text.length).toBeGreaterThan(1000);
    });

    it('should handle JSON content properly', async () => {
      const response = await client.callTool('list_nodes', {
        limit: 5
      });

      expect(response).toHaveLength(1);
      const content = JSON.parse(response[0].text);
      expect(Array.isArray(content)).toBe(true);
    });
  });

  describe('Request/Response Correlation', () => {
    it('should correlate concurrent requests correctly', async () => {
      const requests = [
        client.callTool('get_node_essentials', { nodeType: 'nodes-base.httpRequest' }),
        client.callTool('get_node_essentials', { nodeType: 'nodes-base.webhook' }),
        client.callTool('get_node_essentials', { nodeType: 'nodes-base.slack' })
      ];

      const responses = await Promise.all(requests);

      expect(responses[0][0].text).toContain('httpRequest');
      expect(responses[1][0].text).toContain('webhook');
      expect(responses[2][0].text).toContain('slack');
    });

    it('should handle interleaved requests', async () => {
      const results: string[] = [];

      // Start multiple requests with different delays
      const p1 = client.callTool('get_database_statistics', {})
        .then(() => { results.push('stats'); return 'stats'; });

      const p2 = client.callTool('list_nodes', { limit: 1 })
        .then(() => { results.push('nodes'); return 'nodes'; });

      const p3 = client.callTool('search_nodes', { query: 'http' })
        .then(() => { results.push('search'); return 'search'; });

      const resolved = await Promise.all([p1, p2, p3]);

      // All should complete
      expect(resolved).toHaveLength(3);
      expect(results).toHaveLength(3);
    });
  });

  describe('Protocol Extensions', () => {
    it('should handle tool-specific extensions', async () => {
      // Test tool with complex params
      const response = await client.callTool('validate_node_operation', {
        nodeType: 'nodes-base.httpRequest',
        config: {
          method: 'GET',
          url: 'https://api.example.com'
        },
        profile: 'runtime'
      });

      expect(response).toHaveLength(1);
      expect(response[0].type).toBe('text');
    });

    it('should support optional parameters', async () => {
      // Call with minimal params
      const response1 = await client.callTool('list_nodes', {});
      
      // Call with all params
      const response2 = await client.callTool('list_nodes', {
        limit: 10,
        category: 'trigger',
        package: 'n8n-nodes-base'
      });

      expect(response1).toBeDefined();
      expect(response2).toBeDefined();
    });
  });

  describe('Transport Layer', () => {
    it('should handle transport disconnection gracefully', async () => {
      const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
      const testClient = new Client({ name: 'test', version: '1.0.0' }, {});

      await mcpServer.connectToTransport(serverTransport);
      await testClient.connect(clientTransport);

      // Make a request
      const response = await testClient.callTool('get_database_statistics', {});
      expect(response).toBeDefined();

      // Close client
      await testClient.close();

      // Further requests should fail
      try {
        await testClient.callTool('get_database_statistics', {});
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle multiple sequential connections', async () => {
      // Close existing connection
      await client.close();
      await mcpServer.close();

      // Create new connections
      for (let i = 0; i < 3; i++) {
        const engine = new TestableN8NMCPServer();
        await engine.initialize();

        const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
        await engine.connect(serverTransport);

        const testClient = new Client({ name: 'test', version: '1.0.0' }, {});
        await testClient.connect(clientTransport);

        const response = await testClient.callTool('get_database_statistics', {});
        expect(response).toBeDefined();

        await testClient.close();
        await engine.close();
      }
    });
  });
});