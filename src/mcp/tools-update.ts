import { ToolDefinition } from '../types';

/**
 * n8n Documentation MCP Tools - FINAL OPTIMIZED VERSION
 * 
 * Incorporates all lessons learned from real workflow building.
 * Designed to help AI agents avoid common pitfalls and build workflows efficiently.
 */
export const n8nDocumentationToolsFinal: ToolDefinition[] = [
  {
    name: 'list_nodes',
    description: `Browse n8n's 525+ nodes by category/type/package. BEST FOR: Initial discovery, browsing categories, finding all nodes of a type. Returns lightweight list with names/descriptions only. Common patterns: list_nodes({category:"trigger"}) for workflow starters, list_nodes({package:"n8n-nodes-base", limit:200}) to see all integrations. Categories: "trigger" (104), "transform" (data processing), "output" (destinations), "input" (data sources). TIP: More reliable than search_nodes for discovery. Use limit:200+ to see all nodes in large categories.`,
    inputSchema: {
      type: 'object',
      properties: {
        package: {
          type: 'string',
          description: 'EXACT package name: "n8n-nodes-base" (435 core integrations like Slack, Gmail) or "@n8n/n8n-nodes-langchain" (90 AI nodes). No other values work.',
        },
        category: {
          type: 'string',
          description: 'Single category only: "trigger" | "transform" | "output" | "input" | "AI". Returns all nodes in that category.',
        },
        developmentStyle: {
          type: 'string',
          enum: ['declarative', 'programmatic'],
          description: 'Implementation type. Most nodes are "programmatic". Rarely needed.',
        },
        isAITool: {
          type: 'boolean',
          description: 'true = only nodes with usableAsTool for AI agents (263 nodes). Use list_ai_tools instead for better results.',
        },
        limit: {
          type: 'number',
          description: 'Results limit. Default 50 may miss nodes - use 200+ for complete results. Max 500.',
          default: 50,
        },
      },
    },
  },
  {
    name: 'get_node_info',
    description: `Get COMPLETE technical schema for a node. WARNING: Returns massive JSON (often 100KB+) with all properties, operations, credentials. Contains duplicates and complex conditional logic. TIPS: 1) Try get_node_documentation first, 2) Look for "required":true properties, 3) Find properties without "displayOptions" for simpler versions, 4) Check "default" values. Node type MUST include prefix: "nodes-base.httpRequest" NOT "httpRequest". If not found, try lowercase or without prefix.`,
    inputSchema: {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'FULL node type with prefix. Format: "nodes-base.{name}" or "nodes-langchain.{name}". Common examples: "nodes-base.httpRequest", "nodes-base.webhook", "nodes-base.code", "nodes-base.slack", "nodes-base.gmail", "nodes-base.googleSheets", "nodes-base.postgres", "nodes-langchain.openAi", "nodes-langchain.agent". CASE SENSITIVE!',
        },
      },
      required: ['nodeType'],
    },
  },
  {
    name: 'search_nodes',
    description: `Find nodes by keyword. CRITICAL: Use SINGLE WORDS only! Multi-word searches usually fail. The search is substring-based (not semantic). Examples - WORKS: "slack", "email", "sheet", "webhook". FAILS: "send message", "google sheets", "http request". If no results: 1) Try shorter word, 2) Try related terms, 3) Use list_nodes instead. Searches in node names, descriptions, and docs. Returns max 20 by default with relevance scoring.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search term - MUST BE SINGLE WORD for best results! Good: "slack", "email", "http", "sheet", "database", "webhook". Bad: "send slack message", "read spreadsheet". Case-insensitive.',
        },
        limit: {
          type: 'number',
          description: 'Max results. Default 20 is usually enough. Increase if needed.',
          default: 20,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_ai_tools',
    description: `List all 263 nodes that AI agents can use as function-calling tools. These have usableAsTool=true and work with OpenAI Assistants, LangChain agents, etc. Simpler than list_nodes - just returns names and descriptions. Great for finding nodes to give AI agents real-world capabilities (send emails, query databases, call APIs). Note: n8n needs N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true.`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_node_documentation',
    description: `Get human-readable documentation for a node. USE THIS BEFORE get_node_info! Returns markdown with explanations, examples, auth setup, common patterns. Much easier to understand than raw schema. 87% of nodes have docs (returns "No documentation available" otherwise). Same nodeType format as get_node_info. Best for understanding what a node does and how to use it.`,
    inputSchema: {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'Full node type WITH prefix (same as get_node_info): "nodes-base.slack", "nodes-base.httpRequest", etc. CASE SENSITIVE!',
        },
      },
      required: ['nodeType'],
    },
  },
  {
    name: 'get_database_statistics',
    description: `Quick summary of the n8n node ecosystem. Shows: total nodes (525), AI tools (263), triggers (104), versioned nodes, documentation coverage (87%), package breakdown. No parameters needed. Useful for verifying MCP is working and understanding available scope.`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_node_essentials',
    description: `Get only the 10-20 most important properties for a node (95% size reduction). USE THIS INSTEAD OF get_node_info for basic configuration! Returns: required properties, common properties, working examples. Perfect for quick workflow building. Same nodeType format as get_node_info (e.g., "nodes-base.httpRequest"). Reduces 100KB+ responses to <5KB focused data.`,
    inputSchema: {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'Full node type WITH prefix: "nodes-base.httpRequest", "nodes-base.webhook", etc. Same format as get_node_info.',
        },
      },
      required: ['nodeType'],
    },
  },
  {
    name: 'search_node_properties',
    description: `Search for specific properties within a node. Find authentication options, body parameters, headers, etc. without parsing the entire schema. Returns matching properties with their paths and descriptions. Use this when you need to find specific configuration options like "auth", "header", "body", etc.`,
    inputSchema: {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'Full node type WITH prefix (same as get_node_info).',
        },
        query: {
          type: 'string',
          description: 'Property name or keyword to search for. Examples: "auth", "header", "body", "json", "timeout".',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return. Default 20.',
          default: 20,
        },
      },
      required: ['nodeType', 'query'],
    },
  },
  {
    name: 'get_node_for_task',
    description: `Get pre-configured node settings for common tasks. USE THIS to quickly configure nodes for specific use cases like "post_json_request", "receive_webhook", "query_database", etc. Returns ready-to-use configuration with clear indication of what user must provide. Much faster than figuring out configuration from scratch.`,
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'The task to accomplish. Available tasks: get_api_data, post_json_request, call_api_with_auth, receive_webhook, webhook_with_response, query_postgres, insert_postgres_data, chat_with_ai, ai_agent_workflow, transform_data, filter_data, send_slack_message, send_email. Use list_tasks to see all available tasks.',
        },
      },
      required: ['task'],
    },
  },
  {
    name: 'list_tasks',
    description: `List all available task templates. Use this to discover what pre-configured tasks are available before using get_node_for_task. Tasks are organized by category (HTTP/API, Webhooks, Database, AI, Data Processing, Communication).`,
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Optional category filter: HTTP/API, Webhooks, Database, AI/LangChain, Data Processing, Communication',
        },
      },
    },
  },
  {
    name: 'validate_node_config',
    description: `Validate a node configuration before use. Checks for missing required properties, type errors, security issues, and common mistakes. Returns specific errors, warnings, and suggestions to fix issues. USE THIS before executing workflows to catch errors early.`,
    inputSchema: {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'The node type to validate (e.g., "nodes-base.httpRequest")',
        },
        config: {
          type: 'object',
          description: 'The node configuration to validate',
        },
      },
      required: ['nodeType', 'config'],
    },
  },
  {
    name: 'get_property_dependencies',
    description: `Analyze property dependencies and visibility conditions for a node. Shows which properties control the visibility of others, helping you understand the configuration flow. Optionally provide a partial config to see what would be visible/hidden with those settings.`,
    inputSchema: {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'The node type to analyze (e.g., "nodes-base.httpRequest")',
        },
        config: {
          type: 'object',
          description: 'Optional partial configuration to check visibility impact',
        },
      },
      required: ['nodeType'],
    },
  },
];

/**
 * QUICK REFERENCE for AI Agents:
 * 
 * 1. DISCOVERY FLOW:
 *    - Start: get_database_statistics() - see what's available
 *    - Browse: list_nodes({category:"trigger"}) - find workflow starters  
 *    - Search: search_nodes({query:"slack"}) - SINGLE WORDS ONLY
 *    - Learn: get_node_documentation("nodes-base.slack") - understand usage
 *    - Configure: get_node_info("nodes-base.slack") - get all properties
 * 
 * 2. COMMON NODE TYPES:
 *    Triggers: webhook, schedule, emailReadImap, slackTrigger
 *    Core: httpRequest, code, set, if, merge, splitInBatches
 *    Integrations: slack, gmail, googleSheets, postgres, mongodb
 *    AI: agent, openAi, chainLlm, documentLoader
 * 
 * 3. SEARCH TIPS:
 *    - Always use single words
 *    - Try: service name, action verb, data type
 *    - If fails: use list_nodes with category
 * 
 * 4. PROPERTY TIPS:
 *    - Look for "required": true first
 *    - Ignore complex "displayOptions" initially
 *    - Use "default" values as guidance
 *    - Simpler properties have no displayOptions
 */