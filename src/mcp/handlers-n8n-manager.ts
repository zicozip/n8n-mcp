import { N8nApiClient } from '../services/n8n-api-client';
import { getN8nApiConfig, getN8nApiConfigFromContext } from '../config/n8n-api';
import {
  Workflow,
  WorkflowNode,
  WorkflowConnection,
  ExecutionStatus,
  WebhookRequest,
  McpToolResponse
} from '../types/n8n-api';
import {
  validateWorkflowStructure,
  hasWebhookTrigger,
  getWebhookUrl
} from '../services/n8n-validation';
import {
  N8nApiError,
  N8nNotFoundError,
  getUserFriendlyErrorMessage
} from '../utils/n8n-errors';
import { logger } from '../utils/logger';
import { z } from 'zod';
import { WorkflowValidator } from '../services/workflow-validator';
import { EnhancedConfigValidator } from '../services/enhanced-config-validator';
import { NodeRepository } from '../database/node-repository';
import { InstanceContext, validateInstanceContext } from '../types/instance-context';
import { WorkflowAutoFixer, AutoFixConfig } from '../services/workflow-auto-fixer';
import { ExpressionFormatValidator } from '../services/expression-format-validator';
import { handleUpdatePartialWorkflow } from './handlers-workflow-diff';
import { telemetry } from '../telemetry';
import {
  createCacheKey,
  createInstanceCache,
  CacheMutex,
  cacheMetrics,
  withRetry,
  getCacheStatistics
} from '../utils/cache-utils';

// Singleton n8n API client instance (backward compatibility)
let defaultApiClient: N8nApiClient | null = null;
let lastDefaultConfigUrl: string | null = null;

// Mutex for cache operations to prevent race conditions
const cacheMutex = new CacheMutex();

// Instance-specific API clients cache with LRU eviction and TTL
const instanceClients = createInstanceCache<N8nApiClient>((client, key) => {
  // Clean up when evicting from cache
  logger.debug('Evicting API client from cache', {
    cacheKey: key.substring(0, 8) + '...' // Only log partial key for security
  });
});

/**
 * Get or create API client with flexible instance support
 * Supports both singleton mode (using environment variables) and instance-specific mode.
 * Uses LRU cache with mutex protection for thread-safe operations.
 *
 * @param context - Optional instance context for instance-specific configuration
 * @returns API client configured for the instance or environment, or null if not configured
 *
 * @example
 * // Using environment variables (singleton mode)
 * const client = getN8nApiClient();
 *
 * @example
 * // Using instance context
 * const client = getN8nApiClient({
 *   n8nApiUrl: 'https://customer.n8n.cloud',
 *   n8nApiKey: 'api-key-123',
 *   instanceId: 'customer-1'
 * });
 */
/**
 * Get cache statistics for monitoring
 * @returns Formatted cache statistics string
 */
export function getInstanceCacheStatistics(): string {
  return getCacheStatistics();
}

/**
 * Get raw cache metrics for detailed monitoring
 * @returns Raw cache metrics object
 */
export function getInstanceCacheMetrics() {
  return cacheMetrics.getMetrics();
}

/**
 * Clear the instance cache for testing or maintenance
 */
export function clearInstanceCache(): void {
  instanceClients.clear();
  cacheMetrics.recordClear();
  cacheMetrics.updateSize(0, instanceClients.max);
}

export function getN8nApiClient(context?: InstanceContext): N8nApiClient | null {
  // If context provided with n8n config, use instance-specific client
  if (context?.n8nApiUrl && context?.n8nApiKey) {
    // Validate context before using
    const validation = validateInstanceContext(context);
    if (!validation.valid) {
      logger.warn('Invalid instance context provided', {
        instanceId: context.instanceId,
        errors: validation.errors
      });
      return null;
    }
    // Create secure hash of credentials for cache key using memoization
    const cacheKey = createCacheKey(
      `${context.n8nApiUrl}:${context.n8nApiKey}:${context.instanceId || ''}`
    );

    // Check cache first
    if (instanceClients.has(cacheKey)) {
      cacheMetrics.recordHit();
      return instanceClients.get(cacheKey) || null;
    }

    cacheMetrics.recordMiss();

    // Check if already being created (simple lock check)
    if (cacheMutex.isLocked(cacheKey)) {
      // Wait briefly and check again
      const waitTime = 100; // 100ms
      const start = Date.now();
      while (cacheMutex.isLocked(cacheKey) && (Date.now() - start) < 1000) {
        // Busy wait for up to 1 second
      }
      // Check if it was created while waiting
      if (instanceClients.has(cacheKey)) {
        cacheMetrics.recordHit();
        return instanceClients.get(cacheKey) || null;
      }
    }

    const config = getN8nApiConfigFromContext(context);
    if (config) {
      // Sanitized logging - never log API keys
      logger.info('Creating instance-specific n8n API client', {
        url: config.baseUrl.replace(/^(https?:\/\/[^\/]+).*/, '$1'), // Only log domain
        instanceId: context.instanceId,
        cacheKey: cacheKey.substring(0, 8) + '...' // Only log partial hash
      });

      const client = new N8nApiClient(config);
      instanceClients.set(cacheKey, client);
      cacheMetrics.recordSet();
      cacheMetrics.updateSize(instanceClients.size, instanceClients.max);
      return client;
    }

    return null;
  }

  // Fall back to default singleton from environment
  logger.info('Falling back to environment configuration for n8n API client');
  const config = getN8nApiConfig();

  if (!config) {
    if (defaultApiClient) {
      logger.info('n8n API configuration removed, clearing default client');
      defaultApiClient = null;
      lastDefaultConfigUrl = null;
    }
    return null;
  }

  // Check if config has changed
  if (!defaultApiClient || lastDefaultConfigUrl !== config.baseUrl) {
    logger.info('n8n API client initialized from environment', { url: config.baseUrl });
    defaultApiClient = new N8nApiClient(config);
    lastDefaultConfigUrl = config.baseUrl;
  }

  return defaultApiClient;
}

/**
 * Helper to ensure API is configured
 * @param context - Optional instance context
 * @returns Configured API client
 * @throws Error if API is not configured
 */
function ensureApiConfigured(context?: InstanceContext): N8nApiClient {
  const client = getN8nApiClient(context);
  if (!client) {
    if (context?.instanceId) {
      throw new Error(`n8n API not configured for instance ${context.instanceId}. Please provide n8nApiUrl and n8nApiKey in the instance context.`);
    }
    throw new Error('n8n API not configured. Please set N8N_API_URL and N8N_API_KEY environment variables.');
  }
  return client;
}

// Zod schemas for input validation
const createWorkflowSchema = z.object({
  name: z.string(),
  nodes: z.array(z.any()),
  connections: z.record(z.any()),
  settings: z.object({
    executionOrder: z.enum(['v0', 'v1']).optional(),
    timezone: z.string().optional(),
    saveDataErrorExecution: z.enum(['all', 'none']).optional(),
    saveDataSuccessExecution: z.enum(['all', 'none']).optional(),
    saveManualExecutions: z.boolean().optional(),
    saveExecutionProgress: z.boolean().optional(),
    executionTimeout: z.number().optional(),
    errorWorkflow: z.string().optional(),
  }).optional(),
});

const updateWorkflowSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  nodes: z.array(z.any()).optional(),
  connections: z.record(z.any()).optional(),
  settings: z.any().optional(),
});

const listWorkflowsSchema = z.object({
  limit: z.number().min(1).max(100).optional(),
  cursor: z.string().optional(),
  active: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  projectId: z.string().optional(),
  excludePinnedData: z.boolean().optional(),
});

const validateWorkflowSchema = z.object({
  id: z.string(),
  options: z.object({
    validateNodes: z.boolean().optional(),
    validateConnections: z.boolean().optional(),
    validateExpressions: z.boolean().optional(),
    profile: z.enum(['minimal', 'runtime', 'ai-friendly', 'strict']).optional(),
  }).optional(),
});

const autofixWorkflowSchema = z.object({
  id: z.string(),
  applyFixes: z.boolean().optional().default(false),
  fixTypes: z.array(z.enum([
    'expression-format',
    'typeversion-correction',
    'error-output-config',
    'node-type-correction',
    'webhook-missing-path'
  ])).optional(),
  confidenceThreshold: z.enum(['high', 'medium', 'low']).optional().default('medium'),
  maxFixes: z.number().optional().default(50)
});

const triggerWebhookSchema = z.object({
  webhookUrl: z.string().url(),
  httpMethod: z.enum(['GET', 'POST', 'PUT', 'DELETE']).optional(),
  data: z.record(z.unknown()).optional(),
  headers: z.record(z.string()).optional(),
  waitForResponse: z.boolean().optional(),
});

const listExecutionsSchema = z.object({
  limit: z.number().min(1).max(100).optional(),
  cursor: z.string().optional(),
  workflowId: z.string().optional(),
  projectId: z.string().optional(),
  status: z.enum(['success', 'error', 'waiting']).optional(),
  includeData: z.boolean().optional(),
});

// Workflow Management Handlers

export async function handleCreateWorkflow(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const input = createWorkflowSchema.parse(args);
    
    // Validate workflow structure
    const errors = validateWorkflowStructure(input);
    if (errors.length > 0) {
      // Track validation failure
      telemetry.trackWorkflowCreation(input, false);

      return {
        success: false,
        error: 'Workflow validation failed',
        details: { errors }
      };
    }

    // Create workflow
    const workflow = await client.createWorkflow(input);

    // Track successful workflow creation
    telemetry.trackWorkflowCreation(workflow, true);

    return {
      success: true,
      data: workflow,
      message: `Workflow "${workflow.name}" created successfully with ID: ${workflow.id}`
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid input',
        details: { errors: error.errors }
      };
    }
    
    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code,
        details: error.details as Record<string, unknown> | undefined
      };
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function handleGetWorkflow(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const { id } = z.object({ id: z.string() }).parse(args);
    
    const workflow = await client.getWorkflow(id);
    
    return {
      success: true,
      data: workflow
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid input',
        details: { errors: error.errors }
      };
    }
    
    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code
      };
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function handleGetWorkflowDetails(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const { id } = z.object({ id: z.string() }).parse(args);
    
    const workflow = await client.getWorkflow(id);
    
    // Get recent executions for this workflow
    const executions = await client.listExecutions({
      workflowId: id,
      limit: 10
    });
    
    // Calculate execution statistics
    const stats = {
      totalExecutions: executions.data.length,
      successCount: executions.data.filter(e => e.status === ExecutionStatus.SUCCESS).length,
      errorCount: executions.data.filter(e => e.status === ExecutionStatus.ERROR).length,
      lastExecutionTime: executions.data[0]?.startedAt || null
    };
    
    return {
      success: true,
      data: {
        workflow,
        executionStats: stats,
        hasWebhookTrigger: hasWebhookTrigger(workflow),
        webhookPath: getWebhookUrl(workflow)
      }
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid input',
        details: { errors: error.errors }
      };
    }
    
    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code
      };
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function handleGetWorkflowStructure(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const { id } = z.object({ id: z.string() }).parse(args);
    
    const workflow = await client.getWorkflow(id);
    
    // Simplify nodes to just essential structure
    const simplifiedNodes = workflow.nodes.map(node => ({
      id: node.id,
      name: node.name,
      type: node.type,
      position: node.position,
      disabled: node.disabled || false
    }));
    
    return {
      success: true,
      data: {
        id: workflow.id,
        name: workflow.name,
        active: workflow.active,
        isArchived: workflow.isArchived,
        nodes: simplifiedNodes,
        connections: workflow.connections,
        nodeCount: workflow.nodes.length,
        connectionCount: Object.keys(workflow.connections).length
      }
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid input',
        details: { errors: error.errors }
      };
    }
    
    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code
      };
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function handleGetWorkflowMinimal(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const { id } = z.object({ id: z.string() }).parse(args);
    
    const workflow = await client.getWorkflow(id);
    
    return {
      success: true,
      data: {
        id: workflow.id,
        name: workflow.name,
        active: workflow.active,
        isArchived: workflow.isArchived,
        tags: workflow.tags || [],
        createdAt: workflow.createdAt,
        updatedAt: workflow.updatedAt
      }
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid input',
        details: { errors: error.errors }
      };
    }
    
    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code
      };
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function handleUpdateWorkflow(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const input = updateWorkflowSchema.parse(args);
    const { id, ...updateData } = input;
    
    // If nodes/connections are being updated, validate the structure
    if (updateData.nodes || updateData.connections) {
      // Fetch current workflow if only partial update
      let fullWorkflow = updateData as Partial<Workflow>;
      
      if (!updateData.nodes || !updateData.connections) {
        const current = await client.getWorkflow(id);
        fullWorkflow = {
          ...current,
          ...updateData
        };
      }
      
      const errors = validateWorkflowStructure(fullWorkflow);
      if (errors.length > 0) {
        return {
          success: false,
          error: 'Workflow validation failed',
          details: { errors }
        };
      }
    }
    
    // Update workflow
    const workflow = await client.updateWorkflow(id, updateData);
    
    return {
      success: true,
      data: workflow,
      message: `Workflow "${workflow.name}" updated successfully`
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid input',
        details: { errors: error.errors }
      };
    }
    
    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code,
        details: error.details as Record<string, unknown> | undefined
      };
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function handleDeleteWorkflow(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const { id } = z.object({ id: z.string() }).parse(args);
    
    await client.deleteWorkflow(id);
    
    return {
      success: true,
      message: `Workflow ${id} deleted successfully`
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid input',
        details: { errors: error.errors }
      };
    }
    
    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code
      };
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function handleListWorkflows(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const input = listWorkflowsSchema.parse(args || {});
    
    const response = await client.listWorkflows({
      limit: input.limit || 100,
      cursor: input.cursor,
      active: input.active,
      tags: input.tags,
      projectId: input.projectId,
      excludePinnedData: input.excludePinnedData ?? true
    });
    
    // Strip down workflows to only essential metadata
    const minimalWorkflows = response.data.map(workflow => ({
      id: workflow.id,
      name: workflow.name,
      active: workflow.active,
      isArchived: workflow.isArchived,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
      tags: workflow.tags || [],
      nodeCount: workflow.nodes?.length || 0
    }));

    return {
      success: true,
      data: {
        workflows: minimalWorkflows,
        returned: minimalWorkflows.length,
        nextCursor: response.nextCursor,
        hasMore: !!response.nextCursor,
        ...(response.nextCursor ? { 
          _note: "More workflows available. Use cursor to get next page." 
        } : {})
      }
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid input',
        details: { errors: error.errors }
      };
    }
    
    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code
      };
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function handleValidateWorkflow(
  args: unknown,
  repository: NodeRepository,
  context?: InstanceContext
): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const input = validateWorkflowSchema.parse(args);
    
    // First, fetch the workflow from n8n
    const workflowResponse = await handleGetWorkflow({ id: input.id });
    
    if (!workflowResponse.success) {
      return workflowResponse; // Return the error from fetching
    }
    
    const workflow = workflowResponse.data as Workflow;
    
    // Create validator instance using the provided repository
    const validator = new WorkflowValidator(repository, EnhancedConfigValidator);
    
    // Run validation
    const validationResult = await validator.validateWorkflow(workflow, input.options);
    
    // Format the response (same format as the regular validate_workflow tool)
    const response: any = {
      valid: validationResult.valid,
      workflowId: workflow.id,
      workflowName: workflow.name,
      summary: {
        totalNodes: validationResult.statistics.totalNodes,
        enabledNodes: validationResult.statistics.enabledNodes,
        triggerNodes: validationResult.statistics.triggerNodes,
        validConnections: validationResult.statistics.validConnections,
        invalidConnections: validationResult.statistics.invalidConnections,
        expressionsValidated: validationResult.statistics.expressionsValidated,
        errorCount: validationResult.errors.length,
        warningCount: validationResult.warnings.length
      }
    };
    
    if (validationResult.errors.length > 0) {
      response.errors = validationResult.errors.map(e => ({
        node: e.nodeName || 'workflow',
        message: e.message,
        details: e.details
      }));
    }
    
    if (validationResult.warnings.length > 0) {
      response.warnings = validationResult.warnings.map(w => ({
        node: w.nodeName || 'workflow',
        message: w.message,
        details: w.details
      }));
    }
    
    if (validationResult.suggestions.length > 0) {
      response.suggestions = validationResult.suggestions;
    }

    // Track successfully validated workflows in telemetry
    if (validationResult.valid) {
      telemetry.trackWorkflowCreation(workflow, true);
    }

    return {
      success: true,
      data: response
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid input',
        details: { errors: error.errors }
      };
    }
    
    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code
      };
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function handleAutofixWorkflow(
  args: unknown,
  repository: NodeRepository,
  context?: InstanceContext
): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const input = autofixWorkflowSchema.parse(args);

    // First, fetch the workflow from n8n
    const workflowResponse = await handleGetWorkflow({ id: input.id }, context);

    if (!workflowResponse.success) {
      return workflowResponse; // Return the error from fetching
    }

    const workflow = workflowResponse.data as Workflow;

    // Create validator instance using the provided repository
    const validator = new WorkflowValidator(repository, EnhancedConfigValidator);

    // Run validation to identify issues
    const validationResult = await validator.validateWorkflow(workflow, {
      validateNodes: true,
      validateConnections: true,
      validateExpressions: true,
      profile: 'ai-friendly'
    });

    // Check for expression format issues
    const allFormatIssues: any[] = [];
    for (const node of workflow.nodes) {
      const formatContext = {
        nodeType: node.type,
        nodeName: node.name,
        nodeId: node.id
      };

      const nodeFormatIssues = ExpressionFormatValidator.validateNodeParameters(
        node.parameters,
        formatContext
      );

      // Add node information to each format issue
      const enrichedIssues = nodeFormatIssues.map(issue => ({
        ...issue,
        nodeName: node.name,
        nodeId: node.id
      }));

      allFormatIssues.push(...enrichedIssues);
    }

    // Generate fixes using WorkflowAutoFixer
    const autoFixer = new WorkflowAutoFixer(repository);
    const fixResult = autoFixer.generateFixes(
      workflow,
      validationResult,
      allFormatIssues,
      {
        applyFixes: input.applyFixes,
        fixTypes: input.fixTypes,
        confidenceThreshold: input.confidenceThreshold,
        maxFixes: input.maxFixes
      }
    );

    // If no fixes available
    if (fixResult.fixes.length === 0) {
      return {
        success: true,
        data: {
          workflowId: workflow.id,
          workflowName: workflow.name,
          message: 'No automatic fixes available for this workflow',
          validationSummary: {
            errors: validationResult.errors.length,
            warnings: validationResult.warnings.length
          }
        }
      };
    }

    // If preview mode (applyFixes = false)
    if (!input.applyFixes) {
      return {
        success: true,
        data: {
          workflowId: workflow.id,
          workflowName: workflow.name,
          preview: true,
          fixesAvailable: fixResult.fixes.length,
          fixes: fixResult.fixes,
          summary: fixResult.summary,
          stats: fixResult.stats,
          message: `${fixResult.fixes.length} fixes available. Set applyFixes=true to apply them.`
        }
      };
    }

    // Apply fixes using the diff engine
    if (fixResult.operations.length > 0) {
      const updateResult = await handleUpdatePartialWorkflow(
        {
          id: workflow.id,
          operations: fixResult.operations
        },
        context
      );

      if (!updateResult.success) {
        return {
          success: false,
          error: 'Failed to apply fixes',
          details: {
            fixes: fixResult.fixes,
            updateError: updateResult.error
          }
        };
      }

      return {
        success: true,
        data: {
          workflowId: workflow.id,
          workflowName: workflow.name,
          fixesApplied: fixResult.fixes.length,
          fixes: fixResult.fixes,
          summary: fixResult.summary,
          stats: fixResult.stats,
          message: `Successfully applied ${fixResult.fixes.length} fixes to workflow "${workflow.name}"`
        }
      };
    }

    return {
      success: true,
      data: {
        workflowId: workflow.id,
        workflowName: workflow.name,
        message: 'No fixes needed'
      }
    };

  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid input',
        details: { errors: error.errors }
      };
    }

    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

// Execution Management Handlers

export async function handleTriggerWebhookWorkflow(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const input = triggerWebhookSchema.parse(args);
    
    const webhookRequest: WebhookRequest = {
      webhookUrl: input.webhookUrl,
      httpMethod: input.httpMethod || 'POST',
      data: input.data,
      headers: input.headers,
      waitForResponse: input.waitForResponse ?? true
    };
    
    const response = await client.triggerWebhook(webhookRequest);
    
    return {
      success: true,
      data: response,
      message: 'Webhook triggered successfully'
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid input',
        details: { errors: error.errors }
      };
    }
    
    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code,
        details: error.details as Record<string, unknown> | undefined
      };
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function handleGetExecution(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const { id, includeData } = z.object({ 
      id: z.string(),
      includeData: z.boolean().optional()
    }).parse(args);
    
    const execution = await client.getExecution(id, includeData || false);
    
    return {
      success: true,
      data: execution
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid input',
        details: { errors: error.errors }
      };
    }
    
    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code
      };
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function handleListExecutions(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const input = listExecutionsSchema.parse(args || {});
    
    const response = await client.listExecutions({
      limit: input.limit || 100,
      cursor: input.cursor,
      workflowId: input.workflowId,
      projectId: input.projectId,
      status: input.status as ExecutionStatus | undefined,
      includeData: input.includeData || false
    });
    
    return {
      success: true,
      data: {
        executions: response.data,
        returned: response.data.length,
        nextCursor: response.nextCursor,
        hasMore: !!response.nextCursor,
        ...(response.nextCursor ? { 
          _note: "More executions available. Use cursor to get next page." 
        } : {})
      }
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid input',
        details: { errors: error.errors }
      };
    }
    
    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code
      };
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function handleDeleteExecution(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const { id } = z.object({ id: z.string() }).parse(args);
    
    await client.deleteExecution(id);
    
    return {
      success: true,
      message: `Execution ${id} deleted successfully`
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid input',
        details: { errors: error.errors }
      };
    }
    
    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code
      };
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

// System Tools Handlers

export async function handleHealthCheck(context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const health = await client.healthCheck();
    
    // Get MCP version from package.json
    const packageJson = require('../../package.json');
    const mcpVersion = packageJson.version;
    const supportedN8nVersion = packageJson.dependencies?.n8n?.replace(/[^0-9.]/g, '');
    
    return {
      success: true,
      data: {
        status: health.status,
        instanceId: health.instanceId,
        n8nVersion: health.n8nVersion,
        features: health.features,
        apiUrl: getN8nApiConfig()?.baseUrl,
        mcpVersion,
        supportedN8nVersion,
        versionNote: 'AI Agent: Please inform the user to verify their n8n instance version matches or is compatible with the supported version listed above. The n8n API currently does not expose version information, so manual verification is required.'
      }
    };
  } catch (error) {
    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code,
        details: {
          apiUrl: getN8nApiConfig()?.baseUrl,
          hint: 'Check if n8n is running and API is enabled'
        }
      };
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function handleListAvailableTools(context?: InstanceContext): Promise<McpToolResponse> {
  const tools = [
    {
      category: 'Workflow Management',
      tools: [
        { name: 'n8n_create_workflow', description: 'Create new workflows' },
        { name: 'n8n_get_workflow', description: 'Get workflow by ID' },
        { name: 'n8n_get_workflow_details', description: 'Get detailed workflow info with stats' },
        { name: 'n8n_get_workflow_structure', description: 'Get simplified workflow structure' },
        { name: 'n8n_get_workflow_minimal', description: 'Get minimal workflow info' },
        { name: 'n8n_update_workflow', description: 'Update existing workflows' },
        { name: 'n8n_delete_workflow', description: 'Delete workflows' },
        { name: 'n8n_list_workflows', description: 'List workflows with filters' },
        { name: 'n8n_validate_workflow', description: 'Validate workflow from n8n instance' },
        { name: 'n8n_autofix_workflow', description: 'Automatically fix common workflow errors' }
      ]
    },
    {
      category: 'Execution Management',
      tools: [
        { name: 'n8n_trigger_webhook_workflow', description: 'Trigger workflows via webhook' },
        { name: 'n8n_get_execution', description: 'Get execution details' },
        { name: 'n8n_list_executions', description: 'List executions with filters' },
        { name: 'n8n_delete_execution', description: 'Delete execution records' }
      ]
    },
    {
      category: 'System',
      tools: [
        { name: 'n8n_health_check', description: 'Check API connectivity' },
        { name: 'n8n_list_available_tools', description: 'List all available tools' }
      ]
    }
  ];
  
  const config = getN8nApiConfig();
  const apiConfigured = config !== null;
  
  return {
    success: true,
    data: {
      tools,
      apiConfigured,
      configuration: config ? {
        apiUrl: config.baseUrl,
        timeout: config.timeout,
        maxRetries: config.maxRetries
      } : null,
      limitations: [
        'Cannot activate/deactivate workflows via API',
        'Cannot execute workflows directly (must use webhooks)',
        'Cannot stop running executions',
        'Tags and credentials have limited API support'
      ]
    }
  };
}

// Handler: n8n_diagnostic
export async function handleDiagnostic(request: any, context?: InstanceContext): Promise<McpToolResponse> {
  const verbose = request.params?.arguments?.verbose || false;
  
  // Check environment variables
  const envVars = {
    N8N_API_URL: process.env.N8N_API_URL || null,
    N8N_API_KEY: process.env.N8N_API_KEY ? '***configured***' : null,
    NODE_ENV: process.env.NODE_ENV || 'production',
    MCP_MODE: process.env.MCP_MODE || 'stdio'
  };
  
  // Check API configuration
  const apiConfig = getN8nApiConfig();
  const apiConfigured = apiConfig !== null;
  const apiClient = getN8nApiClient(context);
  
  // Test API connectivity if configured
  let apiStatus = {
    configured: apiConfigured,
    connected: false,
    error: null as string | null,
    version: null as string | null
  };
  
  if (apiClient) {
    try {
      const health = await apiClient.healthCheck();
      apiStatus.connected = true;
      apiStatus.version = health.n8nVersion || 'unknown';
    } catch (error) {
      apiStatus.error = error instanceof Error ? error.message : 'Unknown error';
    }
  }
  
  // Check which tools are available
  const documentationTools = 22; // Base documentation tools
  const managementTools = apiConfigured ? 16 : 0;
  const totalTools = documentationTools + managementTools;
  
  // Build diagnostic report
  const diagnostic: any = {
    timestamp: new Date().toISOString(),
    environment: envVars,
    apiConfiguration: {
      configured: apiConfigured,
      status: apiStatus,
      config: apiConfig ? {
        baseUrl: apiConfig.baseUrl,
        timeout: apiConfig.timeout,
        maxRetries: apiConfig.maxRetries
      } : null
    },
    toolsAvailability: {
      documentationTools: {
        count: documentationTools,
        enabled: true,
        description: 'Always available - node info, search, validation, etc.'
      },
      managementTools: {
        count: managementTools,
        enabled: apiConfigured,
        description: apiConfigured ? 
          'Management tools are ENABLED - create, update, execute workflows' : 
          'Management tools are DISABLED - configure N8N_API_URL and N8N_API_KEY to enable'
      },
      totalAvailable: totalTools
    },
    troubleshooting: {
      steps: apiConfigured ? [
        'API is configured and should work',
        'If tools are not showing in Claude Desktop:',
        '1. Restart Claude Desktop completely',
        '2. Check if using latest Docker image',
        '3. Verify environment variables are passed correctly',
        '4. Try running n8n_health_check to test connectivity'
      ] : [
        'To enable management tools:',
        '1. Set N8N_API_URL environment variable (e.g., https://your-n8n-instance.com)',
        '2. Set N8N_API_KEY environment variable (get from n8n API settings)',
        '3. Restart the MCP server',
        '4. Management tools will automatically appear'
      ],
      documentation: 'For detailed setup instructions, see: https://github.com/czlonkowski/n8n-mcp?tab=readme-ov-file#n8n-management-tools-optional---requires-api-configuration'
    }
  };
  
  // Add verbose debug info if requested
  if (verbose) {
    diagnostic['debug'] = {
      processEnv: Object.keys(process.env).filter(key => 
        key.startsWith('N8N_') || key.startsWith('MCP_')
      ),
      nodeVersion: process.version,
      platform: process.platform,
      workingDirectory: process.cwd()
    };
  }
  
  return {
    success: true,
    data: diagnostic
  };
}
