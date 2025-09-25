/**
 * Telemetry Manager
 * Main telemetry class for anonymous usage statistics
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { TelemetryConfigManager } from './config-manager';
import { WorkflowSanitizer } from './workflow-sanitizer';
import { logger } from '../utils/logger';

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

export class TelemetryManager {
  private static instance: TelemetryManager;
  private supabase: SupabaseClient | null = null;
  private configManager: TelemetryConfigManager;
  private eventQueue: TelemetryEvent[] = [];
  private workflowQueue: WorkflowTelemetry[] = [];
  private flushTimer?: NodeJS.Timeout;
  private isInitialized: boolean = false;

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

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      logger.debug('Telemetry not configured: missing SUPABASE_URL or SUPABASE_ANON_KEY');
      return;
    }

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
   * Track workflow creation
   */
  async trackWorkflowCreation(workflow: any, validationPassed: boolean): Promise<void> {
    if (!this.isEnabled()) return;

    // Only store workflows that pass validation
    if (!validationPassed) {
      this.trackEvent('workflow_validation_failed', {
        nodeCount: workflow.nodes?.length || 0,
      });
      return;
    }

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

      this.workflowQueue.push(telemetryData);

      // Also track as event
      this.trackEvent('workflow_created', {
        nodeCount: sanitized.nodeCount,
        nodeTypes: sanitized.nodeTypes.length,
        complexity: sanitized.complexity,
        hasTrigger: sanitized.hasTrigger,
        hasWebhook: sanitized.hasWebhook,
      });

      // Flush if queue is getting large
      if (this.workflowQueue.length >= 5) {
        await this.flush();
      }
    } catch (error) {
      logger.debug('Failed to track workflow creation:', error);
    }
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
    if (this.eventQueue.length >= 20) {
      this.flush();
    }
  }

  /**
   * Track session start
   */
  trackSessionStart(): void {
    if (!this.isEnabled()) return;

    this.trackEvent('session_start', {
      version: require('../../package.json').version,
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
    });
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

      try {
        const { error } = await this.supabase
          .from('telemetry_events')
          .insert(events);

        if (error) {
          logger.debug('Failed to flush telemetry events:', error.message);
        }
      } catch (error) {
        logger.debug('Error flushing telemetry events:', error);
      }
    }

    // Flush workflows
    if (this.workflowQueue.length > 0) {
      const workflows = [...this.workflowQueue];
      this.workflowQueue = [];

      try {
        // Use upsert to avoid duplicates based on workflow_hash
        const { error } = await this.supabase
          .from('telemetry_workflows')
          .upsert(workflows, {
            onConflict: 'workflow_hash',
            ignoreDuplicates: true,
          });

        if (error) {
          logger.debug('Failed to flush telemetry workflows:', error.message);
        }
      } catch (error) {
        logger.debug('Error flushing telemetry workflows:', error);
      }
    }
  }

  /**
   * Start batch processor for periodic flushing
   */
  private startBatchProcessor(): void {
    // Flush every 30 seconds
    this.flushTimer = setInterval(() => {
      this.flush();
    }, 30000);

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

// Export singleton instance
export const telemetry = TelemetryManager.getInstance();