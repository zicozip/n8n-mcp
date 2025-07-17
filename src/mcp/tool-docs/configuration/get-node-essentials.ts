import { ToolDocumentation } from '../types';

export const getNodeEssentialsDoc: ToolDocumentation = {
  name: 'get_node_essentials',
  category: 'configuration',
  essentials: {
    description: 'Get 10-20 key properties with examples (<5KB)',
    keyParameters: ['nodeType'],
    example: 'get_node_essentials("nodes-base.slack")',
    performance: 'Fast (<5KB response)',
    tips: [
      'Use this first - has examples'
    ]
  },
  full: {
    description: 'Curated essential properties only. 95% smaller than full schema, includes examples.',
    parameters: {
      nodeType: { type: 'string', description: 'e.g., "nodes-base.slack"', required: true }
    },
    returns: 'Essential properties, examples, common patterns',
    examples: [
      'get_node_essentials("nodes-base.httpRequest")'
    ],
    useCases: [
      'Quick node configuration',
      'Getting examples',
      'Learning basics'
    ],
    performance: 'Fast - minimal data',
    bestPractices: [
      'Always use before get_node_info',
      'Copy examples as starting point'
    ],
    pitfalls: [
      'Advanced properties not included',
      'Use search_node_properties for specific needs'
    ],
    relatedTools: ['get_node_info', 'search_node_properties']
  }
};