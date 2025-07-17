import { ToolDocumentation } from '../types';

export const getNodeEssentialsDoc: ToolDocumentation = {
  name: 'get_node_essentials',
  category: 'configuration',
  essentials: {
    description: 'Returns only the most commonly-used properties for a node (10-20 fields) with working examples. Response is 95% smaller than get_node_info (5KB vs 100KB+). Essential properties include required fields, common options, and authentication settings.',
    keyParameters: ['nodeType'],
    example: 'get_node_essentials({nodeType: "nodes-base.slack"})',
    performance: '<10ms, ~5KB response',
    tips: [
      'Always use this before get_node_info',
      'Includes ready-to-use examples',
      'Perfect for configuring nodes quickly'
    ]
  },
  full: {
    description: 'Returns a curated subset of node properties focusing on the most commonly-used fields. Essential properties are hand-picked for each node type and include: required fields, primary operations, authentication options, and the most frequent configuration patterns. Each response includes working examples you can copy and modify.',
    parameters: {
      nodeType: { type: 'string', description: 'Full node type with prefix, e.g., "nodes-base.slack", "nodes-base.httpRequest"', required: true }
    },
    returns: `Object containing:
{
  "nodeType": "nodes-base.slack",
  "essentialProperties": {
    "resource": ["channel", "message", "user"],
    "operation": ["post", "update", "delete"],
    "authentication": ["accessToken", "oAuth2"],
    "channel": "Channel ID or name",
    "text": "Message content",
    "blocks": "Advanced formatting (optional)"
  },
  "examples": {
    "postMessage": {
      "resource": "message",
      "operation": "post", 
      "channel": "#general",
      "text": "Hello from n8n!"
    },
    "withBlocks": {
      "resource": "message",
      "operation": "post",
      "blocks": [{"type": "section", "text": {"type": "mrkdwn", "text": "Hello"}}]
    }
  },
  "authentication": {
    "required": true,
    "options": ["accessToken", "oAuth2"]
  }
}`,
    examples: [
      'get_node_essentials({nodeType: "nodes-base.httpRequest"}) - HTTP configuration basics',
      'get_node_essentials({nodeType: "nodes-base.slack"}) - Slack messaging essentials',
      'get_node_essentials({nodeType: "nodes-base.googleSheets"}) - Sheets operations',
      '// Workflow: search → essentials → validate',
      'const nodes = search_nodes({query: "database"});',
      'const mysql = get_node_essentials({nodeType: "nodes-base.mySql"});',
      'validate_node_minimal("nodes-base.mySql", mysql.examples.select);'
    ],
    useCases: [
      'Quickly configure nodes without information overload',
      'Get working examples for common operations',
      'Learn node basics before diving into advanced features',
      'Build workflows faster with curated property sets'
    ],
    performance: '<10ms response time, ~5KB payload (vs 100KB+ for full schema)',
    bestPractices: [
      'Always start with essentials, only use get_node_info if needed',
      'Copy examples as configuration starting points',
      'Check authentication requirements first',
      'Use search_node_properties if specific property not in essentials'
    ],
    pitfalls: [
      'Advanced properties not included - use get_node_info for complete schema',
      'Node-specific validators may require additional fields',
      'Some nodes have 50+ properties, essentials shows only top 10-20'
    ],
    relatedTools: ['get_node_info for complete schema', 'search_node_properties for finding specific fields', 'validate_node_minimal to check configuration']
  }
};