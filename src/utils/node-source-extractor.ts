import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from './logger';

export interface NodeSourceInfo {
  nodeType: string;
  sourceCode: string;
  credentialCode?: string;
  packageInfo?: any;
  location: string;
}

export class NodeSourceExtractor {
  private n8nBasePaths = [
    '/usr/local/lib/node_modules/n8n/node_modules',
    '/app/node_modules',
    '/home/node/.n8n/custom/nodes',
    './node_modules',
  ];

  /**
   * Extract source code for a specific n8n node
   */
  async extractNodeSource(nodeType: string): Promise<NodeSourceInfo> {
    logger.info(`Extracting source code for node: ${nodeType}`);
    
    // Parse node type to get package and node name
    const { packageName, nodeName } = this.parseNodeType(nodeType);
    
    // Search for the node in known locations
    for (const basePath of this.n8nBasePaths) {
      try {
        const nodeInfo = await this.searchNodeInPath(basePath, packageName, nodeName);
        if (nodeInfo) {
          logger.info(`Found node source at: ${nodeInfo.location}`);
          return nodeInfo;
        }
      } catch (error) {
        logger.debug(`Failed to search in ${basePath}: ${error}`);
      }
    }
    
    throw new Error(`Node source code not found for: ${nodeType}`);
  }

  /**
   * Parse node type identifier
   */
  private parseNodeType(nodeType: string): { packageName: string; nodeName: string } {
    // Handle different formats:
    // - @n8n/n8n-nodes-langchain.Agent
    // - n8n-nodes-base.HttpRequest
    // - customNode
    
    if (nodeType.includes('.')) {
      const [pkg, node] = nodeType.split('.');
      return { packageName: pkg, nodeName: node };
    }
    
    // Default to n8n-nodes-base for simple node names
    return { packageName: 'n8n-nodes-base', nodeName: nodeType };
  }

  /**
   * Search for node in a specific path
   */
  private async searchNodeInPath(
    basePath: string,
    packageName: string,
    nodeName: string
  ): Promise<NodeSourceInfo | null> {
    try {
      // Common patterns for node files
      const patterns = [
        `${packageName}/dist/nodes/${nodeName}/${nodeName}.node.js`,
        `${packageName}/dist/nodes/${nodeName}.node.js`,
        `${packageName}/nodes/${nodeName}/${nodeName}.node.js`,
        `${packageName}/nodes/${nodeName}.node.js`,
        `${nodeName}/${nodeName}.node.js`,
        `${nodeName}.node.js`,
      ];

      for (const pattern of patterns) {
        const fullPath = path.join(basePath, pattern);
        try {
          const sourceCode = await fs.readFile(fullPath, 'utf-8');
          
          // Try to find credential file
          const credentialPath = fullPath.replace('.node.js', '.credentials.js');
          let credentialCode: string | undefined;
          try {
            credentialCode = await fs.readFile(credentialPath, 'utf-8');
          } catch {
            // Credential file is optional
          }

          // Try to get package.json info
          const packageJsonPath = path.join(basePath, packageName, 'package.json');
          let packageInfo: any;
          try {
            const packageJson = await fs.readFile(packageJsonPath, 'utf-8');
            packageInfo = JSON.parse(packageJson);
          } catch {
            // Package.json is optional
          }

          return {
            nodeType: `${packageName}.${nodeName}`,
            sourceCode,
            credentialCode,
            packageInfo,
            location: fullPath,
          };
        } catch {
          // Continue searching
        }
      }
    } catch (error) {
      logger.debug(`Error searching in path ${basePath}: ${error}`);
    }

    return null;
  }

  /**
   * List all available nodes
   */
  async listAvailableNodes(category?: string, search?: string): Promise<any[]> {
    const nodes: any[] = [];
    
    for (const basePath of this.n8nBasePaths) {
      try {
        await this.scanDirectoryForNodes(basePath, nodes, category, search);
      } catch (error) {
        logger.debug(`Failed to scan ${basePath}: ${error}`);
      }
    }

    return nodes;
  }

  /**
   * Scan directory for n8n nodes
   */
  private async scanDirectoryForNodes(
    dirPath: string,
    nodes: any[],
    category?: string,
    search?: string
  ): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.node.js')) {
          try {
            const fullPath = path.join(dirPath, entry.name);
            const content = await fs.readFile(fullPath, 'utf-8');
            
            // Extract basic info from the source
            const nameMatch = content.match(/displayName:\s*['"`]([^'"`]+)['"`]/);
            const descriptionMatch = content.match(/description:\s*['"`]([^'"`]+)['"`]/);
            
            if (nameMatch) {
              const nodeInfo = {
                name: entry.name.replace('.node.js', ''),
                displayName: nameMatch[1],
                description: descriptionMatch ? descriptionMatch[1] : '',
                location: fullPath,
              };

              // Apply filters
              if (category && !nodeInfo.displayName.toLowerCase().includes(category.toLowerCase())) {
                continue;
              }
              if (search && !nodeInfo.displayName.toLowerCase().includes(search.toLowerCase()) &&
                  !nodeInfo.description.toLowerCase().includes(search.toLowerCase())) {
                continue;
              }

              nodes.push(nodeInfo);
            }
          } catch {
            // Skip files we can't read
          }
        } else if (entry.isDirectory() && entry.name !== 'node_modules') {
          // Recursively scan subdirectories
          await this.scanDirectoryForNodes(path.join(dirPath, entry.name), nodes, category, search);
        }
      }
    } catch (error) {
      logger.debug(`Error scanning directory ${dirPath}: ${error}`);
    }
  }

  /**
   * Extract AI Agent node specifically
   */
  async extractAIAgentNode(): Promise<NodeSourceInfo> {
    // AI Agent is typically in @n8n/n8n-nodes-langchain package
    return this.extractNodeSource('@n8n/n8n-nodes-langchain.Agent');
  }
}