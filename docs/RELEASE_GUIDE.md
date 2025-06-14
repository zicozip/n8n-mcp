# Release Guide

This guide explains how to create releases for n8n-MCP and how Docker tags are managed.

## Version Tag Strategy

When you create a Git tag starting with `v`, the GitHub Actions workflow automatically builds and pushes Docker images with the following tags:

### Example: Creating Release v1.2.3

```bash
# Create and push a version tag
git tag -a v1.2.3 -m "Release version 1.2.3"
git push origin v1.2.3
```

This will automatically create the following Docker tags:
- `ghcr.io/czlonkowski/n8n-mcp:1.2.3` (exact version)
- `ghcr.io/czlonkowski/n8n-mcp:1.2` (minor version)
- `ghcr.io/czlonkowski/n8n-mcp:1` (major version)
- `ghcr.io/czlonkowski/n8n-mcp:latest` (if from main branch)

## Tag Types Explained

### Latest Tag
- **When**: Every push to main branch
- **Usage**: Default tag for users who want the latest stable version
- **Example**: `docker pull ghcr.io/czlonkowski/n8n-mcp:latest`

### Version Tags
- **When**: When you create a Git tag like `v1.2.3`
- **Usage**: Users who want a specific version
- **Example**: `docker pull ghcr.io/czlonkowski/n8n-mcp:1.2.3`

### Branch Tags
- **When**: Every push to a branch
- **Usage**: Testing specific branches
- **Example**: `docker pull ghcr.io/czlonkowski/n8n-mcp:main`

### SHA Tags
- **When**: Every commit
- **Usage**: Debugging specific commits
- **Example**: `docker pull ghcr.io/czlonkowski/n8n-mcp:main-abc123`

## Release Process

### 1. Prepare Release
```bash
# Update version in package.json
npm version patch  # or minor/major

# Update CHANGELOG.md
echo "## v1.2.3 - $(date +%Y-%m-%d)" >> CHANGELOG.md
echo "- Feature: Added X" >> CHANGELOG.md
echo "- Fix: Fixed Y" >> CHANGELOG.md

# Commit changes
git add -A
git commit -m "chore: prepare release v1.2.3"
git push origin main
```

### 2. Create Release Tag
```bash
# Create annotated tag
git tag -a v1.2.3 -m "Release v1.2.3

- Feature: Added X
- Fix: Fixed Y"

# Push tag to trigger Docker build
git push origin v1.2.3
```

### 3. Create GitHub Release
```bash
# Using GitHub CLI
gh release create v1.2.3 \
  --title "Release v1.2.3" \
  --notes "See CHANGELOG.md for details" \
  --latest
```

### 4. Verify Docker Images
```bash
# Wait for GitHub Actions to complete, then verify
docker pull ghcr.io/czlonkowski/n8n-mcp:1.2.3
docker pull ghcr.io/czlonkowski/n8n-mcp:latest

# Test the new version
docker run --rm ghcr.io/czlonkowski/n8n-mcp:1.2.3 --version
```

## Semantic Versioning

Follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (1.0.0 → 2.0.0): Breaking changes
- **MINOR** (1.0.0 → 1.1.0): New features, backwards compatible
- **PATCH** (1.0.0 → 1.0.1): Bug fixes, backwards compatible

### Examples:
- Breaking API change → v2.0.0
- New MCP tool added → v1.1.0
- Bug fix in parser → v1.0.1

## Pre-releases

For testing releases:
```bash
# Create pre-release tag
git tag -a v1.2.3-beta.1 -m "Beta release"
git push origin v1.2.3-beta.1
```

This creates:
- `ghcr.io/czlonkowski/n8n-mcp:1.2.3-beta.1`

## Docker Compose Updates

When releasing, update documentation to reference specific versions:

```yaml
# Stable version (recommended for production)
services:
  n8n-mcp:
    image: ghcr.io/czlonkowski/n8n-mcp:1.2

# Latest version (for testing)
services:
  n8n-mcp:
    image: ghcr.io/czlonkowski/n8n-mcp:latest
```

## Best Practices

1. **Always test** before creating a release tag
2. **Update documentation** to reference new versions
3. **Use annotated tags** (`-a` flag) with descriptive messages
4. **Follow semver** for version numbers
5. **Update CHANGELOG.md** with every release

## Rollback Process

If a release has issues:

```bash
# Users can pin to previous version
docker pull ghcr.io/czlonkowski/n8n-mcp:1.1.0

# Or use minor version for automatic patches
docker pull ghcr.io/czlonkowski/n8n-mcp:1.1
```

## Checking Available Tags

```bash
# Using Docker Hub API (for public registries)
curl -s https://ghcr.io/v2/czlonkowski/n8n-mcp/tags/list

# Or check GitHub packages page
# https://github.com/czlonkowski/n8n-mcp/pkgs/container/n8n-mcp
```