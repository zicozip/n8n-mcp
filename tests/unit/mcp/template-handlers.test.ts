import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { N8NDocumentationMCPServer } from '../../../src/mcp/server';
import { NodeRepository } from '../../../src/database/node-repository';
import { TemplateService, PaginatedResponse, TemplateMinimal } from '../../../src/templates/template-service';
import { DatabaseAdapter } from '../../../src/database/database-adapter';

// Mock dependencies
vi.mock('../../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  },
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }))
}));

vi.mock('../../../src/database/node-repository');
vi.mock('../../../src/templates/template-service');
vi.mock('../../../src/database/database-adapter');

// Create testable server class to access private methods
class TestableMCPServer extends N8NDocumentationMCPServer {
  public async testListTemplates(limit?: number, offset?: number, sortBy?: 'views' | 'created_at' | 'name'): Promise<any> {
    return (this as any).listTemplates(limit, offset, sortBy);
  }

  public async testGetTemplate(templateId: number, mode?: 'full' | 'nodes_only' | 'structure'): Promise<any> {
    return (this as any).getTemplate(templateId, mode);
  }

  public async testGetDatabaseStatistics(): Promise<any> {
    return (this as any).getDatabaseStatistics();
  }

  public async testListNodeTemplates(nodeTypes: string[], limit?: number, offset?: number): Promise<any> {
    return (this as any).listNodeTemplates(nodeTypes, limit, offset);
  }

  public async testSearchTemplates(query: string, limit?: number, offset?: number): Promise<any> {
    return (this as any).searchTemplates(query, limit, offset);
  }

  public async testGetTemplatesForTask(task: string, limit?: number, offset?: number): Promise<any> {
    return (this as any).getTemplatesForTask(task, limit, offset);
  }
}

describe('MCP Template Handlers', () => {
  let server: TestableMCPServer;
  let mockDb: DatabaseAdapter;
  let mockNodeRepository: NodeRepository;
  let mockTemplateService: TemplateService;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockDb = {
      prepare: vi.fn(),
      exec: vi.fn(),
      close: vi.fn(),
      pragma: vi.fn(),
      transaction: vi.fn(),
      checkFTS5Support: vi.fn(() => true),
      inTransaction: false
    } as any;

    mockNodeRepository = {
      getTotalNodes: vi.fn(() => 500),
      getAIToolsCount: vi.fn(() => 263),
      getTriggersCount: vi.fn(() => 104),
      getDocsCount: vi.fn(() => 435)
    } as any;

    mockTemplateService = {
      listTemplates: vi.fn(),
      getTemplate: vi.fn(),
      listNodeTemplates: vi.fn(),
      searchTemplates: vi.fn(),
      getTemplatesForTask: vi.fn(),
      getTemplateStats: vi.fn()
    } as any;

    (NodeRepository as any).mockImplementation(() => mockNodeRepository);
    (TemplateService as any).mockImplementation(() => mockTemplateService);
    
    // Set environment variable for in-memory database
    process.env.NODE_DB_PATH = ':memory:';
    server = new TestableMCPServer();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('listTemplates', () => {
    it('should return paginated template list with default parameters', async () => {
      const mockResponse: PaginatedResponse<TemplateMinimal> = {
        items: [
          { id: 1, name: 'Template A', views: 200, nodeCount: 3 },
          { id: 2, name: 'Template B', views: 150, nodeCount: 2 }
        ],
        total: 25,
        limit: 10,
        offset: 0,
        hasMore: true
      };

      mockTemplateService.listTemplates = vi.fn().mockResolvedValue(mockResponse);

      const result = await server.testListTemplates();

      expect(result).toEqual({
        templates: mockResponse.items,
        pagination: {
          total: 25,
          limit: 10,
          offset: 0,
          hasMore: true
        }
      });

      expect(mockTemplateService.listTemplates).toHaveBeenCalledWith(10, 0, 'views');
    });

    it('should handle custom pagination parameters', async () => {
      const mockResponse: PaginatedResponse<TemplateMinimal> = {
        items: [
          { id: 3, name: 'Template C', views: 100, nodeCount: 1 }
        ],
        total: 25,
        limit: 5,
        offset: 20,
        hasMore: false
      };

      mockTemplateService.listTemplates = vi.fn().mockResolvedValue(mockResponse);

      const result = await server.testListTemplates(5, 20, 'name');

      expect(result).toEqual({
        templates: mockResponse.items,
        pagination: {
          total: 25,
          limit: 5,
          offset: 20,
          hasMore: false
        }
      });

      expect(mockTemplateService.listTemplates).toHaveBeenCalledWith(5, 20, 'name');
    });

    it('should handle empty results', async () => {
      const mockResponse: PaginatedResponse<TemplateMinimal> = {
        items: [],
        total: 0,
        limit: 10,
        offset: 0,
        hasMore: false
      };

      mockTemplateService.listTemplates = vi.fn().mockResolvedValue(mockResponse);

      const result = await server.testListTemplates();

      expect(result.templates).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });
  });

  describe('getTemplate with mode parameter', () => {
    it('should return full template by default', async () => {
      const mockTemplate = {
        id: 1,
        name: 'Test Template',
        description: 'Test description',
        author: { name: 'Test Author', username: 'test', verified: true },
        nodes: ['n8n-nodes-base.webhook'],
        views: 100,
        created: '2024-01-01T00:00:00Z',
        url: 'https://n8n.io/workflows/1',
        workflow: {
          nodes: [{ id: 'node1', type: 'n8n-nodes-base.webhook' }],
          connections: {},
          settings: {}
        }
      };

      mockTemplateService.getTemplate = vi.fn().mockResolvedValue(mockTemplate);

      const result = await server.testGetTemplate(1);

      expect(result).toEqual(mockTemplate);
      expect(mockTemplateService.getTemplate).toHaveBeenCalledWith(1, 'full');
    });

    it('should return nodes_only mode correctly', async () => {
      const mockTemplate = {
        id: 1,
        name: 'Test Template',
        nodes: [
          { type: 'n8n-nodes-base.webhook', name: 'Webhook' },
          { type: 'n8n-nodes-base.slack', name: 'Slack' }
        ]
      };

      mockTemplateService.getTemplate = vi.fn().mockResolvedValue(mockTemplate);

      const result = await server.testGetTemplate(1, 'nodes_only');

      expect(result).toEqual(mockTemplate);
      expect(mockTemplateService.getTemplate).toHaveBeenCalledWith(1, 'nodes_only');
    });

    it('should return structure mode correctly', async () => {
      const mockTemplate = {
        id: 1,
        name: 'Test Template',
        nodes: [
          { id: 'node1', type: 'n8n-nodes-base.webhook', name: 'Webhook', position: [100, 100] }
        ],
        connections: { node1: { main: [[{ node: 'node2', type: 'main', index: 0 }]] } }
      };

      mockTemplateService.getTemplate = vi.fn().mockResolvedValue(mockTemplate);

      const result = await server.testGetTemplate(1, 'structure');

      expect(result).toEqual(mockTemplate);
      expect(mockTemplateService.getTemplate).toHaveBeenCalledWith(1, 'structure');
    });

    it('should handle non-existent template', async () => {
      mockTemplateService.getTemplate = vi.fn().mockResolvedValue(null);

      const result = await server.testGetTemplate(999);

      expect(result).toEqual({
        error: 'Template not found',
        tip: "Use list_templates, list_node_templates or search_templates to find available templates"
      });
    });
  });

  describe('Enhanced template tools with pagination', () => {
    describe('listNodeTemplates', () => {
      it('should handle pagination correctly', async () => {
        const mockResponse = {
          items: [
            { id: 1, name: 'Webhook Template', nodes: ['n8n-nodes-base.webhook'], views: 200 }
          ],
          total: 15,
          limit: 10,
          offset: 5,
          hasMore: true
        };

        mockTemplateService.listNodeTemplates = vi.fn().mockResolvedValue(mockResponse);

        const result = await server.testListNodeTemplates(['n8n-nodes-base.webhook'], 10, 5);

        expect(result).toEqual({
          templates: mockResponse.items,
          pagination: {
            total: 15,
            limit: 10,
            offset: 5,
            hasMore: true
          }
        });

        expect(mockTemplateService.listNodeTemplates).toHaveBeenCalledWith(['n8n-nodes-base.webhook'], 10, 5);
      });
    });

    describe('searchTemplates', () => {
      it('should handle pagination correctly', async () => {
        const mockResponse = {
          items: [
            { id: 2, name: 'Search Result', description: 'Found template', views: 150 }
          ],
          total: 8,
          limit: 20,
          offset: 0,
          hasMore: false
        };

        mockTemplateService.searchTemplates = vi.fn().mockResolvedValue(mockResponse);

        const result = await server.testSearchTemplates('webhook', 20, 0);

        expect(result).toEqual({
          templates: mockResponse.items,
          pagination: {
            total: 8,
            limit: 20,
            offset: 0,
            hasMore: false
          }
        });

        expect(mockTemplateService.searchTemplates).toHaveBeenCalledWith('webhook', 20, 0);
      });
    });

    describe('getTemplatesForTask', () => {
      it('should handle pagination correctly', async () => {
        const mockResponse = {
          items: [
            { id: 3, name: 'AI Template', nodes: ['@n8n/n8n-nodes-langchain.openAi'], views: 300 }
          ],
          total: 12,
          limit: 10,
          offset: 10,
          hasMore: true
        };

        mockTemplateService.getTemplatesForTask = vi.fn().mockResolvedValue(mockResponse);

        const result = await server.testGetTemplatesForTask('ai_automation', 10, 10);

        expect(result).toEqual({
          templates: mockResponse.items,
          pagination: {
            total: 12,
            limit: 10,
            offset: 10,
            hasMore: true
          }
        });

        expect(mockTemplateService.getTemplatesForTask).toHaveBeenCalledWith('ai_automation', 10, 10);
      });
    });
  });

  describe('getDatabaseStatistics with template metrics', () => {
    it('should include template statistics', async () => {
      const mockTemplateStats = {
        totalTemplates: 100,
        averageViews: 250,
        minViews: 10,
        maxViews: 1000,
        topUsedNodes: [
          { node: 'n8n-nodes-base.webhook', count: 45 },
          { node: 'n8n-nodes-base.slack', count: 30 }
        ]
      };

      mockTemplateService.getTemplateStats = vi.fn().mockResolvedValue(mockTemplateStats);

      const result = await server.testGetDatabaseStatistics();

      expect(result).toEqual(expect.objectContaining({
        nodeStatistics: {
          totalNodes: 500,
          aiTools: 263,
          triggers: 104,
          docsAvailable: 435,
          docsCoverage: '87%'
        },
        templateStatistics: {
          totalTemplates: 100,
          averageViews: 250,
          minViews: 10,
          maxViews: 1000,
          topUsedNodes: [
            { node: 'n8n-nodes-base.webhook', count: 45 },
            { node: 'n8n-nodes-base.slack', count: 30 }
          ]
        }
      }));

      expect(mockTemplateService.getTemplateStats).toHaveBeenCalled();
    });

    it('should handle template service errors gracefully', async () => {
      mockTemplateService.getTemplateStats = vi.fn().mockRejectedValue(new Error('Template stats failed'));

      const result = await server.testGetDatabaseStatistics();

      expect(result).toEqual(expect.objectContaining({
        nodeStatistics: expect.any(Object),
        templateStatistics: {
          error: 'Unable to fetch template statistics'
        }
      }));
    });

    it('should handle missing template service', async () => {
      // Create server without template service
      const serverWithoutTemplates = new TestableMCPServer();
      (serverWithoutTemplates as any).templateService = undefined;

      const result = await serverWithoutTemplates.testGetDatabaseStatistics();

      expect(result).toEqual(expect.objectContaining({
        nodeStatistics: expect.any(Object),
        templateStatistics: {
          error: 'Template service not available'
        }
      }));
    });
  });

  describe('Error handling', () => {
    it('should handle service errors in listTemplates', async () => {
      mockTemplateService.listTemplates = vi.fn().mockRejectedValue(new Error('Database error'));

      await expect(server.testListTemplates()).rejects.toThrow('Database error');
    });

    it('should handle service errors in getTemplate', async () => {
      mockTemplateService.getTemplate = vi.fn().mockRejectedValue(new Error('Template fetch error'));

      await expect(server.testGetTemplate(1)).rejects.toThrow('Template fetch error');
    });

    it('should validate template mode parameter', async () => {
      const result = await server.testGetTemplate(1, 'invalid_mode' as any);

      expect(mockTemplateService.getTemplate).toHaveBeenCalledWith(1, 'invalid_mode');
    });

    it('should handle invalid pagination parameters', async () => {
      const mockResponse = {
        items: [],
        total: 0,
        limit: 10,
        offset: 0,
        hasMore: false
      };

      mockTemplateService.listTemplates = vi.fn().mockResolvedValue(mockResponse);

      // Should handle negative values gracefully
      const result = await server.testListTemplates(-5, -10, 'views');

      expect(mockTemplateService.listTemplates).toHaveBeenCalledWith(-5, -10, 'views');
      expect(result.pagination.limit).toBe(10);
      expect(result.pagination.offset).toBe(0);
    });
  });

  describe('Integration with existing functionality', () => {
    it('should maintain backward compatibility', async () => {
      // Existing getTemplate method should work without mode parameter
      const mockTemplate = { id: 1, name: 'Test' };
      mockTemplateService.getTemplate = vi.fn().mockResolvedValue(mockTemplate);

      const result = await server.testGetTemplate(1);

      expect(mockTemplateService.getTemplate).toHaveBeenCalledWith(1, 'full');
    });

    it('should work with existing template tools', async () => {
      // Test that existing functionality isn't broken
      const mockResponse = {
        items: [{ id: 1, name: 'Template' }],
        total: 1,
        limit: 10,
        offset: 0,
        hasMore: false
      };

      mockTemplateService.listNodeTemplates = vi.fn().mockResolvedValue(mockResponse);

      const result = await server.testListNodeTemplates(['n8n-nodes-base.webhook']);

      expect(mockTemplateService.listNodeTemplates).toHaveBeenCalledWith(['n8n-nodes-base.webhook'], 10, 0);
      expect(result.templates).toBeDefined();
      expect(result.pagination).toBeDefined();
    });
  });
});