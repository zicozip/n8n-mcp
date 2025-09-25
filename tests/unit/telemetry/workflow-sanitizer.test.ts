import { describe, it, expect } from 'vitest';
import { WorkflowSanitizer } from '../../../src/telemetry/workflow-sanitizer';

describe('WorkflowSanitizer', () => {
  describe('sanitizeWorkflow', () => {
    it('should remove API keys from parameters', () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'HTTP Request',
            type: 'n8n-nodes-base.httpRequest',
            position: [100, 100],
            parameters: {
              url: 'https://api.example.com',
              apiKey: 'sk-1234567890abcdef1234567890abcdef',
              headers: {
                'Authorization': 'Bearer sk-1234567890abcdef1234567890abcdef'
              }
            }
          }
        ],
        connections: {}
      };

      const sanitized = WorkflowSanitizer.sanitizeWorkflow(workflow);

      expect(sanitized.nodes[0].parameters.apiKey).toBe('[REDACTED]');
      expect(sanitized.nodes[0].parameters.headers.Authorization).toBe('[REDACTED]');
    });

    it('should sanitize webhook URLs but keep structure', () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'Webhook',
            type: 'n8n-nodes-base.webhook',
            position: [100, 100],
            parameters: {
              path: 'my-webhook',
              webhookUrl: 'https://n8n.example.com/webhook/abc-def-ghi',
              method: 'POST'
            }
          }
        ],
        connections: {}
      };

      const sanitized = WorkflowSanitizer.sanitizeWorkflow(workflow);

      expect(sanitized.nodes[0].parameters.webhookUrl).toBe('https://[webhook-url]');
      expect(sanitized.nodes[0].parameters.method).toBe('POST'); // Method should remain
      expect(sanitized.nodes[0].parameters.path).toBe('my-webhook'); // Path should remain
    });

    it('should remove credentials entirely', () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'Slack',
            type: 'n8n-nodes-base.slack',
            position: [100, 100],
            parameters: {
              channel: 'general',
              text: 'Hello World'
            },
            credentials: {
              slackApi: {
                id: 'cred-123',
                name: 'My Slack'
              }
            }
          }
        ],
        connections: {}
      };

      const sanitized = WorkflowSanitizer.sanitizeWorkflow(workflow);

      expect(sanitized.nodes[0].credentials).toBeUndefined();
      expect(sanitized.nodes[0].parameters.channel).toBe('general'); // Channel should remain
      expect(sanitized.nodes[0].parameters.text).toBe('Hello World'); // Text should remain
    });

    it('should sanitize URLs in parameters', () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'HTTP Request',
            type: 'n8n-nodes-base.httpRequest',
            position: [100, 100],
            parameters: {
              url: 'https://api.example.com/endpoint',
              endpoint: 'https://another.example.com/api',
              baseUrl: 'https://base.example.com'
            }
          }
        ],
        connections: {}
      };

      const sanitized = WorkflowSanitizer.sanitizeWorkflow(workflow);

      expect(sanitized.nodes[0].parameters.url).toBe('https://[domain]/endpoint');
      expect(sanitized.nodes[0].parameters.endpoint).toBe('[REDACTED]');
      expect(sanitized.nodes[0].parameters.baseUrl).toBe('https://[domain]');
    });

    it('should calculate workflow metrics correctly', () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'Webhook',
            type: 'n8n-nodes-base.webhook',
            position: [100, 100],
            parameters: {}
          },
          {
            id: '2',
            name: 'HTTP Request',
            type: 'n8n-nodes-base.httpRequest',
            position: [200, 100],
            parameters: {}
          },
          {
            id: '3',
            name: 'Slack',
            type: 'n8n-nodes-base.slack',
            position: [300, 100],
            parameters: {}
          }
        ],
        connections: {
          '1': {
            main: [[{ node: '2', type: 'main', index: 0 }]]
          },
          '2': {
            main: [[{ node: '3', type: 'main', index: 0 }]]
          }
        }
      };

      const sanitized = WorkflowSanitizer.sanitizeWorkflow(workflow);

      expect(sanitized.nodeCount).toBe(3);
      expect(sanitized.nodeTypes).toContain('n8n-nodes-base.webhook');
      expect(sanitized.nodeTypes).toContain('n8n-nodes-base.httpRequest');
      expect(sanitized.nodeTypes).toContain('n8n-nodes-base.slack');
      expect(sanitized.hasTrigger).toBe(true);
      expect(sanitized.hasWebhook).toBe(true);
      expect(sanitized.complexity).toBe('simple');
    });

    it('should calculate complexity based on node count', () => {
      const createWorkflow = (nodeCount: number) => ({
        nodes: Array.from({ length: nodeCount }, (_, i) => ({
          id: String(i),
          name: `Node ${i}`,
          type: 'n8n-nodes-base.function',
          position: [i * 100, 100],
          parameters: {}
        })),
        connections: {}
      });

      const simple = WorkflowSanitizer.sanitizeWorkflow(createWorkflow(5));
      expect(simple.complexity).toBe('simple');

      const medium = WorkflowSanitizer.sanitizeWorkflow(createWorkflow(15));
      expect(medium.complexity).toBe('medium');

      const complex = WorkflowSanitizer.sanitizeWorkflow(createWorkflow(25));
      expect(complex.complexity).toBe('complex');
    });

    it('should generate consistent workflow hash', () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'Webhook',
            type: 'n8n-nodes-base.webhook',
            position: [100, 100],
            parameters: { path: 'test' }
          }
        ],
        connections: {}
      };

      const hash1 = WorkflowSanitizer.generateWorkflowHash(workflow);
      const hash2 = WorkflowSanitizer.generateWorkflowHash(workflow);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should sanitize nested objects in parameters', () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'Complex Node',
            type: 'n8n-nodes-base.httpRequest',
            position: [100, 100],
            parameters: {
              options: {
                headers: {
                  'X-API-Key': 'secret-key-1234567890abcdef',
                  'Content-Type': 'application/json'
                },
                body: {
                  data: 'some data',
                  token: 'another-secret-token-xyz123'
                }
              }
            }
          }
        ],
        connections: {}
      };

      const sanitized = WorkflowSanitizer.sanitizeWorkflow(workflow);

      expect(sanitized.nodes[0].parameters.options.headers['X-API-Key']).toBe('[REDACTED]');
      expect(sanitized.nodes[0].parameters.options.headers['Content-Type']).toBe('application/json');
      expect(sanitized.nodes[0].parameters.options.body.data).toBe('some data');
      expect(sanitized.nodes[0].parameters.options.body.token).toBe('[REDACTED]');
    });

    it('should preserve connections structure', () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'Node 1',
            type: 'n8n-nodes-base.start',
            position: [100, 100],
            parameters: {}
          },
          {
            id: '2',
            name: 'Node 2',
            type: 'n8n-nodes-base.function',
            position: [200, 100],
            parameters: {}
          }
        ],
        connections: {
          '1': {
            main: [[{ node: '2', type: 'main', index: 0 }]],
            error: [[{ node: '2', type: 'error', index: 0 }]]
          }
        }
      };

      const sanitized = WorkflowSanitizer.sanitizeWorkflow(workflow);

      expect(sanitized.connections).toEqual({
        '1': {
          main: [[{ node: '2', type: 'main', index: 0 }]],
          error: [[{ node: '2', type: 'error', index: 0 }]]
        }
      });
    });

    it('should remove sensitive workflow metadata', () => {
      const workflow = {
        id: 'workflow-123',
        name: 'My Workflow',
        nodes: [],
        connections: {},
        settings: {
          errorWorkflow: 'error-workflow-id',
          timezone: 'America/New_York'
        },
        staticData: { some: 'data' },
        pinData: { node1: 'pinned' },
        credentials: { slack: 'cred-123' },
        sharedWorkflows: ['user-456'],
        ownedBy: 'user-123',
        createdBy: 'user-123',
        updatedBy: 'user-456'
      };

      const sanitized = WorkflowSanitizer.sanitizeWorkflow(workflow);

      // These should be removed
      expect(sanitized.settings?.errorWorkflow).toBeUndefined();
      expect(sanitized.staticData).toBeUndefined();
      expect(sanitized.pinData).toBeUndefined();
      expect(sanitized.credentials).toBeUndefined();
      expect(sanitized.sharedWorkflows).toBeUndefined();
      expect(sanitized.ownedBy).toBeUndefined();
      expect(sanitized.createdBy).toBeUndefined();
      expect(sanitized.updatedBy).toBeUndefined();

      // These should be preserved
      expect(sanitized.nodes).toEqual([]);
      expect(sanitized.connections).toEqual({});
    });
  });
});