import { ToolDocumentation } from '../types';

export const n8nUpdatePartialWorkflowDoc: ToolDocumentation = {
  name: 'n8n_update_partial_workflow',
  category: 'workflow_management',
  essentials: {
    description: 'Update workflow incrementally with diff operations. Max 5 ops. Types: addNode, removeNode, updateNode, moveNode, enable/disableNode, addConnection, removeConnection, updateSettings, updateName, add/removeTag.',
    keyParameters: ['id', 'operations'],
    example: 'n8n_update_partial_workflow({id: "wf_123", operations: [{type: "updateNode", ...}]})',
    performance: 'Fast (50-200ms)',
    tips: [
      'Use for targeted changes',
      'Supports up to 5 operations',
      'Validate with validateOnly first'
    ]
  },
  full: {
    description: 'Updates workflows using surgical diff operations instead of full replacement. Supports 13 operation types for precise modifications. Operations are validated and applied atomically - all succeed or none are applied. Maximum 5 operations per call for safety.',
    parameters: {
      id: { type: 'string', required: true, description: 'Workflow ID to update' },
      operations: { 
        type: 'array', 
        required: true, 
        description: 'Array of diff operations. Each must have "type" field and operation-specific properties. Max 5 operations.' 
      },
      validateOnly: { type: 'boolean', description: 'If true, only validate operations without applying them' }
    },
    returns: 'Updated workflow object or validation results if validateOnly=true',
    examples: [
      'n8n_update_partial_workflow({id: "abc", operations: [{type: "updateNode", nodeId: "n1", updates: {name: "New Name"}}]})',
      'n8n_update_partial_workflow({id: "xyz", operations: [{type: "addConnection", source: "n1", target: "n2"}]})',
      'n8n_update_partial_workflow({id: "123", operations: [{type: "removeNode", nodeId: "oldNode"}], validateOnly: true})'
    ],
    useCases: [
      'Update single node parameters',
      'Add/remove connections',
      'Enable/disable nodes',
      'Rename workflows or nodes',
      'Manage tags efficiently'
    ],
    performance: 'Very fast - typically 50-200ms. Much faster than full updates as only changes are processed.',
    bestPractices: [
      'Use validateOnly to test operations',
      'Group related changes in one call',
      'Keep operations under 5 for clarity',
      'Check operation order for dependencies'
    ],
    pitfalls: [
      'Requires N8N_API_URL and N8N_API_KEY configured',
      'Maximum 5 operations per call',
      'Operations must be valid together',
      'Some operations have dependencies',
      'See full docs for operation schemas'
    ],
    relatedTools: ['n8n_update_full_workflow', 'n8n_get_workflow', 'validate_workflow', 'tools_documentation']
  }
};