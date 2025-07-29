#!/bin/bash
# Emergency script to run tests without coverage in CI if hanging persists

echo "Running tests without coverage to diagnose hanging issue..."
FEATURE_TEST_COVERAGE=false vitest run --reporter=default --reporter=junit

echo "Tests completed. If this works but regular test:ci hangs, the issue is coverage-related."