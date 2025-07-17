import { ToolDocumentation } from '../types';

export const getDatabaseStatisticsDoc: ToolDocumentation = {
  name: 'get_database_statistics',
  category: 'discovery',
  essentials: {
    description: 'Node stats: 525 total, 263 AI tools, 104 triggers, 87% docs coverage. Verifies MCP working.',
    keyParameters: [],
    example: 'get_database_statistics()',
    performance: 'Instant',
    tips: [
      'Use to verify MCP connection',
      'Check doc coverage',
      'See AI tool counts'
    ]
  },
  full: {
    description: 'Returns comprehensive database statistics including node counts, AI tool availability, trigger nodes, documentation coverage, and package distribution. Useful for verifying MCP connectivity.',
    parameters: {},
    returns: 'Statistics object with total_nodes, ai_tools, triggers, docs_coverage, packages breakdown',
    examples: [
      'get_database_statistics() - Get all statistics'
    ],
    useCases: [
      'Verify MCP is working',
      'Check documentation coverage',
      'Audit available nodes',
      'Monitor AI tool availability'
    ],
    performance: 'Instant - Pre-calculated statistics',
    bestPractices: [
      'Use to verify connection',
      'Check before bulk operations',
      'Monitor after database updates'
    ],
    pitfalls: [
      'Stats cached until rebuild',
      'May not reflect runtime changes'
    ],
    relatedTools: ['list_nodes', 'list_ai_tools', 'search_nodes']
  }
};