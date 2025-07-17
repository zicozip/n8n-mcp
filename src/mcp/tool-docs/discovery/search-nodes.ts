import { ToolDocumentation } from '../types';

export const searchNodesDoc: ToolDocumentation = {
  name: 'search_nodes',
  category: 'discovery',
  essentials: {
    description: 'Search nodes by keyword. Common nodes ranked first.',
    keyParameters: ['query', 'mode'],
    example: 'search_nodes({query: "webhook"})',
    performance: 'Fast (<20ms)',
    tips: [
      'OR=any word, AND=all words, FUZZY=typos',
      'Quotes for exact phrase'
    ]
  },
  full: {
    description: 'Full-text search with relevance ranking. Common nodes (webhook, http) prioritized.',
    parameters: {
      query: { type: 'string', description: 'Use quotes for exact phrase', required: true },
      limit: { type: 'number', description: 'Default: 20', required: false },
      mode: { type: 'string', description: 'OR|AND|FUZZY', required: false }
    },
    returns: 'Nodes array sorted by relevance',
    examples: [
      'search_nodes({query: "webhook"}) - Finds Webhook node',
      'search_nodes({query: "slak", mode: "FUZZY"}) - Finds Slack'
    ],
    useCases: [
      'Finding nodes by keyword',
      'Typo-tolerant search',
      'Multi-word searches'
    ],
    performance: 'Fast - FTS5 search',
    bestPractices: [
      'Single words for best results',
      'FUZZY for uncertain spelling',
      'AND requires all terms anywhere'
    ],
    pitfalls: [
      'AND searches all fields not just names',
      'Short queries + FUZZY = unexpected results'
    ],
    relatedTools: ['list_nodes', 'get_node_essentials']
  }
};