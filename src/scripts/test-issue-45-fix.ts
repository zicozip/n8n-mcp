#!/usr/bin/env node
/**
 * Test for Issue #45 Fix: Partial Update Tool Validation/Execution Discrepancy
 * 
 * This test verifies that the cleanWorkflowForUpdate function no longer adds
 * default settings to workflows during updates, which was causing the n8n API
 * to reject requests with "settings must NOT have additional properties".
 */

import { config } from 'dotenv';
import { logger } from '../utils/logger';
import { cleanWorkflowForUpdate, cleanWorkflowForCreate } from '../services/n8n-validation';
import { Workflow } from '../types/n8n-api';

// Load environment variables
config();

function testCleanWorkflowFunctions() {
  logger.info('Testing Issue #45 Fix: cleanWorkflowForUpdate should not add default settings\n');
  
  // Test 1: cleanWorkflowForUpdate with workflow without settings
  logger.info('=== Test 1: cleanWorkflowForUpdate without settings ===');
  const workflowWithoutSettings: Workflow = {
    id: 'test-123',
    name: 'Test Workflow',
    nodes: [],
    connections: {},
    active: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    versionId: 'version-123'
  };
  
  const cleanedUpdate = cleanWorkflowForUpdate(workflowWithoutSettings);
  
  if ('settings' in cleanedUpdate) {
    logger.error('❌ FAIL: cleanWorkflowForUpdate added settings when it should not have');
    logger.error('   Found settings:', JSON.stringify(cleanedUpdate.settings));
  } else {
    logger.info('✅ PASS: cleanWorkflowForUpdate did not add settings');
  }
  
  // Test 2: cleanWorkflowForUpdate with existing settings
  logger.info('\n=== Test 2: cleanWorkflowForUpdate with existing settings ===');
  const workflowWithSettings: Workflow = {
    ...workflowWithoutSettings,
    settings: {
      executionOrder: 'v1',
      saveDataErrorExecution: 'none',
      saveDataSuccessExecution: 'none',
      saveManualExecutions: false,
      saveExecutionProgress: false
    }
  };
  
  const cleanedUpdate2 = cleanWorkflowForUpdate(workflowWithSettings);
  
  if ('settings' in cleanedUpdate2) {
    const settingsMatch = JSON.stringify(cleanedUpdate2.settings) === JSON.stringify(workflowWithSettings.settings);
    if (settingsMatch) {
      logger.info('✅ PASS: cleanWorkflowForUpdate preserved existing settings without modification');
    } else {
      logger.error('❌ FAIL: cleanWorkflowForUpdate modified existing settings');
      logger.error('   Original:', JSON.stringify(workflowWithSettings.settings));
      logger.error('   Cleaned:', JSON.stringify(cleanedUpdate2.settings));
    }
  } else {
    logger.error('❌ FAIL: cleanWorkflowForUpdate removed existing settings');
  }
  
  // Test 3: cleanWorkflowForUpdate with partial settings
  logger.info('\n=== Test 3: cleanWorkflowForUpdate with partial settings ===');
  const workflowWithPartialSettings: Workflow = {
    ...workflowWithoutSettings,
    settings: {
      executionOrder: 'v1'
      // Missing other default properties
    }
  };
  
  const cleanedUpdate3 = cleanWorkflowForUpdate(workflowWithPartialSettings);
  
  if ('settings' in cleanedUpdate3) {
    const settingsKeys = cleanedUpdate3.settings ? Object.keys(cleanedUpdate3.settings) : [];
    const hasOnlyExecutionOrder = settingsKeys.length === 1 && 
                                 cleanedUpdate3.settings?.executionOrder === 'v1';
    if (hasOnlyExecutionOrder) {
      logger.info('✅ PASS: cleanWorkflowForUpdate preserved partial settings without adding defaults');
    } else {
      logger.error('❌ FAIL: cleanWorkflowForUpdate added default properties to partial settings');
      logger.error('   Original keys:', Object.keys(workflowWithPartialSettings.settings || {}));
      logger.error('   Cleaned keys:', settingsKeys);
    }
  } else {
    logger.error('❌ FAIL: cleanWorkflowForUpdate removed partial settings');
  }
  
  // Test 4: Verify cleanWorkflowForCreate still adds defaults
  logger.info('\n=== Test 4: cleanWorkflowForCreate should add default settings ===');
  const newWorkflow = {
    name: 'New Workflow',
    nodes: [],
    connections: {}
  };
  
  const cleanedCreate = cleanWorkflowForCreate(newWorkflow);
  
  if ('settings' in cleanedCreate && cleanedCreate.settings) {
    const hasDefaults = 
      cleanedCreate.settings.executionOrder === 'v1' &&
      cleanedCreate.settings.saveDataErrorExecution === 'all' &&
      cleanedCreate.settings.saveDataSuccessExecution === 'all' &&
      cleanedCreate.settings.saveManualExecutions === true &&
      cleanedCreate.settings.saveExecutionProgress === true;
    
    if (hasDefaults) {
      logger.info('✅ PASS: cleanWorkflowForCreate correctly adds default settings');
    } else {
      logger.error('❌ FAIL: cleanWorkflowForCreate added settings but not with correct defaults');
      logger.error('   Settings:', JSON.stringify(cleanedCreate.settings));
    }
  } else {
    logger.error('❌ FAIL: cleanWorkflowForCreate did not add default settings');
  }
  
  // Test 5: Verify read-only fields are removed
  logger.info('\n=== Test 5: cleanWorkflowForUpdate removes read-only fields ===');
  const workflowWithReadOnly: any = {
    ...workflowWithoutSettings,
    staticData: { some: 'data' },
    pinData: { node1: 'data' },
    tags: ['tag1', 'tag2'],
    isArchived: true,
    usedCredentials: ['cred1'],
    sharedWithProjects: ['proj1'],
    triggerCount: 5,
    shared: true,
    active: true
  };
  
  const cleanedReadOnly = cleanWorkflowForUpdate(workflowWithReadOnly);
  
  const removedFields = [
    'id', 'createdAt', 'updatedAt', 'versionId', 'meta',
    'staticData', 'pinData', 'tags', 'isArchived', 
    'usedCredentials', 'sharedWithProjects', 'triggerCount', 
    'shared', 'active'
  ];
  
  const hasRemovedFields = removedFields.some(field => field in cleanedReadOnly);
  
  if (!hasRemovedFields) {
    logger.info('✅ PASS: cleanWorkflowForUpdate correctly removed all read-only fields');
  } else {
    const foundFields = removedFields.filter(field => field in cleanedReadOnly);
    logger.error('❌ FAIL: cleanWorkflowForUpdate did not remove these fields:', foundFields);
  }
  
  logger.info('\n=== Test Summary ===');
  logger.info('All tests completed. The fix ensures that cleanWorkflowForUpdate only removes fields');
  logger.info('without adding default settings, preventing the n8n API validation error.');
}

// Run the tests
testCleanWorkflowFunctions();