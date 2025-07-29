#!/bin/bash

# Test MSW setup for n8n-mcp
echo "Testing MSW (Mock Service Worker) setup..."
echo "========================================"

# Build the project first
echo "Building project..."
npm run build

# Run the MSW setup test
echo -e "\nRunning MSW setup verification test..."
npm test tests/integration/msw-setup.test.ts

# Check if test passed
if [ $? -eq 0 ]; then
    echo -e "\n✅ MSW setup is working correctly!"
    echo "You can now use MSW for mocking n8n API in your integration tests."
else
    echo -e "\n❌ MSW setup test failed. Please check the errors above."
    exit 1
fi