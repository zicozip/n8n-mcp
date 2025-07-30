# Agent 4: FTS5 Search Fix Brief

## Assignment
Fix 7 failing tests related to FTS5 (Full-Text Search) functionality.

## Files to Fix
- `tests/integration/database/fts5-search.test.ts` (7 tests)

## Specific Failures to Address

### 1. Multi-Column Search (3 retries)
```
FAIL: should search across multiple columns
Expected: 1 result
Actual: 2 results (getting both id:3 and id:1)
Line: 157
```

### 2. NOT Queries (3 retries)
```
FAIL: should support NOT queries
Expected: results.length > 0
Actual: 0 results
Line: 185
```

### 3. FTS Update Trigger (3 retries)
```
FAIL: should automatically sync FTS on update
Error: SqliteError: database disk image is malformed
```

### 4. FTS Delete Trigger (3 retries)
```
FAIL: should automatically sync FTS on delete
Expected: count to be 0
Actual: count is 1 (FTS not synced after delete)
Line: 470
```

### 5. Large Dataset Performance (3 retries)
```
FAIL: should handle large dataset searches efficiently
Error: UNIQUE constraint failed: templates.workflow_id
```

### 6. FTS Index Rebuild (3 retries)
```
FAIL: should optimize rebuilding FTS index
Similar constraint/performance issues
```

### 7. Empty Search Terms (2 retries)
```
FAIL: should handle empty search terms
Test logic or assertion issue
```

## Root Causes
1. **FTS Synchronization**: Triggers not properly syncing FTS table with source
2. **Query Construction**: NOT queries and multi-column searches incorrectly built
3. **Data Constraints**: Test data violating UNIQUE constraints
4. **Database Corruption**: Shared database state causing corruption

## Recommended Fixes

### 1. Fix Multi-Column Search
```typescript
// The issue is likely in how the FTS query is constructed
it('should search across multiple columns', async () => {
  // Ensure clean state
  await db.exec('DELETE FROM templates');
  await db.exec('DELETE FROM templates_fts');
  
  // Insert test data
  await db.prepare(`
    INSERT INTO templates (workflow_id, name, description, nodes, workflow_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    'wf-1',
    'Email Workflow',
    'Send emails automatically',
    JSON.stringify(['Gmail', 'SendGrid']),
    '{}'
  );
  
  await db.prepare(`
    INSERT INTO templates (workflow_id, name, description, nodes, workflow_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    'wf-2',
    'Data Processing',
    'Process data with email notifications',
    JSON.stringify(['Transform', 'Filter']),
    '{}'
  );
  
  // Search for "email" - should only match first template
  const results = await db.prepare(`
    SELECT t.* FROM templates t
    JOIN templates_fts fts ON t.workflow_id = fts.workflow_id
    WHERE templates_fts MATCH 'email'
    ORDER BY rank
  `).all();
  
  expect(results).toHaveLength(1);
  expect(results[0].workflow_id).toBe('wf-1');
});
```

### 2. Fix NOT Query Support
```typescript
it('should support NOT queries', async () => {
  // Clear and setup data
  await db.exec('DELETE FROM templates');
  await db.exec('DELETE FROM templates_fts');
  
  // Insert templates with and without "webhook"
  const templates = [
    { id: 'wf-1', name: 'Webhook Handler', description: 'Handle webhooks' },
    { id: 'wf-2', name: 'Data Processor', description: 'Process data' },
    { id: 'wf-3', name: 'Email Sender', description: 'Send emails' }
  ];
  
  for (const t of templates) {
    await db.prepare(`
      INSERT INTO templates (workflow_id, name, description, nodes, workflow_json)
      VALUES (?, ?, ?, '[]', '{}')
    `).run(t.id, t.name, t.description);
  }
  
  // FTS5 NOT query syntax
  const results = await db.prepare(`
    SELECT t.* FROM templates t
    JOIN templates_fts fts ON t.workflow_id = fts.workflow_id
    WHERE templates_fts MATCH 'NOT webhook'
    ORDER BY t.workflow_id
  `).all();
  
  expect(results.length).toBe(2);
  expect(results.every((r: any) => !r.name.toLowerCase().includes('webhook'))).toBe(true);
});
```

### 3. Fix FTS Trigger Synchronization
```typescript
// Ensure triggers are properly created
async function createFTSTriggers(db: Database): Promise<void> {
  // Drop existing triggers
  await db.exec(`
    DROP TRIGGER IF EXISTS templates_ai;
    DROP TRIGGER IF EXISTS templates_au;
    DROP TRIGGER IF EXISTS templates_ad;
  `);
  
  // Insert trigger
  await db.exec(`
    CREATE TRIGGER templates_ai AFTER INSERT ON templates
    BEGIN
      INSERT INTO templates_fts (workflow_id, name, description, nodes)
      VALUES (new.workflow_id, new.name, new.description, new.nodes);
    END;
  `);
  
  // Update trigger
  await db.exec(`
    CREATE TRIGGER templates_au AFTER UPDATE ON templates
    BEGIN
      UPDATE templates_fts 
      SET name = new.name, 
          description = new.description, 
          nodes = new.nodes
      WHERE workflow_id = new.workflow_id;
    END;
  `);
  
  // Delete trigger
  await db.exec(`
    CREATE TRIGGER templates_ad AFTER DELETE ON templates
    BEGIN
      DELETE FROM templates_fts WHERE workflow_id = old.workflow_id;
    END;
  `);
}

// In the update test
it('should automatically sync FTS on update', async () => {
  // Ensure triggers exist
  await createFTSTriggers(db);
  
  // Insert initial data
  const workflowId = `test-update-${Date.now()}`;
  await db.prepare(`
    INSERT INTO templates (workflow_id, name, description, nodes, workflow_json)
    VALUES (?, 'Original Name', 'Original Description', '[]', '{}')
  `).run(workflowId);
  
  // Update the template
  await db.prepare(`
    UPDATE templates 
    SET name = 'Updated Webhook Handler'
    WHERE workflow_id = ?
  `).run(workflowId);
  
  // Search for "webhook" in FTS
  const results = await db.prepare(`
    SELECT * FROM templates_fts WHERE templates_fts MATCH 'webhook'
  `).all();
  
  expect(results).toHaveLength(1);
  expect(results[0].name).toBe('Updated Webhook Handler');
});
```

### 4. Fix Delete Synchronization
```typescript
it('should automatically sync FTS on delete', async () => {
  // Ensure triggers exist
  await createFTSTriggers(db);
  
  const workflowId = `test-delete-${Date.now()}`;
  
  // Insert template
  await db.prepare(`
    INSERT INTO templates (workflow_id, name, description, nodes, workflow_json)
    VALUES (?, 'Deletable Template', 'Will be deleted', '[]', '{}')
  `).run(workflowId);
  
  // Verify it's in FTS
  const before = await db.prepare(
    'SELECT COUNT(*) as count FROM templates_fts WHERE workflow_id = ?'
  ).get(workflowId);
  expect(before.count).toBe(1);
  
  // Delete from main table
  await db.prepare('DELETE FROM templates WHERE workflow_id = ?').run(workflowId);
  
  // Verify it's removed from FTS
  const after = await db.prepare(
    'SELECT COUNT(*) as count FROM templates_fts WHERE workflow_id = ?'
  ).get(workflowId);
  expect(after.count).toBe(0);
});
```

### 5. Fix Large Dataset Test
```typescript
it('should handle large dataset searches efficiently', async () => {
  // Clear existing data
  await db.exec('DELETE FROM templates');
  await db.exec('DELETE FROM templates_fts');
  
  // Insert many templates with unique IDs
  const stmt = db.prepare(`
    INSERT INTO templates (workflow_id, name, description, nodes, workflow_json)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  for (let i = 0; i < 1000; i++) {
    stmt.run(
      `perf-test-${i}-${Date.now()}`, // Ensure unique workflow_id
      `Template ${i}`,
      i % 10 === 0 ? 'Contains webhook keyword' : 'Regular template',
      JSON.stringify([`Node${i}`]),
      '{}'
    );
  }
  
  const start = Date.now();
  const results = await db.prepare(`
    SELECT t.* FROM templates t
    JOIN templates_fts fts ON t.workflow_id = fts.workflow_id
    WHERE templates_fts MATCH 'webhook'
  `).all();
  const duration = Date.now() - start;
  
  expect(results).toHaveLength(100); // 10% have "webhook"
  expect(duration).toBeLessThan(100); // Should be fast
});
```

### 6. Handle Empty Search Terms
```typescript
it('should handle empty search terms', async () => {
  // Empty string should either return all or throw error
  try {
    const results = await db.prepare(`
      SELECT * FROM templates_fts WHERE templates_fts MATCH ?
    `).all('');
    
    // If it doesn't throw, it should return empty
    expect(results).toHaveLength(0);
  } catch (error: any) {
    // FTS5 might throw on empty query
    expect(error.message).toMatch(/syntax|empty|invalid/i);
  }
});
```

## Testing Strategy
1. Isolate each test with clean database state
2. Ensure FTS triggers are properly created
3. Use unique IDs to avoid constraint violations
4. Test both positive and negative cases

## Dependencies
- Coordinate with Agent 1 on database isolation strategy
- FTS schema must match main table schema

## Success Metrics
- [ ] All 7 FTS5 tests pass
- [ ] FTS stays synchronized with source table
- [ ] Performance tests complete under threshold
- [ ] No database corruption errors

## Progress Tracking
Create `/tests/integration/fixes/agent-4-progress.md` and update after each fix:
```markdown
# Agent 4 Progress

## Fixed Tests
- [ ] should search across multiple columns
- [ ] should support NOT queries
- [ ] should automatically sync FTS on update
- [ ] should automatically sync FTS on delete
- [ ] should handle large dataset searches efficiently
- [ ] should optimize rebuilding FTS index
- [ ] should handle empty search terms

## Blockers
- None yet

## Notes
- [Document any FTS-specific findings]
- [Note trigger modifications]
```