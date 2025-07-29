import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as Database from 'better-sqlite3';
import { TemplateRepository } from '../../../src/templates/template-repository';
import { DatabaseAdapter } from '../../../src/database/database-adapter';
import { TestDatabase, TestDataGenerator } from './test-utils';
import { TemplateWorkflow, TemplateDetail } from '../../../src/templates/template-fetcher';

describe('TemplateRepository Integration Tests', () => {
  let testDb: TestDatabase;
  let db: Database;
  let repository: TemplateRepository;
  let adapter: DatabaseAdapter;

  beforeEach(async () => {
    testDb = new TestDatabase({ mode: 'memory', enableFTS5: true });
    db = await testDb.initialize();
    adapter = new DatabaseAdapter(db);
    repository = new TemplateRepository(adapter);
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  describe('saveTemplate', () => {
    it('should save single template successfully', () => {
      const template = createTemplateWorkflow();
      repository.saveTemplate(template);

      const saved = repository.getTemplate(template.id);
      expect(saved).toBeTruthy();
      expect(saved?.workflow_id).toBe(template.id);
      expect(saved?.name).toBe(template.name);
    });

    it('should update existing template', () => {
      const template = createTemplateWorkflow();
      
      // Save initial version
      repository.saveTemplate(template);
      
      // Update and save again
      const updated: TemplateWorkflow = { ...template, name: 'Updated Template' };
      repository.saveTemplate(updated);

      const saved = repository.getTemplate(template.id);
      expect(saved?.name).toBe('Updated Template');
      
      // Should not create duplicate
      const all = repository.getAllTemplates();
      expect(all).toHaveLength(1);
    });

    it('should handle templates with complex node types', () => {
      const template = createTemplateWorkflow({
        id: 1,
        nodes: [
          {
            id: 'node1',
            name: 'Webhook',
            type: 'n8n-nodes-base.webhook',
            typeVersion: 1,
            position: [100, 100],
            parameters: {}
          },
          {
            id: 'node2',
            name: 'HTTP Request',
            type: 'n8n-nodes-base.httpRequest',
            typeVersion: 3,
            position: [300, 100],
            parameters: {
              url: 'https://api.example.com',
              method: 'POST'
            }
          }
        ]
      });

      repository.saveTemplate(template);
      
      const saved = repository.getTemplate(template.id);
      expect(saved).toBeTruthy();
      
      const nodesUsed = JSON.parse(saved!.nodes_used);
      expect(nodesUsed).toContain('n8n-nodes-base.webhook');
      expect(nodesUsed).toContain('n8n-nodes-base.httpRequest');
    });

    it('should sanitize workflow data before saving', () => {
      const template = createTemplateWorkflow({
        workflowInfo: {
          nodeCount: 5,
          webhookCount: 1,
          // Add some data that should be sanitized
          executionId: 'should-be-removed',
          pinData: { node1: { data: 'sensitive' } }
        }
      });

      repository.saveTemplate(template);
      
      const saved = repository.getTemplate(template.id);
      expect(saved).toBeTruthy();
      
      const workflowJson = JSON.parse(saved!.workflow_json);
      expect(workflowJson.pinData).toBeUndefined();
    });
  });

  describe('getTemplate', () => {
    beforeEach(() => {
      const templates = [
        createTemplateWorkflow({ id: 1, name: 'Template 1' }),
        createTemplateWorkflow({ id: 2, name: 'Template 2' })
      ];
      templates.forEach(t => repository.saveTemplate(t));
    });

    it('should retrieve template by id', () => {
      const template = repository.getTemplate(1);
      expect(template).toBeTruthy();
      expect(template?.name).toBe('Template 1');
    });

    it('should return null for non-existent template', () => {
      const template = repository.getTemplate(999);
      expect(template).toBeNull();
    });
  });

  describe('searchTemplates with FTS5', () => {
    beforeEach(() => {
      const templates = [
        createTemplateWorkflow({
          id: 1,
          name: 'Webhook to Slack',
          description: 'Send Slack notifications when webhook received'
        }),
        createTemplateWorkflow({
          id: 2,
          name: 'HTTP Data Processing',
          description: 'Process data from HTTP requests'
        }),
        createTemplateWorkflow({
          id: 3,
          name: 'Email Automation',
          description: 'Automate email sending workflow'
        })
      ];
      templates.forEach(t => repository.saveTemplate(t));
    });

    it('should search templates by name', () => {
      const results = repository.searchTemplates('webhook');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Webhook to Slack');
    });

    it('should search templates by description', () => {
      const results = repository.searchTemplates('automate');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Email Automation');
    });

    it('should handle multiple search terms', () => {
      const results = repository.searchTemplates('data process');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('HTTP Data Processing');
    });

    it('should limit search results', () => {
      // Add more templates
      for (let i = 4; i <= 20; i++) {
        repository.saveTemplate(createTemplateWorkflow({
          id: i,
          name: `Test Template ${i}`,
          description: 'Test description'
        }));
      }

      const results = repository.searchTemplates('test', 5);
      expect(results).toHaveLength(5);
    });

    it('should handle special characters in search', () => {
      repository.saveTemplate(createTemplateWorkflow({
        id: 100,
        name: 'Special @ # $ Template',
        description: 'Template with special characters'
      }));

      const results = repository.searchTemplates('special');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('getTemplatesByNodeTypes', () => {
    beforeEach(() => {
      const templates = [
        createTemplateWorkflow({
          id: 1,
          nodes: [
            { type: 'n8n-nodes-base.webhook' },
            { type: 'n8n-nodes-base.slack' }
          ]
        }),
        createTemplateWorkflow({
          id: 2,
          nodes: [
            { type: 'n8n-nodes-base.httpRequest' },
            { type: 'n8n-nodes-base.set' }
          ]
        }),
        createTemplateWorkflow({
          id: 3,
          nodes: [
            { type: 'n8n-nodes-base.webhook' },
            { type: 'n8n-nodes-base.httpRequest' }
          ]
        })
      ];
      templates.forEach(t => repository.saveTemplate(t));
    });

    it('should find templates using specific node types', () => {
      const results = repository.getTemplatesByNodeTypes(['n8n-nodes-base.webhook']);
      expect(results).toHaveLength(2);
      expect(results.map(r => r.workflow_id)).toContain(1);
      expect(results.map(r => r.workflow_id)).toContain(3);
    });

    it('should find templates using multiple node types', () => {
      const results = repository.getTemplatesByNodeTypes([
        'n8n-nodes-base.webhook',
        'n8n-nodes-base.slack'
      ]);
      expect(results).toHaveLength(1);
      expect(results[0].workflow_id).toBe(1);
    });

    it('should return empty array for non-existent node types', () => {
      const results = repository.getTemplatesByNodeTypes(['non-existent-node']);
      expect(results).toHaveLength(0);
    });

    it('should limit results', () => {
      const results = repository.getTemplatesByNodeTypes(['n8n-nodes-base.webhook'], 1);
      expect(results).toHaveLength(1);
    });
  });

  describe('getAllTemplates', () => {
    it('should return empty array when no templates', () => {
      const templates = repository.getAllTemplates();
      expect(templates).toHaveLength(0);
    });

    it('should return all templates with limit', () => {
      for (let i = 1; i <= 20; i++) {
        repository.saveTemplate(createTemplateWorkflow({ id: i }));
      }

      const templates = repository.getAllTemplates(10);
      expect(templates).toHaveLength(10);
    });

    it('should order templates by updated_at descending', () => {
      // Save templates with slight delay to ensure different timestamps
      const template1 = createTemplateWorkflow({ id: 1, name: 'First' });
      repository.saveTemplate(template1);

      // Small delay
      const template2 = createTemplateWorkflow({ id: 2, name: 'Second' });
      repository.saveTemplate(template2);

      const templates = repository.getAllTemplates();
      expect(templates).toHaveLength(2);
      // Most recent should be first
      expect(templates[0].name).toBe('Second');
    });
  });

  describe('getTemplateDetail', () => {
    it('should return template with full workflow data', () => {
      const template = createTemplateDetail();
      repository.saveTemplateDetail(template);

      const saved = repository.getTemplateDetail(template.id);
      expect(saved).toBeTruthy();
      expect(saved?.workflow).toBeTruthy();
      expect(saved?.workflow.nodes).toHaveLength(template.workflow.nodes.length);
    });

    it('should handle missing workflow gracefully', () => {
      const template = createTemplateWorkflow({ id: 1 });
      repository.saveTemplate(template);

      const detail = repository.getTemplateDetail(1);
      expect(detail).toBeNull();
    });
  });

  describe('clearOldTemplates', () => {
    it('should remove templates older than specified days', () => {
      // Insert old template (30 days ago)
      db.prepare(`
        INSERT INTO templates (
          id, workflow_id, name, description,
          nodes_used, workflow_json, categories, views,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, '[]', '{}', '[]', 0, datetime('now', '-31 days'), datetime('now', '-31 days'))
      `).run(1, 1001, 'Old Template', 'Old template');

      // Insert recent template
      repository.saveTemplate(createTemplateWorkflow({ id: 2, name: 'Recent Template' }));

      // Clear templates older than 30 days
      const deleted = repository.clearOldTemplates(30);
      expect(deleted).toBe(1);

      const remaining = repository.getAllTemplates();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].name).toBe('Recent Template');
    });
  });

  describe('Transaction handling', () => {
    it('should rollback on error during bulk save', () => {
      const templates = [
        createTemplateWorkflow({ id: 1 }),
        createTemplateWorkflow({ id: 2 }),
        { id: null } as any // Invalid template
      ];

      expect(() => {
        templates.forEach(t => repository.saveTemplate(t));
      }).toThrow();

      // No templates should be saved due to error
      const all = repository.getAllTemplates();
      expect(all).toHaveLength(0);
    });
  });

  describe('FTS5 performance', () => {
    it('should handle large dataset searches efficiently', () => {
      // Insert 1000 templates
      const templates = Array.from({ length: 1000 }, (_, i) => 
        createTemplateWorkflow({
          id: i + 1,
          name: `Template ${i}`,
          description: `Description for ${['webhook', 'http', 'automation', 'data'][i % 4]} workflow ${i}`
        })
      );

      const insertMany = db.transaction((templates: TemplateWorkflow[]) => {
        templates.forEach(t => repository.saveTemplate(t));
      });

      const start = Date.now();
      insertMany(templates);
      const insertDuration = Date.now() - start;

      expect(insertDuration).toBeLessThan(2000); // Should complete in under 2 seconds

      // Test search performance
      const searchStart = Date.now();
      const results = repository.searchTemplates('webhook', 50);
      const searchDuration = Date.now() - searchStart;

      expect(searchDuration).toBeLessThan(50); // Search should be very fast
      expect(results).toHaveLength(50);
    });
  });
});

// Helper functions
function createTemplateWorkflow(overrides: any = {}): TemplateWorkflow {
  const id = overrides.id || Math.floor(Math.random() * 10000);
  const nodes = overrides.nodes || [
    {
      id: 'node1',
      name: 'Start',
      type: 'n8n-nodes-base.start',
      typeVersion: 1,
      position: [100, 100],
      parameters: {}
    }
  ];

  return {
    id,
    name: overrides.name || `Test Workflow ${id}`,
    workflow: {
      nodes: nodes.map((n: any) => ({
        id: n.id || 'node1',
        name: n.name || 'Node',
        type: n.type || 'n8n-nodes-base.start',
        typeVersion: n.typeVersion || 1,
        position: n.position || [100, 100],
        parameters: n.parameters || {}
      })),
      connections: overrides.connections || {},
      settings: overrides.settings || {}
    },
    user: {
      username: overrides.username || 'testuser'
    },
    views: overrides.views || 100,
    totalViews: overrides.totalViews || 100,
    createdAt: overrides.createdAt || new Date().toISOString(),
    updatedAt: overrides.updatedAt || new Date().toISOString(),
    description: overrides.description,
    workflowInfo: overrides.workflowInfo || {
      nodeCount: nodes.length,
      webhookCount: nodes.filter((n: any) => n.type?.includes('webhook')).length
    },
    ...overrides
  };
}

function createTemplateDetail(overrides: any = {}): TemplateDetail {
  const base = createTemplateWorkflow(overrides);
  return {
    ...base,
    workflow: {
      id: base.id.toString(),
      name: base.name,
      nodes: base.workflow.nodes,
      connections: base.workflow.connections,
      settings: base.workflow.settings,
      pinData: overrides.pinData
    },
    categories: overrides.categories || [
      { id: 1, name: 'automation' }
    ]
  };
}