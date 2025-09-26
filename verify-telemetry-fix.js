#!/usr/bin/env node

/**
 * Verification script to test that telemetry permissions are fixed
 * Run this AFTER applying the GRANT permissions fix
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const TELEMETRY_BACKEND = {
  URL: 'https://ydyufsohxdfpopqbubwk.supabase.co',
  ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlkeXVmc29oeGRmcG9wcWJ1YndrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3OTYyMDAsImV4cCI6MjA3NDM3MjIwMH0.xESphg6h5ozaDsm4Vla3QnDJGc6Nc_cpfoqTHRynkCk'
};

async function verifyTelemetryFix() {
  console.log('🔍 VERIFYING TELEMETRY PERMISSIONS FIX');
  console.log('====================================\n');

  const supabase = createClient(TELEMETRY_BACKEND.URL, TELEMETRY_BACKEND.ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  });

  const testUserId = 'verify-' + crypto.randomBytes(4).toString('hex');

  // Test 1: Event insert
  console.log('📝 Test 1: Event insert');
  try {
    const { data, error } = await supabase
      .from('telemetry_events')
      .insert([{
        user_id: testUserId,
        event: 'verification_test',
        properties: { fixed: true }
      }]);

    if (error) {
      console.error('❌ Event insert failed:', error.message);
      return false;
    } else {
      console.log('✅ Event insert successful');
    }
  } catch (e) {
    console.error('❌ Event insert exception:', e.message);
    return false;
  }

  // Test 2: Workflow insert
  console.log('📝 Test 2: Workflow insert');
  try {
    const { data, error } = await supabase
      .from('telemetry_workflows')
      .insert([{
        user_id: testUserId,
        workflow_hash: 'verify-' + crypto.randomBytes(4).toString('hex'),
        node_count: 2,
        node_types: ['n8n-nodes-base.webhook', 'n8n-nodes-base.set'],
        has_trigger: true,
        has_webhook: true,
        complexity: 'simple',
        sanitized_workflow: {
          nodes: [{
            id: 'test-node',
            type: 'n8n-nodes-base.webhook',
            position: [100, 100],
            parameters: {}
          }],
          connections: {}
        }
      }]);

    if (error) {
      console.error('❌ Workflow insert failed:', error.message);
      return false;
    } else {
      console.log('✅ Workflow insert successful');
    }
  } catch (e) {
    console.error('❌ Workflow insert exception:', e.message);
    return false;
  }

  // Test 3: Upsert operation (like real telemetry)
  console.log('📝 Test 3: Upsert operation');
  try {
    const workflowHash = 'upsert-verify-' + crypto.randomBytes(4).toString('hex');

    const { data, error } = await supabase
      .from('telemetry_workflows')
      .upsert([{
        user_id: testUserId,
        workflow_hash: workflowHash,
        node_count: 3,
        node_types: ['n8n-nodes-base.webhook', 'n8n-nodes-base.set', 'n8n-nodes-base.if'],
        has_trigger: true,
        has_webhook: true,
        complexity: 'medium',
        sanitized_workflow: {
          nodes: [],
          connections: {}
        }
      }], {
        onConflict: 'workflow_hash',
        ignoreDuplicates: true,
      });

    if (error) {
      console.error('❌ Upsert failed:', error.message);
      return false;
    } else {
      console.log('✅ Upsert successful');
    }
  } catch (e) {
    console.error('❌ Upsert exception:', e.message);
    return false;
  }

  console.log('\n🎉 All tests passed! Telemetry permissions are fixed.');
  console.log('👍 Workflow telemetry should now work in the actual application.');

  return true;
}

async function main() {
  const success = await verifyTelemetryFix();
  process.exit(success ? 0 : 1);
}

main().catch(console.error);