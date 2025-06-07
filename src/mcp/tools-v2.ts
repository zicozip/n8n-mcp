import { ToolDefinition } from '../types';

/**
 * Simplified MCP tools focused on serving n8n node documentation and code
 */
export const nodeDocumentationTools: ToolDefinition[] = [
  {
    name: 'list_nodes',
    description: 'List all available n8n nodes with basic information',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Filter by category (e.g., "Core Nodes", "Flow", "Data Transformation")',
        },
        packageName: {
          type: 'string',
          description: 'Filter by package name (e.g., "n8n-nodes-base")',
        },
        isTrigger: {
          type: 'boolean',
          description: 'Filter to show only trigger nodes',
        },
      },
    },
  },
  {
    name: 'get_node_info',
    description: 'Get complete information about a specific n8n node including source code, documentation, and examples',
    inputSchema: {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'The node type or name (e.g., "n8n-nodes-base.if", "If", "webhook")',
        },
      },
      required: ['nodeType'],
    },
  },
  {
    name: 'search_nodes',
    description: 'Search for n8n nodes by name, description, or documentation content',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (searches in node names, descriptions, and documentation)',
        },
        category: {
          type: 'string',
          description: 'Filter by category',
        },
        hasDocumentation: {
          type: 'boolean',
          description: 'Filter to show only nodes with documentation',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return',
          default: 20,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_node_example',
    description: 'Get example workflow/usage for a specific n8n node',
    inputSchema: {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'The node type or name',
        },
      },
      required: ['nodeType'],
    },
  },
  {
    name: 'get_node_source_code',
    description: 'Get only the source code of a specific n8n node',
    inputSchema: {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'The node type or name',
        },
        includeCredentials: {
          type: 'boolean',
          description: 'Include credential type definitions if available',
          default: false,
        },
      },
      required: ['nodeType'],
    },
  },
  {
    name: 'get_node_documentation',
    description: 'Get only the documentation for a specific n8n node',
    inputSchema: {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'The node type or name',
        },
        format: {
          type: 'string',
          enum: ['markdown', 'plain'],
          description: 'Documentation format',
          default: 'markdown',
        },
      },
      required: ['nodeType'],
    },
  },
  {
    name: 'rebuild_database',
    description: 'Rebuild the entire node database with latest information from n8n and documentation',
    inputSchema: {
      type: 'object',
      properties: {
        includeDocumentation: {
          type: 'boolean',
          description: 'Include documentation from n8n-docs repository',
          default: true,
        },
      },
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