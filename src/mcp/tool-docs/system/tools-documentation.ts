import { ToolDocumentation } from '../types';

export const toolsDocumentationDoc: ToolDocumentation = {
  name: 'tools_documentation',
  category: 'system',
  essentials: {
    description: 'Get MCP tool docs. No params = overview.',
    keyParameters: ['topic', 'depth'],
    example: 'tools_documentation({topic: "search_nodes"})',
    performance: 'Instant',
    tips: [
      'No params = quick start',
      'depth:"full" for details'
    ]
  },
  full: {
    description: 'Get documentation for any MCP tool. Without params returns quick start guide. With topic returns tool-specific docs.',
    parameters: {
      topic: { type: 'string', description: 'Tool name or "overview"', required: false },
      depth: { type: 'string', description: '"essentials" or "full"', required: false }
    },
    returns: 'Markdown documentation',
    examples: [
      'tools_documentation() - Quick start',
      'tools_documentation({topic: "search_nodes", depth: "full"}) - Full docs'
    ],
    useCases: [
      'Learning tool usage',
      'Finding parameters',
      'Getting examples'
    ],
    performance: 'Instant',
    bestPractices: [
      'Start with no params',
      'Use essentials for quick lookup',
      'Full depth for debugging'
    ],
    pitfalls: [
      'Tool names must match exactly',
      'Some features undocumented'
    ],
    relatedTools: ['n8n_list_available_tools', 'list_tasks']
  }
};