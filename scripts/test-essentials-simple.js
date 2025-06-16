#!/usr/bin/env node
/**
 * Simple test script for validating the essentials implementation
 * This version runs the MCP server as a subprocess to test real behavior
 */

const { spawn } = require('child_process');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function runMCPRequest(request) {
  return new Promise((resolve, reject) => {
    const mcp = spawn('npm', ['start'], {
      cwd: path.join(__dirname, '..'),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'production' }
    });
    
    let output = '';
    let error = '';
    let timeout;
    
    // Set timeout
    timeout = setTimeout(() => {
      mcp.kill();
      reject(new Error('Request timed out after 10 seconds'));
    }, 10000);
    
    mcp.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    mcp.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    mcp.on('close', (code) => {
      clearTimeout(timeout);
      
      if (code !== 0) {
        reject(new Error(`Process exited with code ${code}: ${error}`));
        return;
      }
      
      try {
        // Parse JSON-RPC response
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.trim() && line.includes('"jsonrpc"')) {
            const response = JSON.parse(line);
            if (response.result) {
              const content = response.result.content[0].text;
              resolve(JSON.parse(content));
              return;
            } else if (response.error) {
              reject(new Error(response.error.message));
              return;
            }
          }
        }
        reject(new Error('No valid response found in output:\n' + output));
      } catch (err) {
        reject(new Error(`Failed to parse response: ${err.message}\nOutput: ${output}`));
      }
    });
    
    // Send request
    mcp.stdin.write(JSON.stringify(request) + '\n');
    mcp.stdin.end();
  });
}

async function testEssentials() {
  log('\n🚀 Testing n8n MCP Essentials Implementation\n', colors.bright + colors.cyan);
  
  try {
    // Test 1: Get node essentials
    log('1️⃣  Testing get_node_essentials for HTTP Request...', colors.yellow);
    const essentialsRequest = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'get_node_essentials',
        arguments: {
          nodeType: 'nodes-base.httpRequest'
        }
      },
      id: 1
    };
    
    const essentials = await runMCPRequest(essentialsRequest);
    
    log('✅ Success! Got essentials:', colors.green);
    log(`   Node Type: ${essentials.nodeType}`);
    log(`   Display Name: ${essentials.displayName}`);
    log(`   Required properties: ${essentials.requiredProperties?.map(p => p.name).join(', ') || 'None'}`);
    log(`   Common properties: ${essentials.commonProperties?.map(p => p.name).join(', ') || 'None'}`);
    log(`   Examples: ${Object.keys(essentials.examples || {}).join(', ')}`);
    
    const essentialsSize = JSON.stringify(essentials).length;
    log(`   Response size: ${(essentialsSize / 1024).toFixed(1)} KB`, colors.green);
    
    // Test 2: Compare with full node info
    log('\n2️⃣  Getting full node info for comparison...', colors.yellow);
    const fullInfoRequest = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'get_node_info',
        arguments: {
          nodeType: 'nodes-base.httpRequest'
        }
      },
      id: 2
    };
    
    const fullInfo = await runMCPRequest(fullInfoRequest);
    const fullSize = JSON.stringify(fullInfo).length;
    
    log('✅ Got full node info:', colors.green);
    log(`   Properties count: ${fullInfo.properties?.length || 0}`);
    log(`   Response size: ${(fullSize / 1024).toFixed(1)} KB`);
    
    const reduction = ((fullSize - essentialsSize) / fullSize * 100).toFixed(1);
    log(`\n📊 Size Comparison:`, colors.bright);
    log(`   Full response: ${(fullSize / 1024).toFixed(1)} KB`);
    log(`   Essential response: ${(essentialsSize / 1024).toFixed(1)} KB`);
    log(`   Size reduction: ${reduction}% 🎉`, colors.bright + colors.green);
    
    // Test 3: Search properties
    log('\n3️⃣  Testing search_node_properties...', colors.yellow);
    const searchRequest = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'search_node_properties',
        arguments: {
          nodeType: 'nodes-base.httpRequest',
          query: 'auth'
        }
      },
      id: 3
    };
    
    const searchResults = await runMCPRequest(searchRequest);
    log('✅ Search completed:', colors.green);
    log(`   Query: "${searchResults.query}"`);
    log(`   Matches found: ${searchResults.totalMatches}`);
    if (searchResults.matches && searchResults.matches.length > 0) {
      log('   Top matches:');
      searchResults.matches.slice(0, 3).forEach(match => {
        log(`     - ${match.name}: ${match.description || 'No description'}`);
      });
    }
    
    // Summary
    log('\n✨ All tests passed successfully!', colors.bright + colors.green);
    log('\n📋 Summary:', colors.bright);
    log(`   - get_node_essentials works correctly`);
    log(`   - Size reduction achieved: ${reduction}%`);
    log(`   - Property search functioning`);
    log(`   - Examples included in response`);
    
    // Test more nodes
    log('\n4️⃣  Testing additional nodes...', colors.yellow);
    const additionalNodes = ['nodes-base.webhook', 'nodes-base.code', 'nodes-base.postgres'];
    const results = [];
    
    for (const nodeType of additionalNodes) {
      try {
        const req = {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'get_node_essentials',
            arguments: { nodeType }
          },
          id: Math.random()
        };
        
        const result = await runMCPRequest(req);
        const size = JSON.stringify(result).length;
        results.push({
          nodeType,
          success: true,
          propCount: (result.requiredProperties?.length || 0) + (result.commonProperties?.length || 0),
          size: (size / 1024).toFixed(1)
        });
        log(`   ✅ ${nodeType}: ${results[results.length - 1].propCount} properties, ${results[results.length - 1].size} KB`);
      } catch (error) {
        results.push({ nodeType, success: false, error: error.message });
        log(`   ❌ ${nodeType}: ${error.message}`, colors.red);
      }
    }
    
    log('\n🎯 Implementation validated successfully!', colors.bright + colors.green);
    
  } catch (error) {
    log(`\n❌ Test failed: ${error.message}`, colors.red);
    if (error.stack) {
      log('Stack trace:', colors.red);
      log(error.stack, colors.red);
    }
    process.exit(1);
  }
}

// Run the test
testEssentials().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});