import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema,
  InitializeRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { N8NDocumentationMCPServer } from '../../../src/mcp/server';

let sharedMcpServer: N8NDocumentationMCPServer | null = null;

export class TestableN8NMCPServer {
  private mcpServer: N8NDocumentationMCPServer;
  private server: Server;
  private transports = new Set<Transport>();
  private connections = new Set<any>();

  constructor() {
    // Use the production database for performance tests
    // This ensures we have real data for meaningful performance testing
    delete process.env.NODE_DB_PATH;
    
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
    
    // Track this transport for cleanup
    this.transports.add(transport);
    
    const connection = await this.server.connect(transport);
    this.connections.add(connection);
  }

  async close(): Promise<void> {
    // Close all connections first
    for (const connection of this.connections) {
      try {
        if (connection && typeof connection.close === 'function') {
          await connection.close();
        }
      } catch (error) {
        // Ignore errors during connection cleanup
      }
    }
    this.connections.clear();
    
    // Close all tracked transports
    const closePromises: Promise<void>[] = [];
    
    for (const transport of this.transports) {
      try {
        // Force close all transports
        const transportAny = transport as any;
        
        // Try different close methods
        if (transportAny.close && typeof transportAny.close === 'function') {
          closePromises.push(transportAny.close());
        }
        if (transportAny.serverTransport?.close) {
          closePromises.push(transportAny.serverTransport.close());
        }
        if (transportAny.clientTransport?.close) {
          closePromises.push(transportAny.clientTransport.close());
        }
      } catch (error) {
        // Ignore errors during transport cleanup
      }
    }
    
    // Wait for all transports to close
    await Promise.allSettled(closePromises);
    
    // Clear the transports set
    this.transports.clear();
    
    // Don't shut down the shared MCP server instance
  }
  
  static async shutdownShared(): Promise<void> {
    if (sharedMcpServer) {
      await sharedMcpServer.shutdown();
      sharedMcpServer = null;
    }
  }
}