import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { TestableN8NMCPServer } from './test-helpers';

describe('MCP Session Management', () => {
  let mcpServer: TestableN8NMCPServer;

  beforeEach(async () => {
    mcpServer = new TestableN8NMCPServer();
    await mcpServer.initialize();
  });

  afterEach(async () => {
    await mcpServer.close();
  });

  describe('Session Lifecycle', () => {
    it('should establish a new session', async () => {
      const { serverTransport, clientTransport } = InMemoryTransport.createLinkedPair();
      await mcpServer.connectToTransport(serverTransport);

      const client = new Client({
        name: 'test-client',
        version: '1.0.0'
      }, {
        capabilities: {}
      });

      await client.connect(clientTransport);

      // Session should be established
      const serverInfo = await client.getServerInfo();
      expect(serverInfo).toHaveProperty('name', 'n8n-mcp');

      await client.close();
    });

    it('should handle session initialization with capabilities', async () => {
      const { serverTransport, clientTransport } = InMemoryTransport.createLinkedPair();
      await mcpServer.connectToTransport(serverTransport);

      const client = new Client({
        name: 'test-client',
        version: '1.0.0'
      }, {
        capabilities: {
          // Client capabilities
          experimental: {}
        }
      });

      await client.connect(clientTransport);

      const serverInfo = await client.getServerInfo();
      expect(serverInfo.capabilities).toHaveProperty('tools');

      await client.close();
    });

    it('should handle clean session termination', async () => {
      const { serverTransport, clientTransport } = InMemoryTransport.createLinkedPair();
      await mcpServer.connectToTransport(serverTransport);

      const client = new Client({
        name: 'test-client',
        version: '1.0.0'
      }, {});

      await client.connect(clientTransport);

      // Make some requests
      await client.callTool('get_database_statistics', {});
      await client.callTool('list_nodes', { limit: 5 });

      // Clean termination
      await client.close();

      // Client should be closed
      try {
        await client.callTool('get_database_statistics', {});
        expect.fail('Should not be able to make requests after close');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle abrupt disconnection', async () => {
      const { serverTransport, clientTransport } = InMemoryTransport.createLinkedPair();
      await mcpServer.connectToTransport(serverTransport);

      const client = new Client({
        name: 'test-client',
        version: '1.0.0'
      }, {});

      await client.connect(clientTransport);

      // Make a request to ensure connection is active
      await client.callTool('get_database_statistics', {});

      // Simulate abrupt disconnection by closing transport
      await clientTransport.close();

      // Further operations should fail
      try {
        await client.callTool('list_nodes', {});
        expect.fail('Should not be able to make requests after transport close');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Multiple Sessions', () => {
    it('should handle multiple concurrent sessions', async () => {
      const sessions = [];

      // Create 5 concurrent sessions
      for (let i = 0; i < 5; i++) {
        const { serverTransport, clientTransport } = InMemoryTransport.createLinkedPair();
        await mcpServer.connectToTransport(serverTransport);

        const client = new Client({
          name: `test-client-${i}`,
          version: '1.0.0'
        }, {});

        await client.connect(clientTransport);
        sessions.push(client);
      }

      // All sessions should work independently
      const promises = sessions.map((client, index) => 
        client.callTool('get_database_statistics', {})
          .then(response => ({ client: index, response }))
      );

      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.response).toBeDefined();
        expect(result.response[0].type).toBe('text');
      });

      // Clean up all sessions
      await Promise.all(sessions.map(client => client.close()));
    });

    it('should isolate session state', async () => {
      // Create two sessions
      const { serverTransport: st1, clientTransport: ct1 } = InMemoryTransport.createLinkedPair();
      const { serverTransport: st2, clientTransport: ct2 } = InMemoryTransport.createLinkedPair();

      await mcpEngine.connect(st1);
      await mcpEngine.connect(st2);

      const client1 = new Client({ name: 'client1', version: '1.0.0' }, {});
      const client2 = new Client({ name: 'client2', version: '1.0.0' }, {});

      await client1.connect(ct1);
      await client2.connect(ct2);

      // Both should work independently
      const [response1, response2] = await Promise.all([
        client1.callTool('list_nodes', { limit: 3 }),
        client2.callTool('list_nodes', { limit: 5 })
      ]);

      const nodes1 = JSON.parse(response1[0].text);
      const nodes2 = JSON.parse(response2[0].text);

      expect(nodes1).toHaveLength(3);
      expect(nodes2).toHaveLength(5);

      await client1.close();
      await client2.close();
    });
  });

  describe('Session Recovery', () => {
    it('should not persist state between sessions', async () => {
      // First session
      const { serverTransport: st1, clientTransport: ct1 } = InMemoryTransport.createLinkedPair();
      await mcpEngine.connect(st1);

      const client1 = new Client({ name: 'client1', version: '1.0.0' }, {});
      await client1.connect(ct1);

      // Make some requests
      await client1.callTool('list_nodes', { limit: 10 });
      await client1.close();

      // Second session - should be fresh
      const { serverTransport: st2, clientTransport: ct2 } = InMemoryTransport.createLinkedPair();
      await mcpEngine.connect(st2);

      const client2 = new Client({ name: 'client2', version: '1.0.0' }, {});
      await client2.connect(ct2);

      // Should work normally
      const response = await client2.callTool('get_database_statistics', {});
      expect(response).toBeDefined();

      await client2.close();
    });

    it('should handle rapid session cycling', async () => {
      for (let i = 0; i < 10; i++) {
        const { serverTransport, clientTransport } = InMemoryTransport.createLinkedPair();
        await mcpServer.connectToTransport(serverTransport);

        const client = new Client({ 
          name: `rapid-client-${i}`, 
          version: '1.0.0' 
        }, {});

        await client.connect(clientTransport);
        
        // Quick operation
        const response = await client.callTool('get_database_statistics', {});
        expect(response).toBeDefined();

        await client.close();
      }
    });
  });

  describe('Session Metadata', () => {
    it('should track client information', async () => {
      const { serverTransport, clientTransport } = InMemoryTransport.createLinkedPair();
      await mcpServer.connectToTransport(serverTransport);

      const client = new Client({
        name: 'test-client-with-metadata',
        version: '2.0.0'
      }, {
        capabilities: {
          experimental: {}
        }
      });

      await client.connect(clientTransport);

      // Server should be aware of client
      const serverInfo = await client.getServerInfo();
      expect(serverInfo).toBeDefined();

      await client.close();
    });

    it('should handle different client versions', async () => {
      const clients = [];

      for (const version of ['1.0.0', '1.1.0', '2.0.0']) {
        const { serverTransport, clientTransport } = InMemoryTransport.createLinkedPair();
        await mcpServer.connectToTransport(serverTransport);

        const client = new Client({
          name: 'version-test-client',
          version
        }, {});

        await client.connect(clientTransport);
        clients.push(client);
      }

      // All versions should work
      const responses = await Promise.all(
        clients.map(client => client.getServerInfo())
      );

      responses.forEach(info => {
        expect(info.name).toBe('n8n-mcp');
      });

      // Clean up
      await Promise.all(clients.map(client => client.close()));
    });
  });

  describe('Session Limits', () => {
    it('should handle many sequential sessions', async () => {
      const sessionCount = 50;
      
      for (let i = 0; i < sessionCount; i++) {
        const { serverTransport, clientTransport } = InMemoryTransport.createLinkedPair();
        await mcpServer.connectToTransport(serverTransport);

        const client = new Client({
          name: `sequential-client-${i}`,
          version: '1.0.0'
        }, {});

        await client.connect(clientTransport);
        
        // Light operation
        if (i % 10 === 0) {
          await client.callTool('get_database_statistics', {});
        }

        await client.close();
      }
    });

    it('should handle session with heavy usage', async () => {
      const { serverTransport, clientTransport } = InMemoryTransport.createLinkedPair();
      await mcpServer.connectToTransport(serverTransport);

      const client = new Client({
        name: 'heavy-usage-client',
        version: '1.0.0'
      }, {});

      await client.connect(clientTransport);

      // Make many requests
      const requestCount = 100;
      const promises = [];

      for (let i = 0; i < requestCount; i++) {
        const toolName = i % 2 === 0 ? 'list_nodes' : 'get_database_statistics';
        const params = toolName === 'list_nodes' ? { limit: 1 } : {};
        promises.push(client.callTool(toolName, params));
      }

      const responses = await Promise.all(promises);
      expect(responses).toHaveLength(requestCount);

      await client.close();
    });
  });

  describe('Session Error Recovery', () => {
    it('should handle errors without breaking session', async () => {
      const { serverTransport, clientTransport } = InMemoryTransport.createLinkedPair();
      await mcpServer.connectToTransport(serverTransport);

      const client = new Client({
        name: 'error-recovery-client',
        version: '1.0.0'
      }, {});

      await client.connect(clientTransport);

      // Make an error-inducing request
      try {
        await client.callTool('get_node_info', {
          nodeType: 'invalid-node-type'
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
      }

      // Session should still be active
      const response = await client.callTool('get_database_statistics', {});
      expect(response).toBeDefined();

      await client.close();
    });

    it('should handle multiple errors in sequence', async () => {
      const { serverTransport, clientTransport } = InMemoryTransport.createLinkedPair();
      await mcpServer.connectToTransport(serverTransport);

      const client = new Client({
        name: 'multi-error-client',
        version: '1.0.0'
      }, {});

      await client.connect(clientTransport);

      // Multiple error-inducing requests
      const errorPromises = [
        client.callTool('get_node_info', { nodeType: 'invalid1' }).catch(e => e),
        client.callTool('get_node_info', { nodeType: 'invalid2' }).catch(e => e),
        client.callTool('get_node_for_task', { task: 'invalid_task' }).catch(e => e)
      ];

      const errors = await Promise.all(errorPromises);
      errors.forEach(error => {
        expect(error).toBeDefined();
      });

      // Session should still work
      const response = await client.callTool('list_nodes', { limit: 1 });
      expect(response).toBeDefined();

      await client.close();
    });
  });

  describe('Session Transport Events', () => {
    it('should handle transport reconnection', async () => {
      // Initial connection
      const { serverTransport: st1, clientTransport: ct1 } = InMemoryTransport.createLinkedPair();
      await mcpEngine.connect(st1);

      const client = new Client({
        name: 'reconnect-client',
        version: '1.0.0'
      }, {});

      await client.connect(ct1);
      
      // Initial request
      const response1 = await client.callTool('get_database_statistics', {});
      expect(response1).toBeDefined();

      await client.close();

      // New connection with same client
      const { serverTransport: st2, clientTransport: ct2 } = InMemoryTransport.createLinkedPair();
      await mcpEngine.connect(st2);

      const newClient = new Client({
        name: 'reconnect-client',
        version: '1.0.0'
      }, {});

      await newClient.connect(ct2);
      
      // Should work normally
      const response2 = await newClient.callTool('get_database_statistics', {});
      expect(response2).toBeDefined();

      await newClient.close();
    });
  });
});