import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { TestDatabase, TestDataGenerator, runInTransaction } from './test-utils';

describe('Database Transactions', () => {
  let testDb: TestDatabase;
  let db: Database.Database;

  beforeEach(async () => {
    testDb = new TestDatabase({ mode: 'memory' });
    db = await testDb.initialize();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  describe('Basic Transactions', () => {
    it('should commit transaction successfully', async () => {
      const node = TestDataGenerator.generateNode();

      db.exec('BEGIN');
      
      db.prepare(`
        INSERT INTO nodes (name, type, display_name, package, version, type_version, data)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        node.name,
        node.type,
        node.displayName,
        node.package,
        node.version,
        node.typeVersion,
        JSON.stringify(node)
      );

      // Data should be visible within transaction
      const countInTx = db.prepare('SELECT COUNT(*) as count FROM nodes').get() as { count: number };
      expect(countInTx.count).toBe(1);

      db.exec('COMMIT');

      // Data should persist after commit
      const countAfter = db.prepare('SELECT COUNT(*) as count FROM nodes').get() as { count: number };
      expect(countAfter.count).toBe(1);
    });

    it('should rollback transaction on error', async () => {
      const node = TestDataGenerator.generateNode();

      db.exec('BEGIN');
      
      db.prepare(`
        INSERT INTO nodes (name, type, display_name, package, version, type_version, data)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        node.name,
        node.type,
        node.displayName,
        node.package,
        node.version,
        node.typeVersion,
        JSON.stringify(node)
      );

      // Rollback
      db.exec('ROLLBACK');

      // Data should not persist
      const count = db.prepare('SELECT COUNT(*) as count FROM nodes').get() as { count: number };
      expect(count.count).toBe(0);
    });

    it('should handle transaction helper function', async () => {
      const node = TestDataGenerator.generateNode();

      // Successful transaction
      await runInTransaction(db, () => {
        db.prepare(`
          INSERT INTO nodes (name, type, display_name, package, version, type_version, data)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          node.name,
          node.type,
          node.displayName,
          node.package,
          node.version,
          node.typeVersion,
          JSON.stringify(node)
        );
      });

      const count = db.prepare('SELECT COUNT(*) as count FROM nodes').get() as { count: number };
      expect(count.count).toBe(1);

      // Failed transaction
      await expect(runInTransaction(db, () => {
        db.prepare('INSERT INTO invalid_table VALUES (1)').run();
      })).rejects.toThrow();

      // Count should remain the same
      const countAfterError = db.prepare('SELECT COUNT(*) as count FROM nodes').get() as { count: number };
      expect(countAfterError.count).toBe(1);
    });
  });

  describe('Nested Transactions (Savepoints)', () => {
    it('should handle nested transactions with savepoints', async () => {
      const nodes = TestDataGenerator.generateNodes(3);

      db.exec('BEGIN');

      // Insert first node
      const insertStmt = db.prepare(`
        INSERT INTO nodes (name, type, display_name, package, version, type_version, data)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      insertStmt.run(
        nodes[0].name,
        nodes[0].type,
        nodes[0].displayName,
        nodes[0].package,
        nodes[0].version,
        nodes[0].typeVersion,
        JSON.stringify(nodes[0])
      );

      // Create savepoint
      db.exec('SAVEPOINT sp1');

      // Insert second node
      insertStmt.run(
        nodes[1].name,
        nodes[1].type,
        nodes[1].displayName,
        nodes[1].package,
        nodes[1].version,
        nodes[1].typeVersion,
        JSON.stringify(nodes[1])
      );

      // Create another savepoint
      db.exec('SAVEPOINT sp2');

      // Insert third node
      insertStmt.run(
        nodes[2].name,
        nodes[2].type,
        nodes[2].displayName,
        nodes[2].package,
        nodes[2].version,
        nodes[2].typeVersion,
        JSON.stringify(nodes[2])
      );

      // Should have 3 nodes
      let count = db.prepare('SELECT COUNT(*) as count FROM nodes').get() as { count: number };
      expect(count.count).toBe(3);

      // Rollback to sp2
      db.exec('ROLLBACK TO sp2');

      // Should have 2 nodes
      count = db.prepare('SELECT COUNT(*) as count FROM nodes').get() as { count: number };
      expect(count.count).toBe(2);

      // Rollback to sp1
      db.exec('ROLLBACK TO sp1');

      // Should have 1 node
      count = db.prepare('SELECT COUNT(*) as count FROM nodes').get() as { count: number };
      expect(count.count).toBe(1);

      // Commit main transaction
      db.exec('COMMIT');

      // Should still have 1 node
      count = db.prepare('SELECT COUNT(*) as count FROM nodes').get() as { count: number };
      expect(count.count).toBe(1);
    });

    it('should release savepoints properly', async () => {
      db.exec('BEGIN');
      db.exec('SAVEPOINT sp1');
      db.exec('SAVEPOINT sp2');
      
      // Release sp2
      db.exec('RELEASE sp2');
      
      // Can still rollback to sp1
      db.exec('ROLLBACK TO sp1');
      
      // But cannot rollback to sp2
      expect(() => {
        db.exec('ROLLBACK TO sp2');
      }).toThrow(/no such savepoint/);

      db.exec('COMMIT');
    });
  });

  describe('Transaction Isolation', () => {
    it('should handle IMMEDIATE transactions', async () => {
      testDb = new TestDatabase({ mode: 'file', name: 'test-immediate.db' });
      db = await testDb.initialize();

      // Start immediate transaction (acquires write lock immediately)
      db.exec('BEGIN IMMEDIATE');

      // Insert data
      const node = TestDataGenerator.generateNode();
      db.prepare(`
        INSERT INTO nodes (name, type, display_name, package, version, type_version, data)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        node.name,
        node.type,
        node.displayName,
        node.package,
        node.version,
        node.typeVersion,
        JSON.stringify(node)
      );

      // Another connection should not be able to write
      const dbPath = db.name;
      const conn2 = new Database(dbPath);
      conn2.exec('PRAGMA busy_timeout = 100');

      expect(() => {
        conn2.exec('BEGIN IMMEDIATE');
      }).toThrow(/database is locked/);

      db.exec('COMMIT');
      conn2.close();
    });

    it('should handle EXCLUSIVE transactions', async () => {
      testDb = new TestDatabase({ mode: 'file', name: 'test-exclusive.db' });
      db = await testDb.initialize();

      // Start exclusive transaction (prevents other connections from reading)
      db.exec('BEGIN EXCLUSIVE');

      // Another connection should not be able to start any transaction
      const dbPath = db.name;
      const conn2 = new Database(dbPath);
      conn2.exec('PRAGMA busy_timeout = 100');

      expect(() => {
        conn2.exec('BEGIN');
        conn2.prepare('SELECT COUNT(*) FROM nodes').get();
      }).toThrow();

      db.exec('COMMIT');
      conn2.close();
    });
  });

  describe('Transaction with Better-SQLite3 API', () => {
    it('should use transaction() method for automatic handling', () => {
      const nodes = TestDataGenerator.generateNodes(5);

      const insertMany = db.transaction((nodes: any[]) => {
        const stmt = db.prepare(`
          INSERT INTO nodes (name, type, display_name, package, version, type_version, data)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        for (const node of nodes) {
          stmt.run(
            node.name,
            node.type,
            node.displayName,
            node.package,
            node.version,
            node.typeVersion,
            JSON.stringify(node)
          );
        }

        return nodes.length;
      });

      // Execute transaction
      const inserted = insertMany(nodes);
      expect(inserted).toBe(5);

      // Verify all inserted
      const count = db.prepare('SELECT COUNT(*) as count FROM nodes').get() as { count: number };
      expect(count.count).toBe(5);
    });

    it('should rollback transaction() on error', () => {
      const nodes = TestDataGenerator.generateNodes(3);

      const insertWithError = db.transaction((nodes: any[]) => {
        const stmt = db.prepare(`
          INSERT INTO nodes (name, type, display_name, package, version, type_version, data)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        for (let i = 0; i < nodes.length; i++) {
          if (i === 2) {
            // Cause an error on third insert
            throw new Error('Simulated error');
          }
          const node = nodes[i];
          stmt.run(
            node.name,
            node.type,
            node.displayName,
            node.package,
            node.version,
            node.typeVersion,
            JSON.stringify(node)
          );
        }
      });

      // Should throw and rollback
      expect(() => insertWithError(nodes)).toThrow('Simulated error');

      // No nodes should be inserted
      const count = db.prepare('SELECT COUNT(*) as count FROM nodes').get() as { count: number };
      expect(count.count).toBe(0);
    });

    it('should handle immediate transactions with transaction()', () => {
      const insertImmediate = db.transaction((node: any) => {
        db.prepare(`
          INSERT INTO nodes (name, type, display_name, package, version, type_version, data)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          node.name,
          node.type,
          node.displayName,
          node.package,
          node.version,
          node.typeVersion,
          JSON.stringify(node)
        );
      }).immediate();

      const node = TestDataGenerator.generateNode();
      insertImmediate(node);

      const count = db.prepare('SELECT COUNT(*) as count FROM nodes').get() as { count: number };
      expect(count.count).toBe(1);
    });

    it('should handle exclusive transactions with transaction()', () => {
      const readExclusive = db.transaction(() => {
        return db.prepare('SELECT COUNT(*) as count FROM nodes').get() as { count: number };
      }).exclusive();

      const result = readExclusive();
      expect(result.count).toBe(0);
    });
  });

  describe('Transaction Performance', () => {
    it('should show performance benefit of transactions for bulk inserts', () => {
      const nodes = TestDataGenerator.generateNodes(1000);
      const stmt = db.prepare(`
        INSERT INTO nodes (name, type, display_name, package, version, type_version, data)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      // Without transaction
      const start1 = process.hrtime.bigint();
      for (let i = 0; i < 100; i++) {
        const node = nodes[i];
        stmt.run(
          node.name,
          node.type,
          node.displayName,
          node.package,
          node.version,
          node.typeVersion,
          JSON.stringify(node)
        );
      }
      const duration1 = Number(process.hrtime.bigint() - start1) / 1_000_000;

      // With transaction
      const start2 = process.hrtime.bigint();
      const insertMany = db.transaction((nodes: any[]) => {
        for (const node of nodes) {
          stmt.run(
            node.name,
            node.type,
            node.displayName,
            node.package,
            node.version,
            node.typeVersion,
            JSON.stringify(node)
          );
        }
      });
      insertMany(nodes.slice(100, 1000));
      const duration2 = Number(process.hrtime.bigint() - start2) / 1_000_000;

      // Transaction should be significantly faster for bulk operations
      expect(duration2).toBeLessThan(duration1 * 5); // Should be at least 5x faster

      // Verify all inserted
      const count = db.prepare('SELECT COUNT(*) as count FROM nodes').get() as { count: number };
      expect(count.count).toBe(1000);
    });
  });

  describe('Transaction Error Scenarios', () => {
    it('should handle constraint violations in transactions', () => {
      const node = TestDataGenerator.generateNode();

      db.exec('BEGIN');
      
      // First insert should succeed
      db.prepare(`
        INSERT INTO nodes (name, type, display_name, package, version, type_version, data)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        node.name,
        node.type,
        node.displayName,
        node.package,
        node.version,
        node.typeVersion,
        JSON.stringify(node)
      );

      // Second insert with same name should fail (unique constraint)
      expect(() => {
        db.prepare(`
          INSERT INTO nodes (name, type, display_name, package, version, type_version, data)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          node.name, // Same name - will violate unique constraint
          node.type,
          node.displayName,
          node.package,
          node.version,
          node.typeVersion,
          JSON.stringify(node)
        );
      }).toThrow(/UNIQUE constraint failed/);

      // Can still commit the transaction with first insert
      db.exec('COMMIT');

      const count = db.prepare('SELECT COUNT(*) as count FROM nodes').get() as { count: number };
      expect(count.count).toBe(1);
    });

    it('should handle deadlock scenarios', async () => {
      // This test simulates a potential deadlock scenario
      testDb = new TestDatabase({ mode: 'file', name: 'test-deadlock.db' });
      db = await testDb.initialize();

      // Insert initial data
      const nodes = TestDataGenerator.generateNodes(2);
      const insertStmt = db.prepare(`
        INSERT INTO nodes (name, type, display_name, package, version, type_version, data)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      nodes.forEach(node => {
        insertStmt.run(
          node.name,
          node.type,
          node.displayName,
          node.package,
          node.version,
          node.typeVersion,
          JSON.stringify(node)
        );
      });

      // Connection 1 updates node 0 then tries to update node 1
      // Connection 2 updates node 1 then tries to update node 0
      // This would cause a deadlock in a traditional RDBMS

      const dbPath = db.name;
      const conn1 = new Database(dbPath);
      const conn2 = new Database(dbPath);

      // Set short busy timeout to fail fast
      conn1.exec('PRAGMA busy_timeout = 100');
      conn2.exec('PRAGMA busy_timeout = 100');

      // Start transactions
      conn1.exec('BEGIN IMMEDIATE');
      
      // Conn1 updates first node
      conn1.prepare('UPDATE nodes SET data = ? WHERE name = ?').run(
        JSON.stringify({ updated: 1 }),
        nodes[0].name
      );

      // Try to start transaction on conn2 (should fail due to IMMEDIATE lock)
      expect(() => {
        conn2.exec('BEGIN IMMEDIATE');
      }).toThrow(/database is locked/);

      conn1.exec('COMMIT');
      conn1.close();
      conn2.close();
    });
  });
});