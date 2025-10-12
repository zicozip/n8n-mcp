/**
 * Session Restoration Types
 *
 * Defines types for session persistence and restoration functionality.
 * Enables multi-tenant backends to restore sessions after container restarts.
 *
 * @since 2.19.0
 */

import { InstanceContext } from './instance-context';

/**
 * Session restoration hook callback
 *
 * Called when a client tries to use an unknown session ID.
 * The backend can load session state from external storage (database, Redis, etc.)
 * and return the instance context to recreate the session.
 *
 * @param sessionId - The session ID that was not found in memory
 * @returns Instance context to restore the session, or null if session should not be restored
 *
 * @example
 * ```typescript
 * const engine = new N8NMCPEngine({
 *   onSessionNotFound: async (sessionId) => {
 *     // Load from database
 *     const session = await db.loadSession(sessionId);
 *     if (!session || session.expired) return null;
 *     return session.instanceContext;
 *   }
 * });
 * ```
 */
export type SessionRestoreHook = (sessionId: string) => Promise<InstanceContext | null>;

/**
 * Session restoration configuration options
 *
 * @since 2.19.0
 */
export interface SessionRestorationOptions {
  /**
   * Session timeout in milliseconds
   * After this period of inactivity, sessions are expired and cleaned up
   * @default 1800000 (30 minutes)
   */
  sessionTimeout?: number;

  /**
   * Maximum time to wait for session restoration hook to complete
   * If the hook takes longer than this, the request will fail with 408 Request Timeout
   * @default 5000 (5 seconds)
   */
  sessionRestorationTimeout?: number;

  /**
   * Hook called when a client tries to use an unknown session ID
   * Return instance context to restore the session, or null to reject
   *
   * @param sessionId - The session ID that was not found
   * @returns Instance context for restoration, or null
   *
   * Error handling:
   * - Hook throws exception → 500 Internal Server Error
   * - Hook times out → 408 Request Timeout
   * - Hook returns null → 400 Bad Request (session not found)
   * - Hook returns invalid context → 400 Bad Request (invalid context)
   */
  onSessionNotFound?: SessionRestoreHook;

  /**
   * Number of retry attempts for failed session restoration
   *
   * When the restoration hook throws an error, the system will retry
   * up to this many times with a delay between attempts.
   *
   * Timeout errors are NOT retried (already took too long).
   *
   * Note: The overall timeout (sessionRestorationTimeout) applies to
   * ALL retry attempts combined, not per attempt.
   *
   * @default 0 (no retries)
   * @example
   * ```typescript
   * const engine = new N8NMCPEngine({
   *   onSessionNotFound: async (id) => db.loadSession(id),
   *   sessionRestorationRetries: 2, // Retry up to 2 times
   *   sessionRestorationRetryDelay: 100 // 100ms between retries
   * });
   * ```
   * @since 2.19.0
   */
  sessionRestorationRetries?: number;

  /**
   * Delay between retry attempts in milliseconds
   *
   * @default 100 (100 milliseconds)
   * @since 2.19.0
   */
  sessionRestorationRetryDelay?: number;
}

/**
 * Session state for persistence
 * Contains all information needed to restore a session after restart
 *
 * @since 2.19.0
 */
export interface SessionState {
  /**
   * Unique session identifier
   */
  sessionId: string;

  /**
   * Instance-specific configuration
   * Contains n8n API credentials and instance ID
   */
  instanceContext: InstanceContext;

  /**
   * When the session was created
   */
  createdAt: Date;

  /**
   * Last time the session was accessed
   * Used for TTL-based expiration
   */
  lastAccess: Date;

  /**
   * When the session will expire
   * Calculated from lastAccess + sessionTimeout
   */
  expiresAt: Date;

  /**
   * Optional metadata for application-specific use
   */
  metadata?: Record<string, any>;
}

/**
 * Session lifecycle event handlers
 *
 * These callbacks are called at various points in the session lifecycle.
 * All callbacks are optional and should not throw errors.
 *
 * ⚠️ Performance Note: onSessionAccessed is called on EVERY request.
 * Consider implementing throttling if you need database updates.
 *
 * @example
 * ```typescript
 * import throttle from 'lodash.throttle';
 *
 * const engine = new N8NMCPEngine({
 *   sessionEvents: {
 *     onSessionCreated: async (sessionId, context) => {
 *       await db.saveSession(sessionId, context);
 *     },
 *     onSessionAccessed: throttle(async (sessionId) => {
 *       await db.updateLastAccess(sessionId);
 *     }, 60000) // Max once per minute per session
 *   }
 * });
 * ```
 *
 * @since 2.19.0
 */
export interface SessionLifecycleEvents {
  /**
   * Called when a new session is created (not restored)
   *
   * Use cases:
   * - Save session to database for persistence
   * - Track session creation metrics
   * - Initialize session-specific resources
   *
   * @param sessionId - The newly created session ID
   * @param instanceContext - The instance context for this session
   */
  onSessionCreated?: (sessionId: string, instanceContext: InstanceContext) => void | Promise<void>;

  /**
   * Called when a session is restored from external storage
   *
   * Use cases:
   * - Track session restoration metrics
   * - Log successful recovery after restart
   * - Update database restoration timestamp
   *
   * @param sessionId - The restored session ID
   * @param instanceContext - The restored instance context
   */
  onSessionRestored?: (sessionId: string, instanceContext: InstanceContext) => void | Promise<void>;

  /**
   * Called on EVERY request that uses an existing session
   *
   * ⚠️ HIGH FREQUENCY: This event fires for every MCP tool call.
   * For a busy session, this could be 100+ calls per minute.
   *
   * Recommended: Implement throttling if you need database updates
   *
   * Use cases:
   * - Update session last_access timestamp (throttled)
   * - Track session activity metrics
   * - Extend session TTL in database
   *
   * @param sessionId - The session ID that was accessed
   */
  onSessionAccessed?: (sessionId: string) => void | Promise<void>;

  /**
   * Called when a session expires due to inactivity
   *
   * Called during cleanup cycle (every 5 minutes) BEFORE session removal.
   * This allows you to perform cleanup operations before the session is gone.
   *
   * Use cases:
   * - Delete session from database
   * - Log session expiration metrics
   * - Cleanup session-specific resources
   *
   * @param sessionId - The session ID that expired
   */
  onSessionExpired?: (sessionId: string) => void | Promise<void>;

  /**
   * Called when a session is manually deleted
   *
   * Use cases:
   * - Delete session from database
   * - Cascade delete related data
   * - Log manual session termination
   *
   * @param sessionId - The session ID that was deleted
   */
  onSessionDeleted?: (sessionId: string) => void | Promise<void>;
}
