/**
 * Example test demonstrating test environment configuration usage
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { 
  getTestConfig, 
  getTestTimeout, 
  isFeatureEnabled,
  isTestMode 
} from '@tests/setup/test-env';
import {
  withEnvOverrides,
  createTestDatabasePath,
  getMockApiUrl,
  measurePerformance,
  createTestLogger,
  waitForCondition
} from '@tests/helpers/env-helpers';

describe('Test Environment Configuration Example', () => {
  let config: ReturnType<typeof getTestConfig>;
  let logger: ReturnType<typeof createTestLogger>;
  
  beforeAll(() => {
    // Initialize config inside beforeAll to ensure environment is loaded
    config = getTestConfig();
    logger = createTestLogger('test-env-example');
    
    logger.info('Test suite starting with configuration:', {
      environment: config.nodeEnv,
      database: config.database.path,
      apiUrl: config.api.url
    });
  });
  
  afterAll(() => {
    logger.info('Test suite completed');
  });
  
  it('should be in test mode', () => {
    const testConfig = getTestConfig();
    expect(isTestMode()).toBe(true);
    expect(testConfig.nodeEnv).toBe('test');
    expect(testConfig.isTest).toBe(true);
  });
  
  it('should have proper database configuration', () => {
    const testConfig = getTestConfig();
    expect(testConfig.database.path).toBeDefined();
    expect(testConfig.database.rebuildOnStart).toBe(false);
    expect(testConfig.database.seedData).toBe(true);
  });
  
  it('should have mock API configuration', () => {
    const testConfig = getTestConfig();
    expect(testConfig.api.url).toMatch(/mock-api/);
    expect(testConfig.api.key).toBe('test-api-key-12345');
  });
  
  it('should respect test timeouts', { timeout: getTestTimeout('unit') }, async () => {
    const timeout = getTestTimeout('unit');
    expect(timeout).toBe(5000);
    
    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 100));
  });
  
  it('should support environment overrides', () => {
    const testConfig = getTestConfig();
    const originalLogLevel = testConfig.logging.level;
    
    const result = withEnvOverrides({
      LOG_LEVEL: 'debug',
      DEBUG: 'true'
    }, () => {
      const newConfig = getTestConfig();
      expect(newConfig.logging.level).toBe('debug');
      expect(newConfig.logging.debug).toBe(true);
      return 'success';
    });
    
    expect(result).toBe('success');
    const configAfter = getTestConfig();
    expect(configAfter.logging.level).toBe(originalLogLevel);
  });
  
  it('should generate unique test database paths', () => {
    const path1 = createTestDatabasePath('feature1');
    const path2 = createTestDatabasePath('feature1');
    
    if (path1 !== ':memory:') {
      expect(path1).not.toBe(path2);
      expect(path1).toMatch(/test-feature1-\d+-\w+\.db$/);
    }
  });
  
  it('should construct mock API URLs', () => {
    const testConfig = getTestConfig();
    const baseUrl = getMockApiUrl();
    const endpointUrl = getMockApiUrl('/nodes');
    
    expect(baseUrl).toBe(testConfig.api.url);
    expect(endpointUrl).toBe(`${testConfig.api.url}/nodes`);
  });
  
  it.skipIf(!isFeatureEnabled('mockExternalApis'))('should check feature flags', () => {
    const testConfig = getTestConfig();
    expect(testConfig.features.mockExternalApis).toBe(true);
    expect(isFeatureEnabled('mockExternalApis')).toBe(true);
  });
  
  it('should measure performance', async () => {
    const measure = measurePerformance('test-operation');
    
    // Simulate some work
    measure.mark('start-processing');
    await new Promise(resolve => setTimeout(resolve, 50));
    measure.mark('mid-processing');
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const results = measure.end();
    
    expect(results.total).toBeGreaterThan(100);
    expect(results.marks['start-processing']).toBeLessThan(results.marks['mid-processing']);
  });
  
  it('should wait for conditions', async () => {
    let counter = 0;
    const incrementCounter = setInterval(() => counter++, 100);
    
    try {
      await waitForCondition(
        () => counter >= 3,
        { 
          timeout: 1000, 
          interval: 50,
          message: 'Counter did not reach 3'
        }
      );
      
      expect(counter).toBeGreaterThanOrEqual(3);
    } finally {
      clearInterval(incrementCounter);
    }
  });
  
  it('should have proper logging configuration', () => {
    const testConfig = getTestConfig();
    expect(testConfig.logging.level).toBe('error');
    expect(testConfig.logging.debug).toBe(false);
    expect(testConfig.logging.showStack).toBe(true);
    
    // Logger should respect configuration
    logger.debug('This should not appear in test output');
    logger.error('This should appear in test output');
  });
  
  it('should have performance thresholds', () => {
    const testConfig = getTestConfig();
    expect(testConfig.performance.thresholds.apiResponse).toBe(100);
    expect(testConfig.performance.thresholds.dbQuery).toBe(50);
    expect(testConfig.performance.thresholds.nodeParse).toBe(200);
  });
  
  it('should disable caching and rate limiting in tests', () => {
    const testConfig = getTestConfig();
    expect(testConfig.cache.enabled).toBe(false);
    expect(testConfig.cache.ttl).toBe(0);
    expect(testConfig.rateLimiting.max).toBe(0);
    expect(testConfig.rateLimiting.window).toBe(0);
  });
  
  it('should configure test paths', () => {
    const testConfig = getTestConfig();
    expect(testConfig.paths.fixtures).toBe('./tests/fixtures');
    expect(testConfig.paths.data).toBe('./tests/data');
    expect(testConfig.paths.snapshots).toBe('./tests/__snapshots__');
  });
  
  it('should support MSW configuration', () => {
    const testConfig = getTestConfig();
    expect(testConfig.mocking.msw.enabled).toBe(true);
    expect(testConfig.mocking.msw.apiDelay).toBe(0);
  });
});