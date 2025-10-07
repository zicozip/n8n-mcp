import type {
  NodeClass,
  VersionedNodeInstance
} from '../types/node-types';
import {
  isVersionedNodeInstance,
  isVersionedNodeClass
} from '../types/node-types';
import type { INodeTypeBaseDescription, INodeTypeDescription } from 'n8n-workflow';

export interface ParsedNode {
  style: 'declarative' | 'programmatic';
  nodeType: string;
  displayName: string;
  description?: string;
  category?: string;
  properties: any[];
  credentials: string[];
  isAITool: boolean;
  isTrigger: boolean;
  isWebhook: boolean;
  operations: any[];
  version?: string;
  isVersioned: boolean;
}

export class SimpleParser {
  parse(nodeClass: NodeClass): ParsedNode {
    let description: INodeTypeBaseDescription | INodeTypeDescription;
    let isVersioned = false;

    // Try to get description from the class
    try {
      // Check if it's a versioned node using type guard
      if (isVersionedNodeClass(nodeClass)) {
        // This is a VersionedNodeType class - instantiate it
        const instance = new (nodeClass as new () => VersionedNodeInstance)();
        description = instance.description;
        isVersioned = true;

        // For versioned nodes, try to get properties from the current version
        if (instance.nodeVersions && instance.currentVersion) {
          const currentVersionNode = instance.nodeVersions[instance.currentVersion];
          if (currentVersionNode && currentVersionNode.description) {
            // Merge baseDescription with version-specific description
            description = { ...description, ...currentVersionNode.description };
          }
        }
      } else if (typeof nodeClass === 'function') {
        // Try to instantiate to get description
        try {
          const instance = new nodeClass();
          description = instance.description;
        } catch (e) {
          // Some nodes might require parameters to instantiate
          // Try to access static properties or look for common patterns
          description = {} as any;
        }
      } else {
        // Maybe it's already an instance
        description = nodeClass.description;
      }
    } catch (error) {
      // If instantiation fails, try to get static description
      description = (nodeClass as any).description || ({} as any);
    }
    
    // Strategic any assertion for properties that don't exist on both union sides
    const desc = description as any;
    const isDeclarative = !!desc.routing;

    // Ensure we have a valid nodeType
    if (!description.name) {
      throw new Error('Node is missing name property');
    }

    return {
      style: isDeclarative ? 'declarative' : 'programmatic',
      nodeType: description.name,
      displayName: description.displayName || description.name,
      description: description.description,
      category: description.group?.[0] || desc.categories?.[0],
      properties: desc.properties || [],
      credentials: desc.credentials || [],
      isAITool: desc.usableAsTool === true,
      isTrigger: this.detectTrigger(description),
      isWebhook: desc.webhooks?.length > 0,
      operations: isDeclarative ? this.extractOperations(desc.routing) : this.extractProgrammaticOperations(desc),
      version: this.extractVersion(nodeClass),
      isVersioned: isVersioned || this.isVersionedNode(nodeClass) || Array.isArray(desc.version) || desc.defaultVersion !== undefined
    };
  }
  
  private detectTrigger(description: INodeTypeBaseDescription | INodeTypeDescription): boolean {
    // Primary check: group includes 'trigger'
    if (description.group && Array.isArray(description.group)) {
      if (description.group.includes('trigger')) {
        return true;
      }
    }

    // Strategic any assertion for properties that only exist on INodeTypeDescription
    const desc = description as any;

    // Fallback checks for edge cases
    return desc.polling === true ||
           desc.trigger === true ||
           desc.eventTrigger === true ||
           description.name?.toLowerCase().includes('trigger');
  }

  private extractOperations(routing: any): any[] {
    // Simple extraction without complex logic
    const operations: any[] = [];
    
    // Try different locations where operations might be defined
    if (routing?.request) {
      // Check for resources
      const resources = routing.request.resource?.options || [];
      resources.forEach((resource: any) => {
        operations.push({
          resource: resource.value,
          name: resource.name
        });
      });
      
      // Check for operations within resources
      const operationOptions = routing.request.operation?.options || [];
      operationOptions.forEach((operation: any) => {
        operations.push({
          operation: operation.value,
          name: operation.name || operation.displayName
        });
      });
    }
    
    // Also check if operations are defined at the top level
    if (routing?.operations) {
      Object.entries(routing.operations).forEach(([key, value]: [string, any]) => {
        operations.push({
          operation: key,
          name: value.displayName || key
        });
      });
    }
    
    return operations;
  }
  
  private extractProgrammaticOperations(description: any): any[] {
    const operations: any[] = [];
    
    if (!description.properties || !Array.isArray(description.properties)) {
      return operations;
    }
    
    // Find resource property
    const resourceProp = description.properties.find((p: any) => p.name === 'resource' && p.type === 'options');
    if (resourceProp && resourceProp.options) {
      // Extract resources
      resourceProp.options.forEach((resource: any) => {
        operations.push({
          type: 'resource',
          resource: resource.value,
          name: resource.name
        });
      });
    }
    
    // Find operation properties for each resource
    const operationProps = description.properties.filter((p: any) => 
      p.name === 'operation' && p.type === 'options' && p.displayOptions
    );
    
    operationProps.forEach((opProp: any) => {
      if (opProp.options) {
        opProp.options.forEach((operation: any) => {
          // Try to determine which resource this operation belongs to
          const resourceCondition = opProp.displayOptions?.show?.resource;
          const resources = Array.isArray(resourceCondition) ? resourceCondition : [resourceCondition];
          
          operations.push({
            type: 'operation',
            operation: operation.value,
            name: operation.name,
            action: operation.action,
            resources: resources
          });
        });
      }
    });
    
    return operations;
  }

  /**
   * Extracts the version from a node class.
   *
   * Priority Chain (same as node-parser.ts):
   * 1. Instance currentVersion (VersionedNodeType's computed property)
   * 2. Instance description.defaultVersion (explicit default)
   * 3. Instance nodeVersions (fallback to max available version)
   * 4. Instance description.version (simple versioning)
   * 5. Class-level properties (if instantiation fails)
   * 6. Default to "1"
   *
   * Critical Fix (v2.17.4): Removed check for non-existent instance.baseDescription.defaultVersion
   * which caused AI Agent and other VersionedNodeType nodes to return wrong versions.
   *
   * @param nodeClass - The node class or instance to extract version from
   * @returns The version as a string
   */
  private extractVersion(nodeClass: NodeClass): string {
    // Try to get version from instance first
    try {
      const instance = typeof nodeClass === 'function' ? new nodeClass() : nodeClass;
      // Strategic any assertion for instance properties
      const inst = instance as any;

      // PRIORITY 1: Check currentVersion (what VersionedNodeType actually uses)
      // For VersionedNodeType, currentVersion = defaultVersion ?? max(nodeVersions)
      if (inst?.currentVersion !== undefined) {
        return inst.currentVersion.toString();
      }

      // PRIORITY 2: Handle instance-level description.defaultVersion
      // VersionedNodeType stores baseDescription as 'description', not 'baseDescription'
      if (inst?.description?.defaultVersion) {
        return inst.description.defaultVersion.toString();
      }

      // PRIORITY 3: Handle instance-level nodeVersions (fallback to max)
      if (inst?.nodeVersions) {
        const versions = Object.keys(inst.nodeVersions).map(Number);
        if (versions.length > 0) {
          const maxVersion = Math.max(...versions);
          if (!isNaN(maxVersion)) {
            return maxVersion.toString();
          }
        }
      }

      // PRIORITY 4: Check instance description version
      if (inst?.description?.version) {
        return inst.description.version.toString();
      }
    } catch (e) {
      // Ignore instantiation errors
    }

    // PRIORITY 5: Check class-level properties (if instantiation failed)
    // Strategic any assertion for class-level properties
    const nodeClassAny = nodeClass as any;
    if (nodeClassAny.description?.defaultVersion) {
      return nodeClassAny.description.defaultVersion.toString();
    }

    if (nodeClassAny.nodeVersions) {
      const versions = Object.keys(nodeClassAny.nodeVersions).map(Number);
      if (versions.length > 0) {
        const maxVersion = Math.max(...versions);
        if (!isNaN(maxVersion)) {
          return maxVersion.toString();
        }
      }
    }

    // PRIORITY 6: Default to version 1
    return nodeClassAny.description?.version || '1';
  }

  private isVersionedNode(nodeClass: NodeClass): boolean {
    // Strategic any assertion for class-level properties
    const nodeClassAny = nodeClass as any;

    // Check for VersionedNodeType pattern
    if (nodeClassAny.baseDescription && nodeClassAny.nodeVersions) {
      return true;
    }

    // Check for inline versioning pattern (like Code node)
    try {
      const instance = typeof nodeClass === 'function' ? new nodeClass() : nodeClass;
      // Strategic any assertion for instance properties
      const inst = instance as any;
      const description = inst.description || {};

      // If version is an array, it's versioned
      if (Array.isArray(description.version)) {
        return true;
      }

      // If it has defaultVersion, it's likely versioned
      if (description.defaultVersion !== undefined) {
        return true;
      }
    } catch (e) {
      // Ignore instantiation errors
    }

    return false;
  }
}