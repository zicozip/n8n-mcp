/**
 * Test to verify that onSessionCreated event is fired during standard initialize flow
 * This test addresses the bug reported in v2.19.0 where the event was not fired
 * for sessions created during the initialize request.
 */

import { SingleSessionHTTPServer } from '../../../src/http-server-single-session';
import { InstanceContext } from '../../../src/types/instance-context';

// Mock environment setup
process.env.AUTH_TOKEN = 'test-token-for-n8n-testing-minimum-32-chars';
process.env.NODE_ENV = 'test';
process.env.PORT = '3456'; // Use different port to avoid conflicts

async function testOnSessionCreatedEvent() {
  console.log('\n🧪 Test: onSessionCreated Event Firing During Initialize\n');
  console.log('━'.repeat(60));

  let eventFired = false;
  let capturedSessionId: string | undefined;
  let capturedContext: InstanceContext | undefined;

  // Create server with onSessionCreated handler
  const server = new SingleSessionHTTPServer({
    sessionEvents: {
      onSessionCreated: async (sessionId: string, instanceContext?: InstanceContext) => {
        console.log('✅ onSessionCreated event fired!');
        console.log(`   Session ID: ${sessionId}`);
        console.log(`   Context: ${instanceContext ? 'Present' : 'Not provided'}`);
        eventFired = true;
        capturedSessionId = sessionId;
        capturedContext = instanceContext;
      }
    }
  });

  try {
    // Start the HTTP server
    console.log('\n📡 Starting HTTP server...');
    await server.start();
    console.log('✅ Server started\n');

    // Wait a moment for server to be ready
    await new Promise(resolve => setTimeout(resolve, 500));

    // Simulate an MCP initialize request
    console.log('📤 Simulating MCP initialize request...');

    const port = parseInt(process.env.PORT || '3456');
    const fetch = (await import('node-fetch')).default;

    const response = await fetch(`http://localhost:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token-for-n8n-testing-minimum-32-chars',
        'Accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0'
          }
        },
        id: 1
      })
    });

    const result = await response.json() as any;

    console.log('📥 Response received:', response.status);
    console.log('   Response body:', JSON.stringify(result, null, 2));

    // Wait a moment for event to be processed
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify results
    console.log('\n🔍 Verification:');
    console.log('━'.repeat(60));

    if (eventFired) {
      console.log('✅ SUCCESS: onSessionCreated event was fired');
      console.log(`   Captured Session ID: ${capturedSessionId}`);
      console.log(`   Context provided: ${capturedContext !== undefined}`);

      // Verify session is in active sessions list
      const activeSessions = server.getActiveSessions();
      console.log(`\n📊 Active sessions count: ${activeSessions.length}`);

      if (activeSessions.length > 0) {
        console.log('✅ Session registered in active sessions list');
        console.log(`   Session IDs: ${activeSessions.join(', ')}`);
      } else {
        console.log('❌ No active sessions found');
      }

      // Check if captured session ID is in active sessions
      if (capturedSessionId && activeSessions.includes(capturedSessionId)) {
        console.log('✅ Event session ID matches active session');
      } else {
        console.log('⚠️  Event session ID not found in active sessions');
      }

      console.log('\n🎉 TEST PASSED: Bug is fixed!');
      console.log('━'.repeat(60));

    } else {
      console.log('❌ FAILURE: onSessionCreated event was NOT fired');
      console.log('━'.repeat(60));
      console.log('\n💔 TEST FAILED: Bug still exists');
    }

    // Cleanup
    await server.shutdown();

    return eventFired;

  } catch (error) {
    console.error('\n❌ Test error:', error);
    await server.shutdown();
    return false;
  }
}

// Run the test
testOnSessionCreatedEvent()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
