import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MetadataGenerator, TemplateMetadataSchema, MetadataRequest } from '../../../src/templates/metadata-generator';

// Mock OpenAI
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn()
        }
      }
    }))
  };
});

describe('MetadataGenerator', () => {
  let generator: MetadataGenerator;
  
  beforeEach(() => {
    generator = new MetadataGenerator('test-api-key', 'gpt-4o-mini');
  });
  
  describe('createBatchRequest', () => {
    it('should create a valid batch request', () => {
      const template: MetadataRequest = {
        templateId: 123,
        name: 'Test Workflow',
        description: 'A test workflow',
        nodes: ['n8n-nodes-base.webhook', 'n8n-nodes-base.httpRequest', 'n8n-nodes-base.slack']
      };
      
      const request = generator.createBatchRequest(template);
      
      expect(request.custom_id).toBe('template-123');
      expect(request.method).toBe('POST');
      expect(request.url).toBe('/v1/chat/completions');
      expect(request.body.model).toBe('gpt-4o-mini');
      expect(request.body.response_format.type).toBe('json_schema');
      expect(request.body.response_format.json_schema.strict).toBe(true);
      expect(request.body.messages).toHaveLength(2);
    });
    
    it('should summarize nodes effectively', () => {
      const template: MetadataRequest = {
        templateId: 456,
        name: 'Complex Workflow',
        nodes: [
          'n8n-nodes-base.webhook',
          'n8n-nodes-base.httpRequest',
          'n8n-nodes-base.httpRequest',
          'n8n-nodes-base.postgres',
          'n8n-nodes-base.slack',
          '@n8n/n8n-nodes-langchain.agent'
        ]
      };
      
      const request = generator.createBatchRequest(template);
      const userMessage = request.body.messages[1].content;
      
      expect(userMessage).toContain('Complex Workflow');
      expect(userMessage).toContain('Nodes Used (6)');
      expect(userMessage).toContain('HTTP/Webhooks');
    });
  });
  
  describe('parseResult', () => {
    it('should parse a successful result', () => {
      const mockResult = {
        custom_id: 'template-789',
        response: {
          body: {
            choices: [{
              message: {
                content: JSON.stringify({
                  categories: ['automation', 'integration'],
                  complexity: 'medium',
                  use_cases: ['API integration', 'Data sync'],
                  estimated_setup_minutes: 30,
                  required_services: ['Slack API'],
                  key_features: ['Webhook triggers', 'API calls'],
                  target_audience: ['developers']
                })
              },
              finish_reason: 'stop'
            }]
          }
        }
      };
      
      const result = generator.parseResult(mockResult);
      
      expect(result.templateId).toBe(789);
      expect(result.metadata.categories).toEqual(['automation', 'integration']);
      expect(result.metadata.complexity).toBe('medium');
      expect(result.error).toBeUndefined();
    });
    
    it('should handle error results', () => {
      const mockResult = {
        custom_id: 'template-999',
        error: {
          message: 'API error'
        }
      };
      
      const result = generator.parseResult(mockResult);
      
      expect(result.templateId).toBe(999);
      expect(result.error).toBe('API error');
      expect(result.metadata).toBeDefined();
      expect(result.metadata.complexity).toBe('medium'); // Default metadata
    });
    
    it('should handle malformed responses', () => {
      const mockResult = {
        custom_id: 'template-111',
        response: {
          body: {
            choices: [{
              message: {
                content: 'not valid json'
              },
              finish_reason: 'stop'
            }]
          }
        }
      };
      
      const result = generator.parseResult(mockResult);
      
      expect(result.templateId).toBe(111);
      expect(result.error).toContain('Unexpected token');
      expect(result.metadata).toBeDefined();
    });
  });
  
  describe('TemplateMetadataSchema', () => {
    it('should validate correct metadata', () => {
      const validMetadata = {
        categories: ['automation', 'integration'],
        complexity: 'simple' as const,
        use_cases: ['API calls', 'Data processing'],
        estimated_setup_minutes: 15,
        required_services: [],
        key_features: ['Fast processing'],
        target_audience: ['developers']
      };
      
      const result = TemplateMetadataSchema.safeParse(validMetadata);
      
      expect(result.success).toBe(true);
    });
    
    it('should reject invalid complexity', () => {
      const invalidMetadata = {
        categories: ['automation'],
        complexity: 'very-hard', // Invalid
        use_cases: ['API calls'],
        estimated_setup_minutes: 15,
        required_services: [],
        key_features: ['Fast'],
        target_audience: ['developers']
      };
      
      const result = TemplateMetadataSchema.safeParse(invalidMetadata);
      
      expect(result.success).toBe(false);
    });
    
    it('should enforce array limits', () => {
      const tooManyCategories = {
        categories: ['a', 'b', 'c', 'd', 'e', 'f'], // Max 5
        complexity: 'simple' as const,
        use_cases: ['API calls'],
        estimated_setup_minutes: 15,
        required_services: [],
        key_features: ['Fast'],
        target_audience: ['developers']
      };
      
      const result = TemplateMetadataSchema.safeParse(tooManyCategories);
      
      expect(result.success).toBe(false);
    });
    
    it('should enforce time limits', () => {
      const tooLongSetup = {
        categories: ['automation'],
        complexity: 'complex' as const,
        use_cases: ['API calls'],
        estimated_setup_minutes: 500, // Max 480
        required_services: [],
        key_features: ['Fast'],
        target_audience: ['developers']
      };
      
      const result = TemplateMetadataSchema.safeParse(tooLongSetup);
      
      expect(result.success).toBe(false);
    });
  });
});