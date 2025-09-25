#!/usr/bin/env npx tsx
/**
 * Test script for telemetry integration
 * Verifies that telemetry data can be sent to Supabase
 */

import { telemetry } from '../src/telemetry';
import { WorkflowSanitizer } from '../src/telemetry/workflow-sanitizer';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testTelemetryIntegration() {
  console.log('🧪 Testing Telemetry Integration with Supabase\n');

  // Check environment variables
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env file');
    process.exit(1);
  }

  console.log('✅ Environment variables configured');
  console.log(`   Supabase URL: ${supabaseUrl}`);
  console.log(`   Anon Key: ${supabaseKey.substring(0, 20)}...`);

  // Test 1: Track tool usage
  console.log('\n📊 Test 1: Tracking tool usage...');
  telemetry.trackToolUsage('search_nodes', true, 1250);
  telemetry.trackToolUsage('get_node_info', true, 850);
  telemetry.trackToolUsage('validate_workflow', false, 2000);
  console.log('   ✓ Tool usage events queued');

  // Test 2: Track errors
  console.log('\n🐛 Test 2: Tracking errors...');
  telemetry.trackError('ValidationError', 'workflow_validation', 'validate_workflow');
  telemetry.trackError('NetworkError', 'api_call', 'n8n_create_workflow');
  console.log('   ✓ Error events queued');

  // Test 3: Track workflow creation
  console.log('\n🔧 Test 3: Tracking workflow creation...');
  const testWorkflow = {
    name: 'Test Workflow',
    nodes: [
      {
        id: '1',
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        position: [100, 100],
        parameters: {
          path: 'test-webhook',
          webhookUrl: 'https://n8n.example.com/webhook/abc-123-def',
          method: 'POST',
          authentication: 'none'
        },
        credentials: {
          webhookAuth: {
            id: 'cred-123',
            name: 'My Webhook Auth'
          }
        }
      },
      {
        id: '2',
        name: 'HTTP Request',
        type: 'n8n-nodes-base.httpRequest',
        position: [300, 100],
        parameters: {
          url: 'https://api.example.com/endpoint',
          method: 'POST',
          authentication: 'genericCredentialType',
          genericAuthType: 'httpHeaderAuth',
          httpHeaders: {
            parameters: [
              {
                name: 'Authorization',
                value: 'Bearer sk-1234567890abcdef1234567890abcdef'
              }
            ]
          },
          options: {
            timeout: 10000
          }
        }
      },
      {
        id: '3',
        name: 'Slack',
        type: 'n8n-nodes-base.slack',
        position: [500, 100],
        parameters: {
          channel: 'general',
          text: 'Message sent!',
          authentication: 'accessToken'
        },
        credentials: {
          slackApi: {
            id: 'cred-456',
            name: 'My Slack'
          }
        }
      }
    ],
    connections: {
      '1': {
        main: [[{ node: '2', type: 'main', index: 0 }]]
      },
      '2': {
        main: [[{ node: '3', type: 'main', index: 0 }]]
      }
    },
    settings: {
      errorWorkflow: 'error-workflow-id',
      saveDataErrorExecution: 'all',
      saveDataSuccessExecution: 'none',
      saveExecutionProgress: true,
      saveManualExecutions: true,
      timezone: 'America/New_York'
    },
    staticData: { some: 'data' },
    pinData: { node1: 'pinned' },
    ownedBy: 'user-123',
    createdBy: 'user-123',
    updatedBy: 'user-456'
  };

  // Track successful workflow
  await telemetry.trackWorkflowCreation(testWorkflow, true);
  console.log('   ✓ Workflow creation tracked');

  // Test workflow sanitization
  console.log('\n🔒 Test 4: Verifying workflow sanitization...');
  const sanitized = WorkflowSanitizer.sanitizeWorkflow(testWorkflow);

  // Verify sensitive data was removed
  const sanitizedStr = JSON.stringify(sanitized);
  const hasSensitiveData =
    sanitizedStr.includes('sk-1234567890abcdef') ||
    sanitizedStr.includes('cred-123') ||
    sanitizedStr.includes('cred-456') ||
    sanitizedStr.includes('user-123');

  if (hasSensitiveData) {
    console.error('   ❌ Sensitive data found in sanitized workflow!');
  } else {
    console.log('   ✓ All sensitive data removed');
  }

  console.log('   ✓ Workflow hash:', sanitized.workflowHash);
  console.log('   ✓ Node count:', sanitized.nodeCount);
  console.log('   ✓ Node types:', sanitized.nodeTypes);
  console.log('   ✓ Complexity:', sanitized.complexity);

  // Test 5: Track session start
  console.log('\n🚀 Test 5: Tracking session start...');
  telemetry.trackSessionStart();
  console.log('   ✓ Session start tracked');

  // Flush all events
  console.log('\n💾 Flushing telemetry data to Supabase...');
  await telemetry.flush();
  console.log('   ✓ Data flushed to Supabase');

  // Test 6: Verify data in Supabase
  console.log('\n🔍 Test 6: Verifying data in Supabase...');
  console.log('   Please check your Supabase dashboard to verify:');
  console.log('   - telemetry_events table has new records');
  console.log('   - telemetry_workflows table has the test workflow');
  console.log('   - Views show aggregated data');
  console.log('\n   Dashboard URL: https://supabase.com/dashboard/project/ydyufsohxdfpopqbubwk/editor');

  console.log('\n✨ Telemetry integration test completed!');
}

// Run the test
testTelemetryIntegration().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});