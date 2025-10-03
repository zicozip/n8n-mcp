# Comprehensive Integration Testing Plan

## Overview

Transform the test suite to test all 17 n8n API handlers against a **real n8n instance** instead of mocks. This plan ensures 100% coverage of every tool, operation, and parameter combination to prevent bugs like the P0 workflow creation issue from slipping through.

## Critical Requirements

1. **Credentials**:
   - Local development: Read from `.env` file
   - CI/GitHub Actions: Use GitHub secrets (`N8N_URL`, `N8N_API_KEY`)

2. **Pre-activated Webhook Workflows**:
   - n8n API doesn't support workflow activation via API
   - Need pre-created, activated workflows for webhook testing
   - Store workflow IDs in `.env`:
     - `N8N_TEST_WEBHOOK_GET_ID` - Webhook with GET method
     - `N8N_TEST_WEBHOOK_POST_ID` - Webhook with POST method
     - `N8N_TEST_WEBHOOK_PUT_ID` - Webhook with PUT method
     - `N8N_TEST_WEBHOOK_DELETE_ID` - Webhook with DELETE method

3. **100% Coverage Goal**: Test EVERY tool, EVERY operation, EVERY parameter combination

---

## Complete Test Coverage Matrix

### Total Test Scenarios: ~150+

#### Workflow Management (10 handlers)

**1. `handleCreateWorkflow`** - 10+ scenarios
- Create workflow with base nodes (webhook, httpRequest, set)
- Create workflow with langchain nodes (agent, aiChain)
- Invalid node types (error handling)
- Complex multi-node workflows
- Complex connection patterns
- **P0 Bug Verification**: SHORT vs FULL node type handling
- Missing required parameters
- Duplicate node names
- Invalid connection references
- Settings variations

**2. `handleGetWorkflow`** - 3 scenarios
- Successful retrieval
- Not found (invalid ID)
- Malformed ID

**3. `handleGetWorkflowDetails`** - 4 scenarios
- Basic workflow
- Workflow with metadata
- Workflow with version history
- Workflow with execution stats

**4. `handleGetWorkflowStructure`** - 2 scenarios
- Simple workflow
- Complex workflow (verify no parameter data)

**5. `handleGetWorkflowMinimal`** - 2 scenarios
- Active workflow
- Inactive workflow

**6. `handleUpdateWorkflow`** - 8+ scenarios
- Full workflow replacement
- Update nodes
- Update connections
- Update settings
- Update tags
- Validation errors
- Concurrent update conflicts
- Large workflow updates

**7. `handleUpdatePartialWorkflow`** - 30+ scenarios (15 operations × 2 paths)

**Node Operations (12 scenarios):**
- `addNode`: Success, duplicate name, invalid type, missing position
- `removeNode`: By ID, by name, not found, with connection cleanup
- `updateNode`: By ID, by name, invalid updates, nested parameter updates
- `moveNode`: Valid position, boundary positions
- `enableNode`: Success, already enabled
- `disableNode`: Success, already disabled

**Connection Operations (10 scenarios):**
- `addConnection`: Default ports, custom ports, invalid nodes
- `removeConnection`: Success, not found, with ignoreErrors
- `updateConnection`: Change ports, change indices
- `cleanStaleConnections`: Dry run, actual cleanup
- `replaceConnections`: Full replacement, validation

**Metadata Operations (8 scenarios):**
- `updateSettings`: Timezone, execution order, error workflow
- `updateName`: Valid, duplicate, empty
- `addTag`: New tag, existing tag
- `removeTag`: Existing, non-existing

**8. `handleDeleteWorkflow`** - 3 scenarios
- Successful deletion
- Not found
- Verify cleanup (workflow actually deleted)

**9. `handleListWorkflows`** - 12+ scenarios
- No filters (all workflows)
- Filter by active status (true/false)
- Filter by tags (single, multiple)
- Filter by projectId (enterprise feature)
- Pagination: first page, next page, last page
- Pagination: cursor handling
- Exclude pinned data
- Limit variations (1, 50, 100)
- Empty results
- Sort order verification

**10. `handleValidateWorkflow`** - 16 scenarios (4 profiles × 4 validation types)

**Validation Profiles:**
- `strict`: All validations enabled, strictest rules
- `runtime`: Production-ready validation
- `ai-friendly`: Relaxed rules for AI-generated workflows
- `minimal`: Basic structure validation only

**Validation Types (for each profile):**
- All validations enabled (default)
- Nodes only (`validateNodes: true`, others false)
- Connections only (`validateConnections: true`, others false)
- Expressions only (`validateExpressions: true`, others false)

**11. `handleAutofixWorkflow`** - 20+ scenarios

**Fix Types (5):**
- `expression-format`: Fix `{{}}` syntax issues
- `typeversion-correction`: Fix outdated typeVersion
- `error-output-config`: Fix error output configuration
- `node-type-correction`: Fix incorrect node types
- `webhook-missing-path`: Add missing webhook paths

**Confidence Levels (3):**
- `high`: Only apply high-confidence fixes
- `medium`: Apply high + medium confidence fixes
- `low`: Apply all fixes

**Test Matrix:**
- Each fix type with preview mode (`applyFixes: false`)
- Each fix type with apply mode (`applyFixes: true`)
- Confidence threshold filtering
- `maxFixes` parameter limiting
- Multiple fix types in single workflow
- No fixes available scenario

---

#### Execution Management (4 handlers)

**12. `handleTriggerWebhookWorkflow`** - 16+ scenarios

**HTTP Methods (4):**
- GET: Query parameters, no data
- POST: JSON body, form data, headers
- PUT: Update data, custom headers
- DELETE: Query parameters, headers

**Scenarios per method:**
- Basic trigger (no data)
- With request data
- With custom headers
- Wait for response (true/false)
- Workflow not found
- Invalid webhook URL

**13. `handleGetExecution`** - 20+ scenarios

**Execution Modes (4):**
- `preview`: Structure & counts only (no data)
- `summary`: 2 samples per node (default)
- `filtered`: Custom limits and node filters
- `full`: Complete execution data

**Scenarios per mode:**
- Successful execution
- Failed execution
- Running execution
- With input data (`includeInputData: true`)
- Node filters (`nodeNames: ['Node1', 'Node2']`)
- Item limits (`itemsLimit: 0, 2, 5, -1`)
- Not found

**14. `handleListExecutions`** - 10+ scenarios
- No filters (all executions)
- Filter by workflowId
- Filter by status (success, error, waiting)
- Filter by projectId
- Pagination: first page, next page, last page
- Include execution data (`includeData: true/false`)
- Limit variations (1, 50, 100)
- Empty results

**15. `handleDeleteExecution`** - 3 scenarios
- Successful deletion
- Not found
- Verify cleanup

---

#### System/Utility (3 handlers)

**16. `handleHealthCheck`** - 2 scenarios
- API available
- Feature availability check

**17. `handleListAvailableTools`** - 1 scenario
- List all tools

**18. `handleDiagnostic`** - 3 scenarios
- Basic diagnostic
- Verbose mode (`verbose: true`)
- Configuration display

---

## Implementation Phases

### Phase 1: Foundation (Branch: `feat/integration-tests-foundation`)

#### 1.1 Environment Configuration

**Update `.env.example`:**
```bash
# ========================================
# INTEGRATION TESTING CONFIGURATION
# ========================================

# n8n API Configuration for Integration Tests
N8N_API_URL=http://localhost:5678
N8N_API_KEY=your-api-key-here

# Pre-activated Webhook Workflows for Testing
# Create these workflows manually in n8n and activate them
# Each workflow should have a single Webhook node with the specified HTTP method
N8N_TEST_WEBHOOK_GET_ID=     # Webhook with GET method
N8N_TEST_WEBHOOK_POST_ID=    # Webhook with POST method
N8N_TEST_WEBHOOK_PUT_ID=     # Webhook with PUT method
N8N_TEST_WEBHOOK_DELETE_ID=  # Webhook with DELETE method

# Test Configuration
N8N_TEST_CLEANUP_ENABLED=true           # Enable automatic cleanup
N8N_TEST_TAG=mcp-integration-test       # Tag for test workflows
N8N_TEST_NAME_PREFIX=[MCP-TEST]         # Name prefix for test workflows
```

**GitHub Secrets (for CI):**
- `N8N_URL`: n8n instance URL
- `N8N_API_KEY`: n8n API key
- `N8N_TEST_WEBHOOK_GET_ID`: Pre-activated GET webhook workflow ID
- `N8N_TEST_WEBHOOK_POST_ID`: Pre-activated POST webhook workflow ID
- `N8N_TEST_WEBHOOK_PUT_ID`: Pre-activated PUT webhook workflow ID
- `N8N_TEST_WEBHOOK_DELETE_ID`: Pre-activated DELETE webhook workflow ID

#### 1.2 Directory Structure

```
tests/integration/n8n-api/
├── workflows/
│   ├── create-workflow.test.ts          (10+ scenarios)
│   ├── get-workflow.test.ts             (3 scenarios)
│   ├── get-workflow-details.test.ts     (4 scenarios)
│   ├── get-workflow-structure.test.ts   (2 scenarios)
│   ├── get-workflow-minimal.test.ts     (2 scenarios)
│   ├── update-workflow.test.ts          (8+ scenarios)
│   ├── update-partial-workflow.test.ts  (30+ scenarios - 15 operations)
│   ├── delete-workflow.test.ts          (3 scenarios)
│   ├── list-workflows.test.ts           (12+ scenarios)
│   ├── validate-workflow.test.ts        (16 scenarios - 4 profiles × 4 types)
│   └── autofix-workflow.test.ts         (20+ scenarios - 5 types × modes)
├── executions/
│   ├── trigger-webhook.test.ts          (16+ scenarios - 4 methods)
│   ├── get-execution.test.ts            (20+ scenarios - 4 modes)
│   ├── list-executions.test.ts          (10+ scenarios)
│   └── delete-execution.test.ts         (3 scenarios)
├── system/
│   ├── health-check.test.ts             (2 scenarios)
│   ├── list-tools.test.ts               (1 scenario)
│   └── diagnostic.test.ts               (3 scenarios)
└── utils/
    ├── credentials.ts                   # Environment-aware credential loader
    ├── n8n-client.ts                    # Pre-configured API client
    ├── cleanup-helpers.ts               # Multi-level cleanup
    ├── test-context.ts                  # Resource tracking
    ├── fixtures.ts                      # Reusable workflow templates
    ├── factories.ts                     # Test data generators
    └── webhook-workflows.ts             # Webhook workflow configurations
```

#### 1.3 Core Utilities

**credentials.ts** - Environment-aware credential loader:
```typescript
import dotenv from 'dotenv';

dotenv.config();

export interface N8nTestCredentials {
  url: string;
  apiKey: string;
  webhookWorkflows: {
    get: string;
    post: string;
    put: string;
    delete: string;
  };
  cleanup: {
    enabled: boolean;
    tag: string;
    namePrefix: string;
  };
}

export function getN8nCredentials(): N8nTestCredentials {
  if (process.env.CI) {
    // CI: Use GitHub secrets
    return {
      url: process.env.N8N_URL!,
      apiKey: process.env.N8N_API_KEY!,
      webhookWorkflows: {
        get: process.env.N8N_TEST_WEBHOOK_GET_ID!,
        post: process.env.N8N_TEST_WEBHOOK_POST_ID!,
        put: process.env.N8N_TEST_WEBHOOK_PUT_ID!,
        delete: process.env.N8N_TEST_WEBHOOK_DELETE_ID!
      },
      cleanup: {
        enabled: true,
        tag: 'mcp-integration-test',
        namePrefix: '[MCP-TEST]'
      }
    };
  } else {
    // Local: Use .env file
    return {
      url: process.env.N8N_API_URL!,
      apiKey: process.env.N8N_API_KEY!,
      webhookWorkflows: {
        get: process.env.N8N_TEST_WEBHOOK_GET_ID || '',
        post: process.env.N8N_TEST_WEBHOOK_POST_ID || '',
        put: process.env.N8N_TEST_WEBHOOK_PUT_ID || '',
        delete: process.env.N8N_TEST_WEBHOOK_DELETE_ID || ''
      },
      cleanup: {
        enabled: process.env.N8N_TEST_CLEANUP_ENABLED !== 'false',
        tag: process.env.N8N_TEST_TAG || 'mcp-integration-test',
        namePrefix: process.env.N8N_TEST_NAME_PREFIX || '[MCP-TEST]'
      }
    };
  }
}

export function validateCredentials(creds: N8nTestCredentials): void {
  if (!creds.url) throw new Error('N8N_API_URL is required');
  if (!creds.apiKey) throw new Error('N8N_API_KEY is required');
}

export function validateWebhookWorkflows(creds: N8nTestCredentials): void {
  const missing: string[] = [];
  if (!creds.webhookWorkflows.get) missing.push('GET');
  if (!creds.webhookWorkflows.post) missing.push('POST');
  if (!creds.webhookWorkflows.put) missing.push('PUT');
  if (!creds.webhookWorkflows.delete) missing.push('DELETE');

  if (missing.length > 0) {
    throw new Error(
      `Missing webhook workflow IDs for HTTP methods: ${missing.join(', ')}\n` +
      `Please create and activate webhook workflows, then set:\n` +
      missing.map(m => `  N8N_TEST_WEBHOOK_${m}_ID`).join('\n')
    );
  }
}
```

**n8n-client.ts** - Pre-configured API client wrapper:
```typescript
import { N8nApiClient } from '../../../src/services/n8n-api-client';
import { getN8nCredentials } from './credentials';

let client: N8nApiClient | null = null;

export function getTestN8nClient(): N8nApiClient {
  if (!client) {
    const creds = getN8nCredentials();
    client = new N8nApiClient(creds.url, creds.apiKey);
  }
  return client;
}

export function resetTestN8nClient(): void {
  client = null;
}
```

**test-context.ts** - Resource tracking for cleanup:
```typescript
import { getN8nCredentials } from './credentials';

export interface TestContext {
  workflowIds: string[];
  executionIds: string[];
  cleanup: () => Promise<void>;
}

export function createTestContext(): TestContext {
  const context: TestContext = {
    workflowIds: [],
    executionIds: [],
    cleanup: async () => {
      const creds = getN8nCredentials();
      if (!creds.cleanup.enabled) return;

      const client = getTestN8nClient();

      // Delete executions first
      for (const id of context.executionIds) {
        try {
          await client.deleteExecution(id);
        } catch (error) {
          console.warn(`Failed to delete execution ${id}:`, error);
        }
      }

      // Then delete workflows
      for (const id of context.workflowIds) {
        try {
          await client.deleteWorkflow(id);
        } catch (error) {
          console.warn(`Failed to delete workflow ${id}:`, error);
        }
      }

      context.workflowIds = [];
      context.executionIds = [];
    }
  };

  return context;
}
```

**cleanup-helpers.ts** - Multi-level cleanup strategies:
```typescript
import { N8nApiClient } from '../../../src/services/n8n-api-client';
import { getN8nCredentials, getTestN8nClient } from './credentials';

/**
 * Clean up orphaned test workflows
 * Run this periodically in CI to clean up failed test runs
 */
export async function cleanupOrphanedWorkflows(): Promise<void> {
  const creds = getN8nCredentials();
  const client = getTestN8nClient();

  let allWorkflows: any[] = [];
  let cursor: string | undefined;

  // Fetch all workflows with pagination
  do {
    const response = await client.listWorkflows({ cursor, limit: 100 });
    allWorkflows.push(...response.data);
    cursor = response.nextCursor;
  } while (cursor);

  // Find test workflows
  const testWorkflows = allWorkflows.filter(w =>
    w.tags?.includes(creds.cleanup.tag) ||
    w.name?.startsWith(creds.cleanup.namePrefix)
  );

  console.log(`Found ${testWorkflows.length} orphaned test workflows`);

  // Delete them
  for (const workflow of testWorkflows) {
    try {
      await client.deleteWorkflow(workflow.id);
      console.log(`Deleted orphaned workflow: ${workflow.name} (${workflow.id})`);
    } catch (error) {
      console.warn(`Failed to delete workflow ${workflow.id}:`, error);
    }
  }
}

/**
 * Clean up old executions (older than 24 hours)
 */
export async function cleanupOldExecutions(): Promise<void> {
  const client = getTestN8nClient();

  let allExecutions: any[] = [];
  let cursor: string | undefined;

  // Fetch all executions
  do {
    const response = await client.listExecutions({ cursor, limit: 100 });
    allExecutions.push(...response.data);
    cursor = response.nextCursor;
  } while (cursor);

  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const oldExecutions = allExecutions.filter(e =>
    new Date(e.startedAt).getTime() < oneDayAgo
  );

  console.log(`Found ${oldExecutions.length} old executions`);

  for (const execution of oldExecutions) {
    try {
      await client.deleteExecution(execution.id);
    } catch (error) {
      console.warn(`Failed to delete execution ${execution.id}:`, error);
    }
  }
}
```

**fixtures.ts** - Reusable workflow templates:
```typescript
import { Workflow } from '../../../src/types/n8n-api';

export const SIMPLE_WEBHOOK_WORKFLOW: Partial<Workflow> = {
  name: '[MCP-TEST] Simple Webhook',
  nodes: [
    {
      id: 'webhook-1',
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [250, 300],
      parameters: {
        httpMethod: 'GET',
        path: 'test-webhook'
      }
    }
  ],
  connections: {}
};

export const SIMPLE_HTTP_WORKFLOW: Partial<Workflow> = {
  name: '[MCP-TEST] Simple HTTP Request',
  nodes: [
    {
      id: 'webhook-1',
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [250, 300],
      parameters: {
        httpMethod: 'GET',
        path: 'trigger'
      }
    },
    {
      id: 'http-1',
      name: 'HTTP Request',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [450, 300],
      parameters: {
        url: 'https://httpbin.org/get',
        method: 'GET'
      }
    }
  ],
  connections: {
    Webhook: {
      main: [[{ node: 'HTTP Request', type: 'main', index: 0 }]]
    }
  }
};

// Add more fixtures for complex workflows
```

**webhook-workflows.ts** - Webhook workflow setup guide:
```typescript
/**
 * Guide for setting up webhook workflows manually in n8n
 *
 * These workflows must be created manually and activated because
 * n8n API doesn't support workflow activation.
 *
 * For each HTTP method, create a workflow with:
 * 1. Single Webhook node
 * 2. Configured for the specific HTTP method
 * 3. Unique webhook path
 * 4. Activated in n8n UI
 * 5. Workflow ID added to .env
 */

export const WEBHOOK_WORKFLOW_CONFIGS = {
  GET: {
    name: '[MCP-TEST] Webhook GET',
    description: 'Pre-activated webhook for GET method testing',
    nodes: [
      {
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        parameters: {
          httpMethod: 'GET',
          path: 'mcp-test-get',
          responseMode: 'lastNode'
        }
      }
    ]
  },
  POST: {
    name: '[MCP-TEST] Webhook POST',
    description: 'Pre-activated webhook for POST method testing',
    nodes: [
      {
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        parameters: {
          httpMethod: 'POST',
          path: 'mcp-test-post',
          responseMode: 'lastNode'
        }
      }
    ]
  },
  PUT: {
    name: '[MCP-TEST] Webhook PUT',
    description: 'Pre-activated webhook for PUT method testing',
    nodes: [
      {
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        parameters: {
          httpMethod: 'PUT',
          path: 'mcp-test-put',
          responseMode: 'lastNode'
        }
      }
    ]
  },
  DELETE: {
    name: '[MCP-TEST] Webhook DELETE',
    description: 'Pre-activated webhook for DELETE method testing',
    nodes: [
      {
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        parameters: {
          httpMethod: 'DELETE',
          path: 'mcp-test-delete',
          responseMode: 'lastNode'
        }
      }
    ]
  }
};

export function printSetupInstructions(): void {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║  WEBHOOK WORKFLOW SETUP REQUIRED                               ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║  Integration tests require 4 pre-activated webhook workflows:  ║
║                                                                ║
║  1. Create workflows manually in n8n UI                        ║
║  2. Use the configurations shown below                         ║
║  3. ACTIVATE each workflow in n8n UI                           ║
║  4. Copy workflow IDs to .env file                             ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝

Required workflows:
`);

  Object.entries(WEBHOOK_WORKFLOW_CONFIGS).forEach(([method, config]) => {
    console.log(`
${method} Method:
  Name: ${config.name}
  Path: ${config.nodes[0].parameters.path}
  .env variable: N8N_TEST_WEBHOOK_${method}_ID
`);
  });
}
```

---

### Phase 2: Workflow Creation Tests (P0)

**Branch**: `feat/integration-tests-workflow-creation`

**File**: `tests/integration/n8n-api/workflows/create-workflow.test.ts`

**10+ Test Scenarios**:
1. Create workflow with base webhook node (verify P0 bug fix)
2. Create workflow with base HTTP request node
3. Create workflow with langchain agent node
4. Create complex multi-node workflow
5. Create workflow with complex connections
6. Error: Invalid node type
7. Error: Missing required parameters
8. Error: Duplicate node names
9. Error: Invalid connection references
10. Create workflow with custom settings

---

### Phase 3: Workflow Retrieval Tests (P1)

**Branch**: `feat/integration-tests-workflow-retrieval`

**Files**:
- `get-workflow.test.ts` (3 scenarios)
- `get-workflow-details.test.ts` (4 scenarios)
- `get-workflow-structure.test.ts` (2 scenarios)
- `get-workflow-minimal.test.ts` (2 scenarios)

---

### Phase 4: Workflow Update Tests (P1)

**Branch**: `feat/integration-tests-workflow-updates`

**Files**:
- `update-workflow.test.ts` (8+ scenarios)
- `update-partial-workflow.test.ts` (30+ scenarios covering all 15 operations)

---

### Phase 5: Workflow Management Tests (P2)

**Branch**: `feat/integration-tests-workflow-management`

**Files**:
- `delete-workflow.test.ts` (3 scenarios)
- `list-workflows.test.ts` (12+ scenarios with all filters and pagination)

---

### Phase 6: Validation & Autofix Tests (P2)

**Branch**: `feat/integration-tests-validation`

**Files**:
- `validate-workflow.test.ts` (16 scenarios: 4 profiles × 4 validation types)
- `autofix-workflow.test.ts` (20+ scenarios: 5 fix types × confidence levels)

---

### Phase 7: Execution Management Tests (P2)

**Branch**: `feat/integration-tests-executions`

**Files**:
- `trigger-webhook.test.ts` (16+ scenarios: 4 HTTP methods × variations)
- `get-execution.test.ts` (20+ scenarios: 4 modes × filters)
- `list-executions.test.ts` (10+ scenarios)
- `delete-execution.test.ts` (3 scenarios)

**Special Considerations for Webhook Testing**:
- Use pre-activated workflows from `.env`
- Each HTTP method uses a different workflow ID
- Test both successful triggers and error cases
- Verify response data for synchronous executions

---

### Phase 8: System Tools Tests (P3)

**Branch**: `feat/integration-tests-system`

**Files**:
- `health-check.test.ts` (2 scenarios)
- `list-tools.test.ts` (1 scenario)
- `diagnostic.test.ts` (3 scenarios)

---

### Phase 9: CI/CD Integration

**Branch**: `feat/integration-tests-ci`

**GitHub Actions Workflow** (`.github/workflows/integration-tests.yml`):

```yaml
name: Integration Tests

on:
  pull_request:
  push:
    branches: [main]
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM
  workflow_dispatch:

jobs:
  integration-tests:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build project
        run: npm run build

      - name: Run integration tests
        env:
          N8N_URL: ${{ secrets.N8N_URL }}
          N8N_API_KEY: ${{ secrets.N8N_API_KEY }}
          N8N_TEST_WEBHOOK_GET_ID: ${{ secrets.N8N_TEST_WEBHOOK_GET_ID }}
          N8N_TEST_WEBHOOK_POST_ID: ${{ secrets.N8N_TEST_WEBHOOK_POST_ID }}
          N8N_TEST_WEBHOOK_PUT_ID: ${{ secrets.N8N_TEST_WEBHOOK_PUT_ID }}
          N8N_TEST_WEBHOOK_DELETE_ID: ${{ secrets.N8N_TEST_WEBHOOK_DELETE_ID }}
          CI: true
        run: npm run test:integration

      - name: Cleanup orphaned workflows
        if: always()
        env:
          N8N_URL: ${{ secrets.N8N_URL }}
          N8N_API_KEY: ${{ secrets.N8N_API_KEY }}
        run: npm run test:cleanup:orphans
```

**Add npm scripts to `package.json`**:
```json
{
  "scripts": {
    "test:integration:n8n": "vitest run tests/integration/n8n-api",
    "test:cleanup:orphans": "tsx tests/integration/n8n-api/utils/cleanup-orphans.ts"
  }
}
```

---

## Test Isolation Strategy

### Workflow Naming Convention
- Prefix: `[MCP-TEST]`
- Include test name: `[MCP-TEST] Create Workflow - Base Nodes`
- Include timestamp for uniqueness: `[MCP-TEST] Test Name ${Date.now()}`

### Workflow Tagging
- All test workflows tagged with: `mcp-integration-test`
- Enables bulk cleanup queries

### Cleanup Levels
1. **Test-level**: After each test via `afterEach` hook
2. **Suite-level**: After each test file via `afterAll` hook
3. **CI-level**: After CI job completes (always run)
4. **Orphan cleanup**: Periodic job to clean up failed test runs

---

## Pre-Test Setup Checklist

### Local Development
1. ✅ Install n8n locally or use Docker
2. ✅ Start n8n instance: `npx n8n start`
3. ✅ Create 4 webhook workflows (GET, POST, PUT, DELETE)
4. ✅ Activate all 4 webhook workflows in n8n UI
5. ✅ Get workflow IDs from n8n UI
6. ✅ Copy `.env.example` to `.env`
7. ✅ Set `N8N_API_URL=http://localhost:5678`
8. ✅ Generate API key in n8n Settings > API
9. ✅ Set `N8N_API_KEY=<your-key>`
10. ✅ Set all 4 `N8N_TEST_WEBHOOK_*_ID` variables

### CI/GitHub Actions
1. ✅ Set up cloud n8n instance (or self-hosted)
2. ✅ Create 4 webhook workflows (GET, POST, PUT, DELETE)
3. ✅ Activate all 4 webhook workflows
4. ✅ Add GitHub secrets: `N8N_URL`, `N8N_API_KEY`
5. ✅ Add webhook workflow ID secrets (4 total)

---

## Success Criteria

- ✅ All 17 handlers have integration tests
- ✅ All operations/parameters covered (150+ scenarios)
- ✅ Tests run successfully locally and in CI
- ✅ No manual cleanup required (automatic)
- ✅ Test coverage catches P0-level bugs
- ✅ CI runs on every PR and daily
- ✅ Clear error messages when tests fail
- ✅ Documentation for webhook workflow setup

---

## Timeline Estimate

- **Phase 1 (Foundation)**: 2-3 days
- **Phase 2 (Workflow Creation)**: 1 day
- **Phase 3 (Retrieval)**: 1 day
- **Phase 4 (Updates)**: 2-3 days (15 operations)
- **Phase 5 (Management)**: 1 day
- **Phase 6 (Validation)**: 2 days
- **Phase 7 (Executions)**: 2 days
- **Phase 8 (System)**: 1 day
- **Phase 9 (CI/CD)**: 1 day

**Total**: ~14-18 days

---

## Notes

- Each phase should be developed on a separate branch
- Phases can be parallelized where dependencies allow
- Run local tests frequently to catch issues early
- Document any n8n API quirks discovered during testing
