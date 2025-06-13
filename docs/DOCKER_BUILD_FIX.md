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

## Changes Made

### Dockerfile Changes
```diff
- # Pre-initialize database during build
- RUN mkdir -p /app/data && npm run rebuild || echo "Database will be initialized at runtime"
+ # Build TypeScript only
+ RUN npm run build

- # Copy pre-built database if it exists
- COPY --from=builder /app/data/nodes.db ./data/nodes.db 2>/dev/null || true
+ # Create data directory
+ RUN mkdir -p /app/data

- RUN npm ci --only=production && \
+ RUN npm ci --omit=dev && \
     npm cache clean --force
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
✅ Docker build now succeeds
✅ Database initialization happens at container startup
✅ GitHub Actions workflow will work properly
✅ No manual intervention required

## Testing
```bash
# Build locally
docker build -t n8n-mcp:test .

# Run and verify
docker run -d --name test -e MCP_MODE=http -e AUTH_TOKEN=test -p 3000:3000 n8n-mcp:test
docker logs test
curl http://localhost:3000/health
```