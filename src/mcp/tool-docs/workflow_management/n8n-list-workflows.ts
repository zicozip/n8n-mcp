import { ToolDocumentation } from '../types';

export const n8nListWorkflowsDoc: ToolDocumentation = {
  name: 'n8n_list_workflows',
  category: 'workflow_management',
  essentials: {
    description: 'List workflows with optional filters. Supports pagination via cursor.',
    keyParameters: ['limit', 'active', 'tags'],
    example: 'n8n_list_workflows({limit: 20, active: true})',
    performance: 'Fast (100-300ms)',
    tips: [
      'Use cursor for pagination',
      'Filter by active status',
      'Tag filtering for organization'
    ]
  },
  full: {
    description: 'Lists workflows from n8n with powerful filtering options including active status, tags, and project assignment. Supports cursor-based pagination for large workflow collections. Returns minimal workflow information by default for performance.',
    parameters: {
      limit: { type: 'number', description: 'Number of workflows to return (1-100, default: 100)' },
      cursor: { type: 'string', description: 'Pagination cursor from previous response for next page' },
      active: { type: 'boolean', description: 'Filter by active/inactive status' },
      tags: { type: 'array', description: 'Filter by exact tag matches (AND logic)' },
      projectId: { type: 'string', description: 'Filter by project ID (enterprise feature)' },
      excludePinnedData: { type: 'boolean', description: 'Exclude pinned data from response (default: true)' }
    },
    returns: 'Object with: data array (workflows with id, name, active, tags, dates), nextCursor (for pagination), and metadata (total count if available)',
    examples: [
      'n8n_list_workflows({limit: 20}) - First 20 workflows',
      'n8n_list_workflows({active: true, tags: ["production"]}) - Active production workflows',
      'n8n_list_workflows({cursor: "abc123", limit: 50}) - Next page of results'
    ],
    useCases: [
      'Build workflow dashboards',
      'Find workflows by status',
      'Organize by tags',
      'Bulk workflow operations',
      'Generate workflow reports'
    ],
    performance: 'Fast listing - typically 100-300ms for standard page sizes. Excludes workflow content for speed.',
    bestPractices: [
      'Use pagination for large instances',
      'Cache results for UI responsiveness',
      'Filter to reduce result set',
      'Combine with get_workflow_minimal for details'
    ],
    pitfalls: [
      'Requires N8N_API_URL and N8N_API_KEY configured',
      'Maximum 100 workflows per request',
      'Tags must match exactly (case-sensitive)',
      'No workflow content in results'
    ],
    relatedTools: ['n8n_get_workflow_minimal', 'n8n_get_workflow', 'n8n_update_partial_workflow', 'n8n_list_executions']
  }
};