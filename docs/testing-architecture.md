# n8n-MCP Testing Architecture

## Executive Summary

This document outlines a comprehensive testing strategy for the n8n-MCP project, designed to improve from the current 2.45% coverage to a target of 80%+ coverage while ensuring reliability, maintainability, and performance.

## Current State Analysis

### Problems Identified
- **Low Coverage**: 2.45% overall coverage
- **Failing Tests**: HTTP server authentication tests failing
- **No CI/CD**: No automated testing pipeline
- **Mixed Test Types**: Tests scattered without clear organization
- **No Mocking Strategy**: Direct dependencies on SQLite, n8n packages
- **No Performance Testing**: No benchmarks for critical operations

## Testing Framework Strategy

### Primary Framework: Vitest (Replacing Jest)

**Rationale for Vitest over Jest:**
- **Speed**: 10-100x faster for large test suites
- **Native ESM Support**: Better alignment with modern TypeScript
- **Built-in Mocking**: Superior mocking capabilities
- **Watch Mode**: Instant feedback during development
- **Compatibility**: Jest-compatible API for easy migration
- **Type Safety**: Better TypeScript integration

### Supporting Frameworks

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup/global-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        'tests/**',
        'scripts/**'
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80
      }
    },
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true
      }
    },
    testTimeout: 30000,
    hookTimeout: 30000
  }
});
```

## Directory Structure

```
tests/
├── unit/                      # Unit tests (70% of tests)
│   ├── loaders/
│   │   ├── node-loader.test.ts
│   │   └── __mocks__/
│   │       └── n8n-nodes-base.ts
│   ├── parsers/
│   │   ├── node-parser.test.ts
│   │   └── property-extractor.test.ts
│   ├── services/
│   │   ├── property-filter.test.ts
│   │   ├── config-validator.test.ts
│   │   └── workflow-validator.test.ts
│   └── database/
│       ├── node-repository.test.ts
│       └── __mocks__/
│           └── better-sqlite3.ts
├── integration/               # Integration tests (20%)
│   ├── mcp/
│   │   ├── server.test.ts
│   │   └── tools.test.ts
│   ├── n8n-api/
│   │   ├── workflow-crud.test.ts
│   │   └── webhook-trigger.test.ts
│   └── database/
│       ├── sqlite-operations.test.ts
│       └── fts5-search.test.ts
├── e2e/                       # End-to-end tests (10%)
│   ├── workflows/
│   │   ├── complete-workflow.test.ts
│   │   └── ai-agent-workflow.test.ts
│   └── mcp-protocol/
│       └── full-session.test.ts
├── performance/               # Performance benchmarks
│   ├── node-loading.bench.ts
│   ├── search.bench.ts
│   └── validation.bench.ts
├── fixtures/                  # Test data
│   ├── nodes/
│   │   ├── http-request.json
│   │   └── slack.json
│   ├── workflows/
│   │   ├── simple.json
│   │   └── complex-ai.json
│   └── factories/
│       ├── node.factory.ts
│       └── workflow.factory.ts
├── setup/                     # Test configuration
│   ├── global-setup.ts
│   ├── test-containers.ts
│   └── test-database.ts
└── utils/                     # Test utilities
    ├── mocks/
    │   ├── mcp-sdk.ts
    │   └── express.ts
    ├── builders/
    │   ├── node.builder.ts
    │   └── workflow.builder.ts
    └── helpers/
        ├── async.ts
        └── assertions.ts
```

## Mock Strategy

### 1. Database Mocking

```typescript
// tests/unit/database/__mocks__/better-sqlite3.ts
import { vi } from 'vitest';

export class Database {
  private data = new Map<string, any[]>();
  
  prepare = vi.fn((sql: string) => ({
    all: vi.fn(() => this.data.get('nodes') || []),
    get: vi.fn((params) => this.data.get('nodes')?.find(n => n.id === params.id)),
    run: vi.fn(),
    finalize: vi.fn()
  }));
  
  exec = vi.fn();
  close = vi.fn();
  
  // Test helper to set mock data
  setMockData(table: string, data: any[]) {
    this.data.set(table, data);
  }
}

export default vi.fn(() => new Database());
```

### 2. n8n Package Mocking

```typescript
// tests/unit/loaders/__mocks__/n8n-nodes-base.ts
import { vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load real node definitions for testing
const mockNodes = JSON.parse(
  readFileSync(join(__dirname, '../../fixtures/nodes/mock-nodes.json'), 'utf8')
);

export const loadClassInIsolation = vi.fn((filePath: string) => {
  const nodeName = filePath.split('/').pop()?.replace('.node.js', '');
  return mockNodes[nodeName] || { description: { properties: [] } };
});

export const NodeHelpers = {
  getVersionedNodeTypeAll: vi.fn(() => [])
};
```

### 3. External API Mocking

```typescript
// tests/utils/mocks/axios.ts
import { vi } from 'vitest';
import type { AxiosRequestConfig } from 'axios';

export const createAxiosMock = () => {
  const mock = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    create: vi.fn(() => mock)
  };
  
  // Default responses
  mock.get.mockResolvedValue({ data: { success: true } });
  mock.post.mockResolvedValue({ data: { id: '123' } });
  
  return mock;
};
```

## Test Data Management

### 1. Factory Pattern

```typescript
// tests/fixtures/factories/node.factory.ts
import { Factory } from 'fishery';
import type { INodeType } from 'n8n-workflow';

export const nodeFactory = Factory.define<INodeType>(({ sequence }) => ({
  name: `TestNode${sequence}`,
  displayName: `Test Node ${sequence}`,
  group: ['test'],
  version: 1,
  description: 'Test node for unit tests',
  defaults: {
    name: `Test Node ${sequence}`,
  },
  inputs: ['main'],
  outputs: ['main'],
  properties: [
    {
      displayName: 'Test Property',
      name: 'testProp',
      type: 'string',
      default: '',
    }
  ]
}));

// Usage in tests:
const httpNode = nodeFactory.build({
  name: 'HttpRequest',
  properties: [/* custom properties */]
});
```

### 2. Builder Pattern

```typescript
// tests/utils/builders/workflow.builder.ts
export class WorkflowBuilder {
  private workflow = {
    name: 'Test Workflow',
    nodes: [],
    connections: {},
    settings: {}
  };
  
  withName(name: string) {
    this.workflow.name = name;
    return this;
  }
  
  addNode(node: any) {
    this.workflow.nodes.push(node);
    return this;
  }
  
  connect(from: string, to: string) {
    this.workflow.connections[from] = {
      main: [[{ node: to, type: 'main', index: 0 }]]
    };
    return this;
  }
  
  build() {
    return this.workflow;
  }
}
```

## CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/test.yml
name: Test Suite

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18.x, 20.x]
        test-suite: [unit, integration, e2e]
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: ${{ matrix.node-version }}
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Build project
      run: npm run build
    
    - name: Run ${{ matrix.test-suite }} tests
      run: npm run test:${{ matrix.test-suite }}
      env:
        CI: true
    
    - name: Upload coverage
      if: matrix.test-suite == 'unit' && matrix.node-version == '20.x'
      uses: codecov/codecov-action@v4
      with:
        file: ./coverage/lcov.info
        flags: unittests
        name: codecov-umbrella

  performance:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 20.x
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run benchmarks
      run: npm run bench
    
    - name: Store benchmark result
      uses: benchmark-action/github-action-benchmark@v1
      with:
        tool: 'vitest'
        output-file-path: bench-results.json
        github-token: ${{ secrets.GITHUB_TOKEN }}
        auto-push: true

  quality:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
    
    - name: Install dependencies
      run: npm ci
    
    - name: Lint
      run: npm run lint
    
    - name: Type check
      run: npm run typecheck
    
    - name: Check coverage thresholds
      run: npm run test:coverage:check
```

## Testing Phases and Priorities

### Phase 1: Foundation (Weeks 1-2)
1. **Setup Vitest** and migrate existing tests
2. **Create mock infrastructure** for SQLite and n8n packages
3. **Setup CI/CD** pipeline with basic checks
4. **Target: 20% coverage**

### Phase 2: Core Unit Tests (Weeks 3-4)
1. **Test critical services**: validators, parsers, loaders
2. **Database layer** with full mocking
3. **MCP tools** unit tests
4. **Target: 50% coverage**

### Phase 3: Integration Tests (Weeks 5-6)
1. **MCP protocol** integration tests
2. **n8n API** integration with test containers
3. **Database operations** with real SQLite
4. **Target: 70% coverage**

### Phase 4: E2E & Performance (Weeks 7-8)
1. **Complete workflow** scenarios
2. **Performance benchmarks** for critical paths
3. **Error handling** scenarios
4. **Target: 80%+ coverage**

## Performance Testing

```typescript
// tests/performance/node-loading.bench.ts
import { bench, describe } from 'vitest';
import { NodeLoader } from '@/loaders/node-loader';

describe('Node Loading Performance', () => {
  bench('Load single node', async () => {
    const loader = new NodeLoader();
    await loader.loadNode('n8n-nodes-base.httpRequest');
  });
  
  bench('Load all nodes', async () => {
    const loader = new NodeLoader();
    await loader.loadAllNodes();
  }, {
    iterations: 10,
    time: 5000 // 5 second time budget
  });
  
  bench('Parse complex node', async () => {
    const parser = new NodeParser();
    await parser.parseNode(complexNodeFixture);
  });
});
```

## Error Testing Strategy

```typescript
// tests/unit/services/error-scenarios.test.ts
describe('Error Handling', () => {
  it('should handle network failures gracefully', async () => {
    const api = new N8nAPIClient();
    mockAxios.get.mockRejectedValue(new Error('Network error'));
    
    await expect(api.getWorkflow('123'))
      .rejects.toThrow('Failed to fetch workflow');
    
    expect(logger.error).toHaveBeenCalledWith(
      'Network error while fetching workflow',
      expect.any(Error)
    );
  });
  
  it('should handle malformed data', () => {
    const validator = new ConfigValidator();
    const malformed = { nodes: 'not-an-array' };
    
    const result = validator.validate(malformed);
    
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('nodes must be an array');
  });
});
```

## Coverage Enforcement

```json
// package.json scripts
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:e2e": "vitest run tests/e2e",
    "test:coverage": "vitest run --coverage",
    "test:coverage:check": "vitest run --coverage --coverage.thresholdAutoUpdate=false",
    "test:watch": "vitest watch",
    "bench": "vitest bench",
    "bench:compare": "vitest bench --compare"
  }
}
```

## Monitoring and Reporting

### 1. Coverage Badges
```markdown
![Coverage](https://codecov.io/gh/username/n8n-mcp/branch/main/graph/badge.svg)
![Tests](https://github.com/username/n8n-mcp/actions/workflows/test.yml/badge.svg)
```

### 2. Performance Tracking
- Automated benchmark comparisons on PRs
- Performance regression alerts
- Historical performance graphs

### 3. Test Reports
- HTML coverage reports
- Failed test summaries in PRs
- Flaky test detection

## Migration Path from Current State

1. **Week 1**: Setup Vitest, migrate existing tests
2. **Week 2**: Create mock infrastructure
3. **Week 3-4**: Write unit tests for critical paths
4. **Week 5-6**: Add integration tests
5. **Week 7-8**: E2E tests and performance benchmarks

## Success Metrics

- **Coverage**: 80%+ overall, 90%+ for critical paths
- **Performance**: All operations under 100ms
- **Reliability**: Zero flaky tests
- **CI Time**: Full suite under 5 minutes
- **Developer Experience**: Tests run in <1 second locally