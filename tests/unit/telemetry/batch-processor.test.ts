import { describe, it, expect, beforeEach, vi, afterEach, beforeAll, afterAll, type MockInstance } from 'vitest';
import { TelemetryBatchProcessor } from '../../../src/telemetry/batch-processor';
import { TelemetryEvent, WorkflowTelemetry, TELEMETRY_CONFIG } from '../../../src/telemetry/telemetry-types';
import { TelemetryError, TelemetryErrorType } from '../../../src/telemetry/telemetry-error';
import type { SupabaseClient } from '@supabase/supabase-js';

// Mock logger to avoid console output in tests
vi.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}));

describe('TelemetryBatchProcessor', () => {
  let batchProcessor: TelemetryBatchProcessor;
  let mockSupabase: SupabaseClient;
  let mockIsEnabled: ReturnType<typeof vi.fn>;
  let mockProcessExit: MockInstance;

  const createMockSupabaseResponse = (error: any = null) => ({
    data: null,
    error,
    status: error ? 400 : 200,
    statusText: error ? 'Bad Request' : 'OK',
    count: null
  });

  beforeEach(() => {
    vi.useFakeTimers();
    mockIsEnabled = vi.fn().mockReturnValue(true);

    mockSupabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockResolvedValue(createMockSupabaseResponse())
      })
    } as any;

    // Mock process events to prevent actual exit
    mockProcessExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      // Do nothing - just prevent actual exit
    }) as any);

    vi.clearAllMocks();

    batchProcessor = new TelemetryBatchProcessor(mockSupabase, mockIsEnabled);
  });

  afterEach(() => {
    // Stop the batch processor to clear any intervals
    batchProcessor.stop();
    mockProcessExit.mockRestore();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('start()', () => {
    it('should start periodic flushing when enabled', () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval');

      batchProcessor.start();

      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        TELEMETRY_CONFIG.BATCH_FLUSH_INTERVAL
      );
    });

    it('should not start when disabled', () => {
      mockIsEnabled.mockReturnValue(false);
      const setIntervalSpy = vi.spyOn(global, 'setInterval');

      batchProcessor.start();

      expect(setIntervalSpy).not.toHaveBeenCalled();
    });

    it('should not start without Supabase client', () => {
      const processor = new TelemetryBatchProcessor(null, mockIsEnabled);
      const setIntervalSpy = vi.spyOn(global, 'setInterval');

      processor.start();

      expect(setIntervalSpy).not.toHaveBeenCalled();
      processor.stop();
    });

    it('should set up process exit handlers', () => {
      const onSpy = vi.spyOn(process, 'on');

      batchProcessor.start();

      expect(onSpy).toHaveBeenCalledWith('beforeExit', expect.any(Function));
      expect(onSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(onSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    });
  });

  describe('stop()', () => {
    it('should clear flush timer', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      batchProcessor.start();
      batchProcessor.stop();

      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });

  describe('flush()', () => {
    const mockEvents: TelemetryEvent[] = [
      {
        user_id: 'user1',
        event: 'tool_used',
        properties: { tool: 'httpRequest', success: true }
      },
      {
        user_id: 'user2',
        event: 'tool_used',
        properties: { tool: 'webhook', success: false }
      }
    ];

    const mockWorkflows: WorkflowTelemetry[] = [
      {
        user_id: 'user1',
        workflow_hash: 'hash1',
        node_count: 3,
        node_types: ['webhook', 'httpRequest', 'set'],
        has_trigger: true,
        has_webhook: true,
        complexity: 'medium',
        sanitized_workflow: { nodes: [], connections: {} }
      }
    ];

    it('should flush events successfully', async () => {
      await batchProcessor.flush(mockEvents);

      expect(mockSupabase.from).toHaveBeenCalledWith('telemetry_events');
      expect(mockSupabase.from('telemetry_events').insert).toHaveBeenCalledWith(mockEvents);

      const metrics = batchProcessor.getMetrics();
      expect(metrics.eventsTracked).toBe(2);
      expect(metrics.batchesSent).toBe(1);
    });

    it('should flush workflows successfully', async () => {
      await batchProcessor.flush(undefined, mockWorkflows);

      expect(mockSupabase.from).toHaveBeenCalledWith('telemetry_workflows');
      expect(mockSupabase.from('telemetry_workflows').insert).toHaveBeenCalledWith(mockWorkflows);

      const metrics = batchProcessor.getMetrics();
      expect(metrics.eventsTracked).toBe(1);
      expect(metrics.batchesSent).toBe(1);
    });

    it('should flush both events and workflows', async () => {
      await batchProcessor.flush(mockEvents, mockWorkflows);

      expect(mockSupabase.from).toHaveBeenCalledWith('telemetry_events');
      expect(mockSupabase.from).toHaveBeenCalledWith('telemetry_workflows');

      const metrics = batchProcessor.getMetrics();
      expect(metrics.eventsTracked).toBe(3); // 2 events + 1 workflow
      expect(metrics.batchesSent).toBe(2);
    });

    it('should not flush when disabled', async () => {
      mockIsEnabled.mockReturnValue(false);

      await batchProcessor.flush(mockEvents, mockWorkflows);

      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('should not flush without Supabase client', async () => {
      const processor = new TelemetryBatchProcessor(null, mockIsEnabled);

      await processor.flush(mockEvents);

      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('should skip flush when circuit breaker is open', async () => {
      // Open circuit breaker by failing multiple times
      const errorResponse = createMockSupabaseResponse(new Error('Network error'));
      vi.mocked(mockSupabase.from('telemetry_events').insert).mockResolvedValue(errorResponse);

      // Fail enough times to open circuit breaker (5 by default)
      for (let i = 0; i < 5; i++) {
        await batchProcessor.flush(mockEvents);
      }

      const metrics = batchProcessor.getMetrics();
      expect(metrics.circuitBreakerState.state).toBe('open');

      // Next flush should be skipped
      vi.clearAllMocks();
      await batchProcessor.flush(mockEvents);

      expect(mockSupabase.from).not.toHaveBeenCalled();
      expect(batchProcessor.getMetrics().eventsDropped).toBeGreaterThan(0);
    });

    it('should record flush time metrics', async () => {
      const startTime = Date.now();
      await batchProcessor.flush(mockEvents);

      const metrics = batchProcessor.getMetrics();
      expect(metrics.averageFlushTime).toBeGreaterThanOrEqual(0);
      expect(metrics.lastFlushTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('batch creation', () => {
    it('should create single batch for small datasets', async () => {
      const events: TelemetryEvent[] = Array.from({ length: 10 }, (_, i) => ({
        user_id: `user${i}`,
        event: 'test_event',
        properties: { index: i }
      }));

      await batchProcessor.flush(events);

      expect(mockSupabase.from('telemetry_events').insert).toHaveBeenCalledTimes(1);
      expect(mockSupabase.from('telemetry_events').insert).toHaveBeenCalledWith(events);
    });

    it('should create multiple batches for large datasets', async () => {
      const events: TelemetryEvent[] = Array.from({ length: 75 }, (_, i) => ({
        user_id: `user${i}`,
        event: 'test_event',
        properties: { index: i }
      }));

      await batchProcessor.flush(events);

      // Should create 2 batches (50 + 25) based on TELEMETRY_CONFIG.MAX_BATCH_SIZE
      expect(mockSupabase.from('telemetry_events').insert).toHaveBeenCalledTimes(2);

      const firstCall = vi.mocked(mockSupabase.from('telemetry_events').insert).mock.calls[0][0];
      const secondCall = vi.mocked(mockSupabase.from('telemetry_events').insert).mock.calls[1][0];

      expect(firstCall).toHaveLength(TELEMETRY_CONFIG.MAX_BATCH_SIZE);
      expect(secondCall).toHaveLength(25);
    });
  });

  describe('workflow deduplication', () => {
    it('should deduplicate workflows by hash', async () => {
      const workflows: WorkflowTelemetry[] = [
        {
          user_id: 'user1',
          workflow_hash: 'hash1',
          node_count: 2,
          node_types: ['webhook', 'set'],
          has_trigger: true,
          has_webhook: true,
          complexity: 'simple',
          sanitized_workflow: { nodes: [], connections: {} }
        },
        {
          user_id: 'user2',
          workflow_hash: 'hash1', // Same hash - should be deduplicated
          node_count: 2,
          node_types: ['webhook', 'set'],
          has_trigger: true,
          has_webhook: true,
          complexity: 'simple',
          sanitized_workflow: { nodes: [], connections: {} }
        },
        {
          user_id: 'user1',
          workflow_hash: 'hash2', // Different hash - should be kept
          node_count: 3,
          node_types: ['webhook', 'httpRequest', 'set'],
          has_trigger: true,
          has_webhook: true,
          complexity: 'medium',
          sanitized_workflow: { nodes: [], connections: {} }
        }
      ];

      await batchProcessor.flush(undefined, workflows);

      const insertCall = vi.mocked(mockSupabase.from('telemetry_workflows').insert).mock.calls[0][0];
      expect(insertCall).toHaveLength(2); // Should deduplicate to 2 workflows

      const hashes = insertCall.map((w: WorkflowTelemetry) => w.workflow_hash);
      expect(hashes).toEqual(['hash1', 'hash2']);
    });
  });

  describe('error handling and retries', () => {
    it('should retry on failure with exponential backoff', async () => {
      const error = new Error('Network timeout');
      const errorResponse = createMockSupabaseResponse(error);

      // Mock to fail first 2 times, then succeed
      vi.mocked(mockSupabase.from('telemetry_events').insert)
        .mockResolvedValueOnce(errorResponse)
        .mockResolvedValueOnce(errorResponse)
        .mockResolvedValueOnce(createMockSupabaseResponse());

      const events: TelemetryEvent[] = [{
        user_id: 'user1',
        event: 'test_event',
        properties: {}
      }];

      await batchProcessor.flush(events);

      // Should have been called 3 times (2 failures + 1 success)
      expect(mockSupabase.from('telemetry_events').insert).toHaveBeenCalledTimes(3);

      const metrics = batchProcessor.getMetrics();
      expect(metrics.eventsTracked).toBe(1); // Should succeed on third try
    });

    it('should fail after max retries', async () => {
      const error = new Error('Persistent network error');
      const errorResponse = createMockSupabaseResponse(error);

      vi.mocked(mockSupabase.from('telemetry_events').insert).mockResolvedValue(errorResponse);

      const events: TelemetryEvent[] = [{
        user_id: 'user1',
        event: 'test_event',
        properties: {}
      }];

      await batchProcessor.flush(events);

      // Should have been called MAX_RETRIES times
      expect(mockSupabase.from('telemetry_events').insert)
        .toHaveBeenCalledTimes(TELEMETRY_CONFIG.MAX_RETRIES);

      const metrics = batchProcessor.getMetrics();
      expect(metrics.eventsFailed).toBe(1);
      expect(metrics.batchesFailed).toBe(1);
      expect(metrics.deadLetterQueueSize).toBe(1);
    });

    it('should handle operation timeout', async () => {
      // Mock the operation to always fail with timeout error
      vi.mocked(mockSupabase.from('telemetry_events').insert).mockRejectedValue(
        new Error('Operation timed out')
      );

      const events: TelemetryEvent[] = [{
        user_id: 'user1',
        event: 'test_event',
        properties: {}
      }];

      // The flush should fail after retries
      await batchProcessor.flush(events);

      const metrics = batchProcessor.getMetrics();
      expect(metrics.eventsFailed).toBe(1);
    });
  });

  describe('dead letter queue', () => {
    it('should add failed events to dead letter queue', async () => {
      const error = new Error('Persistent error');
      const errorResponse = createMockSupabaseResponse(error);
      vi.mocked(mockSupabase.from('telemetry_events').insert).mockResolvedValue(errorResponse);

      const events: TelemetryEvent[] = [
        { user_id: 'user1', event: 'event1', properties: {} },
        { user_id: 'user2', event: 'event2', properties: {} }
      ];

      await batchProcessor.flush(events);

      const metrics = batchProcessor.getMetrics();
      expect(metrics.deadLetterQueueSize).toBe(2);
    });

    it('should process dead letter queue when circuit is healthy', async () => {
      const error = new Error('Temporary error');
      const errorResponse = createMockSupabaseResponse(error);

      // First 3 calls fail (for all retries), then succeed
      vi.mocked(mockSupabase.from('telemetry_events').insert)
        .mockResolvedValueOnce(errorResponse)  // Retry 1
        .mockResolvedValueOnce(errorResponse)  // Retry 2
        .mockResolvedValueOnce(errorResponse)  // Retry 3
        .mockResolvedValueOnce(createMockSupabaseResponse());  // Success on next flush

      const events: TelemetryEvent[] = [
        { user_id: 'user1', event: 'event1', properties: {} }
      ];

      // First flush - should fail after all retries and add to dead letter queue
      await batchProcessor.flush(events);
      expect(batchProcessor.getMetrics().deadLetterQueueSize).toBe(1);

      // Second flush - should process dead letter queue
      await batchProcessor.flush([]);
      expect(batchProcessor.getMetrics().deadLetterQueueSize).toBe(0);
    });

    it('should maintain dead letter queue size limit', async () => {
      const error = new Error('Persistent error');
      const errorResponse = createMockSupabaseResponse(error);
      // Always fail - each flush will retry 3 times then add to dead letter queue
      vi.mocked(mockSupabase.from('telemetry_events').insert).mockResolvedValue(errorResponse);

      // Circuit breaker opens after 5 failures, so only first 5 flushes will be processed
      // 5 batches of 5 items = 25 total items in dead letter queue
      for (let i = 0; i < 10; i++) {
        const events: TelemetryEvent[] = Array.from({ length: 5 }, (_, j) => ({
          user_id: `user${i}_${j}`,
          event: 'test_event',
          properties: { batch: i, index: j }
        }));

        await batchProcessor.flush(events);
      }

      const metrics = batchProcessor.getMetrics();
      // Circuit breaker opens after 5 failures, so only 25 items are added
      expect(metrics.deadLetterQueueSize).toBe(25); // 5 flushes * 5 items each
      expect(metrics.eventsDropped).toBe(25); // 5 additional flushes dropped due to circuit breaker
    });

    it('should handle mixed events and workflows in dead letter queue', async () => {
      const error = new Error('Mixed error');
      const errorResponse = createMockSupabaseResponse(error);
      vi.mocked(mockSupabase.from).mockImplementation((table) => ({
        insert: vi.fn().mockResolvedValue(errorResponse),
        url: { href: '' },
        headers: {},
        select: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      } as any));

      const events: TelemetryEvent[] = [
        { user_id: 'user1', event: 'event1', properties: {} }
      ];

      const workflows: WorkflowTelemetry[] = [
        {
          user_id: 'user1',
          workflow_hash: 'hash1',
          node_count: 1,
          node_types: ['webhook'],
          has_trigger: true,
          has_webhook: true,
          complexity: 'simple',
          sanitized_workflow: { nodes: [], connections: {} }
        }
      ];

      await batchProcessor.flush(events, workflows);

      expect(batchProcessor.getMetrics().deadLetterQueueSize).toBe(2);

      // Mock successful operations for dead letter queue processing
      vi.mocked(mockSupabase.from).mockImplementation((table) => ({
        insert: vi.fn().mockResolvedValue(createMockSupabaseResponse()),
        url: { href: '' },
        headers: {},
        select: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      } as any));

      await batchProcessor.flush([]);
      expect(batchProcessor.getMetrics().deadLetterQueueSize).toBe(0);
    });
  });

  describe('circuit breaker integration', () => {
    it('should update circuit breaker on success', async () => {
      const events: TelemetryEvent[] = [
        { user_id: 'user1', event: 'test_event', properties: {} }
      ];

      await batchProcessor.flush(events);

      const metrics = batchProcessor.getMetrics();
      expect(metrics.circuitBreakerState.state).toBe('closed');
      expect(metrics.circuitBreakerState.failureCount).toBe(0);
    });

    it('should update circuit breaker on failure', async () => {
      const error = new Error('Network error');
      const errorResponse = createMockSupabaseResponse(error);
      vi.mocked(mockSupabase.from('telemetry_events').insert).mockResolvedValue(errorResponse);

      const events: TelemetryEvent[] = [
        { user_id: 'user1', event: 'test_event', properties: {} }
      ];

      await batchProcessor.flush(events);

      const metrics = batchProcessor.getMetrics();
      expect(metrics.circuitBreakerState.failureCount).toBeGreaterThan(0);
    });
  });

  describe('metrics collection', () => {
    it('should collect comprehensive metrics', async () => {
      const events: TelemetryEvent[] = [
        { user_id: 'user1', event: 'event1', properties: {} },
        { user_id: 'user2', event: 'event2', properties: {} }
      ];

      await batchProcessor.flush(events);

      const metrics = batchProcessor.getMetrics();

      expect(metrics).toHaveProperty('eventsTracked');
      expect(metrics).toHaveProperty('eventsDropped');
      expect(metrics).toHaveProperty('eventsFailed');
      expect(metrics).toHaveProperty('batchesSent');
      expect(metrics).toHaveProperty('batchesFailed');
      expect(metrics).toHaveProperty('averageFlushTime');
      expect(metrics).toHaveProperty('lastFlushTime');
      expect(metrics).toHaveProperty('rateLimitHits');
      expect(metrics).toHaveProperty('circuitBreakerState');
      expect(metrics).toHaveProperty('deadLetterQueueSize');

      expect(metrics.eventsTracked).toBe(2);
      expect(metrics.batchesSent).toBe(1);
    });

    it('should track flush time statistics', async () => {
      const events: TelemetryEvent[] = [
        { user_id: 'user1', event: 'test_event', properties: {} }
      ];

      // Perform multiple flushes to test average calculation
      await batchProcessor.flush(events);
      await batchProcessor.flush(events);
      await batchProcessor.flush(events);

      const metrics = batchProcessor.getMetrics();
      expect(metrics.averageFlushTime).toBeGreaterThanOrEqual(0);
      expect(metrics.lastFlushTime).toBeGreaterThanOrEqual(0);
    });

    it('should maintain limited flush time history', async () => {
      const events: TelemetryEvent[] = [
        { user_id: 'user1', event: 'test_event', properties: {} }
      ];

      // Perform more than 100 flushes to test history limit
      for (let i = 0; i < 105; i++) {
        await batchProcessor.flush(events);
      }

      // Should still calculate average correctly (history is limited internally)
      const metrics = batchProcessor.getMetrics();
      expect(metrics.averageFlushTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('resetMetrics()', () => {
    it('should reset all metrics to initial state', async () => {
      const events: TelemetryEvent[] = [
        { user_id: 'user1', event: 'test_event', properties: {} }
      ];

      // Generate some metrics
      await batchProcessor.flush(events);

      // Verify metrics exist
      let metrics = batchProcessor.getMetrics();
      expect(metrics.eventsTracked).toBeGreaterThan(0);
      expect(metrics.batchesSent).toBeGreaterThan(0);

      // Reset metrics
      batchProcessor.resetMetrics();

      // Verify reset
      metrics = batchProcessor.getMetrics();
      expect(metrics.eventsTracked).toBe(0);
      expect(metrics.eventsDropped).toBe(0);
      expect(metrics.eventsFailed).toBe(0);
      expect(metrics.batchesSent).toBe(0);
      expect(metrics.batchesFailed).toBe(0);
      expect(metrics.averageFlushTime).toBe(0);
      expect(metrics.rateLimitHits).toBe(0);
      expect(metrics.circuitBreakerState.state).toBe('closed');
      expect(metrics.circuitBreakerState.failureCount).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty arrays gracefully', async () => {
      await batchProcessor.flush([], []);

      expect(mockSupabase.from).not.toHaveBeenCalled();

      const metrics = batchProcessor.getMetrics();
      expect(metrics.eventsTracked).toBe(0);
      expect(metrics.batchesSent).toBe(0);
    });

    it('should handle undefined inputs gracefully', async () => {
      await batchProcessor.flush();

      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('should handle null Supabase client gracefully', async () => {
      const processor = new TelemetryBatchProcessor(null, mockIsEnabled);
      const events: TelemetryEvent[] = [
        { user_id: 'user1', event: 'test_event', properties: {} }
      ];

      await expect(processor.flush(events)).resolves.not.toThrow();
    });

    it('should handle concurrent flush operations', async () => {
      const events: TelemetryEvent[] = [
        { user_id: 'user1', event: 'test_event', properties: {} }
      ];

      // Start multiple flush operations concurrently
      const flushPromises = [
        batchProcessor.flush(events),
        batchProcessor.flush(events),
        batchProcessor.flush(events)
      ];

      await Promise.all(flushPromises);

      // Should handle concurrent operations gracefully
      const metrics = batchProcessor.getMetrics();
      expect(metrics.eventsTracked).toBeGreaterThan(0);
    });
  });

  describe('process lifecycle integration', () => {
    it('should flush on process beforeExit', async () => {
      const flushSpy = vi.spyOn(batchProcessor, 'flush');

      batchProcessor.start();

      // Trigger beforeExit event
      process.emit('beforeExit', 0);

      expect(flushSpy).toHaveBeenCalled();
    });

    it('should flush and exit on SIGINT', async () => {
      const flushSpy = vi.spyOn(batchProcessor, 'flush');

      batchProcessor.start();

      // Trigger SIGINT event
      process.emit('SIGINT', 'SIGINT');

      expect(flushSpy).toHaveBeenCalled();
      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });

    it('should flush and exit on SIGTERM', async () => {
      const flushSpy = vi.spyOn(batchProcessor, 'flush');

      batchProcessor.start();

      // Trigger SIGTERM event
      process.emit('SIGTERM', 'SIGTERM');

      expect(flushSpy).toHaveBeenCalled();
      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });
  });
});