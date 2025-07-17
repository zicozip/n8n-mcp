import { toolsDocumentation, ToolDocumentation } from './tool-docs';

export function getToolDocumentation(toolName: string, depth: 'essentials' | 'full' = 'essentials'): string {
  const tool = toolsDocumentation[toolName];
  if (!tool) {
    return `Tool '${toolName}' not found. Use tools_documentation() to see available tools.`;
  }

  if (depth === 'essentials') {
    const { essentials } = tool;
    return `# ${tool.name}

${essentials.description}

**Example**: ${essentials.example}

**Key parameters**: ${essentials.keyParameters.join(', ')}

**Performance**: ${essentials.performance}

**Tips**:
${essentials.tips.map(tip => `- ${tip}`).join('\n')}

For full documentation, use: tools_documentation({topic: "${toolName}", depth: "full"})`;
  }

  // Full documentation
  const { full } = tool;
  return `# ${tool.name}

${full.description}

## Parameters
${Object.entries(full.parameters).map(([param, info]) => 
  `- **${param}** (${info.type}${info.required ? ', required' : ''}): ${info.description}`
).join('\n')}

## Returns
${full.returns}

## Examples
${full.examples.map(ex => `\`\`\`javascript\n${ex}\n\`\`\``).join('\n\n')}

## Common Use Cases
${full.useCases.map(uc => `- ${uc}`).join('\n')}

## Performance
${full.performance}

## Best Practices
${full.bestPractices.map(bp => `- ${bp}`).join('\n')}

## Common Pitfalls
${full.pitfalls.map(p => `- ${p}`).join('\n')}

## Related Tools
${full.relatedTools.map(t => `- ${t}`).join('\n')}`;
}

export function getToolsOverview(depth: 'essentials' | 'full' = 'essentials'): string {
  if (depth === 'essentials') {
    return `# n8n MCP Tools Quick Reference

Welcome to n8n-mcp! This tool provides comprehensive access to n8n node documentation.

## Most Used Tools

### 🔍 Discovery
- **search_nodes**: Search nodes by keyword
- **list_nodes**: List all nodes with filters
- **list_ai_tools**: See all AI-capable nodes

### ⚙️ Configuration  
- **get_node_essentials**: Get key properties only (<5KB vs 100KB+)
- **get_node_info**: Get complete node schema
- **search_node_properties**: Find specific properties

### ✅ Validation
- **validate_node_minimal**: Quick required field check
- **validate_node_operation**: Full validation with fixes
- **validate_workflow**: Complete workflow validation

### 📋 Templates
- **list_tasks**: See common task templates
- **get_node_for_task**: Get pre-configured nodes
- **search_templates**: Find workflow templates

### 🔧 n8n Management (requires API config)
- **n8n_create_workflow**: Create workflows
- **n8n_update_partial_workflow**: Update with diffs
- **n8n_health_check**: Test API connectivity

## Quick Start Examples

\`\`\`javascript
// Find a node
search_nodes({query: "slack"})

// Get essential config
get_node_essentials("nodes-base.slack")

// Validate configuration
validate_node_minimal("nodes-base.slack", {resource: "message", operation: "post"})
\`\`\`

## Performance Guide
- **Instant**: <10ms (static/cached)
- **Fast**: <100ms (queries/generation)
- **Moderate**: 100-500ms (validation/analysis)
- **Network-dependent**: Varies with API

For detailed tool documentation, use:
\`tools_documentation({topic: "tool_name", depth: "full"})\``;
  }

  // Full overview
  const categories = getAllCategories();
  return `# n8n MCP Tools Complete Reference

## Available Tools by Category

${categories.map(cat => {
  const tools = getToolsByCategory(cat);
  return `### ${cat.charAt(0).toUpperCase() + cat.slice(1)}
${tools.map(toolName => {
  const tool = toolsDocumentation[toolName];
  return `- **${toolName}**: ${tool.essentials.description}`;
}).join('\n')}`;
}).join('\n\n')}

## Tool Categories Explained

- **discovery**: Find and explore n8n nodes
- **configuration**: Configure and understand nodes
- **validation**: Validate node and workflow configurations
- **templates**: Pre-built configurations and examples
- **workflow_management**: Create and manage n8n workflows (requires API)
- **system**: MCP system tools and diagnostics

For specific tool documentation, use:
\`tools_documentation({topic: "tool_name", depth: "full"})\``;
}

export function searchToolDocumentation(keyword: string): string[] {
  const results: string[] = [];
  
  for (const [toolName, tool] of Object.entries(toolsDocumentation)) {
    const searchText = `${toolName} ${tool.essentials.description} ${tool.full.description}`.toLowerCase();
    if (searchText.includes(keyword.toLowerCase())) {
      results.push(toolName);
    }
  }
  
  return results;
}

export function getToolsByCategory(category: string): string[] {
  return Object.entries(toolsDocumentation)
    .filter(([_, tool]) => tool.category === category)
    .map(([name, _]) => name);
}

export function getAllCategories(): string[] {
  const categories = new Set<string>();
  Object.values(toolsDocumentation).forEach(tool => {
    categories.add(tool.category);
  });
  return Array.from(categories);
}