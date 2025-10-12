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
