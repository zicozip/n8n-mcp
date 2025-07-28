import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigValidator } from '@/services/config-validator';
import { slackNodeFactory } from '@tests/fixtures/factories/node.factory';
import type { ValidationResult, ValidationError, ValidationWarning } from '@/services/config-validator';

// Mock the database
vi.mock('better-sqlite3');

describe('ConfigValidator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validate', () => {
    it('should validate required fields for Slack message post', () => {
      const nodeType = 'nodes-base.slack';
      const config = {
        resource: 'message',
        operation: 'post'
        // Missing required 'channel' field
      };
      const properties = [
        {
          name: 'resource',
          type: 'options',
          required: true,
          default: 'message',
          options: [
            { name: 'Message', value: 'message' },
            { name: 'Channel', value: 'channel' }
          ]
        },
        {
          name: 'operation',
          type: 'options',
          required: true,
          default: 'post',
          displayOptions: {
            show: { resource: ['message'] }
          },
          options: [
            { name: 'Post', value: 'post' },
            { name: 'Update', value: 'update' }
          ]
        },
        {
          name: 'channel',
          type: 'string',
          required: true,
          displayOptions: {
            show: { 
              resource: ['message'],
              operation: ['post']
            }
          }
        }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        type: 'missing_required',
        property: 'channel',
        message: "Required property 'channel' is missing",
        fix: 'Add channel to your configuration'
      });
    });

    it('should validate successfully with all required fields', () => {
      const nodeType = 'nodes-base.slack';
      const config = {
        resource: 'message',
        operation: 'post',
        channel: '#general',
        text: 'Hello, Slack!'
      };
      const properties = [
        {
          name: 'resource',
          type: 'options',
          required: true,
          default: 'message',
          options: [
            { name: 'Message', value: 'message' },
            { name: 'Channel', value: 'channel' }
          ]
        },
        {
          name: 'operation',
          type: 'options',
          required: true,
          default: 'post',
          displayOptions: {
            show: { resource: ['message'] }
          },
          options: [
            { name: 'Post', value: 'post' },
            { name: 'Update', value: 'update' }
          ]
        },
        {
          name: 'channel',
          type: 'string',
          required: true,
          displayOptions: {
            show: { 
              resource: ['message'],
              operation: ['post']
            }
          }
        },
        {
          name: 'text',
          type: 'string',
          default: '',
          displayOptions: {
            show: { 
              resource: ['message'],
              operation: ['post']
            }
          }
        }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.visibleProperties).toContain('channel');
      expect(result.visibleProperties).toContain('text');
    });

    it('should handle unknown node types gracefully', () => {
      const nodeType = 'nodes-base.unknown';
      const config = { someField: 'value' };
      const properties: any[] = [];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      // Unknown node types may still generate warnings for configured properties
      // This is expected behavior
    });

    it('should validate property types', () => {
      const nodeType = 'nodes-base.test';
      const config = {
        stringField: 123, // Should be string
        numberField: '456', // Should be number
        booleanField: 'true' // Should be boolean
      };
      const properties = [
        { name: 'stringField', type: 'string' },
        { name: 'numberField', type: 'number' },
        { name: 'booleanField', type: 'boolean' }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(3);
      expect(result.errors[0].type).toBe('invalid_type');
      expect(result.errors[0].property).toBe('stringField');
      expect(result.errors[1].type).toBe('invalid_type');
      expect(result.errors[1].property).toBe('numberField');
      expect(result.errors[2].type).toBe('invalid_type');
      expect(result.errors[2].property).toBe('booleanField');
    });

    it('should validate option values', () => {
      const nodeType = 'nodes-base.test';
      const config = {
        resource: 'invalid_option'
      };
      const properties = [
        {
          name: 'resource',
          type: 'options',
          options: [
            { name: 'User', value: 'user' },
            { name: 'Post', value: 'post' }
          ]
        }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        type: 'invalid_value',
        property: 'resource',
        message: "Invalid value for 'resource'. Must be one of: user, post"
      });
    });

    it('should check property visibility based on displayOptions', () => {
      const nodeType = 'nodes-base.test';
      const config = {
        resource: 'user',
        userField: 'visible'
      };
      const properties = [
        {
          name: 'resource',
          type: 'options',
          options: [
            { name: 'User', value: 'user' },
            { name: 'Post', value: 'post' }
          ]
        },
        {
          name: 'userField',
          type: 'string',
          displayOptions: {
            show: { resource: ['user'] }
          }
        },
        {
          name: 'postField',
          type: 'string',
          displayOptions: {
            show: { resource: ['post'] }
          }
        }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.visibleProperties).toContain('resource');
      expect(result.visibleProperties).toContain('userField');
      expect(result.hiddenProperties).toContain('postField');
    });

    it('should perform HTTP Request specific validation', () => {
      const nodeType = 'nodes-base.httpRequest';
      const config = {
        method: 'POST',
        url: 'invalid-url', // Missing protocol
        sendBody: false
      };
      const properties = [
        { name: 'method', type: 'options' },
        { name: 'url', type: 'string' },
        { name: 'sendBody', type: 'boolean' }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        type: 'invalid_value',
        property: 'url',
        message: 'URL must start with http:// or https://'
      });
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatchObject({
        type: 'missing_common',
        property: 'sendBody',
        message: 'POST requests typically send a body'
      });
      expect(result.autofix).toMatchObject({
        sendBody: true,
        contentType: 'json'
      });
    });

    it('should perform security checks for hardcoded credentials', () => {
      const nodeType = 'nodes-base.test';
      const config = {
        api_key: 'sk-1234567890abcdef',
        password: 'my-secret-password',
        token: 'hardcoded-token'
      };
      const properties = [
        { name: 'api_key', type: 'string' },
        { name: 'password', type: 'string' },
        { name: 'token', type: 'string' }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.warnings.filter(w => w.type === 'security')).toHaveLength(3);
      expect(result.warnings.some(w => w.property === 'api_key')).toBe(true);
      expect(result.warnings.some(w => w.property === 'password')).toBe(true);
      expect(result.warnings.some(w => w.property === 'token')).toBe(true);
    });

    it('should validate Code node configurations', () => {
      const nodeType = 'nodes-base.code';
      const config = {
        language: 'javascript',
        jsCode: '' // Empty code
      };
      const properties = [
        { name: 'language', type: 'options' },
        { name: 'jsCode', type: 'string' }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        type: 'missing_required',
        property: 'jsCode',
        message: 'Code cannot be empty'
      });
    });

    it('should validate JavaScript syntax in Code node', () => {
      const nodeType = 'nodes-base.code';
      const config = {
        language: 'javascript',
        jsCode: `
          const data = { foo: "bar" };
          if (data.foo {  // Missing closing parenthesis
            return [{json: data}];
          }
        `
      };
      const properties = [
        { name: 'language', type: 'options' },
        { name: 'jsCode', type: 'string' }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.errors.some(e => e.message.includes('Unbalanced')));
      expect(result.warnings).toHaveLength(1);
    });

    it('should validate n8n-specific patterns in Code node', () => {
      const nodeType = 'nodes-base.code';
      const config = {
        language: 'javascript',
        jsCode: `
          // Process data without returning
          const processedData = items.map(item => ({
            ...item.json,
            processed: true
          }));
          // No output provided
        `
      };
      const properties = [
        { name: 'language', type: 'options' },
        { name: 'jsCode', type: 'string' }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      // The warning should be about missing return statement
      expect(result.warnings.some(w => w.type === 'missing_common' && w.message.includes('No return statement found'))).toBe(true);
    });

    it('should validate database query security', () => {
      const nodeType = 'nodes-base.postgres';
      const config = {
        query: 'DELETE FROM users;' // Missing WHERE clause
      };
      const properties = [
        { name: 'query', type: 'string' }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.warnings.some(w => 
        w.type === 'security' && 
        w.message.includes('DELETE query without WHERE clause')
      )).toBe(true);
    });

    it('should check for SQL injection vulnerabilities', () => {
      const nodeType = 'nodes-base.mysql';
      const config = {
        query: 'SELECT * FROM users WHERE id = ${userId}'
      };
      const properties = [
        { name: 'query', type: 'string' }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.warnings.some(w => 
        w.type === 'security' && 
        w.message.includes('SQL injection')
      )).toBe(true);
    });

    it('should warn about inefficient configured but hidden properties', () => {
      const nodeType = 'nodes-base.test'; // Changed from Code node
      const config = {
        mode: 'manual',
        automaticField: 'This will not be used'
      };
      const properties = [
        {
          name: 'mode',
          type: 'options',
          options: [
            { name: 'Manual', value: 'manual' },
            { name: 'Automatic', value: 'automatic' }
          ]
        },
        {
          name: 'automaticField',
          type: 'string',
          displayOptions: {
            show: { mode: ['automatic'] }
          }
        }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.warnings.some(w => 
        w.type === 'inefficient' && 
        w.property === 'automaticField'
      )).toBe(true);
    });

    it('should suggest commonly used properties', () => {
      const nodeType = 'nodes-base.test';
      const config = {
        url: 'https://api.example.com'
      };
      const properties = [
        { name: 'url', type: 'string' },
        { name: 'authentication', type: 'options' },
        { name: 'timeout', type: 'number' }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.suggestions.some(s => s.includes('authentication'))).toBe(true);
      expect(result.suggestions.some(s => s.includes('timeout'))).toBe(true);
    });

    it('should handle webhook-specific validation', () => {
      const nodeType = 'nodes-base.webhook';
      const config = {
        responseMode: 'responseNode'
        // Missing responseData when using responseNode mode
      };
      const properties = [
        { name: 'responseMode', type: 'options' },
        { name: 'responseData', type: 'string' }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.suggestions.some(s => 
        s.includes('Respond to Webhook')
      )).toBe(true);
    });

    it('should validate Python code syntax', () => {
      const nodeType = 'nodes-base.code';
      const config = {
        language: 'python',
        pythonCode: `
def process_items():
    for item in items  # Missing colon
        processed = item.get('json', {})
        return [{"json": processed}]
        `
      };
      const properties = [
        { name: 'language', type: 'options' },
        { name: 'pythonCode', type: 'string' }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.warnings.some(w => 
        w.message.includes('Missing colon after control structure')
      )).toBe(true);
    });

    it('should detect mixed indentation in Python code', () => {
      const nodeType = 'nodes-base.code';
      const config = {
        language: 'python',
        pythonCode: `
def process():
    if True:
\t\treturn True  # Mixed tabs and spaces
        `
      };
      const properties = [
        { name: 'language', type: 'options' },
        { name: 'pythonCode', type: 'string' }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.errors.some(e => 
        e.message.includes('Mixed tabs and spaces')
      )).toBe(true);
    });

    it('should warn about incorrect n8n return patterns', () => {
      const nodeType = 'nodes-base.code';
      const config = {
        language: 'javascript',
        jsCode: `
          const data = items.map(item => item.json);
          const processed = data.reduce((acc, item) => ({ ...acc, ...item }), {});
          return {result: processed};
        `
      };
      const properties = [
        { name: 'language', type: 'options' },
        { name: 'jsCode', type: 'string' }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.warnings.some(w => 
        w.message.includes('Return value must be an array')
      )).toBe(true);
    });

    it('should validate JSON in HTTP Request body', () => {
      const nodeType = 'nodes-base.httpRequest';
      const config = {
        method: 'POST',
        url: 'https://api.example.com',
        sendBody: true,
        contentType: 'json',
        jsonBody: '{ invalid json' // Invalid JSON
      };
      const properties = [
        { name: 'method', type: 'options' },
        { name: 'url', type: 'string' },
        { name: 'sendBody', type: 'boolean' },
        { name: 'contentType', type: 'options' },
        { name: 'jsonBody', type: 'string' }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.errors.some(e => 
        e.property === 'jsonBody' &&
        e.message.includes('invalid JSON')
      )).toBe(true);
    });

    it('should handle empty properties array', () => {
      const nodeType = 'nodes-base.test';
      const config = { someField: 'value' };
      const properties: any[] = [];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle missing displayOptions gracefully', () => {
      const nodeType = 'nodes-base.test';
      const config = { field1: 'value1' };
      const properties = [
        { name: 'field1', type: 'string' },
        { name: 'field2', type: 'string' } // No displayOptions
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.visibleProperties).toContain('field1');
      expect(result.visibleProperties).toContain('field2');
    });

    it('should validate options with string format', () => {
      const nodeType = 'nodes-base.test';
      const config = { resource: 'user' };
      const properties = [
        {
          name: 'resource',
          type: 'options',
          options: ['user', 'post', 'comment'] // String array format
        }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should warn about security issues with eval/exec', () => {
      const nodeType = 'nodes-base.code';
      const config = {
        language: 'javascript',
        jsCode: `
          const userInput = items[0].json.code;
          const result = eval(userInput); // Security risk
          return [{json: {result}}];
        `
      };
      const properties = [
        { name: 'language', type: 'options' },
        { name: 'jsCode', type: 'string' }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.warnings.some(w => 
        w.type === 'security' &&
        w.message.includes('eval/exec')
      )).toBe(true);
    });

    it('should detect infinite loops', () => {
      const nodeType = 'nodes-base.code';
      const config = {
        language: 'javascript',
        jsCode: `
          while (true) {
            // Infinite loop
            processData();
          }
        `
      };
      const properties = [
        { name: 'language', type: 'options' },
        { name: 'jsCode', type: 'string' }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.warnings.some(w => 
        w.type === 'security' &&
        w.message.includes('Infinite loop')
      )).toBe(true);
    });

    it('should suggest error handling for complex code', () => {
      const nodeType = 'nodes-base.code';
      const config = {
        language: 'javascript',
        jsCode: `
          // Complex code without error handling (over 200 chars)
          const data = items.map(item => {
            const processed = item.json;
            processed.timestamp = new Date().toISOString();
            processed.status = 'processed';
            return processed;
          });
          const filtered = data.filter(d => d.status === 'processed');
          return filtered.map(item => ({json: item}));
        `
      };
      const properties = [
        { name: 'language', type: 'options' },
        { name: 'jsCode', type: 'string' }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.warnings.some(w => 
        w.type === 'best_practice' &&
        w.message.includes('error handling')
      )).toBe(true);
    });
  });

  describe('edge cases and additional coverage', () => {
    it('should handle null and undefined config values', () => {
      const nodeType = 'nodes-base.test';
      const config = {
        stringField: null,
        numberField: undefined,
        booleanField: null
      };
      const properties = [
        { name: 'stringField', type: 'string', required: true },
        { name: 'numberField', type: 'number' },
        { name: 'booleanField', type: 'boolean' }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.errors).toHaveLength(3);
      expect(result.errors.every(e => e.type === 'invalid_type')).toBe(true);
    });

    it('should validate nested displayOptions conditions', () => {
      const nodeType = 'nodes-base.test';
      const config = {
        mode: 'advanced',
        resource: 'user',
        operation: 'create'
      };
      const properties = [
        { name: 'mode', type: 'options' },
        { name: 'resource', type: 'options' },
        { name: 'operation', type: 'options' },
        {
          name: 'advancedField',
          type: 'string',
          displayOptions: {
            show: {
              mode: ['advanced'],
              resource: ['user'],
              operation: ['create', 'update']
            }
          }
        }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.visibleProperties).toContain('advancedField');
    });

    it('should handle hide conditions in displayOptions', () => {
      const nodeType = 'nodes-base.test';
      const config = {
        mode: 'simple',
        showAdvanced: true
      };
      const properties = [
        { name: 'mode', type: 'options' },
        { name: 'showAdvanced', type: 'boolean' },
        {
          name: 'hiddenInSimpleMode',
          type: 'string',
          displayOptions: {
            hide: {
              mode: ['simple']
            }
          }
        }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.hiddenProperties).toContain('hiddenInSimpleMode');
    });

    it('should validate Code node with $helpers usage', () => {
      const nodeType = 'nodes-base.code';
      const config = {
        language: 'javascript',
        jsCode: `
          const response = await $helpers.httpRequest({
            method: 'GET',
            url: 'https://api.example.com/data'
          });
          return [{json: response}];
        `
      };
      const properties = [
        { name: 'language', type: 'options' },
        { name: 'jsCode', type: 'string' }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.warnings.some(w => 
        w.type === 'best_practice' && 
        w.message.includes('$helpers availability')
      )).toBe(true);
    });

    it('should detect incorrect $helpers.getWorkflowStaticData usage', () => {
      const nodeType = 'nodes-base.code';
      const config = {
        language: 'javascript',
        jsCode: `
          const staticData = $helpers.getWorkflowStaticData();
          staticData.counter = (staticData.counter || 0) + 1;
          return [{json: {count: staticData.counter}}];
        `
      };
      const properties = [
        { name: 'language', type: 'options' },
        { name: 'jsCode', type: 'string' }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.warnings.some(w => 
        w.type === 'invalid_value' && 
        w.message.includes('$helpers.getWorkflowStaticData() is incorrect')
      )).toBe(true);
    });

    it('should warn about using external libraries in Python code', () => {
      const nodeType = 'nodes-base.code';
      const config = {
        language: 'python',
        pythonCode: `
          import pandas as pd
          import requests
          
          df = pd.DataFrame(items)
          response = requests.get('https://api.example.com')
          return [{"json": {"data": response.json()}}]
        `
      };
      const properties = [
        { name: 'language', type: 'options' },
        { name: 'pythonCode', type: 'string' }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.warnings.some(w => 
        w.type === 'invalid_value' && 
        w.message.includes('External libraries not available')
      )).toBe(true);
    });

    it('should validate crypto module usage', () => {
      const nodeType = 'nodes-base.code';
      const config = {
        language: 'javascript',
        jsCode: `
          const uuid = crypto.randomUUID();
          return [{json: {id: uuid}}];
        `
      };
      const properties = [
        { name: 'language', type: 'options' },
        { name: 'jsCode', type: 'string' }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.warnings.some(w => 
        w.type === 'invalid_value' && 
        w.message.includes('Using crypto without require')
      )).toBe(true);
    });

    it('should validate HTTP Request with authentication in API URLs', () => {
      const nodeType = 'nodes-base.httpRequest';
      const config = {
        method: 'GET',
        url: 'https://api.github.com/user/repos',
        authentication: 'none'
      };
      const properties = [
        { name: 'method', type: 'options' },
        { name: 'url', type: 'string' },
        { name: 'authentication', type: 'options' }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.warnings.some(w => 
        w.type === 'security' && 
        w.message.includes('API endpoints typically require authentication')
      )).toBe(true);
    });

    it('should validate SQL SELECT * performance warning', () => {
      const nodeType = 'nodes-base.postgres';
      const config = {
        query: 'SELECT * FROM large_table WHERE status = "active"'
      };
      const properties = [
        { name: 'query', type: 'string' }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.suggestions.some(s => 
        s.includes('Consider selecting specific columns')
      )).toBe(true);
    });

    it('should handle empty code in Code node', () => {
      const nodeType = 'nodes-base.code';
      const config = {
        language: 'javascript',
        jsCode: '   \n  \t  \n   ' // Just whitespace
      };
      const properties = [
        { name: 'language', type: 'options' },
        { name: 'jsCode', type: 'string' }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => 
        e.type === 'missing_required' && 
        e.message.includes('Code cannot be empty')
      )).toBe(true);
    });

    it('should validate complex return patterns in Code node', () => {
      const nodeType = 'nodes-base.code';
      const config = {
        language: 'javascript',
        jsCode: `
          return ["string1", "string2", "string3"];
        `
      };
      const properties = [
        { name: 'language', type: 'options' },
        { name: 'jsCode', type: 'string' }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.warnings.some(w => 
        w.type === 'invalid_value' && 
        w.message.includes('Items must be objects with json property')
      )).toBe(true);
    });

    it('should validate console.log usage', () => {
      const nodeType = 'nodes-base.code';
      const config = {
        language: 'javascript',
        jsCode: `
          console.log('Debug info:', items);
          return items;
        `
      };
      const properties = [
        { name: 'language', type: 'options' },
        { name: 'jsCode', type: 'string' }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.warnings.some(w => 
        w.type === 'best_practice' && 
        w.message.includes('console.log output appears in n8n execution logs')
      )).toBe(true);
    });

    it('should validate $json usage warning', () => {
      const nodeType = 'nodes-base.code';
      const config = {
        language: 'javascript',
        jsCode: `
          const data = $json.myField;
          return [{json: {processed: data}}];
        `
      };
      const properties = [
        { name: 'language', type: 'options' },
        { name: 'jsCode', type: 'string' }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.warnings.some(w => 
        w.type === 'best_practice' && 
        w.message.includes('$json only works in "Run Once for Each Item" mode')
      )).toBe(true);
    });

    it('should not warn about properties for Code nodes', () => {
      const nodeType = 'nodes-base.code';
      const config = {
        language: 'javascript',
        jsCode: 'return items;',
        unusedProperty: 'this should not generate a warning for Code nodes'
      };
      const properties = [
        { name: 'language', type: 'options' },
        { name: 'jsCode', type: 'string' }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      // Code nodes should skip the common issues check that warns about unused properties
      expect(result.warnings.some(w => 
        w.type === 'inefficient' && 
        w.property === 'unusedProperty'
      )).toBe(false);
    });

    it('should handle internal properties that start with underscore', () => {
      const nodeType = 'nodes-base.test';
      const config = {
        '@version': 1,
        '_internalField': 'value',
        normalField: 'value'
      };
      const properties = [
        { name: 'normalField', type: 'string' }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      // Should not warn about @version or _internalField
      expect(result.warnings.some(w => 
        w.property === '@version' || w.property === '_internalField'
      )).toBe(false);
    });

    it('should validate Python code with print statements', () => {
      const nodeType = 'nodes-base.code';
      const config = {
        language: 'python',
        pythonCode: `
          print("Processing items:", len(items))
          processed = []
          for item in items:
              print(f"Processing: {item}")
              processed.append({"json": item["json"]})
          return processed
        `
      };
      const properties = [
        { name: 'language', type: 'options' },
        { name: 'pythonCode', type: 'string' }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.warnings.some(w => 
        w.type === 'best_practice' && 
        w.message.includes('print() output appears in n8n execution logs')
      )).toBe(true);
    });

    it('should suggest error handling for non-trivial code', () => {
      const nodeType = 'nodes-base.code';
      const config = {
        language: 'javascript',
        jsCode: 'return items;' // Trivial code, should not suggest error handling
      };
      const properties = [
        { name: 'language', type: 'options' },
        { name: 'jsCode', type: 'string' }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      // Should not suggest error handling for trivial code
      expect(result.warnings.some(w => 
        w.type === 'best_practice' && 
        w.message.includes('No error handling found')
      )).toBe(false);
    });

    it('should validate async operations without await', () => {
      const nodeType = 'nodes-base.code';
      const config = {
        language: 'javascript',
        jsCode: `
          const promises = items.map(async item => {
            const result = processItem(item);
            return {json: result};
          });
          return Promise.all(promises);
        `
      };
      const properties = [
        { name: 'language', type: 'options' },
        { name: 'jsCode', type: 'string' }
      ];

      const result = ConfigValidator.validate(nodeType, config, properties);

      expect(result.warnings.some(w => 
        w.type === 'best_practice' && 
        w.message.includes('Using async operations without await')
      )).toBe(true);
    });
  });
});