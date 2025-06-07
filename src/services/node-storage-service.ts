import { NodeSourceInfo } from '../utils/node-source-extractor';
import { logger } from '../utils/logger';
import * as crypto from 'crypto';

export interface StoredNode {
  id: string;
  nodeType: string;
  name: string;
  packageName: string;
  displayName?: string;
  description?: string;
  codeHash: string;
  codeLength: number;
  sourceLocation: string;
  hasCredentials: boolean;
  extractedAt: Date;
  updatedAt: Date;
  sourceCode?: string;
  credentialCode?: string;
  packageInfo?: any;
  metadata?: Record<string, any>;
}

export interface NodeSearchQuery {
  query?: string;
  packageName?: string;
  nodeType?: string;
  hasCredentials?: boolean;
  limit?: number;
  offset?: number;
}

export class NodeStorageService {
  private nodes: Map<string, StoredNode> = new Map();
  private nodesByPackage: Map<string, Set<string>> = new Map();
  private searchIndex: Map<string, Set<string>> = new Map();

  /**
   * Store a node in the database
   */
  async storeNode(nodeInfo: NodeSourceInfo): Promise<StoredNode> {
    const codeHash = crypto.createHash('sha256').update(nodeInfo.sourceCode).digest('hex');
    
    // Parse display name and description from source if possible
    const displayName = this.extractDisplayName(nodeInfo.sourceCode);
    const description = this.extractDescription(nodeInfo.sourceCode);
    
    const storedNode: StoredNode = {
      id: crypto.randomUUID(),
      nodeType: nodeInfo.nodeType,
      name: nodeInfo.nodeType.split('.').pop() || nodeInfo.nodeType,
      packageName: nodeInfo.nodeType.split('.')[0] || 'unknown',
      displayName,
      description,
      codeHash,
      codeLength: nodeInfo.sourceCode.length,
      sourceLocation: nodeInfo.location,
      hasCredentials: !!nodeInfo.credentialCode,
      extractedAt: new Date(),
      updatedAt: new Date(),
      sourceCode: nodeInfo.sourceCode,
      credentialCode: nodeInfo.credentialCode,
      packageInfo: nodeInfo.packageInfo,
    };

    // Store in memory (replace with real DB)
    this.nodes.set(nodeInfo.nodeType, storedNode);
    
    // Update package index
    if (!this.nodesByPackage.has(storedNode.packageName)) {
      this.nodesByPackage.set(storedNode.packageName, new Set());
    }
    this.nodesByPackage.get(storedNode.packageName)!.add(nodeInfo.nodeType);
    
    // Update search index
    this.updateSearchIndex(storedNode);
    
    logger.info(`Stored node: ${nodeInfo.nodeType} (${codeHash.substring(0, 8)}...)`);
    return storedNode;
  }

  /**
   * Search for nodes
   */
  async searchNodes(query: NodeSearchQuery): Promise<StoredNode[]> {
    let results: StoredNode[] = [];
    
    if (query.query) {
      // Text search
      const searchTerms = query.query.toLowerCase().split(' ');
      const matchingNodeTypes = new Set<string>();
      
      for (const term of searchTerms) {
        const matches = this.searchIndex.get(term) || new Set();
        matches.forEach(nodeType => matchingNodeTypes.add(nodeType));
      }
      
      results = Array.from(matchingNodeTypes)
        .map(nodeType => this.nodes.get(nodeType)!)
        .filter(Boolean);
    } else {
      // Get all nodes
      results = Array.from(this.nodes.values());
    }
    
    // Apply filters
    if (query.packageName) {
      results = results.filter(node => node.packageName === query.packageName);
    }
    
    if (query.nodeType) {
      results = results.filter(node => node.nodeType.includes(query.nodeType!));
    }
    
    if (query.hasCredentials !== undefined) {
      results = results.filter(node => node.hasCredentials === query.hasCredentials);
    }
    
    // Apply pagination
    const offset = query.offset || 0;
    const limit = query.limit || 50;
    
    return results.slice(offset, offset + limit);
  }

  /**
   * Get node by type
   */
  async getNode(nodeType: string): Promise<StoredNode | null> {
    return this.nodes.get(nodeType) || null;
  }

  /**
   * Get all packages
   */
  async getPackages(): Promise<Array<{ name: string; nodeCount: number }>> {
    return Array.from(this.nodesByPackage.entries()).map(([name, nodes]) => ({
      name,
      nodeCount: nodes.size,
    }));
  }

  /**
   * Bulk store nodes
   */
  async bulkStoreNodes(nodeInfos: NodeSourceInfo[]): Promise<{
    stored: number;
    failed: number;
    errors: Array<{ nodeType: string; error: string }>;
  }> {
    const results = {
      stored: 0,
      failed: 0,
      errors: [] as Array<{ nodeType: string; error: string }>,
    };

    for (const nodeInfo of nodeInfos) {
      try {
        await this.storeNode(nodeInfo);
        results.stored++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          nodeType: nodeInfo.nodeType,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  /**
   * Generate statistics
   */
  async getStatistics(): Promise<{
    totalNodes: number;
    totalPackages: number;
    totalCodeSize: number;
    nodesWithCredentials: number;
    averageNodeSize: number;
    packageDistribution: Array<{ package: string; count: number }>;
  }> {
    const nodes = Array.from(this.nodes.values());
    const totalCodeSize = nodes.reduce((sum, node) => sum + node.codeLength, 0);
    const nodesWithCredentials = nodes.filter(node => node.hasCredentials).length;

    const packageDistribution = Array.from(this.nodesByPackage.entries())
      .map(([pkg, nodeSet]) => ({ package: pkg, count: nodeSet.size }))
      .sort((a, b) => b.count - a.count);

    return {
      totalNodes: nodes.length,
      totalPackages: this.nodesByPackage.size,
      totalCodeSize,
      nodesWithCredentials,
      averageNodeSize: nodes.length > 0 ? Math.round(totalCodeSize / nodes.length) : 0,
      packageDistribution,
    };
  }

  /**
   * Extract display name from source code
   */
  private extractDisplayName(sourceCode: string): string | undefined {
    const match = sourceCode.match(/displayName:\s*["'`]([^"'`]+)["'`]/);
    return match ? match[1] : undefined;
  }

  /**
   * Extract description from source code
   */
  private extractDescription(sourceCode: string): string | undefined {
    const match = sourceCode.match(/description:\s*["'`]([^"'`]+)["'`]/);
    return match ? match[1] : undefined;
  }

  /**
   * Update search index
   */
  private updateSearchIndex(node: StoredNode): void {
    // Index by name parts
    const nameParts = node.name.toLowerCase().split(/(?=[A-Z])|[._-]/).filter(Boolean);
    for (const part of nameParts) {
      if (!this.searchIndex.has(part)) {
        this.searchIndex.set(part, new Set());
      }
      this.searchIndex.get(part)!.add(node.nodeType);
    }

    // Index by display name
    if (node.displayName) {
      const displayParts = node.displayName.toLowerCase().split(/\s+/);
      for (const part of displayParts) {
        if (!this.searchIndex.has(part)) {
          this.searchIndex.set(part, new Set());
        }
        this.searchIndex.get(part)!.add(node.nodeType);
      }
    }

    // Index by package name
    const pkgParts = node.packageName.toLowerCase().split(/[.-]/);
    for (const part of pkgParts) {
      if (!this.searchIndex.has(part)) {
        this.searchIndex.set(part, new Set());
      }
      this.searchIndex.get(part)!.add(node.nodeType);
    }
  }

  /**
   * Export all nodes for database import
   */
  async exportForDatabase(): Promise<{
    nodes: StoredNode[];
    metadata: {
      exportedAt: Date;
      totalNodes: number;
      totalPackages: number;
    };
  }> {
    const nodes = Array.from(this.nodes.values());
    
    return {
      nodes,
      metadata: {
        exportedAt: new Date(),
        totalNodes: nodes.length,
        totalPackages: this.nodesByPackage.size,
      },
    };
  }
}