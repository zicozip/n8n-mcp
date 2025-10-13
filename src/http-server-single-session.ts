#!/usr/bin/env node
/**
 * Single-Session HTTP server for n8n-MCP
 * Implements Hybrid Single-Session Architecture for protocol compliance
 * while maintaining simplicity for single-player use case
 */
import express from 'express';
import rateLimit from 'express-rate-limit';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { N8NDocumentationMCPServer } from './mcp/server';
import { ConsoleManager } from './utils/console-manager';
import { logger } from './utils/logger';
import { AuthManager } from './utils/auth';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';
import { getStartupBaseUrl, formatEndpointUrls, detectBaseUrl } from './utils/url-detector';
import { PROJECT_VERSION } from './utils/version';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import {
  negotiateProtocolVersion,
  logProtocolNegotiation,
  STANDARD_PROTOCOL_VERSION
} from './utils/protocol-version';
import { InstanceContext, validateInstanceContext } from './types/instance-context';
import { SessionRestoreHook, SessionState, SessionLifecycleEvents } from './types/session-restoration';

dotenv.config();

// Protocol version constant - will be negotiated per client
const DEFAULT_PROTOCOL_VERSION = STANDARD_PROTOCOL_VERSION;

// Type-safe headers interface for multi-tenant support
interface MultiTenantHeaders {
  'x-n8n-url'?: string;
  'x-n8n-key'?: string;
  'x-instance-id'?: string;
  'x-session-id'?: string;
}

// Session management constants
const MAX_SESSIONS = 100;
const SESSION_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

interface Session {
  server: N8NDocumentationMCPServer;
  transport: StreamableHTTPServerTransport | SSEServerTransport;
  lastAccess: Date;
  sessionId: string;
  initialized: boolean;
  isSSE: boolean;
}

interface SessionMetrics {
  totalSessions: number;
  activeSessions: number;
  expiredSessions: number;
  lastCleanup: Date;
}

/**
 * Extract multi-tenant headers in a type-safe manner
 */
function extractMultiTenantHeaders(req: express.Request): MultiTenantHeaders {
  return {
    'x-n8n-url': req.headers['x-n8n-url'] as string | undefined,
    'x-n8n-key': req.headers['x-n8n-key'] as string | undefined,
    'x-instance-id': req.headers['x-instance-id'] as string | undefined,
    'x-session-id': req.headers['x-session-id'] as string | undefined,
  };
}

export class SingleSessionHTTPServer {
  // Map to store transports by session ID (following SDK pattern)
  private transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};
  private servers: { [sessionId: string]: N8NDocumentationMCPServer } = {};
  private sessionMetadata: { [sessionId: string]: { lastAccess: Date; createdAt: Date } } = {};
  private sessionContexts: { [sessionId: string]: InstanceContext | undefined } = {};
  private contextSwitchLocks: Map<string, Promise<void>> = new Map();
  private session: Session | null = null;  // Keep for SSE compatibility
  private consoleManager = new ConsoleManager();
  private expressServer: any;
  private sessionTimeout = 30 * 60 * 1000; // 30 minutes
  private authToken: string | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;

  // Recursion guard to prevent concurrent cleanup of same session
  private cleanupInProgress = new Set<string>();

  // Shutdown flag to prevent recursive event handlers during cleanup
  private isShuttingDown = false;

  // Session restoration options (Phase 1 - v2.19.0)
  private onSessionNotFound?: SessionRestoreHook;
  private sessionRestorationTimeout: number;

  // Session lifecycle events (Phase 3 - v2.19.0)
  private sessionEvents?: SessionLifecycleEvents;

  // Retry policy (Phase 4 - v2.19.0)
  private sessionRestorationRetries: number;
  private sessionRestorationRetryDelay: number;

  constructor(options: {
    sessionTimeout?: number;
    onSessionNotFound?: SessionRestoreHook;
    sessionRestorationTimeout?: number;
    sessionEvents?: SessionLifecycleEvents;
    sessionRestorationRetries?: number;
    sessionRestorationRetryDelay?: number;
  } = {}) {
    // Validate environment on construction
    this.validateEnvironment();

    // Session restoration configuration
    this.onSessionNotFound = options.onSessionNotFound;
    this.sessionRestorationTimeout = options.sessionRestorationTimeout || 5000; // 5 seconds default

    // Lifecycle events configuration
    this.sessionEvents = options.sessionEvents;

    // Retry policy configuration
    this.sessionRestorationRetries = options.sessionRestorationRetries ?? 0; // Default: no retries
    this.sessionRestorationRetryDelay = options.sessionRestorationRetryDelay || 100; // Default: 100ms

    // Override session timeout if provided
    if (options.sessionTimeout) {
      this.sessionTimeout = options.sessionTimeout;
    }

    // No longer pre-create session - will be created per initialize request following SDK pattern

    // Start periodic session cleanup
    this.startSessionCleanup();
  }
  
  /**
   * Start periodic session cleanup
   */
  private startSessionCleanup(): void {
    this.cleanupTimer = setInterval(async () => {
      try {
        await this.cleanupExpiredSessions();
      } catch (error) {
        logger.error('Error during session cleanup', error);
      }
    }, SESSION_CLEANUP_INTERVAL);
    
    logger.info('Session cleanup started', { 
      interval: SESSION_CLEANUP_INTERVAL / 1000 / 60,
      maxSessions: MAX_SESSIONS,
      sessionTimeout: this.sessionTimeout / 1000 / 60
    });
  }
  
  /**
   * Clean up expired sessions based on last access time
   * CRITICAL: Now async to properly await cleanup operations
   */
  private async cleanupExpiredSessions(): Promise<void> {
    const now = Date.now();
    const expiredSessions: string[] = [];

    // Check for expired sessions
    for (const sessionId in this.sessionMetadata) {
      const metadata = this.sessionMetadata[sessionId];
      if (now - metadata.lastAccess.getTime() > this.sessionTimeout) {
        expiredSessions.push(sessionId);
      }
    }

    // Also check for orphaned contexts (sessions that were removed but context remained)
    for (const sessionId in this.sessionContexts) {
      if (!this.sessionMetadata[sessionId]) {
        // Context exists but session doesn't - clean it up
        delete this.sessionContexts[sessionId];
        logger.debug('Cleaned orphaned session context', { sessionId });
      }
    }

    // Check for orphaned transports (transports without metadata)
    for (const sessionId in this.transports) {
      if (!this.sessionMetadata[sessionId]) {
        logger.warn('Orphaned transport detected, cleaning up', { sessionId });
        try {
          // Await cleanup to prevent concurrent operations
          await this.removeSession(sessionId, 'orphaned_transport');
        } catch (err) {
          logger.error('Error cleaning orphaned transport', {
            sessionId,
            error: err instanceof Error ? err.message : String(err)
          });
        }
      }
    }

    // Check for orphaned servers (servers without metadata)
    for (const sessionId in this.servers) {
      if (!this.sessionMetadata[sessionId]) {
        logger.warn('Orphaned server detected, cleaning up', { sessionId });
        delete this.servers[sessionId];
        logger.debug('Cleaned orphaned server', { sessionId });
      }
    }

    // Remove expired sessions SEQUENTIALLY with error isolation
    // CRITICAL: Must await each removeSession call to prevent concurrent cleanup
    // and stack overflow from recursive cleanup attempts
    let successCount = 0;
    let failureCount = 0;

    for (const sessionId of expiredSessions) {
      try {
        // Phase 3: Emit onSessionExpired event BEFORE removal (REQ-4)
        // Await the event to ensure it completes before cleanup
        await this.emitEvent('onSessionExpired', sessionId);

        // CRITICAL: MUST await to prevent concurrent cleanup
        await this.removeSession(sessionId, 'expired');
        successCount++;
      } catch (error) {
        // Isolate error - don't let one session failure stop cleanup of others
        failureCount++;
        logger.error('Failed to cleanup expired session (isolated)', {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
        // Continue with next session - cleanup must be resilient
      }
    }

    if (expiredSessions.length > 0) {
      logger.info('Expired session cleanup completed', {
        total: expiredSessions.length,
        successful: successCount,
        failed: failureCount,
        remaining: this.getActiveSessionCount()
      });
    }
  }
  
  /**
   * Safely close a transport without triggering recursive cleanup
   * Removes event handlers and uses timeout to prevent hanging
   */
  private async safeCloseTransport(sessionId: string): Promise<void> {
    const transport = this.transports[sessionId];
    if (!transport) return;

    try {
      // Remove event handlers to prevent recursion during cleanup
      // This is critical to break the circular call chain
      transport.onclose = undefined;
      transport.onerror = undefined;

      // Close with timeout protection (3 seconds)
      const closePromise = transport.close();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Transport close timeout')), 3000)
      );

      await Promise.race([closePromise, timeoutPromise]);
      logger.debug('Transport closed safely', { sessionId });
    } catch (error) {
      // Log but don't throw - cleanup must continue even if close fails
      logger.warn('Transport close error (non-fatal)', {
        sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Remove a session and clean up resources
   * Protected against concurrent cleanup attempts via recursion guard
   */
  private async removeSession(sessionId: string, reason: string): Promise<void> {
    // CRITICAL: Guard against concurrent cleanup of the same session
    // This prevents stack overflow from recursive cleanup attempts
    if (this.cleanupInProgress.has(sessionId)) {
      logger.debug('Cleanup already in progress, skipping duplicate', {
        sessionId,
        reason
      });
      return;
    }

    // Mark session as being cleaned up
    this.cleanupInProgress.add(sessionId);

    try {
      // Close transport safely if exists (with timeout and no recursion)
      if (this.transports[sessionId]) {
        await this.safeCloseTransport(sessionId);
        delete this.transports[sessionId];
      }

      // Remove server, metadata, and context
      delete this.servers[sessionId];
      delete this.sessionMetadata[sessionId];
      delete this.sessionContexts[sessionId];

      logger.info('Session removed successfully', { sessionId, reason });
    } catch (error) {
      logger.warn('Error during session removal', {
        sessionId,
        reason,
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      // CRITICAL: Always remove from cleanup set, even on error
      // This prevents sessions from being permanently stuck in "cleaning" state
      this.cleanupInProgress.delete(sessionId);
    }
  }
  
  /**
   * Get current active session count
   */
  private getActiveSessionCount(): number {
    return Object.keys(this.transports).length;
  }
  
  /**
   * Check if we can create a new session
   */
  private canCreateSession(): boolean {
    return this.getActiveSessionCount() < MAX_SESSIONS;
  }
  
  /**
   * Validate session ID format (Security-Hardened - REQ-8)
   *
   * Validates session ID format to prevent injection attacks:
   * - SQL injection
   * - NoSQL injection
   * - Path traversal
   * - DoS via oversized IDs
   *
   * Accepts any non-empty string with safe characters for MCP client compatibility.
   * Security protections:
   * - Character whitelist: Only alphanumeric, hyphens, and underscores allowed
   * - Maximum length: 100 characters (DoS protection)
   * - Rejects empty strings
   *
   * @param sessionId - Session identifier from MCP client
   * @returns true if valid, false otherwise
   * @since 2.19.0 - Enhanced with security validation
   * @since 2.19.1 - Relaxed to accept any non-empty safe string
   */
  private isValidSessionId(sessionId: string): boolean {
    if (!sessionId || typeof sessionId !== 'string') {
      return false;
    }

    // Character whitelist (alphanumeric + hyphens + underscores) - Injection protection
    // Prevents SQL/NoSQL injection and path traversal attacks
    if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
      return false;
    }

    // Maximum length validation for DoS protection
    // Prevents memory exhaustion from oversized session IDs
    if (sessionId.length > 100) {
      return false;
    }

    // Accept any non-empty string that passes the security checks above
    return true;
  }
  
  /**
   * Sanitize error information for client responses
   */
  private sanitizeErrorForClient(error: unknown): { message: string; code: string } {
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (error instanceof Error) {
      // In production, only return generic messages
      if (isProduction) {
        // Map known error types to safe messages
        if (error.message.includes('Unauthorized') || error.message.includes('authentication')) {
          return { message: 'Authentication failed', code: 'AUTH_ERROR' };
        }
        if (error.message.includes('Session') || error.message.includes('session')) {
          return { message: 'Session error', code: 'SESSION_ERROR' };
        }
        if (error.message.includes('Invalid') || error.message.includes('validation')) {
          return { message: 'Validation error', code: 'VALIDATION_ERROR' };
        }
        // Default generic error
        return { message: 'Internal server error', code: 'INTERNAL_ERROR' };
      }
      
      // In development, return more details but no stack traces
      return {
        message: error.message.substring(0, 200), // Limit message length
        code: error.name || 'ERROR'
      };
    }
    
    // For non-Error objects
    return { message: 'An error occurred', code: 'UNKNOWN_ERROR' };
  }
  
  /**
   * Update session last access time
   */
  private updateSessionAccess(sessionId: string): void {
    if (this.sessionMetadata[sessionId]) {
      this.sessionMetadata[sessionId].lastAccess = new Date();

      // Phase 3: Emit onSessionAccessed event (REQ-4)
      // Fire-and-forget: don't await or block request processing
      // IMPORTANT: This fires on EVERY request - implement throttling in your handler!
      this.emitEvent('onSessionAccessed', sessionId).catch(err => {
        logger.error('Failed to emit onSessionAccessed event (non-blocking)', {
          sessionId,
          error: err instanceof Error ? err.message : String(err)
        });
      });
    }
  }

  /**
   * Switch session context with locking to prevent race conditions
   */
  private async switchSessionContext(sessionId: string, newContext: InstanceContext): Promise<void> {
    // Check if there's already a switch in progress for this session
    const existingLock = this.contextSwitchLocks.get(sessionId);
    if (existingLock) {
      // Wait for the existing switch to complete
      await existingLock;
      return;
    }

    // Create a promise for this switch operation
    const switchPromise = this.performContextSwitch(sessionId, newContext);
    this.contextSwitchLocks.set(sessionId, switchPromise);

    try {
      await switchPromise;
    } finally {
      // Clean up the lock after completion
      this.contextSwitchLocks.delete(sessionId);
    }
  }

  /**
   * Perform the actual context switch
   */
  private async performContextSwitch(sessionId: string, newContext: InstanceContext): Promise<void> {
    const existingContext = this.sessionContexts[sessionId];

    // Only switch if the context has actually changed
    if (JSON.stringify(existingContext) !== JSON.stringify(newContext)) {
      logger.info('Multi-tenant shared mode: Updating instance context for session', {
        sessionId,
        oldInstanceId: existingContext?.instanceId,
        newInstanceId: newContext.instanceId
      });

      // Update the session context
      this.sessionContexts[sessionId] = newContext;

      // Update the MCP server's instance context if it exists
      if (this.servers[sessionId]) {
        (this.servers[sessionId] as any).instanceContext = newContext;
      }
    }
  }

  /**
   * Timeout utility for session restoration
   * Creates a promise that rejects after the specified milliseconds
   *
   * @param ms - Timeout duration in milliseconds
   * @returns Promise that rejects with TimeoutError
   * @since 2.19.0
   */
  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        const error = new Error(`Operation timed out after ${ms}ms`);
        error.name = 'TimeoutError';
        reject(error);
      }, ms);
    });
  }

  /**
   * Emit a session lifecycle event (Phase 3 - REQ-4)
   * Errors in event handlers are logged but don't break session operations
   *
   * @param eventName - The event to emit
   * @param args - Arguments to pass to the event handler
   * @since 2.19.0
   */
  private async emitEvent(
    eventName: keyof SessionLifecycleEvents,
    ...args: [string, InstanceContext?]
  ): Promise<void> {
    const handler = this.sessionEvents?.[eventName] as (((...args: any[]) => void | Promise<void>) | undefined);
    if (!handler) return;

    try {
      // Support both sync and async handlers
      await Promise.resolve(handler(...args));
    } catch (error) {
      logger.error(`Session event handler failed: ${eventName}`, {
        error: error instanceof Error ? error.message : String(error),
        sessionId: args[0] // First arg is always sessionId
      });
      // DON'T THROW - event failures shouldn't break session operations
    }
  }

  /**
   * Restore session with retry policy (Phase 4 - REQ-7)
   *
   * Attempts to restore a session using the onSessionNotFound hook,
   * with configurable retry logic for transient failures.
   *
   * Timeout applies to ALL attempts combined (not per attempt).
   * Timeout errors are never retried.
   *
   * @param sessionId - Session ID to restore
   * @returns Restored instance context or null
   * @throws TimeoutError if overall timeout exceeded
   * @throws Error from hook if all retry attempts failed
   * @since 2.19.0
   */
  private async restoreSessionWithRetry(sessionId: string): Promise<InstanceContext | null> {
    if (!this.onSessionNotFound) {
      throw new Error('onSessionNotFound hook not configured');
    }

    const maxRetries = this.sessionRestorationRetries;
    const retryDelay = this.sessionRestorationRetryDelay;
    const overallTimeout = this.sessionRestorationTimeout;
    const startTime = Date.now();

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Calculate remaining time for this attempt
        const remainingTime = overallTimeout - (Date.now() - startTime);

        if (remainingTime <= 0) {
          const error = new Error(`Session restoration timed out after ${overallTimeout}ms`);
          error.name = 'TimeoutError';
          throw error;
        }

        // Log retry attempt (except first attempt)
        if (attempt > 0) {
          logger.debug('Retrying session restoration', {
            sessionId,
            attempt: attempt,
            maxRetries: maxRetries,
            remainingTime: remainingTime + 'ms'
          });
        }

        // Call hook with remaining time as timeout
        const context = await Promise.race([
          this.onSessionNotFound(sessionId),
          this.timeout(remainingTime)
        ]);

        // Success!
        if (attempt > 0) {
          logger.info('Session restoration succeeded after retry', {
            sessionId,
            attempts: attempt + 1
          });
        }

        return context;

      } catch (error) {
        // Don't retry timeout errors (already took too long)
        if (error instanceof Error && error.name === 'TimeoutError') {
          logger.error('Session restoration timeout (no retry)', {
            sessionId,
            timeout: overallTimeout
          });
          throw error;
        }

        // Last attempt - don't delay, just throw
        if (attempt === maxRetries) {
          logger.error('Session restoration failed after all retries', {
            sessionId,
            attempts: attempt + 1,
            error: error instanceof Error ? error.message : String(error)
          });
          throw error;
        }

        // Log retry-eligible failure
        logger.warn('Session restoration failed, will retry', {
          sessionId,
          attempt: attempt + 1,
          maxRetries: maxRetries,
          error: error instanceof Error ? error.message : String(error),
          nextRetryIn: retryDelay + 'ms'
        });

        // Delay before next attempt
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    // Should never reach here, but TypeScript needs it
    throw new Error('Unexpected state in restoreSessionWithRetry');
  }

  /**
   * Create a new session (IDEMPOTENT - REQ-2)
   *
   * This method is idempotent to prevent race conditions during concurrent
   * restoration attempts. If the session already exists, returns existing
   * session ID without creating a duplicate.
   *
   * @param instanceContext - Instance-specific configuration
   * @param sessionId - Optional pre-defined session ID (for restoration)
   * @param waitForConnection - If true, waits for server.connect() to complete (for restoration)
   * @returns The session ID (newly created or existing)
   * @throws Error if session ID format is invalid
   * @since 2.19.0
   */
  private createSession(
    instanceContext: InstanceContext,
    sessionId?: string,
    waitForConnection: boolean = false
  ): Promise<string> | string {
    // Generate session ID if not provided
    const id = sessionId || this.generateSessionId(instanceContext);

    // CRITICAL: Idempotency check to prevent race conditions
    if (this.transports[id]) {
      logger.debug('Session already exists, skipping creation (idempotent)', {
        sessionId: id
      });
      return waitForConnection ? Promise.resolve(id) : id;
    }

    // Validate session ID format if provided externally
    if (sessionId && !this.isValidSessionId(sessionId)) {
      logger.error('Invalid session ID format during creation', { sessionId });
      throw new Error('Invalid session ID format');
    }

    // Store session metadata immediately for synchronous access
    // This ensures getActiveSessions() works immediately after restoreSession()
    // Only store if not already stored (idempotency - prevents duplicate storage)
    if (!this.sessionMetadata[id]) {
      this.sessionMetadata[id] = {
        lastAccess: new Date(),
        createdAt: new Date()
      };
      this.sessionContexts[id] = instanceContext;
    }

    const server = new N8NDocumentationMCPServer(instanceContext);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => id,
      onsessioninitialized: (initializedSessionId: string) => {
        logger.info('Session initialized during explicit creation', {
          sessionId: initializedSessionId
        });
      }
    });

    // Store transport and server immediately to maintain idempotency for concurrent calls
    this.transports[id] = transport;
    this.servers[id] = server;

    // Set up cleanup handlers
    transport.onclose = () => {
      if (transport.sessionId) {
        // Prevent recursive cleanup during shutdown
        if (this.isShuttingDown) {
          logger.debug('Ignoring transport close event during shutdown', {
            sessionId: transport.sessionId
          });
          return;
        }

        logger.info('Transport closed during createSession, cleaning up', {
          sessionId: transport.sessionId
        });
        this.removeSession(transport.sessionId, 'transport_closed').catch(err => {
          logger.error('Error during transport close cleanup', {
            sessionId: transport.sessionId,
            error: err instanceof Error ? err.message : String(err)
          });
        });
      }
    };

    transport.onerror = (error: Error) => {
      if (transport.sessionId) {
        // Prevent recursive cleanup during shutdown
        if (this.isShuttingDown) {
          logger.debug('Ignoring transport error event during shutdown', {
            sessionId: transport.sessionId
          });
          return;
        }

        logger.error('Transport error during createSession', {
          sessionId: transport.sessionId,
          error: error.message
        });
        this.removeSession(transport.sessionId, 'transport_error').catch(err => {
          logger.error('Error during transport error cleanup', { error: err });
        });
      }
    };

    const initializeSession = async (): Promise<string> => {
      try {
        // Ensure server is fully initialized before connecting
        await (server as any).initialized;

        await server.connect(transport);

        if (waitForConnection) {
          logger.info('Session created and connected successfully', {
            sessionId: id,
            hasInstanceContext: !!instanceContext,
            instanceId: instanceContext?.instanceId
          });
        } else {
          logger.info('Session created successfully (connecting server to transport)', {
            sessionId: id,
            hasInstanceContext: !!instanceContext,
            instanceId: instanceContext?.instanceId
          });
        }
      } catch (err) {
        logger.error('Failed to connect server to transport in createSession', {
          sessionId: id,
          error: err instanceof Error ? err.message : String(err),
          waitForConnection
        });

        await this.removeSession(id, 'connection_failed').catch(cleanupErr => {
          logger.error('Error during connection failure cleanup', { error: cleanupErr });
        });

        throw err;
      }

      // Phase 3: Emit onSessionCreated event (REQ-4)
      // Fire-and-forget: don't await or block session creation
      this.emitEvent('onSessionCreated', id, instanceContext).catch(eventErr => {
        logger.error('Failed to emit onSessionCreated event (non-blocking)', {
          sessionId: id,
          error: eventErr instanceof Error ? eventErr.message : String(eventErr)
        });
      });

      return id;
    };

    if (waitForConnection) {
      // Caller expects to wait until connection succeeds
      return initializeSession();
    }

    // Fire-and-forget for manual restoration - surface errors via logging/cleanup
    initializeSession().catch(error => {
      logger.error('Async session creation failed in manual restore flow', {
        sessionId: id,
        error: error instanceof Error ? error.message : String(error)
      });
    });

    return id;
  }

  /**
   * Generate session ID based on instance context
   * Used for multi-tenant mode
   *
   * @param instanceContext - Instance-specific configuration
   * @returns Generated session ID
   */
  private generateSessionId(instanceContext?: InstanceContext): string {
    const isMultiTenantEnabled = process.env.ENABLE_MULTI_TENANT === 'true';
    const sessionStrategy = process.env.MULTI_TENANT_SESSION_STRATEGY || 'instance';

    if (isMultiTenantEnabled && sessionStrategy === 'instance' && instanceContext?.instanceId) {
      // Multi-tenant mode with instance strategy
      const configHash = createHash('sha256')
        .update(JSON.stringify({
          url: instanceContext.n8nApiUrl,
          instanceId: instanceContext.instanceId
        }))
        .digest('hex')
        .substring(0, 8);

      return `instance-${instanceContext.instanceId}-${configHash}-${uuidv4()}`;
    }

    // Standard UUIDv4
    return uuidv4();
  }

  /**
   * Get session metrics for monitoring
   */
  private getSessionMetrics(): SessionMetrics {
    const now = Date.now();
    let expiredCount = 0;
    
    for (const sessionId in this.sessionMetadata) {
      const metadata = this.sessionMetadata[sessionId];
      if (now - metadata.lastAccess.getTime() > this.sessionTimeout) {
        expiredCount++;
      }
    }
    
    return {
      totalSessions: Object.keys(this.sessionMetadata).length,
      activeSessions: this.getActiveSessionCount(),
      expiredSessions: expiredCount,
      lastCleanup: new Date()
    };
  }
  
  /**
   * Load auth token from environment variable or file
   */
  private loadAuthToken(): string | null {
    // First, try AUTH_TOKEN environment variable
    if (process.env.AUTH_TOKEN) {
      logger.info('Using AUTH_TOKEN from environment variable');
      return process.env.AUTH_TOKEN;
    }
    
    // Then, try AUTH_TOKEN_FILE
    if (process.env.AUTH_TOKEN_FILE) {
      try {
        const token = readFileSync(process.env.AUTH_TOKEN_FILE, 'utf-8').trim();
        logger.info(`Loaded AUTH_TOKEN from file: ${process.env.AUTH_TOKEN_FILE}`);
        return token;
      } catch (error) {
        logger.error(`Failed to read AUTH_TOKEN_FILE: ${process.env.AUTH_TOKEN_FILE}`, error);
        console.error(`ERROR: Failed to read AUTH_TOKEN_FILE: ${process.env.AUTH_TOKEN_FILE}`);
        console.error(error instanceof Error ? error.message : 'Unknown error');
        return null;
      }
    }
    
    return null;
  }
  
  /**
   * Validate required environment variables
   */
  private validateEnvironment(): void {
    // Load auth token from env var or file
    this.authToken = this.loadAuthToken();
    
    if (!this.authToken || this.authToken.trim() === '') {
      const message = 'No authentication token found or token is empty. Set AUTH_TOKEN environment variable or AUTH_TOKEN_FILE pointing to a file containing the token.';
      logger.error(message);
      throw new Error(message);
    }
    
    // Update authToken to trimmed version
    this.authToken = this.authToken.trim();
    
    if (this.authToken.length < 32) {
      logger.warn('AUTH_TOKEN should be at least 32 characters for security');
    }
    
    // Check for default token and show prominent warnings
    const isDefaultToken = this.authToken === 'REPLACE_THIS_AUTH_TOKEN_32_CHARS_MIN_abcdefgh';
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (isDefaultToken) {
      if (isProduction) {
        const message = 'CRITICAL SECURITY ERROR: Cannot start in production with default AUTH_TOKEN. Generate secure token: openssl rand -base64 32';
        logger.error(message);
        console.error('\n🚨 CRITICAL SECURITY ERROR 🚨');
        console.error(message);
        console.error('Set NODE_ENV to development for testing, or update AUTH_TOKEN for production\n');
        throw new Error(message);
      }
      
      logger.warn('⚠️ SECURITY WARNING: Using default AUTH_TOKEN - CHANGE IMMEDIATELY!');
      logger.warn('Generate secure token with: openssl rand -base64 32');
      
      // Only show console warnings in HTTP mode
      if (process.env.MCP_MODE === 'http') {
        console.warn('\n⚠️  SECURITY WARNING ⚠️');
        console.warn('Using default AUTH_TOKEN - CHANGE IMMEDIATELY!');
        console.warn('Generate secure token: openssl rand -base64 32');
        console.warn('Update via Railway dashboard environment variables\n');
      }
    }
  }
  

  /**
   * Handle incoming MCP request using proper SDK pattern
   *
   * @param req - Express request object
   * @param res - Express response object
   * @param instanceContext - Optional instance-specific configuration
   */
  async handleRequest(
    req: express.Request,
    res: express.Response,
    instanceContext?: InstanceContext
  ): Promise<void> {
    const startTime = Date.now();
    
    // Wrap all operations to prevent console interference
    return this.consoleManager.wrapOperation(async () => {
      try {
        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        const isInitialize = req.body ? isInitializeRequest(req.body) : false;
        
        // Log comprehensive incoming request details for debugging
        logger.info('handleRequest: Processing MCP request - SDK PATTERN', {
          requestId: req.get('x-request-id') || 'unknown',
          sessionId: sessionId,
          method: req.method,
          url: req.url,
          bodyType: typeof req.body,
          bodyContent: req.body ? JSON.stringify(req.body, null, 2) : 'undefined',
          existingTransports: Object.keys(this.transports),
          isInitializeRequest: isInitialize
        });
        
        let transport: StreamableHTTPServerTransport;
        
        if (isInitialize) {
          // Check session limits before creating new session
          if (!this.canCreateSession()) {
            logger.warn('handleRequest: Session limit reached', {
              currentSessions: this.getActiveSessionCount(),
              maxSessions: MAX_SESSIONS
            });
            
            res.status(429).json({
              jsonrpc: '2.0',
              error: {
                code: -32000,
                message: `Session limit reached (${MAX_SESSIONS}). Please wait for existing sessions to expire.`
              },
              id: req.body?.id || null
            });
            return;
          }
          
          // For initialize requests: always create new transport and server
          logger.info('handleRequest: Creating new transport for initialize request');

          // Generate session ID based on multi-tenant configuration
          let sessionIdToUse: string;

          const isMultiTenantEnabled = process.env.ENABLE_MULTI_TENANT === 'true';
          const sessionStrategy = process.env.MULTI_TENANT_SESSION_STRATEGY || 'instance';

          if (isMultiTenantEnabled && sessionStrategy === 'instance' && instanceContext?.instanceId) {
            // In multi-tenant mode with instance strategy, create session per instance
            // This ensures each tenant gets isolated sessions
            // Include configuration hash to prevent collisions with different configs
            const configHash = createHash('sha256')
              .update(JSON.stringify({
                url: instanceContext.n8nApiUrl,
                instanceId: instanceContext.instanceId
              }))
              .digest('hex')
              .substring(0, 8);

            sessionIdToUse = `instance-${instanceContext.instanceId}-${configHash}-${uuidv4()}`;
            logger.info('Multi-tenant mode: Creating instance-specific session', {
              instanceId: instanceContext.instanceId,
              configHash,
              sessionId: sessionIdToUse
            });
          } else {
            // Use client-provided session ID or generate a standard one
            sessionIdToUse = sessionId || uuidv4();
          }

          const server = new N8NDocumentationMCPServer(instanceContext);
          
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => sessionIdToUse,
            onsessioninitialized: (initializedSessionId: string) => {
              // Store both transport and server by session ID when session is initialized
              logger.info('handleRequest: Session initialized, storing transport and server', { 
                sessionId: initializedSessionId 
              });
              this.transports[initializedSessionId] = transport;
              this.servers[initializedSessionId] = server;
              
              // Store session metadata and context
              this.sessionMetadata[initializedSessionId] = {
                lastAccess: new Date(),
                createdAt: new Date()
              };
              this.sessionContexts[initializedSessionId] = instanceContext;
            }
          });
          
          // Set up cleanup handlers
          transport.onclose = () => {
            const sid = transport.sessionId;
            if (sid) {
              // Prevent recursive cleanup during shutdown
              if (this.isShuttingDown) {
                logger.debug('Ignoring transport close event during shutdown', { sessionId: sid });
                return;
              }

              logger.info('handleRequest: Transport closed, cleaning up', { sessionId: sid });
              this.removeSession(sid, 'transport_closed').catch(err => {
                logger.error('Error during transport close cleanup', {
                  sessionId: sid,
                  error: err instanceof Error ? err.message : String(err)
                });
              });
            }
          };

          // Handle transport errors to prevent connection drops
          transport.onerror = (error: Error) => {
            const sid = transport.sessionId;
            if (sid) {
              // Prevent recursive cleanup during shutdown
              if (this.isShuttingDown) {
                logger.debug('Ignoring transport error event during shutdown', { sessionId: sid });
                return;
              }

              logger.error('Transport error', { sessionId: sid, error: error.message });
              this.removeSession(sid, 'transport_error').catch(err => {
                logger.error('Error during transport error cleanup', { error: err });
              });
            }
          };
          
          // Connect the server to the transport BEFORE handling the request
          logger.info('handleRequest: Connecting server to new transport');
          await server.connect(transport);

          // Phase 3: Emit onSessionCreated event (REQ-4)
          // Fire-and-forget: don't await or block session creation
          this.emitEvent('onSessionCreated', sessionIdToUse, instanceContext).catch(eventErr => {
            logger.error('Failed to emit onSessionCreated event (non-blocking)', {
              sessionId: sessionIdToUse,
              error: eventErr instanceof Error ? eventErr.message : String(eventErr)
            });
          });

        } else if (sessionId && this.transports[sessionId]) {
          // Validate session ID format
          if (!this.isValidSessionId(sessionId)) {
            logger.warn('handleRequest: Invalid session ID format', { sessionId });
            res.status(400).json({
              jsonrpc: '2.0',
              error: {
                code: -32602,
                message: 'Invalid session ID format'
              },
              id: req.body?.id || null
            });
            return;
          }
          
          // For non-initialize requests: reuse existing transport for this session
          logger.info('handleRequest: Reusing existing transport for session', { sessionId });
          transport = this.transports[sessionId];

          // In multi-tenant shared mode, update instance context if provided
          const isMultiTenantEnabled = process.env.ENABLE_MULTI_TENANT === 'true';
          const sessionStrategy = process.env.MULTI_TENANT_SESSION_STRATEGY || 'instance';

          if (isMultiTenantEnabled && sessionStrategy === 'shared' && instanceContext) {
            // Update the context for this session with locking to prevent race conditions
            await this.switchSessionContext(sessionId, instanceContext);
          }

          // Update session access time
          this.updateSessionAccess(sessionId);
          
        } else {
          // Handle unknown session ID - check if we can restore it
          if (sessionId) {
            // REQ-8: Validate session ID format FIRST (security)
            if (!this.isValidSessionId(sessionId)) {
              logger.warn('handleRequest: Invalid session ID format rejected', {
                sessionId: sessionId.substring(0, 20)
              });
              res.status(400).json({
                jsonrpc: '2.0',
                error: {
                  code: -32602,
                  message: 'Invalid session ID format'
                },
                id: req.body?.id || null
              });
              return;
            }

            // REQ-1: Try session restoration if hook provided
            if (this.onSessionNotFound) {
              logger.info('Attempting session restoration', { sessionId });

              try {
                // REQ-7: Call restoration with retry policy (Phase 4)
                // restoreSessionWithRetry handles timeout and retries internally
                const restoredContext = await this.restoreSessionWithRetry(sessionId);

                // Handle both null and undefined defensively
                // Both indicate the hook declined to restore the session
                if (restoredContext === null || restoredContext === undefined) {
                  logger.info('Session restoration declined by hook', {
                    sessionId,
                    returnValue: restoredContext === null ? 'null' : 'undefined'
                  });
                  res.status(400).json({
                    jsonrpc: '2.0',
                    error: {
                      code: -32000,
                      message: 'Session not found or expired'
                    },
                    id: req.body?.id || null
                  });
                  return;
                }

                // Validate the context returned by the hook
                const validation = validateInstanceContext(restoredContext);
                if (!validation.valid) {
                  logger.error('Invalid context returned from restoration hook', {
                    sessionId,
                    errors: validation.errors
                  });
                  res.status(400).json({
                    jsonrpc: '2.0',
                    error: {
                      code: -32000,
                      message: 'Invalid session context'
                    },
                    id: req.body?.id || null
                  });
                  return;
                }

                // REQ-2: Create session (idempotent) and wait for connection
                logger.info('Session restoration successful, creating session', {
                  sessionId,
                  instanceId: restoredContext.instanceId
                });

                // CRITICAL: Wait for server.connect() to complete before proceeding
                // This ensures the transport is fully ready to handle requests
                await this.createSession(restoredContext, sessionId, true);

                // Verify session was created
                if (!this.transports[sessionId]) {
                  logger.error('Session creation failed after restoration', { sessionId });
                  res.status(500).json({
                    jsonrpc: '2.0',
                    error: {
                      code: -32603,
                      message: 'Session creation failed'
                    },
                    id: req.body?.id || null
                  });
                  return;
                }

                // Phase 3: Emit onSessionRestored event (REQ-4)
                // Fire-and-forget: don't await or block request processing
                this.emitEvent('onSessionRestored', sessionId, restoredContext).catch(err => {
                  logger.error('Failed to emit onSessionRestored event (non-blocking)', {
                    sessionId,
                    error: err instanceof Error ? err.message : String(err)
                  });
                });

                // Use the restored session
                transport = this.transports[sessionId];
                logger.info('Using restored session transport', { sessionId });

              } catch (error) {
                // Handle timeout
                if (error instanceof Error && error.name === 'TimeoutError') {
                  logger.error('Session restoration timeout', {
                    sessionId,
                    timeout: this.sessionRestorationTimeout
                  });
                  res.status(408).json({
                    jsonrpc: '2.0',
                    error: {
                      code: -32000,
                      message: 'Session restoration timeout'
                    },
                    id: req.body?.id || null
                  });
                  return;
                }

                // Handle other errors
                logger.error('Session restoration failed', {
                  sessionId,
                  error: error instanceof Error ? error.message : String(error)
                });
                res.status(500).json({
                  jsonrpc: '2.0',
                  error: {
                    code: -32603,
                    message: 'Session restoration failed'
                  },
                  id: req.body?.id || null
                });
                return;
              }
            } else {
              // No restoration hook - session not found
              logger.warn('Session not found and no restoration hook configured', {
                sessionId
              });
              res.status(400).json({
                jsonrpc: '2.0',
                error: {
                  code: -32000,
                  message: 'Session not found or expired'
                },
                id: req.body?.id || null
              });
              return;
            }
          } else {
            // No session ID and not initialize - invalid request
            logger.warn('handleRequest: Invalid request - no session ID and not initialize', {
              isInitialize
            });
            res.status(400).json({
              jsonrpc: '2.0',
              error: {
                code: -32000,
                message: 'Bad Request: No valid session ID provided and not an initialize request'
              },
              id: req.body?.id || null
            });
            return;
          }
        }
        
        // Handle request with the transport
        logger.info('handleRequest: Handling request with transport', { 
          sessionId: isInitialize ? 'new' : sessionId,
          isInitialize 
        });
        await transport.handleRequest(req, res, req.body);
        
        const duration = Date.now() - startTime;
        logger.info('MCP request completed', { duration, sessionId: transport.sessionId });
        
      } catch (error) {
        logger.error('handleRequest: MCP request error:', {
          error: error instanceof Error ? error.message : error,
          errorName: error instanceof Error ? error.name : 'Unknown',
          stack: error instanceof Error ? error.stack : undefined,
          activeTransports: Object.keys(this.transports),
          requestDetails: {
            method: req.method,
            url: req.url,
            hasBody: !!req.body,
            sessionId: req.headers['mcp-session-id']
          },
          duration: Date.now() - startTime
        });
        
        if (!res.headersSent) {
          // Send sanitized error to client
          const sanitizedError = this.sanitizeErrorForClient(error);
          res.status(500).json({ 
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: sanitizedError.message,
              data: {
                code: sanitizedError.code
              }
            },
            id: req.body?.id || null
          });
        }
      }
    });
  }
  

  /**
   * Reset the session for SSE - clean up old and create new SSE transport
   */
  private async resetSessionSSE(res: express.Response): Promise<void> {
    // Clean up old session if exists
    if (this.session) {
      try {
        logger.info('Closing previous session for SSE', { sessionId: this.session.sessionId });
        await this.session.transport.close();
      } catch (error) {
        logger.warn('Error closing previous session:', error);
      }
    }
    
    try {
      // Create new session
      logger.info('Creating new N8NDocumentationMCPServer for SSE...');
      const server = new N8NDocumentationMCPServer();
      
      // Generate cryptographically secure session ID
      const sessionId = uuidv4();
      
      logger.info('Creating SSEServerTransport...');
      const transport = new SSEServerTransport('/mcp', res);
      
      logger.info('Connecting server to SSE transport...');
      await server.connect(transport);
      
      // Note: server.connect() automatically calls transport.start(), so we don't need to call it again
      
      this.session = {
        server,
        transport,
        lastAccess: new Date(),
        sessionId,
        initialized: false,
        isSSE: true
      };
      
      logger.info('Created new SSE session successfully', { sessionId: this.session.sessionId });
    } catch (error) {
      logger.error('Failed to create SSE session:', error);
      throw error;
    }
  }
  
  /**
   * Check if current session is expired
   */
  private isExpired(): boolean {
    if (!this.session) return true;
    return Date.now() - this.session.lastAccess.getTime() > this.sessionTimeout;
  }
  
  /**
   * Start the HTTP server
   */
  async start(): Promise<void> {
    const app = express();
    
    // Create JSON parser middleware for endpoints that need it
    const jsonParser = express.json({ limit: '10mb' });
    
    // Configure trust proxy for correct IP logging behind reverse proxies
    const trustProxy = process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : 0;
    if (trustProxy > 0) {
      app.set('trust proxy', trustProxy);
      logger.info(`Trust proxy enabled with ${trustProxy} hop(s)`);
    }
    
    // DON'T use any body parser globally - StreamableHTTPServerTransport needs raw stream
    // Only use JSON parser for specific endpoints that need it
    
    // Security headers
    app.use((req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      next();
    });
    
    // CORS configuration
    app.use((req, res, next) => {
      const allowedOrigin = process.env.CORS_ORIGIN || '*';
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Mcp-Session-Id');
      res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
      res.setHeader('Access-Control-Max-Age', '86400');
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
      }
      next();
    });
    
    // Request logging middleware
    app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('user-agent'),
        contentLength: req.get('content-length')
      });
      next();
    });
    
    // Root endpoint with API information
    app.get('/', (req, res) => {
      const port = parseInt(process.env.PORT || '3000');
      const host = process.env.HOST || '0.0.0.0';
      const baseUrl = detectBaseUrl(req, host, port);
      const endpoints = formatEndpointUrls(baseUrl);
      
      res.json({
        name: 'n8n Documentation MCP Server',
        version: PROJECT_VERSION,
        description: 'Model Context Protocol server providing comprehensive n8n node documentation and workflow management',
        endpoints: {
          health: {
            url: endpoints.health,
            method: 'GET',
            description: 'Health check and status information'
          },
          mcp: {
            url: endpoints.mcp,
            method: 'GET/POST',
            description: 'MCP endpoint - GET for info, POST for JSON-RPC'
          }
        },
        authentication: {
          type: 'Bearer Token',
          header: 'Authorization: Bearer <token>',
          required_for: ['POST /mcp']
        },
        documentation: 'https://github.com/czlonkowski/n8n-mcp'
      });
    });

    // Health check endpoint (no body parsing needed for GET)
    app.get('/health', (req, res) => {
      const activeTransports = Object.keys(this.transports);
      const activeServers = Object.keys(this.servers);
      const sessionMetrics = this.getSessionMetrics();
      const isProduction = process.env.NODE_ENV === 'production';
      const isDefaultToken = this.authToken === 'REPLACE_THIS_AUTH_TOKEN_32_CHARS_MIN_abcdefgh';
      
      res.json({ 
        status: 'ok', 
        mode: 'sdk-pattern-transports',
        version: PROJECT_VERSION,
        environment: process.env.NODE_ENV || 'development',
        uptime: Math.floor(process.uptime()),
        sessions: {
          active: sessionMetrics.activeSessions,
          total: sessionMetrics.totalSessions,
          expired: sessionMetrics.expiredSessions,
          max: MAX_SESSIONS,
          usage: `${sessionMetrics.activeSessions}/${MAX_SESSIONS}`,
          sessionIds: activeTransports
        },
        security: {
          production: isProduction,
          defaultToken: isDefaultToken,
          tokenLength: this.authToken?.length || 0
        },
        activeTransports: activeTransports.length, // Legacy field
        activeServers: activeServers.length, // Legacy field
        legacySessionActive: !!this.session, // For SSE compatibility
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          unit: 'MB'
        },
        timestamp: new Date().toISOString()
      });
    });
    
    // Test endpoint for manual testing without auth
    app.post('/mcp/test', jsonParser, async (req: express.Request, res: express.Response): Promise<void> => {
      logger.info('TEST ENDPOINT: Manual test request received', {
        method: req.method,
        headers: req.headers,
        body: req.body,
        bodyType: typeof req.body,
        bodyContent: req.body ? JSON.stringify(req.body, null, 2) : 'undefined'
      });
      
      // Negotiate protocol version for test endpoint
      const negotiationResult = negotiateProtocolVersion(
        undefined, // no client version in test
        undefined, // no client info
        req.get('user-agent'),
        req.headers
      );
      
      logProtocolNegotiation(negotiationResult, logger, 'TEST_ENDPOINT');
      
      // Test what a basic MCP initialize request should look like
      const testResponse = {
        jsonrpc: '2.0',
        id: req.body?.id || 1,
        result: {
          protocolVersion: negotiationResult.version,
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'n8n-mcp',
            version: PROJECT_VERSION
          }
        }
      };
      
      logger.info('TEST ENDPOINT: Sending test response', {
        response: testResponse
      });
      
      res.json(testResponse);
    });

    // MCP information endpoint (no auth required for discovery) and SSE support
    app.get('/mcp', async (req, res) => {
      // Handle StreamableHTTP transport requests with new pattern
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (sessionId && this.transports[sessionId]) {
        // Let the StreamableHTTPServerTransport handle the GET request
        try {
          await this.transports[sessionId].handleRequest(req, res, undefined);
          return;
        } catch (error) {
          logger.error('StreamableHTTP GET request failed:', error);
          // Fall through to standard response
        }
      }
      
      // Check Accept header for text/event-stream (SSE support)
      const accept = req.headers.accept;
      if (accept && accept.includes('text/event-stream')) {
        logger.info('SSE stream request received - establishing SSE connection');
        
        try {
          // Create or reset session for SSE
          await this.resetSessionSSE(res);
          logger.info('SSE connection established successfully');
        } catch (error) {
          logger.error('Failed to establish SSE connection:', error);
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Failed to establish SSE connection'
            },
            id: null
          });
        }
        return;
      }

      // In n8n mode, return protocol version and server info
      if (process.env.N8N_MODE === 'true') {
        // Negotiate protocol version for n8n mode
        const negotiationResult = negotiateProtocolVersion(
          undefined, // no client version in GET request
          undefined, // no client info
          req.get('user-agent'),
          req.headers
        );
        
        logProtocolNegotiation(negotiationResult, logger, 'N8N_MODE_GET');
        
        res.json({
          protocolVersion: negotiationResult.version,
          serverInfo: {
            name: 'n8n-mcp',
            version: PROJECT_VERSION,
            capabilities: {
              tools: {}
            }
          }
        });
        return;
      }
      
      // Standard response for non-n8n mode
      res.json({
        description: 'n8n Documentation MCP Server',
        version: PROJECT_VERSION,
        endpoints: {
          mcp: {
            method: 'POST',
            path: '/mcp',
            description: 'Main MCP JSON-RPC endpoint',
            authentication: 'Bearer token required'
          },
          health: {
            method: 'GET',
            path: '/health',
            description: 'Health check endpoint',
            authentication: 'None'
          },
          root: {
            method: 'GET',
            path: '/',
            description: 'API information',
            authentication: 'None'
          }
        },
        documentation: 'https://github.com/czlonkowski/n8n-mcp'
      });
    });

    // Session termination endpoint
    app.delete('/mcp', async (req: express.Request, res: express.Response): Promise<void> => {
      const mcpSessionId = req.headers['mcp-session-id'] as string;
      
      if (!mcpSessionId) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32602,
            message: 'Mcp-Session-Id header is required'
          },
          id: null
        });
        return;
      }
      
      // Validate session ID format
      if (!this.isValidSessionId(mcpSessionId)) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32602,
            message: 'Invalid session ID format'
          },
          id: null
        });
        return;
      }
      
      // Check if session exists in new transport map
      if (this.transports[mcpSessionId]) {
        logger.info('Terminating session via DELETE request', { sessionId: mcpSessionId });
        try {
          await this.removeSession(mcpSessionId, 'manual_termination');
          res.status(204).send(); // No content
        } catch (error) {
          logger.error('Error terminating session:', error);
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Error terminating session'
            },
            id: null
          });
        }
      } else {
        res.status(404).json({
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'Session not found'
          },
          id: null
        });
      }
    });


    // SECURITY: Rate limiting for authentication endpoint
    // Prevents brute force attacks and DoS
    // See: https://github.com/czlonkowski/n8n-mcp/issues/265 (HIGH-02)
    const authLimiter = rateLimit({
      windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW || '900000'), // 15 minutes
      max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '20'), // 20 authentication attempts per IP
      message: {
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Too many authentication attempts. Please try again later.'
        },
        id: null
      },
      standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
      legacyHeaders: false, // Disable `X-RateLimit-*` headers
      handler: (req, res) => {
        logger.warn('Rate limit exceeded', {
          ip: req.ip,
          userAgent: req.get('user-agent'),
          event: 'rate_limit'
        });
        res.status(429).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Too many authentication attempts'
          },
          id: null
        });
      }
    });

    // Main MCP endpoint with authentication and rate limiting
    app.post('/mcp', authLimiter, jsonParser, async (req: express.Request, res: express.Response): Promise<void> => {
      // Log comprehensive debug info about the request
      logger.info('POST /mcp request received - DETAILED DEBUG', {
        headers: req.headers,
        readable: req.readable,
        readableEnded: req.readableEnded,
        complete: req.complete,
        bodyType: typeof req.body,
        bodyContent: req.body ? JSON.stringify(req.body, null, 2) : 'undefined',
        contentLength: req.get('content-length'),
        contentType: req.get('content-type'),
        userAgent: req.get('user-agent'),
        ip: req.ip,
        method: req.method,
        url: req.url,
        originalUrl: req.originalUrl
      });
      
      // Handle connection close to immediately clean up sessions
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      // Only add event listener if the request object supports it (not in test mocks)
      if (typeof req.on === 'function') {
        const closeHandler = () => {
          if (!res.headersSent && sessionId) {
            logger.info('Connection closed before response sent', { sessionId });
            // Schedule immediate cleanup if connection closes unexpectedly
            setImmediate(() => {
              if (this.sessionMetadata[sessionId]) {
                const metadata = this.sessionMetadata[sessionId];
                const timeSinceAccess = Date.now() - metadata.lastAccess.getTime();
                // Only remove if it's been inactive for a bit to avoid race conditions
                if (timeSinceAccess > 60000) { // 1 minute
                  this.removeSession(sessionId, 'connection_closed').catch(err => {
                    logger.error('Error during connection close cleanup', { error: err });
                  });
                }
              }
            });
          }
        };
        
        req.on('close', closeHandler);
        
        // Clean up event listener when response ends to prevent memory leaks
        res.on('finish', () => {
          req.removeListener('close', closeHandler);
        });
      }
      
      // Enhanced authentication check with specific logging
      const authHeader = req.headers.authorization;
      
      // Check if Authorization header is missing
      if (!authHeader) {
        logger.warn('Authentication failed: Missing Authorization header', { 
          ip: req.ip,
          userAgent: req.get('user-agent'),
          reason: 'no_auth_header'
        });
        res.status(401).json({ 
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'Unauthorized'
          },
          id: null
        });
        return;
      }
      
      // Check if Authorization header has Bearer prefix
      if (!authHeader.startsWith('Bearer ')) {
        logger.warn('Authentication failed: Invalid Authorization header format (expected Bearer token)', { 
          ip: req.ip,
          userAgent: req.get('user-agent'),
          reason: 'invalid_auth_format',
          headerPrefix: authHeader.substring(0, Math.min(authHeader.length, 10)) + '...'  // Log first 10 chars for debugging
        });
        res.status(401).json({ 
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'Unauthorized'
          },
          id: null
        });
        return;
      }
      
      // Extract token and trim whitespace
      const token = authHeader.slice(7).trim();

      // SECURITY: Use timing-safe comparison to prevent timing attacks
      // See: https://github.com/czlonkowski/n8n-mcp/issues/265 (CRITICAL-02)
      const isValidToken = this.authToken &&
        AuthManager.timingSafeCompare(token, this.authToken);

      if (!isValidToken) {
        logger.warn('Authentication failed: Invalid token', {
          ip: req.ip,
          userAgent: req.get('user-agent'),
          reason: 'invalid_token'
        });
        res.status(401).json({
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'Unauthorized'
          },
          id: null
        });
        return;
      }
      
      // Handle request with single session
      logger.info('Authentication successful - proceeding to handleRequest', {
        hasSession: !!this.session,
        sessionType: this.session?.isSSE ? 'SSE' : 'StreamableHTTP',
        sessionInitialized: this.session?.initialized
      });

      // Extract instance context from headers if present (for multi-tenant support)
      const instanceContext: InstanceContext | undefined = (() => {
        // Use type-safe header extraction
        const headers = extractMultiTenantHeaders(req);
        const hasUrl = headers['x-n8n-url'];
        const hasKey = headers['x-n8n-key'];

        if (!hasUrl && !hasKey) return undefined;

        // Create context with proper type handling
        const context: InstanceContext = {
          n8nApiUrl: hasUrl || undefined,
          n8nApiKey: hasKey || undefined,
          instanceId: headers['x-instance-id'] || undefined,
          sessionId: headers['x-session-id'] || undefined
        };

        // Add metadata if available
        if (req.headers['user-agent'] || req.ip) {
          context.metadata = {
            userAgent: req.headers['user-agent'] as string | undefined,
            ip: req.ip
          };
        }

        // Validate the context
        const validation = validateInstanceContext(context);
        if (!validation.valid) {
          logger.warn('Invalid instance context from headers', {
            errors: validation.errors,
            hasUrl: !!hasUrl,
            hasKey: !!hasKey
          });
          return undefined;
        }

        return context;
      })();

      // Log context extraction for debugging (only if context exists)
      if (instanceContext) {
        // Use sanitized logging for security
        logger.debug('Instance context extracted from headers', {
          hasUrl: !!instanceContext.n8nApiUrl,
          hasKey: !!instanceContext.n8nApiKey,
          instanceId: instanceContext.instanceId ? instanceContext.instanceId.substring(0, 8) + '...' : undefined,
          sessionId: instanceContext.sessionId ? instanceContext.sessionId.substring(0, 8) + '...' : undefined,
          urlDomain: instanceContext.n8nApiUrl ? new URL(instanceContext.n8nApiUrl).hostname : undefined
        });
      }

      await this.handleRequest(req, res, instanceContext);
      
      logger.info('POST /mcp request completed - checking response status', {
        responseHeadersSent: res.headersSent,
        responseStatusCode: res.statusCode,
        responseFinished: res.finished
      });
    });
    
    // 404 handler
    app.use((req, res) => {
      res.status(404).json({ 
        error: 'Not found',
        message: `Cannot ${req.method} ${req.path}`
      });
    });
    
    // Error handler
    app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('Express error handler:', err);
      
      if (!res.headersSent) {
        res.status(500).json({ 
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
            data: process.env.NODE_ENV === 'development' ? err.message : undefined
          },
          id: null
        });
      }
    });
    
    const port = parseInt(process.env.PORT || '3000');
    const host = process.env.HOST || '0.0.0.0';
    
    this.expressServer = app.listen(port, host, () => {
      const isProduction = process.env.NODE_ENV === 'production';
      const isDefaultToken = this.authToken === 'REPLACE_THIS_AUTH_TOKEN_32_CHARS_MIN_abcdefgh';
      
      logger.info(`n8n MCP Single-Session HTTP Server started`, { 
        port, 
        host, 
        environment: process.env.NODE_ENV || 'development',
        maxSessions: MAX_SESSIONS,
        sessionTimeout: this.sessionTimeout / 1000 / 60,
        production: isProduction,
        defaultToken: isDefaultToken
      });
      
      // Detect the base URL using our utility
      const baseUrl = getStartupBaseUrl(host, port);
      const endpoints = formatEndpointUrls(baseUrl);
      
      console.log(`n8n MCP Single-Session HTTP Server running on ${host}:${port}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`Session Limits: ${MAX_SESSIONS} max sessions, ${this.sessionTimeout / 1000 / 60}min timeout`);
      console.log(`Health check: ${endpoints.health}`);
      console.log(`MCP endpoint: ${endpoints.mcp}`);
      
      if (isProduction) {
        console.log('🔒 Running in PRODUCTION mode - enhanced security enabled');
      } else {
        console.log('🛠️ Running in DEVELOPMENT mode');
      }
      
      console.log('\nPress Ctrl+C to stop the server');
      
      // Start periodic warning timer if using default token
      if (isDefaultToken && !isProduction) {
        setInterval(() => {
          logger.warn('⚠️ Still using default AUTH_TOKEN - security risk!');
          if (process.env.MCP_MODE === 'http') {
            console.warn('⚠️ REMINDER: Still using default AUTH_TOKEN - please change it!');
          }
        }, 300000); // Every 5 minutes
      }
      
      if (process.env.BASE_URL || process.env.PUBLIC_URL) {
        console.log(`\nPublic URL configured: ${baseUrl}`);
      } else if (process.env.TRUST_PROXY && Number(process.env.TRUST_PROXY) > 0) {
        console.log(`\nNote: TRUST_PROXY is enabled. URLs will be auto-detected from proxy headers.`);
      }
    });
    
    // Handle server errors
    this.expressServer.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${port} is already in use`);
        console.error(`ERROR: Port ${port} is already in use`);
        process.exit(1);
      } else {
        logger.error('Server error:', error);
        console.error('Server error:', error);
        process.exit(1);
      }
    });
  }
  
  /**
   * Graceful shutdown
   * CRITICAL: Sets isShuttingDown flag to prevent recursive cleanup
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down Single-Session HTTP server...');

    // CRITICAL: Set shutdown flag FIRST to prevent recursive event handlers
    // This stops transport.onclose/onerror from triggering removeSession during cleanup
    this.isShuttingDown = true;
    logger.info('Shutdown flag set - recursive cleanup prevention enabled');

    // Stop session cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      logger.info('Session cleanup timer stopped');
    }

    // Close all active transports (SDK pattern) with error isolation
    const sessionIds = Object.keys(this.transports);
    logger.info(`Closing ${sessionIds.length} active sessions`);

    let successCount = 0;
    let failureCount = 0;

    for (const sessionId of sessionIds) {
      try {
        logger.info(`Closing transport for session ${sessionId}`);
        await this.removeSession(sessionId, 'server_shutdown');
        successCount++;
      } catch (error) {
        failureCount++;
        logger.warn(`Error closing transport for session ${sessionId}:`, {
          error: error instanceof Error ? error.message : String(error)
        });
        // Continue with next session - shutdown must complete
      }
    }

    if (sessionIds.length > 0) {
      logger.info('Session shutdown completed', {
        total: sessionIds.length,
        successful: successCount,
        failed: failureCount
      });
    }
    
    // Clean up legacy session (for SSE compatibility)
    if (this.session) {
      try {
        await this.session.transport.close();
        logger.info('Legacy session closed');
      } catch (error) {
        logger.warn('Error closing legacy session:', error);
      }
      this.session = null;
    }
    
    // Close Express server
    if (this.expressServer) {
      await new Promise<void>((resolve) => {
        this.expressServer.close(() => {
          logger.info('HTTP server closed');
          resolve();
        });
      });
    }
    
    logger.info('Single-Session HTTP server shutdown completed');
  }
  
  /**
   * Get current session info (for testing/debugging)
   */
  getSessionInfo(): {
    active: boolean;
    sessionId?: string;
    age?: number;
    sessions?: {
      total: number;
      active: number;
      expired: number;
      max: number;
      sessionIds: string[];
    };
  } {
    const metrics = this.getSessionMetrics();

    // Legacy SSE session info
    if (!this.session) {
      return {
        active: false,
        sessions: {
          total: metrics.totalSessions,
          active: metrics.activeSessions,
          expired: metrics.expiredSessions,
          max: MAX_SESSIONS,
          sessionIds: Object.keys(this.transports)
        }
      };
    }

    return {
      active: true,
      sessionId: this.session.sessionId,
      age: Date.now() - this.session.lastAccess.getTime(),
      sessions: {
        total: metrics.totalSessions,
        active: metrics.activeSessions,
        expired: metrics.expiredSessions,
        max: MAX_SESSIONS,
        sessionIds: Object.keys(this.transports)
      }
    };
  }

  /**
   * Get all active session IDs (Phase 2 - REQ-5)
   * Useful for periodic backup to database
   *
   * @returns Array of active session IDs
   * @since 2.19.0
   *
   * @example
   * ```typescript
   * const sessionIds = server.getActiveSessions();
   * console.log(`Active sessions: ${sessionIds.length}`);
   * ```
   */
  getActiveSessions(): string[] {
    // Use sessionMetadata instead of transports for immediate synchronous access
    // Metadata is stored immediately, while transports are created asynchronously
    return Object.keys(this.sessionMetadata);
  }

  /**
   * Get session state for persistence (Phase 2 - REQ-5)
   * Returns null if session doesn't exist
   *
   * @param sessionId - The session ID to retrieve state for
   * @returns Session state or null if not found
   * @since 2.19.0
   *
   * @example
   * ```typescript
   * const state = server.getSessionState('session-123');
   * if (state) {
   *   await database.saveSession(state);
   * }
   * ```
   */
  getSessionState(sessionId: string): SessionState | null {
    // Check if session metadata exists (source of truth for session existence)
    const metadata = this.sessionMetadata[sessionId];
    if (!metadata) {
      return null;
    }

    const instanceContext = this.sessionContexts[sessionId];

    // Calculate expiration time
    const expiresAt = new Date(metadata.lastAccess.getTime() + this.sessionTimeout);

    return {
      sessionId,
      instanceContext: instanceContext || {
        n8nApiUrl: process.env.N8N_API_URL,
        n8nApiKey: process.env.N8N_API_KEY,
        instanceId: process.env.N8N_INSTANCE_ID
      },
      createdAt: metadata.createdAt,
      lastAccess: metadata.lastAccess,
      expiresAt,
      metadata: instanceContext?.metadata
    };
  }

  /**
   * Get all session states (Phase 2 - REQ-5)
   * Useful for bulk backup operations
   *
   * @returns Array of all session states
   * @since 2.19.0
   *
   * @example
   * ```typescript
   * // Periodic backup every 5 minutes
   * setInterval(async () => {
   *   const states = server.getAllSessionStates();
   *   for (const state of states) {
   *     await database.upsertSession(state);
   *   }
   * }, 300000);
   * ```
   */
  getAllSessionStates(): SessionState[] {
    const sessionIds = this.getActiveSessions();
    const states: SessionState[] = [];

    for (const sessionId of sessionIds) {
      const state = this.getSessionState(sessionId);
      if (state) {
        states.push(state);
      }
    }

    return states;
  }

  /**
   * Manually restore a session (Phase 2 - REQ-5)
   * Creates a session with the given ID and instance context
   * Idempotent - returns true even if session already exists
   *
   * @param sessionId - The session ID to restore
   * @param instanceContext - Instance configuration for the session
   * @returns true if session was created or already exists, false on validation error
   * @since 2.19.0
   *
   * @example
   * ```typescript
   * // Restore session from database
   * const restored = server.manuallyRestoreSession(
   *   'session-123',
   *   { n8nApiUrl: '...', n8nApiKey: '...', instanceId: 'user-456' }
   * );
   * console.log(`Session restored: ${restored}`);
   * ```
   */
  manuallyRestoreSession(sessionId: string, instanceContext: InstanceContext): boolean {
    try {
      // Validate session ID format
      if (!this.isValidSessionId(sessionId)) {
        logger.error('Invalid session ID format in manual restoration', { sessionId });
        return false;
      }

      // Validate instance context
      const validation = validateInstanceContext(instanceContext);
      if (!validation.valid) {
        logger.error('Invalid instance context in manual restoration', {
          sessionId,
          errors: validation.errors
        });
        return false;
      }

      // CRITICAL: Store metadata immediately for synchronous access
      // This ensures getActiveSessions() and deleteSession() work immediately after calling this method
      // The session is "registered" even though the connection happens asynchronously
      this.sessionMetadata[sessionId] = {
        lastAccess: new Date(),
        createdAt: new Date()
      };
      this.sessionContexts[sessionId] = instanceContext;

      // Create session asynchronously (connection happens in background)
      // Don't wait for connection - this is for public API, connection happens async
      // Fire-and-forget: start the async operation but don't block
      const creationResult = this.createSession(instanceContext, sessionId, false);
      Promise.resolve(creationResult).catch(error => {
        logger.error('Async session creation failed in manual restoration', {
          sessionId,
          error: error instanceof Error ? error.message : String(error)
        });
        // Clean up metadata on error
        delete this.sessionMetadata[sessionId];
        delete this.sessionContexts[sessionId];
      });

      logger.info('Session manually restored', {
        sessionId,
        instanceId: instanceContext.instanceId
      });

      return true;
    } catch (error) {
      logger.error('Failed to manually restore session', {
        sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Manually delete a session (Phase 2 - REQ-5)
   * Removes the session and cleans up all resources
   *
   * @param sessionId - The session ID to delete
   * @returns true if session was deleted, false if session didn't exist
   * @since 2.19.0
   *
   * @example
   * ```typescript
   * // Delete expired sessions
   * const deleted = server.manuallyDeleteSession('session-123');
   * if (deleted) {
   *   console.log('Session deleted successfully');
   * }
   * ```
   */
  manuallyDeleteSession(sessionId: string): boolean {
    // Check if session exists (check metadata, not transport)
    // Metadata is stored immediately when session is created/restored
    // Transport is created asynchronously, so it might not exist yet
    if (!this.sessionMetadata[sessionId]) {
      logger.debug('Session not found for manual deletion', { sessionId });
      return false;
    }

    // CRITICAL: Delete session data synchronously for unit tests
    // Close transport asynchronously in background, but remove from maps immediately
    try {
      // Close transport asynchronously (non-blocking) if it exists
      if (this.transports[sessionId]) {
        this.transports[sessionId].close().catch(error => {
          logger.warn('Error closing transport during manual deletion', {
            sessionId,
            error: error instanceof Error ? error.message : String(error)
          });
        });
      }

      // Phase 3: Emit onSessionDeleted event BEFORE removal (REQ-4)
      // Fire-and-forget: don't await or block deletion
      this.emitEvent('onSessionDeleted', sessionId).catch(err => {
        logger.error('Failed to emit onSessionDeleted event (non-blocking)', {
          sessionId,
          error: err instanceof Error ? err.message : String(err)
        });
      });

      // Remove session data immediately (synchronous)
      delete this.transports[sessionId];
      delete this.servers[sessionId];
      delete this.sessionMetadata[sessionId];
      delete this.sessionContexts[sessionId];

      logger.info('Session manually deleted', { sessionId });
      return true;
    } catch (error) {
      logger.error('Error during manual session deletion', {
        sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }
}

// Start if called directly
if (require.main === module) {
  const server = new SingleSessionHTTPServer();
  
  // Graceful shutdown handlers
  const shutdown = async () => {
    await server.shutdown();
    process.exit(0);
  };
  
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  
  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    console.error('Uncaught exception:', error);
    shutdown();
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection:', reason);
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    shutdown();
  });
  
  // Start server
  server.start().catch(error => {
    logger.error('Failed to start Single-Session HTTP server:', error);
    console.error('Failed to start Single-Session HTTP server:', error);
    process.exit(1);
  });
}
