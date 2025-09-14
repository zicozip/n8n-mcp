#!/bin/bash
# Script to publish n8n-mcp with runtime-only dependencies

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🚀 Preparing n8n-mcp for npm publish..."

# Run tests first to ensure quality
echo "🧪 Running tests..."
TEST_OUTPUT=$(npm test 2>&1)
TEST_EXIT_CODE=$?

# Check test results - look for actual test failures vs coverage issues
if echo "$TEST_OUTPUT" | grep -q "Tests.*failed"; then
    # Extract failed count using sed (portable)
    FAILED_COUNT=$(echo "$TEST_OUTPUT" | sed -n 's/.*Tests.*\([0-9]*\) failed.*/\1/p' | head -1)
    if [ "$FAILED_COUNT" != "0" ] && [ "$FAILED_COUNT" != "" ]; then
        echo -e "${RED}❌ $FAILED_COUNT test(s) failed. Aborting publish.${NC}"
        echo "$TEST_OUTPUT" | tail -20
        exit 1
    fi
fi

# If we got here, tests passed - check coverage
if echo "$TEST_OUTPUT" | grep -q "Coverage.*does not meet global threshold"; then
    echo -e "${YELLOW}⚠️  All tests passed but coverage is below threshold${NC}"
    echo -e "${YELLOW}   Consider improving test coverage before next release${NC}"
else
    echo -e "${GREEN}✅ All tests passed with good coverage!${NC}"
fi

# Sync version to runtime package first
echo "🔄 Syncing version to package.runtime.json..."
npm run sync:runtime-version

# Get version from main package.json
VERSION=$(node -e "console.log(require('./package.json').version)")
echo -e "${GREEN}📌 Version: $VERSION${NC}"

# Check if dist directory exists
if [ ! -d "dist" ]; then
    echo -e "${RED}❌ Error: dist directory not found. Run 'npm run build' first.${NC}"
    exit 1
fi

# Check if database exists
if [ ! -f "data/nodes.db" ]; then
    echo -e "${RED}❌ Error: data/nodes.db not found. Run 'npm run rebuild' first.${NC}"
    exit 1
fi

# Create a temporary publish directory
PUBLISH_DIR="npm-publish-temp"
rm -rf $PUBLISH_DIR
mkdir -p $PUBLISH_DIR

# Copy necessary files
echo "📦 Copying files..."
cp -r dist $PUBLISH_DIR/
cp -r data $PUBLISH_DIR/
cp README.md $PUBLISH_DIR/
cp LICENSE $PUBLISH_DIR/
cp .env.example $PUBLISH_DIR/
cp .npmignore $PUBLISH_DIR/ 2>/dev/null || true

# Use runtime package.json (already has correct version from sync)
echo "📋 Using runtime-only dependencies..."
cp package.runtime.json $PUBLISH_DIR/package.json

cd $PUBLISH_DIR

# Add required fields from main package.json
node -e "
const pkg = require('./package.json');
pkg.name = 'n8n-mcp';
pkg.description = 'Integration between n8n workflow automation and Model Context Protocol (MCP)';
pkg.bin = { 'n8n-mcp': './dist/mcp/index.js' };
pkg.repository = { type: 'git', url: 'git+https://github.com/czlonkowski/n8n-mcp.git' };
pkg.keywords = ['n8n', 'mcp', 'model-context-protocol', 'ai', 'workflow', 'automation'];
pkg.author = 'Romuald Czlonkowski @ www.aiadvisors.pl/en';
pkg.license = 'MIT';
pkg.bugs = { url: 'https://github.com/czlonkowski/n8n-mcp/issues' };
pkg.homepage = 'https://github.com/czlonkowski/n8n-mcp#readme';
pkg.files = ['dist/**/*', 'data/nodes.db', '.env.example', 'README.md', 'LICENSE'];
// Note: node_modules are automatically included for dependencies
delete pkg.private; // Remove private field so we can publish
require('fs').writeFileSync('./package.json', JSON.stringify(pkg, null, 2));
"

echo ""
echo "📋 Package details:"
echo -e "${GREEN}Name:${NC} $(node -e "console.log(require('./package.json').name)")"
echo -e "${GREEN}Version:${NC} $(node -e "console.log(require('./package.json').version)")"
echo -e "${GREEN}Size:${NC} ~50MB (vs 1GB+ with dev dependencies)"
echo -e "${GREEN}Runtime deps:${NC} 8 packages"

echo ""
echo "✅ Ready to publish!"
echo ""
echo -e "${YELLOW}⚠️  Important: npm publishing requires OTP authentication${NC}"
echo ""
echo "To publish, run:"
echo -e "  ${GREEN}cd $PUBLISH_DIR${NC}"
echo -e "  ${GREEN}npm publish --otp=YOUR_OTP_CODE${NC}"
echo ""
echo "After publishing, clean up with:"
echo -e "  ${GREEN}cd ..${NC}"
echo -e "  ${GREEN}rm -rf $PUBLISH_DIR${NC}"
echo ""
echo "📝 Notes:"
echo "  - Get your OTP from your authenticator app"
echo "  - The package will be available at https://www.npmjs.com/package/n8n-mcp"
echo "  - Users can run 'npx n8n-mcp' immediately after publish"