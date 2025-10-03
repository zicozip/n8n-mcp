# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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