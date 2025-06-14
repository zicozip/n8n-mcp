# Docker Image Optimization Plan

## Current State Analysis

### Problems Identified:
1. **Image Size**: 2.61GB (way too large for an MCP server)
2. **Runtime Dependencies**: Includes entire n8n ecosystem (`n8n`, `n8n-core`, `n8n-workflow`, `@n8n/n8n-nodes-langchain`)
3. **Database Built at Runtime**: `docker-entrypoint.sh` runs `rebuild.js` on container start
4. **Runtime Node Extraction**: Several MCP tools try to extract node source code at runtime

### Root Cause:
The production `node_modules` includes massive n8n packages that are only needed for:
- Extracting node metadata during database build
- Source code extraction (which should be done at build time)

## Optimization Strategy

### Goal:
Reduce Docker image from 2.61GB to ~150-200MB by:
1. Building complete database at Docker build time
2. Including pre-extracted source code in database
3. Removing n8n dependencies from runtime image

## Implementation Plan

### Phase 1: Database Schema Enhancement

Modify `schema.sql` to store source code directly:
```sql
-- Add to nodes table
ALTER TABLE nodes ADD COLUMN node_source_code TEXT;
ALTER TABLE nodes ADD COLUMN credential_source_code TEXT;
ALTER TABLE nodes ADD COLUMN source_extracted_at INTEGER;
```

### Phase 2: Enhance Database Building

#### 2.1 Modify `rebuild.ts`:
- Extract and store node source code during build
- Extract and store credential source code
- Save all data that runtime tools need

#### 2.2 Create `build-time-extractor.ts`:
- Dedicated extractor for build-time use
- Extracts ALL information needed at runtime
- Stores in database for later retrieval

### Phase 3: Refactor Runtime Services

#### 3.1 Update `NodeDocumentationService`:
- Remove dependency on `NodeSourceExtractor` for runtime
- Read source code from database instead of filesystem
- Remove `ensureNodeDataAvailable` dynamic loading

#### 3.2 Modify MCP Tools:
- `get_node_source_code`: Read from database, not filesystem
- `list_available_nodes`: Query database, not scan packages
- `rebuild_documentation_database`: Remove or make it a no-op

### Phase 4: Dockerfile Optimization

```dockerfile
# Build stage - includes all n8n packages
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Database build stage - has n8n packages
FROM builder AS db-builder
WORKDIR /app
# Build complete database with all source code
RUN npm run rebuild

# Runtime stage - minimal dependencies
FROM node:20-alpine AS runtime
WORKDIR /app

# Only runtime dependencies (no n8n packages)
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && \
    npm uninstall n8n n8n-core n8n-workflow @n8n/n8n-nodes-langchain && \
    npm install @modelcontextprotocol/sdk better-sqlite3 express dotenv sql.js

# Copy built application
COPY --from=builder /app/dist ./dist

# Copy pre-built database
COPY --from=db-builder /app/data/nodes.db ./data/

# Copy minimal required files
COPY src/database/schema.sql ./src/database/
COPY .env.example ./
COPY docker/docker-entrypoint-optimized.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh
USER nodejs
EXPOSE 3000
HEALTHCHECK CMD curl -f http://localhost:3000/health || exit 1
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/mcp/index.js"]
```

### Phase 5: Runtime Adjustments

#### 5.1 Create `docker-entrypoint-optimized.sh`:
- Remove database building logic
- Only check if database exists
- Simple validation and startup

#### 5.2 Update `package.json`:
- Create separate `dependencies-runtime.json` for Docker
- Move n8n packages to `buildDependencies` section

## File Changes Required

### 1. Database Schema (`src/database/schema.sql`)
- Add source code columns
- Add extraction metadata

### 2. Rebuild Script (`src/scripts/rebuild.ts`)
- Extract and store source code during build
- Store all runtime-needed data

### 3. Node Repository (`src/database/node-repository.ts`)
- Add methods to save/retrieve source code
- Update data structures

### 4. MCP Server (`src/mcp/server.ts`)
- Modify `getNodeSourceCode` to use database
- Update `listAvailableNodes` to query database
- Remove/disable `rebuildDocumentationDatabase`

### 5. Node Documentation Service (`src/services/node-documentation-service.ts`)
- Remove runtime extractors
- Use database for all queries
- Simplify initialization

### 6. Docker Files
- Create optimized Dockerfile
- Create optimized entrypoint script
- Update docker-compose.yml

## Expected Results

### Before:
- Image size: 2.61GB
- Runtime deps: Full n8n ecosystem
- Startup: Slow (builds database)
- Memory: High usage

### After:
- Image size: ~150-200MB
- Runtime deps: Minimal (MCP + SQLite)
- Startup: Fast (pre-built database)
- Memory: Low usage

## Migration Strategy

1. **Keep existing functionality**: Current Docker setup continues to work
2. **Create new optimized version**: `Dockerfile.optimized`
3. **Test thoroughly**: Ensure all MCP tools work with pre-built database
4. **Gradual rollout**: Tag as `n8n-mcp:slim` initially
5. **Documentation**: Update guides for both versions

## Risks and Mitigations

### Risk 1: Dynamic Nodes
- **Issue**: New nodes added after build won't be available
- **Mitigation**: Document rebuild process, consider scheduled rebuilds

### Risk 2: Source Code Extraction
- **Issue**: Source code might be large
- **Mitigation**: Compress source code in database, lazy load if needed

### Risk 3: Compatibility
- **Issue**: Some tools expect runtime n8n access
- **Mitigation**: Careful testing, fallback mechanisms

## Success Metrics

1. ✅ Image size < 300MB
2. ✅ Container starts in < 5 seconds
3. ✅ All MCP tools functional
4. ✅ Memory usage < 100MB idle
5. ✅ No runtime dependency on n8n packages

## Implementation Order

1. **Database schema changes** (non-breaking)
2. **Enhanced rebuild script** (backward compatible)
3. **Runtime service refactoring** (feature flagged)
4. **Optimized Dockerfile** (separate file)
5. **Testing and validation**
6. **Documentation updates**
7. **Gradual rollout**