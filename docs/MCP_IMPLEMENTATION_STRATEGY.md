# MCP Tools Implementation Strategy

## Executive Summary

This document outlines a comprehensive strategy to transform the n8n MCP from a documentation server into an AI-optimized workflow configuration assistant. The core issue is that `get_node_info` returns 100KB+ of unstructured JSON, making it nearly impossible for AI agents to efficiently build n8n workflows. Our strategy introduces new tools and restructures data to reduce complexity by 95% while maintaining full functionality.

## Current State Analysis

### Problems
1. **Data Overload**: HTTP Request node returns 200+ properties when only 5-10 are needed
2. **Poor Structure**: Properties stored as monolithic JSON blobs, not queryable
3. **Duplicate Properties**: Same property appears 3-4 times with different conditions
4. **Complex Nesting**: Properties buried in collections within collections
5. **No Prioritization**: Essential properties mixed with rarely-used advanced options

### Impact
- AI agents waste 90% of tokens parsing irrelevant data
- High error rates due to confusion with duplicate properties
- 5-10 minutes to configure a simple node (should be <1 minute)
- Poor developer experience leads to workflow building failures

## Implementation Strategy Overview

### Design Principles
1. **Progressive Disclosure**: Start with essentials, add complexity only when needed
2. **Task-Oriented**: Focus on what users want to do, not technical details
3. **Backward Compatible**: Keep existing tools, add new optimized ones
4. **Incremental Deployment**: Each phase delivers value independently
5. **AI-First Design**: Optimize for token efficiency and clarity

### Three-Phase Approach

**Phase 1: Quick Wins (Week 1-2)**
- Implement without database changes
- Filter existing data for essentials
- Add common examples

**Phase 2: Enhanced Capabilities (Week 3-4)**
- Parse property structures
- Build search and validation
- Create task templates

**Phase 3: Full Optimization (Month 2)**
- Database schema migration
- Property deduplication
- Dependency tracking

## Phase 1: Quick Wins Implementation

### 1.1 get_node_essentials Tool

**Purpose**: Return only the 10-20 properties needed for 90% of use cases

**Implementation**:
```typescript
interface GetNodeEssentialsInput {
  nodeType: string;
}

interface GetNodeEssentialsOutput {
  nodeType: string;
  displayName: string;
  description: string;
  requiredProperties: PropertyInfo[];
  commonProperties: PropertyInfo[];
  examples: {
    minimal: object;
    common: object;
  };
}

interface PropertyInfo {
  name: string;
  type: string;
  description: string;
  default?: any;
  options?: string[];
  placeholder?: string;
}
```

**Technical Approach**:
1. Create curated lists of essential properties for top 20 nodes
2. Parse existing property schema to extract required fields
3. Filter properties based on usage frequency
4. Return simplified structure without nested collections

**Example Output**:
```json
{
  "nodeType": "nodes-base.httpRequest",
  "displayName": "HTTP Request",
  "requiredProperties": [{
    "name": "url",
    "type": "string",
    "description": "The URL to make the request to",
    "placeholder": "https://api.example.com/endpoint"
  }],
  "commonProperties": [
    {
      "name": "method",
      "type": "options",
      "options": ["GET", "POST", "PUT", "DELETE"],
      "default": "GET"
    },
    {
      "name": "authentication",
      "type": "options",
      "options": ["none", "basicAuth", "bearerToken"],
      "default": "none"
    }
  ],
  "examples": {
    "minimal": { "url": "https://api.example.com/data" },
    "common": {
      "method": "POST",
      "url": "https://api.example.com/create",
      "sendBody": true,
      "contentType": "json",
      "jsonBody": "{ \"name\": \"example\" }"
    }
  }
}
```

### 1.2 Enhanced Tool Descriptions

Update all existing tool descriptions based on testing feedback to be more concise and action-oriented.

### 1.3 Common Examples Database

Create JSON configuration examples for the top 20 most-used nodes, stored in `src/data/node-examples.json`.

## Phase 2: Enhanced Capabilities

### 2.1 search_node_properties Tool

**Purpose**: Find specific properties within a node without parsing everything

**Implementation**:
```typescript
interface SearchNodePropertiesInput {
  nodeType: string;
  query: string;  // Keyword to search for
  category?: 'authentication' | 'request' | 'response' | 'advanced';
}

interface SearchNodePropertiesOutput {
  query: string;
  matches: PropertyMatch[];
  totalMatches: number;
}

interface PropertyMatch {
  name: string;
  type: string;
  path: string;  // Dot notation path
  description: string;
  visibleWhen?: Record<string, any>;
  category: string;
}
```

**Technical Approach**:
1. Parse property schema recursively
2. Build searchable index of all properties
3. Include visibility conditions
4. Return flattened results with paths

### 2.2 get_node_for_task Tool

**Purpose**: Return pre-configured property sets for common tasks

**Implementation**:
```typescript
interface GetNodeForTaskInput {
  task: string;  // e.g., "post_json_request", "call_api_with_auth"
  nodeType?: string;  // Optional, can infer from task
}

interface GetNodeForTaskOutput {
  task: string;
  description: string;
  nodeType: string;
  configuration: object;
  userMustProvide: Array<{
    property: string;
    description: string;
  }>;
  optionalEnhancements: Array<{
    property: string;
    description: string;
  }>;
}
```

**Task Templates** (stored in `src/data/task-templates.json`):
- `get_api_data` - Simple GET request
- `post_json_request` - POST with JSON body
- `call_api_with_auth` - Authenticated API call
- `webhook_receiver` - Accept incoming webhooks
- `database_query` - Query a database
- `send_email` - Send an email
- `process_file` - Read and process files

### 2.3 validate_node_config Tool

**Purpose**: Validate configurations before use, catch errors early

**Implementation**:
```typescript
interface ValidateNodeConfigInput {
  nodeType: string;
  config: object;
}

interface ValidateNodeConfigOutput {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: string[];
  hiddenProperties: string[];  // Properties not visible with current config
  autofix?: object;  // Suggested fixes
}
```

**Validation Rules**:
1. Check required properties
2. Validate property types
3. Check property dependencies
4. Suggest common missing configurations
5. Warn about potential issues

### 2.4 Property Parsing Service

Create `src/services/property-parser.ts` to:
1. Parse nested property structures
2. Flatten collections to dot notation
3. Extract visibility conditions
4. Categorize properties (essential/common/advanced)
5. Build property dependency graph

## Phase 3: Full Optimization

### 3.1 Database Schema Migration

**New Tables**:
```sql
-- Property-level storage
CREATE TABLE node_properties_v2 (
  id INTEGER PRIMARY KEY,
  node_type TEXT NOT NULL,
  property_name TEXT NOT NULL,
  property_path TEXT NOT NULL,  -- Dot notation path
  property_type TEXT NOT NULL,
  is_required BOOLEAN DEFAULT 0,
  is_essential BOOLEAN DEFAULT 0,
  is_common BOOLEAN DEFAULT 0,
  category TEXT,  -- authentication, request, response, advanced
  parent_property TEXT,
  display_conditions TEXT,  -- JSON conditions
  description TEXT,
  default_value TEXT,
  options TEXT,  -- JSON array for select fields
  placeholder TEXT,
  usage_frequency INTEGER DEFAULT 0,
  UNIQUE(node_type, property_path)
);

-- Task templates
CREATE TABLE task_templates (
  id INTEGER PRIMARY KEY,
  task_name TEXT UNIQUE NOT NULL,
  description TEXT,
  node_type TEXT NOT NULL,
  configuration TEXT NOT NULL,  -- JSON
  user_must_provide TEXT,  -- JSON array
  optional_enhancements TEXT  -- JSON array
);

-- Property dependencies
CREATE TABLE property_dependencies (
  id INTEGER PRIMARY KEY,
  node_type TEXT NOT NULL,
  property_name TEXT NOT NULL,
  depends_on_property TEXT NOT NULL,
  depends_on_value TEXT,
  dependency_type TEXT  -- enables, requires, conflicts
);

-- Common examples
CREATE TABLE node_examples (
  id INTEGER PRIMARY KEY,
  node_type TEXT NOT NULL,
  example_name TEXT NOT NULL,
  description TEXT,
  configuration TEXT NOT NULL,  -- JSON
  category TEXT,
  UNIQUE(node_type, example_name)
);
```

### 3.2 Migration Process

1. **Data Extraction Script** (`scripts/migrate-properties.ts`):
   - Parse existing property schemas
   - Extract individual properties with metadata
   - Deduplicate properties with conditions
   - Populate new tables

2. **Backward Compatibility**:
   - Keep existing tables and tools
   - Add feature flag for new tools
   - Gradual migration over 2 weeks

### 3.3 Advanced Tools

**get_property_dependencies**:
```typescript
interface GetPropertyDependenciesInput {
  nodeType: string;
  property: string;
}

interface GetPropertyDependenciesOutput {
  property: string;
  requires: Record<string, any>;
  enables: string[];
  conflicts: string[];
  requiredChain: string[];  // Step-by-step to enable
  alternatives: Array<{
    description: string;
    properties: object;
  }>;
}
```

**get_node_compatibility**:
```typescript
// Check which nodes work well together
interface GetNodeCompatibilityInput {
  sourceNode: string;
  targetNode: string;
}
```

## Implementation Timeline

### Week 1: Foundation
- [ ] Implement get_node_essentials with hardcoded essentials
- [ ] Create examples database for top 10 nodes
- [ ] Deploy updated tool descriptions
- [ ] Test with HTTP Request and Webhook nodes

### Week 2: Expand Coverage
- [ ] Add essentials for 20 more nodes
- [ ] Implement basic property search
- [ ] Create 5 task templates
- [ ] Add validation for common errors

### Week 3: Enhanced Features
- [ ] Build property parser service
- [ ] Implement get_node_for_task
- [ ] Add validate_node_config
- [ ] Create property categorization

### Week 4: Testing & Refinement
- [ ] Load test with complex nodes
- [ ] Refine essential property lists
- [ ] Add more task templates
- [ ] Gather user feedback

### Month 2: Full Migration
- [ ] Design new database schema
- [ ] Build migration scripts
- [ ] Implement property deduplication
- [ ] Add dependency tracking
- [ ] Deploy progressively

## Testing Strategy

### Unit Tests
- Property parser accuracy
- Essential property extraction
- Validation rule correctness
- Task template validity

### Integration Tests
- Tool response times (<100ms)
- Data size reduction (>90%)
- Backward compatibility
- Error handling

### User Testing
- Time to configure nodes
- Error rates
- Task completion success
- AI agent performance

## Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Average properties returned | 200+ | 15 | get_node_essentials response |
| Response size | 100KB+ | <5KB | JSON byte count |
| Time to configure node | 5-10 min | <1 min | User testing |
| Configuration errors | 40% | <10% | Validation logs |
| AI token usage | High | -75% | Token counter |
| Tool calls per task | 5-10 | 2-3 | Usage analytics |

## Risk Mitigation

### Technical Risks
1. **Property Parsing Complexity**
   - Mitigation: Start with simple nodes, handle edge cases gradually
   - Fallback: Return original schema if parsing fails

2. **Performance Impact**
   - Mitigation: Cache parsed properties, use indexes
   - Monitor: Response times, add performance tests

3. **Data Quality**
   - Mitigation: Validate all transformations
   - Test: Compare outputs with original data

### Compatibility Risks
1. **Breaking Changes**
   - Mitigation: New tools alongside old ones
   - Deprecation: 3-month warning period

2. **Schema Evolution**
   - Mitigation: Version property schemas
   - Handle: Multiple n8n versions

## Configuration Management

### Essential Properties Lists

Store in `src/data/essential-properties.json`:
```json
{
  "nodes-base.httpRequest": {
    "required": ["url"],
    "common": ["method", "authentication", "sendBody", "contentType"],
    "categories": {
      "authentication": ["authentication", "genericAuthType", "nodeCredentialType"],
      "request": ["sendBody", "contentType", "jsonBody", "bodyParameters"],
      "headers": ["sendHeaders", "headerParameters"],
      "advanced": ["options.timeout", "options.proxy", "options.redirect"]
    }
  }
}
```

### Feature Flags

```typescript
const FEATURES = {
  USE_NODE_ESSENTIALS: process.env.USE_NODE_ESSENTIALS !== 'false',
  ENABLE_PROPERTY_SEARCH: process.env.ENABLE_PROPERTY_SEARCH === 'true',
  USE_NEW_SCHEMA: process.env.USE_NEW_SCHEMA === 'true'
};
```

## Next Steps

1. **Immediate Actions**:
   - Create essential properties list for HTTP Request node
   - Implement get_node_essentials tool
   - Test with real AI agents
   - Gather feedback

2. **Week 1 Deliverables**:
   - Working get_node_essentials for top 10 nodes
   - Basic examples database
   - Performance benchmarks
   - User feedback collection

3. **Success Criteria**:
   - 90% reduction in data size
   - 75% reduction in configuration time
   - Positive AI agent feedback
   - No regression in functionality

## Conclusion

This implementation strategy transforms the n8n MCP from a complex documentation server into an AI-friendly configuration assistant. By focusing on progressive disclosure and task-oriented access patterns, we can reduce complexity by 95% while actually improving functionality. The phased approach ensures we deliver value quickly while building toward a fully optimized solution.

The key insight: **AI agents need just enough information at the right time, not everything at once**. This strategy delivers exactly that.