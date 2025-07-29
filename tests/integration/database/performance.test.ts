import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as Database from 'better-sqlite3';
import { NodeRepository } from '../../../src/database/node-repository';
import { TemplateRepository } from '../../../src/templates/template-repository';
import { DatabaseAdapter } from '../../../src/database/database-adapter';
import { TestDatabase, TestDataGenerator, PerformanceMonitor } from './test-utils';
import { ParsedNode } from '../../../src/parsers/node-parser';

describe('Database Performance Tests', () => {
  let testDb: TestDatabase;
  let db: Database;
  let nodeRepo: NodeRepository;
  let templateRepo: TemplateRepository;
  let adapter: DatabaseAdapter;
  let monitor: PerformanceMonitor;

  beforeEach(async () => {
    testDb = new TestDatabase({ mode: 'file', name: 'performance-test.db', enableFTS5: true });
    db = await testDb.initialize();
    adapter = new DatabaseAdapter(db);
    nodeRepo = new NodeRepository(adapter);
    templateRepo = new TemplateRepository(adapter);
    monitor = new PerformanceMonitor();
  });

  afterEach(async () => {
    monitor.clear();
    await testDb.cleanup();
  });

  describe('Node Repository Performance', () => {
    it('should handle bulk inserts efficiently', () => {
      const nodeCounts = [100, 1000, 5000];
      
      nodeCounts.forEach(count => {
        const nodes = generateNodes(count);
        
        const stop = monitor.start(`insert_${count}_nodes`);
        const transaction = db.transaction((nodes: ParsedNode[]) => {
          nodes.forEach(node => nodeRepo.saveNode(node));
        });
        transaction(nodes);
        stop();
      });

      // Check performance metrics
      const stats100 = monitor.getStats('insert_100_nodes');
      const stats1000 = monitor.getStats('insert_1000_nodes');
      const stats5000 = monitor.getStats('insert_5000_nodes');

      expect(stats100!.average).toBeLessThan(100); // 100 nodes in under 100ms
      expect(stats1000!.average).toBeLessThan(500); // 1000 nodes in under 500ms
      expect(stats5000!.average).toBeLessThan(2000); // 5000 nodes in under 2s

      // Performance should scale sub-linearly
      const ratio1000to100 = stats1000!.average / stats100!.average;
      const ratio5000to1000 = stats5000!.average / stats1000!.average;
      expect(ratio1000to100).toBeLessThan(10); // Should be better than linear scaling
      expect(ratio5000to1000).toBeLessThan(5);
    });

    it('should search nodes quickly with indexes', () => {
      // Insert test data
      const nodes = generateNodes(10000);
      const transaction = db.transaction((nodes: ParsedNode[]) => {
        nodes.forEach(node => nodeRepo.saveNode(node));
      });
      transaction(nodes);

      // Test different search scenarios
      const searchTests = [
        { query: 'webhook', mode: 'OR' as const },
        { query: 'http request', mode: 'AND' as const },
        { query: 'automation data', mode: 'OR' as const },
        { query: 'HTT', mode: 'FUZZY' as const }
      ];

      searchTests.forEach(test => {
        const stop = monitor.start(`search_${test.query}_${test.mode}`);
        const results = nodeRepo.searchNodes(test.query, test.mode, 100);
        stop();
        
        expect(results.length).toBeGreaterThan(0);
      });

      // All searches should be fast
      searchTests.forEach(test => {
        const stats = monitor.getStats(`search_${test.query}_${test.mode}`);
        expect(stats!.average).toBeLessThan(50); // Each search under 50ms
      });
    });

    it('should handle concurrent reads efficiently', () => {
      // Insert initial data
      const nodes = generateNodes(1000);
      const transaction = db.transaction((nodes: ParsedNode[]) => {
        nodes.forEach(node => nodeRepo.saveNode(node));
      });
      transaction(nodes);

      // Simulate concurrent reads
      const readOperations = 100;
      const promises: Promise<any>[] = [];

      const stop = monitor.start('concurrent_reads');
      
      for (let i = 0; i < readOperations; i++) {
        promises.push(
          Promise.resolve(nodeRepo.getNode(`n8n-nodes-base.node${i % 1000}`))
        );
      }

      Promise.all(promises);
      stop();

      const stats = monitor.getStats('concurrent_reads');
      expect(stats!.average).toBeLessThan(100); // 100 reads in under 100ms
      
      // Average per read should be very low
      const avgPerRead = stats!.average / readOperations;
      expect(avgPerRead).toBeLessThan(1); // Less than 1ms per read
    });
  });

  describe('Template Repository Performance with FTS5', () => {
    it('should perform FTS5 searches efficiently', () => {
      // Insert templates with varied content
      const templates = Array.from({ length: 10000 }, (_, i) => ({
        id: i + 1,
        name: `${['Webhook', 'HTTP', 'Automation', 'Data Processing'][i % 4]} Workflow ${i}`,
        description: generateDescription(i),
        workflow: {
          nodes: [
            {
              id: 'node1',
              name: 'Start',
              type: ['n8n-nodes-base.webhook', 'n8n-nodes-base.httpRequest', 'n8n-nodes-base.set'][i % 3],
              typeVersion: 1,
              position: [100, 100],
              parameters: {}
            }
          ],
          connections: {},
          settings: {}
        },
        user: { username: 'user' },
        views: Math.floor(Math.random() * 1000),
        totalViews: Math.floor(Math.random() * 1000),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }));

      const stop1 = monitor.start('insert_templates_with_fts');
      const transaction = db.transaction((templates: any[]) => {
        templates.forEach(t => templateRepo.saveTemplate(t));
      });
      transaction(templates);
      stop1();

      // Test various FTS5 searches
      const searchTests = [
        'webhook',
        'data processing',
        'automat*',
        '"HTTP Workflow"',
        'webhook OR http',
        'processing NOT webhook'
      ];

      searchTests.forEach(query => {
        const stop = monitor.start(`fts5_search_${query}`);
        const results = templateRepo.searchTemplates(query, 100);
        stop();
        
        expect(results.length).toBeGreaterThan(0);
      });

      // All FTS5 searches should be very fast
      searchTests.forEach(query => {
        const stats = monitor.getStats(`fts5_search_${query}`);
        expect(stats!.average).toBeLessThan(20); // FTS5 searches under 20ms
      });
    });

    it('should handle complex node type searches efficiently', () => {
      // Insert templates with various node combinations
      const nodeTypes = [
        'n8n-nodes-base.webhook',
        'n8n-nodes-base.httpRequest',
        'n8n-nodes-base.slack',
        'n8n-nodes-base.googleSheets',
        'n8n-nodes-base.mongodb'
      ];

      const templates = Array.from({ length: 5000 }, (_, i) => ({
        id: i + 1,
        name: `Template ${i}`,
        workflow: {
          nodes: Array.from({ length: 3 }, (_, j) => ({
            id: `node${j}`,
            name: `Node ${j}`,
            type: nodeTypes[(i + j) % nodeTypes.length],
            typeVersion: 1,
            position: [100 * j, 100],
            parameters: {}
          })),
          connections: {},
          settings: {}
        },
        user: { username: 'user' },
        views: 100,
        totalViews: 100,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }));

      const insertTransaction = db.transaction((templates: any[]) => {
        templates.forEach(t => templateRepo.saveTemplate(t));
      });
      insertTransaction(templates);

      // Test searching by node types
      const stop = monitor.start('search_by_node_types');
      const results = templateRepo.getTemplatesByNodeTypes([
        'n8n-nodes-base.webhook',
        'n8n-nodes-base.slack'
      ], 100);
      stop();

      expect(results.length).toBeGreaterThan(0);
      
      const stats = monitor.getStats('search_by_node_types');
      expect(stats!.average).toBeLessThan(50); // Complex JSON searches under 50ms
    });
  });

  describe('Database Optimization', () => {
    it('should benefit from proper indexing', () => {
      // Insert data
      const nodes = generateNodes(5000);
      const transaction = db.transaction((nodes: ParsedNode[]) => {
        nodes.forEach(node => nodeRepo.saveNode(node));
      });
      transaction(nodes);

      // Test queries that use indexes
      const indexedQueries = [
        () => nodeRepo.getNodesByPackage('n8n-nodes-base'),
        () => nodeRepo.getNodesByCategory('trigger'),
        () => nodeRepo.getAITools()
      ];

      indexedQueries.forEach((query, i) => {
        const stop = monitor.start(`indexed_query_${i}`);
        const results = query();
        stop();
        
        expect(Array.isArray(results)).toBe(true);
      });

      // All indexed queries should be fast
      indexedQueries.forEach((_, i) => {
        const stats = monitor.getStats(`indexed_query_${i}`);
        expect(stats!.average).toBeLessThan(20); // Indexed queries under 20ms
      });
    });

    it('should handle VACUUM operation efficiently', () => {
      // Insert and delete data to create fragmentation
      const nodes = generateNodes(1000);
      
      // Insert
      const insertTx = db.transaction((nodes: ParsedNode[]) => {
        nodes.forEach(node => nodeRepo.saveNode(node));
      });
      insertTx(nodes);

      // Delete half
      db.prepare('DELETE FROM nodes WHERE ROWID % 2 = 0').run();

      // Measure VACUUM performance
      const stop = monitor.start('vacuum');
      db.exec('VACUUM');
      stop();

      const stats = monitor.getStats('vacuum');
      expect(stats!.average).toBeLessThan(1000); // VACUUM under 1 second

      // Verify database still works
      const remaining = nodeRepo.getAllNodes();
      expect(remaining.length).toBeGreaterThan(0);
    });

    it('should maintain performance with WAL mode', () => {
      // Verify WAL mode is enabled
      const mode = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
      expect(mode.journal_mode).toBe('wal');

      // Perform mixed read/write operations
      const operations = 1000;
      
      const stop = monitor.start('wal_mixed_operations');
      
      for (let i = 0; i < operations; i++) {
        if (i % 10 === 0) {
          // Write operation
          const node = generateNodes(1)[0];
          nodeRepo.saveNode(node);
        } else {
          // Read operation
          nodeRepo.getAllNodes(10);
        }
      }
      
      stop();

      const stats = monitor.getStats('wal_mixed_operations');
      expect(stats!.average).toBeLessThan(500); // Mixed operations under 500ms
    });
  });

  describe('Memory Usage', () => {
    it('should handle large result sets without excessive memory', () => {
      // Insert large dataset
      const nodes = generateNodes(10000);
      const transaction = db.transaction((nodes: ParsedNode[]) => {
        nodes.forEach(node => nodeRepo.saveNode(node));
      });
      transaction(nodes);

      // Measure memory before
      const memBefore = process.memoryUsage().heapUsed;

      // Fetch large result set
      const stop = monitor.start('large_result_set');
      const results = nodeRepo.getAllNodes();
      stop();

      // Measure memory after
      const memAfter = process.memoryUsage().heapUsed;
      const memIncrease = (memAfter - memBefore) / 1024 / 1024; // MB

      expect(results).toHaveLength(10000);
      expect(memIncrease).toBeLessThan(100); // Less than 100MB increase

      const stats = monitor.getStats('large_result_set');
      expect(stats!.average).toBeLessThan(200); // Fetch 10k records under 200ms
    });
  });

  describe('Concurrent Write Performance', () => {
    it('should handle concurrent writes with transactions', () => {
      const writeBatches = 10;
      const nodesPerBatch = 100;

      const stop = monitor.start('concurrent_writes');

      // Simulate concurrent write batches
      const promises = Array.from({ length: writeBatches }, (_, i) => {
        return new Promise<void>((resolve) => {
          const nodes = generateNodes(nodesPerBatch, i * nodesPerBatch);
          const transaction = db.transaction((nodes: ParsedNode[]) => {
            nodes.forEach(node => nodeRepo.saveNode(node));
          });
          transaction(nodes);
          resolve();
        });
      });

      Promise.all(promises);
      stop();

      const stats = monitor.getStats('concurrent_writes');
      expect(stats!.average).toBeLessThan(500); // All writes under 500ms

      // Verify all nodes were written
      const count = nodeRepo.getNodeCount();
      expect(count).toBe(writeBatches * nodesPerBatch);
    });
  });
});

// Helper functions
function generateNodes(count: number, startId: number = 0): ParsedNode[] {
  const categories = ['trigger', 'automation', 'transform', 'output'];
  const packages = ['n8n-nodes-base', '@n8n/n8n-nodes-langchain'];
  
  return Array.from({ length: count }, (_, i) => ({
    nodeType: `n8n-nodes-base.node${startId + i}`,
    packageName: packages[i % packages.length],
    displayName: `Node ${startId + i}`,
    description: `Description for node ${startId + i} with ${['webhook', 'http', 'automation', 'data'][i % 4]} functionality`,
    category: categories[i % categories.length],
    style: 'programmatic' as const,
    isAITool: i % 10 === 0,
    isTrigger: categories[i % categories.length] === 'trigger',
    isWebhook: i % 5 === 0,
    isVersioned: true,
    version: '1',
    documentation: i % 3 === 0 ? `Documentation for node ${i}` : null,
    properties: Array.from({ length: 5 }, (_, j) => ({
      displayName: `Property ${j}`,
      name: `prop${j}`,
      type: 'string',
      default: ''
    })),
    operations: [],
    credentials: i % 4 === 0 ? [{ name: 'httpAuth', required: true }] : []
  }));
}

function generateDescription(index: number): string {
  const descriptions = [
    'Automate your workflow with powerful webhook integrations',
    'Process HTTP requests and transform data efficiently',
    'Connect to external APIs and sync data seamlessly',
    'Build complex automation workflows with ease',
    'Transform and filter data with advanced operations'
  ];
  return descriptions[index % descriptions.length] + ` - Version ${index}`;
}