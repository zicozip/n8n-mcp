import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
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
import { MCPServerConfig } from '../types';

/**
 * MCP Server focused on serving n8n node documentation and code
 */
export class N8NDocumentationMCPServer {
  private server: Server;
  private nodeService: NodeDocumentationService;
  
  constructor(config: MCPServerConfig) {
    logger.info('Initializing n8n Documentation MCP server', { config });
    
    this.server = new Server(
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

    this.nodeService = new NodeDocumentationService();
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: nodeDocumentationTools,
    }));

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
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
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
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

        // Handle specific node URIs like nodes://info/n8n-nodes-base.if
        const nodeMatch = uri.match(/^nodes:\/\/info\/(.+)$/);
        if (nodeMatch) {
          const nodeType = nodeMatch[1];
          const nodeInfo = await this.nodeService.getNodeInfo(nodeType);
          
          if (!nodeInfo) {
            throw new McpError(ErrorCode.InvalidRequest, `Node not found: ${nodeType}`);
          }

          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(nodeInfo, null, 2),
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
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
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

  private async handleListNodes(args: any): Promise<any> {
    const nodes = await this.nodeService.listNodes();
    
    // Apply filters
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

    // Filter by documentation if requested
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
    logger.info('Starting database rebuild...');
    
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
    logger.info('Starting n8n Documentation MCP server...');
    
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    logger.info('n8n Documentation MCP server started successfully');
  }

  async stop(): Promise<void> {
    logger.info('Stopping n8n Documentation MCP server...');
    await this.server.close();
    this.nodeService.close();
    logger.info('Server stopped');
  }
}