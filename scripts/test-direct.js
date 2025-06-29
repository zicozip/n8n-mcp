#!/usr/bin/env node
/**
 * Direct test of the server functionality without MCP protocol
 */

const { N8NDocumentationMCPServer } = require('../dist/mcp/server');

async function testDirect() {
  console.log('🧪 Direct server test\n');
  
  try {
    // Initialize server
    console.log('Initializing server...');
    const server = new N8NDocumentationMCPServer();
    
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('Server initialized successfully\n');
    
    // Test get_node_essentials
    console.log('Testing get_node_essentials...');
    try {
      const result = await server.executeTool('get_node_essentials', {
        nodeType: 'nodes-base.httpRequest'
      });
      
      console.log('✅ Success!');
      console.log('Result type:', typeof result);
      console.log('Result keys:', Object.keys(result || {}));
      console.log('Node type:', result?.nodeType);
      console.log('Required props:', result?.requiredProperties?.length || 0);
      console.log('Common props:', result?.commonProperties?.length || 0);
      console.log('Has examples:', !!result?.examples);
      
      // Check sizes
      const size = JSON.stringify(result).length;
      console.log(`\nResponse size: ${(size / 1024).toFixed(1)} KB`);
      
    } catch (error) {
      console.error('❌ Error executing get_node_essentials:', error);
      console.error('Error stack:', error.stack);
    }
    
    // Test search_node_properties
    console.log('\n\nTesting search_node_properties...');
    try {
      const result = await server.executeTool('search_node_properties', {
        nodeType: 'nodes-base.httpRequest',
        query: 'auth'
      });
      
      console.log('✅ Success!');
      console.log('Matches found:', result?.totalMatches || 0);
      console.log('First match:', result?.matches?.[0]?.name);
      
    } catch (error) {
      console.error('❌ Error executing search_node_properties:', error);
    }
    
    // Test get_node_info for comparison
    console.log('\n\nTesting get_node_info for comparison...');
    try {
      const result = await server.executeTool('get_node_info', {
        nodeType: 'nodes-base.httpRequest'
      });
      
      const size = JSON.stringify(result).length;
      console.log('✅ Success!');
      console.log(`Full node info size: ${(size / 1024).toFixed(1)} KB`);
      console.log('Properties count:', result?.properties?.length || 0);
      
    } catch (error) {
      console.error('❌ Error executing get_node_info:', error);
    }
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
  
  console.log('\n✨ Direct test completed');
  process.exit(0);
}

// Run the test
testDirect().catch(console.error);