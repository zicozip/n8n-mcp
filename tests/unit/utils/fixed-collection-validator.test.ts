import { describe, test, expect } from 'vitest';
import { FixedCollectionValidator, NodeConfig, NodeConfigValue } from '../../../src/utils/fixed-collection-validator';

// Type guard helper for tests
function isNodeConfig(value: NodeConfig | NodeConfigValue[] | undefined): value is NodeConfig {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

describe('FixedCollectionValidator', () => {
  describe('Core Functionality', () => {
    test('should return valid for non-susceptible nodes', () => {
      const result = FixedCollectionValidator.validate('n8n-nodes-base.cron', {
        triggerTimes: { hour: 10, minute: 30 }
      });
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should normalize node types correctly', () => {
      const nodeTypes = [
        'n8n-nodes-base.switch',
        'nodes-base.switch',
        '@n8n/n8n-nodes-langchain.switch',
        'SWITCH'
      ];

      nodeTypes.forEach(nodeType => {
        expect(FixedCollectionValidator.isNodeSusceptible(nodeType)).toBe(true);
      });
    });

    test('should get all known patterns', () => {
      const patterns = FixedCollectionValidator.getAllPatterns();
      expect(patterns.length).toBeGreaterThan(10); // We have at least 11 patterns
      expect(patterns.some(p => p.nodeType === 'switch')).toBe(true);
      expect(patterns.some(p => p.nodeType === 'summarize')).toBe(true);
    });
  });

  describe('Switch Node Validation', () => {
    test('should detect invalid nested conditions structure', () => {
      const invalidConfig = {
        rules: {
          conditions: {
            values: [
              {
                value1: '={{$json.status}}',
                operation: 'equals',
                value2: 'active'
              }
            ]
          }
        }
      };

      const result = FixedCollectionValidator.validate('n8n-nodes-base.switch', invalidConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(2); // Both rules.conditions and rules.conditions.values match
      // Check that we found the specific pattern
      const conditionsValuesError = result.errors.find(e => e.pattern === 'rules.conditions.values');
      expect(conditionsValuesError).toBeDefined();
      expect(conditionsValuesError!.message).toContain('propertyValues[itemName] is not iterable');
      expect(result.autofix).toBeDefined();
      expect(isNodeConfig(result.autofix)).toBe(true);
      if (isNodeConfig(result.autofix)) {
        expect(result.autofix.rules).toBeDefined();
        expect((result.autofix.rules as any).values).toBeDefined();
        expect((result.autofix.rules as any).values[0].outputKey).toBe('output1');
      }
    });

    test('should provide correct autofix for switch node', () => {
      const invalidConfig = {
        rules: {
          conditions: {
            values: [
              { value1: '={{$json.a}}', operation: 'equals', value2: '1' },
              { value1: '={{$json.b}}', operation: 'equals', value2: '2' }
            ]
          }
        }
      };

      const result = FixedCollectionValidator.validate('switch', invalidConfig);
      
      expect(isNodeConfig(result.autofix)).toBe(true);
      if (isNodeConfig(result.autofix)) {
        expect((result.autofix.rules as any).values).toHaveLength(2);
        expect((result.autofix.rules as any).values[0].outputKey).toBe('output1');
        expect((result.autofix.rules as any).values[1].outputKey).toBe('output2');
      }
    });
  });

  describe('If/Filter Node Validation', () => {
    test('should detect invalid nested values structure', () => {
      const invalidConfig = {
        conditions: {
          values: [
            {
              value1: '={{$json.age}}',
              operation: 'largerEqual',
              value2: 18
            }
          ]
        }
      };

      const ifResult = FixedCollectionValidator.validate('n8n-nodes-base.if', invalidConfig);
      const filterResult = FixedCollectionValidator.validate('n8n-nodes-base.filter', invalidConfig);
      
      expect(ifResult.isValid).toBe(false);
      expect(ifResult.errors[0].fix).toContain('directly, not nested under "values"');
      expect(ifResult.autofix).toEqual([
        {
          value1: '={{$json.age}}',
          operation: 'largerEqual',
          value2: 18
        }
      ]);

      expect(filterResult.isValid).toBe(false);
      expect(filterResult.autofix).toEqual(ifResult.autofix);
    });
  });

  describe('New Nodes Validation', () => {
    test('should validate Summarize node', () => {
      const invalidConfig = {
        fieldsToSummarize: {
          values: {
            values: [
              { field: 'amount', aggregation: 'sum' },
              { field: 'count', aggregation: 'count' }
            ]
          }
        }
      };

      const result = FixedCollectionValidator.validate('summarize', invalidConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.errors[0].pattern).toBe('fieldsToSummarize.values.values');
      expect(result.errors[0].fix).toContain('not nested values.values');
      expect(isNodeConfig(result.autofix)).toBe(true);
      if (isNodeConfig(result.autofix)) {
        expect((result.autofix.fieldsToSummarize as any).values).toHaveLength(2);
      }
    });

    test('should validate Compare Datasets node', () => {
      const invalidConfig = {
        mergeByFields: {
          values: {
            values: [
              { field1: 'id', field2: 'userId' }
            ]
          }
        }
      };

      const result = FixedCollectionValidator.validate('compareDatasets', invalidConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.errors[0].pattern).toBe('mergeByFields.values.values');
      expect(isNodeConfig(result.autofix)).toBe(true);
      if (isNodeConfig(result.autofix)) {
        expect((result.autofix.mergeByFields as any).values).toHaveLength(1);
      }
    });

    test('should validate Sort node', () => {
      const invalidConfig = {
        sortFieldsUi: {
          sortField: {
            values: [
              { fieldName: 'date', order: 'descending' }
            ]
          }
        }
      };

      const result = FixedCollectionValidator.validate('sort', invalidConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.errors[0].pattern).toBe('sortFieldsUi.sortField.values');
      expect(result.errors[0].fix).toContain('not sortField.values');
      expect(isNodeConfig(result.autofix)).toBe(true);
      if (isNodeConfig(result.autofix)) {
        expect((result.autofix.sortFieldsUi as any).sortField).toHaveLength(1);
      }
    });

    test('should validate Aggregate node', () => {
      const invalidConfig = {
        fieldsToAggregate: {
          fieldToAggregate: {
            values: [
              { fieldToAggregate: 'price', aggregation: 'average' }
            ]
          }
        }
      };

      const result = FixedCollectionValidator.validate('aggregate', invalidConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.errors[0].pattern).toBe('fieldsToAggregate.fieldToAggregate.values');
      expect(isNodeConfig(result.autofix)).toBe(true);
      if (isNodeConfig(result.autofix)) {
        expect((result.autofix.fieldsToAggregate as any).fieldToAggregate).toHaveLength(1);
      }
    });

    test('should validate Set node', () => {
      const invalidConfig = {
        fields: {
          values: {
            values: [
              { name: 'status', value: 'active' }
            ]
          }
        }
      };

      const result = FixedCollectionValidator.validate('set', invalidConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.errors[0].pattern).toBe('fields.values.values');
      expect(isNodeConfig(result.autofix)).toBe(true);
      if (isNodeConfig(result.autofix)) {
        expect((result.autofix.fields as any).values).toHaveLength(1);
      }
    });

    test('should validate HTML node', () => {
      const invalidConfig = {
        extractionValues: {
          values: {
            values: [
              { key: 'title', cssSelector: 'h1' }
            ]
          }
        }
      };

      const result = FixedCollectionValidator.validate('html', invalidConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.errors[0].pattern).toBe('extractionValues.values.values');
      expect(isNodeConfig(result.autofix)).toBe(true);
      if (isNodeConfig(result.autofix)) {
        expect((result.autofix.extractionValues as any).values).toHaveLength(1);
      }
    });

    test('should validate HTTP Request node', () => {
      const invalidConfig = {
        body: {
          parameters: {
            values: [
              { name: 'api_key', value: '123' }
            ]
          }
        }
      };

      const result = FixedCollectionValidator.validate('httpRequest', invalidConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.errors[0].pattern).toBe('body.parameters.values');
      expect(result.errors[0].fix).toContain('not parameters.values');
      expect(isNodeConfig(result.autofix)).toBe(true);
      if (isNodeConfig(result.autofix)) {
        expect((result.autofix.body as any).parameters).toHaveLength(1);
      }
    });

    test('should validate Airtable node', () => {
      const invalidConfig = {
        sort: {
          sortField: {
            values: [
              { fieldName: 'Created', direction: 'desc' }
            ]
          }
        }
      };

      const result = FixedCollectionValidator.validate('airtable', invalidConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.errors[0].pattern).toBe('sort.sortField.values');
      expect(isNodeConfig(result.autofix)).toBe(true);
      if (isNodeConfig(result.autofix)) {
        expect((result.autofix.sort as any).sortField).toHaveLength(1);
      }
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty config', () => {
      const result = FixedCollectionValidator.validate('switch', {});
      expect(result.isValid).toBe(true);
    });

    test('should handle null/undefined properties', () => {
      const result = FixedCollectionValidator.validate('switch', {
        rules: null
      });
      expect(result.isValid).toBe(true);
    });

    test('should handle valid structures', () => {
      const validSwitch = {
        rules: {
          values: [
            {
              conditions: { value1: '={{$json.x}}', operation: 'equals', value2: 1 },
              outputKey: 'output1'
            }
          ]
        }
      };

      const result = FixedCollectionValidator.validate('switch', validSwitch);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should handle deeply nested invalid structures', () => {
      const deeplyNested = {
        rules: {
          conditions: {
            values: [
              {
                value1: '={{$json.deep}}',
                operation: 'equals',
                value2: 'nested'
              }
            ]
          }
        }
      };

      const result = FixedCollectionValidator.validate('switch', deeplyNested);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(2); // Both patterns match
    });
  });

  describe('applyAutofix Method', () => {
    test('should apply autofix correctly', () => {
      const invalidConfig = {
        conditions: {
          values: [
            { value1: '={{$json.test}}', operation: 'equals', value2: 'yes' }
          ]
        }
      };

      const pattern = FixedCollectionValidator.getAllPatterns().find(p => p.nodeType === 'if');
      const fixed = FixedCollectionValidator.applyAutofix(invalidConfig, pattern!);
      
      expect(fixed).toEqual([
        { value1: '={{$json.test}}', operation: 'equals', value2: 'yes' }
      ]);
    });
  });
});