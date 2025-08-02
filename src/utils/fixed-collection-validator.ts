/**
 * Generic utility for validating and fixing fixedCollection structures in n8n nodes
 * Prevents the "propertyValues[itemName] is not iterable" error
 */

export interface FixedCollectionPattern {
  nodeType: string;
  property: string;
  subProperty?: string;
  expectedStructure: string;
  invalidPatterns: string[];
}

export interface FixedCollectionValidationResult {
  isValid: boolean;
  errors: Array<{
    pattern: string;
    message: string;
    fix: string;
  }>;
  autofix?: any;
}

export class FixedCollectionValidator {
  /**
   * Known problematic patterns for various n8n nodes
   */
  private static readonly KNOWN_PATTERNS: FixedCollectionPattern[] = [
    // Conditional nodes (already fixed)
    {
      nodeType: 'switch',
      property: 'rules',
      expectedStructure: 'rules.values array',
      invalidPatterns: ['rules.conditions', 'rules.conditions.values']
    },
    {
      nodeType: 'if',
      property: 'conditions',
      expectedStructure: 'conditions array/object',
      invalidPatterns: ['conditions.values']
    },
    {
      nodeType: 'filter',
      property: 'conditions',
      expectedStructure: 'conditions array/object',
      invalidPatterns: ['conditions.values']
    },
    // New nodes identified by research
    {
      nodeType: 'summarize',
      property: 'fieldsToSummarize',
      subProperty: 'values',
      expectedStructure: 'fieldsToSummarize.values array',
      invalidPatterns: ['fieldsToSummarize.values.values']
    },
    {
      nodeType: 'comparedatasets',
      property: 'mergeByFields',
      subProperty: 'values',
      expectedStructure: 'mergeByFields.values array',
      invalidPatterns: ['mergeByFields.values.values']
    },
    {
      nodeType: 'sort',
      property: 'sortFieldsUi',
      subProperty: 'sortField',
      expectedStructure: 'sortFieldsUi.sortField array',
      invalidPatterns: ['sortFieldsUi.sortField.values']
    },
    {
      nodeType: 'aggregate',
      property: 'fieldsToAggregate',
      subProperty: 'fieldToAggregate',
      expectedStructure: 'fieldsToAggregate.fieldToAggregate array',
      invalidPatterns: ['fieldsToAggregate.fieldToAggregate.values']
    },
    {
      nodeType: 'set',
      property: 'fields',
      subProperty: 'values',
      expectedStructure: 'fields.values array',
      invalidPatterns: ['fields.values.values']
    },
    {
      nodeType: 'html',
      property: 'extractionValues',
      subProperty: 'values',
      expectedStructure: 'extractionValues.values array',
      invalidPatterns: ['extractionValues.values.values']
    },
    {
      nodeType: 'httprequest',
      property: 'body',
      subProperty: 'parameters',
      expectedStructure: 'body.parameters array',
      invalidPatterns: ['body.parameters.values']
    },
    {
      nodeType: 'airtable',
      property: 'sort',
      subProperty: 'sortField',
      expectedStructure: 'sort.sortField array',
      invalidPatterns: ['sort.sortField.values']
    }
  ];

  /**
   * Validate a node configuration for fixedCollection issues
   */
  static validate(
    nodeType: string,
    config: Record<string, any>
  ): FixedCollectionValidationResult {
    const normalizedNodeType = this.normalizeNodeType(nodeType);
    const pattern = this.getPatternForNode(normalizedNodeType);
    
    if (!pattern) {
      return { isValid: true, errors: [] };
    }

    const result: FixedCollectionValidationResult = {
      isValid: true,
      errors: []
    };

    // Check for invalid patterns
    for (const invalidPattern of pattern.invalidPatterns) {
      if (this.hasInvalidStructure(config, invalidPattern)) {
        result.isValid = false;
        result.errors.push({
          pattern: invalidPattern,
          message: `Invalid structure for nodes-base.${pattern.nodeType} node: found nested "${invalidPattern}" but expected "${pattern.expectedStructure}". This causes "propertyValues[itemName] is not iterable" error in n8n.`,
          fix: this.generateFixMessage(pattern)
        });

        // Generate autofix
        if (!result.autofix) {
          result.autofix = this.generateAutofix(config, pattern);
        }
      }
    }

    return result;
  }

  /**
   * Apply autofix to a configuration
   */
  static applyAutofix(
    config: Record<string, any>,
    pattern: FixedCollectionPattern
  ): Record<string, any> {
    const fixedConfig = this.generateAutofix(config, pattern);
    // For If/Filter nodes, the autofix might return just the values array
    if (pattern.nodeType === 'if' || pattern.nodeType === 'filter') {
      if (config.conditions?.values) {
        return config.conditions.values;
      }
    }
    return fixedConfig;
  }

  /**
   * Normalize node type to handle various formats
   */
  private static normalizeNodeType(nodeType: string): string {
    return nodeType
      .replace('n8n-nodes-base.', '')
      .replace('nodes-base.', '')
      .replace('@n8n/n8n-nodes-langchain.', '')
      .toLowerCase();
  }

  /**
   * Get pattern configuration for a specific node type
   */
  private static getPatternForNode(nodeType: string): FixedCollectionPattern | undefined {
    return this.KNOWN_PATTERNS.find(p => p.nodeType === nodeType);
  }

  /**
   * Check if configuration has an invalid structure
   */
  private static hasInvalidStructure(
    config: Record<string, any>,
    pattern: string
  ): boolean {
    const parts = pattern.split('.');
    let current = config;

    for (const part of parts) {
      if (!current || typeof current !== 'object' || !current[part]) {
        return false;
      }
      current = current[part];
    }

    return true;
  }

  /**
   * Generate a fix message for the specific pattern
   */
  private static generateFixMessage(pattern: FixedCollectionPattern): string {
    switch (pattern.nodeType) {
      case 'switch':
        return 'Use: { "rules": { "values": [{ "conditions": {...}, "outputKey": "output1" }] } }';
      case 'if':
      case 'filter':
        return 'Use: { "conditions": {...} } or { "conditions": [...] } directly, not nested under "values"';
      case 'summarize':
        return 'Use: { "fieldsToSummarize": { "values": [...] } } not nested values.values';
      case 'comparedatasets':
        return 'Use: { "mergeByFields": { "values": [...] } } not nested values.values';
      case 'sort':
        return 'Use: { "sortFieldsUi": { "sortField": [...] } } not sortField.values';
      case 'aggregate':
        return 'Use: { "fieldsToAggregate": { "fieldToAggregate": [...] } } not fieldToAggregate.values';
      case 'set':
        return 'Use: { "fields": { "values": [...] } } not nested values.values';
      case 'html':
        return 'Use: { "extractionValues": { "values": [...] } } not nested values.values';
      case 'httprequest':
        return 'Use: { "body": { "parameters": [...] } } not parameters.values';
      case 'airtable':
        return 'Use: { "sort": { "sortField": [...] } } not sortField.values';
      default:
        return `Use ${pattern.expectedStructure} structure`;
    }
  }

  /**
   * Generate autofix for invalid structures
   */
  private static generateAutofix(
    config: Record<string, any>,
    pattern: FixedCollectionPattern
  ): any {
    const fixedConfig = { ...config };

    switch (pattern.nodeType) {
      case 'switch':
        if (config.rules?.conditions?.values) {
          fixedConfig.rules = {
            values: Array.isArray(config.rules.conditions.values)
              ? config.rules.conditions.values.map((condition: any, index: number) => ({
                  conditions: condition,
                  outputKey: `output${index + 1}`
                }))
              : [{
                  conditions: config.rules.conditions.values,
                  outputKey: 'output1'
                }]
          };
        } else if (config.rules?.conditions) {
          fixedConfig.rules = {
            values: [{
              conditions: config.rules.conditions,
              outputKey: 'output1'
            }]
          };
        }
        break;

      case 'if':
      case 'filter':
        if (config.conditions?.values) {
          return config.conditions.values;
        }
        break;

      case 'summarize':
        if (config.fieldsToSummarize?.values?.values) {
          fixedConfig.fieldsToSummarize = {
            values: config.fieldsToSummarize.values.values
          };
        }
        break;

      case 'comparedatasets':
        if (config.mergeByFields?.values?.values) {
          fixedConfig.mergeByFields = {
            values: config.mergeByFields.values.values
          };
        }
        break;

      case 'sort':
        if (config.sortFieldsUi?.sortField?.values) {
          fixedConfig.sortFieldsUi = {
            sortField: config.sortFieldsUi.sortField.values
          };
        }
        break;

      case 'aggregate':
        if (config.fieldsToAggregate?.fieldToAggregate?.values) {
          fixedConfig.fieldsToAggregate = {
            fieldToAggregate: config.fieldsToAggregate.fieldToAggregate.values
          };
        }
        break;

      case 'set':
        if (config.fields?.values?.values) {
          fixedConfig.fields = {
            values: config.fields.values.values
          };
        }
        break;

      case 'html':
        if (config.extractionValues?.values?.values) {
          fixedConfig.extractionValues = {
            values: config.extractionValues.values.values
          };
        }
        break;

      case 'httprequest':
        if (config.body?.parameters?.values) {
          fixedConfig.body = {
            ...config.body,
            parameters: config.body.parameters.values
          };
        }
        break;

      case 'airtable':
        if (config.sort?.sortField?.values) {
          fixedConfig.sort = {
            sortField: config.sort.sortField.values
          };
        }
        break;
    }

    return fixedConfig;
  }

  /**
   * Get all known patterns (for testing and documentation)
   */
  static getAllPatterns(): FixedCollectionPattern[] {
    return [...this.KNOWN_PATTERNS];
  }

  /**
   * Check if a node type is susceptible to fixedCollection issues
   */
  static isNodeSusceptible(nodeType: string): boolean {
    const normalizedType = this.normalizeNodeType(nodeType);
    return this.KNOWN_PATTERNS.some(p => p.nodeType === normalizedType);
  }
}