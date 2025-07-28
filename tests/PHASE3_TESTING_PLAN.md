# Phase 3: Unit Tests - Comprehensive Testing Plan

## Executive Summary

Phase 3 focuses on achieving 80%+ test coverage for all services in `src/services/`. The test infrastructure (Phase 2) is complete with Vitest, factories, and mocking capabilities. This plan prioritizes critical services and identifies complex testing scenarios.

## Current State Analysis

### Test Infrastructure (Phase 2 Complete)
- ✅ Vitest framework configured
- ✅ Test factories (`node.factory.ts`) 
- ✅ Mocking strategy for SQLite database
- ✅ Initial test files created for 4 core services
- ✅ Test directory structure established

### Services Requiring Tests (13 total)
1. **config-validator.ts** - ⚠️ Partially tested
2. **enhanced-config-validator.ts** - ⚠️ Partially tested  
3. **expression-validator.ts** - ⚠️ Partially tested
4. **workflow-validator.ts** - ⚠️ Partially tested
5. **n8n-api-client.ts** - ❌ Not tested
6. **n8n-validation.ts** - ❌ Not tested
7. **node-documentation-service.ts** - ❌ Not tested
8. **node-specific-validators.ts** - ❌ Not tested
9. **property-dependencies.ts** - ❌ Not tested
10. **property-filter.ts** - ❌ Not tested
11. **example-generator.ts** - ❌ Not tested
12. **task-templates.ts** - ❌ Not tested
13. **workflow-diff-engine.ts** - ❌ Not tested

## Priority Classification

### Priority 1: Critical Path Services (Core Validation)
These services are used by almost all MCP tools and must be thoroughly tested.

1. **config-validator.ts** (745 lines)
   - Core validation logic for all nodes
   - Complex displayOptions visibility logic
   - Node-specific validation rules
   - **Test Requirements**: 50+ test cases covering all validation types

2. **enhanced-config-validator.ts** (467 lines)
   - Operation-aware validation
   - Profile-based filtering (minimal, runtime, ai-friendly, strict)
   - **Test Requirements**: 30+ test cases for each profile

3. **workflow-validator.ts** (1347 lines)
   - Complete workflow validation
   - Connection validation with cycle detection
   - Node-level error handling validation
   - **Test Requirements**: 60+ test cases covering all workflow patterns

### Priority 2: External Dependencies (API & Data Access)
Services with external dependencies requiring comprehensive mocking.

4. **n8n-api-client.ts** (405 lines)
   - HTTP client with retry logic
   - Multiple API endpoints
   - Error handling for various failure modes
   - **Test Requirements**: Mock axios, test all endpoints, error scenarios

5. **node-documentation-service.ts**
   - Database queries
   - Documentation formatting
   - **Test Requirements**: Mock database, test query patterns

6. **workflow-diff-engine.ts** (628 lines)
   - Complex state mutations
   - Transaction-like operation application
   - **Test Requirements**: 40+ test cases for all operation types

### Priority 3: Supporting Services
Important but lower complexity services.

7. **expression-validator.ts** (299 lines)
   - n8n expression syntax validation
   - Variable reference checking
   - **Test Requirements**: 25+ test cases for expression patterns

8. **node-specific-validators.ts**
   - Node-specific validation logic
   - Integration with base validators
   - **Test Requirements**: 20+ test cases per node type

9. **property-dependencies.ts**
   - Property visibility dependencies
   - **Test Requirements**: 15+ test cases

### Priority 4: Utility Services
Simpler services with straightforward testing needs.

10. **property-filter.ts**
    - Property filtering logic
    - **Test Requirements**: 10+ test cases

11. **example-generator.ts**
    - Example configuration generation
    - **Test Requirements**: 10+ test cases

12. **task-templates.ts**
    - Pre-configured templates
    - **Test Requirements**: Template validation tests

13. **n8n-validation.ts**
    - Workflow cleaning utilities
    - **Test Requirements**: 15+ test cases

## Complex Testing Scenarios

### 1. Circular Dependencies
- **config-validator.ts** ↔ **node-specific-validators.ts**
- **Solution**: Use dependency injection or partial mocking

### 2. Database Mocking
- Services: node-documentation-service.ts, property-dependencies.ts
- **Strategy**: Create mock NodeRepository with test data fixtures

### 3. HTTP Client Mocking
- Service: n8n-api-client.ts
- **Strategy**: Mock axios with response fixtures for each endpoint

### 4. Complex State Validation
- Service: workflow-diff-engine.ts
- **Strategy**: Snapshot testing for workflow states before/after operations

### 5. Expression Context
- Service: expression-validator.ts
- **Strategy**: Create comprehensive expression context fixtures

## Testing Infrastructure Enhancements Needed

### 1. Additional Factories
```typescript
// workflow.factory.ts
export const workflowFactory = {
  minimal: () => ({ /* minimal valid workflow */ }),
  withConnections: () => ({ /* workflow with node connections */ }),
  withErrors: () => ({ /* workflow with validation errors */ }),
  aiAgent: () => ({ /* AI agent workflow pattern */ })
};

// expression.factory.ts
export const expressionFactory = {
  simple: () => '{{ $json.field }}',
  complex: () => '{{ $node["HTTP Request"].json.data[0].value }}',
  invalid: () => '{{ $json[notANumber] }}'
};
```

### 2. Mock Utilities
```typescript
// mocks/node-repository.mock.ts
export const createMockNodeRepository = () => ({
  getNode: vi.fn(),
  searchNodes: vi.fn(),
  // ... other methods
});

// mocks/axios.mock.ts
export const createMockAxios = () => ({
  create: vi.fn(() => ({
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() }
    }
  }))
});
```

### 3. Test Helpers
```typescript
// helpers/validation.helpers.ts
export const expectValidationError = (
  result: ValidationResult,
  errorType: string,
  property?: string
) => {
  const error = result.errors.find(e => 
    e.type === errorType && (!property || e.property === property)
  );
  expect(error).toBeDefined();
  return error;
};
```

## Coverage Goals by Service

| Service | Current | Target | Test Cases Needed |
|---------|---------|--------|-------------------|
| config-validator.ts | ~20% | 85% | 50+ |
| enhanced-config-validator.ts | ~15% | 85% | 30+ |
| workflow-validator.ts | ~10% | 90% | 60+ |
| n8n-api-client.ts | 0% | 85% | 40+ |
| expression-validator.ts | ~10% | 90% | 25+ |
| workflow-diff-engine.ts | 0% | 85% | 40+ |
| Others | 0% | 80% | 15-20 each |

## Implementation Strategy

### Week 1: Critical Path Services
1. Complete config-validator.ts tests
2. Complete enhanced-config-validator.ts tests
3. Complete workflow-validator.ts tests
4. Create necessary test factories and helpers

### Week 2: External Dependencies
1. Implement n8n-api-client.ts tests with axios mocking
2. Test workflow-diff-engine.ts with state snapshots
3. Mock database for node-documentation-service.ts

### Week 3: Supporting Services
1. Complete expression-validator.ts tests
2. Test all node-specific validators
3. Test property-dependencies.ts

### Week 4: Finalization
1. Complete remaining utility services
2. Integration tests for service interactions
3. Coverage report and gap analysis

## Risk Mitigation

### 1. Complex Mocking Requirements
- **Risk**: Over-mocking leading to brittle tests
- **Mitigation**: Use real implementations where possible, mock only external dependencies

### 2. Test Maintenance
- **Risk**: Tests becoming outdated as services evolve
- **Mitigation**: Use factories and shared fixtures, avoid hardcoded test data

### 3. Performance
- **Risk**: Large test suite becoming slow
- **Mitigation**: Parallelize tests, use focused test runs during development

## Success Metrics

1. **Coverage**: Achieve 80%+ line coverage across all services
2. **Quality**: Zero false positives, all edge cases covered
3. **Performance**: Full test suite runs in < 30 seconds
4. **Maintainability**: Clear test names, reusable fixtures, minimal duplication

## Next Steps

1. Review and approve this plan
2. Create missing test factories and mock utilities
3. Begin Priority 1 service testing
4. Daily progress tracking against coverage goals
5. Weekly review of test quality and maintenance needs

## Gaps Identified in Current Test Infrastructure

1. **Missing Factories**: Need workflow, expression, and validation result factories
2. **Mock Strategy**: Need consistent mocking approach for NodeRepository
3. **Test Data**: Need comprehensive test fixtures for different node types
4. **Helpers**: Need assertion helpers for complex validation scenarios
5. **Integration Tests**: Need strategy for testing service interactions

This plan provides a clear roadmap for completing Phase 3 with high-quality, maintainable tests that ensure the reliability of the n8n-mcp service layer.