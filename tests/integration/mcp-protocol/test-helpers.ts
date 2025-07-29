import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Transport } from '@modelcontextprotocol/sdk';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema,
  InitializeRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
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
        const result = await this.mcpServer.executeTool(request.params.name, request.params.arguments || {});
        
        // Convert result to content array if needed
        if (Array.isArray(result) && result.length > 0 && result[0].content) {
          return result;
        }
        
        return {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`
            }
          ],
          isError: true
        };
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
    await this.server.connect(transport);
  }

  async close(): Promise<void> {
    // The server handles closing the transport
    await this.mcpServer.shutdown();
  }
}