# Docker Optimization Guide

This guide explains the optimized Docker build that reduces image size from 2.61GB to ~200MB.

## What's Different?

### Original Build
- **Size**: 2.61GB
- **Database**: Built at container startup
- **Dependencies**: Full n8n ecosystem included
- **Startup**: Slower (builds database)
- **Memory**: Higher usage

### Optimized Build
- **Size**: ~200MB (90% reduction!)
- **Database**: Pre-built at Docker build time
- **Dependencies**: Minimal runtime only
- **Startup**: Fast (database ready)
- **Memory**: Lower usage

## How It Works

1. **Build Time**: Extracts all node information and source code
2. **Database**: Complete SQLite database with embedded source code
3. **Runtime**: Only needs MCP server and SQLite libraries

## Quick Start

### Using Docker Compose

```bash
# Create .env file
echo "AUTH_TOKEN=$(openssl rand -base64 32)" > .env

# Build and run optimized version
docker compose -f docker-compose.optimized.yml up -d

# Check health
curl http://localhost:3000/health
```

### Using Docker Directly

```bash
# Build optimized image
docker build -f Dockerfile.optimized -t n8n-mcp:optimized .

# Run it
docker run -d \
  --name n8n-mcp-slim \
  -e MCP_MODE=http \
  -e AUTH_TOKEN=your-token \
  -p 3000:3000 \
  n8n-mcp:optimized
```

## Feature Comparison

| Feature | Original | Optimized |
|---------|----------|-----------|
| List nodes | ✅ | ✅ |
| Search nodes | ✅ | ✅ |
| Get node info | ✅ | ✅ |
| Get source code | ✅ | ✅ |
| Extract new nodes | ✅ | ❌ |
| Rebuild database | ✅ | ❌ |
| HTTP mode | ✅ | ✅ |
| Stdio mode | ✅ | ✅ |

## Limitations

### No Runtime Extraction
The optimized build cannot:
- Extract source from new nodes at runtime
- Rebuild the database inside the container
- Scan for custom nodes

### Static Database
- Database is built at Docker image build time
- To update nodes, rebuild the Docker image
- Custom nodes must be present during build

## When to Use Each Version

### Use Original When:
- You need to dynamically scan for nodes
- You're developing custom nodes
- You need to rebuild database at runtime
- Image size is not a concern

### Use Optimized When:
- Production deployments
- Resource-constrained environments
- Fast startup is important
- You want minimal attack surface

## Testing the Optimized Build

Run the test script:
```bash
./scripts/test-optimized-docker.sh
```

This will:
- Build the optimized image
- Check image size
- Test stdio mode
- Test HTTP mode
- Compare with original

## Building for Production

### Multi-architecture Build
```bash
# Build for multiple platforms
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f Dockerfile.optimized \
  -t ghcr.io/yourusername/n8n-mcp:optimized \
  --push \
  .
```

### CI/CD Integration
```yaml
# GitHub Actions example
- name: Build optimized image
  uses: docker/build-push-action@v5
  with:
    context: .
    file: ./Dockerfile.optimized
    platforms: linux/amd64,linux/arm64
    push: true
    tags: |
      ghcr.io/${{ github.repository }}:optimized
      ghcr.io/${{ github.repository }}:slim
```

## Troubleshooting

### Database Not Found
```
ERROR: Pre-built database not found at /app/data/nodes.db
```
**Solution**: The database must be built during Docker build. Ensure build completes successfully.

### Missing Source Code
If `get_node_source` returns empty:
- Check build logs for extraction errors
- Verify n8n packages were available during build
- Rebuild image with verbose logging

### Tool Not Working
Some tools are disabled in optimized build:
- `rebuild_documentation_database` - Not available
- `list_available_nodes` - Uses database, not filesystem

## Performance Metrics

### Startup Time
- Original: ~10-30 seconds (builds database)
- Optimized: ~1-2 seconds (database ready)

### Memory Usage
- Original: ~150-200MB
- Optimized: ~50-80MB

### Image Size
- Original: 2.61GB
- Optimized: ~200MB

## Future Improvements

1. **Compression**: Compress source code in database
2. **Lazy Loading**: Load source code on demand
3. **Incremental Updates**: Support partial database updates
4. **Cache Layer**: Better Docker layer caching

## Migration Path

1. **Test**: Run optimized version alongside original
2. **Validate**: Ensure all required features work
3. **Deploy**: Gradually roll out to production
4. **Monitor**: Track performance improvements

## Summary

The optimized Docker build is ideal for production deployments where:
- Image size matters
- Fast startup is required
- Resource usage should be minimal
- Node set is stable

For development or dynamic environments, continue using the original build.