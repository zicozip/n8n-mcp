-- ============================================================================
-- N8N-MCP Telemetry Aggregation & Automated Pruning System
-- ============================================================================
-- Purpose: Create aggregation tables and automated cleanup to maintain
--          database under 500MB free tier limit while preserving insights
--
-- Strategy: Aggregate → Delete → Retain only recent raw events
-- Expected savings: ~120 MB (from 265 MB → ~145 MB steady state)
-- ============================================================================

-- ============================================================================
-- PART 1: AGGREGATION TABLES
-- ============================================================================

-- Daily tool usage summary (replaces 96 MB of tool_sequence raw data)
CREATE TABLE IF NOT EXISTS telemetry_tool_usage_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregation_date DATE NOT NULL,
    user_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    usage_count INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    avg_execution_time_ms NUMERIC,
    total_execution_time_ms BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(aggregation_date, user_id, tool_name)
);

CREATE INDEX idx_tool_usage_daily_date ON telemetry_tool_usage_daily(aggregation_date DESC);
CREATE INDEX idx_tool_usage_daily_tool ON telemetry_tool_usage_daily(tool_name);
CREATE INDEX idx_tool_usage_daily_user ON telemetry_tool_usage_daily(user_id);

COMMENT ON TABLE telemetry_tool_usage_daily IS 'Daily aggregation of tool usage replacing raw tool_used and tool_sequence events. Saves ~95% storage.';

-- Tool sequence patterns (replaces individual sequences with pattern analysis)
CREATE TABLE IF NOT EXISTS telemetry_tool_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregation_date DATE NOT NULL,
    tool_sequence TEXT[] NOT NULL, -- Array of tool names in order
    sequence_hash TEXT NOT NULL, -- Hash of the sequence for grouping
    occurrence_count INTEGER NOT NULL DEFAULT 1,
    avg_sequence_duration_ms NUMERIC,
    success_rate NUMERIC, -- 0.0 to 1.0
    common_errors JSONB, -- {"error_type": count}
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(aggregation_date, sequence_hash)
);

CREATE INDEX idx_tool_patterns_date ON telemetry_tool_patterns(aggregation_date DESC);
CREATE INDEX idx_tool_patterns_hash ON telemetry_tool_patterns(sequence_hash);

COMMENT ON TABLE telemetry_tool_patterns IS 'Common tool usage patterns aggregated daily. Identifies workflows and AI behavior patterns.';

-- Workflow insights (aggregates workflow_created events)
CREATE TABLE IF NOT EXISTS telemetry_workflow_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregation_date DATE NOT NULL,
    complexity TEXT, -- simple/medium/complex
    node_count_range TEXT, -- 1-5, 6-10, 11-20, 21+
    has_trigger BOOLEAN,
    has_webhook BOOLEAN,
    common_node_types TEXT[], -- Top node types used
    workflow_count INTEGER NOT NULL DEFAULT 0,
    avg_node_count NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(aggregation_date, complexity, node_count_range, has_trigger, has_webhook)
);

CREATE INDEX idx_workflow_insights_date ON telemetry_workflow_insights(aggregation_date DESC);
CREATE INDEX idx_workflow_insights_complexity ON telemetry_workflow_insights(complexity);

COMMENT ON TABLE telemetry_workflow_insights IS 'Daily workflow creation patterns. Shows adoption trends without storing duplicate workflows.';

-- Error patterns (keeps error intelligence, deletes raw error events)
CREATE TABLE IF NOT EXISTS telemetry_error_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregation_date DATE NOT NULL,
    error_type TEXT NOT NULL,
    error_context TEXT, -- e.g., 'validation', 'workflow_execution', 'node_operation'
    occurrence_count INTEGER NOT NULL DEFAULT 1,
    affected_users INTEGER NOT NULL DEFAULT 0,
    first_seen TIMESTAMPTZ,
    last_seen TIMESTAMPTZ,
    sample_error_message TEXT, -- Keep one representative message
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(aggregation_date, error_type, error_context)
);

CREATE INDEX idx_error_patterns_date ON telemetry_error_patterns(aggregation_date DESC);
CREATE INDEX idx_error_patterns_type ON telemetry_error_patterns(error_type);

COMMENT ON TABLE telemetry_error_patterns IS 'Error patterns over time. Preserves debugging insights while pruning raw error events.';

-- Validation insights (aggregates validation_details)
CREATE TABLE IF NOT EXISTS telemetry_validation_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregation_date DATE NOT NULL,
    validation_type TEXT, -- 'node', 'workflow', 'expression'
    profile TEXT, -- 'minimal', 'runtime', 'ai-friendly', 'strict'
    success_count INTEGER NOT NULL DEFAULT 0,
    failure_count INTEGER NOT NULL DEFAULT 0,
    common_failure_reasons JSONB, -- {"reason": count}
    avg_validation_time_ms NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(aggregation_date, validation_type, profile)
);

CREATE INDEX idx_validation_insights_date ON telemetry_validation_insights(aggregation_date DESC);
CREATE INDEX idx_validation_insights_type ON telemetry_validation_insights(validation_type);

COMMENT ON TABLE telemetry_validation_insights IS 'Validation success/failure patterns. Shows where users struggle without storing every validation event.';

-- ============================================================================
-- PART 2: AGGREGATION FUNCTIONS
-- ============================================================================

-- Function to aggregate tool usage data
CREATE OR REPLACE FUNCTION aggregate_tool_usage(cutoff_date TIMESTAMPTZ)
RETURNS INTEGER AS $$
DECLARE
    rows_aggregated INTEGER;
BEGIN
    -- Aggregate tool_used events
    INSERT INTO telemetry_tool_usage_daily (
        aggregation_date,
        user_id,
        tool_name,
        usage_count,
        success_count,
        error_count,
        avg_execution_time_ms,
        total_execution_time_ms
    )
    SELECT
        DATE(created_at) as aggregation_date,
        user_id,
        properties->>'toolName' as tool_name,
        COUNT(*) as usage_count,
        COUNT(*) FILTER (WHERE (properties->>'success')::boolean = true) as success_count,
        COUNT(*) FILTER (WHERE (properties->>'success')::boolean = false OR properties->>'error' IS NOT NULL) as error_count,
        AVG((properties->>'executionTime')::numeric) as avg_execution_time_ms,
        SUM((properties->>'executionTime')::numeric) as total_execution_time_ms
    FROM telemetry_events
    WHERE event = 'tool_used'
        AND created_at < cutoff_date
        AND properties->>'toolName' IS NOT NULL
    GROUP BY DATE(created_at), user_id, properties->>'toolName'
    ON CONFLICT (aggregation_date, user_id, tool_name)
    DO UPDATE SET
        usage_count = telemetry_tool_usage_daily.usage_count + EXCLUDED.usage_count,
        success_count = telemetry_tool_usage_daily.success_count + EXCLUDED.success_count,
        error_count = telemetry_tool_usage_daily.error_count + EXCLUDED.error_count,
        total_execution_time_ms = telemetry_tool_usage_daily.total_execution_time_ms + EXCLUDED.total_execution_time_ms,
        avg_execution_time_ms = (telemetry_tool_usage_daily.total_execution_time_ms + EXCLUDED.total_execution_time_ms) /
                                (telemetry_tool_usage_daily.usage_count + EXCLUDED.usage_count),
        updated_at = NOW();

    GET DIAGNOSTICS rows_aggregated = ROW_COUNT;

    RAISE NOTICE 'Aggregated % rows from tool_used events', rows_aggregated;
    RETURN rows_aggregated;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION aggregate_tool_usage IS 'Aggregates tool_used events into daily summaries before deletion';

-- Function to aggregate tool sequence patterns
CREATE OR REPLACE FUNCTION aggregate_tool_patterns(cutoff_date TIMESTAMPTZ)
RETURNS INTEGER AS $$
DECLARE
    rows_aggregated INTEGER;
BEGIN
    INSERT INTO telemetry_tool_patterns (
        aggregation_date,
        tool_sequence,
        sequence_hash,
        occurrence_count,
        avg_sequence_duration_ms,
        success_rate
    )
    SELECT
        DATE(created_at) as aggregation_date,
        (properties->>'toolSequence')::text[] as tool_sequence,
        md5(array_to_string((properties->>'toolSequence')::text[], ',')) as sequence_hash,
        COUNT(*) as occurrence_count,
        AVG((properties->>'duration')::numeric) as avg_sequence_duration_ms,
        AVG(CASE WHEN (properties->>'success')::boolean THEN 1.0 ELSE 0.0 END) as success_rate
    FROM telemetry_events
    WHERE event = 'tool_sequence'
        AND created_at < cutoff_date
        AND properties->>'toolSequence' IS NOT NULL
    GROUP BY DATE(created_at), (properties->>'toolSequence')::text[]
    ON CONFLICT (aggregation_date, sequence_hash)
    DO UPDATE SET
        occurrence_count = telemetry_tool_patterns.occurrence_count + EXCLUDED.occurrence_count,
        avg_sequence_duration_ms = (
            (telemetry_tool_patterns.avg_sequence_duration_ms * telemetry_tool_patterns.occurrence_count +
             EXCLUDED.avg_sequence_duration_ms * EXCLUDED.occurrence_count) /
            (telemetry_tool_patterns.occurrence_count + EXCLUDED.occurrence_count)
        ),
        success_rate = (
            (telemetry_tool_patterns.success_rate * telemetry_tool_patterns.occurrence_count +
             EXCLUDED.success_rate * EXCLUDED.occurrence_count) /
            (telemetry_tool_patterns.occurrence_count + EXCLUDED.occurrence_count)
        ),
        updated_at = NOW();

    GET DIAGNOSTICS rows_aggregated = ROW_COUNT;

    RAISE NOTICE 'Aggregated % rows from tool_sequence events', rows_aggregated;
    RETURN rows_aggregated;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION aggregate_tool_patterns IS 'Aggregates tool_sequence events into pattern analysis before deletion';

-- Function to aggregate workflow insights
CREATE OR REPLACE FUNCTION aggregate_workflow_insights(cutoff_date TIMESTAMPTZ)
RETURNS INTEGER AS $$
DECLARE
    rows_aggregated INTEGER;
BEGIN
    INSERT INTO telemetry_workflow_insights (
        aggregation_date,
        complexity,
        node_count_range,
        has_trigger,
        has_webhook,
        common_node_types,
        workflow_count,
        avg_node_count
    )
    SELECT
        DATE(created_at) as aggregation_date,
        properties->>'complexity' as complexity,
        CASE
            WHEN (properties->>'nodeCount')::int BETWEEN 1 AND 5 THEN '1-5'
            WHEN (properties->>'nodeCount')::int BETWEEN 6 AND 10 THEN '6-10'
            WHEN (properties->>'nodeCount')::int BETWEEN 11 AND 20 THEN '11-20'
            ELSE '21+'
        END as node_count_range,
        (properties->>'hasTrigger')::boolean as has_trigger,
        (properties->>'hasWebhook')::boolean as has_webhook,
        ARRAY[]::text[] as common_node_types, -- Will be populated separately if needed
        COUNT(*) as workflow_count,
        AVG((properties->>'nodeCount')::numeric) as avg_node_count
    FROM telemetry_events
    WHERE event = 'workflow_created'
        AND created_at < cutoff_date
    GROUP BY
        DATE(created_at),
        properties->>'complexity',
        node_count_range,
        (properties->>'hasTrigger')::boolean,
        (properties->>'hasWebhook')::boolean
    ON CONFLICT (aggregation_date, complexity, node_count_range, has_trigger, has_webhook)
    DO UPDATE SET
        workflow_count = telemetry_workflow_insights.workflow_count + EXCLUDED.workflow_count,
        avg_node_count = (
            (telemetry_workflow_insights.avg_node_count * telemetry_workflow_insights.workflow_count +
             EXCLUDED.avg_node_count * EXCLUDED.workflow_count) /
            (telemetry_workflow_insights.workflow_count + EXCLUDED.workflow_count)
        ),
        updated_at = NOW();

    GET DIAGNOSTICS rows_aggregated = ROW_COUNT;

    RAISE NOTICE 'Aggregated % rows from workflow_created events', rows_aggregated;
    RETURN rows_aggregated;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION aggregate_workflow_insights IS 'Aggregates workflow_created events into pattern insights before deletion';

-- Function to aggregate error patterns
CREATE OR REPLACE FUNCTION aggregate_error_patterns(cutoff_date TIMESTAMPTZ)
RETURNS INTEGER AS $$
DECLARE
    rows_aggregated INTEGER;
BEGIN
    INSERT INTO telemetry_error_patterns (
        aggregation_date,
        error_type,
        error_context,
        occurrence_count,
        affected_users,
        first_seen,
        last_seen,
        sample_error_message
    )
    SELECT
        DATE(created_at) as aggregation_date,
        properties->>'errorType' as error_type,
        properties->>'context' as error_context,
        COUNT(*) as occurrence_count,
        COUNT(DISTINCT user_id) as affected_users,
        MIN(created_at) as first_seen,
        MAX(created_at) as last_seen,
        (ARRAY_AGG(properties->>'message' ORDER BY created_at DESC))[1] as sample_error_message
    FROM telemetry_events
    WHERE event = 'error_occurred'
        AND created_at < cutoff_date
    GROUP BY DATE(created_at), properties->>'errorType', properties->>'context'
    ON CONFLICT (aggregation_date, error_type, error_context)
    DO UPDATE SET
        occurrence_count = telemetry_error_patterns.occurrence_count + EXCLUDED.occurrence_count,
        affected_users = GREATEST(telemetry_error_patterns.affected_users, EXCLUDED.affected_users),
        first_seen = LEAST(telemetry_error_patterns.first_seen, EXCLUDED.first_seen),
        last_seen = GREATEST(telemetry_error_patterns.last_seen, EXCLUDED.last_seen),
        updated_at = NOW();

    GET DIAGNOSTICS rows_aggregated = ROW_COUNT;

    RAISE NOTICE 'Aggregated % rows from error_occurred events', rows_aggregated;
    RETURN rows_aggregated;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION aggregate_error_patterns IS 'Aggregates error_occurred events into pattern analysis before deletion';

-- Function to aggregate validation insights
CREATE OR REPLACE FUNCTION aggregate_validation_insights(cutoff_date TIMESTAMPTZ)
RETURNS INTEGER AS $$
DECLARE
    rows_aggregated INTEGER;
BEGIN
    INSERT INTO telemetry_validation_insights (
        aggregation_date,
        validation_type,
        profile,
        success_count,
        failure_count,
        common_failure_reasons,
        avg_validation_time_ms
    )
    SELECT
        DATE(created_at) as aggregation_date,
        properties->>'validationType' as validation_type,
        properties->>'profile' as profile,
        COUNT(*) FILTER (WHERE (properties->>'success')::boolean = true) as success_count,
        COUNT(*) FILTER (WHERE (properties->>'success')::boolean = false) as failure_count,
        jsonb_object_agg(
            COALESCE(properties->>'failureReason', 'unknown'),
            COUNT(*)
        ) FILTER (WHERE (properties->>'success')::boolean = false) as common_failure_reasons,
        AVG((properties->>'validationTime')::numeric) as avg_validation_time_ms
    FROM telemetry_events
    WHERE event = 'validation_details'
        AND created_at < cutoff_date
    GROUP BY DATE(created_at), properties->>'validationType', properties->>'profile'
    ON CONFLICT (aggregation_date, validation_type, profile)
    DO UPDATE SET
        success_count = telemetry_validation_insights.success_count + EXCLUDED.success_count,
        failure_count = telemetry_validation_insights.failure_count + EXCLUDED.failure_count,
        updated_at = NOW();

    GET DIAGNOSTICS rows_aggregated = ROW_COUNT;

    RAISE NOTICE 'Aggregated % rows from validation_details events', rows_aggregated;
    RETURN rows_aggregated;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION aggregate_validation_insights IS 'Aggregates validation_details events into insights before deletion';

-- ============================================================================
-- PART 3: MASTER AGGREGATION & CLEANUP FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION run_telemetry_aggregation_and_cleanup(
    retention_days INTEGER DEFAULT 3
)
RETURNS TABLE(
    event_type TEXT,
    rows_aggregated INTEGER,
    rows_deleted INTEGER,
    space_freed_mb NUMERIC
) AS $$
DECLARE
    cutoff_date TIMESTAMPTZ;
    total_before BIGINT;
    total_after BIGINT;
    agg_count INTEGER;
    del_count INTEGER;
BEGIN
    cutoff_date := NOW() - (retention_days || ' days')::INTERVAL;

    RAISE NOTICE 'Starting aggregation and cleanup for data older than %', cutoff_date;

    -- Get table size before cleanup
    SELECT pg_total_relation_size('telemetry_events') INTO total_before;

    -- ========================================================================
    -- STEP 1: AGGREGATE DATA BEFORE DELETION
    -- ========================================================================

    -- Tool usage aggregation
    SELECT aggregate_tool_usage(cutoff_date) INTO agg_count;
    SELECT COUNT(*) INTO del_count FROM telemetry_events
    WHERE event = 'tool_used' AND created_at < cutoff_date;

    event_type := 'tool_used';
    rows_aggregated := agg_count;
    rows_deleted := del_count;
    RETURN NEXT;

    -- Tool patterns aggregation
    SELECT aggregate_tool_patterns(cutoff_date) INTO agg_count;
    SELECT COUNT(*) INTO del_count FROM telemetry_events
    WHERE event = 'tool_sequence' AND created_at < cutoff_date;

    event_type := 'tool_sequence';
    rows_aggregated := agg_count;
    rows_deleted := del_count;
    RETURN NEXT;

    -- Workflow insights aggregation
    SELECT aggregate_workflow_insights(cutoff_date) INTO agg_count;
    SELECT COUNT(*) INTO del_count FROM telemetry_events
    WHERE event = 'workflow_created' AND created_at < cutoff_date;

    event_type := 'workflow_created';
    rows_aggregated := agg_count;
    rows_deleted := del_count;
    RETURN NEXT;

    -- Error patterns aggregation
    SELECT aggregate_error_patterns(cutoff_date) INTO agg_count;
    SELECT COUNT(*) INTO del_count FROM telemetry_events
    WHERE event = 'error_occurred' AND created_at < cutoff_date;

    event_type := 'error_occurred';
    rows_aggregated := agg_count;
    rows_deleted := del_count;
    RETURN NEXT;

    -- Validation insights aggregation
    SELECT aggregate_validation_insights(cutoff_date) INTO agg_count;
    SELECT COUNT(*) INTO del_count FROM telemetry_events
    WHERE event = 'validation_details' AND created_at < cutoff_date;

    event_type := 'validation_details';
    rows_aggregated := agg_count;
    rows_deleted := del_count;
    RETURN NEXT;

    -- ========================================================================
    -- STEP 2: DELETE OLD RAW EVENTS (now that they're aggregated)
    -- ========================================================================

    DELETE FROM telemetry_events
    WHERE created_at < cutoff_date
    AND event IN (
        'tool_used',
        'tool_sequence',
        'workflow_created',
        'validation_details',
        'session_start',
        'search_query',
        'diagnostic_completed',
        'health_check_completed'
    );

    -- Keep error_occurred for 30 days (extended retention for debugging)
    DELETE FROM telemetry_events
    WHERE created_at < (NOW() - INTERVAL '30 days')
    AND event = 'error_occurred';

    -- ========================================================================
    -- STEP 3: CLEAN UP OLD WORKFLOWS (keep only unique patterns)
    -- ========================================================================

    -- Delete duplicate workflows older than retention period
    WITH workflow_duplicates AS (
        SELECT id
        FROM (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY workflow_hash
                       ORDER BY created_at DESC
                   ) as rn
            FROM telemetry_workflows
            WHERE created_at < cutoff_date
        ) sub
        WHERE rn > 1
    )
    DELETE FROM telemetry_workflows
    WHERE id IN (SELECT id FROM workflow_duplicates);

    GET DIAGNOSTICS del_count = ROW_COUNT;

    event_type := 'duplicate_workflows';
    rows_aggregated := 0;
    rows_deleted := del_count;
    RETURN NEXT;

    -- ========================================================================
    -- STEP 4: VACUUM TO RECLAIM SPACE
    -- ========================================================================

    -- Note: VACUUM cannot be run inside a function, must be run separately
    -- The cron job will handle this

    -- Get table size after cleanup
    SELECT pg_total_relation_size('telemetry_events') INTO total_after;

    -- Summary row
    event_type := 'TOTAL_SPACE_FREED';
    rows_aggregated := 0;
    rows_deleted := 0;
    space_freed_mb := ROUND((total_before - total_after)::NUMERIC / 1024 / 1024, 2);
    RETURN NEXT;

    RAISE NOTICE 'Cleanup complete. Space freed: % MB', space_freed_mb;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION run_telemetry_aggregation_and_cleanup IS 'Master function to aggregate data and delete old events. Run daily via cron.';

-- ============================================================================
-- PART 4: SUPABASE CRON JOB SETUP
-- ============================================================================

-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily cleanup at 2 AM UTC (low traffic time)
-- This will aggregate data older than 3 days and then delete it
SELECT cron.schedule(
    'telemetry-daily-cleanup',
    '0 2 * * *', -- Every day at 2 AM UTC
    $$
    SELECT run_telemetry_aggregation_and_cleanup(3);
    VACUUM ANALYZE telemetry_events;
    VACUUM ANALYZE telemetry_workflows;
    $$
);

COMMENT ON EXTENSION pg_cron IS 'Cron job scheduler for automated telemetry cleanup';

-- ============================================================================
-- PART 5: MONITORING & ALERTING
-- ============================================================================

-- Function to check database size and alert if approaching limit
CREATE OR REPLACE FUNCTION check_database_size()
RETURNS TABLE(
    total_size_mb NUMERIC,
    events_size_mb NUMERIC,
    workflows_size_mb NUMERIC,
    aggregates_size_mb NUMERIC,
    percent_of_limit NUMERIC,
    days_until_full NUMERIC,
    status TEXT
) AS $$
DECLARE
    db_size BIGINT;
    events_size BIGINT;
    workflows_size BIGINT;
    agg_size BIGINT;
    limit_mb CONSTANT NUMERIC := 500; -- Free tier limit
    growth_rate_mb_per_day NUMERIC;
BEGIN
    -- Get current sizes
    SELECT pg_database_size(current_database()) INTO db_size;
    SELECT pg_total_relation_size('telemetry_events') INTO events_size;
    SELECT pg_total_relation_size('telemetry_workflows') INTO workflows_size;

    SELECT COALESCE(
        pg_total_relation_size('telemetry_tool_usage_daily') +
        pg_total_relation_size('telemetry_tool_patterns') +
        pg_total_relation_size('telemetry_workflow_insights') +
        pg_total_relation_size('telemetry_error_patterns') +
        pg_total_relation_size('telemetry_validation_insights'),
        0
    ) INTO agg_size;

    total_size_mb := ROUND(db_size::NUMERIC / 1024 / 1024, 2);
    events_size_mb := ROUND(events_size::NUMERIC / 1024 / 1024, 2);
    workflows_size_mb := ROUND(workflows_size::NUMERIC / 1024 / 1024, 2);
    aggregates_size_mb := ROUND(agg_size::NUMERIC / 1024 / 1024, 2);
    percent_of_limit := ROUND((total_size_mb / limit_mb) * 100, 1);

    -- Estimate growth rate (simple 7-day average)
    SELECT ROUND(
        (SELECT COUNT(*) FROM telemetry_events WHERE created_at > NOW() - INTERVAL '7 days')::NUMERIC
        * (pg_column_size(telemetry_events.*))::NUMERIC
        / 7 / 1024 / 1024, 2
    ) INTO growth_rate_mb_per_day
    FROM telemetry_events LIMIT 1;

    IF growth_rate_mb_per_day > 0 THEN
        days_until_full := ROUND((limit_mb - total_size_mb) / growth_rate_mb_per_day, 0);
    ELSE
        days_until_full := NULL;
    END IF;

    -- Determine status
    IF percent_of_limit >= 90 THEN
        status := 'CRITICAL - Immediate action required';
    ELSIF percent_of_limit >= 75 THEN
        status := 'WARNING - Monitor closely';
    ELSIF percent_of_limit >= 50 THEN
        status := 'CAUTION - Plan optimization';
    ELSE
        status := 'HEALTHY';
    END IF;

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_database_size IS 'Monitor database size and growth. Run daily or on-demand.';

-- ============================================================================
-- PART 6: EMERGENCY CLEANUP (ONE-TIME USE)
-- ============================================================================

-- Emergency function to immediately free up space (use if critical)
CREATE OR REPLACE FUNCTION emergency_cleanup()
RETURNS TABLE(
    action TEXT,
    rows_deleted INTEGER,
    space_freed_mb NUMERIC
) AS $$
DECLARE
    size_before BIGINT;
    size_after BIGINT;
    del_count INTEGER;
BEGIN
    SELECT pg_total_relation_size('telemetry_events') INTO size_before;

    -- Aggregate everything older than 7 days
    PERFORM run_telemetry_aggregation_and_cleanup(7);

    -- Delete all non-critical events older than 7 days
    DELETE FROM telemetry_events
    WHERE created_at < NOW() - INTERVAL '7 days'
    AND event NOT IN ('error_occurred', 'workflow_validation_failed');

    GET DIAGNOSTICS del_count = ROW_COUNT;

    action := 'Deleted non-critical events > 7 days';
    rows_deleted := del_count;
    RETURN NEXT;

    -- Delete error events older than 14 days
    DELETE FROM telemetry_events
    WHERE created_at < NOW() - INTERVAL '14 days'
    AND event = 'error_occurred';

    GET DIAGNOSTICS del_count = ROW_COUNT;

    action := 'Deleted error events > 14 days';
    rows_deleted := del_count;
    RETURN NEXT;

    -- Delete duplicate workflows
    WITH workflow_duplicates AS (
        SELECT id
        FROM (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY workflow_hash
                       ORDER BY created_at DESC
                   ) as rn
            FROM telemetry_workflows
        ) sub
        WHERE rn > 1
    )
    DELETE FROM telemetry_workflows
    WHERE id IN (SELECT id FROM workflow_duplicates);

    GET DIAGNOSTICS del_count = ROW_COUNT;

    action := 'Deleted duplicate workflows';
    rows_deleted := del_count;
    RETURN NEXT;

    -- VACUUM will be run separately
    SELECT pg_total_relation_size('telemetry_events') INTO size_after;

    action := 'TOTAL (run VACUUM separately)';
    rows_deleted := 0;
    space_freed_mb := ROUND((size_before - size_after)::NUMERIC / 1024 / 1024, 2);
    RETURN NEXT;

    RAISE NOTICE 'Emergency cleanup complete. Run VACUUM FULL for maximum space recovery.';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION emergency_cleanup IS 'Emergency cleanup when database is near capacity. Run once, then VACUUM.';

-- ============================================================================
-- USAGE INSTRUCTIONS
-- ============================================================================

/*

SETUP (Run once):
    1. Execute this entire script in Supabase SQL Editor
    2. Verify cron job is scheduled:
       SELECT * FROM cron.job;
    3. Run initial monitoring:
       SELECT * FROM check_database_size();

DAILY OPERATIONS (Automatic):
    - Cron job runs daily at 2 AM UTC
    - Aggregates data older than 3 days
    - Deletes raw events after aggregation
    - Vacuums tables to reclaim space

MONITORING:
    -- Check current database health
    SELECT * FROM check_database_size();

    -- View aggregated insights
    SELECT * FROM telemetry_tool_usage_daily ORDER BY aggregation_date DESC LIMIT 100;
    SELECT * FROM telemetry_tool_patterns ORDER BY occurrence_count DESC LIMIT 20;
    SELECT * FROM telemetry_error_patterns ORDER BY occurrence_count DESC LIMIT 20;

MANUAL CLEANUP (if needed):
    -- Run cleanup manually (3-day retention)
    SELECT * FROM run_telemetry_aggregation_and_cleanup(3);
    VACUUM ANALYZE telemetry_events;

    -- Emergency cleanup (7-day retention)
    SELECT * FROM emergency_cleanup();
    VACUUM FULL telemetry_events;
    VACUUM FULL telemetry_workflows;

TUNING:
    -- Adjust retention period (e.g., 5 days instead of 3)
    SELECT cron.schedule(
        'telemetry-daily-cleanup',
        '0 2 * * *',
        $$ SELECT run_telemetry_aggregation_and_cleanup(5); VACUUM ANALYZE telemetry_events; $$
    );

EXPECTED RESULTS:
    - Initial run: ~120 MB space freed (265 MB → ~145 MB)
    - Steady state: ~90-120 MB total database size
    - Growth rate: ~2-3 MB/day (down from 7.7 MB/day)
    - Headroom: 70-80% of free tier limit available

*/
