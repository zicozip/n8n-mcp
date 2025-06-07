import { logger } from './logger';

interface NodeExample {
  nodes: any[];
  connections: any;
  pinData?: any;
  meta?: any;
}

interface NodeParameter {
  name: string;
  type: string;
  default?: any;
  options?: any[];
  displayOptions?: any;
}

export class ExampleGenerator {
  /**
   * Generate example workflow for a node
   */
  static generateNodeExample(nodeType: string, nodeData: any): NodeExample {
    const nodeName = this.getNodeName(nodeType);
    const nodeId = this.generateNodeId();
    
    // Base example structure
    const example: NodeExample = {
      nodes: [{
        parameters: this.generateExampleParameters(nodeType, nodeData),
        type: nodeType,
        typeVersion: nodeData.typeVersion || 1,
        position: [220, 120],
        id: nodeId,
        name: nodeName
      }],
      connections: {
        [nodeName]: {
          main: [[]]
        }
      },
      pinData: {},
      meta: {
        templateCredsSetupCompleted: true,
        instanceId: this.generateInstanceId()
      }
    };

    // Add specific configurations based on node type
    this.addNodeSpecificConfig(nodeType, example, nodeData);

    return example;
  }

  /**
   * Generate example parameters based on node type
   */
  private static generateExampleParameters(nodeType: string, nodeData: any): any {
    const params: any = {};
    
    // Extract node name for specific handling
    const nodeName = nodeType.split('.').pop()?.toLowerCase() || '';

    // Common node examples
    switch (nodeName) {
      case 'if':
        return {
          conditions: {
            options: {
              caseSensitive: true,
              leftValue: "",
              typeValidation: "strict",
              version: 2
            },
            conditions: [{
              id: this.generateNodeId(),
              leftValue: "={{ $json }}",
              rightValue: "",
              operator: {
                type: "object",
                operation: "notEmpty",
                singleValue: true
              }
            }],
            combinator: "and"
          },
          options: {}
        };
        
      case 'webhook':
        return {
          httpMethod: "POST",
          path: "webhook-path",
          responseMode: "onReceived",
          responseData: "allEntries",
          options: {}
        };
        
      case 'httprequest':
        return {
          method: "GET",
          url: "https://api.example.com/data",
          authentication: "none",
          options: {},
          headerParametersUi: {
            parameter: []
          }
        };
        
      case 'function':
        return {
          functionCode: "// Add your JavaScript code here\nreturn $input.all();"
        };
        
      case 'set':
        return {
          mode: "manual",
          duplicateItem: false,
          values: {
            string: [{
              name: "myField",
              value: "myValue"
            }]
          }
        };
        
      case 'split':
        return {
          batchSize: 10,
          options: {}
        };
        
      default:
        // Generate generic parameters from node properties
        return this.generateGenericParameters(nodeData);
    }
  }

  /**
   * Generate generic parameters from node properties
   */
  private static generateGenericParameters(nodeData: any): any {
    const params: any = {};
    
    if (nodeData.properties) {
      for (const prop of nodeData.properties) {
        if (prop.default !== undefined) {
          params[prop.name] = prop.default;
        } else if (prop.type === 'string') {
          params[prop.name] = '';
        } else if (prop.type === 'number') {
          params[prop.name] = 0;
        } else if (prop.type === 'boolean') {
          params[prop.name] = false;
        } else if (prop.type === 'options' && prop.options?.length > 0) {
          params[prop.name] = prop.options[0].value;
        }
      }
    }
    
    return params;
  }

  /**
   * Add node-specific configurations
   */
  private static addNodeSpecificConfig(nodeType: string, example: NodeExample, nodeData: any): void {
    const nodeName = nodeType.split('.').pop()?.toLowerCase() || '';
    
    // Add specific connection structures for different node types
    switch (nodeName) {
      case 'if':
        // IF node has true/false outputs
        example.connections[example.nodes[0].name] = {
          main: [[], []] // Two outputs: true, false
        };
        break;
        
      case 'switch':
        // Switch node can have multiple outputs
        const outputs = nodeData.outputs || 3;
        example.connections[example.nodes[0].name] = {
          main: Array(outputs).fill([])
        };
        break;
        
      case 'merge':
        // Merge node has multiple inputs
        example.nodes[0].position = [400, 120];
        // Add dummy input nodes
        example.nodes.push({
          parameters: {},
          type: "n8n-nodes-base.noOp",
          typeVersion: 1,
          position: [200, 60],
          id: this.generateNodeId(),
          name: "Input 1"
        });
        example.nodes.push({
          parameters: {},
          type: "n8n-nodes-base.noOp",
          typeVersion: 1,
          position: [200, 180],
          id: this.generateNodeId(),
          name: "Input 2"
        });
        example.connections = {
          "Input 1": { main: [[{ node: example.nodes[0].name, type: "main", index: 0 }]] },
          "Input 2": { main: [[{ node: example.nodes[0].name, type: "main", index: 1 }]] },
          [example.nodes[0].name]: { main: [[]] }
        };
        break;
    }
    
    // Add credentials if needed
    if (nodeData.credentials?.length > 0) {
      example.nodes[0].credentials = {};
      for (const cred of nodeData.credentials) {
        example.nodes[0].credentials[cred.name] = {
          id: this.generateNodeId(),
          name: `${cred.name} account`
        };
      }
    }
  }

  /**
   * Extract display name from node type
   */
  private static getNodeName(nodeType: string): string {
    const parts = nodeType.split('.');
    const name = parts[parts.length - 1];
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  /**
   * Generate a random node ID
   */
  private static generateNodeId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Generate instance ID
   */
  private static generateInstanceId(): string {
    return Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('');
  }

  /**
   * Generate example from node definition
   */
  static generateFromNodeDefinition(nodeDefinition: any): NodeExample {
    const nodeType = nodeDefinition.description?.name || 'n8n-nodes-base.node';
    const nodeData = {
      typeVersion: nodeDefinition.description?.version || 1,
      properties: nodeDefinition.description?.properties || [],
      credentials: nodeDefinition.description?.credentials || [],
      outputs: nodeDefinition.description?.outputs || ['main']
    };
    
    return this.generateNodeExample(nodeType, nodeData);
  }
}