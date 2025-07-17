import { ToolDocumentation } from '../types';

export const listAiToolsDoc: ToolDocumentation = {
  name: 'list_ai_tools',
  category: 'discovery',
  essentials: {
    description: 'List AI-optimized nodes. Note: ANY node can be AI tool! Connect any node to AI Agent\'s tool port. Community nodes need N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true.',
    keyParameters: [],
    example: 'list_ai_tools()',
    performance: 'Fast query',
    tips: ['ANY node works as AI tool']
  },
  full: {
    description: 'List nodes marked as AI tools. IMPORTANT: Any n8n node can be used as AI tool by connecting to AI Agent\'s tool port.',
    parameters: {},
    returns: 'Array of AI-optimized nodes with usage hints',
    examples: ['list_ai_tools() - Get AI-optimized nodes'],
    useCases: ['Find AI model integrations', 'Build agent toolchains'],
    performance: 'Fast query, cached results',
    bestPractices: ['Any node works as tool', 'Community nodes need env var'],
    pitfalls: ['List not exhaustive - all nodes work'],
    relatedTools: ['get_node_as_tool_info', 'search_nodes']
  }
};