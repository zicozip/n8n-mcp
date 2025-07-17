import { ToolDocumentation } from '../types';

export const codeNodeGuideDoc: ToolDocumentation = {
  name: 'code_node_guide',
  category: 'special',
  essentials: {
    description: 'Get comprehensive guide for using Code nodes in n8n - JavaScript/Python execution, data access patterns, and common pitfalls',
    keyParameters: [],
    example: 'code_node_guide()',
    performance: 'Instant (<10ms) - returns static guide',
    tips: [
      'Use $input.all() to access all items from previous nodes, not items[0]',
      'Return data in [{json: {...}}] format, not just plain objects',
      'External libraries (requests, pandas) not available - use built-in functions or JavaScript $helpers'
    ]
  },
  full: {
    description: `Provides a comprehensive guide for using Code nodes in n8n workflows. This special tool returns detailed documentation about:

- JavaScript and Python code execution in n8n
- Correct data access patterns ($input, $json, $node syntax)
- Available helper functions ($helpers.httpRequest, $jmespath, etc.)
- Common mistakes and how to avoid them
- Working with webhook data (critical: data is under .body property)
- Returning data in the correct format
- Limitations and security restrictions

This guide is essential for AI agents configuring Code nodes, as it covers the most common issues and correct patterns.`,
    parameters: {},
    returns: 'String containing a comprehensive Code node usage guide with examples and best practices',
    examples: [
      'code_node_guide() - Get the complete Code node guide',
      '// Use this before configuring any Code node to understand correct patterns'
    ],
    useCases: [
      'Learning how to access data from previous nodes correctly',
      'Understanding webhook data structure (body property nesting)',
      'Configuring JavaScript vs Python Code nodes',
      'Troubleshooting common Code node errors',
      'Understanding available helper functions and limitations'
    ],
    performance: 'Returns instantly - guide is pre-generated and cached',
    bestPractices: [
      'Always read this guide before configuring Code nodes',
      'Pay special attention to data access patterns - most errors come from incorrect syntax',
      'Remember webhook data is nested under .body, not at the root level',
      'Use JavaScript for HTTP requests ($helpers.httpRequest) as Python lacks external libraries',
      'Test with sample data to ensure correct output format'
    ],
    pitfalls: [
      'Accessing webhook data incorrectly (forgetting .body nesting)',
      'Using items[0] instead of $input.all() for data access',
      'Returning plain objects instead of [{json: {...}}] format',
      'Trying to use external Python libraries (requests, pandas)',
      'Using expression syntax {{...}} inside Code nodes'
    ],
    relatedTools: ['get_node_essentials', 'validate_node_operation', 'get_node_for_task']
  }
};