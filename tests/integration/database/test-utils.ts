import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { execSync } from 'child_process';

export interface TestDatabaseOptions {
  mode: 'memory' | 'file';
  name?: string;
  enableWAL?: boolean;
  enableFTS5?: boolean;
}

export class TestDatabase {
  private db: Database.Database | null = null;
  private dbPath?: string;
  private options: TestDatabaseOptions;

  constructor(options: TestDatabaseOptions = { mode: 'memory' }) {
    this.options = options;
  }

  async initialize(): Promise<Database.Database> {
    if (this.db) return this.db;

    if (this.options.mode === 'file') {
      const testDir = path.join(__dirname, '../../../.test-dbs');
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      this.dbPath = path.join(testDir, this.options.name || `test-${Date.now()}.db`);
      this.db = new Database(this.dbPath);
    } else {
      this.db = new Database(':memory:');
    }

    // Enable WAL mode for file databases
    if (this.options.mode === 'file' && this.options.enableWAL !== false) {
      this.db.exec('PRAGMA journal_mode = WAL');
    }

    // Load FTS5 extension if requested
    if (this.options.enableFTS5) {
      // FTS5 is built into SQLite by default in better-sqlite3
      try {
        this.db.exec('CREATE VIRTUAL TABLE test_fts USING fts5(content)');
        this.db.exec('DROP TABLE test_fts');
      } catch (error) {
        throw new Error('FTS5 extension not available');
      }
    }

    // Apply schema
    await this.applySchema();

    return this.db;
  }

  private async applySchema(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const schemaPath = path.join(__dirname, '../../../src/database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    
    // Execute schema statements one by one
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const statement of statements) {
      this.db.exec(statement);
    }
  }

  getDatabase(): Database.Database {
    if (!this.db) throw new Error('Database not initialized');
    return this.db;
  }

  async cleanup(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }

    if (this.dbPath && fs.existsSync(this.dbPath)) {
      fs.unlinkSync(this.dbPath);
      // Also remove WAL and SHM files if they exist
      const walPath = `${this.dbPath}-wal`;
      const shmPath = `${this.dbPath}-shm`;
      if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
      if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
    }
  }

  // Helper method to check if database is locked
  isLocked(): boolean {
    if (!this.db) return false;
    try {
      this.db.exec('BEGIN IMMEDIATE');
      this.db.exec('ROLLBACK');
      return false;
    } catch (error: any) {
      return error.code === 'SQLITE_BUSY';
    }
  }
}

// Performance measurement utilities
export class PerformanceMonitor {
  private measurements: Map<string, number[]> = new Map();

  start(label: string): () => void {
    const startTime = process.hrtime.bigint();
    return () => {
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1_000_000; // Convert to milliseconds
      
      if (!this.measurements.has(label)) {
        this.measurements.set(label, []);
      }
      this.measurements.get(label)!.push(duration);
    };
  }

  getStats(label: string): {
    count: number;
    total: number;
    average: number;
    min: number;
    max: number;
    median: number;
  } | null {
    const durations = this.measurements.get(label);
    if (!durations || durations.length === 0) return null;

    const sorted = [...durations].sort((a, b) => a - b);
    const total = durations.reduce((sum, d) => sum + d, 0);

    return {
      count: durations.length,
      total,
      average: total / durations.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      median: sorted[Math.floor(sorted.length / 2)]
    };
  }

  clear(): void {
    this.measurements.clear();
  }
}

// Data generation utilities
export class TestDataGenerator {
  static generateNode(overrides: any = {}): any {
    return {
      name: `testNode${Math.random().toString(36).substr(2, 9)}`,
      displayName: 'Test Node',
      description: 'A test node for integration testing',
      version: 1,
      typeVersion: 1,
      type: 'n8n-nodes-base.testNode',
      package: 'n8n-nodes-base',
      category: ['automation'],
      properties: [],
      credentials: [],
      ...overrides
    };
  }

  static generateNodes(count: number, template: any = {}): any[] {
    return Array.from({ length: count }, (_, i) => 
      this.generateNode({
        ...template,
        name: `testNode${i}`,
        displayName: `Test Node ${i}`,
        type: `n8n-nodes-base.testNode${i}`
      })
    );
  }

  static generateTemplate(overrides: any = {}): any {
    return {
      id: Math.floor(Math.random() * 100000),
      name: `Test Workflow ${Math.random().toString(36).substr(2, 9)}`,
      totalViews: Math.floor(Math.random() * 1000),
      nodeTypes: ['n8n-nodes-base.webhook', 'n8n-nodes-base.httpRequest'],
      categories: [{ id: 1, name: 'automation' }],
      description: 'A test workflow template',
      workflowInfo: {
        nodeCount: 5,
        webhookCount: 1
      },
      ...overrides
    };
  }

  static generateTemplates(count: number): any[] {
    return Array.from({ length: count }, () => this.generateTemplate());
  }
}

// Transaction test utilities
export async function runInTransaction<T>(
  db: Database.Database,
  fn: () => T
): Promise<T> {
  db.exec('BEGIN');
  try {
    const result = await fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

// Concurrent access simulation
export async function simulateConcurrentAccess(
  dbPath: string,
  workerCount: number,
  operations: number,
  workerScript: string
): Promise<{ success: number; failed: number; duration: number }> {
  const startTime = Date.now();
  const results = { success: 0, failed: 0 };

  // Create worker processes
  const workers = Array.from({ length: workerCount }, (_, i) => {
    return new Promise<void>((resolve) => {
      try {
        const output = execSync(
          `node -e "${workerScript}"`,
          {
            env: {
              ...process.env,
              DB_PATH: dbPath,
              WORKER_ID: i.toString(),
              OPERATIONS: operations.toString()
            }
          }
        );
        results.success++;
      } catch (error) {
        results.failed++;
      }
      resolve();
    });
  });

  await Promise.all(workers);

  return {
    ...results,
    duration: Date.now() - startTime
  };
}

// Database integrity check
export function checkDatabaseIntegrity(db: Database.Database): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  try {
    // Run integrity check
    const result = db.prepare('PRAGMA integrity_check').all();
    if (result.length !== 1 || result[0].integrity_check !== 'ok') {
      errors.push('Database integrity check failed');
    }

    // Check foreign key constraints
    const fkResult = db.prepare('PRAGMA foreign_key_check').all();
    if (fkResult.length > 0) {
      errors.push(`Foreign key violations: ${JSON.stringify(fkResult)}`);
    }

    // Check for orphaned records
    const orphanedDocs = db.prepare(`
      SELECT COUNT(*) as count FROM node_docs 
      WHERE node_name NOT IN (SELECT name FROM nodes)
    `).get() as { count: number };
    
    if (orphanedDocs.count > 0) {
      errors.push(`Found ${orphanedDocs.count} orphaned documentation records`);
    }

  } catch (error: any) {
    errors.push(`Integrity check error: ${error.message}`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// Mock data for testing
export const MOCK_NODES = {
  webhook: {
    name: 'webhook',
    displayName: 'Webhook',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 1,
    description: 'Starts the workflow when a webhook is called',
    category: ['trigger'],
    package: 'n8n-nodes-base',
    properties: [
      {
        displayName: 'HTTP Method',
        name: 'httpMethod',
        type: 'options',
        options: [
          { name: 'GET', value: 'GET' },
          { name: 'POST', value: 'POST' }
        ],
        default: 'GET'
      }
    ]
  },
  httpRequest: {
    name: 'httpRequest',
    displayName: 'HTTP Request',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 1,
    description: 'Makes an HTTP request and returns the response',
    category: ['automation'],
    package: 'n8n-nodes-base',
    properties: [
      {
        displayName: 'URL',
        name: 'url',
        type: 'string',
        required: true,
        default: ''
      }
    ]
  }
};