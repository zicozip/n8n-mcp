/**
 * Workflow Auto-Fixer Service
 *
 * Automatically generates fix operations for common workflow validation errors.
 * Converts validation results into diff operations that can be applied to fix the workflow.
 */

import { WorkflowValidationResult } from './workflow-validator';
import { ExpressionFormatIssue } from './expression-format-validator';
import { NodeSimilarityService } from './node-similarity-service';
import { NodeRepository } from '../database/node-repository';
import {
  WorkflowDiffOperation,
  UpdateNodeOperation
} from '../types/workflow-diff';
import { WorkflowNode, Workflow } from '../types/n8n-api';
import { Logger } from '../utils/logger';

const logger = new Logger({ prefix: '[WorkflowAutoFixer]' });

export type FixConfidenceLevel = 'high' | 'medium' | 'low';
export type FixType =
  | 'expression-format'
  | 'typeversion-correction'
  | 'error-output-config'
  | 'required-field'
  | 'enum-value'
  | 'node-type-correction';

export interface AutoFixConfig {
  applyFixes: boolean;
  fixTypes?: FixType[];
  confidenceThreshold?: FixConfidenceLevel;
  maxFixes?: number;
}

export interface FixOperation {
  node: string;
  field: string;
  type: FixType;
  before: any;
  after: any;
  confidence: FixConfidenceLevel;
  description: string;
}

export interface AutoFixResult {
  operations: WorkflowDiffOperation[];
  fixes: FixOperation[];
  summary: string;
  stats: {
    total: number;
    byType: Record<FixType, number>;
    byConfidence: Record<FixConfidenceLevel, number>;
  };
}

export interface NodeFormatIssue extends ExpressionFormatIssue {
  nodeName: string;
  nodeId: string;
}

export class WorkflowAutoFixer {
  private readonly defaultConfig: AutoFixConfig = {
    applyFixes: false,
    confidenceThreshold: 'medium',
    maxFixes: 50
  };
  private similarityService: NodeSimilarityService | null = null;

  constructor(repository?: NodeRepository) {
    if (repository) {
      this.similarityService = new NodeSimilarityService(repository);
    }
  }

  /**
   * Generate fix operations from validation results
   */
  generateFixes(
    workflow: Workflow,
    validationResult: WorkflowValidationResult,
    formatIssues: ExpressionFormatIssue[] = [],
    config: Partial<AutoFixConfig> = {}
  ): AutoFixResult {
    const fullConfig = { ...this.defaultConfig, ...config };
    const operations: WorkflowDiffOperation[] = [];
    const fixes: FixOperation[] = [];

    // Create a map for quick node lookup
    const nodeMap = new Map<string, WorkflowNode>();
    workflow.nodes.forEach(node => {
      nodeMap.set(node.name, node);
      nodeMap.set(node.id, node);
    });

    // Process expression format issues (HIGH confidence)
    if (!fullConfig.fixTypes || fullConfig.fixTypes.includes('expression-format')) {
      this.processExpressionFormatFixes(formatIssues, nodeMap, operations, fixes);
    }

    // Process typeVersion errors (MEDIUM confidence)
    if (!fullConfig.fixTypes || fullConfig.fixTypes.includes('typeversion-correction')) {
      this.processTypeVersionFixes(validationResult, nodeMap, operations, fixes);
    }

    // Process error output configuration issues (MEDIUM confidence)
    if (!fullConfig.fixTypes || fullConfig.fixTypes.includes('error-output-config')) {
      this.processErrorOutputFixes(validationResult, nodeMap, workflow, operations, fixes);
    }

    // Process node type corrections (HIGH confidence only)
    if (!fullConfig.fixTypes || fullConfig.fixTypes.includes('node-type-correction')) {
      this.processNodeTypeFixes(validationResult, nodeMap, operations, fixes);
    }

    // Filter by confidence threshold
    const filteredFixes = this.filterByConfidence(fixes, fullConfig.confidenceThreshold);
    const filteredOperations = this.filterOperationsByFixes(operations, filteredFixes, fixes);

    // Apply max fixes limit
    const limitedFixes = filteredFixes.slice(0, fullConfig.maxFixes);
    const limitedOperations = this.filterOperationsByFixes(filteredOperations, limitedFixes, filteredFixes);

    // Generate summary
    const stats = this.calculateStats(limitedFixes);
    const summary = this.generateSummary(stats);

    return {
      operations: limitedOperations,
      fixes: limitedFixes,
      summary,
      stats
    };
  }

  /**
   * Process expression format fixes (missing = prefix)
   */
  private processExpressionFormatFixes(
    formatIssues: ExpressionFormatIssue[],
    nodeMap: Map<string, WorkflowNode>,
    operations: WorkflowDiffOperation[],
    fixes: FixOperation[]
  ): void {
    // Group fixes by node to create single update operation per node
    const fixesByNode = new Map<string, ExpressionFormatIssue[]>();

    for (const issue of formatIssues) {
      // Process both errors and warnings for missing-prefix issues
      if (issue.issueType === 'missing-prefix') {
        // Check if the issue has node information
        const nodeIssue = issue as any;
        const nodeName = nodeIssue.nodeName;

        if (!nodeName) {
          // Skip if we can't identify the node
          continue;
        }

        if (!fixesByNode.has(nodeName)) {
          fixesByNode.set(nodeName, []);
        }
        fixesByNode.get(nodeName)!.push(issue);
      }
    }

    // Create update operations for each node
    for (const [nodeName, nodeIssues] of fixesByNode) {
      const node = nodeMap.get(nodeName);
      if (!node) continue;

      const updatedParameters = JSON.parse(JSON.stringify(node.parameters || {}));

      for (const issue of nodeIssues) {
        // Apply the fix to parameters
        // The fieldPath doesn't include node name, use as is
        const fieldPath = issue.fieldPath.split('.');
        this.setNestedValue(updatedParameters, fieldPath, issue.correctedValue);

        fixes.push({
          node: nodeName,
          field: issue.fieldPath,
          type: 'expression-format',
          before: issue.currentValue,
          after: issue.correctedValue,
          confidence: 'high',
          description: issue.explanation
        });
      }

      // Create update operation
      const operation: UpdateNodeOperation = {
        type: 'updateNode',
        nodeId: nodeName, // Can be name or ID
        updates: {
          parameters: updatedParameters
        }
      };
      operations.push(operation);
    }
  }

  /**
   * Process typeVersion fixes
   */
  private processTypeVersionFixes(
    validationResult: WorkflowValidationResult,
    nodeMap: Map<string, WorkflowNode>,
    operations: WorkflowDiffOperation[],
    fixes: FixOperation[]
  ): void {
    for (const error of validationResult.errors) {
      if (error.message.includes('typeVersion') && error.message.includes('exceeds maximum')) {
        // Extract version info from error message
        const versionMatch = error.message.match(/typeVersion (\d+(?:\.\d+)?) exceeds maximum supported version (\d+(?:\.\d+)?)/);
        if (versionMatch) {
          const currentVersion = parseFloat(versionMatch[1]);
          const maxVersion = parseFloat(versionMatch[2]);
          const nodeName = error.nodeName || error.nodeId;

          if (!nodeName) continue;

          const node = nodeMap.get(nodeName);
          if (!node) continue;

          fixes.push({
            node: nodeName,
            field: 'typeVersion',
            type: 'typeversion-correction',
            before: currentVersion,
            after: maxVersion,
            confidence: 'medium',
            description: `Corrected typeVersion from ${currentVersion} to maximum supported ${maxVersion}`
          });

          const operation: UpdateNodeOperation = {
            type: 'updateNode',
            nodeId: nodeName,
            updates: {
              typeVersion: maxVersion
            }
          };
          operations.push(operation);
        }
      }
    }
  }

  /**
   * Process error output configuration fixes
   */
  private processErrorOutputFixes(
    validationResult: WorkflowValidationResult,
    nodeMap: Map<string, WorkflowNode>,
    workflow: Workflow,
    operations: WorkflowDiffOperation[],
    fixes: FixOperation[]
  ): void {
    for (const error of validationResult.errors) {
      if (error.message.includes('onError: \'continueErrorOutput\'') &&
          error.message.includes('no error output connections')) {
        const nodeName = error.nodeName || error.nodeId;
        if (!nodeName) continue;

        const node = nodeMap.get(nodeName);
        if (!node) continue;

        // Remove the conflicting onError setting
        fixes.push({
          node: nodeName,
          field: 'onError',
          type: 'error-output-config',
          before: 'continueErrorOutput',
          after: undefined,
          confidence: 'medium',
          description: 'Removed onError setting due to missing error output connections'
        });

        const operation: UpdateNodeOperation = {
          type: 'updateNode',
          nodeId: nodeName,
          updates: {
            onError: undefined // This will remove the property
          }
        };
        operations.push(operation);
      }
    }
  }

  /**
   * Process node type corrections for unknown nodes
   */
  private processNodeTypeFixes(
    validationResult: WorkflowValidationResult,
    nodeMap: Map<string, WorkflowNode>,
    operations: WorkflowDiffOperation[],
    fixes: FixOperation[]
  ): void {
    // Only process if we have the similarity service
    if (!this.similarityService) {
      return;
    }

    for (const error of validationResult.errors) {
      // Look for unknown node type errors with suggestions
      if (error.message?.includes('Unknown node type:') && (error as any).suggestions) {
        const suggestions = (error as any).suggestions;

        // Only auto-fix if we have a high-confidence suggestion (>= 0.9)
        const highConfidenceSuggestion = suggestions.find((s: any) => s.confidence >= 0.9);

        if (highConfidenceSuggestion && error.nodeId) {
          const node = nodeMap.get(error.nodeId) || nodeMap.get(error.nodeName || '');

          if (node) {
            fixes.push({
              node: node.name,
              field: 'type',
              type: 'node-type-correction',
              before: node.type,
              after: highConfidenceSuggestion.nodeType,
              confidence: 'high',
              description: `Fix node type: "${node.type}" → "${highConfidenceSuggestion.nodeType}" (${highConfidenceSuggestion.reason})`
            });

            const operation: UpdateNodeOperation = {
              type: 'updateNode',
              nodeId: node.name,
              updates: {
                type: highConfidenceSuggestion.nodeType
              }
            };
            operations.push(operation);
          }
        }
      }
    }
  }

  /**
   * Set a nested value in an object using a path array
   */
  private setNestedValue(obj: any, path: string[], value: any): void {
    if (path.length === 0) return;

    let current = obj;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];

      // Handle array indices
      if (key.includes('[')) {
        const [arrayKey, indexStr] = key.split('[');
        const index = parseInt(indexStr.replace(']', ''));

        if (!current[arrayKey]) {
          current[arrayKey] = [];
        }
        if (!current[arrayKey][index]) {
          current[arrayKey][index] = {};
        }
        current = current[arrayKey][index];
      } else {
        if (!current[key]) {
          current[key] = {};
        }
        current = current[key];
      }
    }

    const lastKey = path[path.length - 1];
    if (lastKey.includes('[')) {
      const [arrayKey, indexStr] = lastKey.split('[');
      const index = parseInt(indexStr.replace(']', ''));
      if (!current[arrayKey]) {
        current[arrayKey] = [];
      }
      current[arrayKey][index] = value;
    } else {
      current[lastKey] = value;
    }
  }

  /**
   * Filter fixes by confidence level
   */
  private filterByConfidence(
    fixes: FixOperation[],
    threshold?: FixConfidenceLevel
  ): FixOperation[] {
    if (!threshold) return fixes;

    const levels: FixConfidenceLevel[] = ['high', 'medium', 'low'];
    const thresholdIndex = levels.indexOf(threshold);

    return fixes.filter(fix => {
      const fixIndex = levels.indexOf(fix.confidence);
      return fixIndex <= thresholdIndex;
    });
  }

  /**
   * Filter operations to match filtered fixes
   */
  private filterOperationsByFixes(
    operations: WorkflowDiffOperation[],
    filteredFixes: FixOperation[],
    allFixes: FixOperation[]
  ): WorkflowDiffOperation[] {
    const fixedNodes = new Set(filteredFixes.map(f => f.node));
    return operations.filter(op => {
      if (op.type === 'updateNode') {
        return fixedNodes.has(op.nodeId || '');
      }
      return true;
    });
  }

  /**
   * Calculate statistics about fixes
   */
  private calculateStats(fixes: FixOperation[]): AutoFixResult['stats'] {
    const stats: AutoFixResult['stats'] = {
      total: fixes.length,
      byType: {
        'expression-format': 0,
        'typeversion-correction': 0,
        'error-output-config': 0,
        'required-field': 0,
        'enum-value': 0,
        'node-type-correction': 0
      },
      byConfidence: {
        'high': 0,
        'medium': 0,
        'low': 0
      }
    };

    for (const fix of fixes) {
      stats.byType[fix.type]++;
      stats.byConfidence[fix.confidence]++;
    }

    return stats;
  }

  /**
   * Generate a human-readable summary
   */
  private generateSummary(stats: AutoFixResult['stats']): string {
    if (stats.total === 0) {
      return 'No fixes available';
    }

    const parts: string[] = [];

    if (stats.byType['expression-format'] > 0) {
      parts.push(`${stats.byType['expression-format']} expression format ${stats.byType['expression-format'] === 1 ? 'error' : 'errors'}`);
    }
    if (stats.byType['typeversion-correction'] > 0) {
      parts.push(`${stats.byType['typeversion-correction']} version ${stats.byType['typeversion-correction'] === 1 ? 'issue' : 'issues'}`);
    }
    if (stats.byType['error-output-config'] > 0) {
      parts.push(`${stats.byType['error-output-config']} error output ${stats.byType['error-output-config'] === 1 ? 'configuration' : 'configurations'}`);
    }
    if (stats.byType['required-field'] > 0) {
      parts.push(`${stats.byType['required-field']} required ${stats.byType['required-field'] === 1 ? 'field' : 'fields'}`);
    }
    if (stats.byType['enum-value'] > 0) {
      parts.push(`${stats.byType['enum-value']} invalid ${stats.byType['enum-value'] === 1 ? 'value' : 'values'}`);
    }

    if (parts.length === 0) {
      return `Fixed ${stats.total} ${stats.total === 1 ? 'issue' : 'issues'}`;
    }

    return `Fixed ${parts.join(', ')}`;
  }
}