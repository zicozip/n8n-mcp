# Docker Build Fix

## Issue
The Docker build was failing with the error:
```
ERROR: failed to solve: failed to compute cache key: failed to calculate checksum of ref: "/data/nodes.db": not found
```

## Root Cause
The Dockerfile contained an invalid COPY command that tried to use shell operators:
```dockerfile
# This doesn't work in Docker
COPY --from=builder /app/data/nodes.db ./data/nodes.db 2>/dev/null || true
```

Docker's COPY command doesn't support shell operators like `2>/dev/null || true`.

## Solution
1. Removed the problematic COPY command
2. Created the data directory with RUN instead
3. Removed database pre-initialization from build stage
4. Database is now initialized at runtime by the entrypoint script

## Changes Made

### Dockerfile
```diff
- # Pre-initialize database during build
- RUN mkdir -p /app/data && npm run rebuild || echo "Database will be initialized at runtime"
+ # Build TypeScript only
+ RUN npm run build

- # Copy pre-built database if it exists
- COPY --from=builder /app/data/nodes.db ./data/nodes.db 2>/dev/null || true
+ # Create data directory
+ RUN mkdir -p /app/data
```

### GitHub Actions Workflow
Added conditional login to prevent failures on pull requests:
```diff
- name: Log in to GitHub Container Registry
+ if: github.event_name != 'pull_request'
  uses: docker/login-action@v3
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