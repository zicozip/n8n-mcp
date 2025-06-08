import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
// WebSocketServerTransport is not available in the SDK, we'll implement a custom solution
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { NodeDocumentationService } from '../services/node-documentation-service';
import { nodeDocumentationTools } from './tools-v2';
import { logger } from '../utils/logger';
import { authenticateRequest } from '../utils/auth-middleware';
import * as crypto from 'crypto';

interface HttpServerConfig {
  port: number;
  host: string;
  domain: string;
  authToken?: string;
  cors?: boolean;
  tlsCert?: string;
  tlsKey?: string;
}

/**
 * HTTP/WebSocket MCP Server for remote access
 */
export class N8NDocumentationHttpServer {
  private app: express.Application;
  private server: any;
  private wss!: WebSocketServer;
  private nodeService: NodeDocumentationService;
  private config: HttpServerConfig;
  private activeSessions: Map<string, any> = new Map();

  constructor(config: HttpServerConfig) {
    this.config = config;
    this.app = express();
    this.nodeService = new NodeDocumentationService();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupMiddleware(): void {
    // JSON parsing
    this.app.use(express.json());
    
    // CORS if enabled
    if (this.config.cors) {
      this.app.use((req, res, next): void => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
        userAgent: req.get('user-agent')
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
        uptime: process.uptime()
      });
    });

    // MCP info endpoint
    this.app.get('/mcp', (req, res) => {
      res.json({
        name: 'n8n-node-documentation',
        version: '2.0.0',
        description: 'MCP server providing n8n node documentation and source code',
        transport: 'websocket',
        endpoint: `wss://${this.config.domain}/mcp/websocket`,
        authentication: 'bearer-token',
        tools: nodeDocumentationTools.map(t => ({
          name: t.name,
          description: t.description
        }))
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
  }

  private setupWebSocket(): void {
    // Create HTTP server
    this.server = createServer(this.app);
    
    // Create WebSocket server
    this.wss = new WebSocketServer({ 
      server: this.server,
      path: '/mcp/websocket'
    });

    this.wss.on('connection', async (ws: WebSocket, req: any) => {
      const sessionId = crypto.randomUUID();
      logger.info(`WebSocket connection established: ${sessionId}`);

      // Authenticate WebSocket connection
      const authHeader = req.headers.authorization;
      if (this.config.authToken && authHeader !== `Bearer ${this.config.authToken}`) {
        logger.warn(`Unauthorized WebSocket connection attempt: ${sessionId}`);
        ws.close(1008, 'Unauthorized');
        return;
      }

      try {
        // Create MCP server instance for this connection
        const mcpServer = new Server(
          {
            name: 'n8n-node-documentation',
            version: '2.0.0',
          },
          {
            capabilities: {
              tools: {},
              resources: {},
            },
          }
        );

        // Setup MCP handlers
        this.setupMcpHandlers(mcpServer);

        // WebSocket transport not available in SDK - implement JSON-RPC over WebSocket
        // For now, we'll handle messages directly
        ws.on('message', async (data: Buffer) => {
          try {
            const request = JSON.parse(data.toString());
            // Process request through MCP server handlers
            // This would need custom implementation
            logger.warn('WebSocket MCP not fully implemented yet');
            ws.send(JSON.stringify({
              jsonrpc: '2.0',
              id: request.id,
              error: {
                code: -32601,
                message: 'WebSocket transport not implemented'
              }
            }));
          } catch (error) {
            logger.error('WebSocket message error:', error);
          }
        });
        
        this.activeSessions.set(sessionId, { mcpServer, ws });
        logger.info(`MCP session established: ${sessionId}`);

        // Handle disconnect
        ws.on('close', () => {
          logger.info(`WebSocket connection closed: ${sessionId}`);
          this.activeSessions.delete(sessionId);
        });

      } catch (error) {
        logger.error(`Failed to establish MCP session: ${sessionId}`, error);
        ws.close(1011, 'Server error');
      }
    });
  }

  private setupMcpHandlers(server: Server): void {
    // List available tools
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: nodeDocumentationTools,
    }));

    // List available resources
    server.setRequestHandler(ListResourcesRequestSchema, async () => ({
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
    }));

    // Read resources
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      try {
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
      } catch (error) {
        logger.error('Resource read error:', error);
        throw error instanceof McpError ? error : new McpError(
          ErrorCode.InternalError,
          `Failed to read resource: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });

    // Handle tool calls
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
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
      } catch (error) {
        logger.error(`Tool execution error (${name}):`, error);
        throw error instanceof McpError ? error : new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }

  // Tool handlers (copied from server-v2.ts)
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
    return new Promise((resolve) => {
      this.server.listen(this.config.port, this.config.host, () => {
        logger.info(`n8n Documentation MCP HTTP server started`);
        logger.info(`HTTP endpoint: http://${this.config.host}:${this.config.port}`);
        logger.info(`WebSocket endpoint: ws://${this.config.host}:${this.config.port}/mcp/websocket`);
        logger.info(`Domain: ${this.config.domain}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    logger.info('Stopping n8n Documentation MCP HTTP server...');
    
    // Close all WebSocket connections
    this.wss.clients.forEach((ws: WebSocket) => ws.close());
    
    // Close HTTP server
    return new Promise((resolve) => {
      this.server.close(() => {
        this.nodeService.close();
        logger.info('Server stopped');
        resolve();
      });
    });
  }
}