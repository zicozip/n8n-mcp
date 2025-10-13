/**
 * N8N MCP Engine - Clean interface for service integration
 *
 * This class provides a simple API for integrating the n8n-MCP server
 * into larger services. The wrapping service handles authentication,
 * multi-tenancy, rate limiting, etc.
 */
import { Request, Response } from 'express';
import { SingleSessionHTTPServer } from './http-server-single-session';
import { logger } from './utils/logger';
import { InstanceContext } from './types/instance-context';
import { SessionRestoreHook, SessionState } from './types/session-restoration';

export interface EngineHealth {
  status: 'healthy' | 'unhealthy';
  uptime: number;
  sessionActive: boolean;
  memoryUsage: {
    used: number;
    total: number;
    unit: string;
  };
  version: string;
}

export interface EngineOptions {
  sessionTimeout?: number;
  logLevel?: 'error' | 'warn' | 'info' | 'debug';

  /**
   * Session restoration hook for multi-tenant persistence
   * Called when a client tries to use an unknown session ID
   * Return instance context to restore the session, or null to reject
   *
   * @security IMPORTANT: Implement rate limiting in this hook to prevent abuse.
   * Malicious clients could trigger excessive database lookups by sending random
   * session IDs. Consider using express-rate-limit or similar middleware.
   *
   * @since 2.19.0
   */
  onSessionNotFound?: SessionRestoreHook;

  /**
   * Maximum time to wait for session restoration (milliseconds)
   * @default 5000 (5 seconds)
   * @since 2.19.0
   */
  sessionRestorationTimeout?: number;

  /**
   * Session lifecycle event handlers (Phase 3 - REQ-4)
   *
   * Optional callbacks for session lifecycle events:
   * - onSessionCreated: Called when a new session is created
   * - onSessionRestored: Called when a session is restored from storage
   * - onSessionAccessed: Called on EVERY request (consider throttling!)
   * - onSessionExpired: Called when a session expires
   * - onSessionDeleted: Called when a session is manually deleted
   *
   * All handlers are fire-and-forget (non-blocking).
   * Errors are logged but don't affect session operations.
   *
   * @since 2.19.0
   */
  sessionEvents?: {
    onSessionCreated?: (sessionId: string, instanceContext: InstanceContext) => void | Promise<void>;
    onSessionRestored?: (sessionId: string, instanceContext: InstanceContext) => void | Promise<void>;
    onSessionAccessed?: (sessionId: string) => void | Promise<void>;
    onSessionExpired?: (sessionId: string) => void | Promise<void>;
    onSessionDeleted?: (sessionId: string) => void | Promise<void>;
  };

  /**
   * Number of retry attempts for failed session restoration (Phase 4 - REQ-7)
   *
   * When the restoration hook throws an error, the system will retry
   * up to this many times with a delay between attempts.
   *
   * Timeout errors are NOT retried (already took too long).
   * The overall timeout applies to ALL retry attempts combined.
   *
   * @default 0 (no retries, opt-in)
   * @since 2.19.0
   */
  sessionRestorationRetries?: number;

  /**
   * Delay between retry attempts in milliseconds (Phase 4 - REQ-7)
   *
   * @default 100 (100 milliseconds)
   * @since 2.19.0
   */
  sessionRestorationRetryDelay?: number;
}

export class N8NMCPEngine {
  private server: SingleSessionHTTPServer;
  private startTime: Date;
  
  constructor(options: EngineOptions = {}) {
    this.server = new SingleSessionHTTPServer(options);
    this.startTime = new Date();

    if (options.logLevel) {
      process.env.LOG_LEVEL = options.logLevel;
    }
  }
  
  /**
   * Process a single MCP request with optional instance context
   * The wrapping service handles authentication, multi-tenancy, etc.
   *
   * @param req - Express request object
   * @param res - Express response object
   * @param instanceContext - Optional instance-specific configuration
   *
   * @example
   * // Basic usage (backward compatible)
   * await engine.processRequest(req, res);
   *
   * @example
   * // With instance context
   * const context: InstanceContext = {
   *   n8nApiUrl: 'https://instance1.n8n.cloud',
   *   n8nApiKey: 'instance1-key',
   *   instanceId: 'tenant-123'
   * };
   * await engine.processRequest(req, res, context);
   */
  async processRequest(
    req: Request,
    res: Response,
    instanceContext?: InstanceContext
  ): Promise<void> {
    try {
      await this.server.handleRequest(req, res, instanceContext);
    } catch (error) {
      logger.error('Engine processRequest error:', error);
      throw error;
    }
  }
  
  /**
   * Health check for service monitoring
   * 
   * @example
   * app.get('/health', async (req, res) => {
   *   const health = await engine.healthCheck();
   *   res.status(health.status === 'healthy' ? 200 : 503).json(health);
   * });
   */
  async healthCheck(): Promise<EngineHealth> {
    try {
      const sessionInfo = this.server.getSessionInfo();
      const memoryUsage = process.memoryUsage();
      
      return {
        status: 'healthy',
        uptime: Math.floor((Date.now() - this.startTime.getTime()) / 1000),
        sessionActive: sessionInfo.active,
        memoryUsage: {
          used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          unit: 'MB'
        },
        version: '2.19.3'
      };
    } catch (error) {
      logger.error('Health check failed:', error);
      return {
        status: 'unhealthy',
        uptime: 0,
        sessionActive: false,
        memoryUsage: { used: 0, total: 0, unit: 'MB' },
        version: '2.19.3'
      };
    }
  }
  
  /**
   * Get current session information
   * Useful for monitoring and debugging
   */
  getSessionInfo(): { active: boolean; sessionId?: string; age?: number } {
    return this.server.getSessionInfo();
  }

  /**
   * Get all active session IDs (Phase 2 - REQ-5)
   * Returns array of currently active session IDs
   *
   * @returns Array of session IDs
   * @since 2.19.0
   *
   * @example
   * ```typescript
   * const engine = new N8NMCPEngine();
   * const sessionIds = engine.getActiveSessions();
   * console.log(`Active sessions: ${sessionIds.length}`);
   * ```
   */
  getActiveSessions(): string[] {
    return this.server.getActiveSessions();
  }

  /**
   * Get session state for a specific session (Phase 2 - REQ-5)
   * Returns session state or null if session doesn't exist
   *
   * @param sessionId - The session ID to get state for
   * @returns SessionState object or null
   * @since 2.19.0
   *
   * @example
   * ```typescript
   * const state = engine.getSessionState('session-123');
   * if (state) {
   *   // Save to database
   *   await db.saveSession(state);
   * }
   * ```
   */
  getSessionState(sessionId: string): SessionState | null {
    return this.server.getSessionState(sessionId);
  }

  /**
   * Get all session states (Phase 2 - REQ-5)
   * Returns array of all active session states for bulk backup
   *
   * @returns Array of SessionState objects
   * @since 2.19.0
   *
   * @example
   * ```typescript
   * // Periodic backup every 5 minutes
   * setInterval(async () => {
   *   const states = engine.getAllSessionStates();
   *   for (const state of states) {
   *     await database.upsertSession(state);
   *   }
   * }, 300000);
   * ```
   */
  getAllSessionStates(): SessionState[] {
    return this.server.getAllSessionStates();
  }

  /**
   * Manually restore a session (Phase 2 - REQ-5)
   * Creates a session with the given ID and instance context
   *
   * @param sessionId - The session ID to restore
   * @param instanceContext - Instance configuration
   * @returns true if session was restored successfully, false otherwise
   * @since 2.19.0
   *
   * @example
   * ```typescript
   * // Restore session from database
   * const session = await db.loadSession('session-123');
   * if (session) {
   *   const restored = engine.restoreSession(
   *     session.sessionId,
   *     session.instanceContext
   *   );
   *   console.log(`Restored: ${restored}`);
   * }
   * ```
   */
  restoreSession(sessionId: string, instanceContext: InstanceContext): boolean {
    return this.server.manuallyRestoreSession(sessionId, instanceContext);
  }

  /**
   * Manually delete a session (Phase 2 - REQ-5)
   * Removes the session and cleans up resources
   *
   * @param sessionId - The session ID to delete
   * @returns true if session was deleted, false if not found
   * @since 2.19.0
   *
   * @example
   * ```typescript
   * // Delete expired session
   * const deleted = engine.deleteSession('session-123');
   * if (deleted) {
   *   await db.deleteSession('session-123');
   * }
   * ```
   */
  deleteSession(sessionId: string): boolean {
    return this.server.manuallyDeleteSession(sessionId);
  }

  /**
   * Graceful shutdown for service lifecycle
   *
   * @example
   * process.on('SIGTERM', async () => {
   *   await engine.shutdown();
   *   process.exit(0);
   * });
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down N8N MCP Engine...');
    await this.server.shutdown();
  }
  
  /**
   * Start the engine (if using standalone mode)
   * For embedded use, this is not necessary
   */
  async start(): Promise<void> {
    await this.server.start();
  }
}

/**
 * Example usage with flexible instance configuration:
 *
 * ```typescript
 * import { N8NMCPEngine, InstanceContext } from 'n8n-mcp';
 * import express from 'express';
 *
 * const app = express();
 * const engine = new N8NMCPEngine();
 *
 * // Middleware for authentication
 * const authenticate = (req, res, next) => {
 *   // Your auth logic
 *   req.userId = 'user123';
 *   next();
 * };
 *
 * // MCP endpoint with flexible instance support
 * app.post('/api/instances/:instanceId/mcp', authenticate, async (req, res) => {
 *   // Get instance configuration from your database
 *   const instance = await getInstanceConfig(req.params.instanceId);
 *
 *   // Create instance context
 *   const context: InstanceContext = {
 *     n8nApiUrl: instance.n8nUrl,
 *     n8nApiKey: instance.apiKey,
 *     instanceId: instance.id,
 *     metadata: { userId: req.userId }
 *   };
 *
 *   // Process request with instance context
 *   await engine.processRequest(req, res, context);
 * });
 *
 * // Health endpoint
 * app.get('/health', async (req, res) => {
 *   const health = await engine.healthCheck();
 *   res.json(health);
 * });
 * ```
 */
export default N8NMCPEngine;