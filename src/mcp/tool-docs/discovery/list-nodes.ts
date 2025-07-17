import { ToolDocumentation } from '../types';

export const listNodesDoc: ToolDocumentation = {
  name: 'list_nodes',
  category: 'discovery',
  essentials: {
    description: 'List n8n nodes. Common: list_nodes({limit:200}) for all, list_nodes({category:"trigger"}) for triggers. Package: "n8n-nodes-base" or "@n8n/n8n-nodes-langchain". Categories: trigger/transform/output/input.',
    keyParameters: ['category', 'package', 'limit', 'isAITool'],
    example: 'list_nodes({limit:200})',
    performance: 'Fast query',
    tips: ['limit:200+ for all']
  },
  full: {
    description: 'List n8n nodes with filtering. Returns array of nodes with metadata.',
    parameters: {
      category: { type: 'string', description: 'trigger|transform|output|input|AI', required: false },
      package: { type: 'string', description: '"n8n-nodes-base" (core) or "@n8n/n8n-nodes-langchain" (AI)', required: false },
      limit: { type: 'number', description: 'Max results (default 50, use 200+ for all)', required: false },
      isAITool: { type: 'boolean', description: 'Filter AI-capable nodes', required: false },
      developmentStyle: { type: 'string', description: 'Usually "programmatic"', required: false }
    },
    returns: 'Array with nodeType, displayName, description, category',
    examples: [
      'list_nodes({limit:200}) - All nodes',
      'list_nodes({category:"trigger"}) - Webhook, Schedule, etc.',
      'list_nodes({package:"@n8n/n8n-nodes-langchain"}) - AI/LangChain nodes',
      'list_nodes({isAITool:true}) - Nodes usable as AI tools'
    ],
    useCases: ['Browse by category', 'Find triggers', 'Get AI nodes'],
    performance: 'Fast query, returns metadata only',
    bestPractices: ['Use limit:200+ for full list', 'Category for focused search'],
    pitfalls: ['No text search - use search_nodes'],
    relatedTools: ['search_nodes', 'list_ai_tools']
  }
};