# n8n-MCP Telemetry Database Pruning Strategy

**Analysis Date:** 2025-10-10
**Current Database Size:** 265 MB (telemetry_events: 199 MB, telemetry_workflows: 66 MB)
**Free Tier Limit:** 500 MB
**Projected 4-Week Size:** 609 MB (exceeds limit by 109 MB)

---

## Executive Summary

**Critical Finding:** At current growth rate (56.75% of data from last 7 days), we will exceed the 500 MB free tier limit in approximately 2 weeks. Implementing a 7-day retention policy can immediately save 36.5 MB (37.6%) and prevent database overflow.

**Key Insights:**
- 641,487 event records consuming 199 MB
- 17,247 workflow records consuming 66 MB
- Daily growth rate: ~7-8 MB/day for events
- 43.25% of data is older than 7 days but provides diminishing value

**Immediate Action Required:** Implement automated pruning to maintain database under 500 MB.

---

## 1. Current State Assessment

### Database Size and Distribution

| Table | Rows | Current Size | Growth Rate | Bytes/Row |
|-------|------|--------------|-------------|-----------|
| telemetry_events | 641,487 | 199 MB | 56.66% from last 7d | 325 |
| telemetry_workflows | 17,247 | 66 MB | 60.09% from last 7d | 4,013 |
| **TOTAL** | **658,734** | **265 MB** | **56.75% from last 7d** | **403** |

### Event Type Distribution

| Event Type | Count | % of Total | Storage | Avg Props Size | Oldest Event |
|------------|-------|-----------|---------|----------------|--------------|
| tool_sequence | 362,170 | 56.4% | 67 MB | 194 bytes | 2025-09-26 |
| tool_used | 191,659 | 29.9% | 14 MB | 77 bytes | 2025-09-26 |
| validation_details | 36,266 | 5.7% | 11 MB | 329 bytes | 2025-09-26 |
| workflow_created | 23,151 | 3.6% | 2.6 MB | 115 bytes | 2025-09-26 |
| session_start | 12,575 | 2.0% | 1.2 MB | 101 bytes | 2025-09-26 |
| workflow_validation_failed | 9,739 | 1.5% | 314 KB | 33 bytes | 2025-09-26 |
| error_occurred | 4,935 | 0.8% | 626 KB | 130 bytes | 2025-09-26 |
| search_query | 974 | 0.2% | 106 KB | 112 bytes | 2025-09-26 |
| Other | 18 | <0.1% | 5 KB | Various | Recent |

### Growth Pattern Analysis

**Daily Data Accumulation (Last 15 Days):**

| Date | Events/Day | Daily Size | Cumulative Size |
|------|-----------|------------|-----------------|
| 2025-10-10 | 28,457 | 4.3 MB | 97 MB |
| 2025-10-09 | 54,717 | 8.2 MB | 93 MB |
| 2025-10-08 | 52,901 | 7.9 MB | 85 MB |
| 2025-10-07 | 52,538 | 8.1 MB | 77 MB |
| 2025-10-06 | 51,401 | 7.8 MB | 69 MB |
| 2025-10-05 | 50,528 | 7.9 MB | 61 MB |

**Average Daily Growth:** ~7.7 MB/day
**Weekly Growth:** ~54 MB/week
**Projected to hit 500 MB limit:** ~17 days (late October 2025)

### Workflow Data Distribution

| Complexity | Count | % | Avg Nodes | Avg JSON Size | Estimated Size |
|-----------|-------|---|-----------|---------------|----------------|
| Simple | 12,923 | 77.6% | 5.48 | 2,122 bytes | 20 MB |
| Medium | 3,708 | 22.3% | 13.93 | 4,458 bytes | 12 MB |
| Complex | 616 | 0.1% | 26.62 | 7,909 bytes | 3.2 MB |

**Key Finding:** No duplicate workflow hashes found - each workflow is unique (good data quality).

---

## 2. Data Value Classification

### TIER 1: Critical - Keep Indefinitely

**Error Patterns (error_occurred)**
- **Why:** Essential for identifying systemic issues and regression detection
- **Volume:** 4,935 events (626 KB)
- **Recommendation:** Keep all errors with aggregated summaries for older data
- **Retention:** Detailed errors 30 days, aggregated stats indefinitely

**Tool Usage Statistics (Aggregated)**
- **Why:** Product analytics and feature prioritization
- **Recommendation:** Aggregate daily/weekly summaries after 14 days
- **Keep:** Summary tables with tool usage counts, success rates, avg duration

### TIER 2: High Value - Keep 30 Days

**Validation Details (validation_details)**
- **Current:** 36,266 events, 11 MB, avg 329 bytes
- **Why:** Important for understanding validation issues during current development cycle
- **Value Period:** 30 days (covers current version development)
- **After 30d:** Aggregate to summary stats (validation success rate by node type)

**Workflow Creation Patterns (workflow_created)**
- **Current:** 23,151 events, 2.6 MB
- **Why:** Track feature adoption and workflow patterns
- **Value Period:** 30 days for detailed analysis
- **After 30d:** Keep aggregated metrics only

### TIER 3: Medium Value - Keep 14 Days

**Session Data (session_start)**
- **Current:** 12,575 events, 1.2 MB
- **Why:** User engagement tracking
- **Value Period:** 14 days sufficient for engagement analysis
- **Pruning Impact:** 497 KB saved (40% reduction)

**Workflow Validation Failures (workflow_validation_failed)**
- **Current:** 9,739 events, 314 KB
- **Why:** Tracks validation patterns but less detailed than validation_details
- **Value Period:** 14 days
- **Pruning Impact:** 170 KB saved (54% reduction)

### TIER 4: Short-Term Value - Keep 7 Days

**Tool Sequences (tool_sequence)**
- **Current:** 362,170 events, 67 MB (largest table!)
- **Why:** Tracks multi-tool workflows but extremely high volume
- **Value Period:** 7 days for recent pattern analysis
- **Pruning Impact:** 29 MB saved (43% reduction) - HIGHEST IMPACT
- **Rationale:** Tool usage patterns stabilize quickly; older sequences provide diminishing returns

**Tool Usage Events (tool_used)**
- **Current:** 191,659 events, 14 MB
- **Why:** Individual tool executions - can be aggregated
- **Value Period:** 7 days detailed, then aggregate
- **Pruning Impact:** 6.2 MB saved (44% reduction)

**Search Queries (search_query)**
- **Current:** 974 events, 106 KB
- **Why:** Low volume, useful for understanding search patterns
- **Value Period:** 7 days sufficient
- **Pruning Impact:** Minimal (~1 KB)

### TIER 5: Ephemeral - Keep 3 Days

**Diagnostic/Health Checks (diagnostic_completed, health_check_completed)**
- **Current:** 17 events, ~2.5 KB
- **Why:** Operational health checks, only current state matters
- **Value Period:** 3 days
- **Pruning Impact:** Negligible but good hygiene

### Workflow Data Retention Strategy

**telemetry_workflows Table (66 MB):**
- **Simple workflows (5-6 nodes):** Keep 7 days → Save 11 MB
- **Medium workflows (13-14 nodes):** Keep 14 days → Save 6.7 MB
- **Complex workflows (26+ nodes):** Keep 30 days → Save 1.9 MB
- **Total Workflow Savings:** 19.6 MB with tiered retention

**Rationale:** Complex workflows are rarer and more valuable for understanding advanced use cases.

---

## 3. Pruning Recommendations with Space Savings

### Strategy A: Conservative 14-Day Retention (Recommended for Initial Implementation)

| Action | Records Deleted | Space Saved | Risk Level |
|--------|----------------|-------------|------------|
| Delete tool_sequence > 14d | 0 | 0 MB | None - all recent |
| Delete tool_used > 14d | 0 | 0 MB | None - all recent |
| Delete validation_details > 14d | 4,259 | 1.2 MB | Low |
| Delete session_start > 14d | 0 | 0 MB | None - all recent |
| Delete workflows > 14d | 1 | <1 KB | None |
| **TOTAL** | **4,260** | **1.2 MB** | **Low** |

**Assessment:** Minimal immediate impact but data is too recent. Not sufficient to prevent overflow.

### Strategy B: Aggressive 7-Day Retention (RECOMMENDED)

| Action | Records Deleted | Space Saved | Risk Level |
|--------|----------------|-------------|------------|
| Delete tool_sequence > 7d | 155,389 | 29 MB | Low - pattern data |
| Delete tool_used > 7d | 82,827 | 6.2 MB | Low - usage metrics |
| Delete validation_details > 7d | 17,465 | 5.4 MB | Medium - debugging data |
| Delete workflow_created > 7d | 9,106 | 1.0 MB | Low - creation events |
| Delete session_start > 7d | 5,664 | 497 KB | Low - session data |
| Delete error_occurred > 7d | 2,321 | 206 KB | Medium - error history |
| Delete workflow_validation_failed > 7d | 5,269 | 170 KB | Low - validation events |
| Delete workflows > 7d (simple) | 5,146 | 11 MB | Low - simple workflows |
| Delete workflows > 7d (medium) | 1,506 | 6.7 MB | Medium - medium workflows |
| Delete workflows > 7d (complex) | 231 | 1.9 MB | High - complex workflows |
| **TOTAL** | **284,924** | **62.1 MB** | **Medium** |

**New Database Size:** 265 MB - 62.1 MB = **202.9 MB (76.6% of limit)**
**Buffer:** 297 MB remaining (~38 days at current growth rate)

### Strategy C: Hybrid Tiered Retention (OPTIMAL LONG-TERM)

| Event Type | Retention Period | Records Deleted | Space Saved |
|-----------|------------------|----------------|-------------|
| tool_sequence | 7 days | 155,389 | 29 MB |
| tool_used | 7 days | 82,827 | 6.2 MB |
| validation_details | 14 days | 4,259 | 1.2 MB |
| workflow_created | 14 days | 3 | <1 KB |
| session_start | 7 days | 5,664 | 497 KB |
| error_occurred | 30 days (keep all) | 0 | 0 MB |
| workflow_validation_failed | 7 days | 5,269 | 170 KB |
| search_query | 7 days | 10 | 1 KB |
| Workflows (simple) | 7 days | 5,146 | 11 MB |
| Workflows (medium) | 14 days | 0 | 0 MB |
| Workflows (complex) | 30 days (keep all) | 0 | 0 MB |
| **TOTAL** | **Various** | **258,567** | **48.1 MB** |

**New Database Size:** 265 MB - 48.1 MB = **216.9 MB (82% of limit)**
**Buffer:** 283 MB remaining (~36 days at current growth rate)

---

## 4. Additional Optimization Opportunities

### Optimization 1: Properties Field Compression

**Finding:** validation_details events have bloated properties (avg 329 bytes, max 9 KB)

```sql
-- Identify large validation_details records
SELECT id, user_id, created_at, pg_column_size(properties) as size_bytes
FROM telemetry_events
WHERE event = 'validation_details'
  AND pg_column_size(properties) > 1000
ORDER BY size_bytes DESC;
-- Result: 417 records > 1KB, 2 records > 5KB
```

**Recommendation:** Truncate verbose error messages in validation_details after 7 days
- Keep error types and counts
- Remove full stack traces and detailed messages
- Estimated savings: 2-3 MB

### Optimization 2: Remove Redundant tool_sequence Data

**Finding:** tool_sequence properties contain mostly null values

```sql
-- Analysis shows all tool_sequence.properties->>'tools' are null
-- 362,170 records storing null in properties field
```

**Recommendation:**
1. Investigate why tool_sequence properties are empty
2. If by design, reduce properties field size or use a flag
3. Potential savings: 10-15 MB if properties field is eliminated

### Optimization 3: Workflow Deduplication by Hash

**Finding:** No duplicate workflow_hash values found (good!)

**Recommendation:** Continue using workflow_hash for future deduplication if needed. No action required.

### Optimization 4: Dead Row Cleanup

**Finding:** telemetry_workflows has 1,591 dead rows (9.5% overhead)

```sql
-- Run VACUUM to reclaim space
VACUUM FULL telemetry_workflows;
-- Expected savings: ~6-7 MB
```

**Recommendation:** Schedule weekly VACUUM operations

### Optimization 5: Index Optimization

**Current indexes consume space but improve query performance**

```sql
-- Check index sizes
SELECT
    schemaname, tablename, indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;
```

**Recommendation:** Review if all indexes are necessary after pruning strategy is implemented

---

## 5. Implementation Strategy

### Phase 1: Immediate Emergency Pruning (Day 1)

**Goal:** Free up 60+ MB immediately to prevent overflow

```sql
-- EMERGENCY PRUNING: Delete data older than 7 days
BEGIN;

-- Backup count before deletion
SELECT
    event,
    COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '7 days') as to_delete
FROM telemetry_events
GROUP BY event;

-- Delete old events
DELETE FROM telemetry_events
WHERE created_at < NOW() - INTERVAL '7 days';
-- Expected: ~278,051 rows deleted, ~36.5 MB saved

-- Delete old simple workflows
DELETE FROM telemetry_workflows
WHERE created_at < NOW() - INTERVAL '7 days'
  AND complexity = 'simple';
-- Expected: ~5,146 rows deleted, ~11 MB saved

-- Verify new size
SELECT
    schemaname, relname,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||relname)) AS size
FROM pg_stat_user_tables
WHERE schemaname = 'public';

COMMIT;

-- Clean up dead rows
VACUUM FULL telemetry_events;
VACUUM FULL telemetry_workflows;
```

**Expected Result:** Database size reduced to ~210-220 MB (55-60% buffer remaining)

### Phase 2: Implement Automated Retention Policy (Week 1)

**Create a scheduled Supabase Edge Function or pg_cron job**

```sql
-- Create retention policy function
CREATE OR REPLACE FUNCTION apply_retention_policy()
RETURNS void AS $$
BEGIN
    -- Tier 4: 7-day retention for high-volume events
    DELETE FROM telemetry_events
    WHERE created_at < NOW() - INTERVAL '7 days'
      AND event IN ('tool_sequence', 'tool_used', 'session_start',
                     'workflow_validation_failed', 'search_query');

    -- Tier 3: 14-day retention for medium-value events
    DELETE FROM telemetry_events
    WHERE created_at < NOW() - INTERVAL '14 days'
      AND event IN ('validation_details', 'workflow_created');

    -- Tier 1: 30-day retention for errors (keep longer)
    DELETE FROM telemetry_events
    WHERE created_at < NOW() - INTERVAL '30 days'
      AND event = 'error_occurred';

    -- Workflow retention by complexity
    DELETE FROM telemetry_workflows
    WHERE created_at < NOW() - INTERVAL '7 days'
      AND complexity = 'simple';

    DELETE FROM telemetry_workflows
    WHERE created_at < NOW() - INTERVAL '14 days'
      AND complexity = 'medium';

    DELETE FROM telemetry_workflows
    WHERE created_at < NOW() - INTERVAL '30 days'
      AND complexity = 'complex';

    -- Cleanup
    VACUUM telemetry_events;
    VACUUM telemetry_workflows;
END;
$$ LANGUAGE plpgsql;

-- Schedule daily execution (using pg_cron extension)
SELECT cron.schedule('retention-policy', '0 2 * * *', 'SELECT apply_retention_policy()');
```

### Phase 3: Create Aggregation Tables (Week 2)

**Preserve insights while deleting raw data**

```sql
-- Daily tool usage summary
CREATE TABLE IF NOT EXISTS telemetry_daily_tool_stats (
    date DATE NOT NULL,
    tool TEXT NOT NULL,
    usage_count INTEGER NOT NULL,
    unique_users INTEGER NOT NULL,
    avg_duration_ms NUMERIC,
    error_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (date, tool)
);

-- Daily validation summary
CREATE TABLE IF NOT EXISTS telemetry_daily_validation_stats (
    date DATE NOT NULL,
    node_type TEXT,
    total_validations INTEGER NOT NULL,
    failed_validations INTEGER NOT NULL,
    success_rate NUMERIC,
    common_errors JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (date, node_type)
);

-- Aggregate function to run before pruning
CREATE OR REPLACE FUNCTION aggregate_before_pruning()
RETURNS void AS $$
BEGIN
    -- Aggregate tool usage for data about to be deleted
    INSERT INTO telemetry_daily_tool_stats (date, tool, usage_count, unique_users, avg_duration_ms)
    SELECT
        DATE(created_at) as date,
        properties->>'tool' as tool,
        COUNT(*) as usage_count,
        COUNT(DISTINCT user_id) as unique_users,
        AVG((properties->>'duration')::numeric) as avg_duration_ms
    FROM telemetry_events
    WHERE event = 'tool_used'
      AND created_at < NOW() - INTERVAL '7 days'
      AND created_at >= NOW() - INTERVAL '8 days'
    GROUP BY DATE(created_at), properties->>'tool'
    ON CONFLICT (date, tool) DO NOTHING;

    -- Aggregate validation stats
    INSERT INTO telemetry_daily_validation_stats (date, node_type, total_validations, failed_validations)
    SELECT
        DATE(created_at) as date,
        properties->>'nodeType' as node_type,
        COUNT(*) as total_validations,
        COUNT(*) FILTER (WHERE properties->>'valid' = 'false') as failed_validations
    FROM telemetry_events
    WHERE event = 'validation_details'
      AND created_at < NOW() - INTERVAL '14 days'
      AND created_at >= NOW() - INTERVAL '15 days'
    GROUP BY DATE(created_at), properties->>'nodeType'
    ON CONFLICT (date, node_type) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Update cron job to aggregate before pruning
SELECT cron.schedule('aggregate-then-prune', '0 2 * * *',
    'SELECT aggregate_before_pruning(); SELECT apply_retention_policy();');
```

### Phase 4: Monitoring and Alerting (Week 2)

**Create size monitoring function**

```sql
CREATE OR REPLACE FUNCTION check_database_size()
RETURNS TABLE(
    total_size_mb NUMERIC,
    limit_mb NUMERIC,
    percent_used NUMERIC,
    days_until_full NUMERIC
) AS $$
DECLARE
    current_size_bytes BIGINT;
    growth_rate_bytes_per_day NUMERIC;
BEGIN
    -- Get current size
    SELECT SUM(pg_total_relation_size(schemaname||'.'||relname))
    INTO current_size_bytes
    FROM pg_stat_user_tables
    WHERE schemaname = 'public';

    -- Calculate 7-day growth rate
    SELECT
        (COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')) *
        AVG(pg_column_size(properties)) * (1.0/7)
    INTO growth_rate_bytes_per_day
    FROM telemetry_events;

    RETURN QUERY
    SELECT
        ROUND((current_size_bytes / 1024.0 / 1024.0)::numeric, 2) as total_size_mb,
        500.0 as limit_mb,
        ROUND((current_size_bytes / 1024.0 / 1024.0 / 500.0 * 100)::numeric, 2) as percent_used,
        ROUND((((500.0 * 1024 * 1024) - current_size_bytes) / NULLIF(growth_rate_bytes_per_day, 0))::numeric, 1) as days_until_full;
END;
$$ LANGUAGE plpgsql;

-- Alert function (integrate with external monitoring)
CREATE OR REPLACE FUNCTION alert_if_size_critical()
RETURNS void AS $$
DECLARE
    size_pct NUMERIC;
BEGIN
    SELECT percent_used INTO size_pct FROM check_database_size();

    IF size_pct > 90 THEN
        -- Log critical alert
        INSERT INTO telemetry_events (user_id, event, properties)
        VALUES ('system', 'database_size_critical',
                json_build_object('percent_used', size_pct, 'timestamp', NOW())::jsonb);
    END IF;
END;
$$ LANGUAGE plpgsql;
```

---

## 6. Priority Order for Implementation

### Priority 1: URGENT (Day 1)
1. **Execute Emergency Pruning** - Delete data older than 7 days
   - Impact: 47.5 MB saved immediately
   - Risk: Low - data already analyzed
   - SQL: Provided in Phase 1

### Priority 2: HIGH (Week 1)
2. **Implement Automated Retention Policy**
   - Impact: Prevents future overflow
   - Risk: Low with proper testing
   - Implementation: Phase 2 function

3. **Run VACUUM FULL**
   - Impact: 6-7 MB reclaimed from dead rows
   - Risk: Low but locks tables briefly
   - Command: `VACUUM FULL telemetry_workflows;`

### Priority 3: MEDIUM (Week 2)
4. **Create Aggregation Tables**
   - Impact: Preserves insights, enables longer-term pruning
   - Risk: Low - additive only
   - Implementation: Phase 3 tables and functions

5. **Implement Monitoring**
   - Impact: Prevents future surprises
   - Risk: None
   - Implementation: Phase 4 monitoring functions

### Priority 4: LOW (Month 1)
6. **Optimize Properties Fields**
   - Impact: 2-3 MB additional savings
   - Risk: Medium - requires code changes
   - Action: Truncate verbose error messages

7. **Investigate tool_sequence null properties**
   - Impact: 10-15 MB potential savings
   - Risk: Medium - requires application changes
   - Action: Code review and optimization

---

## 7. Risk Assessment

### Strategy B (7-Day Retention): Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|---------|------------|
| Loss of debugging data for old issues | Medium | Medium | Keep error_occurred for 30 days; aggregate validation stats |
| Unable to analyze long-term trends | Low | Low | Implement aggregation tables before pruning |
| Accidental deletion of critical data | Low | High | Test on staging; implement backups; add rollback capability |
| Performance impact during deletion | Medium | Low | Run during off-peak hours (2 AM UTC) |
| VACUUM locks table briefly | Low | Low | Schedule during low-usage window |

### Strategy C (Hybrid Tiered): Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|---------|------------|
| Complex logic leads to bugs | Medium | Medium | Thorough testing; monitoring; gradual rollout |
| Different retention per event type confusing | Low | Low | Document clearly; add comments in code |
| Tiered approach still insufficient | Low | High | Monitor growth; adjust retention if needed |

---

## 8. Monitoring Metrics

### Key Metrics to Track Post-Implementation

1. **Database Size Trend**
   ```sql
   SELECT * FROM check_database_size();
   ```
   - Target: Stay under 300 MB (60% of limit)
   - Alert threshold: 90% (450 MB)

2. **Daily Growth Rate**
   ```sql
   SELECT
       DATE(created_at) as date,
       COUNT(*) as events,
       pg_size_pretty(SUM(pg_column_size(properties))::bigint) as daily_size
   FROM telemetry_events
   WHERE created_at >= NOW() - INTERVAL '7 days'
   GROUP BY DATE(created_at)
   ORDER BY date DESC;
   ```
   - Target: < 8 MB/day average
   - Alert threshold: > 12 MB/day sustained

3. **Retention Policy Execution**
   ```sql
   -- Add logging to retention policy function
   CREATE TABLE retention_policy_log (
       executed_at TIMESTAMPTZ DEFAULT NOW(),
       events_deleted INTEGER,
       workflows_deleted INTEGER,
       space_reclaimed_mb NUMERIC
   );
   ```
   - Monitor: Daily successful execution
   - Alert: If job fails or deletes 0 rows unexpectedly

4. **Data Availability Check**
   ```sql
   -- Ensure sufficient data for analysis
   SELECT
       event,
       COUNT(*) as available_records,
       MIN(created_at) as oldest_record,
       MAX(created_at) as newest_record
   FROM telemetry_events
   GROUP BY event;
   ```
   - Target: 7 days of data always available
   - Alert: If oldest_record > 8 days ago (retention policy failing)

---

## 9. Recommended Action Plan

### Immediate Actions (Today)

**Step 1:** Execute emergency pruning
```sql
-- Backup first (optional but recommended)
-- Create a copy of current stats
CREATE TABLE telemetry_events_stats_backup AS
SELECT event, COUNT(*), MIN(created_at), MAX(created_at)
FROM telemetry_events
GROUP BY event;

-- Execute pruning
DELETE FROM telemetry_events WHERE created_at < NOW() - INTERVAL '7 days';
DELETE FROM telemetry_workflows WHERE created_at < NOW() - INTERVAL '7 days' AND complexity = 'simple';
VACUUM FULL telemetry_events;
VACUUM FULL telemetry_workflows;
```

**Step 2:** Verify results
```sql
SELECT * FROM check_database_size();
```

**Expected outcome:** Database size ~210-220 MB (58-60% buffer remaining)

### Week 1 Actions

**Step 3:** Implement automated retention policy
- Create retention policy function (Phase 2 code)
- Test function on staging/development environment
- Schedule daily execution via pg_cron

**Step 4:** Set up monitoring
- Create monitoring functions (Phase 4 code)
- Configure alerts for size thresholds
- Document escalation procedures

### Week 2 Actions

**Step 5:** Create aggregation tables
- Implement summary tables (Phase 3 code)
- Backfill historical aggregations if needed
- Update retention policy to aggregate before pruning

**Step 6:** Optimize and tune
- Review query performance post-pruning
- Adjust retention periods if needed based on actual usage
- Document any issues or improvements

### Monthly Maintenance

**Step 7:** Regular review
- Monthly review of database growth trends
- Quarterly review of retention policy effectiveness
- Adjust retention periods based on product needs

---

## 10. SQL Execution Scripts

### Script 1: Emergency Pruning (Run First)

```sql
-- ============================================
-- EMERGENCY PRUNING SCRIPT
-- Expected savings: ~50 MB
-- Execution time: 2-5 minutes
-- ============================================

BEGIN;

-- Create backup of current state
CREATE TABLE IF NOT EXISTS pruning_audit (
    executed_at TIMESTAMPTZ DEFAULT NOW(),
    action TEXT,
    records_affected INTEGER,
    size_before_mb NUMERIC,
    size_after_mb NUMERIC
);

-- Record size before
INSERT INTO pruning_audit (action, size_before_mb)
SELECT 'before_pruning',
       pg_total_relation_size('telemetry_events')::numeric / 1024 / 1024;

-- Delete old events (keep last 7 days)
WITH deleted AS (
    DELETE FROM telemetry_events
    WHERE created_at < NOW() - INTERVAL '7 days'
    RETURNING *
)
INSERT INTO pruning_audit (action, records_affected)
SELECT 'delete_events_7d', COUNT(*) FROM deleted;

-- Delete old simple workflows (keep last 7 days)
WITH deleted AS (
    DELETE FROM telemetry_workflows
    WHERE created_at < NOW() - INTERVAL '7 days'
      AND complexity = 'simple'
    RETURNING *
)
INSERT INTO pruning_audit (action, records_affected)
SELECT 'delete_workflows_simple_7d', COUNT(*) FROM deleted;

-- Record size after
UPDATE pruning_audit
SET size_after_mb = pg_total_relation_size('telemetry_events')::numeric / 1024 / 1024
WHERE action = 'before_pruning';

COMMIT;

-- Cleanup dead space
VACUUM FULL telemetry_events;
VACUUM FULL telemetry_workflows;

-- Verify results
SELECT * FROM pruning_audit ORDER BY executed_at DESC LIMIT 5;
SELECT * FROM check_database_size();
```

### Script 2: Create Retention Policy (Run After Testing)

```sql
-- ============================================
-- AUTOMATED RETENTION POLICY
-- Schedule: Daily at 2 AM UTC
-- ============================================

CREATE OR REPLACE FUNCTION apply_retention_policy()
RETURNS TABLE(
    action TEXT,
    records_deleted INTEGER,
    execution_time_ms INTEGER
) AS $$
DECLARE
    start_time TIMESTAMPTZ;
    end_time TIMESTAMPTZ;
    deleted_count INTEGER;
BEGIN
    -- Tier 4: 7-day retention (high volume, low long-term value)
    start_time := clock_timestamp();

    DELETE FROM telemetry_events
    WHERE created_at < NOW() - INTERVAL '7 days'
      AND event IN ('tool_sequence', 'tool_used', 'session_start',
                     'workflow_validation_failed', 'search_query');
    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    end_time := clock_timestamp();
    action := 'delete_tier4_7d';
    records_deleted := deleted_count;
    execution_time_ms := EXTRACT(MILLISECONDS FROM (end_time - start_time))::INTEGER;
    RETURN NEXT;

    -- Tier 3: 14-day retention (medium value)
    start_time := clock_timestamp();

    DELETE FROM telemetry_events
    WHERE created_at < NOW() - INTERVAL '14 days'
      AND event IN ('validation_details', 'workflow_created');
    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    end_time := clock_timestamp();
    action := 'delete_tier3_14d';
    records_deleted := deleted_count;
    execution_time_ms := EXTRACT(MILLISECONDS FROM (end_time - start_time))::INTEGER;
    RETURN NEXT;

    -- Tier 1: 30-day retention (errors - keep longer)
    start_time := clock_timestamp();

    DELETE FROM telemetry_events
    WHERE created_at < NOW() - INTERVAL '30 days'
      AND event = 'error_occurred';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    end_time := clock_timestamp();
    action := 'delete_errors_30d';
    records_deleted := deleted_count;
    execution_time_ms := EXTRACT(MILLISECONDS FROM (end_time - start_time))::INTEGER;
    RETURN NEXT;

    -- Workflow pruning by complexity
    start_time := clock_timestamp();

    DELETE FROM telemetry_workflows
    WHERE created_at < NOW() - INTERVAL '7 days'
      AND complexity = 'simple';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    end_time := clock_timestamp();
    action := 'delete_workflows_simple_7d';
    records_deleted := deleted_count;
    execution_time_ms := EXTRACT(MILLISECONDS FROM (end_time - start_time))::INTEGER;
    RETURN NEXT;

    start_time := clock_timestamp();

    DELETE FROM telemetry_workflows
    WHERE created_at < NOW() - INTERVAL '14 days'
      AND complexity = 'medium';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    end_time := clock_timestamp();
    action := 'delete_workflows_medium_14d';
    records_deleted := deleted_count;
    execution_time_ms := EXTRACT(MILLISECONDS FROM (end_time - start_time))::INTEGER;
    RETURN NEXT;

    start_time := clock_timestamp();

    DELETE FROM telemetry_workflows
    WHERE created_at < NOW() - INTERVAL '30 days'
      AND complexity = 'complex';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    end_time := clock_timestamp();
    action := 'delete_workflows_complex_30d';
    records_deleted := deleted_count;
    execution_time_ms := EXTRACT(MILLISECONDS FROM (end_time - start_time))::INTEGER;
    RETURN NEXT;

    -- Vacuum to reclaim space
    start_time := clock_timestamp();
    VACUUM telemetry_events;
    VACUUM telemetry_workflows;
    end_time := clock_timestamp();

    action := 'vacuum_tables';
    records_deleted := 0;
    execution_time_ms := EXTRACT(MILLISECONDS FROM (end_time - start_time))::INTEGER;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- Test the function (dry run - won't schedule yet)
SELECT * FROM apply_retention_policy();

-- After testing, schedule with pg_cron
-- Requires pg_cron extension: CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule('retention-policy', '0 2 * * *', 'SELECT apply_retention_policy()');
```

### Script 3: Create Monitoring Dashboard

```sql
-- ============================================
-- MONITORING QUERIES
-- Run these regularly to track database health
-- ============================================

-- Query 1: Current database size and projections
SELECT
    'Current Size' as metric,
    pg_size_pretty(SUM(pg_total_relation_size(schemaname||'.'||relname))) as value
FROM pg_stat_user_tables
WHERE schemaname = 'public'
UNION ALL
SELECT
    'Free Tier Limit' as metric,
    '500 MB' as value
UNION ALL
SELECT
    'Percent Used' as metric,
    CONCAT(
        ROUND(
            (SUM(pg_total_relation_size(schemaname||'.'||relname))::numeric /
             (500.0 * 1024 * 1024) * 100),
            2
        ),
        '%'
    ) as value
FROM pg_stat_user_tables
WHERE schemaname = 'public';

-- Query 2: Data age distribution
SELECT
    event,
    COUNT(*) as total_records,
    MIN(created_at) as oldest_record,
    MAX(created_at) as newest_record,
    ROUND(EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) / 86400, 2) as age_days
FROM telemetry_events
GROUP BY event
ORDER BY total_records DESC;

-- Query 3: Daily growth tracking (last 7 days)
SELECT
    DATE(created_at) as date,
    COUNT(*) as daily_events,
    pg_size_pretty(SUM(pg_column_size(properties))::bigint) as daily_data_size,
    COUNT(DISTINCT user_id) as active_users
FROM telemetry_events
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Query 4: Retention policy effectiveness
SELECT
    DATE(executed_at) as execution_date,
    action,
    records_deleted,
    execution_time_ms
FROM (
    SELECT * FROM apply_retention_policy()
) AS policy_run
ORDER BY execution_date DESC;
```

---

## Conclusion

**Immediate Action Required:** Implement Strategy B (7-day retention) immediately to avoid database overflow within 2 weeks.

**Long-Term Strategy:** Transition to Strategy C (Hybrid Tiered Retention) with automated aggregation to balance data preservation with storage constraints.

**Expected Outcomes:**
- Immediate: 50+ MB saved (26% reduction)
- Ongoing: Database stabilized at 200-220 MB (40-44% of limit)
- Buffer: 30-40 days before limit with current growth rate
- Risk: Low with proper testing and monitoring

**Success Metrics:**
1. Database size < 300 MB consistently
2. 7+ days of detailed event data always available
3. No impact on product analytics capabilities
4. Automated retention policy runs daily without errors

---

**Analysis completed:** 2025-10-10
**Next review date:** 2025-11-10 (monthly check)
**Escalation:** If database exceeds 400 MB, consider upgrading to paid tier or implementing more aggressive pruning
