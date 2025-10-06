/**
 * AI Tool Sub-Node Validators
 *
 * Implements validation logic for all 13 AI tool sub-nodes from
 * docs/FINAL_AI_VALIDATION_SPEC.md
 *
 * Each validator checks configuration requirements, connections, and
 * parameters specific to that tool type.
 */

import { NodeTypeNormalizer } from '../utils/node-type-normalizer';

// Validation constants
const MIN_DESCRIPTION_LENGTH_SHORT = 10;
const MIN_DESCRIPTION_LENGTH_MEDIUM = 15;
const MIN_DESCRIPTION_LENGTH_LONG = 20;
const MAX_ITERATIONS_WARNING_THRESHOLD = 50;
const MAX_TOPK_WARNING_THRESHOLD = 20;

export interface WorkflowNode {
  id: string;
  name: string;
  type: string;
  position: [number, number];
  parameters: any;
  credentials?: any;
  disabled?: boolean;
  typeVersion?: number;
}

export interface WorkflowJson {
  name?: string;
  nodes: WorkflowNode[];
  connections: Record<string, any>;
  settings?: any;
}

export interface ReverseConnection {
  sourceName: string;
  sourceType: string;
  type: string;  // main, ai_tool, ai_languageModel, etc.
  index: number;
}

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  nodeId?: string;
  nodeName?: string;
  message: string;
  code?: string;
}

/**
 * 1. HTTP Request Tool Validator
 * From spec lines 883-1123
 */
export function validateHTTPRequestTool(node: WorkflowNode): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1. Check toolDescription (REQUIRED)
  if (!node.parameters.toolDescription) {
    issues.push({
      severity: 'error',
      nodeId: node.id,
      nodeName: node.name,
      message: `HTTP Request Tool "${node.name}" has no toolDescription. Add a clear description to help the LLM know when to use this API.`,
      code: 'MISSING_TOOL_DESCRIPTION'
    });
  } else if (node.parameters.toolDescription.trim().length < MIN_DESCRIPTION_LENGTH_MEDIUM) {
    issues.push({
      severity: 'warning',
      nodeId: node.id,
      nodeName: node.name,
      message: `HTTP Request Tool "${node.name}" toolDescription is too short (minimum ${MIN_DESCRIPTION_LENGTH_MEDIUM} characters). Explain what API this calls and when to use it.`
    });
  }

  // 2. Check URL (REQUIRED)
  if (!node.parameters.url) {
    issues.push({
      severity: 'error',
      nodeId: node.id,
      nodeName: node.name,
      message: `HTTP Request Tool "${node.name}" has no URL. Add the API endpoint URL.`,
      code: 'MISSING_URL'
    });
  } else {
    // Validate URL protocol (must be http or https)
    try {
      const urlObj = new URL(node.parameters.url);
      if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
        issues.push({
          severity: 'error',
          nodeId: node.id,
          nodeName: node.name,
          message: `HTTP Request Tool "${node.name}" has invalid URL protocol "${urlObj.protocol}". Use http:// or https:// only.`,
          code: 'INVALID_URL_PROTOCOL'
        });
      }
    } catch (e) {
      // URL parsing failed - invalid format
      // Only warn if it's not an n8n expression
      if (!node.parameters.url.includes('{{')) {
        issues.push({
          severity: 'warning',
          nodeId: node.id,
          nodeName: node.name,
          message: `HTTP Request Tool "${node.name}" has potentially invalid URL format. Ensure it's a valid URL or n8n expression.`
        });
      }
    }
  }

  // 3. Validate placeholders match definitions
  if (node.parameters.url || node.parameters.body || node.parameters.headers) {
    const placeholderRegex = /\{([^}]+)\}/g;
    const placeholders = new Set<string>();

    // Extract placeholders from URL, body, headers
    [node.parameters.url, node.parameters.body, JSON.stringify(node.parameters.headers || {})].forEach(text => {
      if (text) {
        let match;
        while ((match = placeholderRegex.exec(text)) !== null) {
          placeholders.add(match[1]);
        }
      }
    });

    // Check if placeholders are defined
    const definitions = node.parameters.placeholderDefinitions?.values || [];
    const definedNames = new Set(definitions.map((d: any) => d.name));

    for (const placeholder of placeholders) {
      if (!definedNames.has(placeholder)) {
        issues.push({
          severity: 'error',
          nodeId: node.id,
          nodeName: node.name,
          message: `HTTP Request Tool "${node.name}" uses placeholder {${placeholder}} but it's not defined in placeholderDefinitions.`,
          code: 'UNDEFINED_PLACEHOLDER'
        });
      }
    }

    // Check for defined but unused placeholders
    for (const def of definitions) {
      if (!placeholders.has(def.name)) {
        issues.push({
          severity: 'warning',
          nodeId: node.id,
          nodeName: node.name,
          message: `HTTP Request Tool "${node.name}" defines placeholder "${def.name}" but doesn't use it.`
        });
      }
    }
  }

  // 4. Validate authentication
  if (node.parameters.authentication === 'predefinedCredentialType' &&
      (!node.credentials || Object.keys(node.credentials).length === 0)) {
    issues.push({
      severity: 'error',
      nodeId: node.id,
      nodeName: node.name,
      message: `HTTP Request Tool "${node.name}" requires credentials but none are configured.`,
      code: 'MISSING_CREDENTIALS'
    });
  }

  // 5. Validate HTTP method
  const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
  if (node.parameters.method && !validMethods.includes(node.parameters.method.toUpperCase())) {
    issues.push({
      severity: 'error',
      nodeId: node.id,
      nodeName: node.name,
      message: `HTTP Request Tool "${node.name}" has invalid HTTP method "${node.parameters.method}". Use one of: ${validMethods.join(', ')}.`,
      code: 'INVALID_HTTP_METHOD'
    });
  }

  // 6. Validate body for POST/PUT/PATCH
  if (['POST', 'PUT', 'PATCH'].includes(node.parameters.method?.toUpperCase())) {
    if (!node.parameters.body && !node.parameters.jsonBody) {
      issues.push({
        severity: 'warning',
        nodeId: node.id,
        nodeName: node.name,
        message: `HTTP Request Tool "${node.name}" uses ${node.parameters.method} but has no body. Consider adding a body or using GET instead.`
      });
    }
  }

  return issues;
}

/**
 * 2. Code Tool Validator
 * From spec lines 1125-1393
 */
export function validateCodeTool(node: WorkflowNode): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1. Check function name (REQUIRED)
  if (!node.parameters.name) {
    issues.push({
      severity: 'error',
      nodeId: node.id,
      nodeName: node.name,
      message: `Code Tool "${node.name}" has no function name. Add a name property.`,
      code: 'MISSING_FUNCTION_NAME'
    });
  } else if (!/^[a-zA-Z0-9_]+$/.test(node.parameters.name)) {
    issues.push({
      severity: 'error',
      nodeId: node.id,
      nodeName: node.name,
      message: `Code Tool "${node.name}" function name "${node.parameters.name}" contains invalid characters. Use only letters, numbers, and underscores.`,
      code: 'INVALID_FUNCTION_NAME'
    });
  } else if (/^\d/.test(node.parameters.name)) {
    issues.push({
      severity: 'error',
      nodeId: node.id,
      nodeName: node.name,
      message: `Code Tool "${node.name}" function name "${node.parameters.name}" cannot start with a number.`,
      code: 'FUNCTION_NAME_STARTS_WITH_NUMBER'
    });
  }

  // 2. Check description (REQUIRED)
  if (!node.parameters.description) {
    issues.push({
      severity: 'error',
      nodeId: node.id,
      nodeName: node.name,
      message: `Code Tool "${node.name}" has no description. Add one to help the LLM understand the tool's purpose.`,
      code: 'MISSING_DESCRIPTION'
    });
  } else if (node.parameters.description.trim().length < MIN_DESCRIPTION_LENGTH_SHORT) {
    issues.push({
      severity: 'warning',
      nodeId: node.id,
      nodeName: node.name,
      message: `Code Tool "${node.name}" description is too short (minimum ${MIN_DESCRIPTION_LENGTH_SHORT} characters). Provide more detail about what the tool does.`
    });
  }

  // 3. Check code exists (REQUIRED)
  if (!node.parameters.code || node.parameters.code.trim().length === 0) {
    issues.push({
      severity: 'error',
      nodeId: node.id,
      nodeName: node.name,
      message: `Code Tool "${node.name}" has no code. Add the JavaScript or Python code to execute.`,
      code: 'MISSING_CODE'
    });
  }

  // 4. Check language validity
  if (node.parameters.language && !['javaScript', 'python'].includes(node.parameters.language)) {
    issues.push({
      severity: 'error',
      nodeId: node.id,
      nodeName: node.name,
      message: `Code Tool "${node.name}" has invalid language "${node.parameters.language}". Use "javaScript" or "python".`,
      code: 'INVALID_LANGUAGE'
    });
  }

  // 5. Recommend input schema
  if (!node.parameters.specifyInputSchema) {
    issues.push({
      severity: 'warning',
      nodeId: node.id,
      nodeName: node.name,
      message: `Code Tool "${node.name}" does not specify an input schema. Consider adding one to validate LLM inputs.`
    });
  } else {
    // 6. Validate schema if specified
    if (node.parameters.schemaType === 'fromJson') {
      if (!node.parameters.jsonSchemaExample) {
        issues.push({
          severity: 'error',
          nodeId: node.id,
          nodeName: node.name,
          message: `Code Tool "${node.name}" uses schemaType="fromJson" but has no jsonSchemaExample.`,
          code: 'MISSING_JSON_SCHEMA_EXAMPLE'
        });
      } else {
        try {
          JSON.parse(node.parameters.jsonSchemaExample);
        } catch (e) {
          issues.push({
            severity: 'error',
            nodeId: node.id,
            nodeName: node.name,
            message: `Code Tool "${node.name}" has invalid JSON schema example.`,
            code: 'INVALID_JSON_SCHEMA'
          });
        }
      }
    } else if (node.parameters.schemaType === 'manual') {
      if (!node.parameters.inputSchema) {
        issues.push({
          severity: 'error',
          nodeId: node.id,
          nodeName: node.name,
          message: `Code Tool "${node.name}" uses schemaType="manual" but has no inputSchema.`,
          code: 'MISSING_INPUT_SCHEMA'
        });
      } else {
        try {
          const schema = JSON.parse(node.parameters.inputSchema);
          if (!schema.type) {
            issues.push({
              severity: 'warning',
              nodeId: node.id,
              nodeName: node.name,
              message: `Code Tool "${node.name}" manual schema should have a 'type' field.`
            });
          }
          if (!schema.properties && schema.type === 'object') {
            issues.push({
              severity: 'warning',
              nodeId: node.id,
              nodeName: node.name,
              message: `Code Tool "${node.name}" object schema should have 'properties' field.`
            });
          }
        } catch (e) {
          issues.push({
            severity: 'error',
            nodeId: node.id,
            nodeName: node.name,
            message: `Code Tool "${node.name}" has invalid JSON schema.`,
            code: 'INVALID_JSON_SCHEMA'
          });
        }
      }
    }
  }

  // 7. Check for common code mistakes
  if (node.parameters.code) {
    const lang = node.parameters.language || 'javaScript';
    if (lang === 'javaScript') {
      // Check if code has return statement or expression
      const hasReturn = /\breturn\b/.test(node.parameters.code);
      const isSingleExpression = !node.parameters.code.includes(';') &&
                                 !node.parameters.code.includes('\n');
      if (!hasReturn && !isSingleExpression) {
        issues.push({
          severity: 'warning',
          nodeId: node.id,
          nodeName: node.name,
          message: `Code Tool "${node.name}" JavaScript code should return a value. Add a return statement.`
        });
      }
    }
  }

  return issues;
}

/**
 * 3. Vector Store Tool Validator
 * From spec lines 1395-1620
 */
export function validateVectorStoreTool(
  node: WorkflowNode,
  reverseConnections: Map<string, ReverseConnection[]>,
  workflow: WorkflowJson
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1. Check tool name (REQUIRED)
  if (!node.parameters.name) {
    issues.push({
      severity: 'error',
      nodeId: node.id,
      nodeName: node.name,
      message: `Vector Store Tool "${node.name}" has no tool name. Add a name property.`,
      code: 'MISSING_TOOL_NAME'
    });
  }

  // 2. Check description (REQUIRED)
  if (!node.parameters.description) {
    issues.push({
      severity: 'error',
      nodeId: node.id,
      nodeName: node.name,
      message: `Vector Store Tool "${node.name}" has no description. Add one to explain what data it searches.`,
      code: 'MISSING_DESCRIPTION'
    });
  } else if (node.parameters.description.trim().length < MIN_DESCRIPTION_LENGTH_MEDIUM) {
    issues.push({
      severity: 'warning',
      nodeId: node.id,
      nodeName: node.name,
      message: `Vector Store Tool "${node.name}" description is too short (minimum ${MIN_DESCRIPTION_LENGTH_MEDIUM} characters). Explain what knowledge base is being searched.`
    });
  }

  // 3. Check ai_vectorStore connection (REQUIRED)
  const incoming = reverseConnections.get(node.name) || [];
  const vectorStoreConn = incoming.find(c => c.type === 'ai_vectorStore');

  if (!vectorStoreConn) {
    issues.push({
      severity: 'error',
      nodeId: node.id,
      nodeName: node.name,
      message: `Vector Store Tool "${node.name}" requires an ai_vectorStore connection. Connect a Vector Store node (e.g., Pinecone, In-Memory Vector Store).`,
      code: 'MISSING_VECTOR_STORE_CONNECTION'
    });
    return issues;  // Can't continue without this
  }

  // 4. Validate Vector Store node exists
  const vectorStoreNode = workflow.nodes.find(n => n.name === vectorStoreConn.sourceName);
  if (!vectorStoreNode) {
    issues.push({
      severity: 'error',
      nodeId: node.id,
      nodeName: node.name,
      message: `Vector Store Tool "${node.name}" connects to non-existent node "${vectorStoreConn.sourceName}".`,
      code: 'INVALID_VECTOR_STORE_NODE'
    });
    return issues;
  }

  // 5. Validate Vector Store has embedding (REQUIRED)
  const vsIncoming = reverseConnections.get(vectorStoreNode.name) || [];
  const embeddingConn = vsIncoming.find(c => c.type === 'ai_embedding');

  if (!embeddingConn) {
    issues.push({
      severity: 'error',
      nodeId: vectorStoreNode.id,
      nodeName: vectorStoreNode.name,
      message: `Vector Store "${vectorStoreNode.name}" requires an ai_embedding connection. Connect an Embeddings node (e.g., Embeddings OpenAI, Embeddings Google Gemini).`,
      code: 'MISSING_EMBEDDING_CONNECTION'
    });
  }

  // 6. Check for document loader (RECOMMENDED)
  const documentConn = vsIncoming.find(c => c.type === 'ai_document');
  if (!documentConn) {
    issues.push({
      severity: 'warning',
      nodeId: vectorStoreNode.id,
      nodeName: vectorStoreNode.name,
      message: `Vector Store "${vectorStoreNode.name}" has no ai_document connection. Without documents, the vector store will be empty. Connect a Document Loader to populate it.`
    });
  }

  // 7. Validate topK parameter if specified
  if (node.parameters.topK !== undefined) {
    if (typeof node.parameters.topK !== 'number' || node.parameters.topK < 1) {
      issues.push({
        severity: 'error',
        nodeId: node.id,
        nodeName: node.name,
        message: `Vector Store Tool "${node.name}" has invalid topK value. Must be a positive number.`,
        code: 'INVALID_TOPK'
      });
    } else if (node.parameters.topK > MAX_TOPK_WARNING_THRESHOLD) {
      issues.push({
        severity: 'warning',
        nodeId: node.id,
        nodeName: node.name,
        message: `Vector Store Tool "${node.name}" has topK=${node.parameters.topK}. Large values (>${MAX_TOPK_WARNING_THRESHOLD}) may overwhelm the LLM context. Consider reducing to 10 or less.`
      });
    }
  }

  return issues;
}

/**
 * 4. Workflow Tool Validator
 * From spec lines 1622-1831 (already complete in spec)
 */
export function validateWorkflowTool(node: WorkflowNode): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1. Check description (REQUIRED for LLM to understand tool)
  if (!node.parameters.description) {
    issues.push({
      severity: 'error',
      nodeId: node.id,
      nodeName: node.name,
      message: `Workflow Tool "${node.name}" has no description. Add a clear description to help the LLM know when to use this sub-workflow.`,
      code: 'MISSING_DESCRIPTION'
    });
  }

  // 2. Check source parameter exists
  if (!node.parameters.source) {
    issues.push({
      severity: 'error',
      nodeId: node.id,
      nodeName: node.name,
      message: `Workflow Tool "${node.name}" has no source parameter. Set source to "database" or "parameter".`,
      code: 'MISSING_SOURCE'
    });
    return issues;  // Can't continue without source
  }

  // 3. Validate based on source type
  if (node.parameters.source === 'database') {
    // When using database, workflowId is required
    if (!node.parameters.workflowId) {
      issues.push({
        severity: 'error',
        nodeId: node.id,
        nodeName: node.name,
        message: `Workflow Tool "${node.name}" has source="database" but no workflowId specified. Select a sub-workflow to execute.`,
        code: 'MISSING_WORKFLOW_ID'
      });
    }
  } else if (node.parameters.source === 'parameter') {
    // When using parameter, workflowJson is required
    if (!node.parameters.workflowJson) {
      issues.push({
        severity: 'error',
        nodeId: node.id,
        nodeName: node.name,
        message: `Workflow Tool "${node.name}" has source="parameter" but no workflowJson specified. Provide the inline workflow definition.`,
        code: 'MISSING_WORKFLOW_JSON'
      });
    } else {
      // Validate workflow structure
      try {
        const workflow = typeof node.parameters.workflowJson === 'string'
          ? JSON.parse(node.parameters.workflowJson)
          : node.parameters.workflowJson;

        if (!workflow.nodes || !Array.isArray(workflow.nodes)) {
          issues.push({
            severity: 'error',
            nodeId: node.id,
            nodeName: node.name,
            message: `Workflow Tool "${node.name}" workflowJson has invalid structure. Must have a nodes array.`,
            code: 'INVALID_WORKFLOW_STRUCTURE'
          });
        } else {
          // Check for Execute Workflow Trigger
          const hasTrigger = workflow.nodes.some((n: any) =>
            n.type.includes('executeWorkflowTrigger')
          );
          if (!hasTrigger) {
            issues.push({
              severity: 'error',
              nodeId: node.id,
              nodeName: node.name,
              message: `Workflow Tool "${node.name}" sub-workflow must start with Execute Workflow Trigger node.`,
              code: 'MISSING_WORKFLOW_TRIGGER'
            });
          }
        }
      } catch (e) {
        issues.push({
          severity: 'error',
          nodeId: node.id,
          nodeName: node.name,
          message: `Workflow Tool "${node.name}" has invalid JSON in workflowJson.`,
          code: 'INVALID_WORKFLOW_JSON'
        });
      }
    }
  }

  // 4. Validate input schema if specified
  if (node.parameters.specifyInputSchema) {
    if (node.parameters.jsonSchemaExample) {
      try {
        JSON.parse(node.parameters.jsonSchemaExample);
      } catch (e) {
        issues.push({
          severity: 'error',
          nodeId: node.id,
          nodeName: node.name,
          message: `Workflow Tool "${node.name}" has invalid JSON schema example.`,
          code: 'INVALID_JSON_SCHEMA'
        });
      }
    }
  }

  // 5. Check workflowInputs configuration
  if (!node.parameters.workflowInputs) {
    issues.push({
      severity: 'info',
      nodeId: node.id,
      nodeName: node.name,
      message: `Workflow Tool "${node.name}" has no workflowInputs defined. Map fields to help LLM provide correct data to sub-workflow.`
    });
  }

  return issues;
}

/**
 * 5. AI Agent Tool Validator
 * From spec lines 1882-2122
 */
export function validateAIAgentTool(
  node: WorkflowNode,
  reverseConnections: Map<string, ReverseConnection[]>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // This is an AI Agent packaged as a tool
  // It has the same requirements as a regular AI Agent

  // 1. Check ai_languageModel connection (REQUIRED, exactly 1)
  const incoming = reverseConnections.get(node.name) || [];
  const languageModelConn = incoming.filter(c => c.type === 'ai_languageModel');

  if (languageModelConn.length === 0) {
    issues.push({
      severity: 'error',
      nodeId: node.id,
      nodeName: node.name,
      message: `AI Agent Tool "${node.name}" requires an ai_languageModel connection. Connect a language model node.`,
      code: 'MISSING_LANGUAGE_MODEL'
    });
  } else if (languageModelConn.length > 1) {
    issues.push({
      severity: 'error',
      nodeId: node.id,
      nodeName: node.name,
      message: `AI Agent Tool "${node.name}" has ${languageModelConn.length} ai_languageModel connections. AI Agent Tool only supports 1 language model (no fallback).`,
      code: 'MULTIPLE_LANGUAGE_MODELS'
    });
  }

  // 2. Check tool name (REQUIRED)
  if (!node.parameters.name) {
    issues.push({
      severity: 'error',
      nodeId: node.id,
      nodeName: node.name,
      message: `AI Agent Tool "${node.name}" has no tool name. Add a name so the parent agent can invoke this sub-agent.`,
      code: 'MISSING_TOOL_NAME'
    });
  }

  // 3. Check description (REQUIRED)
  if (!node.parameters.description) {
    issues.push({
      severity: 'error',
      nodeId: node.id,
      nodeName: node.name,
      message: `AI Agent Tool "${node.name}" has no description. Add one to help the parent agent know when to use this sub-agent.`,
      code: 'MISSING_DESCRIPTION'
    });
  } else if (node.parameters.description.trim().length < MIN_DESCRIPTION_LENGTH_LONG) {
    issues.push({
      severity: 'warning',
      nodeId: node.id,
      nodeName: node.name,
      message: `AI Agent Tool "${node.name}" description is too short (minimum ${MIN_DESCRIPTION_LENGTH_LONG} characters). Explain the sub-agent's specific expertise and capabilities.`
    });
  }

  // 4. Check system message (RECOMMENDED)
  if (!node.parameters.systemMessage && node.parameters.promptType !== 'define') {
    issues.push({
      severity: 'warning',
      nodeId: node.id,
      nodeName: node.name,
      message: `AI Agent Tool "${node.name}" has no systemMessage. Add one to define the sub-agent's specialized role and constraints.`
    });
  }

  // 5. Validate promptType configuration
  if (node.parameters.promptType === 'define') {
    if (!node.parameters.text || node.parameters.text.trim() === '') {
      issues.push({
        severity: 'error',
        nodeId: node.id,
        nodeName: node.name,
        message: `AI Agent Tool "${node.name}" has promptType="define" but no text field. Provide the custom prompt.`,
        code: 'MISSING_PROMPT_TEXT'
      });
    }
  }

  // 6. Check if sub-agent has its own tools
  const toolConnections = incoming.filter(c => c.type === 'ai_tool');
  if (toolConnections.length === 0) {
    issues.push({
      severity: 'info',
      nodeId: node.id,
      nodeName: node.name,
      message: `AI Agent Tool "${node.name}" has no ai_tool connections. Consider giving the sub-agent tools to enhance its capabilities.`
    });
  }

  // 7. Validate maxIterations if specified
  if (node.parameters.maxIterations !== undefined) {
    if (typeof node.parameters.maxIterations !== 'number' || node.parameters.maxIterations < 1) {
      issues.push({
        severity: 'error',
        nodeId: node.id,
        nodeName: node.name,
        message: `AI Agent Tool "${node.name}" has invalid maxIterations. Must be a positive number.`,
        code: 'INVALID_MAX_ITERATIONS'
      });
    }
  }

  return issues;
}

/**
 * 6. MCP Client Tool Validator
 * From spec lines 2124-2534 (already complete in spec)
 */
export function validateMCPClientTool(node: WorkflowNode): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1. Check mcpServer configuration (REQUIRED)
  if (!node.parameters.mcpServer) {
    issues.push({
      severity: 'error',
      nodeId: node.id,
      nodeName: node.name,
      message: `MCP Client Tool "${node.name}" has no mcpServer configuration. Configure the MCP server connection.`,
      code: 'MISSING_MCP_SERVER'
    });
    return issues;
  }

  const mcpServer = node.parameters.mcpServer;

  // 2. Validate transport type
  if (!mcpServer.transport) {
    issues.push({
      severity: 'error',
      nodeId: node.id,
      nodeName: node.name,
      message: `MCP Client Tool "${node.name}" has no transport configured. Use "stdio" or "sse".`,
      code: 'MISSING_TRANSPORT'
    });
  } else {
    // Transport-specific validation
    if (mcpServer.transport === 'stdio') {
      if (!mcpServer.command) {
        issues.push({
          severity: 'error',
          nodeId: node.id,
          nodeName: node.name,
          message: `MCP Client Tool "${node.name}" stdio transport requires command. Specify the executable command.`,
          code: 'MISSING_STDIO_COMMAND'
        });
      }
    } else if (mcpServer.transport === 'sse') {
      if (!mcpServer.url) {
        issues.push({
          severity: 'error',
          nodeId: node.id,
          nodeName: node.name,
          message: `MCP Client Tool "${node.name}" SSE transport requires URL. Specify the server URL.`,
          code: 'MISSING_SSE_URL'
        });
      } else {
        // Validate URL format
        try {
          new URL(mcpServer.url);
        } catch (e) {
          issues.push({
            severity: 'error',
            nodeId: node.id,
            nodeName: node.name,
            message: `MCP Client Tool "${node.name}" has invalid server URL.`,
            code: 'INVALID_URL'
          });
        }
      }
    } else {
      issues.push({
        severity: 'error',
        nodeId: node.id,
        nodeName: node.name,
        message: `MCP Client Tool "${node.name}" has invalid transport "${mcpServer.transport}". Use "stdio" or "sse".`,
        code: 'INVALID_TRANSPORT'
      });
    }
  }

  // 3. Check tool selection (REQUIRED)
  if (!node.parameters.tool) {
    issues.push({
      severity: 'error',
      nodeId: node.id,
      nodeName: node.name,
      message: `MCP Client Tool "${node.name}" has no tool selected from MCP server. Select a tool to use.`,
      code: 'MISSING_TOOL_SELECTION'
    });
  }

  // 4. Check description (RECOMMENDED)
  if (!node.parameters.description) {
    issues.push({
      severity: 'warning',
      nodeId: node.id,
      nodeName: node.name,
      message: `MCP Client Tool "${node.name}" has no description. Add one to help the LLM know when to use this MCP tool.`
    });
  }

  return issues;
}

/**
 * 7-8. Simple Tools (Calculator, Think) Validators
 * From spec lines 1868-2009
 */
export function validateCalculatorTool(node: WorkflowNode): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Calculator is self-contained and requires no configuration
  // Optional: Check for custom description
  if (node.parameters.description) {
    if (node.parameters.description.trim().length < MIN_DESCRIPTION_LENGTH_SHORT) {
      issues.push({
        severity: 'info',
        nodeId: node.id,
        nodeName: node.name,
        message: `Calculator Tool "${node.name}" has a very short description (minimum ${MIN_DESCRIPTION_LENGTH_SHORT} characters). Consider being more specific about when to use it.`
      });
    }
  }

  return issues;
}

export function validateThinkTool(node: WorkflowNode): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Think tool is self-contained and requires no configuration
  // Optional: Check for custom description
  if (node.parameters.description) {
    if (node.parameters.description.trim().length < MIN_DESCRIPTION_LENGTH_MEDIUM) {
      issues.push({
        severity: 'info',
        nodeId: node.id,
        nodeName: node.name,
        message: `Think Tool "${node.name}" has a very short description (minimum ${MIN_DESCRIPTION_LENGTH_MEDIUM} characters). Explain when the agent should use thinking vs. action.`
      });
    }
  }

  return issues;
}

/**
 * 9-12. Search Tools Validators
 * From spec lines 1833-2139
 */
export function validateSerpApiTool(node: WorkflowNode): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1. Check credentials (REQUIRED)
  if (!node.credentials || !node.credentials.serpApi) {
    issues.push({
      severity: 'error',
      nodeId: node.id,
      nodeName: node.name,
      message: `SerpApi Tool "${node.name}" requires SerpApi credentials. Configure your API key.`,
      code: 'MISSING_CREDENTIALS'
    });
  }

  // 2. Check description (RECOMMENDED)
  if (!node.parameters.description) {
    issues.push({
      severity: 'info',
      nodeId: node.id,
      nodeName: node.name,
      message: `SerpApi Tool "${node.name}" has no custom description. Add one to explain when to use Google search vs. other search tools.`
    });
  }

  return issues;
}

export function validateWikipediaTool(node: WorkflowNode): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1. Check description (RECOMMENDED)
  if (!node.parameters.description) {
    issues.push({
      severity: 'info',
      nodeId: node.id,
      nodeName: node.name,
      message: `Wikipedia Tool "${node.name}" has no custom description. Add one to explain when to use Wikipedia vs. other knowledge sources.`
    });
  }

  // 2. Validate language if specified
  if (node.parameters.language) {
    const validLanguageCodes = /^[a-z]{2,3}$/;  // ISO 639 codes
    if (!validLanguageCodes.test(node.parameters.language)) {
      issues.push({
        severity: 'warning',
        nodeId: node.id,
        nodeName: node.name,
        message: `Wikipedia Tool "${node.name}" has potentially invalid language code "${node.parameters.language}". Use ISO 639 codes (e.g., "en", "es", "fr").`
      });
    }
  }

  return issues;
}

export function validateSearXngTool(node: WorkflowNode): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1. Check credentials (REQUIRED)
  if (!node.credentials || !node.credentials.searXng) {
    issues.push({
      severity: 'error',
      nodeId: node.id,
      nodeName: node.name,
      message: `SearXNG Tool "${node.name}" requires SearXNG instance credentials. Configure your instance URL.`,
      code: 'MISSING_CREDENTIALS'
    });
  }

  // 2. Check description (RECOMMENDED)
  if (!node.parameters.description) {
    issues.push({
      severity: 'info',
      nodeId: node.id,
      nodeName: node.name,
      message: `SearXNG Tool "${node.name}" has no custom description. Add one to explain when to use SearXNG vs. other search tools.`
    });
  }

  return issues;
}

export function validateWolframAlphaTool(node: WorkflowNode): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1. Check credentials (REQUIRED)
  if (!node.credentials || !node.credentials.wolframAlpha) {
    issues.push({
      severity: 'error',
      nodeId: node.id,
      nodeName: node.name,
      message: `WolframAlpha Tool "${node.name}" requires Wolfram|Alpha API credentials. Configure your App ID.`,
      code: 'MISSING_CREDENTIALS'
    });
  }

  // 2. Check description (RECOMMENDED)
  if (!node.parameters.description) {
    issues.push({
      severity: 'info',
      nodeId: node.id,
      nodeName: node.name,
      message: `WolframAlpha Tool "${node.name}" has no custom description. Add one to explain when to use Wolfram|Alpha for computational queries.`
    });
  }

  return issues;
}

/**
 * Helper: Map node types to validator functions
 */
export const AI_TOOL_VALIDATORS = {
  '@n8n/n8n-nodes-langchain.toolHttpRequest': validateHTTPRequestTool,
  '@n8n/n8n-nodes-langchain.toolCode': validateCodeTool,
  '@n8n/n8n-nodes-langchain.toolVectorStore': validateVectorStoreTool,
  '@n8n/n8n-nodes-langchain.toolWorkflow': validateWorkflowTool,
  '@n8n/n8n-nodes-langchain.agentTool': validateAIAgentTool,
  '@n8n/n8n-nodes-langchain.mcpClientTool': validateMCPClientTool,
  '@n8n/n8n-nodes-langchain.toolCalculator': validateCalculatorTool,
  '@n8n/n8n-nodes-langchain.toolThink': validateThinkTool,
  '@n8n/n8n-nodes-langchain.toolSerpApi': validateSerpApiTool,
  '@n8n/n8n-nodes-langchain.toolWikipedia': validateWikipediaTool,
  '@n8n/n8n-nodes-langchain.toolSearXng': validateSearXngTool,
  '@n8n/n8n-nodes-langchain.toolWolframAlpha': validateWolframAlphaTool,
} as const;

/**
 * Check if a node type is an AI tool sub-node
 */
export function isAIToolSubNode(nodeType: string): boolean {
  const normalized = NodeTypeNormalizer.normalizeToFullForm(nodeType);
  return normalized in AI_TOOL_VALIDATORS;
}

/**
 * Validate an AI tool sub-node with the appropriate validator
 */
export function validateAIToolSubNode(
  node: WorkflowNode,
  nodeType: string,
  reverseConnections: Map<string, ReverseConnection[]>,
  workflow: WorkflowJson
): ValidationIssue[] {
  const normalized = NodeTypeNormalizer.normalizeToFullForm(nodeType);

  // Route to appropriate validator based on node type
  switch (normalized) {
    case '@n8n/n8n-nodes-langchain.toolHttpRequest':
      return validateHTTPRequestTool(node);
    case '@n8n/n8n-nodes-langchain.toolCode':
      return validateCodeTool(node);
    case '@n8n/n8n-nodes-langchain.toolVectorStore':
      return validateVectorStoreTool(node, reverseConnections, workflow);
    case '@n8n/n8n-nodes-langchain.toolWorkflow':
      return validateWorkflowTool(node);
    case '@n8n/n8n-nodes-langchain.agentTool':
      return validateAIAgentTool(node, reverseConnections);
    case '@n8n/n8n-nodes-langchain.mcpClientTool':
      return validateMCPClientTool(node);
    case '@n8n/n8n-nodes-langchain.toolCalculator':
      return validateCalculatorTool(node);
    case '@n8n/n8n-nodes-langchain.toolThink':
      return validateThinkTool(node);
    case '@n8n/n8n-nodes-langchain.toolSerpApi':
      return validateSerpApiTool(node);
    case '@n8n/n8n-nodes-langchain.toolWikipedia':
      return validateWikipediaTool(node);
    case '@n8n/n8n-nodes-langchain.toolSearXng':
      return validateSearXngTool(node);
    case '@n8n/n8n-nodes-langchain.toolWolframAlpha':
      return validateWolframAlphaTool(node);
    default:
      return [];
  }
}
