import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema,
  InitializeRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { N8NDocumentationMCPServer } from '../../../src/mcp/server';

export class TestableN8NMCPServer {
  private mcpServer: N8NDocumentationMCPServer;
  private server: Server;
  private transport?: Transport;

  constructor() {
    this.server = new Server({
      name: 'n8n-documentation-mcp',
      version: '1.0.0'
    }, {
      capabilities: {
        tools: {}
      }
    });
    
    this.mcpServer = new N8NDocumentationMCPServer();
    this.setupHandlers();
  }

  private setupHandlers() {
    // Initialize handler
    this.server.setRequestHandler(InitializeRequestSchema, async () => {
      return {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: 'n8n-documentation-mcp',
          version: '1.0.0'
        }
      };
    });

    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = await this.mcpServer.executeTool('tools/list', {});
      return tools;
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        // The mcpServer.executeTool returns raw data, we need to wrap it in the MCP response format
        const result = await this.mcpServer.executeTool(request.params.name, request.params.arguments || {});
        
        return {
          content: [
            {
              type: 'text' as const,
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error: any) {
        // If it's already an MCP error, throw it as is
        if (error.code && error.message) {
          throw error;
        }
        // Otherwise, wrap it in an MCP error
        throw new McpError(
          ErrorCode.InternalError,
          error.message || 'Unknown error'
        );
      }
    });
  }

  async initialize(): Promise<void> {
    // The MCP server initializes its database lazily
    // We can trigger initialization by calling executeTool
    try {
      await this.mcpServer.executeTool('get_database_statistics', {});
    } catch (error) {
      // Ignore errors, we just want to trigger initialization
    }
  }

  async connectToTransport(transport: Transport): Promise<void> {
    this.transport = transport;
    
    // Ensure transport has required properties before connecting
    if (!transport || typeof transport !== 'object') {
      throw new Error('Invalid transport provided');
    }
    
    // Set up any missing transport handlers to prevent "Cannot set properties of undefined" errors
    if (transport && typeof transport === 'object') {
      const transportAny = transport as any;
      if (transportAny.serverTransport && !transportAny.serverTransport.onclose) {
        transportAny.serverTransport.onclose = () => {};
      }
    }
    
    await this.server.connect(transport);
  }

  async close(): Promise<void> {
    // The server handles closing the transport
    await this.mcpServer.shutdown();
  }
}