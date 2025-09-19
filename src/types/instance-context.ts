/**
 * Instance Context for flexible configuration support
 *
 * Allows the n8n-mcp engine to accept instance-specific configuration
 * at runtime, enabling flexible deployment scenarios while maintaining
 * backward compatibility with environment-based configuration.
 */

export interface InstanceContext {
  /**
   * Instance-specific n8n API configuration
   * When provided, these override environment variables
   */
  n8nApiUrl?: string;
  n8nApiKey?: string;
  n8nApiTimeout?: number;
  n8nApiMaxRetries?: number;

  /**
   * Instance identification
   * Used for session management and logging
   */
  instanceId?: string;
  sessionId?: string;

  /**
   * Extensible metadata for future use
   * Allows passing additional configuration without interface changes
   */
  metadata?: Record<string, any>;
}

/**
 * Validate URL format
 */
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Only allow http and https protocols
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validate API key format (basic check for non-empty string)
 */
function isValidApiKey(key: string): boolean {
  // API key should be non-empty and not contain obvious placeholder values
  return key.length > 0 &&
         !key.toLowerCase().includes('your_api_key') &&
         !key.toLowerCase().includes('placeholder') &&
         !key.toLowerCase().includes('example');
}

/**
 * Type guard to check if an object is an InstanceContext
 */
export function isInstanceContext(obj: any): obj is InstanceContext {
  if (!obj || typeof obj !== 'object') return false;

  // Check for known properties with validation
  const hasValidUrl = obj.n8nApiUrl === undefined ||
    (typeof obj.n8nApiUrl === 'string' && isValidUrl(obj.n8nApiUrl));

  const hasValidKey = obj.n8nApiKey === undefined ||
    (typeof obj.n8nApiKey === 'string' && isValidApiKey(obj.n8nApiKey));

  const hasValidTimeout = obj.n8nApiTimeout === undefined ||
    (typeof obj.n8nApiTimeout === 'number' && obj.n8nApiTimeout > 0);

  const hasValidRetries = obj.n8nApiMaxRetries === undefined ||
    (typeof obj.n8nApiMaxRetries === 'number' && obj.n8nApiMaxRetries >= 0);

  const hasValidInstanceId = obj.instanceId === undefined || typeof obj.instanceId === 'string';
  const hasValidSessionId = obj.sessionId === undefined || typeof obj.sessionId === 'string';
  const hasValidMetadata = obj.metadata === undefined ||
    (typeof obj.metadata === 'object' && obj.metadata !== null);

  return hasValidUrl && hasValidKey && hasValidTimeout && hasValidRetries &&
         hasValidInstanceId && hasValidSessionId && hasValidMetadata;
}

/**
 * Validate and sanitize InstanceContext
 */
export function validateInstanceContext(context: InstanceContext): {
  valid: boolean;
  errors?: string[]
} {
  const errors: string[] = [];

  // Validate URL if provided (even empty string should be validated)
  if (context.n8nApiUrl !== undefined) {
    if (context.n8nApiUrl === '' || !isValidUrl(context.n8nApiUrl)) {
      errors.push('Invalid n8nApiUrl format');
    }
  }

  // Validate API key if provided
  if (context.n8nApiKey !== undefined) {
    if (context.n8nApiKey === '' || !isValidApiKey(context.n8nApiKey)) {
      errors.push('Invalid n8nApiKey format');
    }
  }

  // Validate timeout
  if (context.n8nApiTimeout !== undefined) {
    if (typeof context.n8nApiTimeout !== 'number' ||
        context.n8nApiTimeout <= 0 ||
        !isFinite(context.n8nApiTimeout)) {
      errors.push('n8nApiTimeout must be a positive number');
    }
  }

  // Validate retries
  if (context.n8nApiMaxRetries !== undefined) {
    if (typeof context.n8nApiMaxRetries !== 'number' ||
        context.n8nApiMaxRetries < 0 ||
        !isFinite(context.n8nApiMaxRetries)) {
      errors.push('n8nApiMaxRetries must be a non-negative number');
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined
  };
}