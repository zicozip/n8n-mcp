import { beforeEach, afterEach, vi } from 'vitest';
import { loadTestEnvironment, getTestConfig, getTestTimeout } from './test-env';

// Load test environment configuration
loadTestEnvironment();

// Get test configuration
const testConfig = getTestConfig();

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});

// Clean up after each test
afterEach(() => {
  vi.restoreAllMocks();
  
  // Perform cleanup if enabled
  if (testConfig.cleanup.enabled) {
    // Add cleanup logic here if needed
  }
});

// Global test timeout from configuration
vi.setConfig({ testTimeout: getTestTimeout('global') });

// Configure console output based on test configuration
if (!testConfig.logging.debug) {
  global.console = {
    ...console,
    log: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: testConfig.logging.level === 'error' ? vi.fn() : console.warn,
    error: console.error, // Always show errors
  };
}

// Set up performance monitoring if enabled
if (testConfig.performance) {
  global.performance = global.performance || {
    now: () => Date.now(),
    mark: vi.fn(),
    measure: vi.fn(),
    getEntriesByName: vi.fn(() => []),
    getEntriesByType: vi.fn(() => []),
    clearMarks: vi.fn(),
    clearMeasures: vi.fn(),
  } as any;
}

// Export test configuration for use in tests
export { testConfig, getTestTimeout, getTestConfig };