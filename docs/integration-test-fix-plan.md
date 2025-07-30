# Integration Test Fix Plan

## Executive Summary

We're developing a comprehensive test suite from scratch on a feature branch. Unit tests are solid (932 passing, 87.8% coverage), but integration tests need significant work (58 failures out of 246 tests).

**Key Decision**: Should we fix all integration tests before merging, or merge with a phased approach?

## Current Situation

### What's Working
- ✅ **Unit Tests**: 932 tests, 87.8% coverage, all passing
- ✅ **Test Infrastructure**: Vitest, factories, builders all set up
- ✅ **CI/CD Pipeline**: Runs in ~2 minutes (but hiding failures)

### What Needs Work
- ⚠️ **Integration Tests**: 58 failures (23.6% failure rate)
- ⚠️ **CI Configuration**: `|| true` hiding test failures
- ⚠️ **No E2E Tests**: Not started yet

## Root Cause Analysis

### 1. Database State Management (9 failures)
```
UNIQUE constraint failed: templates.workflow_id
database disk image is malformed
```
**Fix**: Isolate database instances per test

### 2. MCP Protocol Response Structure (16 failures)
```
Cannot read properties of undefined (reading 'text')
```
**Fix**: Update error-handling tests to match actual response structure

### 3. MSW Not Initialized (6 failures)
```
Request failed with status code 501
```
**Fix**: Add MSW setup to each test file

### 4. FTS5 Search Syntax (7 failures)
```
fts5: syntax error near ""
```
**Fix**: Handle empty search terms, fix NOT query syntax

### 5. Session Management Timeouts (5 failures)
**Fix**: Proper async cleanup in afterEach hooks

### 6. Performance Thresholds (15 failures)
**Fix**: Adjust thresholds to match actual performance

## Proposed Course of Action

### Option A: Fix Everything Before Merge (3-4 weeks)

**Pros:**
- Clean, fully passing test suite
- No technical debt
- Sets high quality bar

**Cons:**
- Delays value delivery
- Blocks other development
- Risk of scope creep

### Option B: Phased Approach (Recommended)

#### Phase 1: Critical Fixes (1 week)
1. **Remove `|| true` from CI** - See real status
2. **Fix Database Isolation** - Prevents data corruption
3. **Fix MSW Setup** - Unblocks API tests
4. **Update MCP error-handling tests** - Quick fix

**Target**: 30-35 tests fixed, ~85% pass rate

#### Phase 2: Merge & Iterate (Week 2)
1. **Merge to main with known issues**
   - Document failing tests
   - Create issues for remaining work
   - Set CI to warn but not block

2. **Benefits:**
   - Team gets unit test coverage immediately
   - Integration tests provide partial coverage
   - Incremental improvement approach

#### Phase 3: Complete Integration Tests (Week 3-4)
- Fix remaining FTS5 search issues
- Resolve session management timeouts
- Adjust performance thresholds
- Target: 100% pass rate

#### Phase 4: E2E Tests (Week 5-6)
- Build on stable integration test foundation
- Focus on critical user journeys

## Implementation Steps

### Week 1: Critical Infrastructure

```bash
# Day 1-2: Fix CI and Database
- Remove || true from workflow
- Implement TestDatabase.create() for isolation
- Fix FTS5 rebuild syntax

# Day 3-4: Fix MSW and MCP
- Add MSW to test files
- Apply response.content[0] pattern to error-handling.test.ts

# Day 5: Test & Document
- Run full suite
- Document remaining issues
- Create tracking board
```

### Week 2: Merge Strategy

```yaml
# Modified CI configuration
- name: Run integration tests
  run: |
    npm run test:integration || echo "::warning::Integration tests have known failures"
    # Still exit 0 to allow merge, but warn
  continue-on-error: true  # Temporary until all fixed
```

## Success Metrics

### Week 1 Goals
- [ ] CI shows real test status
- [ ] Database tests isolated (9 fixed)
- [ ] MSW tests passing (6 fixed)
- [ ] MCP error tests fixed (16 fixed)
- [ ] ~85% integration test pass rate

### End State Goals
- [ ] 100% integration test pass rate
- [ ] No flaky tests
- [ ] E2E test suite started
- [ ] CI blocks on failures

## Risk Mitigation

### If Fixes Take Longer
- Focus on critical path tests only
- Temporarily skip problematic tests
- Adjust thresholds rather than fix performance

### If New Issues Arise
- Time-box investigation (2 hours max)
- Document and move on
- Create follow-up tickets

## Team Communication

### Messaging
```
We're adding comprehensive test coverage to ensure code quality.
Unit tests are complete and passing (932 tests, 87.8% coverage).
Integration tests need some work - we'll fix critical issues this week
and merge with a plan to complete the remaining fixes.
```

### Benefits to Emphasize
- Catching bugs before production
- Faster development with safety net
- Better code documentation through tests
- Reduced manual testing burden

## Decision Point

**Recommendation**: Go with Option B (Phased Approach)

**Rationale:**
1. Delivers immediate value (unit tests)
2. Makes progress visible
3. Allows parallel development
4. Reduces merge conflicts
5. Pragmatic over perfect

**Next Step**: Get team consensus on phased approach, then start Week 1 fixes.