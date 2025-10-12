# Telemetry Data Pruning & Aggregation Guide

## Overview

This guide provides a complete solution for managing n8n-mcp telemetry data in Supabase to stay within the 500 MB free tier limit while preserving valuable insights for product development.

## Current Situation

- **Database Size**: 265 MB / 500 MB (53% of limit)
- **Growth Rate**: 7.7 MB/day (54 MB/week)
- **Time Until Full**: ~17 days
- **Total Events**: 641,487 events + 17,247 workflows

### Storage Breakdown

| Event Type | Count | Size | % of Total |
|------------|-------|------|------------|
| `tool_sequence` | 362,704 | 96 MB | 72% |
| `tool_used` | 191,938 | 28 MB | 21% |
| `validation_details` | 36,280 | 14 MB | 11% |
| `workflow_created` | 23,213 | 4.5 MB | 3% |
| Others | ~26,000 | ~3 MB | 2% |

## Solution Strategy

**Aggregate → Delete → Retain only recent raw events**

### Expected Results

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Database Size | 265 MB | ~90-120 MB | **55-65% reduction** |
| Growth Rate | 7.7 MB/day | ~2-3 MB/day | **60-70% slower** |
| Days Until Full | 17 days | **Sustainable** | Never fills |
| Free Tier Usage | 53% | ~20-25% | **75-80% headroom** |

## Implementation Steps

### Step 1: Execute the SQL Migration

Open Supabase SQL Editor and run the entire contents of `supabase-telemetry-aggregation.sql`:

```sql
-- Copy and paste the entire supabase-telemetry-aggregation.sql file
-- Or run it directly from the file
```

This will create:
- 5 aggregation tables
- Aggregation functions
- Automated cleanup function
- Monitoring functions
- Scheduled cron job (daily at 2 AM UTC)

### Step 2: Verify Cron Job Setup

Check that the cron job was created successfully:

```sql
-- View scheduled cron jobs
SELECT
    jobid,
    schedule,
    command,
    nodename,
    nodeport,
    database,
    username,
    active
FROM cron.job
WHERE jobname = 'telemetry-daily-cleanup';
```

Expected output:
- Schedule: `0 2 * * *` (daily at 2 AM UTC)
- Active: `true`

### Step 3: Run Initial Emergency Cleanup

Get immediate space relief by running the emergency cleanup:

```sql
-- This will aggregate and delete data older than 7 days
SELECT * FROM emergency_cleanup();
```

Expected results:
```
action                              | rows_deleted | space_freed_mb
------------------------------------+--------------+----------------
Deleted non-critical events > 7d    | ~284,924     | ~52 MB
Deleted error events > 14d          | ~2,400       | ~0.5 MB
Deleted duplicate workflows         | ~8,500       | ~11 MB
TOTAL (run VACUUM separately)       | 0            | ~63.5 MB
```

### Step 4: Reclaim Disk Space

After deletion, reclaim the actual disk space:

```sql
-- Reclaim space from deleted rows
VACUUM FULL telemetry_events;
VACUUM FULL telemetry_workflows;

-- Update statistics for query optimization
ANALYZE telemetry_events;
ANALYZE telemetry_workflows;
```

**Note**: `VACUUM FULL` may take a few minutes and locks the table. Run during off-peak hours if possible.

### Step 5: Verify Results

Check the new database size:

```sql
SELECT * FROM check_database_size();
```

Expected output:
```
total_size_mb | events_size_mb | workflows_size_mb | aggregates_size_mb | percent_of_limit | days_until_full | status
--------------+----------------+-------------------+--------------------+------------------+-----------------+---------
202.5         | 85.2           | 35.8              | 12.5               | 40.5             | ~95             | HEALTHY
```

## Daily Operations (Automated)

Once set up, the system runs automatically:

1. **Daily at 2 AM UTC**: Cron job runs
2. **Aggregation**: Data older than 3 days is aggregated into summary tables
3. **Deletion**: Raw events are deleted after aggregation
4. **Cleanup**: VACUUM runs to reclaim space
5. **Retention**:
   - High-volume events: 3 days
   - Error events: 30 days
   - Aggregated insights: Forever

## Monitoring Commands

### Check Database Health

```sql
-- View current size and status
SELECT * FROM check_database_size();
```

### View Aggregated Insights

```sql
-- Top tools used daily
SELECT
    aggregation_date,
    tool_name,
    usage_count,
    success_count,
    error_count,
    ROUND(100.0 * success_count / NULLIF(usage_count, 0), 1) as success_rate_pct
FROM telemetry_tool_usage_daily
ORDER BY aggregation_date DESC, usage_count DESC
LIMIT 50;

-- Most common tool sequences
SELECT
    aggregation_date,
    tool_sequence,
    occurrence_count,
    ROUND(avg_sequence_duration_ms, 0) as avg_duration_ms,
    ROUND(100 * success_rate, 1) as success_rate_pct
FROM telemetry_tool_patterns
ORDER BY occurrence_count DESC
LIMIT 20;

-- Error patterns over time
SELECT
    aggregation_date,
    error_type,
    error_context,
    occurrence_count,
    affected_users,
    sample_error_message
FROM telemetry_error_patterns
ORDER BY aggregation_date DESC, occurrence_count DESC
LIMIT 30;

-- Workflow creation trends
SELECT
    aggregation_date,
    complexity,
    node_count_range,
    has_trigger,
    has_webhook,
    workflow_count,
    ROUND(avg_node_count, 1) as avg_nodes
FROM telemetry_workflow_insights
ORDER BY aggregation_date DESC, workflow_count DESC
LIMIT 30;

-- Validation success rates
SELECT
    aggregation_date,
    validation_type,
    profile,
    success_count,
    failure_count,
    ROUND(100.0 * success_count / NULLIF(success_count + failure_count, 0), 1) as success_rate_pct,
    common_failure_reasons
FROM telemetry_validation_insights
ORDER BY aggregation_date DESC, (success_count + failure_count) DESC
LIMIT 30;
```

### Check Cron Job Execution History

```sql
-- View recent cron job runs
SELECT
    runid,
    jobid,
    database,
    status,
    return_message,
    start_time,
    end_time
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'telemetry-daily-cleanup')
ORDER BY start_time DESC
LIMIT 10;
```

## Manual Operations

### Run Cleanup On-Demand

If you need to run cleanup outside the scheduled time:

```sql
-- Run with default 3-day retention
SELECT * FROM run_telemetry_aggregation_and_cleanup(3);
VACUUM ANALYZE telemetry_events;

-- Or with custom retention (e.g., 5 days)
SELECT * FROM run_telemetry_aggregation_and_cleanup(5);
VACUUM ANALYZE telemetry_events;
```

### Emergency Cleanup (Critical Situations)

If database is approaching limit and you need immediate relief:

```sql
-- Step 1: Run emergency cleanup (7-day retention)
SELECT * FROM emergency_cleanup();

-- Step 2: Reclaim space aggressively
VACUUM FULL telemetry_events;
VACUUM FULL telemetry_workflows;
ANALYZE telemetry_events;
ANALYZE telemetry_workflows;

-- Step 3: Verify results
SELECT * FROM check_database_size();
```

### Adjust Retention Policy

To change the default 3-day retention period:

```sql
-- Update cron job to use 5-day retention instead
SELECT cron.unschedule('telemetry-daily-cleanup');

SELECT cron.schedule(
    'telemetry-daily-cleanup',
    '0 2 * * *', -- Daily at 2 AM UTC
    $$
    SELECT run_telemetry_aggregation_and_cleanup(5); -- 5 days instead of 3
    VACUUM ANALYZE telemetry_events;
    VACUUM ANALYZE telemetry_workflows;
    $$
);
```

## Data Retention Policies

### Raw Events Retention

| Event Type | Retention | Reason |
|------------|-----------|--------|
| `tool_sequence` | 3 days | High volume, low long-term value |
| `tool_used` | 3 days | High volume, aggregated daily |
| `validation_details` | 3 days | Aggregated into insights |
| `workflow_created` | 3 days | Aggregated into patterns |
| `session_start` | 3 days | Operational data only |
| `search_query` | 3 days | Operational data only |
| `error_occurred` | **30 days** | Extended for debugging |
| `workflow_validation_failed` | 3 days | Captured in aggregates |

### Aggregated Data Retention

All aggregated data is kept **indefinitely**:
- Daily tool usage statistics
- Tool sequence patterns
- Workflow creation trends
- Error patterns and frequencies
- Validation success rates

### Workflow Retention

- **Unique workflows**: Kept indefinitely (one per unique hash)
- **Duplicate workflows**: Deleted after 3 days
- **Workflow metadata**: Aggregated into daily insights

## Intelligence Preserved

Even after aggressive pruning, you still have access to:

### Long-term Product Insights
- Which tools are most/least used over time
- Tool usage trends and adoption curves
- Common workflow patterns and complexities
- Error frequencies and types across versions
- Validation failure patterns

### Development Intelligence
- Feature adoption rates (by day/week/month)
- Pain points (high error rates, validation failures)
- User behavior patterns (tool sequences, workflow styles)
- Version comparison (changes in usage between releases)

### Recent Debugging Data
- Last 3 days of raw events for immediate issues
- Last 30 days of error events for bug tracking
- Sample error messages for each error type

## Troubleshooting

### Cron Job Not Running

Check if pg_cron extension is enabled:

```sql
-- Enable pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Verify it's enabled
SELECT * FROM pg_extension WHERE extname = 'pg_cron';
```

### Aggregation Functions Failing

Check for errors in cron job execution:

```sql
-- View error messages
SELECT
    status,
    return_message,
    start_time
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'telemetry-daily-cleanup')
    AND status = 'failed'
ORDER BY start_time DESC;
```

### VACUUM Not Reclaiming Space

If `VACUUM ANALYZE` isn't reclaiming enough space, use `VACUUM FULL`:

```sql
-- More aggressive space reclamation (locks table)
VACUUM FULL telemetry_events;
```

### Database Still Growing Too Fast

Reduce retention period further:

```sql
-- Change to 2-day retention (more aggressive)
SELECT * FROM run_telemetry_aggregation_and_cleanup(2);
```

Or delete more event types:

```sql
-- Delete additional low-value events
DELETE FROM telemetry_events
WHERE created_at < NOW() - INTERVAL '3 days'
    AND event IN ('session_start', 'search_query', 'diagnostic_completed', 'health_check_completed');
```

## Performance Considerations

### Cron Job Execution Time

The daily cleanup typically takes:
- **Aggregation**: 30-60 seconds
- **Deletion**: 15-30 seconds
- **VACUUM**: 2-5 minutes
- **Total**: ~3-7 minutes

### Query Performance

All aggregation tables have indexes on:
- Date columns (for time-series queries)
- Lookup columns (tool_name, error_type, etc.)
- User columns (for user-specific analysis)

### Lock Considerations

- `VACUUM ANALYZE`: Minimal locking, safe during operation
- `VACUUM FULL`: Locks table, run during off-peak hours
- Aggregation functions: Read-only queries, no locking

## Customization

### Add Custom Aggregations

To track additional metrics, create new aggregation tables:

```sql
-- Example: Session duration aggregation
CREATE TABLE telemetry_session_duration_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregation_date DATE NOT NULL,
    avg_duration_seconds NUMERIC,
    median_duration_seconds NUMERIC,
    max_duration_seconds NUMERIC,
    session_count INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(aggregation_date)
);

-- Add to cleanup function
-- (modify run_telemetry_aggregation_and_cleanup)
```

### Modify Retention Policies

Edit the `run_telemetry_aggregation_and_cleanup` function to adjust retention by event type:

```sql
-- Keep validation_details for 7 days instead of 3
DELETE FROM telemetry_events
WHERE created_at < (NOW() - INTERVAL '7 days')
    AND event = 'validation_details';
```

### Change Cron Schedule

Adjust the execution time if needed:

```sql
-- Run at different time (e.g., 3 AM UTC)
SELECT cron.schedule(
    'telemetry-daily-cleanup',
    '0 3 * * *', -- 3 AM instead of 2 AM
    $$ SELECT run_telemetry_aggregation_and_cleanup(3); VACUUM ANALYZE telemetry_events; $$
);

-- Run twice daily (2 AM and 2 PM)
SELECT cron.schedule(
    'telemetry-cleanup-morning',
    '0 2 * * *',
    $$ SELECT run_telemetry_aggregation_and_cleanup(3); $$
);

SELECT cron.schedule(
    'telemetry-cleanup-afternoon',
    '0 14 * * *',
    $$ SELECT run_telemetry_aggregation_and_cleanup(3); $$
);
```

## Backup & Recovery

### Before Running Emergency Cleanup

Create a backup of aggregation queries:

```sql
-- Export aggregated data to CSV or backup tables
CREATE TABLE telemetry_tool_usage_backup AS
SELECT * FROM telemetry_tool_usage_daily;

CREATE TABLE telemetry_patterns_backup AS
SELECT * FROM telemetry_tool_patterns;
```

### Restore Deleted Data

Raw event data cannot be restored after deletion. However, aggregated insights are preserved indefinitely.

To prevent accidental data loss:
1. Test cleanup functions on staging first
2. Review `check_database_size()` before running emergency cleanup
3. Start with longer retention periods (7 days) and reduce gradually
4. Monitor aggregated data quality for 1-2 weeks

## Monitoring Dashboard Queries

### Weekly Growth Report

```sql
-- Database growth over last 7 days
SELECT
    DATE(created_at) as date,
    COUNT(*) as events_created,
    COUNT(DISTINCT event) as event_types,
    COUNT(DISTINCT user_id) as active_users,
    ROUND(SUM(pg_column_size(telemetry_events.*))::NUMERIC / 1024 / 1024, 2) as size_mb
FROM telemetry_events
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

### Storage Efficiency Report

```sql
-- Compare raw vs aggregated storage
SELECT
    'Raw Events (last 3 days)' as category,
    COUNT(*) as row_count,
    pg_size_pretty(pg_total_relation_size('telemetry_events')) as table_size
FROM telemetry_events
WHERE created_at >= NOW() - INTERVAL '3 days'

UNION ALL

SELECT
    'Aggregated Insights (all time)',
    (SELECT COUNT(*) FROM telemetry_tool_usage_daily) +
    (SELECT COUNT(*) FROM telemetry_tool_patterns) +
    (SELECT COUNT(*) FROM telemetry_workflow_insights) +
    (SELECT COUNT(*) FROM telemetry_error_patterns) +
    (SELECT COUNT(*) FROM telemetry_validation_insights),
    pg_size_pretty(
        pg_total_relation_size('telemetry_tool_usage_daily') +
        pg_total_relation_size('telemetry_tool_patterns') +
        pg_total_relation_size('telemetry_workflow_insights') +
        pg_total_relation_size('telemetry_error_patterns') +
        pg_total_relation_size('telemetry_validation_insights')
    );
```

### Top Events by Size

```sql
-- Which event types consume most space
SELECT
    event,
    COUNT(*) as event_count,
    pg_size_pretty(SUM(pg_column_size(telemetry_events.*))::BIGINT) as total_size,
    pg_size_pretty(AVG(pg_column_size(telemetry_events.*))::BIGINT) as avg_size_per_event,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as pct_of_events
FROM telemetry_events
GROUP BY event
ORDER BY SUM(pg_column_size(telemetry_events.*)) DESC;
```

## Success Metrics

Track these metrics weekly to ensure the system is working:

### Target Metrics (After Implementation)

- ✅ Database size: **< 150 MB** (< 30% of limit)
- ✅ Growth rate: **< 3 MB/day** (sustainable)
- ✅ Raw event retention: **3 days** (configurable)
- ✅ Aggregated data: **All-time insights available**
- ✅ Cron job success rate: **> 95%**
- ✅ Query performance: **< 500ms for aggregated queries**

### Review Schedule

- **Daily**: Check `check_database_size()` status
- **Weekly**: Review aggregated insights and growth trends
- **Monthly**: Analyze cron job success rate and adjust retention if needed
- **After each release**: Compare usage patterns to previous version

## Quick Reference

### Essential Commands

```sql
-- Check database health
SELECT * FROM check_database_size();

-- View recent aggregated insights
SELECT * FROM telemetry_tool_usage_daily ORDER BY aggregation_date DESC LIMIT 10;

-- Run manual cleanup (3-day retention)
SELECT * FROM run_telemetry_aggregation_and_cleanup(3);
VACUUM ANALYZE telemetry_events;

-- Emergency cleanup (7-day retention)
SELECT * FROM emergency_cleanup();
VACUUM FULL telemetry_events;

-- View cron job status
SELECT * FROM cron.job WHERE jobname = 'telemetry-daily-cleanup';

-- View cron execution history
SELECT * FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'telemetry-daily-cleanup')
ORDER BY start_time DESC LIMIT 5;
```

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review cron job execution logs
3. Verify pg_cron extension is enabled
4. Test aggregation functions manually
5. Check Supabase dashboard for errors

For questions or improvements, refer to the main project documentation.
