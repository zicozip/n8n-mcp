import { N8NConfig } from '../types';

export class N8NApiClient {
  private config: N8NConfig;
  private headers: Record<string, string>;

  constructor(config: N8NConfig) {
    this.config = config;
    this.headers = {
      'Content-Type': 'application/json',
      'X-N8N-API-KEY': config.apiKey,
    };
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.config.apiUrl}/api/v1${endpoint}`;
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...this.headers,
          ...options.headers,
        },
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`n8n API error: ${response.status} - ${error}`);
      }

      return await response.json();
    } catch (error) {
      throw new Error(`Failed to connect to n8n: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Workflow operations
  async getWorkflows(filters?: { active?: boolean; tags?: string[] }): Promise<any> {
    const query = new URLSearchParams();
    if (filters?.active !== undefined) {
      query.append('active', filters.active.toString());
    }
    if (filters?.tags?.length) {
      query.append('tags', filters.tags.join(','));
    }

    return this.request(`/workflows${query.toString() ? `?${query}` : ''}`);
  }

  async getWorkflow(id: string): Promise<any> {
    return this.request(`/workflows/${id}`);
  }

  async createWorkflow(workflowData: any): Promise<any> {
    return this.request('/workflows', {
      method: 'POST',
      body: JSON.stringify(workflowData),
    });
  }

  async updateWorkflow(id: string, updates: any): Promise<any> {
    return this.request(`/workflows/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  async deleteWorkflow(id: string): Promise<any> {
    return this.request(`/workflows/${id}`, {
      method: 'DELETE',
    });
  }

  async activateWorkflow(id: string): Promise<any> {
    return this.request(`/workflows/${id}/activate`, {
      method: 'POST',
    });
  }

  async deactivateWorkflow(id: string): Promise<any> {
    return this.request(`/workflows/${id}/deactivate`, {
      method: 'POST',
    });
  }

  // Execution operations
  async executeWorkflow(id: string, data?: any): Promise<any> {
    return this.request(`/workflows/${id}/execute`, {
      method: 'POST',
      body: JSON.stringify({ data }),
    });
  }

  async getExecutions(filters?: { 
    workflowId?: string; 
    status?: string; 
    limit?: number 
  }): Promise<any> {
    const query = new URLSearchParams();
    if (filters?.workflowId) {
      query.append('workflowId', filters.workflowId);
    }
    if (filters?.status) {
      query.append('status', filters.status);
    }
    if (filters?.limit) {
      query.append('limit', filters.limit.toString());
    }

    return this.request(`/executions${query.toString() ? `?${query}` : ''}`);
  }

  async getExecution(id: string): Promise<any> {
    return this.request(`/executions/${id}`);
  }

  async deleteExecution(id: string): Promise<any> {
    return this.request(`/executions/${id}`, {
      method: 'DELETE',
    });
  }

  // Credential operations
  async getCredentialTypes(): Promise<any> {
    return this.request('/credential-types');
  }

  async getCredentials(): Promise<any> {
    return this.request('/credentials');
  }

  // Node operations
  async getNodeTypes(): Promise<any> {
    return this.request('/node-types');
  }

  async getNodeType(nodeType: string): Promise<any> {
    return this.request(`/node-types/${nodeType}`);
  }
}