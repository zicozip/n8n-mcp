import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { execSync } from 'child_process';
import type { DatabaseAdapter } from '../../../src/database/database-adapter';

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

  static async createIsolated(options: TestDatabaseOptions = { mode: 'memory' }): Promise<TestDatabase> {
    const testDb = new TestDatabase({
      ...options,
      name: options.name || `isolated-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.db`
    });
    await testDb.initialize();
    return testDb;
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
    const nodeName = overrides.name || `testNode${Math.random().toString(36).substr(2, 9)}`;
    return {
      nodeType: overrides.nodeType || `n8n-nodes-base.${nodeName}`,
      packageName: overrides.packageName || overrides.package || 'n8n-nodes-base',
      displayName: overrides.displayName || 'Test Node',
      description: overrides.description || 'A test node for integration testing',
      category: overrides.category || 'automation',
      developmentStyle: overrides.developmentStyle || overrides.style || 'programmatic',
      isAITool: overrides.isAITool || false,
      isTrigger: overrides.isTrigger || false,
      isWebhook: overrides.isWebhook || false,
      isVersioned: overrides.isVersioned !== undefined ? overrides.isVersioned : true,
      version: overrides.version || '1',
      documentation: overrides.documentation || null,
      properties: overrides.properties || [],
      operations: overrides.operations || [],
      credentials: overrides.credentials || [],
      ...overrides
    };
  }

  static generateNodes(count: number, template: any = {}): any[] {
    return Array.from({ length: count }, (_, i) => 
      this.generateNode({
        ...template,
        name: `testNode${i}`,
        displayName: `Test Node ${i}`,
        nodeType: `n8n-nodes-base.testNode${i}`
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
    const result = db.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check: string }>;
    if (result.length !== 1 || result[0].integrity_check !== 'ok') {
      errors.push('Database integrity check failed');
    }

    // Check foreign key constraints
    const fkResult = db.prepare('PRAGMA foreign_key_check').all();
    if (fkResult.length > 0) {
      errors.push(`Foreign key violations: ${JSON.stringify(fkResult)}`);
    }

    // Check table existence
    const tables = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type = 'table' AND name = 'nodes'
    `).all();
    
    if (tables.length === 0) {
      errors.push('nodes table does not exist');
    }

  } catch (error: any) {
    errors.push(`Integrity check error: ${error.message}`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// Helper to create a proper DatabaseAdapter from better-sqlite3 instance
export function createTestDatabaseAdapter(db: Database.Database): DatabaseAdapter {
  return {
    prepare: (sql: string) => {
      const stmt = db.prepare(sql);
      return {
        run: (...params: any[]) => stmt.run(...params),
        get: (...params: any[]) => stmt.get(...params),
        all: (...params: any[]) => stmt.all(...params),
        iterate: (...params: any[]) => stmt.iterate(...params),
        pluck: function(enabled?: boolean) { stmt.pluck(enabled); return this; },
        expand: function(enabled?: boolean) { stmt.expand?.(enabled); return this; },
        raw: function(enabled?: boolean) { stmt.raw?.(enabled); return this; },
        columns: () => stmt.columns?.() || [],
        bind: function(...params: any[]) { stmt.bind(...params); return this; }
      } as any;
    },
    exec: (sql: string) => db.exec(sql),
    close: () => db.close(),
    pragma: (key: string, value?: any) => db.pragma(key, value),
    get inTransaction() { return db.inTransaction; },
    transaction: <T>(fn: () => T) => db.transaction(fn)(),
    checkFTS5Support: () => {
      try {
        db.exec('CREATE VIRTUAL TABLE test_fts5_check USING fts5(content)');
        db.exec('DROP TABLE test_fts5_check');
        return true;
      } catch {
        return false;
      }
    }
  };
}

// Mock data for testing
export const MOCK_NODES = {
  webhook: {
    nodeType: 'n8n-nodes-base.webhook',
    packageName: 'n8n-nodes-base',
    displayName: 'Webhook',
    description: 'Starts the workflow when a webhook is called',
    category: 'trigger',
    developmentStyle: 'programmatic',
    isAITool: false,
    isTrigger: true,
    isWebhook: true,
    isVersioned: true,
    version: '1',
    documentation: 'Webhook documentation',
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
    ],
    operations: [],
    credentials: []
  },
  httpRequest: {
    nodeType: 'n8n-nodes-base.httpRequest',
    packageName: 'n8n-nodes-base',
    displayName: 'HTTP Request',
    description: 'Makes an HTTP request and returns the response',
    category: 'automation',
    developmentStyle: 'programmatic',
    isAITool: false,
    isTrigger: false,
    isWebhook: false,
    isVersioned: true,
    version: '1',
    documentation: 'HTTP Request documentation',
    properties: [
      {
        displayName: 'URL',
        name: 'url',
        type: 'string',
        required: true,
        default: ''
      }
    ],
    operations: [],
    credentials: []
  }
};