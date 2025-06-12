# n8n-MCP Enhancement Implementation Plan v2.1 Final

## Executive Summary

This ultra-focused MVP implementation plan delivers accurate n8n node documentation in 2 weeks by working directly with n8n's architecture. We prioritize simplicity and accuracy over complex features.

## Core MVP Principles

1. **Start with the simplest thing that works**
2. **Test with real nodes early and often**
3. **Don't try to be too clever** - n8n's structure is fine
4. **Focus on accuracy over completeness**
5. **Work WITH n8n's architecture, not against it**

## Key Insight

**We're not trying to understand n8n's nodes, we're just accurately cataloging them.**

## Simplified Architecture

```
n8n-mcp/
├── src/
│   ├── loaders/
│   │   └── node-loader.ts         # Simple npm package loader
│   ├── parsers/
│   │   └── simple-parser.ts       # Single parser for all nodes
│   ├── mappers/
│   │   └── docs-mapper.ts         # Deterministic documentation mapping
│   ├── scripts/
│   │   ├── rebuild.ts             # One-command rebuild
│   │   └── validate.ts            # Validation script
│   └── mcp/
│       └── server.ts              # Enhanced MCP server
└── data/
    └── nodes.db                   # Minimal SQLite database
```

## Implementation Strategy

### Quick Win Approach
Get *something* working end-to-end on Day 1, even if it only loads 5 nodes. This proves the architecture and builds momentum.

### Documentation Strategy
Clone the n8n-docs repo locally for simpler file-based access:
```bash
git clone https://github.com/n8n-io/n8n-docs.git ../n8n-docs
```

### Test-First Development
Build the rebuild script first as a test harness:
```bash
npm run rebuild && sqlite3 data/nodes.db "SELECT node_type, display_name FROM nodes LIMIT 10"
```

## Week 1: Core Implementation

### Day 1-2: Simple Node Loader + Initial Rebuild Script

**Start with the rebuild script to enable quick iteration!**

**File**: `src/scripts/rebuild.ts` (Build this first!)

```typescript
#!/usr/bin/env node
import Database from 'better-sqlite3';
import { N8nNodeLoader } from '../loaders/node-loader';
import { SimpleParser } from '../parsers/simple-parser';
import { DocsMapper } from '../mappers/docs-mapper';

async function rebuild() {
  console.log('🔄 Rebuilding n8n node database...\n');
  
  const db = new Database('./data/nodes.db');
  const loader = new N8nNodeLoader();
  const parser = new SimpleParser();
  const mapper = new DocsMapper();
  
  // Initialize database
  const schema = require('fs').readFileSync('./src/database/schema.sql', 'utf8');
  db.exec(schema);
  
  // Clear existing data
  db.exec('DELETE FROM nodes');
  console.log('🗑️  Cleared existing data\n');
  
  // Load all nodes
  const nodes = await loader.loadAllNodes();
  console.log(`📦 Loaded ${nodes.length} nodes from packages\n`);
  
  // Statistics
  let successful = 0;
  let failed = 0;
  let aiTools = 0;
  
  // Process each node
  for (const { packageName, nodeName, NodeClass } of nodes) {
    try {
      // Parse node
      const parsed = parser.parse(NodeClass);
      
      // Get documentation
      const docs = await mapper.fetchDocumentation(parsed.nodeType);
      
      // Insert into database
      db.prepare(`
        INSERT INTO nodes (
          node_type, package_name, display_name, description,
          category, development_style, is_ai_tool, is_trigger,
          is_webhook, is_versioned, version, documentation,
          properties_schema, operations, credentials_required
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        parsed.nodeType,
        packageName,
        parsed.displayName,
        parsed.description,
        parsed.category,
        parsed.style,
        parsed.isAITool ? 1 : 0,
        parsed.isTrigger ? 1 : 0,
        parsed.isWebhook ? 1 : 0,
        parsed.isVersioned ? 1 : 0,
        parsed.version,
        docs,
        JSON.stringify(parsed.properties),
        JSON.stringify(parsed.operations),
        JSON.stringify(parsed.credentials)
      );
      
      successful++;
      if (parsed.isAITool) aiTools++;
      
      console.log(`✅ ${parsed.nodeType}`);
    } catch (error) {
      failed++;
      console.error(`❌ Failed to process ${nodeName}: ${error.message}`);
    }
  }
  
  // Summary
  console.log('\n📊 Summary:');
  console.log(`   Total nodes: ${nodes.length}`);
  console.log(`   Successful: ${successful}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   AI Tools: ${aiTools}`);
  console.log('\n✨ Rebuild complete!');
  
  db.close();
}

// Run if called directly
if (require.main === module) {
  rebuild().catch(console.error);
}
```

**File**: `src/loaders/node-loader.ts`

```typescript
export class N8nNodeLoader {
  private readonly CORE_PACKAGES = [
    'n8n-nodes-base',
    '@n8n/n8n-nodes-langchain'
  ];

  async loadAllNodes() {
    const results = [];
    
    for (const pkg of this.CORE_PACKAGES) {
      try {
        // Direct require - no complex path resolution
        const packageJson = require(`${pkg}/package.json`);
        const nodes = await this.loadPackageNodes(pkg, packageJson);
        results.push(...nodes);
      } catch (error) {
        console.error(`Failed to load ${pkg}:`, error);
      }
    }
    
    return results;
  }

  private async loadPackageNodes(packageName: string, packageJson: any) {
    const n8nConfig = packageJson.n8n || {};
    const nodes = [];
    
    // Load from n8n.nodes configuration
    for (const [nodeName, nodePath] of Object.entries(n8nConfig.nodes || {})) {
      const fullPath = require.resolve(`${packageName}/${nodePath}`);
      const nodeModule = require(fullPath);
      
      // Handle default export
      const NodeClass = nodeModule.default || nodeModule[nodeName];
      nodes.push({ packageName, nodeName, NodeClass });
    }
    
    return nodes;
  }
}
```

### Day 3: Simple Parser

**File**: `src/parsers/simple-parser.ts`

```typescript
export interface ParsedNode {
  style: 'declarative' | 'programmatic';
  nodeType: string;
  displayName: string;
  description?: string;
  category?: string;
  properties: any[];
  credentials: string[];
  isAITool: boolean;
  isTrigger: boolean;
  isWebhook: boolean;
  operations: any[];
  version?: string;
  isVersioned: boolean;
}

export class SimpleParser {
  parse(nodeClass: any): ParsedNode {
    const description = nodeClass.description || {};
    const isDeclarative = !!description.routing;
    
    return {
      style: isDeclarative ? 'declarative' : 'programmatic',
      nodeType: description.name,
      displayName: description.displayName,
      description: description.description,
      category: description.group?.[0] || description.categories?.[0],
      properties: description.properties || [],
      credentials: description.credentials || [],
      isAITool: description.usableAsTool === true,
      isTrigger: description.polling === true || description.trigger === true,
      isWebhook: description.webhooks?.length > 0,
      operations: isDeclarative ? this.extractOperations(description.routing) : [],
      version: this.extractVersion(nodeClass),
      isVersioned: this.isVersionedNode(nodeClass)
    };
  }
  
  private extractOperations(routing: any): any[] {
    // Simple extraction without complex logic
    const operations = [];
    const resources = routing?.request?.resource?.options || [];
    
    resources.forEach(resource => {
      operations.push({
        resource: resource.value,
        name: resource.name
      });
    });
    
    return operations;
  }

  private extractVersion(nodeClass: any): string {
    if (nodeClass.baseDescription?.defaultVersion) {
      return nodeClass.baseDescription.defaultVersion.toString();
    }
    return nodeClass.description?.version || '1';
  }

  private isVersionedNode(nodeClass: any): boolean {
    return !!(nodeClass.baseDescription && nodeClass.nodeVersions);
  }
}
```

### Day 4: Documentation Mapper

**File**: `src/mappers/docs-mapper.ts`

```typescript
import { promises as fs } from 'fs';
import path from 'path';

export class DocsMapper {
  private docsPath = path.join(__dirname, '../../../n8n-docs');
  
  // Known documentation mapping fixes
  private readonly KNOWN_FIXES = {
    'n8n-nodes-base.httpRequest': 'httprequest',
    'n8n-nodes-base.code': 'code',
    'n8n-nodes-base.webhook': 'webhook',
    'n8n-nodes-base.respondToWebhook': 'respondtowebhook'
  };

  async fetchDocumentation(nodeType: string): Promise<string | null> {
    // Apply known fixes first
    const fixedType = this.KNOWN_FIXES[nodeType] || nodeType;
    
    // Extract node name
    const nodeName = fixedType.split('.').pop()?.toLowerCase();
    if (!nodeName) return null;
    
    // Try different documentation paths
    const possiblePaths = [
      `docs/integrations/builtin/core-nodes/n8n-nodes-base.${nodeName}.md`,
      `docs/integrations/builtin/app-nodes/n8n-nodes-base.${nodeName}.md`,
      `docs/integrations/builtin/trigger-nodes/n8n-nodes-base.${nodeName}.md`,
      `docs/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.${nodeName}.md`
    ];
    
    // Try each path
    for (const relativePath of possiblePaths) {
      try {
        const fullPath = path.join(this.docsPath, relativePath);
        const content = await fs.readFile(fullPath, 'utf-8');
        return content;
      } catch (error) {
        // File doesn't exist, try next
        continue;
      }
    }
    
    return null;
  }
}
```

### Day 5: Database Setup

**File**: `src/database/schema.sql`

```sql
-- Ultra-simple schema for MVP
CREATE TABLE IF NOT EXISTS nodes (
  node_type TEXT PRIMARY KEY,
  package_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  development_style TEXT CHECK(development_style IN ('declarative', 'programmatic')),
  is_ai_tool INTEGER DEFAULT 0,
  is_trigger INTEGER DEFAULT 0,
  is_webhook INTEGER DEFAULT 0,
  is_versioned INTEGER DEFAULT 0,
  version TEXT,
  documentation TEXT,
  properties_schema TEXT,
  operations TEXT,
  credentials_required TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Minimal indexes for performance
CREATE INDEX IF NOT EXISTS idx_package ON nodes(package_name);
CREATE INDEX IF NOT EXISTS idx_ai_tool ON nodes(is_ai_tool);
CREATE INDEX IF NOT EXISTS idx_category ON nodes(category);
```

## Week 2: Integration and Testing

### Day 6-7: Test Priority Nodes

Focus on these nodes first (they cover most edge cases):

1. **HTTP Request** - Known documentation mismatch
2. **Slack** - Complex declarative node  
3. **Code** - Versioned node with documentation issues
4. **AI Agent** - LangChain node with AI tool flag

### Day 8-9: MCP Server Updates

**File**: `src/mcp/tools-update.ts`

```typescript
// Simplified get_node_info tool
async function getNodeInfo(nodeType: string) {
  const node = db.prepare(`
    SELECT * FROM nodes WHERE node_type = ?
  `).get(nodeType);
  
  if (!node) {
    throw new Error(`Node ${nodeType} not found`);
  }
  
  return {
    nodeType: node.node_type,
    displayName: node.display_name,
    description: node.description,
    category: node.category,
    developmentStyle: node.development_style,
    isAITool: !!node.is_ai_tool,
    isTrigger: !!node.is_trigger,
    isWebhook: !!node.is_webhook,
    version: node.version,
    properties: JSON.parse(node.properties_schema),
    operations: JSON.parse(node.operations || '[]'),
    credentials: JSON.parse(node.credentials_required),
    documentation: node.documentation
  };
}

// New tool: list_ai_tools
{
  name: 'list_ai_tools',
  description: 'List all nodes that can be used as AI Agent tools',
  inputSchema: {
    type: 'object',
    properties: {}
  }
}

async function listAITools() {
  const tools = db.prepare(`
    SELECT node_type, display_name, description, package_name
    FROM nodes 
    WHERE is_ai_tool = 1
    ORDER BY display_name
  `).all();
  
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

### Day 10: Validation Script

**File**: `src/scripts/validate.ts`

```typescript
#!/usr/bin/env node
import Database from 'better-sqlite3';

async function validate() {
  const db = new Database('./data/nodes.db');
  
  console.log('🔍 Validating critical nodes...\n');
  
  const criticalChecks = [
    { 
      type: 'n8n-nodes-base.httpRequest', 
      checks: {
        hasDocumentation: true,
        documentationContains: 'httprequest',
        style: 'programmatic'
      }
    },
    { 
      type: 'n8n-nodes-base.code', 
      checks: {
        hasDocumentation: true,
        documentationContains: 'code',
        isVersioned: true
      }
    },
    { 
      type: 'n8n-nodes-base.slack', 
      checks: {
        hasOperations: true,
        style: 'declarative'
      }
    },
    {
      type: '@n8n/n8n-nodes-langchain.agent',
      checks: {
        isAITool: true,
        packageName: '@n8n/n8n-nodes-langchain'
      }
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const check of criticalChecks) {
    const node = db.prepare('SELECT * FROM nodes WHERE node_type = ?').get(check.type);
    
    if (!node) {
      console.log(`❌ ${check.type}: NOT FOUND`);
      failed++;
      continue;
    }
    
    let nodeOk = true;
    const issues = [];
    
    // Run checks
    if (check.checks.hasDocumentation && !node.documentation) {
      nodeOk = false;
      issues.push('missing documentation');
    }
    
    if (check.checks.documentationContains && 
        !node.documentation?.includes(check.checks.documentationContains)) {
      nodeOk = false;
      issues.push(`documentation doesn't contain "${check.checks.documentationContains}"`);
    }
    
    if (check.checks.style && node.development_style !== check.checks.style) {
      nodeOk = false;
      issues.push(`wrong style: ${node.development_style}`);
    }
    
    if (check.checks.hasOperations) {
      const operations = JSON.parse(node.operations || '[]');
      if (!operations.length) {
        nodeOk = false;
        issues.push('no operations found');
      }
    }
    
    if (check.checks.isAITool && !node.is_ai_tool) {
      nodeOk = false;
      issues.push('not marked as AI tool');
    }
    
    if (check.checks.isVersioned && !node.is_versioned) {
      nodeOk = false;
      issues.push('not marked as versioned');
    }
    
    if (nodeOk) {
      console.log(`✅ ${check.type}`);
      passed++;
    } else {
      console.log(`❌ ${check.type}: ${issues.join(', ')}`);
      failed++;
    }
  }
  
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  
  // Additional statistics
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(is_ai_tool) as ai_tools,
      SUM(is_trigger) as triggers,
      SUM(is_versioned) as versioned,
      COUNT(DISTINCT package_name) as packages
    FROM nodes
  `).get();
  
  console.log('\n📈 Database Statistics:');
  console.log(`   Total nodes: ${stats.total}`);
  console.log(`   AI tools: ${stats.ai_tools}`);
  console.log(`   Triggers: ${stats.triggers}`);
  console.log(`   Versioned: ${stats.versioned}`);
  console.log(`   Packages: ${stats.packages}`);
  
  db.close();
  process.exit(failed > 0 ? 1 : 0);
}

if (require.main === module) {
  validate().catch(console.error);
}
```

## MVP Deliverables Checklist

### Week 1 ✅
- [ ] Clone n8n-docs repository locally
- [ ] Build rebuild script first (test harness)
- [ ] Basic node loader for n8n-nodes-base and langchain packages
- [ ] Simple parser (no complex analysis)
- [ ] Documentation fetcher with file-based access
- [ ] SQLite database setup with minimal schema
- [ ] Get 5 nodes working end-to-end on Day 1

### Week 2 ✅
- [ ] Test priority nodes (HTTP Request, Slack, Code, AI Agent)
- [ ] Fix all documentation mapping issues
- [ ] Update MCP tools for simplified schema
- [ ] Add AI tools listing functionality
- [ ] Create validation script
- [ ] Document usage instructions
- [ ] Run full validation suite

## What We're Deferring Post-MVP

1. **Version history tracking** - Just current version
2. **Source code extraction** - Not needed for documentation
3. **Complex property type analysis** - Keep n8n's structure as-is
4. **Custom node directory support** - Focus on npm packages only
5. **Performance optimizations** - SQLite is fast enough
6. **Real-time monitoring** - Static documentation only
7. **Web UI** - CLI tools only
8. **Multi-tenant support** - Single instance
9. **Advanced search** - Basic SQL queries are sufficient
10. **Community nodes** - Just official packages for now

## Success Metrics

1. **Accuracy**: 100% correct node-to-documentation mapping for test nodes
2. **Coverage**: All nodes from n8n-nodes-base and n8n-nodes-langchain
3. **Performance**: Full rebuild in <30 seconds
4. **Simplicity**: Single command rebuild (`npm run rebuild`)
5. **Reliability**: No failures on standard nodes
6. **Validation**: All critical nodes pass validation script

## Quick Start Guide

```bash
# Setup
git clone https://github.com/n8n-io/n8n-docs.git ../n8n-docs
npm install

# Build
npm run build

# Rebuild database
npm run rebuild

# Validate
npm run validate

# Start MCP server
npm start
```

## NPM Scripts

```json
{
  "scripts": {
    "build": "tsc",
    "rebuild": "node dist/scripts/rebuild.js",
    "validate": "node dist/scripts/validate.js",
    "start": "node dist/mcp/server.js",
    "dev": "npm run build && npm run rebuild && npm run validate"
  }
}
```

## Summary

This v2.1 Final plan delivers a working MVP in 2 weeks by:
- **Starting with the test harness** - Build rebuild script first
- **Getting quick wins** - 5 nodes on Day 1
- **Testing critical nodes early** - HTTP Request, Slack, Code, AI Agent
- **Using local documentation** - Clone n8n-docs for file access
- **Validating success** - Automated validation script

The result: A reliable, accurate node documentation service that can be enhanced incrementally post-MVP.

**Ready to build! 🚀**