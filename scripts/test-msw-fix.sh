#!/bin/bash

echo "Testing MSW fix to prevent hanging in CI..."
echo "========================================"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Run unit tests (should not load MSW)
echo -e "\n${YELLOW}Test 1: Running unit tests (without MSW)...${NC}"
if npm run test:unit -- --run --reporter=verbose tests/unit/services/property-filter.test.ts; then
  echo -e "${GREEN}✓ Unit tests passed without MSW${NC}"
else
  echo -e "${RED}✗ Unit tests failed${NC}"
  exit 1
fi

# Test 2: Run integration test that uses MSW
echo -e "\n${YELLOW}Test 2: Running integration test with MSW...${NC}"
if npm run test:integration -- --run --reporter=verbose tests/integration/msw-setup.test.ts; then
  echo -e "${GREEN}✓ Integration tests passed with MSW${NC}"
else
  echo -e "${RED}✗ Integration tests failed${NC}"
  exit 1
fi

# Test 3: Check that process exits cleanly
echo -e "\n${YELLOW}Test 3: Testing clean process exit...${NC}"
timeout 30s npm run test:unit -- --run tests/unit/services/property-filter.test.ts
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo -e "${GREEN}✓ Process exited cleanly${NC}"
else
  if [ $EXIT_CODE -eq 124 ]; then
    echo -e "${RED}✗ Process timed out (hanging detected)${NC}"
    exit 1
  else
    echo -e "${RED}✗ Process exited with code $EXIT_CODE${NC}"
    exit 1
  fi
fi

echo -e "\n${GREEN}All tests passed! MSW fix is working correctly.${NC}"
echo "The fix prevents MSW from being loaded globally, which was causing hanging in CI."