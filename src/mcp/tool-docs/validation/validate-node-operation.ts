import { ToolDocumentation } from '../types';

export const validateNodeOperationDoc: ToolDocumentation = {
  name: 'validate_node_operation',
  category: 'validation',
  essentials: {
    description: 'Validate node config. Checks required fields, types, operation rules. Returns errors with fixes. Essential for Slack/Sheets/DB nodes.',
    keyParameters: ['nodeType', 'config', 'profile'],
    example: 'validate_node_operation("nodes-base.slack", {resource: "message", operation: "post", text: "Hi"})',
    performance: 'Fast',
    tips: [
      'Returns errors, warnings, fixes',
      'Operation-aware validation',
      'Use profiles: minimal/runtime/ai-friendly/strict'
    ]
  },
  full: {
    description: 'Comprehensive node configuration validation with operation awareness. Validates required fields, types, operation-specific rules, and provides fix suggestions. Supports validation profiles for different use cases.',
    parameters: {
      nodeType: { type: 'string', required: true, description: 'Node type with prefix (e.g., "nodes-base.slack")' },
      config: { type: 'object', required: true, description: 'Configuration including operation fields (resource/operation/action)' },
      profile: { type: 'string', description: 'Validation profile: minimal/runtime/ai-friendly(default)/strict' }
    },
    returns: 'Validation result with isValid, errors[], warnings[], suggestions[], fixes{}',
    examples: [
      'validate_node_operation("nodes-base.slack", {resource: "message", operation: "post", text: "Hello"}) - Validate Slack message',
      'validate_node_operation("nodes-base.httpRequest", {method: "POST", url: "{{$json.url}}"}, "strict") - Strict HTTP validation'
    ],
    useCases: [
      'Pre-deployment validation',
      'Configuration debugging',
      'Operation-specific checks',
      'Fix suggestion generation'
    ],
    performance: 'Fast - Schema analysis with operation context',
    bestPractices: [
      'Include operation fields in config',
      'Use ai-friendly profile by default',
      'Apply suggested fixes',
      'Validate before workflow deployment'
    ],
    pitfalls: [
      'Config must include operation fields',
      'Some fixes are suggestions only',
      'Profile affects strictness level'
    ],
    relatedTools: ['validate_node_minimal', 'get_node_essentials', 'validate_workflow']
  }
};