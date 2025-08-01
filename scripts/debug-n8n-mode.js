#!/usr/bin/env node

/**
 * Debug script for n8n integration issues
 * Tests MCP protocol compliance and identifies schema validation problems
 */

const http = require('http');
const crypto = require('crypto');

const MCP_PORT = process.env.MCP_PORT || 3001;
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'test-token-for-n8n-testing-minimum-32-chars';

console.log('🔍 Debugging n8n MCP Integration Issues');
console.log('=====================================\n');

// Test data for different MCP protocol calls
const testCases = [
  {
    name: 'MCP Initialize',
    path: '/mcp',
    method: 'POST',
    data: {
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {
          tools: {}
        },
        clientInfo: {
          name: 'n8n-debug-test',
          version: '1.0.0'
        }
      },
      id: 1
    }
  },
  {
    name: 'Tools List',
    path: '/mcp',
    method: 'POST',
    sessionId: null, // Will be set after initialize
    data: {
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
      id: 2
    }
  },
  {
    name: 'Tools Call - tools_documentation',
    path: '/mcp',
    method: 'POST',
    sessionId: null, // Will be set after initialize
    data: {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'tools_documentation',
        arguments: {}
      },
      id: 3
    }
  },
  {
    name: 'Tools Call - get_node_essentials',
    path: '/mcp',
    method: 'POST',
    sessionId: null, // Will be set after initialize
    data: {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'get_node_essentials',
        arguments: {
          nodeType: 'nodes-base.httpRequest'
        }
      },
      id: 4
    }
  }
];

async function makeRequest(testCase) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(testCase.data);
    
    const options = {
      hostname: 'localhost',
      port: MCP_PORT,
      path: testCase.path,
      method: testCase.method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Accept': 'application/json, text/event-stream' // Fix for StreamableHTTPServerTransport
      }
    };

    // Add session ID header if available
    if (testCase.sessionId) {
      options.headers['Mcp-Session-Id'] = testCase.sessionId;
    }

    console.log(`📤 Making request: ${testCase.name}`);
    console.log(`   Method: ${testCase.method} ${testCase.path}`);
    if (testCase.sessionId) {
      console.log(`   Session-ID: ${testCase.sessionId}`);
    }
    console.log(`   Data: ${data}`);

    const req = http.request(options, (res) => {
      let responseData = '';
      
      console.log(`📥 Response Status: ${res.statusCode}`);
      console.log(`   Headers:`, res.headers);

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          let parsed;
          
          // Handle SSE format response
          if (responseData.startsWith('event: message\ndata: ')) {
            const dataLine = responseData.split('\n').find(line => line.startsWith('data: '));
            if (dataLine) {
              const jsonData = dataLine.substring(6); // Remove 'data: '
              parsed = JSON.parse(jsonData);
            } else {
              throw new Error('Could not extract JSON from SSE response');
            }
          } else {
            parsed = JSON.parse(responseData);
          }
          
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: parsed,
            raw: responseData
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: null,
            raw: responseData,
            parseError: e.message
          });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(data);
    req.end();
  });
}

async function validateMCPResponse(testCase, response) {
  console.log(`✅ Validating response for: ${testCase.name}`);
  
  const issues = [];
  
  // Check HTTP status
  if (response.statusCode !== 200) {
    issues.push(`❌ Expected HTTP 200, got ${response.statusCode}`);
  }
  
  // Check JSON-RPC structure
  if (!response.data) {
    issues.push(`❌ Response is not valid JSON: ${response.parseError}`);
    return issues;
  }
  
  if (response.data.jsonrpc !== '2.0') {
    issues.push(`❌ Missing or invalid jsonrpc field: ${response.data.jsonrpc}`);
  }
  
  if (response.data.id !== testCase.data.id) {
    issues.push(`❌ ID mismatch: expected ${testCase.data.id}, got ${response.data.id}`);
  }
  
  // Method-specific validation
  if (testCase.data.method === 'initialize') {
    if (!response.data.result) {
      issues.push(`❌ Initialize response missing result field`);
    } else {
      if (!response.data.result.protocolVersion) {
        issues.push(`❌ Initialize response missing protocolVersion`);
      } else if (response.data.result.protocolVersion !== '2025-03-26') {
        issues.push(`❌ Protocol version mismatch: expected 2025-03-26, got ${response.data.result.protocolVersion}`);
      }
      
      if (!response.data.result.capabilities) {
        issues.push(`❌ Initialize response missing capabilities`);
      }
      
      if (!response.data.result.serverInfo) {
        issues.push(`❌ Initialize response missing serverInfo`);
      }
    }
    
    // Extract session ID for subsequent requests
    if (response.headers['mcp-session-id']) {
      console.log(`📋 Session ID: ${response.headers['mcp-session-id']}`);
      return { issues, sessionId: response.headers['mcp-session-id'] };
    } else {
      issues.push(`❌ Initialize response missing Mcp-Session-Id header`);
    }
  }
  
  if (testCase.data.method === 'tools/list') {
    if (!response.data.result || !response.data.result.tools) {
      issues.push(`❌ Tools list response missing tools array`);
    } else {
      console.log(`📋 Found ${response.data.result.tools.length} tools`);
    }
  }
  
  if (testCase.data.method === 'tools/call') {
    if (!response.data.result) {
      issues.push(`❌ Tool call response missing result field`);
    } else if (!response.data.result.content) {
      issues.push(`❌ Tool call response missing content array`);
    } else if (!Array.isArray(response.data.result.content)) {
      issues.push(`❌ Tool call response content is not an array`);
    } else {
      // Validate content structure
      for (let i = 0; i < response.data.result.content.length; i++) {
        const content = response.data.result.content[i];
        if (!content.type) {
          issues.push(`❌ Content item ${i} missing type field`);
        }
        if (content.type === 'text' && !content.text) {
          issues.push(`❌ Text content item ${i} missing text field`);
        }
      }
    }
  }
  
  if (issues.length === 0) {
    console.log(`✅ ${testCase.name} validation passed`);
  } else {
    console.log(`❌ ${testCase.name} validation failed:`);
    issues.forEach(issue => console.log(`   ${issue}`));
  }
  
  return { issues };
}

async function runTests() {
  console.log('Starting MCP protocol compliance tests...\n');
  
  let sessionId = null;
  let allIssues = [];
  
  for (const testCase of testCases) {
    try {
      // Set session ID from previous test
      if (sessionId && testCase.name !== 'MCP Initialize') {
        testCase.sessionId = sessionId;
      }
      
      const response = await makeRequest(testCase);
      console.log(`📄 Raw Response: ${response.raw}\n`);
      
      const validation = await validateMCPResponse(testCase, response);
      
      if (validation.sessionId) {
        sessionId = validation.sessionId;
      }
      
      allIssues.push(...validation.issues);
      
      console.log('─'.repeat(50));
      
    } catch (error) {
      console.error(`❌ Request failed for ${testCase.name}:`, error.message);
      allIssues.push(`Request failed for ${testCase.name}: ${error.message}`);
    }
  }
  
  // Summary
  console.log('\n📊 SUMMARY');
  console.log('==========');
  
  if (allIssues.length === 0) {
    console.log('🎉 All tests passed! MCP protocol compliance looks good.');
  } else {
    console.log(`❌ Found ${allIssues.length} issues:`);
    allIssues.forEach((issue, i) => {
      console.log(`   ${i + 1}. ${issue}`);
    });
  }
  
  console.log('\n🔍 Recommendations:');
  console.log('1. Check MCP server logs at /tmp/mcp-server.log');
  console.log('2. Verify protocol version consistency (should be 2025-03-26)');
  console.log('3. Ensure tool schemas match MCP specification exactly');
  console.log('4. Test with actual n8n MCP Client Tool node');
}

// Check if MCP server is running
console.log(`Checking if MCP server is running at localhost:${MCP_PORT}...`);

const healthCheck = http.get(`http://localhost:${MCP_PORT}/health`, (res) => {
  if (res.statusCode === 200) {
    console.log('✅ MCP server is running\n');
    runTests().catch(console.error);
  } else {
    console.error('❌ MCP server health check failed:', res.statusCode);
    process.exit(1);
  }
}).on('error', (err) => {
  console.error('❌ MCP server is not running. Please start it first:', err.message);
  console.error('Use: npm run start:n8n');
  process.exit(1);
});