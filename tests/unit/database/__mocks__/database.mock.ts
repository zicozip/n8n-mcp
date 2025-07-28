import { vi } from 'vitest';
import type { Database } from 'better-sqlite3';

export interface MockDatabase extends Partial<Database> {
  prepare: ReturnType<typeof vi.fn>;
  exec: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
  pragma: ReturnType<typeof vi.fn>;
  backup: ReturnType<typeof vi.fn>;
  serialize: ReturnType<typeof vi.fn>;
  function: ReturnType<typeof vi.fn>;
  aggregate: ReturnType<typeof vi.fn>;
  table: ReturnType<typeof vi.fn>;
  loadExtension: ReturnType<typeof vi.fn>;
  defaultSafeIntegers: ReturnType<typeof vi.fn>;
  unsafeMode: ReturnType<typeof vi.fn>;
}

export interface MockStatement {
  run: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  all: ReturnType<typeof vi.fn>;
  iterate: ReturnType<typeof vi.fn>;
  pluck: ReturnType<typeof vi.fn>;
  expand: ReturnType<typeof vi.fn>;
  raw: ReturnType<typeof vi.fn>;
  columns: ReturnType<typeof vi.fn>;
  bind: ReturnType<typeof vi.fn>;
  safeIntegers: ReturnType<typeof vi.fn>;
}

export function createMockDatabase(): MockDatabase {
  const mockDb: MockDatabase = {
    prepare: vi.fn(),
    exec: vi.fn(),
    close: vi.fn(),
    transaction: vi.fn(),
    pragma: vi.fn(),
    backup: vi.fn(),
    serialize: vi.fn(),
    function: vi.fn(),
    aggregate: vi.fn(),
    table: vi.fn(),
    loadExtension: vi.fn(),
    defaultSafeIntegers: vi.fn(),
    unsafeMode: vi.fn(),
    memory: false,
    readonly: false,
    name: ':memory:',
    open: true,
    inTransaction: false,
  };

  // Setup default behavior
  mockDb.transaction.mockImplementation((fn: Function) => {
    return (...args: any[]) => fn(...args);
  });

  mockDb.pragma.mockReturnValue(undefined);

  return mockDb;
}

export function createMockStatement(defaultResults: any = []): MockStatement {
  const mockStmt: MockStatement = {
    run: vi.fn().mockReturnValue({ changes: 1, lastInsertRowid: 1 }),
    get: vi.fn().mockReturnValue(defaultResults[0] || undefined),
    all: vi.fn().mockReturnValue(defaultResults),
    iterate: vi.fn().mockReturnValue(defaultResults[Symbol.iterator]()),
    pluck: vi.fn().mockReturnThis(),
    expand: vi.fn().mockReturnThis(),
    raw: vi.fn().mockReturnThis(),
    columns: vi.fn().mockReturnValue([]),
    bind: vi.fn().mockReturnThis(),
    safeIntegers: vi.fn().mockReturnThis(),
  };

  return mockStmt;
}

export function setupDatabaseMock(mockDb: MockDatabase, queryResults: Record<string, any> = {}) {
  mockDb.prepare.mockImplementation((query: string) => {
    // Match queries to results
    for (const [pattern, result] of Object.entries(queryResults)) {
      if (query.includes(pattern)) {
        return createMockStatement(Array.isArray(result) ? result : [result]);
      }
    }
    // Default mock statement
    return createMockStatement();
  });
}

// Helper to create a mock node repository
export function createMockNodeRepository() {
  return {
    getNodeByType: vi.fn(),
    searchNodes: vi.fn(),
    listNodes: vi.fn(),
    getNodeEssentials: vi.fn(),
    getNodeDocumentation: vi.fn(),
    getNodeInfo: vi.fn(),
    searchNodeProperties: vi.fn(),
    listAITools: vi.fn(),
    getNodeForTask: vi.fn(),
    listTasks: vi.fn(),
    getDatabaseStatistics: vi.fn(),
    close: vi.fn(),
  };
}

// Helper to create mock node data
export function createMockNode(overrides: any = {}) {
  return {
    id: 1,
    package_name: 'n8n-nodes-base',
    node_type: 'n8n-nodes-base.webhook',
    display_name: 'Webhook',
    description: 'Starts the workflow when a webhook is called',
    version: 2,
    defaults: JSON.stringify({ name: 'Webhook' }),
    properties: JSON.stringify([]),
    credentials: JSON.stringify([]),
    inputs: JSON.stringify(['main']),
    outputs: JSON.stringify(['main']),
    type_version: 2,
    is_trigger: 1,
    is_regular: 0,
    is_webhook: 1,
    webhook_path: '/webhook',
    full_metadata: JSON.stringify({}),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// Helper to create mock query results
export function createMockQueryResults() {
  return {
    'SELECT * FROM nodes WHERE node_type = ?': createMockNode(),
    'SELECT COUNT(*) as count FROM nodes': { count: 525 },
    'SELECT * FROM nodes WHERE display_name LIKE ?': [
      createMockNode({ node_type: 'n8n-nodes-base.slack', display_name: 'Slack' }),
      createMockNode({ node_type: 'n8n-nodes-base.webhook', display_name: 'Webhook' }),
    ],
  };
}