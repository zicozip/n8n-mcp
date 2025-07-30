import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { TestableN8NMCPServer } from './test-helpers';

describe('MCP Session Management', { timeout: 15000 }, () => {
  beforeAll(() => {
    // Disable MSW for these integration tests
    process.env.MSW_ENABLED = 'false';
  });

  afterAll(async () => {
    // Clean up any shared resources
    await TestableN8NMCPServer.shutdownShared();
  });

  describe('Session Lifecycle', () => {
    it('should establish a new session', async () => {
      const mcpServer = new TestableN8NMCPServer();
      await mcpServer.initialize();
      
      const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
      await mcpServer.connectToTransport(serverTransport);

      const client = new Client({
        name: 'test-client',
        version: '1.0.0'
      }, {
        capabilities: {}
      });

      await client.connect(clientTransport);

      // Session should be established
      const serverInfo = await client.getServerVersion();
      expect(serverInfo).toHaveProperty('name', 'n8n-documentation-mcp');
      
      // Clean up - ensure proper order
      await client.close();
      await new Promise(resolve => setTimeout(resolve, 50)); // Give time for client to fully close
      await mcpServer.close();
    });

    it('should handle session initialization with capabilities', async () => {
      const mcpServer = new TestableN8NMCPServer();
      await mcpServer.initialize();
      
      const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
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

      const serverInfo = await client.getServerVersion();
      expect(serverInfo!.capabilities).toHaveProperty('tools');
      
      // Clean up - ensure proper order
      await client.close();
      await new Promise(resolve => setTimeout(resolve, 50)); // Give time for client to fully close
      await mcpServer.close();
    });

    it('should handle clean session termination', async () => {
      const mcpServer = new TestableN8NMCPServer();
      await mcpServer.initialize();
      
      const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
      await mcpServer.connectToTransport(serverTransport);

      const client = new Client({
        name: 'test-client',
        version: '1.0.0'
      }, {});

      await client.connect(clientTransport);

      // Make some requests
      await client.callTool({ name: 'get_database_statistics', arguments: {} });
      await client.callTool({ name: 'list_nodes', arguments: { limit: 5 } });

      // Clean termination
      await client.close();
      await new Promise(resolve => setTimeout(resolve, 50)); // Give time for client to fully close

      // Client should be closed
      try {
        await client.callTool({ name: 'get_database_statistics', arguments: {} });
        expect.fail('Should not be able to make requests after close');
      } catch (error) {
        expect(error).toBeDefined();
      }
      
      await mcpServer.close();
    });

    it('should handle abrupt disconnection', async () => {
      const mcpServer = new TestableN8NMCPServer();
      await mcpServer.initialize();
      
      const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
      await mcpServer.connectToTransport(serverTransport);

      const client = new Client({
        name: 'test-client',
        version: '1.0.0'
      }, {});

      await client.connect(clientTransport);

      // Make a request to ensure connection is active
      await client.callTool({ name: 'get_database_statistics', arguments: {} });

      // Simulate abrupt disconnection by closing transport
      await clientTransport.close();
      await new Promise(resolve => setTimeout(resolve, 50)); // Give time for transport to fully close

      // Further operations should fail
      try {
        await client.callTool({ name: 'list_nodes', arguments: {} });
        expect.fail('Should not be able to make requests after transport close');
      } catch (error) {
        expect(error).toBeDefined();
      }
      
      // Note: client is already disconnected, no need to close it
      await mcpServer.close();
    });
  });

  describe('Multiple Sessions', () => {
    it('should handle multiple concurrent sessions', async () => {
      const mcpServer = new TestableN8NMCPServer();
      await mcpServer.initialize();
      
      const sessions = [];

      // Create 5 concurrent sessions
      for (let i = 0; i < 5; i++) {
        const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
        await mcpServer.connectToTransport(serverTransport);

        const client = new Client({
          name: `test-client-${i}`,
          version: '1.0.0'
        }, {});

        await client.connect(clientTransport);
        sessions.push({ client, serverTransport, clientTransport });
      }

      // All sessions should work independently
      const promises = sessions.map((session, index) => 
        session.client.callTool({ name: 'get_database_statistics', arguments: {} })
          .then(response => ({ client: index, response }))
      );

      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.response).toBeDefined();
        expect((result.response[0] as any).type).toBe('text');
      });

      // Clean up all sessions - close clients first
      await Promise.all(sessions.map(s => s.client.close()));
      await new Promise(resolve => setTimeout(resolve, 100)); // Give time for all clients to fully close
      await mcpServer.close();
    });

    it('should isolate session state', async () => {
      const mcpServer = new TestableN8NMCPServer();
      await mcpServer.initialize();
      
      // Create two sessions
      const [st1, ct1] = InMemoryTransport.createLinkedPair();
      const [st2, ct2] = InMemoryTransport.createLinkedPair();

      await mcpServer.connectToTransport(st1);
      await mcpServer.connectToTransport(st2);

      const client1 = new Client({ name: 'client1', version: '1.0.0' }, {});
      const client2 = new Client({ name: 'client2', version: '1.0.0' }, {});

      await client1.connect(ct1);
      await client2.connect(ct2);

      // Both should work independently
      const [response1, response2] = await Promise.all([
        client1.callTool({ name: 'list_nodes', arguments: { limit: 3 } }),
        client2.callTool({ name: 'list_nodes', arguments: { limit: 5 } })
      ]);

      const nodes1 = JSON.parse((response1[0] as any).text);
      const nodes2 = JSON.parse((response2[0] as any).text);

      expect(nodes1).toHaveLength(3);
      expect(nodes2).toHaveLength(5);
      
      // Close clients first
      await client1.close();
      await client2.close();
      await new Promise(resolve => setTimeout(resolve, 50)); // Give time for clients to fully close
      await mcpServer.close();
    });
  });

  describe('Session Recovery', () => {
    it('should not persist state between sessions', async () => {
      // First session
      const mcpServer1 = new TestableN8NMCPServer();
      await mcpServer1.initialize();
      
      const [st1, ct1] = InMemoryTransport.createLinkedPair();
      await mcpServer1.connectToTransport(st1);

      const client1 = new Client({ name: 'client1', version: '1.0.0' }, {});
      await client1.connect(ct1);

      // Make some requests
      await client1.callTool({ name: 'list_nodes', arguments: { limit: 10 } });
      await client1.close();
      await mcpServer1.close();

      // Second session - should be fresh
      const mcpServer2 = new TestableN8NMCPServer();
      await mcpServer2.initialize();
      
      const [st2, ct2] = InMemoryTransport.createLinkedPair();
      await mcpServer2.connectToTransport(st2);

      const client2 = new Client({ name: 'client2', version: '1.0.0' }, {});
      await client2.connect(ct2);

      // Should work normally
      const response = await client2.callTool({ name: 'get_database_statistics', arguments: {} });
      expect(response).toBeDefined();

      await client2.close();
      await mcpServer2.close();
    });

    it('should handle rapid session cycling', async () => {
      for (let i = 0; i < 10; i++) {
        const mcpServer = new TestableN8NMCPServer();
        await mcpServer.initialize();
        
        const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
        await mcpServer.connectToTransport(serverTransport);

        const client = new Client({ 
          name: `rapid-client-${i}`, 
          version: '1.0.0' 
        }, {});

        await client.connect(clientTransport);
        
        // Quick operation
        const response = await client.callTool({ name: 'get_database_statistics', arguments: {} });
        expect(response).toBeDefined();

        // Explicit cleanup for each iteration
        await client.close();
        await mcpServer.close();
      }
    });
  });

  describe('Session Metadata', () => {
    it('should track client information', async () => {
      const mcpServer = new TestableN8NMCPServer();
      await mcpServer.initialize();
      
      const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
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
      const serverInfo = await client.getServerVersion();
      expect(serverInfo).toBeDefined();
      
      await client.close();
      await new Promise(resolve => setTimeout(resolve, 50)); // Give time for client to fully close
      await mcpServer.close();
    });

    it('should handle different client versions', async () => {
      const mcpServer = new TestableN8NMCPServer();
      await mcpServer.initialize();
      
      const clients = [];

      for (const version of ['1.0.0', '1.1.0', '2.0.0']) {
        const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
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
        clients.map(client => client.getServerVersion())
      );

      responses.forEach(info => {
        expect(info!.name).toBe('n8n-documentation-mcp');
      });
      
      // Clean up
      await Promise.all(clients.map(client => client.close()));
      await new Promise(resolve => setTimeout(resolve, 100)); // Give time for all clients to fully close
      await mcpServer.close();
    });
  });

  describe('Session Limits', () => {
    it('should handle many sequential sessions', async () => {
      const sessionCount = 20; // Reduced for faster tests
      
      for (let i = 0; i < sessionCount; i++) {
        const mcpServer = new TestableN8NMCPServer();
        await mcpServer.initialize();
        
        const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
        await mcpServer.connectToTransport(serverTransport);

        const client = new Client({
          name: `sequential-client-${i}`,
          version: '1.0.0'
        }, {});

        await client.connect(clientTransport);
        
        // Light operation
        if (i % 10 === 0) {
          await client.callTool({ name: 'get_database_statistics', arguments: {} });
        }

        // Explicit cleanup
        await client.close();
        await mcpServer.close();
      }
    });

    it('should handle session with heavy usage', async () => {
      const mcpServer = new TestableN8NMCPServer();
      await mcpServer.initialize();
      
      const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
      await mcpServer.connectToTransport(serverTransport);

      const client = new Client({
        name: 'heavy-usage-client',
        version: '1.0.0'
      }, {});

      await client.connect(clientTransport);

      // Make many requests
      const requestCount = 20; // Reduced for faster tests
      const promises = [];

      for (let i = 0; i < requestCount; i++) {
        const toolName = i % 2 === 0 ? 'list_nodes' : 'get_database_statistics';
        const params = toolName === 'list_nodes' ? { limit: 1 } : {};
        promises.push(client.callTool({ name: toolName as any, arguments: params }));
      }

      const responses = await Promise.all(promises);
      expect(responses).toHaveLength(requestCount);
      
      await client.close();
      await new Promise(resolve => setTimeout(resolve, 50)); // Give time for client to fully close
      await mcpServer.close();
    });
  });

  describe('Session Error Recovery', () => {
    it('should handle errors without breaking session', async () => {
      const mcpServer = new TestableN8NMCPServer();
      await mcpServer.initialize();
      
      const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
      await mcpServer.connectToTransport(serverTransport);

      const client = new Client({
        name: 'error-recovery-client',
        version: '1.0.0'
      }, {});

      await client.connect(clientTransport);

      // Make an error-inducing request
      try {
        await client.callTool({ name: 'get_node_info', arguments: {
          nodeType: 'invalid-node-type'
        } });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
      }

      // Session should still be active
      const response = await client.callTool({ name: 'get_database_statistics', arguments: {} });
      expect(response).toBeDefined();
      
      await client.close();
      await new Promise(resolve => setTimeout(resolve, 50)); // Give time for client to fully close
      await mcpServer.close();
    });

    it('should handle multiple errors in sequence', async () => {
      const mcpServer = new TestableN8NMCPServer();
      await mcpServer.initialize();
      
      const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
      await mcpServer.connectToTransport(serverTransport);

      const client = new Client({
        name: 'multi-error-client',
        version: '1.0.0'
      }, {});

      await client.connect(clientTransport);

      // Multiple error-inducing requests
      const errorPromises = [
        client.callTool({ name: 'get_node_info', arguments: { nodeType: 'invalid1' } }).catch(e => e),
        client.callTool({ name: 'get_node_info', arguments: { nodeType: 'invalid2' } }).catch(e => e),
        client.callTool({ name: 'get_node_for_task', arguments: { task: 'invalid_task' } }).catch(e => e)
      ];

      const errors = await Promise.all(errorPromises);
      errors.forEach(error => {
        expect(error).toBeDefined();
      });

      // Session should still work
      const response = await client.callTool({ name: 'list_nodes', arguments: { limit: 1 } });
      expect(response).toBeDefined();
      
      await client.close();
      await new Promise(resolve => setTimeout(resolve, 50)); // Give time for client to fully close
      await mcpServer.close();
    });
  });

  describe('Session Transport Events', () => {
    it('should handle transport reconnection', async () => {
      // Initial connection
      const mcpServer = new TestableN8NMCPServer();
      await mcpServer.initialize();
      
      const [st1, ct1] = InMemoryTransport.createLinkedPair();
      await mcpServer.connectToTransport(st1);

      const client = new Client({
        name: 'reconnect-client',
        version: '1.0.0'
      }, {});

      await client.connect(ct1);
      
      // Initial request
      const response1 = await client.callTool({ name: 'get_database_statistics', arguments: {} });
      expect(response1).toBeDefined();

      await client.close();

      // New connection with same server
      const [st2, ct2] = InMemoryTransport.createLinkedPair();
      await mcpServer.connectToTransport(st2);

      const newClient = new Client({
        name: 'reconnect-client',
        version: '1.0.0'
      }, {});

      await newClient.connect(ct2);
      
      // Should work normally
      const response2 = await newClient.callTool({ name: 'get_database_statistics', arguments: {} });
      expect(response2).toBeDefined();
      
      await newClient.close();
      await new Promise(resolve => setTimeout(resolve, 50)); // Give time for client to fully close
      await mcpServer.close();
    });
  });
});