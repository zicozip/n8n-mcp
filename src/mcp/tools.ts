import { ToolDefinition } from '../types';

export const n8nTools: ToolDefinition[] = [
  {
    name: 'execute_workflow',
    description: 'Execute an n8n workflow by ID',
    inputSchema: {
      type: 'object',
      properties: {
        workflowId: {
          type: 'string',
          description: 'The ID of the workflow to execute',
        },
        data: {
          type: 'object',
          description: 'Input data for the workflow execution',
        },
      },
      required: ['workflowId'],
    },
  },
  {
    name: 'list_workflows',
    description: 'List all available n8n workflows',
    inputSchema: {
      type: 'object',
      properties: {
        active: {
          type: 'boolean',
          description: 'Filter by active status',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by tags',
        },
      },
    },
  },
  {
    name: 'get_workflow',
    description: 'Get details of a specific workflow',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The workflow ID',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_workflow',
    description: 'Create a new n8n workflow',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the workflow',
        },
        nodes: {
          type: 'array',
          description: 'Array of node definitions',
        },
        connections: {
          type: 'object',
          description: 'Node connections',
        },
        settings: {
          type: 'object',
          description: 'Workflow settings',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_workflow',
    description: 'Update an existing workflow',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The workflow ID',
        },
        updates: {
          type: 'object',
          description: 'Updates to apply to the workflow',
        },
      },
      required: ['id', 'updates'],
    },
  },
  {
    name: 'delete_workflow',
    description: 'Delete a workflow',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The workflow ID to delete',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_executions',
    description: 'Get workflow execution history',
    inputSchema: {
      type: 'object',
      properties: {
        workflowId: {
          type: 'string',
          description: 'Filter by workflow ID',
        },
        status: {
          type: 'string',
          enum: ['success', 'error', 'running', 'waiting'],
          description: 'Filter by execution status',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of executions to return',
        },
      },
    },
  },
  {
    name: 'get_execution_data',
    description: 'Get detailed data for a specific execution',
    inputSchema: {
      type: 'object',
      properties: {
        executionId: {
          type: 'string',
          description: 'The execution ID',
        },
      },
      required: ['executionId'],
    },
  },
];