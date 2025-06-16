#!/usr/bin/env node

const { spawn } = require('child_process');

// Start the MCP server
const server = spawn('node', ['dist/mcp/index.js'], {
  env: {
    ...process.env,
    MCP_MODE: 'stdio',
    LOG_LEVEL: 'error',
    DISABLE_CONSOLE_OUTPUT: 'true'
  },
  stdio: ['pipe', 'pipe', 'inherit']
});

// Send list_tools request
const request = {
  jsonrpc: "2.0",
  method: "tools/list",
  id: 1
};

server.stdin.write(JSON.stringify(request) + '\n');

// Collect response
let responseData = '';
server.stdout.on('data', (data) => {
  responseData += data.toString();
  
  // Try to parse each line
  const lines = responseData.split('\n');
  for (const line of lines) {
    if (line.trim()) {
      try {
        const response = JSON.parse(line);
        if (response.result && response.result.tools) {
          console.log('MCP Server Tools Report');
          console.log('======================');
          console.log(`Total tools: ${response.result.tools.length}`);
          console.log('\nTools list:');
          response.result.tools.forEach(tool => {
            console.log(`- ${tool.name}`);
          });
          
          // Check for specific tools
          const expectedTools = [
            'get_node_for_task',
            'validate_node_config', 
            'get_property_dependencies',
            'list_tasks',
            'search_node_properties',
            'get_node_essentials'
          ];
          
          console.log('\nNew tools check:');
          expectedTools.forEach(toolName => {
            const found = response.result.tools.find(t => t.name === toolName);
            console.log(`- ${toolName}: ${found ? '✅ Found' : '❌ Missing'}`);
          });
          
          server.kill();
          process.exit(0);
        }
      } catch (e) {
        // Not a complete JSON response yet
      }
    }
  }
});

// Timeout after 5 seconds
setTimeout(() => {
  console.error('Timeout: No response from MCP server');
  server.kill();
  process.exit(1);
}, 5000);

server.on('error', (err) => {
  console.error('Failed to start MCP server:', err);
  process.exit(1);
});