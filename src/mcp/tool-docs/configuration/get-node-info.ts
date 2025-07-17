import { ToolDocumentation } from '../types';

export const getNodeInfoDoc: ToolDocumentation = {
  name: 'get_node_info',
  category: 'configuration',
  essentials: {
    description: 'Get FULL node schema (100KB+). TIP: Use get_node_essentials first! Returns all properties/operations/credentials. Prefix required: "nodes-base.httpRequest" not "httpRequest".',
    keyParameters: ['nodeType'],
    example: 'get_node_info({nodeType: "nodes-base.slack"})',
    performance: 'Moderate - large responses',
    tips: [
      'Use get_node_essentials first',
      'Required: Full prefix "nodes-base."',
      'Returns entire schema'
    ]
  },
  full: {
    description: 'Returns complete node JSON schema including all properties, operations, credentials, and metadata. Response size often exceeds 100KB. Always prefer get_node_essentials unless you need the complete schema.',
    parameters: {
      nodeType: { type: 'string', required: true, description: 'Full node type with prefix (e.g., "nodes-base.slack", "nodes-langchain.openAi")' }
    },
    returns: 'Complete node JSON with type, displayName, description, properties, credentials, version info',
    examples: [
      'get_node_info({nodeType: "nodes-base.httpRequest"}) - Get HTTP Request node',
      'get_node_info({nodeType: "nodes-langchain.openAi"}) - Get OpenAI node'
    ],
    useCases: [
      'Complete schema analysis',
      'Credential requirement discovery',
      'Advanced property exploration'
    ],
    performance: 'Moderate - Response size 50-500KB depending on node complexity',
    bestPractices: [
      'Always use get_node_essentials first',
      'Only use when complete schema needed',
      'Cache results for repeated access'
    ],
    pitfalls: [
      'Response often exceeds 100KB',
      'Overwhelming for simple configurations',
      'Must include full prefix'
    ],
    relatedTools: ['get_node_essentials', 'search_node_properties', 'validate_node_operation']
  }
};