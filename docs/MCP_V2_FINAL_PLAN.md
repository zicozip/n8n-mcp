# MCP V2 Final Plan - MVP Approach

## Executive Summary

Forget the 4-week enterprise architecture. Here's how to fix everything in 3 days.

## Day 1 (Monday) - Deploy & Debug

### 1. Fix Deployment (1 hour)
```bash
# Just build and push
docker build -t ghcr.io/czlonkowski/n8n-mcp:latest .
docker push ghcr.io/czlonkowski/n8n-mcp:latest
```

### 2. Add Version & Test Endpoints (30 min)
```typescript
// In http-server-fixed.ts
app.get('/version', (req, res) => {
  res.json({ 
    version: '2.4.1',
    buildTime: new Date().toISOString(),
    tools: n8nDocumentationToolsFinal.map(t => t.name),
    commit: process.env.GIT_COMMIT || 'unknown'
  });
});

app.get('/test-tools', async (req, res) => {
  try {
    const result = await server.executeTool('get_node_essentials', { nodeType: 'nodes-base.httpRequest' });
    res.json({ status: 'ok', hasData: !!result, toolCount: n8nDocumentationToolsFinal.length });
  } catch (error) {
    res.json({ status: 'error', message: error.message });
  }
});
```

### 3. Debug list_nodes (1 hour)
```typescript
// Add ONE line to see what's broken
private async listNodes(filters: any = {}): Promise<any> {
  console.log('DEBUG list_nodes:', { filters, query, params }); // ADD THIS
  // ... rest of code
}
```

### 4. Debug list_ai_tools (30 min)
```sql
-- Run this query to check
SELECT COUNT(*) as ai_count FROM nodes WHERE is_ai_tool = 1;
-- If 0, the column isn't populated. Fix in rebuild script.
```

## Day 2 (Tuesday) - Core Fixes

### 1. Fix Multi-Word Search (2 hours)
```typescript
// Replace the search function in server-update.ts
private async searchNodes(query: string, limit: number = 20): Promise<any> {
  // Split query into words
  // Handle exact phrase searches with quotes
  if (query.startsWith('"') && query.endsWith('"')) {
    const exactPhrase = query.slice(1, -1);
    const nodes = this.db!.prepare(`
      SELECT * FROM nodes 
      WHERE node_type LIKE ? OR display_name LIKE ? OR description LIKE ?
      ORDER BY display_name
      LIMIT ?
    `).all(`%${exactPhrase}%`, `%${exactPhrase}%`, `%${exactPhrase}%`, limit) as NodeRow[];
    
    return { query, results: this.formatNodeResults(nodes), totalCount: nodes.length };
  }
  
  // Split into words for normal search
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  
  if (words.length === 0) {
    return { query, results: [], totalCount: 0 };
  }
  
  // Build conditions for each word
  const conditions = words.map(() => 
    '(node_type LIKE ? OR display_name LIKE ? OR description LIKE ?)'
  ).join(' OR ');
  
  const params = words.flatMap(w => [`%${w}%`, `%${w}%`, `%${w}%`]);
  params.push(limit);
  
  const nodes = this.db!.prepare(`
    SELECT DISTINCT * FROM nodes 
    WHERE ${conditions}
    ORDER BY display_name
    LIMIT ?
  `).all(...params) as NodeRow[];
  
  return {
    query,
    results: nodes.map(node => ({
      nodeType: node.node_type,
      displayName: node.display_name,
      description: node.description,
      category: node.category,
      package: node.package_name
    })),
    totalCount: nodes.length
  };
}
```

### 2. Simple Property Deduplication (2 hours)
```typescript
// Add to PropertyFilter.ts
static deduplicateProperties(properties: any[]): any[] {
  const seen = new Map<string, any>();
  
  return properties.filter(prop => {
    // Create unique key from name + conditions
    const conditions = JSON.stringify(prop.displayOptions || {});
    const key = `${prop.name}_${conditions}`;
    
    if (seen.has(key)) {
      return false; // Skip duplicate
    }
    
    seen.set(key, prop);
    return true;
  });
}

// Use in getEssentials
static getEssentials(allProperties: any[], nodeType: string): FilteredProperties {
  // Deduplicate first
  const uniqueProperties = this.deduplicateProperties(allProperties);
  
  // ... rest of existing code
}
```

### 3. Fix Package Name Mismatch (1 hour)
```typescript
// In listNodes, be more flexible with package names
if (filters.package) {
  // Handle both formats
  const packageVariants = [
    filters.package,
    `@n8n/${filters.package}`,
    filters.package.replace('@n8n/', '')
  ];
  query += ' AND package_name IN (' + packageVariants.map(() => '?').join(',') + ')';
  params.push(...packageVariants);
}
```

## Day 3 (Wednesday) - Polish & Test

### 1. Add Simple Memory Cache (2 hours)
```typescript
// Super simple cache - no frameworks needed
class SimpleCache {
  private cache = new Map<string, { data: any; expires: number }>();
  
  constructor() {
    // Clean up expired entries every minute
    setInterval(() => {
      const now = Date.now();
      for (const [key, item] of this.cache.entries()) {
        if (item.expires < now) this.cache.delete(key);
      }
    }, 60000);
  }
  
  get(key: string): any {
    const item = this.cache.get(key);
    if (!item || item.expires < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return item.data;
  }
  
  set(key: string, data: any, ttlSeconds: number = 300): void {
    this.cache.set(key, {
      data,
      expires: Date.now() + (ttlSeconds * 1000)
    });
  }
  
  clear(): void {
    this.cache.clear();
  }
}

// Use in server
const cache = new SimpleCache();

// Example in getNodeEssentials
const cacheKey = `essentials:${nodeType}`;
const cached = cache.get(cacheKey);
if (cached) return cached;

// ... get data ...
cache.set(cacheKey, result, 3600); // Cache for 1 hour
```

### 2. Add Basic Documentation Fallback (1 hour)
```typescript
// In getNodeDocumentation
if (!node.documentation) {
  const essentials = await this.getNodeEssentials(nodeType);
  
  return {
    nodeType: node.node_type,
    displayName: node.display_name,
    documentation: `
# ${node.display_name}

${node.description || 'No description available.'}

## Common Properties

${essentials.commonProperties.map(p => 
  `### ${p.displayName}\n${p.description || `Type: ${p.type}`}`
).join('\n\n')}

## Note
Full documentation is being prepared. For now, use get_node_essentials for configuration help.
`,
    hasDocumentation: false
  };
}
```

### 3. Testing Checklist (2 hours)
- [ ] Rebuild and deploy Docker image
- [ ] Test all tools appear in Claude Desktop
- [ ] Test multi-word search: "send slack message"
- [ ] Test list_nodes with package filter
- [ ] Test list_ai_tools returns 263 nodes
- [ ] Verify no duplicate properties in webhook/email nodes
- [ ] Check response times with cache

## Total Time: 3 Days

### Day 1: 3 hours of actual work
### Day 2: 5 hours of actual work  
### Day 3: 5 hours of actual work

## Rollback Plan

```bash
# Before starting, tag current version
docker pull ghcr.io/czlonkowski/n8n-mcp:latest
docker tag ghcr.io/czlonkowski/n8n-mcp:latest ghcr.io/czlonkowski/n8n-mcp:v2.4.0-backup

# If anything breaks, instant rollback:
docker tag ghcr.io/czlonkowski/n8n-mcp:v2.4.0-backup ghcr.io/czlonkowski/n8n-mcp:latest
docker push ghcr.io/czlonkowski/n8n-mcp:latest
```

## What We're NOT Doing

- ❌ No complex deployment verifiers
- ❌ No semantic search
- ❌ No AI documentation generators
- ❌ No workflow assistants
- ❌ No real-time validators
- ❌ No enterprise caching frameworks
- ❌ No complex service architectures

## Success Metrics

- ✅ All tools visible in Claude Desktop
- ✅ Multi-word search works
- ✅ No duplicate properties
- ✅ list_nodes and list_ai_tools return results
- ✅ Basic caching improves performance

## Code Changes Summary

1. **http-server-fixed.ts**: Add version endpoint (5 lines)
2. **server-update.ts**: Fix search (20 lines), add debug logs (2 lines)
3. **property-filter.ts**: Add deduplication (15 lines)
4. **New file: simple-cache.ts**: Basic cache (20 lines)

Total new code: ~62 lines

## Next Steps After MVP

Only after everything above works perfectly:
1. Monitor actual performance - add better caching IF needed
2. Collect user feedback on search - improve IF needed
3. Generate better docs for AI nodes IF users complain

But not before. Ship the fixes first.