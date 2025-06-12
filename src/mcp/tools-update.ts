import { ToolDefinition } from '../types';

export const n8nDocumentationTools: ToolDefinition[] = [
  {
    name: 'list_nodes',
    description: 'List all available n8n nodes with filtering options',
    inputSchema: {
      type: 'object',
      properties: {
        package: {
          type: 'string',
          description: 'Filter by package name (e.g., n8n-nodes-base, @n8n/n8n-nodes-langchain)',
        },
        category: {
          type: 'string',
          description: 'Filter by category',
        },
        developmentStyle: {
          type: 'string',
          enum: ['declarative', 'programmatic'],
          description: 'Filter by development style',
        },
        isAITool: {
          type: 'boolean',
          description: 'Filter to show only AI tools',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return',
          default: 50,
        },
      },
    },
  },
  {
    name: 'get_node_info',
    description: 'Get comprehensive information about a specific n8n node',
    inputSchema: {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'The node type (e.g., httpRequest, slack, code)',
        },
      },
      required: ['nodeType'],
    },
  },
  {
    name: 'search_nodes',
    description: 'Full-text search across all node documentation',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results',
          default: 20,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_ai_tools',
    description: 'List all nodes that can be used as AI Agent tools',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_node_documentation',
    description: 'Get the full documentation for a specific node',
    inputSchema: {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'The node type',
        },
      },
      required: ['nodeType'],
    },
  },
  {
    name: 'get_database_statistics',
    description: 'Get statistics about the node database',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];