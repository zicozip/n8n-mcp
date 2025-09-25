/**
 * Telemetry Manager
 * Main telemetry class for anonymous usage statistics
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { TelemetryConfigManager } from './config-manager';
import { WorkflowSanitizer } from './workflow-sanitizer';
import { logger } from '../utils/logger';
import { resolve } from 'path';
import { existsSync, readFileSync } from 'fs';

interface TelemetryEvent {
  user_id: string;
  event: string;
  properties: Record<string, any>;
  created_at?: string;
}

interface WorkflowTelemetry {
  user_id: string;
  workflow_hash: string;
  node_count: number;
  node_types: string[];
  has_trigger: boolean;
  has_webhook: boolean;
  complexity: 'simple' | 'medium' | 'complex';
  sanitized_workflow: any;
  created_at?: string;
}

// Configuration constants
const TELEMETRY_CONFIG = {
  BATCH_FLUSH_INTERVAL: 5000, // 5 seconds - reduced for multi-process
  EVENT_QUEUE_THRESHOLD: 1, // Immediate flush for multi-process compatibility
  WORKFLOW_QUEUE_THRESHOLD: 1, // Immediate flush for multi-process compatibility
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 1 second
  OPERATION_TIMEOUT: 5000, // 5 seconds
} as const;

// Hardcoded telemetry backend configuration
// IMPORTANT: This is intentionally hardcoded for zero-configuration telemetry
// The anon key is PUBLIC and SAFE to expose because:
// 1. It only allows INSERT operations (write-only)
// 2. Row Level Security (RLS) policies prevent reading/updating/deleting data
// 3. This is standard practice for anonymous telemetry collection
// 4. No sensitive user data is ever sent
const TELEMETRY_BACKEND = {
  URL: 'https://ydyufsohxdfpopqbubwk.supabase.co',
  ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlkeXVmc29oeGRmcG9wcWJ1YndrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3OTYyMDAsImV4cCI6MjA3NDM3MjIwMH0.xESphg6h5ozaDsm4Vla3QnDJGc6Nc_cpfoqTHRynkCk'
} as const;

export class TelemetryManager {
  private static instance: TelemetryManager;
  private supabase: SupabaseClient | null = null;
  private configManager: TelemetryConfigManager;
  private eventQueue: TelemetryEvent[] = [];
  private workflowQueue: WorkflowTelemetry[] = [];
  private flushTimer?: NodeJS.Timeout;
  private isInitialized: boolean = false;
  private isFlushingWorkflows: boolean = false;

  private constructor() {
    this.configManager = TelemetryConfigManager.getInstance();
    this.initialize();
  }

  static getInstance(): TelemetryManager {
    if (!TelemetryManager.instance) {
      TelemetryManager.instance = new TelemetryManager();
    }
    return TelemetryManager.instance;
  }

  /**
   * Initialize telemetry if enabled
   */
  private initialize(): void {
    if (!this.configManager.isEnabled()) {
      logger.debug('Telemetry disabled by user preference');
      return;
    }

    // Use hardcoded credentials for zero-configuration telemetry
    // Environment variables can override for development/testing
    const supabaseUrl = process.env.SUPABASE_URL || TELEMETRY_BACKEND.URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || TELEMETRY_BACKEND.ANON_KEY;

    try {
      this.supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        realtime: {
          params: {
            eventsPerSecond: 1,
          },
        },
      });

      this.isInitialized = true;
      this.startBatchProcessor();

      // Flush on exit
      process.on('beforeExit', () => this.flush());
      process.on('SIGINT', () => {
        this.flush();
        process.exit(0);
      });
      process.on('SIGTERM', () => {
        this.flush();
        process.exit(0);
      });

      logger.debug('Telemetry initialized successfully');
    } catch (error) {
      logger.debug('Failed to initialize telemetry:', error);
      this.isInitialized = false;
    }
  }

  /**
   * Track a tool usage event
   */
  trackToolUsage(toolName: string, success: boolean, duration?: number): void {
    if (!this.isEnabled()) return;

    // Sanitize tool name (remove any potential sensitive data)
    const sanitizedToolName = toolName.replace(/[^a-zA-Z0-9_-]/g, '_');

    this.trackEvent('tool_used', {
      tool: sanitizedToolName,
      success,
      duration: duration || 0,
    });
  }

  /**
   * Track workflow creation (fire-and-forget)
   */
  trackWorkflowCreation(workflow: any, validationPassed: boolean): void {
    if (!this.isEnabled()) return;

    // Only store workflows that pass validation
    if (!validationPassed) {
      this.trackEvent('workflow_validation_failed', {
        nodeCount: workflow.nodes?.length || 0,
      });
      return;
    }

    // Process asynchronously without blocking
    setImmediate(async () => {
      try {
        const sanitized = WorkflowSanitizer.sanitizeWorkflow(workflow);

        const telemetryData: WorkflowTelemetry = {
          user_id: this.configManager.getUserId(),
          workflow_hash: sanitized.workflowHash,
          node_count: sanitized.nodeCount,
          node_types: sanitized.nodeTypes,
          has_trigger: sanitized.hasTrigger,
          has_webhook: sanitized.hasWebhook,
          complexity: sanitized.complexity,
          sanitized_workflow: {
            nodes: sanitized.nodes,
            connections: sanitized.connections,
          },
        };

        // Add to queue synchronously to avoid race conditions
        const queueLength = this.addToWorkflowQueue(telemetryData);

        // Also track as event
        this.trackEvent('workflow_created', {
          nodeCount: sanitized.nodeCount,
          nodeTypes: sanitized.nodeTypes.length,
          complexity: sanitized.complexity,
          hasTrigger: sanitized.hasTrigger,
          hasWebhook: sanitized.hasWebhook,
        });

        // Flush if queue reached threshold
        if (queueLength >= TELEMETRY_CONFIG.WORKFLOW_QUEUE_THRESHOLD) {
          await this.flush();
        }
      } catch (error) {
        logger.debug('Failed to track workflow creation:', error);
      }
    });
  }

  /**
   * Thread-safe method to add workflow to queue
   * Returns the new queue length after adding
   */
  private addToWorkflowQueue(telemetryData: WorkflowTelemetry): number {
    // Don't add to queue if we're currently flushing workflows
    // This prevents race conditions where items are added during flush
    if (this.isFlushingWorkflows) {
      // Queue the flush for later to ensure we don't lose data
      setImmediate(() => {
        this.workflowQueue.push(telemetryData);
        if (this.workflowQueue.length >= TELEMETRY_CONFIG.WORKFLOW_QUEUE_THRESHOLD) {
          this.flush();
        }
      });
      return 0; // Don't trigger immediate flush
    }

    this.workflowQueue.push(telemetryData);
    return this.workflowQueue.length;
  }

  /**
   * Track an error event
   */
  trackError(errorType: string, context: string, toolName?: string): void {
    if (!this.isEnabled()) return;

    this.trackEvent('error_occurred', {
      errorType: this.sanitizeErrorType(errorType),
      context: this.sanitizeContext(context),
      tool: toolName ? toolName.replace(/[^a-zA-Z0-9_-]/g, '_') : undefined,
    });
  }

  /**
   * Track a generic event
   */
  trackEvent(eventName: string, properties: Record<string, any>): void {
    if (!this.isEnabled()) return;

    const event: TelemetryEvent = {
      user_id: this.configManager.getUserId(),
      event: eventName,
      properties: this.sanitizeProperties(properties),
    };

    this.eventQueue.push(event);

    // Flush if queue is getting large
    if (this.eventQueue.length >= TELEMETRY_CONFIG.EVENT_QUEUE_THRESHOLD) {
      this.flush();
    }
  }

  /**
   * Track session start
   */
  trackSessionStart(): void {
    if (!this.isEnabled()) return;

    this.trackEvent('session_start', {
      version: this.getPackageVersion(),
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
    });
  }

  /**
   * Get package version safely
   */
  private getPackageVersion(): string {
    try {
      // Try multiple approaches to find package.json
      const possiblePaths = [
        resolve(__dirname, '..', '..', 'package.json'),
        resolve(process.cwd(), 'package.json'),
        resolve(__dirname, '..', '..', '..', 'package.json')
      ];

      for (const packagePath of possiblePaths) {
        if (existsSync(packagePath)) {
          const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
          if (packageJson.version) {
            return packageJson.version;
          }
        }
      }

      // Fallback: try require (works in some environments)
      try {
        const packageJson = require('../../package.json');
        return packageJson.version || 'unknown';
      } catch {
        // Ignore require error
      }

      return 'unknown';
    } catch (error) {
      logger.debug('Failed to get package version:', error);
      return 'unknown';
    }
  }

  /**
   * Execute Supabase operation with retry and timeout
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T | null> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= TELEMETRY_CONFIG.MAX_RETRIES; attempt++) {
      try {
        // Create a timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Operation timed out')), TELEMETRY_CONFIG.OPERATION_TIMEOUT);
        });

        // Race between operation and timeout
        const result = await Promise.race([operation(), timeoutPromise]) as T;
        return result;
      } catch (error) {
        lastError = error as Error;
        logger.debug(`${operationName} attempt ${attempt} failed:`, error);

        if (attempt < TELEMETRY_CONFIG.MAX_RETRIES) {
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, TELEMETRY_CONFIG.RETRY_DELAY * attempt));
        }
      }
    }

    logger.debug(`${operationName} failed after ${TELEMETRY_CONFIG.MAX_RETRIES} attempts:`, lastError);
    return null;
  }

  /**
   * Flush queued events to Supabase
   */
  async flush(): Promise<void> {
    if (!this.isEnabled() || !this.supabase) return;

    // Flush events
    if (this.eventQueue.length > 0) {
      const events = [...this.eventQueue];
      this.eventQueue = [];

      await this.executeWithRetry(async () => {
        const { error } = await this.supabase!
          .from('telemetry_events')
          .insert(events);  // No .select() - we don't need the response

        if (error) {
          throw error;
        }

        logger.debug(`Flushed ${events.length} telemetry events`);
        return true;
      }, 'Flush telemetry events');
    }

    // Flush workflows
    if (this.workflowQueue.length > 0) {
      this.isFlushingWorkflows = true;

      try {
        const workflows = [...this.workflowQueue];
        this.workflowQueue = [];

        const result = await this.executeWithRetry(async () => {
          // Deduplicate workflows by hash before inserting
          const uniqueWorkflows = workflows.reduce((acc, workflow) => {
            if (!acc.some(w => w.workflow_hash === workflow.workflow_hash)) {
              acc.push(workflow);
            }
            return acc;
          }, [] as WorkflowTelemetry[]);

          logger.debug(`Deduplicating workflows: ${workflows.length} -> ${uniqueWorkflows.length} unique`);

          // Use insert (same as events) - duplicates are handled by deduplication above
          const { error } = await this.supabase!
            .from('telemetry_workflows')
            .insert(uniqueWorkflows);  // No .select() - we don't need the response

          if (error) {
            logger.debug('Detailed workflow flush error:', {
              error: error,
              workflowCount: workflows.length,
              firstWorkflow: workflows[0] ? {
                user_id: workflows[0].user_id,
                workflow_hash: workflows[0].workflow_hash,
                node_count: workflows[0].node_count
              } : null
            });
            throw error;
          }

          logger.debug(`Flushed ${uniqueWorkflows.length} unique telemetry workflows (${workflows.length} total processed)`);
          return true;
        }, 'Flush telemetry workflows');

        if (!result) {
          logger.debug('Failed to flush workflows after retries');
        }
      } finally {
        this.isFlushingWorkflows = false;
      }
    }
  }

  /**
   * Start batch processor for periodic flushing
   */
  private startBatchProcessor(): void {
    // Flush periodically
    this.flushTimer = setInterval(() => {
      this.flush();
    }, TELEMETRY_CONFIG.BATCH_FLUSH_INTERVAL);

    // Prevent timer from keeping process alive
    this.flushTimer.unref();
  }

  /**
   * Check if telemetry is enabled
   */
  private isEnabled(): boolean {
    return this.isInitialized && this.configManager.isEnabled();
  }

  /**
   * Sanitize properties to remove sensitive data
   */
  private sanitizeProperties(properties: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(properties)) {
      // Skip sensitive keys
      if (this.isSensitiveKey(key)) {
        continue;
      }

      // Sanitize values
      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeString(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeProperties(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Check if a key is sensitive
   */
  private isSensitiveKey(key: string): boolean {
    const sensitiveKeys = [
      'password', 'token', 'key', 'secret', 'credential',
      'auth', 'url', 'endpoint', 'host', 'database',
    ];

    const lowerKey = key.toLowerCase();
    return sensitiveKeys.some(sensitive => lowerKey.includes(sensitive));
  }

  /**
   * Sanitize string values
   */
  private sanitizeString(value: string): string {
    // Remove URLs
    let sanitized = value.replace(/https?:\/\/[^\s]+/gi, '[URL]');

    // Remove potential API keys (long alphanumeric strings)
    sanitized = sanitized.replace(/[a-zA-Z0-9_-]{32,}/g, '[KEY]');

    // Remove email addresses
    sanitized = sanitized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');

    return sanitized;
  }

  /**
   * Sanitize error type
   */
  private sanitizeErrorType(errorType: string): string {
    // Remove any potential sensitive data from error type
    return errorType
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 50);
  }

  /**
   * Sanitize context
   */
  private sanitizeContext(context: string): string {
    // Remove any potential sensitive data from context
    return context
      .replace(/https?:\/\/[^\s]+/gi, '[URL]')
      .replace(/[a-zA-Z0-9_-]{32,}/g, '[KEY]')
      .substring(0, 100);
  }

  /**
   * Disable telemetry
   */
  disable(): void {
    this.configManager.disable();
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.isInitialized = false;
    this.supabase = null;
  }

  /**
   * Enable telemetry
   */
  enable(): void {
    this.configManager.enable();
    this.initialize();
  }

  /**
   * Get telemetry status
   */
  getStatus(): string {
    return this.configManager.getStatus();
  }
}

// Create a global singleton to ensure only one instance across all imports
const globalAny = global as any;

if (!globalAny.__telemetryManager) {
  globalAny.__telemetryManager = TelemetryManager.getInstance();
}

// Export singleton instance
export const telemetry = globalAny.__telemetryManager as TelemetryManager;