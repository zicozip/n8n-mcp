import { promises as fs } from 'fs';
import path from 'path';
import { logger } from './logger';
import { execSync } from 'child_process';

interface NodeDocumentation {
  markdown: string;
  url: string;
  examples?: any[];
}

export class DocumentationFetcher {
  private docsPath: string;
  private docsRepoUrl = 'https://github.com/n8n-io/n8n-docs.git';
  private cloned = false;

  constructor(docsPath?: string) {
    this.docsPath = docsPath || path.join(process.cwd(), 'temp', 'n8n-docs');
  }

  /**
   * Clone or update the n8n-docs repository
   */
  async ensureDocsRepository(): Promise<void> {
    try {
      // Check if directory exists
      const exists = await fs.access(this.docsPath).then(() => true).catch(() => false);
      
      if (!exists) {
        logger.info('Cloning n8n-docs repository...');
        await fs.mkdir(path.dirname(this.docsPath), { recursive: true });
        execSync(`git clone --depth 1 ${this.docsRepoUrl} ${this.docsPath}`, {
          stdio: 'pipe'
        });
        logger.info('n8n-docs repository cloned successfully');
      } else {
        logger.info('Updating n8n-docs repository...');
        execSync('git pull --ff-only', {
          cwd: this.docsPath,
          stdio: 'pipe'
        });
        logger.info('n8n-docs repository updated');
      }
      
      this.cloned = true;
    } catch (error) {
      logger.error('Failed to clone/update n8n-docs repository:', error);
      throw error;
    }
  }

  /**
   * Get documentation for a specific node
   */
  async getNodeDocumentation(nodeType: string): Promise<NodeDocumentation | null> {
    if (!this.cloned) {
      await this.ensureDocsRepository();
    }

    try {
      // Convert node type to documentation path
      // e.g., "n8n-nodes-base.if" -> "if"
      const nodeName = this.extractNodeName(nodeType);
      
      // Common documentation paths to check
      const possiblePaths = [
        path.join(this.docsPath, 'docs', 'integrations', 'builtin', 'core-nodes', `${nodeName}.md`),
        path.join(this.docsPath, 'docs', 'integrations', 'builtin', 'app-nodes', `${nodeName}.md`),
        path.join(this.docsPath, 'docs', 'integrations', 'builtin', 'trigger-nodes', `${nodeName}.md`),
        path.join(this.docsPath, 'docs', 'code-examples', 'expressions', `${nodeName}.md`),
        // Generic search in docs folder
        path.join(this.docsPath, 'docs', '**', `${nodeName}.md`)
      ];

      for (const docPath of possiblePaths) {
        try {
          const content = await fs.readFile(docPath, 'utf-8');
          const url = this.generateDocUrl(docPath);
          
          return {
            markdown: content,
            url,
            examples: this.extractExamples(content)
          };
        } catch (error) {
          // Continue to next path
          continue;
        }
      }

      // If no exact match, try to find by searching
      const foundPath = await this.searchForNodeDoc(nodeName);
      if (foundPath) {
        const content = await fs.readFile(foundPath, 'utf-8');
        return {
          markdown: content,
          url: this.generateDocUrl(foundPath),
          examples: this.extractExamples(content)
        };
      }

      logger.warn(`No documentation found for node: ${nodeType}`);
      return null;
    } catch (error) {
      logger.error(`Failed to get documentation for ${nodeType}:`, error);
      return null;
    }
  }

  /**
   * Extract node name from node type
   */
  private extractNodeName(nodeType: string): string {
    // Handle different node type formats
    // "n8n-nodes-base.if" -> "if"
    // "@n8n/n8n-nodes-langchain.Agent" -> "agent"
    const parts = nodeType.split('.');
    const name = parts[parts.length - 1];
    return name.toLowerCase();
  }

  /**
   * Search for node documentation file
   */
  private async searchForNodeDoc(nodeName: string): Promise<string | null> {
    try {
      const result = execSync(
        `find ${this.docsPath}/docs -name "*.md" -type f | grep -i "${nodeName}" | head -1`,
        { encoding: 'utf-8', stdio: 'pipe' }
      ).trim();
      
      return result || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate documentation URL from file path
   */
  private generateDocUrl(filePath: string): string {
    const relativePath = path.relative(this.docsPath, filePath);
    const urlPath = relativePath
      .replace(/^docs\//, '')
      .replace(/\.md$/, '')
      .replace(/\\/g, '/');
    
    return `https://docs.n8n.io/${urlPath}`;
  }

  /**
   * Extract code examples from markdown content
   */
  private extractExamples(markdown: string): any[] {
    const examples: any[] = [];
    
    // Extract JSON code blocks
    const jsonCodeBlockRegex = /```json\n([\s\S]*?)```/g;
    let match;
    
    while ((match = jsonCodeBlockRegex.exec(markdown)) !== null) {
      try {
        const json = JSON.parse(match[1]);
        examples.push(json);
      } catch (error) {
        // Not valid JSON, skip
      }
    }

    // Extract workflow examples
    const workflowExampleRegex = /## Example.*?\n([\s\S]*?)(?=\n##|\n#|$)/gi;
    while ((match = workflowExampleRegex.exec(markdown)) !== null) {
      const exampleText = match[1];
      // Try to find JSON in the example section
      const jsonMatch = exampleText.match(/```json\n([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          const json = JSON.parse(jsonMatch[1]);
          examples.push(json);
        } catch (error) {
          // Not valid JSON
        }
      }
    }

    return examples;
  }

  /**
   * Get all available documentation files
   */
  async getAllDocumentationFiles(): Promise<Map<string, string>> {
    if (!this.cloned) {
      await this.ensureDocsRepository();
    }

    const docMap = new Map<string, string>();

    try {
      const findDocs = execSync(
        `find ${this.docsPath}/docs -name "*.md" -type f | grep -E "(core-nodes|app-nodes|trigger-nodes)/"`,
        { encoding: 'utf-8', stdio: 'pipe' }
      ).trim().split('\n');

      for (const docPath of findDocs) {
        if (!docPath) continue;
        
        const filename = path.basename(docPath, '.md');
        const content = await fs.readFile(docPath, 'utf-8');
        
        // Try to extract the node type from the content
        const nodeTypeMatch = content.match(/node[_-]?type[:\s]+["']?([^"'\s]+)["']?/i);
        if (nodeTypeMatch) {
          docMap.set(nodeTypeMatch[1], docPath);
        } else {
          // Use filename as fallback
          docMap.set(filename, docPath);
        }
      }

      logger.info(`Found ${docMap.size} documentation files`);
      return docMap;
    } catch (error) {
      logger.error('Failed to get documentation files:', error);
      return docMap;
    }
  }

  /**
   * Clean up cloned repository
   */
  async cleanup(): Promise<void> {
    try {
      await fs.rm(this.docsPath, { recursive: true, force: true });
      this.cloned = false;
      logger.info('Cleaned up documentation repository');
    } catch (error) {
      logger.error('Failed to cleanup docs repository:', error);
    }
  }
}