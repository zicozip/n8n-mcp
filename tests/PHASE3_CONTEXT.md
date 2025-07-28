# Phase 3 Implementation Context

## Quick Start for Implementation

You are implementing Phase 3 of the testing strategy. Phase 2 (test infrastructure) is complete. Your task is to write comprehensive unit tests for all services in `src/services/`.

### Immediate Action Items

1. **Start with Priority 1 Services** (in order):
   - `config-validator.ts` - Complete existing tests (currently ~20% coverage)
   - `enhanced-config-validator.ts` - Complete existing tests (currently ~15% coverage)
   - `workflow-validator.ts` - Complete existing tests (currently ~10% coverage)

2. **Use Existing Infrastructure**:
   - Framework: Vitest (already configured)
   - Test location: `tests/unit/services/`
   - Factories: `tests/fixtures/factories/`
   - Imports: Use `@/` alias for src, `@tests/` for test utils

### Critical Context

#### 1. Validation Services Architecture
```
ConfigValidator (base)
    ↓
EnhancedConfigValidator (extends base, adds operation awareness)
    ↓
NodeSpecificValidators (used by both)
```

#### 2. Key Testing Patterns

**For Validators:**
```typescript
describe('ConfigValidator', () => {
  describe('validate', () => {
    it('should detect missing required fields', () => {
      const result = ConfigValidator.validate(nodeType, config, properties);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          type: 'missing_required',
          property: 'channel'
        })
      );
    });
  });
});
```

**For API Client:**
```typescript
vi.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

describe('N8nApiClient', () => {
  beforeEach(() => {
    mockAxios.create.mockReturnValue({
      get: vi.fn(),
      post: vi.fn(),
      // ... etc
    });
  });
});
```

#### 3. Complex Scenarios to Test

**ConfigValidator:**
- Property visibility with displayOptions (show/hide conditions)
- Node-specific validation (HTTP Request, Webhook, Code nodes)
- Security validations (hardcoded credentials, SQL injection)
- Type validation (string, number, boolean, options)

**WorkflowValidator:**
- Invalid node types (missing package prefix)
- Connection validation (cycles, orphaned nodes)
- Expression validation within workflow context
- Error handling properties (onError, retryOnFail)
- AI Agent workflows with tool connections

**WorkflowDiffEngine:**
- All operation types (addNode, removeNode, updateNode, etc.)
- Transaction-like behavior (all succeed or all fail)
- Node name vs ID handling
- Connection cleanup when removing nodes

### Testing Infrastructure Available

1. **Database Mocking**:
   ```typescript
   vi.mock('better-sqlite3');
   ```

2. **Node Factory** (already exists):
   ```typescript
   import { slackNodeFactory } from '@tests/fixtures/factories/node.factory';
   ```

3. **Type Imports**:
   ```typescript
   import type { ValidationResult, ValidationError } from '@/services/config-validator';
   ```

### Common Pitfalls to Avoid

1. **Don't Mock Too Deep**: Mock at service boundaries (database, HTTP), not internal methods
2. **Test Behavior, Not Implementation**: Focus on inputs/outputs, not internal state
3. **Use Real Data Structures**: Use actual n8n node/workflow structures from fixtures
4. **Handle Async Properly**: Many services have async methods, use `async/await` in tests

### Coverage Goals

| Priority | Service | Target Coverage | Key Focus Areas |
|----------|---------|----------------|-----------------|
| 1 | config-validator | 85% | displayOptions, node-specific validation |
| 1 | enhanced-config-validator | 85% | operation modes, profiles |
| 1 | workflow-validator | 90% | connections, expressions, error handling |
| 2 | n8n-api-client | 85% | all endpoints, error scenarios |
| 2 | workflow-diff-engine | 85% | all operations, validation |
| 3 | expression-validator | 90% | syntax, context validation |

### Next Steps

1. Complete tests for Priority 1 services first
2. Create additional factories as needed
3. Track coverage with `npm run test:coverage`
4. Focus on edge cases and error scenarios
5. Ensure all async operations are properly tested

### Resources

- Testing plan: `/tests/PHASE3_TESTING_PLAN.md`
- Service documentation: Check each service file's header comments
- n8n structures: Use actual examples from `tests/fixtures/`

Remember: The goal is reliable, maintainable tests that catch real bugs, not just high coverage numbers.