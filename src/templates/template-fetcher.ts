import axios from 'axios';
import { logger } from '../utils/logger';

export interface TemplateNode {
  id: number;
  name: string;
  icon: string;
}

export interface TemplateUser {
  id: number;
  name: string;
  username: string;
  verified: boolean;
}

export interface TemplateWorkflow {
  id: number;
  name: string;
  description: string;
  totalViews: number;
  createdAt: string;
  user: TemplateUser;
  nodes: TemplateNode[];
}

export interface TemplateDetail {
  id: number;
  name: string;
  description: string;
  views: number;
  createdAt: string;
  workflow: {
    nodes: any[];
    connections: any;
    settings?: any;
  };
}

export class TemplateFetcher {
  private readonly baseUrl = 'https://api.n8n.io/api/templates';
  private readonly pageSize = 250; // Maximum allowed by API
  
  /**
   * Fetch all templates and filter to last 12 months
   * This fetches ALL pages first, then applies date filter locally
   */
  async fetchTemplates(progressCallback?: (current: number, total: number) => void): Promise<TemplateWorkflow[]> {
    const allTemplates = await this.fetchAllTemplates(progressCallback);
    
    // Apply date filter locally after fetching all
    const oneYearAgo = new Date();
    oneYearAgo.setMonth(oneYearAgo.getMonth() - 12);
    
    const recentTemplates = allTemplates.filter((w: TemplateWorkflow) => {
      const createdDate = new Date(w.createdAt);
      return createdDate >= oneYearAgo;
    });
    
    logger.info(`Filtered to ${recentTemplates.length} templates from last 12 months (out of ${allTemplates.length} total)`);
    return recentTemplates;
  }
  
  /**
   * Fetch ALL templates from the API without date filtering
   * Used internally and can be used for other filtering strategies
   */
  async fetchAllTemplates(progressCallback?: (current: number, total: number) => void): Promise<TemplateWorkflow[]> {
    const allTemplates: TemplateWorkflow[] = [];
    let page = 1;
    let hasMore = true;
    let totalWorkflows = 0;
    
    logger.info('Starting complete template fetch from n8n.io API');
    
    while (hasMore) {
      try {
        const response = await axios.get(`${this.baseUrl}/search`, {
          params: {
            page,
            rows: this.pageSize
            // Note: sort_by parameter doesn't work, templates come in popularity order
          }
        });
        
        const { workflows } = response.data;
        totalWorkflows = response.data.totalWorkflows || totalWorkflows;
        
        allTemplates.push(...workflows);
        
        // Calculate total pages for better progress reporting
        const totalPages = Math.ceil(totalWorkflows / this.pageSize);
        
        if (progressCallback) {
          // Enhanced progress with page information
          progressCallback(allTemplates.length, totalWorkflows);
        }
        
        logger.debug(`Fetched page ${page}/${totalPages}: ${workflows.length} templates (total so far: ${allTemplates.length}/${totalWorkflows})`);
        
        // Check if there are more pages
        if (workflows.length < this.pageSize) {
          hasMore = false;
        }
        
        page++;
        
        // Rate limiting - be nice to the API (slightly faster with 250 rows/page)
        if (hasMore) {
          await this.sleep(300); // 300ms between requests (was 500ms with 100 rows)
        }
      } catch (error) {
        logger.error(`Error fetching templates page ${page}:`, error);
        throw error;
      }
    }
    
    logger.info(`Fetched all ${allTemplates.length} templates from n8n.io`);
    return allTemplates;
  }
  
  async fetchTemplateDetail(workflowId: number): Promise<TemplateDetail> {
    try {
      const response = await axios.get(`${this.baseUrl}/workflows/${workflowId}`);
      return response.data.workflow;
    } catch (error) {
      logger.error(`Error fetching template detail for ${workflowId}:`, error);
      throw error;
    }
  }
  
  async fetchAllTemplateDetails(
    workflows: TemplateWorkflow[], 
    progressCallback?: (current: number, total: number) => void
  ): Promise<Map<number, TemplateDetail>> {
    const details = new Map<number, TemplateDetail>();
    
    logger.info(`Fetching details for ${workflows.length} templates`);
    
    for (let i = 0; i < workflows.length; i++) {
      const workflow = workflows[i];
      
      try {
        const detail = await this.fetchTemplateDetail(workflow.id);
        details.set(workflow.id, detail);
        
        if (progressCallback) {
          progressCallback(i + 1, workflows.length);
        }
        
        // Rate limiting (conservative to avoid API throttling)
        await this.sleep(150); // 150ms between requests
      } catch (error) {
        logger.error(`Failed to fetch details for workflow ${workflow.id}:`, error);
        // Continue with other templates
      }
    }
    
    logger.info(`Successfully fetched ${details.size} template details`);
    return details;
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}