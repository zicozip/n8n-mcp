# Agent 5: Performance Thresholds Fix Brief

## Assignment
Fix 15 failing tests related to performance benchmarks and thresholds across MCP and database operations.

## Files to Fix
- `tests/integration/mcp-protocol/performance.test.ts` (2 tests based on output)
- `tests/integration/database/performance.test.ts` (estimated 13 tests)

## Specific Failures to Address

### MCP Performance Tests

#### 1. Large Node Lists (3 retries)
```
FAIL: should handle large node lists efficiently
TypeError: Cannot read properties of undefined (reading 'text')
Lines: 178, 181
```

#### 2. Large Workflow Validation (3 retries)
```
FAIL: should handle large workflow validation efficiently
TypeError: Cannot read properties of undefined (reading 'text')
Lines: 220, 223
```

### Database Performance Tests
Based on test structure, likely failures include:
- Bulk insert performance
- Query optimization tests
- Index performance
- Connection pool efficiency
- Memory usage tests
- Concurrent operation benchmarks

## Root Causes
1. **Undefined Responses**: MCP client returning undefined instead of proper response
2. **Timeout Thresholds**: CI environment slower than local development
3. **Memory Pressure**: Large data sets causing memory issues
4. **Missing Optimizations**: Database queries not using indexes

## Recommended Fixes

### 1. Fix MCP Large Data Handling
```typescript
// Fix large node list test
it('should handle large node lists efficiently', async () => {
  const start = Date.now();
  
  // Ensure proper response structure
  const response = await mcpClient.request('tools/call', {
    name: 'list_nodes',
    arguments: {
      limit: 500 // Large but reasonable
    }
  });
  
  const duration = Date.now() - start;
  
  // Check response is defined
  expect(response).toBeDefined();
  expect(response.content).toBeDefined();
  expect(response.content[0]).toBeDefined();
  expect(response.content[0].text).toBeDefined();
  
  // Parse nodes from response
  const nodes = JSON.parse(response.content[0].text);
  
  // Adjust threshold for CI
  const threshold = process.env.CI ? 200 : 100;
  expect(duration).toBeLessThan(threshold);
  expect(nodes.length).toBeGreaterThan(100);
});

// Fix large workflow validation test
it('should handle large workflow validation efficiently', async () => {
  // Create large workflow
  const workflow = {
    name: 'Large Test Workflow',
    nodes: Array.from({ length: 100 }, (_, i) => ({
      id: `node-${i}`,
      name: `Node ${i}`,
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 1,
      position: [100 * i, 100],
      parameters: {
        url: 'https://example.com',
        method: 'GET'
      }
    })),
    connections: {}
  };
  
  // Add connections
  for (let i = 0; i < 99; i++) {
    workflow.connections[`node-${i}`] = {
      main: [[{ node: `node-${i + 1}`, type: 'main', index: 0 }]]
    };
  }
  
  const start = Date.now();
  
  const response = await mcpClient.request('tools/call', {
    name: 'validate_workflow',
    arguments: { workflow }
  });
  
  const duration = Date.now() - start;
  
  // Ensure response exists
  expect(response).toBeDefined();
  expect(response.content).toBeDefined();
  expect(response.content[0]).toBeDefined();
  expect(response.content[0].text).toBeDefined();
  
  const validation = JSON.parse(response.content[0].text);
  
  // Higher threshold for large workflows
  const threshold = process.env.CI ? 1000 : 500;
  expect(duration).toBeLessThan(threshold);
  expect(validation).toHaveProperty('valid');
});
```

### 2. Database Performance Test Template
```typescript
// Common setup for database performance tests
describe('Database Performance', () => {
  let db: Database;
  let repository: NodeRepository;
  
  beforeEach(async () => {
    // Use in-memory database for consistent performance
    db = new Database(':memory:');
    await initializeSchema(db);
    repository = new NodeRepository(db);
    
    // Enable performance optimizations
    await db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA cache_size = -64000;
      PRAGMA temp_store = MEMORY;
    `);
  });
  
  afterEach(async () => {
    await db.close();
  });
  
  it('should handle bulk inserts efficiently', async () => {
    const nodes = Array.from({ length: 1000 }, (_, i) => ({
      type: `test.node${i}`,
      displayName: `Test Node ${i}`,
      name: `testNode${i}`,
      description: 'Performance test node',
      version: 1,
      properties: {}
    }));
    
    const start = Date.now();
    
    // Use transaction for bulk insert
    await db.transaction(() => {
      const stmt = db.prepare(`
        INSERT INTO nodes (type, display_name, name, description, version, properties)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      for (const node of nodes) {
        stmt.run(
          node.type,
          node.displayName,
          node.name,
          node.description,
          node.version,
          JSON.stringify(node.properties)
        );
      }
    })();
    
    const duration = Date.now() - start;
    
    // Adjust for CI environment
    const threshold = process.env.CI ? 500 : 200;
    expect(duration).toBeLessThan(threshold);
    
    // Verify all inserted
    const count = await db.prepare('SELECT COUNT(*) as count FROM nodes').get();
    expect(count.count).toBe(1000);
  });
  
  it('should query with indexes efficiently', async () => {
    // Insert test data
    await seedTestData(db, 5000);
    
    // Ensure indexes exist
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_nodes_package ON nodes(package);
      CREATE INDEX IF NOT EXISTS idx_nodes_category ON nodes(category);
    `);
    
    const start = Date.now();
    
    // Query using index
    const results = await db.prepare(`
      SELECT * FROM nodes 
      WHERE package = ? AND category = ?
      LIMIT 100
    `).all('n8n-nodes-base', 'transform');
    
    const duration = Date.now() - start;
    
    const threshold = process.env.CI ? 50 : 20;
    expect(duration).toBeLessThan(threshold);
    expect(results.length).toBeGreaterThan(0);
  });
});
```

### 3. Memory Efficiency Tests
```typescript
it('should handle memory efficiently during large operations', async () => {
  const initialMemory = process.memoryUsage().heapUsed;
  
  // Perform memory-intensive operation
  const batchSize = 100;
  const batches = 10;
  
  for (let batch = 0; batch < batches; batch++) {
    const nodes = generateTestNodes(batchSize);
    await repository.saveNodes(nodes);
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }
  
  const finalMemory = process.memoryUsage().heapUsed;
  const memoryIncrease = finalMemory - initialMemory;
  
  // Memory increase should be reasonable
  const maxIncreaseMB = 50;
  expect(memoryIncrease / 1024 / 1024).toBeLessThan(maxIncreaseMB);
});
```

### 4. Connection Pool Performance
```typescript
it('should handle concurrent connections efficiently', async () => {
  const operations = 100;
  const concurrency = 10;
  
  const start = Date.now();
  
  // Run operations in batches
  const batches = Math.ceil(operations / concurrency);
  
  for (let i = 0; i < batches; i++) {
    const promises = [];
    
    for (let j = 0; j < concurrency && i * concurrency + j < operations; j++) {
      promises.push(
        repository.getNode(`n8n-nodes-base.httpRequest`)
      );
    }
    
    await Promise.all(promises);
  }
  
  const duration = Date.now() - start;
  
  // Should handle concurrent operations efficiently
  const threshold = process.env.CI ? 1000 : 500;
  expect(duration).toBeLessThan(threshold);
  
  // Average time per operation should be low
  const avgTime = duration / operations;
  expect(avgTime).toBeLessThan(10);
});
```

### 5. Performance Monitoring Helper
```typescript
// Helper to track performance metrics
class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();
  
  measure<T>(name: string, fn: () => T): T {
    const start = performance.now();
    try {
      return fn();
    } finally {
      const duration = performance.now() - start;
      if (!this.metrics.has(name)) {
        this.metrics.set(name, []);
      }
      this.metrics.get(name)!.push(duration);
    }
  }
  
  async measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      const duration = performance.now() - start;
      if (!this.metrics.has(name)) {
        this.metrics.set(name, []);
      }
      this.metrics.get(name)!.push(duration);
    }
  }
  
  getStats(name: string) {
    const times = this.metrics.get(name) || [];
    if (times.length === 0) return null;
    
    return {
      count: times.length,
      min: Math.min(...times),
      max: Math.max(...times),
      avg: times.reduce((a, b) => a + b, 0) / times.length,
      p95: this.percentile(times, 0.95),
      p99: this.percentile(times, 0.99)
    };
  }
  
  private percentile(arr: number[], p: number): number {
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[index];
  }
}
```

## Testing Strategy
1. Use environment-aware thresholds
2. Isolate performance tests from external factors
3. Use in-memory databases for consistency
4. Monitor memory usage in addition to time
5. Test both average and worst-case scenarios

## Dependencies
- All other agents should complete fixes first
- Performance baselines depend on optimized code

## Success Metrics
- [ ] All 15 performance tests pass
- [ ] CI and local thresholds properly configured
- [ ] No memory leaks detected
- [ ] Consistent performance across runs
- [ ] P95 latency within acceptable range

## Progress Tracking
Create `/tests/integration/fixes/agent-5-progress.md` and update after each fix:
```markdown
# Agent 5 Progress

## Fixed Tests - MCP Performance
- [ ] should handle large node lists efficiently
- [ ] should handle large workflow validation efficiently

## Fixed Tests - Database Performance  
- [ ] Bulk insert performance
- [ ] Query optimization with indexes
- [ ] Connection pool efficiency
- [ ] Memory usage during large operations
- [ ] Concurrent read performance
- [ ] Transaction performance
- [ ] Full-text search performance
- [ ] Join query performance
- [ ] Aggregation performance
- [ ] Update performance
- [ ] Delete performance
- [ ] Vacuum performance
- [ ] Cache effectiveness

## Blockers
- None yet

## Performance Improvements
- [List optimizations made]
- [Document new thresholds]
```