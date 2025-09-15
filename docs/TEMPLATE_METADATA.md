# Template Metadata Generation

This document describes the template metadata generation system introduced in n8n-MCP v2.10.0, which uses OpenAI's batch API to automatically analyze and categorize workflow templates.

## Overview

The template metadata system analyzes n8n workflow templates to extract structured information about their purpose, complexity, requirements, and target audience. This enables intelligent template discovery through advanced filtering capabilities.

## Architecture

### Components

1. **MetadataGenerator** (`src/templates/metadata-generator.ts`)
   - Interfaces with OpenAI API
   - Generates structured metadata using JSON schemas
   - Provides fallback defaults for error cases

2. **BatchProcessor** (`src/templates/batch-processor.ts`)
   - Manages OpenAI batch API operations
   - Handles parallel batch submission
   - Monitors batch status and retrieves results

3. **Template Repository** (`src/templates/template-repository.ts`)
   - Stores metadata in SQLite database
   - Provides advanced search capabilities
   - Supports JSON extraction queries

## Metadata Schema

Each template's metadata contains:

```typescript
{
  categories: string[]           // Max 5 categories (e.g., "automation", "integration")
  complexity: "simple" | "medium" | "complex"
  use_cases: string[]           // Max 5 primary use cases
  estimated_setup_minutes: number // 5-480 minutes
  required_services: string[]    // External services needed
  key_features: string[]        // Max 5 main capabilities
  target_audience: string[]     // Max 3 target user types
}
```

## Generation Process

### 1. Initial Setup

```bash
# Set OpenAI API key in .env
OPENAI_API_KEY=your-api-key-here
```

### 2. Generate Metadata for Existing Templates

```bash
# Generate metadata only (no template fetching)
npm run fetch:templates -- --metadata-only

# Generate metadata during update
npm run fetch:templates -- --mode=update --generate-metadata
```

### 3. Batch Processing

The system uses OpenAI's batch API for cost-effective processing:

- **50% cost reduction** compared to synchronous API calls
- **24-hour processing window** for batch completion
- **Parallel batch submission** for faster processing
- **Automatic retry** for failed items

### Configuration Options

Environment variables:
- `OPENAI_API_KEY`: Required for metadata generation
- `OPENAI_MODEL`: Model to use (default: "gpt-4o-mini")
- `OPENAI_BATCH_SIZE`: Templates per batch (default: 100, max: 500)
- `METADATA_LIMIT`: Limit templates to process (for testing)

## How It Works

### 1. Template Analysis

For each template, the generator analyzes:
- Template name and description
- Node types and their frequency
- Workflow structure and connections
- Overall complexity

### 2. Node Summarization

Nodes are grouped into categories:
- HTTP/Webhooks
- Database operations
- Communication (Slack, Email)
- AI/ML operations
- Spreadsheets
- Service-specific nodes

### 3. Metadata Generation

The AI model receives:
```
Template: [name]
Description: [description]
Nodes Used (X): [summarized node list]
Workflow has X nodes with Y connections
```

And generates structured metadata following the JSON schema.

### 4. Storage and Indexing

Metadata is stored as JSON in SQLite and indexed for fast querying:

```sql
-- Example query for simple automation templates
SELECT * FROM templates 
WHERE json_extract(metadata, '$.complexity') = 'simple'
AND json_extract(metadata, '$.categories') LIKE '%automation%'
```

## MCP Tool Integration

### search_templates_by_metadata

Advanced filtering tool with multiple parameters:

```typescript
search_templates_by_metadata({
  category: "automation",           // Filter by category
  complexity: "simple",             // Skill level
  maxSetupMinutes: 30,             // Time constraint
  targetAudience: "marketers",     // Role-based
  requiredService: "slack"         // Service dependency
})
```

### list_templates

Enhanced to include metadata:

```typescript
list_templates({
  includeMetadata: true,  // Include full metadata
  limit: 20,
  offset: 0
})
```

## Usage Examples

### Finding Beginner-Friendly Templates

```typescript
const templates = await search_templates_by_metadata({
  complexity: "simple",
  maxSetupMinutes: 15
});
```

### Role-Specific Templates

```typescript
const marketingTemplates = await search_templates_by_metadata({
  targetAudience: "marketers",
  category: "communication"
});
```

### Service Integration Templates

```typescript
const openaiTemplates = await search_templates_by_metadata({
  requiredService: "openai",
  complexity: "medium"
});
```

## Performance Metrics

- **Coverage**: 97.5% of templates have metadata (2,534/2,598)
- **Generation Time**: ~2-4 hours for full database (using batch API)
- **Query Performance**: <100ms for metadata searches
- **Storage Overhead**: ~2MB additional database size

## Troubleshooting

### Common Issues

1. **Batch Processing Stuck**
   - Check batch status: The API provides status updates
   - Batches auto-expire after 24 hours
   - Monitor using the batch ID in logs

2. **Missing Metadata**
   - ~2.5% of templates may fail metadata generation
   - Fallback defaults are provided
   - Can regenerate with `--metadata-only` flag

3. **API Rate Limits**
   - Batch API has generous limits (50,000 requests/batch)
   - Cost is 50% of synchronous API
   - Processing happens within 24-hour window

### Monitoring Batch Status

```bash
# Check current batch status (if logged)
curl https://api.openai.com/v1/batches/[batch-id] \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

## Cost Analysis

### Batch API Pricing (gpt-4o-mini)

- Input: $0.075 per 1M tokens (50% of standard)
- Output: $0.30 per 1M tokens (50% of standard)
- Average template: ~300 input tokens, ~200 output tokens
- Total cost for 2,500 templates: ~$0.50

### Comparison with Synchronous API

- Synchronous cost: ~$1.00 for same volume
- Time saved: Parallel processing vs sequential
- Reliability: Automatic retries included

## Future Enhancements

### Planned Improvements

1. **Incremental Updates**
   - Only generate metadata for new templates
   - Track metadata version for updates

2. **Enhanced Analysis**
   - Workflow complexity scoring
   - Dependency graph analysis
   - Performance impact estimates

3. **User Feedback Loop**
   - Collect accuracy feedback
   - Refine categorization over time
   - Community-driven corrections

4. **Alternative Models**
   - Support for local LLMs
   - Claude API integration
   - Configurable model selection

## Implementation Details

### Database Schema

```sql
-- Metadata stored as JSON column
ALTER TABLE templates ADD COLUMN metadata TEXT;

-- Indexes for common queries
CREATE INDEX idx_templates_complexity ON templates(
  json_extract(metadata, '$.complexity')
);
CREATE INDEX idx_templates_setup_time ON templates(
  json_extract(metadata, '$.estimated_setup_minutes')
);
```

### Error Handling

The system provides robust error handling:

1. **API Failures**: Fallback to default metadata
2. **Parsing Errors**: Logged with template ID
3. **Batch Failures**: Individual item retry
4. **Validation Errors**: Zod schema enforcement

## Maintenance

### Regenerating Metadata

```bash
# Full regeneration (caution: costs ~$0.50)
npm run fetch:templates -- --mode=rebuild --generate-metadata

# Partial regeneration (templates without metadata)
npm run fetch:templates -- --metadata-only
```

### Database Backup

```bash
# Backup before regeneration
cp data/nodes.db data/nodes.db.backup

# Restore if needed
cp data/nodes.db.backup data/nodes.db
```

## Security Considerations

1. **API Key Management**
   - Store in `.env` file (gitignored)
   - Never commit API keys
   - Use environment variables in CI/CD

2. **Data Privacy**
   - Only template structure is sent to API
   - No user data or credentials included
   - Processing happens in OpenAI's secure environment

## Conclusion

The template metadata system transforms template discovery from simple text search to intelligent, multi-dimensional filtering. By leveraging OpenAI's batch API, we achieve cost-effective, scalable metadata generation that significantly improves the user experience for finding relevant workflow templates.