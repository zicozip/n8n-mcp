# n8n-MCP Testing Architecture

## Overview

This document describes the comprehensive testing infrastructure implemented for the n8n-MCP project. The testing suite includes 3,336 tests split between unit and integration tests, benchmarks, and a complete CI/CD pipeline ensuring code quality and reliability.

### Test Suite Statistics (October 2025)

- **Total Tests**: 3,336 tests
  - **Unit Tests**: 2,766 tests - Isolated component testing with mocks
  - **Integration Tests**: 570 tests - Full system behavior validation
    - n8n API Integration: 172 tests (all 18 MCP handler tools)
    - MCP Protocol: 119 tests (protocol compliance, session management)
    - Database: 226 tests (repository operations, transactions, FTS5)
    - Templates: 35 tests (fetching, storage, metadata)
    - Docker: 18 tests (configuration, security)
- **Test Files**:
  - 106 unit test files
  - 41 integration test files
  - Total: 147 test files
- **Test Execution Time**:
  - Unit tests: ~2 minutes with coverage
  - Integration tests: ~30 seconds
  - Total CI time: ~3 minutes
- **Success Rate**: 100% (all tests passing in CI)
- **CI/CD Pipeline**: Fully automated with GitHub Actions
- **Test Artifacts**: JUnit XML, coverage reports, benchmark results
- **Parallel Execution**: Configurable with thread pool

## Testing Framework: Vitest

We use **Vitest** as our primary testing framework, chosen for its:
- **Speed**: Native ESM support and fast execution
- **TypeScript Integration**: First-class TypeScript support
- **Watch Mode**: Instant feedback during development
- **Jest Compatibility**: Easy migration from Jest
- **Built-in Mocking**: Powerful mocking capabilities
- **Coverage**: Integrated code coverage with v8

### Configuration

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup/global-setup.ts'],
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: process.env.TEST_PARALLEL !== 'true',
        maxThreads: parseInt(process.env.TEST_MAX_WORKERS || '4', 10)
      }
    },
    coverage: {
      provider: 'v8',
      reporter: ['lcov', 'html', 'text-summary'],
      exclude: ['node_modules/', 'tests/', '**/*.test.ts', 'scripts/']
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tests': path.resolve(__dirname, './tests')
    }
  }
});
```

## Directory Structure

```
tests/
├── unit/                        # Unit tests with mocks (2,766 tests, 106 files)
│   ├── __mocks__/              # Mock implementations
│   │   └── n8n-nodes-base.test.ts
│   ├── database/               # Database layer tests
│   │   ├── database-adapter-unit.test.ts
│   │   ├── node-repository-core.test.ts
│   │   └── template-repository-core.test.ts
│   ├── docker/                 # Docker configuration tests
│   │   ├── config-security.test.ts
│   │   ├── edge-cases.test.ts
│   │   ├── parse-config.test.ts
│   │   └── serve-command.test.ts
│   ├── http-server/            # HTTP server tests
│   │   └── multi-tenant-support.test.ts
│   ├── loaders/                # Node loader tests
│   │   └── node-loader.test.ts
│   ├── mappers/                # Data mapper tests
│   │   └── docs-mapper.test.ts
│   ├── mcp/                    # MCP server and tools tests
│   │   ├── handlers-n8n-manager.test.ts
│   │   ├── handlers-workflow-diff.test.ts
│   │   ├── tools-documentation.test.ts
│   │   └── tools.test.ts
│   ├── parsers/                # Parser tests
│   │   ├── node-parser.test.ts
│   │   ├── property-extractor.test.ts
│   │   └── simple-parser.test.ts
│   ├── scripts/                # Script tests
│   │   └── fetch-templates-extraction.test.ts
│   ├── services/               # Service layer tests (largest test suite)
│   │   ├── config-validator.test.ts
│   │   ├── enhanced-config-validator.test.ts
│   │   ├── example-generator.test.ts
│   │   ├── expression-validator.test.ts
│   │   ├── n8n-api-client.test.ts
│   │   ├── n8n-validation.test.ts
│   │   ├── node-specific-validators.test.ts
│   │   ├── property-dependencies.test.ts
│   │   ├── property-filter.test.ts
│   │   ├── task-templates.test.ts
│   │   ├── workflow-diff-engine.test.ts
│   │   ├── workflow-validator-comprehensive.test.ts
│   │   └── workflow-validator.test.ts
│   ├── telemetry/              # Telemetry tests
│   │   └── telemetry-manager.test.ts
│   └── utils/                  # Utility function tests
│       ├── cache-utils.test.ts
│       └── database-utils.test.ts
├── integration/                 # Integration tests (570 tests, 41 files)
│   ├── n8n-api/                # n8n API integration tests (172 tests, 18 files)
│   │   ├── executions/         # Execution management tests
│   │   │   ├── get-execution.test.ts
│   │   │   └── list-executions.test.ts
│   │   ├── system/             # System tool tests
│   │   │   ├── diagnostic.test.ts
│   │   │   ├── health-check.test.ts
│   │   │   └── list-tools.test.ts
│   │   ├── utils/              # Test utilities
│   │   │   ├── mcp-context.ts
│   │   │   └── response-types.ts
│   │   └── workflows/          # Workflow management tests
│   │       ├── autofix-workflow.test.ts
│   │       ├── create-workflow.test.ts
│   │       ├── delete-workflow.test.ts
│   │       ├── get-workflow-details.test.ts
│   │       ├── get-workflow-minimal.test.ts
│   │       ├── get-workflow-structure.test.ts
│   │       ├── get-workflow.test.ts
│   │       ├── list-workflows.test.ts
│   │       ├── update-full-workflow.test.ts
│   │       ├── update-partial-workflow.test.ts
│   │       └── validate-workflow.test.ts
│   ├── database/               # Database integration tests (226 tests)
│   │   ├── connection-management.test.ts
│   │   ├── fts5-search.test.ts
│   │   ├── node-repository.test.ts
│   │   ├── performance.test.ts
│   │   ├── template-node-configs.test.ts
│   │   ├── template-repository.test.ts
│   │   └── transactions.test.ts
│   ├── docker/                 # Docker integration tests (18 tests)
│   │   ├── docker-config.test.ts
│   │   └── docker-entrypoint.test.ts
│   ├── mcp-protocol/           # MCP protocol tests (119 tests)
│   │   ├── basic-connection.test.ts
│   │   ├── error-handling.test.ts
│   │   ├── performance.test.ts
│   │   ├── protocol-compliance.test.ts
│   │   ├── session-management.test.ts
│   │   ├── tool-invocation.test.ts
│   │   └── workflow-error-validation.test.ts
│   ├── templates/              # Template tests (35 tests)
│   │   └── metadata-operations.test.ts
│   └── setup/                  # Integration test setup
│       ├── integration-setup.ts
│       └── msw-test-server.ts
├── benchmarks/                  # Performance benchmarks
│   ├── database-queries.bench.ts
│   └── sample.bench.ts
├── setup/                       # Global test configuration
│   ├── global-setup.ts         # Global test setup
│   ├── msw-setup.ts            # Mock Service Worker setup
│   └── test-env.ts             # Test environment configuration
├── utils/                       # Test utilities
│   ├── assertions.ts           # Custom assertions
│   ├── builders/               # Test data builders
│   │   └── workflow.builder.ts
│   ├── data-generators.ts      # Test data generators
│   ├── database-utils.ts       # Database test utilities
│   └── test-helpers.ts         # General test helpers
├── mocks/                       # Mock implementations
│   └── n8n-api/               # n8n API mocks
│       ├── handlers.ts        # MSW request handlers
│       └── data/              # Mock data
└── fixtures/                    # Test fixtures
    ├── database/               # Database fixtures
    ├── factories/              # Data factories
    └── workflows/              # Workflow fixtures
```

## Mock Strategy

### 1. Mock Service Worker (MSW) for API Mocking

We use MSW for intercepting and mocking HTTP requests:

```typescript
// tests/mocks/n8n-api/handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  // Workflow endpoints
  http.get('*/workflows/:id', ({ params }) => {
    const workflow = mockWorkflows.find(w => w.id === params.id);
    if (!workflow) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json(workflow);
  }),

  // Execution endpoints
  http.post('*/workflows/:id/run', async ({ params, request }) => {
    const body = await request.json();
    return HttpResponse.json({
      executionId: generateExecutionId(),
      status: 'running'
    });
  })
];
```

### 2. Database Mocking

For unit tests, we mock the database layer:

```typescript
// tests/unit/__mocks__/better-sqlite3.ts
import { vi } from 'vitest';

export default vi.fn(() => ({
  prepare: vi.fn(() => ({
    all: vi.fn().mockReturnValue([]),
    get: vi.fn().mockReturnValue(undefined),
    run: vi.fn().mockReturnValue({ changes: 1 }),
    finalize: vi.fn()
  })),
  exec: vi.fn(),
  close: vi.fn(),
  pragma: vi.fn()
}));
```

### 3. MCP SDK Mocking

For testing MCP protocol interactions:

```typescript
// tests/integration/mcp-protocol/test-helpers.ts
export class TestableN8NMCPServer extends N8NMCPServer {
  private transports = new Set<Transport>();
  
  async connectToTransport(transport: Transport): Promise<void> {
    this.transports.add(transport);
    await this.connect(transport);
  }
  
  async close(): Promise<void> {
    for (const transport of this.transports) {
      await transport.close();
    }
    this.transports.clear();
  }
}
```

## Test Patterns and Utilities

### 1. Database Test Utilities

```typescript
// tests/utils/database-utils.ts
export class TestDatabase {
  constructor(options: TestDatabaseOptions = {}) {
    this.options = {
      mode: 'memory',
      enableFTS5: true,
      ...options
    };
  }

  async initialize(): Promise<Database.Database> {
    const db = this.options.mode === 'memory' 
      ? new Database(':memory:') 
      : new Database(this.dbPath);
    
    if (this.options.enableFTS5) {
      await this.enableFTS5(db);
    }
    
    return db;
  }
}
```

### 2. Data Generators

```typescript
// tests/utils/data-generators.ts
export class TestDataGenerator {
  static generateNode(overrides: Partial<ParsedNode> = {}): ParsedNode {
    return {
      nodeType: `test.node${faker.number.int()}`,
      displayName: faker.commerce.productName(),
      description: faker.lorem.sentence(),
      properties: this.generateProperties(5),
      ...overrides
    };
  }

  static generateWorkflow(nodeCount = 3): any {
    const nodes = Array.from({ length: nodeCount }, (_, i) => ({
      id: `node_${i}`,
      type: 'test.node',
      position: [i * 100, 0],
      parameters: {}
    }));
    
    return { nodes, connections: {} };
  }
}
```

### 3. Custom Assertions

```typescript
// tests/utils/assertions.ts
export function expectValidMCPResponse(response: any): void {
  expect(response).toBeDefined();
  expect(response.content).toBeDefined();
  expect(Array.isArray(response.content)).toBe(true);
  expect(response.content[0]).toHaveProperty('type', 'text');
  expect(response.content[0]).toHaveProperty('text');
}

export function expectNodeStructure(node: any): void {
  expect(node).toHaveProperty('nodeType');
  expect(node).toHaveProperty('displayName');
  expect(node).toHaveProperty('properties');
  expect(Array.isArray(node.properties)).toBe(true);
}
```

## Unit Testing

Our unit tests focus on testing individual components in isolation with mocked dependencies:

### Service Layer Tests

The bulk of our unit tests (400+ tests) are in the services layer:

```typescript
// tests/unit/services/workflow-validator-comprehensive.test.ts
describe('WorkflowValidator Comprehensive Tests', () => {
  it('should validate complex workflow with AI nodes', () => {
    const workflow = {
      nodes: [
        {
          id: 'ai_agent',
          type: '@n8n/n8n-nodes-langchain.agent',
          parameters: { prompt: 'Analyze data' }
        }
      ],
      connections: {}
    };
    
    const result = validator.validateWorkflow(workflow);
    expect(result.valid).toBe(true);
  });
});
```

### Parser Tests

Testing the node parsing logic:

```typescript
// tests/unit/parsers/property-extractor.test.ts
describe('PropertyExtractor', () => {
  it('should extract nested properties correctly', () => {
    const node = {
      properties: [
        {
          displayName: 'Options',
          name: 'options',
          type: 'collection',
          options: [
            { name: 'timeout', type: 'number' }
          ]
        }
      ]
    };
    
    const extracted = extractor.extractProperties(node);
    expect(extracted).toHaveProperty('options.timeout');
  });
});
```

### Mock Testing

Testing our mock implementations:

```typescript
// tests/unit/__mocks__/n8n-nodes-base.test.ts
describe('n8n-nodes-base mock', () => {
  it('should provide mocked node definitions', () => {
    const httpNode = mockNodes['n8n-nodes-base.httpRequest'];
    expect(httpNode).toBeDefined();
    expect(httpNode.description.displayName).toBe('HTTP Request');
  });
});
```

## Integration Testing

Our integration tests verify the complete system behavior across 570 tests in four major categories:

### n8n API Integration Testing (172 tests)

The n8n API integration tests verify all 18 MCP handler tools against a real n8n instance. These tests ensure our product layer (MCP handlers) work correctly end-to-end, not just the raw API client.

**Test Organization:**
- **Workflows** (11 handlers): Create, read, update (full/partial), delete, list, validate, autofix
- **Executions** (2 handlers): Get execution details, list executions
- **System** (3 handlers): Health check, list available tools, diagnostics

**Example:**
```typescript
// tests/integration/n8n-api/workflows/create-workflow.test.ts
describe('Integration: handleCreateWorkflow', () => {
  it('should create a simple two-node workflow', async () => {
    const response = await handleCreateWorkflow(
      {
        params: {
          arguments: {
            name: 'Test Workflow',
            nodes: [webhook, setNode],
            connections: { Webhook: { main: [[{ node: 'Set', type: 'main', index: 0 }]] } }
          }
        }
      },
      mcpContext
    );

    expect(response.success).toBe(true);
    const workflow = response.data as WorkflowData;
    expect(workflow.id).toBeDefined();
    expect(workflow.nodes).toHaveLength(2);

    // Cleanup
    await handleDeleteWorkflow({ params: { arguments: { id: workflow.id } } }, mcpContext);
  });
});
```

**Key Features Tested:**
- Real workflow creation, modification, deletion with cleanup
- TypeScript type safety with response interfaces
- Complete coverage of all 18 n8n API tools
- Proper error handling and edge cases
- Response format validation

### MCP Protocol Testing (119 tests)

```typescript
// tests/integration/mcp-protocol/tool-invocation.test.ts
describe('MCP Tool Invocation', () => {
  let mcpServer: TestableN8NMCPServer;
  let client: Client;

  beforeEach(async () => {
    mcpServer = new TestableN8NMCPServer();
    await mcpServer.initialize();

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await mcpServer.connectToTransport(serverTransport);

    client = new Client({ name: 'test-client', version: '1.0.0' }, {});
    await client.connect(clientTransport);
  });

  it('should list nodes with filtering', async () => {
    const response = await client.callTool({
      name: 'list_nodes',
      arguments: { category: 'trigger', limit: 10 }
    });

    expectValidMCPResponse(response);
    const result = JSON.parse(response.content[0].text);
    expect(result.nodes).toHaveLength(10);
    expect(result.nodes.every(n => n.category === 'trigger')).toBe(true);
  });
});
```

### Database Integration Testing (226 tests)

```typescript
// tests/integration/database/fts5-search.test.ts
describe('FTS5 Search Integration', () => {
  it('should perform fuzzy search', async () => {
    const results = await nodeRepo.searchNodes('HTT', 'FUZZY');

    expect(results.some(n => n.nodeType.includes('httpRequest'))).toBe(true);
    expect(results.some(n => n.displayName.includes('HTTP'))).toBe(true);
  });

  it('should handle complex boolean queries', async () => {
    const results = await nodeRepo.searchNodes('webhook OR http', 'OR');

    expect(results.length).toBeGreaterThan(0);
    expect(results.some(n =>
      n.description?.includes('webhook') ||
      n.description?.includes('http')
    )).toBe(true);
  });
});
```

### Template Integration Testing (35 tests)

Tests template fetching, storage, and metadata operations against the n8n.io API and local database.

### Docker Integration Testing (18 tests)

Tests Docker configuration parsing, entrypoint script, and security validation.

## Test Distribution and Coverage

### Test Distribution by Component

Based on our 3,336 tests:

**Integration Tests (570 tests):**
1. **n8n API Integration** (172 tests)
   - Workflow management handlers: 11 tools with comprehensive scenarios
   - Execution management handlers: 2 tools
   - System tool handlers: 3 tools
   - TypeScript type safety with response interfaces

2. **Database Integration** (226 tests)
   - Repository operations and transactions
   - FTS5 full-text search with fuzzy matching
   - Performance and concurrent access tests
   - Template node configurations

3. **MCP Protocol** (119 tests)
   - Protocol compliance and session management
   - Tool invocation and error handling
   - Performance and stress testing
   - Workflow error validation

4. **Templates & Docker** (53 tests)
   - Template fetching and metadata operations
   - Docker configuration and security validation

**Unit Tests (2,766 tests):**
1. **Services Layer** (largest suite)
   - `workflow-validator-comprehensive.test.ts`: 150+ tests
   - `enhanced-config-validator.test.ts`: 120+ tests
   - `node-specific-validators.test.ts`: 100+ tests
   - `n8n-api-client.test.ts`: 80+ tests
   - Config validation, property filtering, workflow diff engine

2. **Parsers** (~200 tests)
   - Node parsing with version support
   - Property extraction and documentation mapping
   - Simple parser for basic node information

3. **Database Layer** (~150 tests)
   - Repository core functionality with mocks
   - Database adapter unit tests
   - Template repository operations

4. **MCP Tools & HTTP Server** (~300 tests)
   - Tool definitions and documentation system
   - Multi-tenant support and security
   - Configuration validation

5. **Utils, Docker, Scripts, Telemetry** (remaining tests)
   - Cache utilities, database helpers
   - Docker config security and parsing
   - Template extraction scripts
   - Telemetry tracking

### Test Execution Performance

From our CI runs:
- **Fastest tests**: Unit tests with mocks (<1ms each)
- **Slowest tests**: Integration tests with real database and n8n API (100-5000ms)
- **Average test time**: ~20ms per test
- **Total suite execution**: ~3 minutes in CI (with coverage)
- **Parallel execution**: Configurable thread pool for optimal performance

## CI/CD Pipeline

Our GitHub Actions workflow runs all tests automatically:

```yaml
# .github/workflows/test.yml
name: Test Suite

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          
      - name: Install dependencies
        run: npm ci
      
      - name: Run unit tests with coverage
        run: npm run test:unit -- --coverage
        
      - name: Run integration tests
        run: npm run test:integration
        
      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v4
```

### Test Execution Scripts

```json
// package.json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration --config vitest.config.integration.ts",
    "test:coverage": "vitest run --coverage",
    "test:watch": "vitest watch",
    "test:bench": "vitest bench --config vitest.config.benchmark.ts",
    "benchmark:ci": "CI=true node scripts/run-benchmarks-ci.js"
  }
}
```

### CI Test Results Summary

From our latest CI run (#41):

```
UNIT TESTS:
 Test Files  30 passed (30)
      Tests  932 passed | 1 skipped (933)

INTEGRATION TESTS:
 Test Files  14 passed (14)
      Tests  245 passed | 4 skipped (249)

TOTAL: 1,177 passed | 5 skipped | 0 failed
```

## Performance Testing

We use Vitest's built-in benchmark functionality:

```typescript
// tests/benchmarks/database-queries.bench.ts
import { bench, describe } from 'vitest';

describe('Database Query Performance', () => {
  bench('search nodes by category', async () => {
    await nodeRepo.getNodesByCategory('trigger');
  });

  bench('FTS5 search performance', async () => {
    await nodeRepo.searchNodes('webhook http request', 'AND');
  });
});
```

## Environment Configuration

Test environment is configured via `.env.test`:

```bash
# Test Environment Configuration
NODE_ENV=test
TEST_DB_PATH=:memory:
TEST_PARALLEL=false
TEST_MAX_WORKERS=4
FEATURE_TEST_COVERAGE=true
MSW_ENABLED=true
```

## Key Patterns and Lessons Learned

### 1. Response Structure Consistency

All MCP responses follow a specific structure that must be handled correctly:

```typescript
// Common pattern for handling MCP responses
const response = await client.callTool({ name: 'list_nodes', arguments: {} });

// MCP responses have content array with text objects
expect(response.content).toBeDefined();
expect(response.content[0].type).toBe('text');

// Parse the actual data
const data = JSON.parse(response.content[0].text);
```

### 2. MSW Integration Setup

Proper MSW setup is crucial for integration tests:

```typescript
// tests/integration/setup/integration-setup.ts
import { setupServer } from 'msw/node';
import { handlers } from '@tests/mocks/n8n-api/handlers';

// Create server but don't start it globally
const server = setupServer(...handlers);

beforeAll(async () => {
  // Only start MSW for integration tests
  if (process.env.MSW_ENABLED === 'true') {
    server.listen({ onUnhandledRequest: 'bypass' });
  }
});

afterAll(async () => {
  server.close();
});
```

### 3. Database Isolation for Parallel Tests

Each test gets its own database to enable parallel execution:

```typescript
// tests/utils/database-utils.ts
export function createTestDatabaseAdapter(
  db?: Database.Database,
  options: TestDatabaseOptions = {}
): DatabaseAdapter {
  const database = db || new Database(':memory:');
  
  // Enable FTS5 if needed
  if (options.enableFTS5) {
    database.exec('PRAGMA main.compile_options;');
  }
  
  return new DatabaseAdapter(database);
}
```

### 4. Environment-Aware Performance Thresholds

CI environments are slower, so we adjust expectations:

```typescript
// Environment-aware thresholds
const getThreshold = (local: number, ci: number) => 
  process.env.CI ? ci : local;

it('should respond quickly', async () => {
  const start = performance.now();
  await someOperation();
  const duration = performance.now() - start;
  
  expect(duration).toBeLessThan(getThreshold(50, 200));
});
```

## Best Practices

### 1. Test Isolation
- Each test creates its own database instance
- Tests clean up after themselves
- No shared state between tests

### 2. Proper Cleanup Order
```typescript
afterEach(async () => {
  // Close client first to ensure no pending requests
  await client.close();
  
  // Give time for client to fully close
  await new Promise(resolve => setTimeout(resolve, 50));
  
  // Then close server
  await mcpServer.close();
  
  // Finally cleanup database
  await testDb.cleanup();
});
```

### 3. Handle Async Operations Carefully
```typescript
// Avoid race conditions in cleanup
it('should handle disconnection', async () => {
  // ... test code ...
  
  // Ensure operations complete before cleanup
  await transport.close();
  await new Promise(resolve => setTimeout(resolve, 100));
});
```

### 4. Meaningful Test Organization
- Group related tests using `describe` blocks
- Use descriptive test names that explain the behavior
- Follow AAA pattern: Arrange, Act, Assert
- Keep tests focused on single behaviors

## Debugging Tests

### Running Specific Tests
```bash
# Run a single test file
npm test tests/integration/mcp-protocol/tool-invocation.test.ts

# Run tests matching a pattern
npm test -- --grep "should list nodes"

# Run with debugging output
DEBUG=* npm test
```

### VSCode Integration
```json
// .vscode/launch.json
{
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Tests",
      "program": "${workspaceFolder}/node_modules/vitest/vitest.mjs",
      "args": ["run", "${file}"],
      "console": "integratedTerminal"
    }
  ]
}
```

## Test Coverage

While we don't enforce strict coverage thresholds yet, the infrastructure is in place:
- Coverage reports generated in `lcov`, `html`, and `text` formats
- Integration with Codecov for tracking coverage over time
- Per-file coverage visible in VSCode with extensions

## Future Improvements

1. **E2E Testing**: Add Playwright for testing the full MCP server interaction
2. **Load Testing**: Implement k6 or Artillery for stress testing
3. **Contract Testing**: Add Pact for ensuring API compatibility
4. **Visual Regression**: For any UI components that may be added
5. **Mutation Testing**: Use Stryker to ensure test quality

## Common Issues and Solutions

### 1. Tests Hanging in CI

**Problem**: Tests would hang indefinitely in CI due to `process.exit()` calls.

**Solution**: Remove all `process.exit()` calls from test code and use proper cleanup:
```typescript
// Bad
afterAll(() => {
  process.exit(0); // This causes Vitest to hang
});

// Good
afterAll(async () => {
  await cleanup();
  // Let Vitest handle process termination
});
```

### 2. MCP Response Structure

**Problem**: Tests expecting wrong response format from MCP tools.

**Solution**: Always access responses through `content[0].text`:
```typescript
// Wrong
const data = response[0].text;

// Correct
const data = JSON.parse(response.content[0].text);
```

### 3. Database Not Found Errors

**Problem**: Tests failing with "node not found" when database is empty.

**Solution**: Check for empty databases before assertions:
```typescript
const stats = await server.executeTool('get_database_statistics', {});
if (stats.totalNodes > 0) {
  expect(result.nodes.length).toBeGreaterThan(0);
} else {
  expect(result.nodes).toHaveLength(0);
}
```

### 4. MSW Loading Globally

**Problem**: MSW interfering with unit tests when loaded globally.

**Solution**: Only load MSW in integration test setup:
```typescript
// vitest.config.integration.ts
setupFiles: [
  './tests/setup/global-setup.ts',
  './tests/integration/setup/integration-setup.ts' // MSW only here
]
```

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [MSW Documentation](https://mswjs.io/)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [MCP SDK Documentation](https://modelcontextprotocol.io/)