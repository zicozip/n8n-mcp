# n8n-MCP Enhancement Implementation Plan v2.2

## Executive Summary

This revised plan addresses the core issues discovered during testing: empty properties/operations arrays and missing AI tool detection. We focus on fixing the data extraction and storage pipeline while maintaining the simplicity of v2.1.

## Key Issues Found & Solutions

### 1. Empty Properties/Operations Arrays
**Problem**: The MCP service returns empty arrays for properties, operations, and credentials despite nodes having this data.

**Root Cause**: The parser is correctly extracting data, but either:
- The data isn't being properly serialized to the database
- The MCP server isn't deserializing it correctly
- The property structure is more complex than expected

**Solution**: Enhanced property extraction and proper JSON handling

### 2. AI Tools Not Detected
**Problem**: No nodes are flagged as AI tools despite having `usableAsTool` property.

**Root Cause**: The property might be nested or named differently in the actual node classes.

**Solution**: Deep property search and multiple detection strategies

### 3. Missing Versioned Node Support
**Problem**: Versioned nodes aren't properly handled, leading to incomplete data.

**Solution**: Explicit version handling for nodes like HTTPRequest and Code

## Updated Architecture

```
n8n-mcp/
├── src/
│   ├── loaders/
│   │   └── node-loader.ts         # Enhanced with better error handling
│   ├── parsers/
│   │   ├── property-extractor.ts  # NEW: Dedicated property extraction
│   │   └── node-parser.ts         # Updated parser with deep inspection
│   ├── mappers/
│   │   └── docs-mapper.ts         # Existing (working fine)
│   ├── database/
│   │   └── node-repository.ts     # NEW: Proper data serialization
│   ├── scripts/
│   │   └── rebuild.ts             # Enhanced with validation
│   └── mcp/
│       └── server.ts              # Fixed data retrieval
└── data/
    └── nodes.db                   # Same schema
```

## Week 1: Core Fixes

### Day 1-2: Property Extractor

**NEW File**: `src/parsers/property-extractor.ts`

```typescript
export class PropertyExtractor {
  /**
   * Extract properties with proper handling of n8n's complex structures
   */
  extractProperties(nodeClass: any): any[] {
    const properties = [];
    
    // Handle versioned nodes
    if (nodeClass.nodeVersions) {
      const versions = Object.keys(nodeClass.nodeVersions);
      const latestVersion = Math.max(...versions.map(Number));
      const versionedNode = nodeClass.nodeVersions[latestVersion];
      
      if (versionedNode.description?.properties) {
        return this.normalizeProperties(versionedNode.description.properties);
      }
    }
    
    // Handle regular nodes
    if (nodeClass.description?.properties) {
      return this.normalizeProperties(nodeClass.description.properties);
    }
    
    return properties;
  }
  
  /**
   * Extract operations from both declarative and programmatic nodes
   */
  extractOperations(nodeClass: any): any[] {
    const operations = [];
    
    // Declarative nodes (with routing)
    if (nodeClass.description?.routing) {
      const routing = nodeClass.description.routing;
      
      // Extract from request.resource and request.operation
      if (routing.request?.resource) {
        const resources = routing.request.resource.options || [];
        const operationOptions = routing.request.operation?.options || {};
        
        resources.forEach(resource => {
          const resourceOps = operationOptions[resource.value] || [];
          resourceOps.forEach(op => {
            operations.push({
              resource: resource.value,
              operation: op.value,
              name: `${resource.name} - ${op.name}`,
              action: op.action
            });
          });
        });
      }
    }
    
    // Programmatic nodes - look for operation property
    const props = this.extractProperties(nodeClass);
    const operationProp = props.find(p => p.name === 'operation' || p.name === 'action');
    
    if (operationProp?.options) {
      operationProp.options.forEach(op => {
        operations.push({
          operation: op.value,
          name: op.name,
          description: op.description
        });
      });
    }
    
    return operations;
  }
  
  /**
   * Deep search for AI tool capability
   */
  detectAIToolCapability(nodeClass: any): boolean {
    // Direct property check
    if (nodeClass.description?.usableAsTool === true) return true;
    
    // Check in actions for declarative nodes
    if (nodeClass.description?.actions?.some(a => a.usableAsTool === true)) return true;
    
    // Check versioned nodes
    if (nodeClass.nodeVersions) {
      for (const version of Object.values(nodeClass.nodeVersions)) {
        if ((version as any).description?.usableAsTool === true) return true;
      }
    }
    
    // Check for specific AI-related properties
    const aiIndicators = ['openai', 'anthropic', 'huggingface', 'cohere', 'ai'];
    const nodeName = nodeClass.description?.name?.toLowerCase() || '';
    
    return aiIndicators.some(indicator => nodeName.includes(indicator));
  }
  
  /**
   * Extract credential requirements with proper structure
   */
  extractCredentials(nodeClass: any): any[] {
    const credentials = [];
    
    // Handle versioned nodes
    if (nodeClass.nodeVersions) {
      const versions = Object.keys(nodeClass.nodeVersions);
      const latestVersion = Math.max(...versions.map(Number));
      const versionedNode = nodeClass.nodeVersions[latestVersion];
      
      if (versionedNode.description?.credentials) {
        return versionedNode.description.credentials;
      }
    }
    
    // Regular nodes
    if (nodeClass.description?.credentials) {
      return nodeClass.description.credentials;
    }
    
    return credentials;
  }
  
  private normalizeProperties(properties: any[]): any[] {
    // Ensure all properties have consistent structure
    return properties.map(prop => ({
      displayName: prop.displayName,
      name: prop.name,
      type: prop.type,
      default: prop.default,
      description: prop.description,
      options: prop.options,
      required: prop.required,
      displayOptions: prop.displayOptions,
      typeOptions: prop.typeOptions,
      noDataExpression: prop.noDataExpression
    }));
  }
}
```

### Day 3: Updated Parser

**Updated File**: `src/parsers/node-parser.ts`

```typescript
import { PropertyExtractor } from './property-extractor';

export class NodeParser {
  private propertyExtractor = new PropertyExtractor();
  
  parse(nodeClass: any, packageName: string): ParsedNode {
    // Get base description (handles versioned nodes)
    const description = this.getNodeDescription(nodeClass);
    
    return {
      style: this.detectStyle(nodeClass),
      nodeType: this.extractNodeType(description, packageName),
      displayName: description.displayName || description.name,
      description: description.description,
      category: this.extractCategory(description),
      properties: this.propertyExtractor.extractProperties(nodeClass),
      credentials: this.propertyExtractor.extractCredentials(nodeClass),
      isAITool: this.propertyExtractor.detectAIToolCapability(nodeClass),
      isTrigger: this.detectTrigger(description),
      isWebhook: this.detectWebhook(description),
      operations: this.propertyExtractor.extractOperations(nodeClass),
      version: this.extractVersion(nodeClass),
      isVersioned: !!nodeClass.nodeVersions
    };
  }
  
  private getNodeDescription(nodeClass: any): any {
    // For versioned nodes, get the latest version's description
    if (nodeClass.baseDescription) {
      return nodeClass.baseDescription;
    }
    
    if (nodeClass.nodeVersions) {
      const versions = Object.keys(nodeClass.nodeVersions);
      const latestVersion = Math.max(...versions.map(Number));
      return nodeClass.nodeVersions[latestVersion].description || {};
    }
    
    return nodeClass.description || {};
  }
  
  private detectStyle(nodeClass: any): 'declarative' | 'programmatic' {
    const desc = this.getNodeDescription(nodeClass);
    return desc.routing ? 'declarative' : 'programmatic';
  }
  
  private extractNodeType(description: any, packageName: string): string {
    // Ensure we have the full node type including package prefix
    const name = description.name;
    
    if (name.includes('.')) {
      return name;
    }
    
    // Add package prefix if missing
    const packagePrefix = packageName.replace('@n8n/', '').replace('n8n-', '');
    return `${packagePrefix}.${name}`;
  }
  
  private extractCategory(description: any): string {
    return description.group?.[0] || 
           description.categories?.[0] || 
           description.category || 
           'misc';
  }
  
  private detectTrigger(description: any): boolean {
    return description.polling === true || 
           description.trigger === true ||
           description.eventTrigger === true ||
           description.name?.toLowerCase().includes('trigger');
  }
  
  private detectWebhook(description: any): boolean {
    return (description.webhooks?.length > 0) ||
           description.webhook === true ||
           description.name?.toLowerCase().includes('webhook');
  }
  
  private extractVersion(nodeClass: any): string {
    if (nodeClass.baseDescription?.defaultVersion) {
      return nodeClass.baseDescription.defaultVersion.toString();
    }
    
    if (nodeClass.nodeVersions) {
      const versions = Object.keys(nodeClass.nodeVersions);
      return Math.max(...versions.map(Number)).toString();
    }
    
    return nodeClass.description?.version || '1';
  }
}
```

### Day 4: Node Repository

**NEW File**: `src/database/node-repository.ts`

```typescript
import Database from 'better-sqlite3';

export class NodeRepository {
  constructor(private db: Database.Database) {}
  
  /**
   * Save node with proper JSON serialization
   */
  saveNode(node: ParsedNode): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO nodes (
        node_type, package_name, display_name, description,
        category, development_style, is_ai_tool, is_trigger,
        is_webhook, is_versioned, version, documentation,
        properties_schema, operations, credentials_required
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      node.nodeType,
      node.packageName,
      node.displayName,
      node.description,
      node.category,
      node.style,
      node.isAITool ? 1 : 0,
      node.isTrigger ? 1 : 0,
      node.isWebhook ? 1 : 0,
      node.isVersioned ? 1 : 0,
      node.version,
      node.documentation || null,
      JSON.stringify(node.properties, null, 2),
      JSON.stringify(node.operations, null, 2),
      JSON.stringify(node.credentials, null, 2)
    );
  }
  
  /**
   * Get node with proper JSON deserialization
   */
  getNode(nodeType: string): any {
    const row = this.db.prepare(`
      SELECT * FROM nodes WHERE node_type = ?
    `).get(nodeType);
    
    if (!row) return null;
    
    return {
      nodeType: row.node_type,
      displayName: row.display_name,
      description: row.description,
      category: row.category,
      developmentStyle: row.development_style,
      package: row.package_name,
      isAITool: !!row.is_ai_tool,
      isTrigger: !!row.is_trigger,
      isWebhook: !!row.is_webhook,
      isVersioned: !!row.is_versioned,
      version: row.version,
      properties: this.safeJsonParse(row.properties_schema, []),
      operations: this.safeJsonParse(row.operations, []),
      credentials: this.safeJsonParse(row.credentials_required, []),
      hasDocumentation: !!row.documentation
    };
  }
  
  /**
   * Get AI tools with proper filtering
   */
  getAITools(): any[] {
    const rows = this.db.prepare(`
      SELECT node_type, display_name, description, package_name
      FROM nodes 
      WHERE is_ai_tool = 1
      ORDER BY display_name
    `).all();
    
    return rows.map(row => ({
      nodeType: row.node_type,
      displayName: row.display_name,
      description: row.description,
      package: row.package_name
    }));
  }
  
  private safeJsonParse(json: string, defaultValue: any): any {
    try {
      return JSON.parse(json);
    } catch {
      return defaultValue;
    }
  }
}
```

### Day 5: Enhanced Rebuild Script

**Updated File**: `src/scripts/rebuild.ts`

```typescript
#!/usr/bin/env node
import Database from 'better-sqlite3';
import { N8nNodeLoader } from '../loaders/node-loader';
import { NodeParser } from '../parsers/node-parser';
import { DocsMapper } from '../mappers/docs-mapper';
import { NodeRepository } from '../database/node-repository';
import * as fs from 'fs';
import * as path from 'path';

async function rebuild() {
  console.log('🔄 Rebuilding n8n node database...\n');
  
  const db = new Database('./data/nodes.db');
  const loader = new N8nNodeLoader();
  const parser = new NodeParser();
  const mapper = new DocsMapper();
  const repository = new NodeRepository(db);
  
  // Initialize database
  const schema = fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8');
  db.exec(schema);
  
  // Clear existing data
  db.exec('DELETE FROM nodes');
  console.log('🗑️  Cleared existing data\n');
  
  // Load all nodes
  const nodes = await loader.loadAllNodes();
  console.log(`📦 Loaded ${nodes.length} nodes from packages\n`);
  
  // Statistics
  const stats = {
    successful: 0,
    failed: 0,
    aiTools: 0,
    triggers: 0,
    webhooks: 0,
    withProperties: 0,
    withOperations: 0,
    withDocs: 0
  };
  
  // Process each node
  for (const { packageName, nodeName, NodeClass } of nodes) {
    try {
      // Parse node
      const parsed = parser.parse(NodeClass, packageName);
      
      // Validate parsed data
      if (!parsed.nodeType || !parsed.displayName) {
        throw new Error('Missing required fields');
      }
      
      // Get documentation
      const docs = await mapper.fetchDocumentation(parsed.nodeType);
      parsed.documentation = docs;
      
      // Save to database
      repository.saveNode(parsed);
      
      // Update statistics
      stats.successful++;
      if (parsed.isAITool) stats.aiTools++;
      if (parsed.isTrigger) stats.triggers++;
      if (parsed.isWebhook) stats.webhooks++;
      if (parsed.properties.length > 0) stats.withProperties++;
      if (parsed.operations.length > 0) stats.withOperations++;
      if (docs) stats.withDocs++;
      
      console.log(`✅ ${parsed.nodeType} [Props: ${parsed.properties.length}, Ops: ${parsed.operations.length}]`);
    } catch (error) {
      stats.failed++;
      console.error(`❌ Failed to process ${nodeName}: ${error.message}`);
    }
  }
  
  // Validation check
  console.log('\n🔍 Running validation checks...');
  const validationResults = validateDatabase(repository);
  
  // Summary
  console.log('\n📊 Summary:');
  console.log(`   Total nodes: ${nodes.length}`);
  console.log(`   Successful: ${stats.successful}`);
  console.log(`   Failed: ${stats.failed}`);
  console.log(`   AI Tools: ${stats.aiTools}`);
  console.log(`   Triggers: ${stats.triggers}`);
  console.log(`   Webhooks: ${stats.webhooks}`);
  console.log(`   With Properties: ${stats.withProperties}`);
  console.log(`   With Operations: ${stats.withOperations}`);
  console.log(`   With Documentation: ${stats.withDocs}`);
  
  if (!validationResults.passed) {
    console.log('\n⚠️  Validation Issues:');
    validationResults.issues.forEach(issue => console.log(`   - ${issue}`));
  }
  
  console.log('\n✨ Rebuild complete!');
  
  db.close();
}

function validateDatabase(repository: NodeRepository): { passed: boolean; issues: string[] } {
  const issues = [];
  
  // Check critical nodes
  const criticalNodes = ['httpRequest', 'code', 'webhook', 'slack'];
  
  for (const nodeType of criticalNodes) {
    const node = repository.getNode(nodeType);
    
    if (!node) {
      issues.push(`Critical node ${nodeType} not found`);
      continue;
    }
    
    if (node.properties.length === 0) {
      issues.push(`Node ${nodeType} has no properties`);
    }
  }
  
  // Check AI tools
  const aiTools = repository.getAITools();
  if (aiTools.length === 0) {
    issues.push('No AI tools found - check detection logic');
  }
  
  return {
    passed: issues.length === 0,
    issues
  };
}

// Run if called directly
if (require.main === module) {
  rebuild().catch(console.error);
}
```

## Week 2: Testing and MCP Updates

### Day 6-7: Enhanced MCP Server

**Updated File**: `src/mcp/server.ts`

```typescript
import { NodeRepository } from '../database/node-repository';

// In the get_node_info handler
async function getNodeInfo(nodeType: string) {
  const repository = new NodeRepository(db);
  const node = repository.getNode(nodeType);
  
  if (!node) {
    // Try alternative formats
    const alternatives = [
      nodeType,
      nodeType.replace('n8n-nodes-base.', ''),
      `n8n-nodes-base.${nodeType}`,
      nodeType.toLowerCase()
    ];
    
    for (const alt of alternatives) {
      const found = repository.getNode(alt);
      if (found) {
        node = found;
        break;
      }
    }
    
    if (!node) {
      throw new Error(`Node ${nodeType} not found`);
    }
  }
  
  return node;
}

// In the list_ai_tools handler
async function listAITools() {
  const repository = new NodeRepository(db);
  const tools = repository.getAITools();
  
  return {
    tools,
    totalCount: tools.length,
    requirements: {
      environmentVariable: 'N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true',
      nodeProperty: 'usableAsTool: true'
    }
  };
}
```

### Day 8-9: Test Suite

**NEW File**: `src/scripts/test-nodes.ts`

```typescript
#!/usr/bin/env node
import Database from 'better-sqlite3';
import { NodeRepository } from '../database/node-repository';

const TEST_CASES = [
  {
    nodeType: 'httpRequest',
    checks: {
      hasProperties: true,
      minProperties: 5,
      hasDocumentation: true,
      isVersioned: true
    }
  },
  {
    nodeType: 'slack',
    checks: {
      hasOperations: true,
      minOperations: 10,
      style: 'declarative'
    }
  },
  {
    nodeType: 'code',
    checks: {
      hasProperties: true,
      properties: ['mode', 'language', 'jsCode']
    }
  }
];

async function runTests() {
  const db = new Database('./data/nodes.db');
  const repository = new NodeRepository(db);
  
  console.log('🧪 Running node tests...\n');
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of TEST_CASES) {
    console.log(`Testing ${testCase.nodeType}...`);
    
    try {
      const node = repository.getNode(testCase.nodeType);
      
      if (!node) {
        throw new Error('Node not found');
      }
      
      // Run checks
      for (const [check, expected] of Object.entries(testCase.checks)) {
        switch (check) {
          case 'hasProperties':
            if (expected && node.properties.length === 0) {
              throw new Error('No properties found');
            }
            break;
            
          case 'minProperties':
            if (node.properties.length < expected) {
              throw new Error(`Expected at least ${expected} properties, got ${node.properties.length}`);
            }
            break;
            
          case 'hasOperations':
            if (expected && node.operations.length === 0) {
              throw new Error('No operations found');
            }
            break;
            
          case 'minOperations':
            if (node.operations.length < expected) {
              throw new Error(`Expected at least ${expected} operations, got ${node.operations.length}`);
            }
            break;
            
          case 'properties':
            const propNames = node.properties.map(p => p.name);
            for (const prop of expected as string[]) {
              if (!propNames.includes(prop)) {
                throw new Error(`Missing property: ${prop}`);
              }
            }
            break;
        }
      }
      
      console.log(`✅ ${testCase.nodeType} passed all checks\n`);
      passed++;
    } catch (error) {
      console.error(`❌ ${testCase.nodeType} failed: ${error.message}\n`);
      failed++;
    }
  }
  
  console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
  
  db.close();
}

if (require.main === module) {
  runTests().catch(console.error);
}
```

## Key Improvements in v2.2

1. **Dedicated Property Extraction**
   - Handles versioned nodes properly
   - Extracts operations from both declarative and programmatic nodes
   - Deep search for AI tool capabilities

2. **Proper Data Serialization**
   - NodeRepository ensures JSON is properly stored and retrieved
   - Safe JSON parsing with defaults
   - Consistent data structure

3. **Enhanced Validation**
   - Validation checks in rebuild script
   - Test suite for critical nodes
   - Statistics tracking for better visibility

4. **Better Error Handling**
   - Alternative node type lookups
   - Graceful fallbacks
   - Detailed error messages

5. **AI Tool Detection**
   - Multiple detection strategies
   - Check in versioned nodes
   - Name-based heuristics as fallback

## Success Metrics Update

1. **Properties/Operations**: >90% of nodes should have non-empty arrays
2. **AI Tools**: Should detect at least 10-20 AI-capable nodes
3. **Critical Nodes**: 100% pass rate on test suite
4. **Documentation**: Maintain existing 89% coverage
5. **Performance**: Rebuild in <60 seconds (allowing for validation)

## Deployment Steps

```bash
# 1. Update code with v2.2 changes
npm install

# 2. Build TypeScript
npm run build

# 3. Run rebuild with validation
npm run rebuild

# 4. Run test suite
npm run test-nodes

# 5. Verify AI tools
npm run list-ai-tools

# 6. Start MCP server
npm start
```

## Summary

Version 2.2 focuses on fixing the core data extraction issues while maintaining the simplicity of the MVP approach. The key insight is that n8n's node structure is more complex than initially assumed, especially for versioned nodes and AI tool detection. By adding dedicated extraction logic and proper data handling, we can deliver accurate node information while keeping the implementation straightforward.</document_content>
</invoke>