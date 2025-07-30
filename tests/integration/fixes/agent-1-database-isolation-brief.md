# Agent 1: Database Isolation Fix Brief

## Assignment
Fix 9 failing tests related to database isolation and transaction handling.

## Files to Fix
- `tests/integration/database/node-repository.test.ts` (1 test)
- `tests/integration/database/transactions.test.ts` (estimated 3 tests)
- `tests/integration/database/connection-management.test.ts` (estimated 3 tests)
- `tests/integration/database/template-repository.test.ts` (estimated 2 tests)

## Specific Failures to Address

### 1. node-repository.test.ts
```
FAIL: Transaction handling > should handle errors gracefully
Issue: Expected function to throw an error but it didn't
Line: 530
```

### 2. Common Issues Across Database Tests
- Database disk image corruption
- UNIQUE constraint violations
- Concurrent access conflicts
- Transaction rollback failures

## Root Causes
1. **Shared Database State**: Tests are using the same database instance
2. **Missing Cleanup**: Database connections not properly closed
3. **Race Conditions**: Concurrent tests accessing same tables
4. **Transaction Overlap**: Transactions from different tests interfering

## Recommended Fixes

### 1. Implement Test Database Isolation
```typescript
// In each test file's beforeEach
let db: Database;
let repository: NodeRepository;

beforeEach(async () => {
  // Create unique in-memory database for each test
  const dbName = `:memory:test-${Date.now()}-${Math.random()}`;
  db = new Database(dbName);
  
  // Initialize schema
  await initializeSchema(db);
  
  // Create repository with isolated database
  repository = new NodeRepository(db);
});

afterEach(async () => {
  // Ensure proper cleanup
  if (db) {
    await db.close();
    db = null;
  }
});
```

### 2. Fix Transaction Error Test
```typescript
// In node-repository.test.ts around line 530
it('should handle errors gracefully', async () => {
  // Create a scenario that will cause an error
  // For example, close the database connection
  await db.close();
  
  // Now operations should throw
  await expect(repository.saveNode(testNode)).rejects.toThrow(/database.*closed/i);
  
  // Reopen for cleanup
  db = new Database(':memory:');
});
```

### 3. Add Connection Pool Management
```typescript
// In connection-management.test.ts
class ConnectionPool {
  private connections: Map<string, Database> = new Map();
  
  getConnection(id: string): Database {
    if (!this.connections.has(id)) {
      this.connections.set(id, new Database(`:memory:${id}`));
    }
    return this.connections.get(id)!;
  }
  
  async closeAll() {
    for (const [id, conn] of this.connections) {
      await conn.close();
    }
    this.connections.clear();
  }
}
```

### 4. Implement Proper Transaction Isolation
```typescript
// In transactions.test.ts
async function withTransaction<T>(
  db: Database, 
  callback: (tx: Transaction) => Promise<T>
): Promise<T> {
  const tx = db.transaction();
  try {
    const result = await callback(tx);
    tx.commit();
    return result;
  } catch (error) {
    tx.rollback();
    throw error;
  }
}
```

## Testing Strategy
1. Run each test file in isolation first
2. Verify no database files are left after tests
3. Run tests in parallel to ensure isolation works
4. Check for any performance regression

## Dependencies
- May need to update shared test utilities
- Coordinate with Agent 4 (FTS5) on any schema changes

## Success Metrics
- [ ] All 9 database isolation tests pass
- [ ] No test leaves database artifacts
- [ ] Tests can run in parallel without conflicts
- [ ] Transaction error handling works correctly

## Progress Tracking
Create `/tests/integration/fixes/agent-1-progress.md` and update after each fix:
```markdown
# Agent 1 Progress

## Fixed Tests
- [ ] node-repository.test.ts - Transaction error handling
- [ ] transactions.test.ts - Test 1
- [ ] transactions.test.ts - Test 2
- [ ] transactions.test.ts - Test 3
- [ ] connection-management.test.ts - Test 1
- [ ] connection-management.test.ts - Test 2
- [ ] connection-management.test.ts - Test 3
- [ ] template-repository.test.ts - Test 1
- [ ] template-repository.test.ts - Test 2

## Blockers
- None yet

## Notes
- [Add any discoveries or important changes]
```