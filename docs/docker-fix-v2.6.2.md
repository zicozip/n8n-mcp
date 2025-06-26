# Docker Fix for v2.6.2 - Missing Runtime Dependencies

## Issue
After v2.6.0, the Docker image started failing with:
```
Error: Cannot find module 'axios'
```

## Root Cause
In v2.6.0, we added n8n management tools that require:
- `axios` - For HTTP API calls to n8n instances
- `zod` - For workflow validation schemas

However, our ultra-optimized Docker image uses `package.runtime.json` which didn't include these new dependencies.

## Fix
Updated `package.runtime.json` to include:
```json
"axios": "^1.10.0",
"zod": "^3.25.32"
```

## Impact
- Docker image size increases slightly (~5MB) but remains much smaller than full n8n dependencies
- No changes needed to Dockerfile itself - just the runtime package list
- Users need to pull the latest Docker image after rebuild

## Prevention
When adding new features that require additional npm packages, always check:
1. Is the package needed at runtime?
2. If yes, add it to `package.runtime.json` for Docker builds
3. Test the Docker image before release