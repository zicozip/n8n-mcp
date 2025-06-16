# MCP Implementation Guide - Practical Steps

## Understanding the Current Architecture

Your current system already does the hard work:
```
n8n packages → PropertyExtractor → Complete Property Schema (JSON) → SQLite → MCP Tools
```

The properties are well-structured with:
- Complete type information
- Display options (conditional visibility)  
- Default values and descriptions
- Options for select fields

The issue is that `get_node_info` returns ALL of this (200+ properties) when AI agents only need 10-20.

## Step 1: Create Property Filter Service

Create `src/services/property-filter.ts`:

```typescript
interface SimplifiedProperty {
  name: string;
  displayName: string;
  type: string;
  description: string;
  default?: any;
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
  showWhen?: Record<string, any>;
}

interface EssentialConfig {
  required: string[];
  common: string[];
}

export class PropertyFilter {
  // Start with manual curation for most-used nodes
  private static ESSENTIAL_PROPERTIES: Record<string, EssentialConfig> = {
    'nodes-base.httpRequest': {
      required: ['url'],
      common: ['method', 'authentication', 'sendBody', 'contentType', 'sendHeaders']
    },
    'nodes-base.webhook': {
      required: [],
      common: ['httpMethod', 'path', 'responseMode', 'responseData', 'responseCode']
    },
    'nodes-base.set': {
      required: [],
      common: ['mode', 'assignments']
    },
    'nodes-base.if': {
      required: [],
      common: ['conditions']
    },
    'nodes-base.code': {
      required: [],
      common: ['language', 'jsCode', 'pythonCode']
    },
    'nodes-base.postgres': {
      required: [],
      common: ['operation', 'query', 'table', 'columns']
    },
    'nodes-base.openAi': {
      required: [],
      common: ['resource', 'operation', 'modelId', 'prompt']
    }
  };
  
  static getEssentials(allProperties: any[], nodeType: string): {
    required: SimplifiedProperty[];
    common: SimplifiedProperty[];
  } {
    const config = this.ESSENTIAL_PROPERTIES[nodeType];
    
    if (!config) {
      // Fallback: Take required + first 5 non-conditional properties
      return this.inferEssentials(allProperties);
    }
    
    // Extract specified properties
    const required = config.required
      .map(name => allProperties.find(p => p.name === name))
      .filter(Boolean)
      .map(p => this.simplifyProperty(p));
    
    const common = config.common
      .map(name => allProperties.find(p => p.name === name))
      .filter(Boolean)
      .map(p => this.simplifyProperty(p));
    
    return { required, common };
  }
  
  private static simplifyProperty(prop: any): SimplifiedProperty {
    const simplified: SimplifiedProperty = {
      name: prop.name,
      displayName: prop.displayName || prop.name,
      type: prop.type,
      description: prop.description || '',
      required: prop.required || false
    };
    
    // Include default if it's simple
    if (prop.default !== undefined && typeof prop.default !== 'object') {
      simplified.default = prop.default;
    }
    
    // Simplify options
    if (prop.options && Array.isArray(prop.options)) {
      simplified.options = prop.options.map((opt: any) => ({
        value: typeof opt === 'string' ? opt : (opt.value || opt.name),
        label: typeof opt === 'string' ? opt : (opt.name || opt.value)
      }));
    }
    
    // Include simple display conditions
    if (prop.displayOptions?.show && Object.keys(prop.displayOptions.show).length <= 2) {
      simplified.showWhen = prop.displayOptions.show;
    }
    
    return simplified;
  }
  
  private static inferEssentials(properties: any[]) {
    // For unknown nodes, use heuristics
    const required = properties
      .filter(p => p.required)
      .map(p => this.simplifyProperty(p));
    
    const common = properties
      .filter(p => !p.required && !p.displayOptions) // Simple, always-visible properties
      .slice(0, 5)
      .map(p => this.simplifyProperty(p));
    
    return { required, common };
  }
}
```

## Step 2: Create Example Generator

Create `src/services/example-generator.ts`:

```typescript
export class ExampleGenerator {
  private static EXAMPLES: Record<string, Record<string, any>> = {
    'nodes-base.httpRequest': {
      minimal: {
        url: 'https://api.example.com/data'
      },
      getWithAuth: {
        method: 'GET',
        url: 'https://api.example.com/protected',
        authentication: 'genericCredentialType',
        genericAuthType: 'headerAuth'
      },
      postJson: {
        method: 'POST',
        url: 'https://api.example.com/create',
        sendBody: true,
        contentType: 'json',
        specifyBody: 'json',
        jsonBody: '{ "name": "Example User", "email": "user@example.com" }'
      }
    },
    'nodes-base.webhook': {
      minimal: {
        path: 'my-webhook',
        httpMethod: 'POST'
      },
      withResponse: {
        path: 'webhook-endpoint',
        httpMethod: 'POST',
        responseMode: 'lastNode',
        responseData: 'allEntries'
      }
    }
  };
  
  static getExamples(nodeType: string, essentials: any): Record<string, any> {
    // Return curated examples if available
    if (this.EXAMPLES[nodeType]) {
      return this.EXAMPLES[nodeType];
    }
    
    // Otherwise, generate minimal example
    const minimal: Record<string, any> = {};
    
    // Add required fields
    for (const prop of essentials.required) {
      minimal[prop.name] = this.getDefaultValue(prop);
    }
    
    // Add first common field with a default
    const firstCommon = essentials.common.find((p: any) => p.default !== undefined);
    if (firstCommon) {
      minimal[firstCommon.name] = firstCommon.default;
    }
    
    return { minimal };
  }
  
  private static getDefaultValue(prop: any): any {
    if (prop.default !== undefined) return prop.default;
    
    switch (prop.type) {
      case 'string':
        return prop.name === 'url' ? 'https://api.example.com' : '';
      case 'number':
        return 0;
      case 'boolean':
        return false;
      case 'options':
        return prop.options?.[0]?.value || '';
      default:
        return '';
    }
  }
}
```

## Step 3: Implement get_node_essentials Tool

Add to `src/mcp/server.ts` in the tool handler switch:

```typescript
case "get_node_essentials": {
  const { nodeType } = request.params.arguments as { nodeType: string };
  
  // Get node from database
  const node = await service.getNodeByType(nodeType);
  if (!node) {
    throw new Error(`Node type ${nodeType} not found`);
  }
  
  // Parse properties
  const allProperties = JSON.parse(node.properties_schema || '[]');
  
  // Get essentials
  const essentials = PropertyFilter.getEssentials(allProperties, nodeType);
  
  // Generate examples
  const examples = ExampleGenerator.getExamples(nodeType, essentials);
  
  // Parse operations
  const operations = JSON.parse(node.operations || '[]');
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        nodeType: node.node_type,
        displayName: node.display_name,
        description: node.description,
        category: node.category,
        requiredProperties: essentials.required,
        commonProperties: essentials.common,
        operations: operations.map((op: any) => ({
          name: op.name || op.operation,
          description: op.description
        })),
        examples,
        metadata: {
          totalProperties: allProperties.length,
          isAITool: node.is_ai_tool,
          isTrigger: node.is_trigger,
          hasCredentials: node.credentials_required ? true : false
        }
      }, null, 2)
    }]
  };
}
```

## Step 4: Add Tool Definition

In `src/mcp/server.ts`, add to the tools array:

```typescript
{
  name: "get_node_essentials",
  description: "Get only essential properties for a node (10-20 most important properties instead of 200+). Perfect for quick configuration.",
  inputSchema: {
    type: "object",
    properties: {
      nodeType: {
        type: "string",
        description: "The node type (e.g., 'nodes-base.httpRequest')"
      }
    },
    required: ["nodeType"]
  }
}
```

## Step 5: Test Implementation

Create `scripts/test-essentials.ts`:

```typescript
#!/usr/bin/env node
import { NodeDocumentationService } from '../src/services/node-documentation-service';
import { PropertyFilter } from '../src/services/property-filter';
import { ExampleGenerator } from '../src/services/example-generator';

async function testEssentials() {
  const service = new NodeDocumentationService();
  await service.initialize();
  
  const nodeTypes = [
    'nodes-base.httpRequest',
    'nodes-base.webhook', 
    'nodes-base.set',
    'nodes-base.code'
  ];
  
  for (const nodeType of nodeTypes) {
    console.log(`\n=== Testing ${nodeType} ===`);
    
    const node = await service.getNodeByType(nodeType);
    if (!node) continue;
    
    const allProperties = JSON.parse(node.properties_schema || '[]');
    const essentials = PropertyFilter.getEssentials(allProperties, nodeType);
    const examples = ExampleGenerator.getExamples(nodeType, essentials);
    
    console.log(`Total properties: ${allProperties.length}`);
    console.log(`Essential properties: ${essentials.required.length + essentials.common.length}`);
    console.log(`Size reduction: ${Math.round((1 - (essentials.required.length + essentials.common.length) / allProperties.length) * 100)}%`);
    
    console.log('\nRequired:', essentials.required.map(p => p.name).join(', ') || 'None');
    console.log('Common:', essentials.common.map(p => p.name).join(', '));
    console.log('Examples:', Object.keys(examples).join(', '));
    
    // Compare response sizes
    const fullSize = JSON.stringify(allProperties).length;
    const essentialSize = JSON.stringify({ ...essentials, examples }).length;
    console.log(`\nResponse size: ${(fullSize / 1024).toFixed(1)}KB → ${(essentialSize / 1024).toFixed(1)}KB`);
  }
  
  await service.close();
}

testEssentials().catch(console.error);
```

## Step 6: Iterate Based on Testing

After testing, refine the essential property lists by:

1. **Analyzing actual usage**: Which properties do users set most often?
2. **AI agent feedback**: Which properties cause confusion?
3. **Workflow analysis**: What are common patterns?

## Next Tools to Implement

### search_node_properties (Week 1)
```typescript
case "search_node_properties": {
  const { nodeType, query } = request.params.arguments;
  const allProperties = JSON.parse(node.properties_schema || '[]');
  
  // Flatten nested properties and search
  const flattened = PropertyFlattener.flatten(allProperties);
  const matches = flattened.filter(p => 
    p.name.toLowerCase().includes(query.toLowerCase()) ||
    p.displayName?.toLowerCase().includes(query.toLowerCase()) ||
    p.description?.toLowerCase().includes(query.toLowerCase())
  );
  
  return { matches: matches.slice(0, 20) };
}
```

### validate_node_config (Week 2)
```typescript
case "validate_node_config": {
  const { nodeType, config } = request.params.arguments;
  // Use existing properties and displayOptions to validate
}
```

### get_node_for_task (Week 2)
```typescript
case "get_node_for_task": {
  const { task } = request.params.arguments;
  // Return pre-configured templates
}
```

## Measuring Success

Track these metrics:
1. Response size reduction (target: >90%)
2. Time to configure a node (target: <1 minute)
3. AI agent success rate (target: >90%)
4. Number of tool calls needed (target: 2-3)

## Key Insight

Your existing system is already excellent at extracting properties. The solution isn't to rebuild it, but to add intelligent filtering on top. This approach:
- Delivers immediate value
- Requires minimal changes
- Preserves all existing functionality
- Can be iteratively improved