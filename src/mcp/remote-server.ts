import express from 'express';
import { createServer as createHttpServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import {
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { NodeDocumentationService } from '../services/node-documentation-service';
import { nodeDocumentationTools } from './tools-v2';
import { logger } from '../utils/logger';
import { authenticateRequest } from '../utils/auth-middleware';
import * as fs from 'fs';

interface RemoteServerConfig {
  port: number;
  host: string;
  domain: string;
  authToken?: string;
  cors?: boolean;
  tlsCert?: string;
  tlsKey?: string;
}

/**
 * Remote MCP Server using Streamable HTTP transport
 * Based on MCP's modern approach for remote servers
 */
export class N8NDocumentationRemoteServer {
  private app: express.Application;
  private server: any;
  private nodeService: NodeDocumentationService;
  private config: RemoteServerConfig;

  constructor(config: RemoteServerConfig) {
    this.config = config;
    this.app = express();
    this.nodeService = new NodeDocumentationService();
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Parse JSON bodies with larger limit for MCP messages
    this.app.use(express.json({ limit: '10mb' }));
    
    // CORS if enabled
    if (this.config.cors) {
      this.app.use((req, res, next): void => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID');
        if (req.method === 'OPTIONS') {
          res.sendStatus(200);
          return;
        }
        next();
      });
    }
    
    // Request logging
    this.app.use((req, res, next): void => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('user-agent'),
        requestId: req.get('X-Request-ID')
      });
      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        service: 'n8n-documentation-mcp',
        version: '2.0.0',
        uptime: process.uptime(),
        domain: this.config.domain
      });
    });

    // MCP info endpoint - provides server capabilities
    this.app.get('/', (req, res) => {
      res.json({
        name: 'n8n-node-documentation',
        version: '2.0.0',
        description: 'MCP server providing n8n node documentation and source code',
        transport: 'http',
        endpoint: `https://${this.config.domain}/mcp`,
        authentication: this.config.authToken ? 'bearer-token' : 'none',
        capabilities: {
          tools: nodeDocumentationTools.map(t => ({
            name: t.name,
            description: t.description
          })),
          resources: [
            {
              uri: 'nodes://list',
              name: 'Available n8n Nodes',
              description: 'List of all available n8n nodes',
            },
            {
              uri: 'nodes://statistics',
              name: 'Database Statistics',
              description: 'Statistics about the node documentation database',
            },
          ]
        }
      });
    });

    // Database stats endpoint (public)
    this.app.get('/stats', async (req, res) => {
      try {
        const stats = this.nodeService.getStatistics();
        res.json(stats);
      } catch (error) {
        logger.error('Failed to get statistics:', error);
        res.status(500).json({ error: 'Failed to retrieve statistics' });
      }
    });

    // Rebuild endpoint (requires auth)
    this.app.post('/rebuild', authenticateRequest(this.config.authToken), async (req, res) => {
      try {
        logger.info('Database rebuild requested');
        const stats = await this.nodeService.rebuildDatabase();
        res.json({
          message: 'Database rebuild complete',
          stats
        });
      } catch (error) {
        logger.error('Rebuild failed:', error);
        res.status(500).json({ error: 'Rebuild failed' });
      }
    });

    // Main MCP endpoint - handles all MCP protocol messages
    this.app.post('/mcp', authenticateRequest(this.config.authToken), async (req, res) => {
      const requestId = req.get('X-Request-ID') || 'unknown';
      
      try {
        // Process the JSON-RPC request directly
        const response = await this.handleJsonRpcRequest(req.body);
        res.json(response);
      } catch (error) {
        logger.error(`MCP request failed (${requestId}):`, error);
        
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            id: req.body?.id || null,
            error: {
              code: -32603,
              message: 'Internal error',
              data: error instanceof Error ? error.message : String(error)
            }
          });
        }
      }
    });
  }

  private async handleJsonRpcRequest(request: any): Promise<any> {
    const { jsonrpc, method, params, id } = request;

    if (jsonrpc !== '2.0') {
      return {
        jsonrpc: '2.0',
        id: id || null,
        error: {
          code: -32600,
          message: 'Invalid Request',
          data: 'JSON-RPC version must be "2.0"'
        }
      };
    }

    try {
      let result;

      switch (method) {
        case 'tools/list':
          result = await this.handleListTools();
          break;

        case 'resources/list':
          result = await this.handleListResources();
          break;

        case 'resources/read':
          result = await this.handleReadResource(params);
          break;

        case 'tools/call':
          result = await this.handleToolCall(params);
          break;

        default:
          return {
            jsonrpc: '2.0',
            id: id || null,
            error: {
              code: -32601,
              message: 'Method not found',
              data: `Unknown method: ${method}`
            }
          };
      }

      return {
        jsonrpc: '2.0',
        id: id || null,
        result
      };
    } catch (error) {
      logger.error(`Error handling method ${method}:`, error);
      
      const errorCode = error instanceof McpError ? error.code : -32603;
      const errorMessage = error instanceof Error ? error.message : 'Internal error';
      
      return {
        jsonrpc: '2.0',
        id: id || null,
        error: {
          code: errorCode,
          message: errorMessage,
          data: error instanceof McpError ? error.data : undefined
        }
      };
    }
  }

  private async handleListTools(): Promise<any> {
    return {
      tools: nodeDocumentationTools,
    };
  }

  private async handleListResources(): Promise<any> {
    return {
      resources: [
        {
          uri: 'nodes://list',
          name: 'Available n8n Nodes',
          description: 'List of all available n8n nodes',
          mimeType: 'application/json',
        },
        {
          uri: 'nodes://statistics',
          name: 'Database Statistics',
          description: 'Statistics about the node documentation database',
          mimeType: 'application/json',
        },
      ],
    };
  }

  private async handleReadResource(params: any): Promise<any> {
    const { uri } = params;

    if (uri === 'nodes://list') {
      const nodes = await this.nodeService.listNodes();
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(nodes.map(n => ({
              nodeType: n.nodeType,
              name: n.name,
              displayName: n.displayName,
              category: n.category,
              description: n.description,
              hasDocumentation: !!n.documentation,
              hasExample: !!n.exampleWorkflow,
            })), null, 2),
          },
        ],
      };
    }

    if (uri === 'nodes://statistics') {
      const stats = this.nodeService.getStatistics();
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(stats, null, 2),
          },
        ],
      };
    }

    throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
  }

  private async handleToolCall(params: any): Promise<any> {
    const { name, arguments: args } = params;

    switch (name) {
      case 'list_nodes':
        return await this.handleListNodes(args);
      
      case 'get_node_info':
        return await this.handleGetNodeInfo(args);
      
      case 'search_nodes':
        return await this.handleSearchNodes(args);
      
      case 'get_node_example':
        return await this.handleGetNodeExample(args);
      
      case 'get_node_source_code':
        return await this.handleGetNodeSourceCode(args);
      
      case 'get_node_documentation':
        return await this.handleGetNodeDocumentation(args);
      
      case 'rebuild_database':
        return await this.handleRebuildDatabase(args);
      
      case 'get_database_statistics':
        return await this.handleGetStatistics();
      
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  }

  // Tool handlers
  private async handleListNodes(args: any): Promise<any> {
    const nodes = await this.nodeService.listNodes();
    
    let filtered = nodes;
    
    if (args.category) {
      filtered = filtered.filter(n => n.category === args.category);
    }
    
    if (args.packageName) {
      filtered = filtered.filter(n => n.packageName === args.packageName);
    }
    
    if (args.isTrigger !== undefined) {
      filtered = filtered.filter(n => n.isTrigger === args.isTrigger);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(filtered.map(n => ({
            nodeType: n.nodeType,
            name: n.name,
            displayName: n.displayName,
            category: n.category,
            description: n.description,
            packageName: n.packageName,
            hasDocumentation: !!n.documentation,
            hasExample: !!n.exampleWorkflow,
            isTrigger: n.isTrigger,
            isWebhook: n.isWebhook,
          })), null, 2),
        },
      ],
    };
  }

  private async handleGetNodeInfo(args: any): Promise<any> {
    if (!args.nodeType) {
      throw new McpError(ErrorCode.InvalidParams, 'nodeType is required');
    }

    const nodeInfo = await this.nodeService.getNodeInfo(args.nodeType);
    
    if (!nodeInfo) {
      throw new McpError(ErrorCode.InvalidRequest, `Node not found: ${args.nodeType}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            nodeType: nodeInfo.nodeType,
            name: nodeInfo.name,
            displayName: nodeInfo.displayName,
            description: nodeInfo.description,
            category: nodeInfo.category,
            packageName: nodeInfo.packageName,
            sourceCode: nodeInfo.sourceCode,
            credentialCode: nodeInfo.credentialCode,
            documentation: nodeInfo.documentation,
            documentationUrl: nodeInfo.documentationUrl,
            exampleWorkflow: nodeInfo.exampleWorkflow,
            exampleParameters: nodeInfo.exampleParameters,
            propertiesSchema: nodeInfo.propertiesSchema,
            isTrigger: nodeInfo.isTrigger,
            isWebhook: nodeInfo.isWebhook,
          }, null, 2),
        },
      ],
    };
  }

  private async handleSearchNodes(args: any): Promise<any> {
    if (!args.query) {
      throw new McpError(ErrorCode.InvalidParams, 'query is required');
    }

    const results = await this.nodeService.searchNodes({
      query: args.query,
      category: args.category,
      limit: args.limit || 20,
    });

    let filtered = results;
    if (args.hasDocumentation) {
      filtered = filtered.filter(n => !!n.documentation);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(filtered.map(n => ({
            nodeType: n.nodeType,
            name: n.name,
            displayName: n.displayName,
            category: n.category,
            description: n.description,
            hasDocumentation: !!n.documentation,
            hasExample: !!n.exampleWorkflow,
          })), null, 2),
        },
      ],
    };
  }

  private async handleGetNodeExample(args: any): Promise<any> {
    if (!args.nodeType) {
      throw new McpError(ErrorCode.InvalidParams, 'nodeType is required');
    }

    const nodeInfo = await this.nodeService.getNodeInfo(args.nodeType);
    
    if (!nodeInfo) {
      throw new McpError(ErrorCode.InvalidRequest, `Node not found: ${args.nodeType}`);
    }

    if (!nodeInfo.exampleWorkflow) {
      return {
        content: [
          {
            type: 'text',
            text: `No example available for node: ${args.nodeType}`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(nodeInfo.exampleWorkflow, null, 2),
        },
      ],
    };
  }

  private async handleGetNodeSourceCode(args: any): Promise<any> {
    if (!args.nodeType) {
      throw new McpError(ErrorCode.InvalidParams, 'nodeType is required');
    }

    const nodeInfo = await this.nodeService.getNodeInfo(args.nodeType);
    
    if (!nodeInfo) {
      throw new McpError(ErrorCode.InvalidRequest, `Node not found: ${args.nodeType}`);
    }

    const response: any = {
      nodeType: nodeInfo.nodeType,
      sourceCode: nodeInfo.sourceCode,
    };

    if (args.includeCredentials && nodeInfo.credentialCode) {
      response.credentialCode = nodeInfo.credentialCode;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  }

  private async handleGetNodeDocumentation(args: any): Promise<any> {
    if (!args.nodeType) {
      throw new McpError(ErrorCode.InvalidParams, 'nodeType is required');
    }

    const nodeInfo = await this.nodeService.getNodeInfo(args.nodeType);
    
    if (!nodeInfo) {
      throw new McpError(ErrorCode.InvalidRequest, `Node not found: ${args.nodeType}`);
    }

    if (!nodeInfo.documentation) {
      return {
        content: [
          {
            type: 'text',
            text: `No documentation available for node: ${args.nodeType}`,
          },
        ],
      };
    }

    const content = args.format === 'plain' 
      ? nodeInfo.documentation.replace(/[#*`]/g, '') 
      : nodeInfo.documentation;

    return {
      content: [
        {
          type: 'text',
          text: content,
        },
      ],
    };
  }

  private async handleRebuildDatabase(args: any): Promise<any> {
    logger.info('Database rebuild requested via MCP');
    
    const stats = await this.nodeService.rebuildDatabase();
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            message: 'Database rebuild complete',
            stats,
          }, null, 2),
        },
      ],
    };
  }

  private async handleGetStatistics(): Promise<any> {
    const stats = this.nodeService.getStatistics();
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(stats, null, 2),
        },
      ],
    };
  }

  async start(): Promise<void> {
    // Create server (HTTP or HTTPS)
    if (this.config.tlsCert && this.config.tlsKey) {
      const tlsOptions = {
        cert: fs.readFileSync(this.config.tlsCert),
        key: fs.readFileSync(this.config.tlsKey),
      };
      this.server = createHttpsServer(tlsOptions, this.app);
    } else {
      this.server = createHttpServer(this.app);
    }

    return new Promise((resolve) => {
      this.server.listen(this.config.port, this.config.host, () => {
        const protocol = this.config.tlsCert ? 'https' : 'http';
        logger.info(`n8n Documentation MCP Remote server started`);
        logger.info(`Endpoint: ${protocol}://${this.config.host}:${this.config.port}`);
        logger.info(`Domain: ${this.config.domain}`);
        logger.info(`MCP endpoint: ${protocol}://${this.config.domain}/mcp`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    logger.info('Stopping n8n Documentation MCP Remote server...');
    
    return new Promise((resolve) => {
      this.server.close(() => {
        this.nodeService.close();
        logger.info('Server stopped');
        resolve();
      });
    });
  }
}