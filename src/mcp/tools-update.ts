import { ToolDefinition } from '../types';

/**
 * n8n Documentation MCP Tools
 * 
 * These tools provide read-only access to n8n node documentation, properties,
 * and metadata. They enable AI assistants to understand n8n's capabilities
 * and help users build workflows.
 */
export const n8nDocumentationTools: ToolDefinition[] = [
  {
    name: 'list_nodes',
    description: 'List available n8n workflow automation nodes with filtering. Returns node metadata including names, categories, packages, and capabilities. Use this to discover nodes for specific tasks or explore n8n\'s capabilities.',
    inputSchema: {
      type: 'object',
      properties: {
        package: {
          type: 'string',
          description: 'Filter by package name (e.g., "n8n-nodes-base" for core nodes, "@n8n/n8n-nodes-langchain" for AI nodes)',
        },
        category: {
          type: 'string',
          description: 'Filter by category (e.g., "AI", "Data Transformation", "Communication", "Developer Tools")',
        },
        developmentStyle: {
          type: 'string',
          enum: ['declarative', 'programmatic'],
          description: 'Filter by implementation style - declarative (config-based) or programmatic (code-based)',
        },
        isAITool: {
          type: 'boolean',
          description: 'Filter to show only nodes with usableAsTool property for AI agent integration',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of nodes to return',
          default: 50,
        },
      },
    },
  },
  {
    name: 'get_node_info',
    description: 'Get comprehensive details about a specific n8n node including properties, operations, credentials, documentation, examples, and source code. Essential for understanding node configuration and usage.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'The node type identifier (e.g., "httpRequest", "slack", "code", "agent", "llmChain")',
        },
      },
      required: ['nodeType'],
    },
  },
  {
    name: 'search_nodes',
    description: 'Full-text search across all n8n node documentation, names, and descriptions using SQLite FTS5. Find nodes by functionality, features, or any text content. Returns relevance-ranked results.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search keywords to find nodes (e.g., "send email", "AI chat", "database query")',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of search results',
          default: 20,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_ai_tools',
    description: 'List all n8n nodes that have the "usableAsTool" property set to true. These nodes can be used by AI agents and LangChain integrations as function-calling tools. Returns AI-specific capabilities and metadata.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_node_documentation',
    description: 'Get the full parsed documentation for a specific n8n node from the official n8n-docs repository. Returns structured markdown with examples, parameter details, authentication info, and common use cases.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'The node type to retrieve documentation for',
        },
      },
      required: ['nodeType'],
    },
  },
  {
    name: 'get_database_statistics',
    description: 'Get comprehensive statistics about the n8n node documentation database including total nodes (525+), coverage metrics, AI tools count (263+), package breakdown, and storage size. Useful for understanding data completeness.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];