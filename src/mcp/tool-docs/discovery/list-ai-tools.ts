import { ToolDocumentation } from '../types';

export const listAiToolsDoc: ToolDocumentation = {
  name: 'list_ai_tools',
  category: 'discovery',
  essentials: {
    description: 'DEPRECATED: Basic list of 263 AI nodes. For comprehensive AI Agent guidance, use tools_documentation({topic: "ai_agents_guide"}). That guide covers architecture, connections, tools, validation, and best practices. Use search_nodes({query: "AI", includeExamples: true}) for AI nodes with working examples.',
    keyParameters: [],
    example: 'tools_documentation({topic: "ai_agents_guide"}) // Recommended alternative',
    performance: 'Instant (cached)',
    tips: [
      'NEW: Use ai_agents_guide for comprehensive AI workflow documentation',
      'Use search_nodes({includeExamples: true}) for AI nodes with real-world examples',
      'ANY node can be an AI tool - not limited to AI-specific nodes',
      'Use get_node_as_tool_info for guidance on any node'
    ]
  },
  full: {
    description: '**DEPRECATED in favor of ai_agents_guide**. Lists 263 nodes with built-in AI capabilities. For comprehensive documentation on building AI Agent workflows, use tools_documentation({topic: "ai_agents_guide"}) which covers architecture, the 8 AI connection types, validation, and best practices with real examples. IMPORTANT: This basic list is NOT a complete guide - use the full AI Agents guide instead.',
    parameters: {},
    returns: 'Array of 263 AI-optimized nodes. RECOMMENDED: Use ai_agents_guide for comprehensive guidance, or search_nodes({query: "AI", includeExamples: true}) for AI nodes with working configuration examples.',
    examples: [
      '// RECOMMENDED: Use the comprehensive AI Agents guide',
      'tools_documentation({topic: "ai_agents_guide"})',
      '',
      '// Or search for AI nodes with real-world examples',
      'search_nodes({query: "AI Agent", includeExamples: true})',
      '',
      '// Basic list (deprecated)',
      'list_ai_tools() - Returns 263 AI-optimized nodes'
    ],
    useCases: [
      'Discover AI model integrations (OpenAI, Anthropic, Google AI)',
      'Find vector databases for RAG applications',
      'Locate embedding generators and processors',
      'Build AI agent tool chains with ANY n8n node'
    ],
    performance: 'Instant - results are pre-cached in memory',
    bestPractices: [
      'Remember: ANY node works as an AI tool when connected to AI Agent',
      'Common non-AI nodes used as tools: Slack (messaging), Google Sheets (data), HTTP Request (APIs), Code (custom logic)',
      'For community nodes: set N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true'
    ],
    pitfalls: [
      'This list is NOT exhaustive - it only shows nodes with AI-specific features',
      'Don\'t limit yourself to this list when building AI workflows',
      'Community nodes require environment variable to work as tools'
    ],
    relatedTools: ['get_node_as_tool_info for any node usage', 'search_nodes to find specific nodes', 'get_node_essentials to configure nodes']
  }
};