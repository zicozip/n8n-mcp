import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createDatabaseAdapter, DatabaseAdapter } from '../database/database-adapter';
import { logger } from '../utils/logger';

interface OptimizedNode {
  nodeType: string;
  packageName: string;
  displayName: string;
  description: string;
  category: string;
  nodeSourceCode?: string;
  credentialSourceCode?: string;
  sourceLocation?: string;
  properties?: any[];
  operations?: any[];
  documentation?: string;
  isAITool?: boolean;
  isTrigger?: boolean;
}

/**
 * Optimized MCP Server that reads everything from pre-built database
 * No runtime dependency on n8n packages
 */
export class OptimizedMCPServer {
  private server: Server;
  private db: DatabaseAdapter | null = null;
  private transport: StdioServerTransport;

  constructor() {
    this.server = new Server(
      {
        name: 'n8n-mcp-optimized',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    
    this.transport = new StdioServerTransport();
    this.setupHandlers();
  }

  private async initDatabase() {
    const dbPath = process.env.NODE_DB_PATH || './data/nodes.db';
    this.db = await createDatabaseAdapter(dbPath);
    logger.info('Database initialized');
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'list_nodes',
            description: 'List all available n8n nodes with filtering options',
            inputSchema: {
              type: 'object',
              properties: {
                category: { type: 'string', description: 'Filter by category' },
                packageName: { type: 'string', description: 'Filter by package' },
                isAITool: { type: 'boolean', description: 'Filter AI-capable nodes' },
                isTrigger: { type: 'boolean', description: 'Filter trigger nodes' },
                limit: { type: 'number', description: 'Max results', default: 50 }
              }
            }
          },
          {
            name: 'get_node_info',
            description: 'Get comprehensive information about a specific n8n node',
            inputSchema: {
              type: 'object',
              properties: {
                nodeType: { type: 'string', description: 'Node type identifier' }
              },
              required: ['nodeType']
            }
          },
          {
            name: 'search_nodes', 
            description: 'Full-text search across all nodes',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Search query' },
                limit: { type: 'number', description: 'Max results', default: 20 }
              },
              required: ['query']
            }
          },
          {
            name: 'list_ai_tools',
            description: 'List all AI-capable n8n nodes',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          },
          {
            name: 'get_node_source',
            description: 'Get source code for a specific node',
            inputSchema: {
              type: 'object',
              properties: {
                nodeType: { type: 'string', description: 'Node type identifier' }
              },
              required: ['nodeType']
            }
          },
          {
            name: 'get_database_statistics',
            description: 'Get statistics about the node database',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          }
        ]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      if (!this.db) {
        await this.initDatabase();
      }

      try {
        switch (name) {
          case 'list_nodes':
            return await this.listNodes(args);
          case 'get_node_info':
            return await this.getNodeInfo(args);
          case 'search_nodes':
            return await this.searchNodes(args);
          case 'list_ai_tools':
            return await this.listAITools();
          case 'get_node_source':
            return await this.getNodeSource(args);
          case 'get_database_statistics':
            return await this.getDatabaseStatistics();
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        logger.error(`Tool execution failed: ${name}`, error);
        throw error;
      }
    });
  }

  private async listNodes(args: any) {
    const conditions: string[] = ['1=1'];
    const params: any[] = [];
    
    if (args.category) {
      conditions.push('category = ?');
      params.push(args.category);
    }
    
    if (args.packageName) {
      conditions.push('package_name = ?');
      params.push(args.packageName);
    }
    
    if (args.isAITool !== undefined) {
      conditions.push('is_ai_tool = ?');
      params.push(args.isAITool ? 1 : 0);
    }
    
    if (args.isTrigger !== undefined) {
      conditions.push('is_trigger = ?');
      params.push(args.isTrigger ? 1 : 0);
    }
    
    params.push(args.limit || 50);
    
    const query = `
      SELECT node_type, package_name, display_name, description, category, 
             is_ai_tool, is_trigger, is_webhook
      FROM nodes 
      WHERE ${conditions.join(' AND ')}
      LIMIT ?
    `;
    
    const nodes = this.db!.prepare(query).all(...params);
    
    return {
      nodes: nodes.map((n: any) => ({
        nodeType: n.node_type,
        packageName: n.package_name,
        displayName: n.display_name,
        description: n.description,
        category: n.category,
        isAITool: n.is_ai_tool === 1,
        isTrigger: n.is_trigger === 1,
        isWebhook: n.is_webhook === 1
      })),
      total: nodes.length
    };
  }

  private async getNodeInfo(args: any) {
    const query = `
      SELECT * FROM nodes WHERE node_type = ?
    `;
    
    const node = this.db!.prepare(query).get(args.nodeType);
    
    if (!node) {
      throw new Error(`Node ${args.nodeType} not found`);
    }
    
    return {
      nodeType: node.node_type,
      packageName: node.package_name,
      displayName: node.display_name,
      description: node.description,
      category: node.category,
      developmentStyle: node.development_style,
      isAITool: node.is_ai_tool === 1,
      isTrigger: node.is_trigger === 1,
      isWebhook: node.is_webhook === 1,
      isVersioned: node.is_versioned === 1,
      version: node.version,
      documentation: node.documentation,
      properties: JSON.parse(node.properties_schema || '[]'),
      operations: JSON.parse(node.operations || '[]'),
      credentialsRequired: JSON.parse(node.credentials_required || '[]'),
      sourceExtractedAt: node.source_extracted_at
    };
  }

  private async searchNodes(args: any) {
    const query = `
      SELECT n.* FROM nodes n
      JOIN nodes_fts ON n.rowid = nodes_fts.rowid
      WHERE nodes_fts MATCH ?
      LIMIT ?
    `;
    
    const results = this.db!.prepare(query).all(args.query, args.limit || 20);
    
    return {
      nodes: results.map((n: any) => ({
        nodeType: n.node_type,
        displayName: n.display_name,
        description: n.description,
        category: n.category,
        packageName: n.package_name,
        relevance: n.rank
      })),
      total: results.length
    };
  }

  private async listAITools() {
    const query = `
      SELECT node_type, display_name, description, category, package_name
      FROM nodes 
      WHERE is_ai_tool = 1
      ORDER BY display_name
    `;
    
    const nodes = this.db!.prepare(query).all();
    
    return {
      aiTools: nodes.map((n: any) => ({
        nodeType: n.node_type,
        displayName: n.display_name,
        description: n.description,
        category: n.category,
        packageName: n.package_name
      })),
      total: nodes.length
    };
  }

  private async getNodeSource(args: any) {
    const query = `
      SELECT node_source_code, credential_source_code, source_location
      FROM nodes 
      WHERE node_type = ?
    `;
    
    const result = this.db!.prepare(query).get(args.nodeType);
    
    if (!result) {
      throw new Error(`Node ${args.nodeType} not found`);
    }
    
    return {
      nodeType: args.nodeType,
      sourceCode: result.node_source_code || 'Source code not available',
      credentialCode: result.credential_source_code,
      location: result.source_location
    };
  }

  private async getDatabaseStatistics() {
    const stats = {
      totalNodes: this.db!.prepare('SELECT COUNT(*) as count FROM nodes').get().count,
      aiTools: this.db!.prepare('SELECT COUNT(*) as count FROM nodes WHERE is_ai_tool = 1').get().count,
      triggers: this.db!.prepare('SELECT COUNT(*) as count FROM nodes WHERE is_trigger = 1').get().count,
      webhooks: this.db!.prepare('SELECT COUNT(*) as count FROM nodes WHERE is_webhook = 1').get().count,
      withSource: this.db!.prepare('SELECT COUNT(*) as count FROM nodes WHERE node_source_code IS NOT NULL').get().count,
      withDocs: this.db!.prepare('SELECT COUNT(*) as count FROM nodes WHERE documentation IS NOT NULL').get().count,
      categories: this.db!.prepare('SELECT DISTINCT category FROM nodes').all().map((r: any) => r.category),
      packages: this.db!.prepare('SELECT DISTINCT package_name FROM nodes').all().map((r: any) => r.package_name)
    };
    
    return stats;
  }

  async start() {
    await this.initDatabase();
    await this.server.connect(this.transport);
    logger.info('Optimized MCP Server started');
  }
}

// Start the server if run directly
if (require.main === module) {
  const server = new OptimizedMCPServer();
  server.start().catch(console.error);
}