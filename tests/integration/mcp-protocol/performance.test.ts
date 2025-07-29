import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { TestableN8NMCPServer } from './test-helpers';

describe('MCP Performance Tests', () => {
  let mcpServer: TestableN8NMCPServer;
  let client: Client;

  beforeEach(async () => {
    mcpServer = new TestableN8NMCPServer();
    await mcpServer.initialize();
    
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
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

  describe('Response Time Benchmarks', () => {
    it('should respond to simple queries quickly', async () => {
      const iterations = 100;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        await client.callTool({ name: 'get_database_statistics', arguments: {} });
      }

      const duration = performance.now() - start;
      const avgTime = duration / iterations;

      console.log(`Average response time for get_database_statistics: ${avgTime.toFixed(2)}ms`);
      
      // Should average under 10ms per request
      expect(avgTime).toBeLessThan(10);
    });

    it('should handle list operations efficiently', async () => {
      const iterations = 50;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        await client.callTool({ name: 'list_nodes', arguments: { limit: 10 } });
      }

      const duration = performance.now() - start;
      const avgTime = duration / iterations;

      console.log(`Average response time for list_nodes: ${avgTime.toFixed(2)}ms`);
      
      // Should average under 20ms per request
      expect(avgTime).toBeLessThan(20);
    });

    it('should perform searches efficiently', async () => {
      const searches = ['http', 'webhook', 'slack', 'database', 'api'];
      const iterations = 20;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        for (const query of searches) {
          await client.callTool({ name: 'search_nodes', arguments: { query } });
        }
      }

      const totalRequests = iterations * searches.length;
      const duration = performance.now() - start;
      const avgTime = duration / totalRequests;

      console.log(`Average response time for search_nodes: ${avgTime.toFixed(2)}ms`);
      
      // Should average under 30ms per search
      expect(avgTime).toBeLessThan(30);
    });

    it('should retrieve node info quickly', async () => {
      const nodeTypes = [
        'nodes-base.httpRequest',
        'nodes-base.webhook',
        'nodes-base.set',
        'nodes-base.if',
        'nodes-base.switch'
      ];

      const start = performance.now();

      for (const nodeType of nodeTypes) {
        await client.callTool({ name: 'get_node_info', arguments: { nodeType } });
      }

      const duration = performance.now() - start;
      const avgTime = duration / nodeTypes.length;

      console.log(`Average response time for get_node_info: ${avgTime.toFixed(2)}ms`);
      
      // Should average under 50ms per request (these are large responses)
      expect(avgTime).toBeLessThan(50);
    });
  });

  describe('Concurrent Request Performance', () => {
    it('should handle concurrent requests efficiently', async () => {
      const concurrentRequests = 50;
      const start = performance.now();

      const promises = [];
      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(
          client.callTool({ name: 'list_nodes', arguments: { limit: 5 } })
        );
      }

      await Promise.all(promises);

      const duration = performance.now() - start;
      const avgTime = duration / concurrentRequests;

      console.log(`Average time for ${concurrentRequests} concurrent requests: ${avgTime.toFixed(2)}ms`);
      
      // Concurrent requests should be more efficient than sequential
      expect(avgTime).toBeLessThan(10);
    });

    it('should handle mixed concurrent operations', async () => {
      const operations = [
        { tool: 'list_nodes', params: { limit: 10 } },
        { tool: 'search_nodes', params: { query: 'http' } },
        { tool: 'get_database_statistics', params: {} },
        { tool: 'list_ai_tools', params: {} },
        { tool: 'list_tasks', params: {} }
      ];

      const rounds = 10;
      const start = performance.now();

      for (let round = 0; round < rounds; round++) {
        const promises = operations.map(op => 
          client.callTool({ name: op.tool, arguments: op.params })
        );
        await Promise.all(promises);
      }

      const duration = performance.now() - start;
      const totalRequests = rounds * operations.length;
      const avgTime = duration / totalRequests;

      console.log(`Average time for mixed operations: ${avgTime.toFixed(2)}ms`);
      
      expect(avgTime).toBeLessThan(20);
    });
  });

  describe('Large Data Performance', () => {
    it('should handle large node lists efficiently', async () => {
      const start = performance.now();

      const response = await client.callTool({ name: 'list_nodes', arguments: {
        limit: 200 // Get many nodes
      } });

      const duration = performance.now() - start;

      console.log(`Time to list 200 nodes: ${duration.toFixed(2)}ms`);
      
      // Should complete within 100ms
      expect(duration).toBeLessThan(100);

      const nodes = JSON.parse((response as any)[0].text);
      expect(nodes.length).toBeGreaterThan(100);
    });

    it('should handle large workflow validation efficiently', async () => {
      // Create a large workflow
      const nodeCount = 100;
      const nodes = [];
      const connections: any = {};

      for (let i = 0; i < nodeCount; i++) {
        nodes.push({
          id: String(i),
          name: `Node${i}`,
          type: i % 3 === 0 ? 'nodes-base.httpRequest' : 'nodes-base.set',
          typeVersion: 1,
          position: [i * 100, 0],
          parameters: i % 3 === 0 ? 
            { method: 'GET', url: 'https://api.example.com' } :
            { values: { string: [{ name: 'test', value: 'value' }] } }
        });

        if (i > 0) {
          connections[`Node${i-1}`] = {
            'main': [[{ node: `Node${i}`, type: 'main', index: 0 }]]
          };
        }
      }

      const start = performance.now();

      const response = await client.callTool({ name: 'validate_workflow', arguments: {
        workflow: { nodes, connections }
      } });

      const duration = performance.now() - start;

      console.log(`Time to validate ${nodeCount} node workflow: ${duration.toFixed(2)}ms`);
      
      // Should complete within 500ms
      expect(duration).toBeLessThan(500);

      const validation = JSON.parse((response as any)[0].text);
      expect(validation).toHaveProperty('valid');
    });
  });

  describe('Memory Efficiency', () => {
    it('should handle repeated operations without memory leaks', async () => {
      const iterations = 1000;
      const batchSize = 100;

      // Measure initial memory if available
      const initialMemory = process.memoryUsage();

      for (let i = 0; i < iterations; i += batchSize) {
        const promises = [];
        
        for (let j = 0; j < batchSize; j++) {
          promises.push(
            client.callTool({ name: 'get_database_statistics', arguments: {} })
          );
        }

        await Promise.all(promises);

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      console.log(`Memory increase after ${iterations} operations: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);

      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    it('should release memory after large operations', async () => {
      const initialMemory = process.memoryUsage();

      // Perform large operations
      for (let i = 0; i < 10; i++) {
        await client.callTool({ name: 'list_nodes', arguments: { limit: 200 } });
        await client.callTool({ name: 'get_node_info', arguments: { 
          nodeType: 'nodes-base.httpRequest' 
        } });
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      console.log(`Memory increase after large operations: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);

      // Should not retain excessive memory
      expect(memoryIncrease).toBeLessThan(20 * 1024 * 1024);
    });
  });

  describe('Scalability Tests', () => {
    it('should maintain performance with increasing load', async () => {
      const loadLevels = [10, 50, 100, 200];
      const results: any[] = [];

      for (const load of loadLevels) {
        const start = performance.now();
        
        const promises = [];
        for (let i = 0; i < load; i++) {
          promises.push(
            client.callTool({ name: 'list_nodes', arguments: { limit: 1 } })
          );
        }

        await Promise.all(promises);
        
        const duration = performance.now() - start;
        const avgTime = duration / load;

        results.push({
          load,
          totalTime: duration,
          avgTime
        });

        console.log(`Load ${load}: Total ${duration.toFixed(2)}ms, Avg ${avgTime.toFixed(2)}ms`);
      }

      // Average time should not increase dramatically with load
      const firstAvg = results[0].avgTime;
      const lastAvg = results[results.length - 1].avgTime;
      
      // Last average should be less than 2x the first
      expect(lastAvg).toBeLessThan(firstAvg * 2);
    });

    it('should handle burst traffic', async () => {
      const burstSize = 100;
      const start = performance.now();

      // Simulate burst of requests
      const promises = [];
      for (let i = 0; i < burstSize; i++) {
        const operation = i % 4;
        switch (operation) {
          case 0:
            promises.push(client.callTool({ name: 'list_nodes', arguments: { limit: 5 } }));
            break;
          case 1:
            promises.push(client.callTool({ name: 'search_nodes', arguments: { query: 'test' } }));
            break;
          case 2:
            promises.push(client.callTool({ name: 'get_database_statistics', arguments: {} }));
            break;
          case 3:
            promises.push(client.callTool({ name: 'list_ai_tools', arguments: {} }));
            break;
        }
      }

      await Promise.all(promises);

      const duration = performance.now() - start;

      console.log(`Burst of ${burstSize} requests completed in ${duration.toFixed(2)}ms`);

      // Should handle burst within reasonable time
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('Critical Path Optimization', () => {
    it('should optimize tool listing performance', async () => {
      // Warm up
      await client.callTool({ name: 'list_nodes', arguments: { limit: 1 } });

      const iterations = 100;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await client.callTool({ name: 'list_nodes', arguments: { limit: 20 } });
        times.push(performance.now() - start);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);

      console.log(`list_nodes performance - Avg: ${avgTime.toFixed(2)}ms, Min: ${minTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);

      // Average should be very fast
      expect(avgTime).toBeLessThan(10);
      
      // Max should not be too much higher than average (no outliers)
      expect(maxTime).toBeLessThan(avgTime * 3);
    });

    it('should optimize search performance', async () => {
      // Warm up
      await client.callTool({ name: 'search_nodes', arguments: { query: 'test' } });

      const queries = ['http', 'webhook', 'database', 'api', 'slack'];
      const times: number[] = [];

      for (const query of queries) {
        for (let i = 0; i < 20; i++) {
          const start = performance.now();
          await client.callTool({ name: 'search_nodes', arguments: { query } });
          times.push(performance.now() - start);
        }
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;

      console.log(`search_nodes average performance: ${avgTime.toFixed(2)}ms`);

      // Search should be optimized
      expect(avgTime).toBeLessThan(15);
    });

    it('should cache effectively for repeated queries', async () => {
      const nodeType = 'nodes-base.httpRequest';

      // First call (cold)
      const coldStart = performance.now();
      await client.callTool({ name: 'get_node_info', arguments: { nodeType } });
      const coldTime = performance.now() - coldStart;

      // Subsequent calls (potentially cached)
      const warmTimes: number[] = [];
      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        await client.callTool({ name: 'get_node_info', arguments: { nodeType } });
        warmTimes.push(performance.now() - start);
      }

      const avgWarmTime = warmTimes.reduce((a, b) => a + b, 0) / warmTimes.length;

      console.log(`Cold time: ${coldTime.toFixed(2)}ms, Avg warm time: ${avgWarmTime.toFixed(2)}ms`);

      // Warm calls should be faster or similar
      expect(avgWarmTime).toBeLessThanOrEqual(coldTime * 1.1);
    });
  });

  describe('Stress Tests', () => {
    it('should handle sustained high load', async () => {
      const duration = 5000; // 5 seconds
      const start = performance.now();
      let requestCount = 0;
      let errorCount = 0;

      while (performance.now() - start < duration) {
        try {
          await client.callTool({ name: 'get_database_statistics', arguments: {} });
          requestCount++;
        } catch (error) {
          errorCount++;
        }
      }

      const actualDuration = performance.now() - start;
      const requestsPerSecond = requestCount / (actualDuration / 1000);

      console.log(`Sustained load test - Requests: ${requestCount}, RPS: ${requestsPerSecond.toFixed(2)}, Errors: ${errorCount}`);

      // Should handle at least 100 requests per second
      expect(requestsPerSecond).toBeGreaterThan(100);
      
      // Error rate should be very low
      expect(errorCount).toBe(0);
    });

    it('should recover from performance degradation', async () => {
      // Create heavy load
      const heavyPromises = [];
      for (let i = 0; i < 200; i++) {
        heavyPromises.push(
          client.callTool({ name: 'validate_workflow', arguments: {
            workflow: {
              nodes: Array(20).fill(null).map((_, idx) => ({
                id: String(idx),
                name: `Node${idx}`,
                type: 'nodes-base.set',
                typeVersion: 1,
                position: [idx * 100, 0],
                parameters: {}
              })),
              connections: {}
            }
          } })
        );
      }

      await Promise.all(heavyPromises);

      // Measure performance after heavy load
      const recoveryTimes: number[] = [];
      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        await client.callTool({ name: 'get_database_statistics', arguments: {} });
        recoveryTimes.push(performance.now() - start);
      }

      const avgRecoveryTime = recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length;

      console.log(`Average response time after heavy load: ${avgRecoveryTime.toFixed(2)}ms`);

      // Should recover to normal performance
      expect(avgRecoveryTime).toBeLessThan(10);
    });
  });
});