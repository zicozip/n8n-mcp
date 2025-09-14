import { ToolDocumentation } from '../types';

export const searchTemplatesByMetadataDoc: ToolDocumentation = {
  name: 'search_templates_by_metadata',
  category: 'templates',
  essentials: {
    description: 'Search templates using AI-generated metadata filters. Find templates by complexity, setup time, required services, or target audience. Enables smart template discovery beyond simple text search.',
    keyParameters: ['category', 'complexity', 'maxSetupMinutes', 'targetAudience'],
    example: 'search_templates_by_metadata({complexity: "simple", maxSetupMinutes: 30})',
    performance: 'Fast (<100ms) - JSON extraction queries',
    tips: [
      'All filters are optional - combine them for precise results',
      'Use getAvailableCategories() to see valid category values',
      'Complexity levels: simple, medium, complex',
      'Setup time is in minutes (5-480 range)'
    ]
  },
  full: {
    description: `Advanced template search using AI-generated metadata. Each template has been analyzed by GPT-4 to extract structured information about its purpose, complexity, setup requirements, and target users. This enables intelligent filtering beyond simple keyword matching, helping you find templates that match your specific needs, skill level, and available time.`,
    parameters: {
      category: {
        type: 'string',
        required: false,
        description: 'Filter by category like "automation", "integration", "data processing", "communication". Use template service getAvailableCategories() for full list.'
      },
      complexity: {
        type: 'string (enum)',
        required: false,
        description: 'Filter by implementation complexity: "simple" (beginner-friendly), "medium" (some experience needed), or "complex" (advanced features)'
      },
      maxSetupMinutes: {
        type: 'number',
        required: false,
        description: 'Maximum acceptable setup time in minutes (5-480). Find templates you can implement within your time budget.'
      },
      minSetupMinutes: {
        type: 'number',
        required: false,
        description: 'Minimum setup time in minutes (5-480). Find more substantial templates that offer comprehensive solutions.'
      },
      requiredService: {
        type: 'string',
        required: false,
        description: 'Filter by required external service like "openai", "slack", "google", "shopify". Ensures you have necessary accounts/APIs.'
      },
      targetAudience: {
        type: 'string',
        required: false,
        description: 'Filter by intended users: "developers", "marketers", "analysts", "operations", "sales". Find templates for your role.'
      },
      limit: {
        type: 'number',
        required: false,
        description: 'Maximum results to return. Default 20, max 100.'
      },
      offset: {
        type: 'number',
        required: false,
        description: 'Pagination offset for results. Default 0.'
      }
    },
    returns: `Returns an object containing:
- items: Array of matching templates with full metadata
  - id: Template ID
  - name: Template name
  - description: Purpose and functionality
  - author: Creator details
  - nodes: Array of nodes used
  - views: Popularity count
  - metadata: AI-generated structured data
    - categories: Primary use categories
    - complexity: Difficulty level
    - use_cases: Specific applications
    - estimated_setup_minutes: Time to implement
    - required_services: External dependencies
    - key_features: Main capabilities
    - target_audience: Intended users
- total: Total matching templates
- filters: Applied filter criteria
- filterSummary: Human-readable filter description
- availableCategories: Suggested categories if no results
- availableAudiences: Suggested audiences if no results
- tip: Contextual guidance`,
    examples: [
      'search_templates_by_metadata({complexity: "simple"}) - Find beginner-friendly templates',
      'search_templates_by_metadata({category: "automation", maxSetupMinutes: 30}) - Quick automation templates',
      'search_templates_by_metadata({targetAudience: "marketers"}) - Marketing-focused workflows',
      'search_templates_by_metadata({requiredService: "openai", complexity: "medium"}) - AI templates with moderate complexity',
      'search_templates_by_metadata({minSetupMinutes: 60, category: "integration"}) - Comprehensive integration solutions'
    ],
    useCases: [
      'Finding beginner-friendly templates by setting complexity:"simple"',
      'Discovering templates you can implement quickly with maxSetupMinutes:30',
      'Finding role-specific workflows with targetAudience filter',
      'Identifying templates that need specific APIs with requiredService filter',
      'Combining multiple filters for precise template discovery'
    ],
    performance: 'Fast (<100ms) - Uses SQLite JSON extraction on pre-generated metadata. 97.5% coverage (2,534/2,598 templates).',
    bestPractices: [
      'Start with broad filters and narrow down based on results',
      'Use getAvailableCategories() to discover valid category values',
      'Combine complexity and setup time for skill-appropriate templates',
      'Check required services before selecting templates to ensure you have necessary accounts'
    ],
    pitfalls: [
      'Not all templates have metadata (97.5% coverage)',
      'Setup time estimates assume basic n8n familiarity',
      'Categories/audiences use partial matching - be specific',
      'Metadata is AI-generated and may occasionally be imprecise'
    ],
    relatedTools: [
      'list_templates',
      'search_templates',
      'list_node_templates',
      'get_templates_for_task'
    ]
  }
};