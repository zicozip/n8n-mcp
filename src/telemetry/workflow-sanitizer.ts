/**
 * Workflow Sanitizer
 * Removes sensitive data from workflows before telemetry storage
 */

import { createHash } from 'crypto';

interface WorkflowNode {
  id: string;
  name: string;
  type: string;
  position: [number, number];
  parameters: any;
  credentials?: any;
  disabled?: boolean;
  typeVersion?: number;
}

interface SanitizedWorkflow {
  nodes: WorkflowNode[];
  connections: any;
  nodeCount: number;
  nodeTypes: string[];
  hasTrigger: boolean;
  hasWebhook: boolean;
  complexity: 'simple' | 'medium' | 'complex';
  workflowHash: string;
}

export class WorkflowSanitizer {
  private static readonly SENSITIVE_PATTERNS = [
    // Webhook URLs (replace with placeholder but keep structure) - MUST BE FIRST
    /https?:\/\/[^\s/]+\/webhook\/[^\s]+/g,
    /https?:\/\/[^\s/]+\/hook\/[^\s]+/g,

    // API keys and tokens
    /sk-[a-zA-Z0-9]{16,}/g, // OpenAI keys
    /Bearer\s+[^\s]+/gi,    // Bearer tokens
    /[a-zA-Z0-9_-]{20,}/g,  // Long alphanumeric strings (API keys) - reduced threshold
    /token['":\s]+[^,}]+/gi, // Token fields
    /apikey['":\s]+[^,}]+/gi, // API key fields
    /api_key['":\s]+[^,}]+/gi,
    /secret['":\s]+[^,}]+/gi,
    /password['":\s]+[^,}]+/gi,
    /credential['":\s]+[^,}]+/gi,

    // URLs with authentication
    /https?:\/\/[^:]+:[^@]+@[^\s/]+/g, // URLs with auth
    /wss?:\/\/[^:]+:[^@]+@[^\s/]+/g,

    // Email addresses (optional - uncomment if needed)
    // /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  ];

  private static readonly SENSITIVE_FIELDS = [
    'apiKey',
    'api_key',
    'token',
    'secret',
    'password',
    'credential',
    'auth',
    'authorization',
    'webhook',
    'webhookUrl',
    'url',
    'endpoint',
    'host',
    'server',
    'database',
    'connectionString',
    'privateKey',
    'publicKey',
    'certificate',
  ];

  /**
   * Sanitize a complete workflow
   */
  static sanitizeWorkflow(workflow: any): SanitizedWorkflow {
    // Create a deep copy to avoid modifying original
    const sanitized = JSON.parse(JSON.stringify(workflow));

    // Sanitize nodes
    if (sanitized.nodes && Array.isArray(sanitized.nodes)) {
      sanitized.nodes = sanitized.nodes.map((node: WorkflowNode) =>
        this.sanitizeNode(node)
      );
    }

    // Sanitize connections (keep structure only)
    if (sanitized.connections) {
      sanitized.connections = this.sanitizeConnections(sanitized.connections);
    }

    // Remove other potentially sensitive data
    delete sanitized.settings?.errorWorkflow;
    delete sanitized.staticData;
    delete sanitized.pinData;
    delete sanitized.credentials;
    delete sanitized.sharedWorkflows;
    delete sanitized.ownedBy;
    delete sanitized.createdBy;
    delete sanitized.updatedBy;

    // Calculate metrics
    const nodeTypes = sanitized.nodes?.map((n: WorkflowNode) => n.type) || [];
    const uniqueNodeTypes = [...new Set(nodeTypes)] as string[];

    const hasTrigger = nodeTypes.some((type: string) =>
      type.includes('trigger') || type.includes('webhook')
    );

    const hasWebhook = nodeTypes.some((type: string) =>
      type.includes('webhook')
    );

    // Calculate complexity
    const nodeCount = sanitized.nodes?.length || 0;
    let complexity: 'simple' | 'medium' | 'complex' = 'simple';
    if (nodeCount > 20) {
      complexity = 'complex';
    } else if (nodeCount > 10) {
      complexity = 'medium';
    }

    // Generate workflow hash (for deduplication)
    const workflowStructure = JSON.stringify({
      nodeTypes: uniqueNodeTypes.sort(),
      connections: sanitized.connections
    });
    const workflowHash = createHash('sha256')
      .update(workflowStructure)
      .digest('hex')
      .substring(0, 16);

    return {
      nodes: sanitized.nodes || [],
      connections: sanitized.connections || {},
      nodeCount,
      nodeTypes: uniqueNodeTypes,
      hasTrigger,
      hasWebhook,
      complexity,
      workflowHash
    };
  }

  /**
   * Sanitize a single node
   */
  private static sanitizeNode(node: WorkflowNode): WorkflowNode {
    const sanitized = { ...node };

    // Remove credentials entirely
    delete sanitized.credentials;

    // Sanitize parameters
    if (sanitized.parameters) {
      sanitized.parameters = this.sanitizeObject(sanitized.parameters);
    }

    return sanitized;
  }

  /**
   * Recursively sanitize an object
   */
  private static sanitizeObject(obj: any): any {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }

    const sanitized: any = {};

    for (const [key, value] of Object.entries(obj)) {
      // Check if key is sensitive
      if (this.isSensitiveField(key)) {
        sanitized[key] = '[REDACTED]';
        continue;
      }

      // Recursively sanitize nested objects
      if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeObject(value);
      }
      // Sanitize string values
      else if (typeof value === 'string') {
        sanitized[key] = this.sanitizeString(value, key);
      }
      // Keep other types as-is
      else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Sanitize string values
   */
  private static sanitizeString(value: string, fieldName: string): string {
    // First check if this is a webhook URL
    if (value.includes('/webhook/') || value.includes('/hook/')) {
      return 'https://[webhook-url]';
    }

    let sanitized = value;

    // Apply all sensitive patterns
    for (const pattern of this.SENSITIVE_PATTERNS) {
      // Skip webhook patterns - already handled above
      if (pattern.toString().includes('webhook')) {
        continue;
      }
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    }

    // Additional sanitization for specific field types
    if (fieldName.toLowerCase().includes('url') ||
        fieldName.toLowerCase().includes('endpoint')) {
      // Keep URL structure but remove domain details
      if (sanitized.startsWith('http://') || sanitized.startsWith('https://')) {
        // If value has been redacted, leave it as is
        if (sanitized.includes('[REDACTED]')) {
          return '[REDACTED]';
        }
        const urlParts = sanitized.split('/');
        if (urlParts.length > 2) {
          urlParts[2] = '[domain]';
          sanitized = urlParts.join('/');
        }
      }
    }

    return sanitized;
  }

  /**
   * Check if a field name is sensitive
   */
  private static isSensitiveField(fieldName: string): boolean {
    const lowerFieldName = fieldName.toLowerCase();
    return this.SENSITIVE_FIELDS.some(sensitive =>
      lowerFieldName.includes(sensitive.toLowerCase())
    );
  }

  /**
   * Sanitize connections (keep structure only)
   */
  private static sanitizeConnections(connections: any): any {
    if (!connections || typeof connections !== 'object') {
      return connections;
    }

    const sanitized: any = {};

    for (const [nodeId, nodeConnections] of Object.entries(connections)) {
      if (typeof nodeConnections === 'object' && nodeConnections !== null) {
        sanitized[nodeId] = {};

        for (const [connType, connArray] of Object.entries(nodeConnections as any)) {
          if (Array.isArray(connArray)) {
            sanitized[nodeId][connType] = connArray.map((conns: any) => {
              if (Array.isArray(conns)) {
                return conns.map((conn: any) => ({
                  node: conn.node,
                  type: conn.type,
                  index: conn.index
                }));
              }
              return conns;
            });
          } else {
            sanitized[nodeId][connType] = connArray;
          }
        }
      } else {
        sanitized[nodeId] = nodeConnections;
      }
    }

    return sanitized;
  }

  /**
   * Generate a hash for workflow deduplication
   */
  static generateWorkflowHash(workflow: any): string {
    const sanitized = this.sanitizeWorkflow(workflow);
    return sanitized.workflowHash;
  }
}