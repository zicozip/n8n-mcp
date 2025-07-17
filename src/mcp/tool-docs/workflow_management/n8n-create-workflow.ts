import { ToolDocumentation } from '../types';

export const n8nCreateWorkflowDoc: ToolDocumentation = {
  name: 'n8n_create_workflow',
  category: 'workflow_management',
  essentials: {
    description: 'Create workflow. Requires: name, nodes[], connections{}. Created inactive. Returns workflow with ID.',
    keyParameters: ['name', 'nodes', 'connections'],
    example: 'n8n_create_workflow({name: "My Flow", nodes: [...], connections: {...}})',
    performance: 'Network-dependent',
    tips: [
      'Workflow created inactive',
      'Returns ID for future updates',
      'Validate first with validate_workflow'
    ]
  },
  full: {
    description: 'Creates a new workflow in n8n with specified nodes and connections. Workflow is created in inactive state. Each node requires: id, name, type, typeVersion, position, and parameters.',
    parameters: {
      name: { type: 'string', required: true, description: 'Workflow name' },
      nodes: { type: 'array', required: true, description: 'Array of nodes with id, name, type, typeVersion, position, parameters' },
      connections: { type: 'object', required: true, description: 'Node connections. Keys are source node IDs' },
      settings: { type: 'object', description: 'Optional workflow settings (timezone, error handling, etc.)' }
    },
    returns: 'Created workflow object with id, name, nodes, connections, active status',
    examples: [
      'n8n_create_workflow({name: "Webhook to Slack", nodes: [...], connections: {...}}) - Basic workflow',
      'n8n_create_workflow({name: "Data ETL", nodes: [...], connections: {...], settings: {timezone: "UTC"}}) - With settings'
    ],
    useCases: [
      'Deploy validated workflows',
      'Automate workflow creation',
      'Clone workflow structures',
      'Template deployment'
    ],
    performance: 'Network-dependent - Typically 100-500ms depending on workflow size',
    bestPractices: [
      'Validate with validate_workflow first',
      'Use unique node IDs',
      'Position nodes for readability',
      'Test with n8n_trigger_webhook_workflow'
    ],
    pitfalls: [
      'Requires API configuration',
      'Created workflows are inactive',
      'Node IDs must be unique',
      'Credentials configured separately'
    ],
    relatedTools: ['validate_workflow', 'n8n_update_partial_workflow', 'n8n_trigger_webhook_workflow']
  }
};