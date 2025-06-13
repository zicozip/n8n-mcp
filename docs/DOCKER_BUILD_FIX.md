# Docker Build Fix

## Issues Fixed

### 1. Database COPY Error
The Docker build was failing with:
```
ERROR: failed to solve: failed to compute cache key: failed to calculate checksum of ref: "/data/nodes.db": not found
```

### 2. Missing Dockerfile.nginx
```
ERROR: failed to solve: failed to read dockerfile: open Dockerfile.nginx: no such file or directory
```

### 3. npm ci Production Flag
```
ERROR: failed to solve: process "/bin/sh -c npm ci --only=production && npm cache clean --force" did not complete successfully: exit code: 1
```

### 4. Network Timeout in GitHub Actions
```
npm error network If you are behind a proxy, please make sure that the 'proxy' config is set properly
```
## Root Causes & Solutions

### 1. Invalid COPY Syntax
Docker's COPY command doesn't support shell operators like `2>/dev/null || true`.

**Solution**: Removed the problematic COPY command and created data directory with RUN.

### 2. Dockerfile.nginx Not Yet Implemented
The GitHub Actions workflow referenced `Dockerfile.nginx` which is a Phase 2 feature.

**Solution**: Commented out the nginx build job until Phase 2 implementation.

### 3. Deprecated npm Flag
The `--only=production` flag is deprecated in newer npm versions.

**Solution**: Changed to `--omit=dev` which is the current syntax.

### 4. Network Timeouts During npm Install
Installing production dependencies fresh was causing network timeouts in GitHub Actions.

**Solution**: 
- Added npm retry configuration for reliability
- Created separate stage for production dependencies
- Use `npm prune` instead of fresh install to avoid network issues
- Copy pre-pruned dependencies to runtime stage

## Changes Made

### Complete Dockerfile Optimization

1. **Added npm configuration for reliability**:
```dockerfile
RUN npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-timeout 300000
```

2. **Created separate production dependencies stage**:
```dockerfile
# Stage 2: Production Dependencies
FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package*.json ./
COPY --from=deps /app/node_modules ./node_modules
RUN npm prune --omit=dev
```

3. **Optimized runtime stage**:
```dockerfile
# Copy pre-pruned production dependencies
COPY --from=prod-deps /app/node_modules ./node_modules
# No need for npm install in runtime!
```
### GitHub Actions Workflow Changes
```diff
- name: Log in to GitHub Container Registry
+ if: github.event_name != 'pull_request'
  uses: docker/login-action@v3

# Commented out nginx build until Phase 2
- build-nginx:
-   name: Build nginx-enhanced Docker Image
+ # build-nginx:
+ #   name: Build nginx-enhanced Docker Image
```

## Result
✅ Docker build now succeeds without network timeouts
✅ Optimized build process with 4 stages
✅ Production dependencies are pruned efficiently
✅ Database initialization happens at container startup
✅ GitHub Actions workflow will work properly
✅ No manual intervention required

## Key Improvements
1. **Network Reliability**: Added npm retry configuration
2. **Build Efficiency**: Only hit npm registry once, then prune
3. **Stage Optimization**: 4 stages for clear separation of concerns
4. **No Redundant Installs**: Eliminated duplicate npm operations
5. **GitHub Actions Ready**: Added build optimizations

## Testing
```bash
# Build locally
docker build -t n8n-mcp:test .

# Run and verify
docker run -d --name test -e MCP_MODE=http -e AUTH_TOKEN=test -p 3000:3000 n8n-mcp:test
docker logs test
curl http://localhost:3000/health

# Check image size
docker images n8n-mcp:test
```

## Performance Impact
- Build time: Reduced by avoiding duplicate npm installs
- Network usage: Single npm ci instead of two
- Reliability: 5 retries with exponential backoff
- Cache efficiency: Better layer caching with separate stages