import { z } from 'zod';
import { WorkflowNode, WorkflowConnection, Workflow } from '../types/n8n-api';

// Zod schemas for n8n API validation

export const workflowNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  typeVersion: z.number(),
  position: z.tuple([z.number(), z.number()]),
  parameters: z.record(z.unknown()),
  credentials: z.record(z.string()).optional(),
  disabled: z.boolean().optional(),
  notes: z.string().optional(),
  notesInFlow: z.boolean().optional(),
  continueOnFail: z.boolean().optional(),
  retryOnFail: z.boolean().optional(),
  maxTries: z.number().optional(),
  waitBetweenTries: z.number().optional(),
  alwaysOutputData: z.boolean().optional(),
  executeOnce: z.boolean().optional(),
});

export const workflowConnectionSchema = z.record(
  z.object({
    main: z.array(
      z.array(
        z.object({
          node: z.string(),
          type: z.string(),
          index: z.number(),
        })
      )
    ),
  })
);

export const workflowSettingsSchema = z.object({
  executionOrder: z.enum(['v0', 'v1']).default('v1'),
  timezone: z.string().optional(),
  saveDataErrorExecution: z.enum(['all', 'none']).default('all'),
  saveDataSuccessExecution: z.enum(['all', 'none']).default('all'),
  saveManualExecutions: z.boolean().default(true),
  saveExecutionProgress: z.boolean().default(true),
  executionTimeout: z.number().optional(),
  errorWorkflow: z.string().optional(),
});

// Default settings for workflow creation
export const defaultWorkflowSettings = {
  executionOrder: 'v1' as const,
  saveDataErrorExecution: 'all' as const,
  saveDataSuccessExecution: 'all' as const,
  saveManualExecutions: true,
  saveExecutionProgress: true,
};

// Validation functions
export function validateWorkflowNode(node: unknown): WorkflowNode {
  return workflowNodeSchema.parse(node);
}

export function validateWorkflowConnections(connections: unknown): WorkflowConnection {
  return workflowConnectionSchema.parse(connections);
}

export function validateWorkflowSettings(settings: unknown): z.infer<typeof workflowSettingsSchema> {
  return workflowSettingsSchema.parse(settings);
}

// Clean workflow data for API operations
export function cleanWorkflowForCreate(workflow: Partial<Workflow>): Partial<Workflow> {
  const {
    // Remove read-only fields
    id,
    createdAt,
    updatedAt,
    versionId,
    meta,
    // Remove fields that cause API errors during creation
    active,
    tags,
    // Keep everything else
    ...cleanedWorkflow
  } = workflow;

  // Ensure settings are present with defaults
  if (!cleanedWorkflow.settings) {
    cleanedWorkflow.settings = defaultWorkflowSettings;
  }

  return cleanedWorkflow;
}

export function cleanWorkflowForUpdate(workflow: Workflow): Partial<Workflow> {
  const {
    // Remove read-only/computed fields
    id,
    createdAt,
    updatedAt,
    versionId,
    meta,
    staticData,
    // Remove fields that cause API errors
    pinData,
    tags,
    // Keep everything else
    ...cleanedWorkflow
  } = workflow as any;

  // Ensure settings are present
  if (!cleanedWorkflow.settings) {
    cleanedWorkflow.settings = defaultWorkflowSettings;
  }

  return cleanedWorkflow;
}

// Validate workflow structure
export function validateWorkflowStructure(workflow: Partial<Workflow>): string[] {
  const errors: string[] = [];

  // Check required fields
  if (!workflow.name) {
    errors.push('Workflow name is required');
  }

  if (!workflow.nodes || workflow.nodes.length === 0) {
    errors.push('Workflow must have at least one node');
  }

  if (!workflow.connections) {
    errors.push('Workflow connections are required');
  }

  // Validate nodes
  if (workflow.nodes) {
    workflow.nodes.forEach((node, index) => {
      try {
        validateWorkflowNode(node);
      } catch (error) {
        errors.push(`Invalid node at index ${index}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });
  }

  // Validate connections
  if (workflow.connections) {
    try {
      validateWorkflowConnections(workflow.connections);
    } catch (error) {
      errors.push(`Invalid connections: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Validate that all connection references exist
  if (workflow.nodes && workflow.connections) {
    const nodeIds = new Set(workflow.nodes.map(node => node.id));
    
    Object.entries(workflow.connections).forEach(([sourceId, connection]) => {
      if (!nodeIds.has(sourceId)) {
        errors.push(`Connection references non-existent source node: ${sourceId}`);
      }
      
      connection.main.forEach((outputs, outputIndex) => {
        outputs.forEach((target, targetIndex) => {
          if (!nodeIds.has(target.node)) {
            errors.push(`Connection references non-existent target node: ${target.node} (from ${sourceId}[${outputIndex}][${targetIndex}])`);
          }
        });
      });
    });
  }

  return errors;
}

// Check if workflow has webhook trigger
export function hasWebhookTrigger(workflow: Workflow): boolean {
  return workflow.nodes.some(node => 
    node.type === 'n8n-nodes-base.webhook' || 
    node.type === 'n8n-nodes-base.webhookTrigger'
  );
}

// Get webhook URL from workflow
export function getWebhookUrl(workflow: Workflow): string | null {
  const webhookNode = workflow.nodes.find(node => 
    node.type === 'n8n-nodes-base.webhook' || 
    node.type === 'n8n-nodes-base.webhookTrigger'
  );

  if (!webhookNode || !webhookNode.parameters) {
    return null;
  }

  // Check for path parameter
  const path = webhookNode.parameters.path as string | undefined;
  if (!path) {
    return null;
  }

  // Note: We can't construct the full URL without knowing the n8n instance URL
  // The caller will need to prepend the base URL
  return path;
}