import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema, 
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { MCPServerConfig, N8NConfig } from '../types';
import { n8nTools } from './tools';
import { n8nResources } from './resources';
import { n8nPrompts } from './prompts';
import { N8NApiClient } from '../utils/n8n-client';
import { N8NMCPBridge } from '../utils/bridge';
import { logger } from '../utils/logger';

export class N8NMCPServer {
  private server: Server;
  private n8nClient: N8NApiClient;

  constructor(config: MCPServerConfig, n8nConfig: N8NConfig) {
    this.n8nClient = new N8NApiClient(n8nConfig);
    logger.info('Initializing n8n MCP server', { config, n8nConfig });
    this.server = new Server(
      {
        name: 'n8n-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Handle tool listing
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: n8nTools,
    }));

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        logger.debug(`Executing tool: ${name}`, { args });
        const result = await this.executeTool(name, args);
        logger.debug(`Tool ${name} executed successfully`, { result });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error(`Error executing tool ${name}`, error);
        return {
          content: [
            {
              type: 'text',
              text: `Error executing tool ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    });

    // Handle resource listing
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: n8nResources,
    }));

    // Handle resource reading
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      
      try {
        logger.debug(`Reading resource: ${uri}`);
        const content = await this.readResource(uri);
        logger.debug(`Resource ${uri} read successfully`);
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(content, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error(`Failed to read resource ${uri}`, error);
        throw new Error(`Failed to read resource ${uri}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });

    // Handle prompt listing
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: n8nPrompts,
    }));

    // Handle prompt retrieval
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      const prompt = n8nPrompts.find(p => p.name === name);
      if (!prompt) {
        throw new Error(`Prompt ${name} not found`);
      }

      const promptText = await this.generatePrompt(name, args);
      
      return {
        description: prompt.description,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: promptText,
            },
          },
        ],
      };
    });
  }

  private async executeTool(name: string, args: any): Promise<any> {
    // Tool execution logic based on specific n8n operations
    switch (name) {
      case 'execute_workflow':
        return this.executeWorkflow(args);
      case 'list_workflows':
        return this.listWorkflows(args);
      case 'get_workflow':
        return this.getWorkflow(args);
      case 'create_workflow':
        return this.createWorkflow(args);
      case 'update_workflow':
        return this.updateWorkflow(args);
      case 'delete_workflow':
        return this.deleteWorkflow(args);
      case 'get_executions':
        return this.getExecutions(args);
      case 'get_execution_data':
        return this.getExecutionData(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private async readResource(uri: string): Promise<any> {
    // Resource reading logic will be implemented
    if (uri.startsWith('workflow://')) {
      const workflowId = uri.replace('workflow://', '');
      return this.getWorkflow({ id: workflowId });
    }
    throw new Error(`Unknown resource URI: ${uri}`);
  }

  private async generatePrompt(name: string, args: any): Promise<string> {
    // Prompt generation logic will be implemented
    switch (name) {
      case 'create_workflow_prompt':
        return `Create an n8n workflow that ${args.description}`;
      case 'debug_workflow_prompt':
        return `Debug the n8n workflow with ID ${args.workflowId} and identify any issues`;
      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  }

  // n8n integration methods
  private async executeWorkflow(args: any): Promise<any> {
    try {
      const result = await this.n8nClient.executeWorkflow(args.workflowId, args.data);
      return N8NMCPBridge.sanitizeData(result);
    } catch (error) {
      throw new Error(`Failed to execute workflow: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async listWorkflows(args: any): Promise<any> {
    try {
      const workflows = await this.n8nClient.getWorkflows(args);
      return {
        workflows: workflows.data.map((wf: any) => N8NMCPBridge.n8nWorkflowToMCP(wf)),
      };
    } catch (error) {
      throw new Error(`Failed to list workflows: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async getWorkflow(args: any): Promise<any> {
    try {
      const workflow = await this.n8nClient.getWorkflow(args.id);
      return N8NMCPBridge.n8nWorkflowToMCP(workflow);
    } catch (error) {
      throw new Error(`Failed to get workflow: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async createWorkflow(args: any): Promise<any> {
    try {
      const workflowData = N8NMCPBridge.mcpToN8NWorkflow(args);
      const result = await this.n8nClient.createWorkflow(workflowData);
      return N8NMCPBridge.n8nWorkflowToMCP(result);
    } catch (error) {
      throw new Error(`Failed to create workflow: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async updateWorkflow(args: any): Promise<any> {
    try {
      const result = await this.n8nClient.updateWorkflow(args.id, args.updates);
      return N8NMCPBridge.n8nWorkflowToMCP(result);
    } catch (error) {
      throw new Error(`Failed to update workflow: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async deleteWorkflow(args: any): Promise<any> {
    try {
      await this.n8nClient.deleteWorkflow(args.id);
      return { success: true, id: args.id };
    } catch (error) {
      throw new Error(`Failed to delete workflow: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async getExecutions(args: any): Promise<any> {
    try {
      const executions = await this.n8nClient.getExecutions(args);
      return {
        executions: executions.data.map((exec: any) => N8NMCPBridge.n8nExecutionToMCPResource(exec)),
      };
    } catch (error) {
      throw new Error(`Failed to get executions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async getExecutionData(args: any): Promise<any> {
    try {
      const execution = await this.n8nClient.getExecution(args.executionId);
      return N8NMCPBridge.n8nExecutionToMCPResource(execution);
    } catch (error) {
      throw new Error(`Failed to get execution data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async start(): Promise<void> {
    try {
      logger.info('Starting n8n MCP server...');
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      logger.info('n8n MCP server started successfully');
    } catch (error) {
      logger.error('Failed to start MCP server', error);
      throw error;
    }
  }
}