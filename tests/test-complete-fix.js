#!/usr/bin/env node

const { NodeDocumentationService } = require('../dist/services/node-documentation-service');

async function testCompleteFix() {
  console.log('=== Testing Complete Documentation Fix ===\n');
  
  const service = new NodeDocumentationService('./data/test-nodes-v2.db');
  
  try {
    // First check if we have any nodes
    const existingNodes = await service.listNodes();
    console.log(`📊 Current database has ${existingNodes.length} nodes`);
    
    if (existingNodes.length === 0) {
      console.log('\n🔄 Rebuilding database with fixed documentation fetcher...');
      const stats = await service.rebuildDatabase();
      console.log(`\n✅ Rebuild complete:`);
      console.log(`   - Total nodes found: ${stats.total}`);
      console.log(`   - Successfully processed: ${stats.successful}`);
      console.log(`   - Failed: ${stats.failed}`);
      
      if (stats.errors.length > 0) {
        console.log('\n⚠️  Errors encountered:');
        stats.errors.slice(0, 5).forEach(err => console.log(`   - ${err}`));
      }
    }
    
    // Test specific nodes
    console.log('\n📋 Testing specific nodes:');
    
    const testNodes = ['slack', 'if', 'httpRequest', 'webhook'];
    
    for (const nodeName of testNodes) {
      const nodeInfo = await service.getNodeInfo(`n8n-nodes-base.${nodeName}`);
      
      if (nodeInfo) {
        console.log(`\n✅ ${nodeInfo.displayName || nodeName}:`);
        console.log(`   - Type: ${nodeInfo.nodeType}`);
        console.log(`   - Description: ${nodeInfo.description?.substring(0, 80)}...`);
        console.log(`   - Has source code: ${!!nodeInfo.sourceCode}`);
        console.log(`   - Has documentation: ${!!nodeInfo.documentation}`);
        console.log(`   - Documentation URL: ${nodeInfo.documentationUrl || 'N/A'}`);
        console.log(`   - Has example: ${!!nodeInfo.exampleWorkflow}`);
        console.log(`   - Category: ${nodeInfo.category || 'N/A'}`);
        
        // Check if it's getting the right documentation
        if (nodeInfo.documentation) {
          const isCredentialDoc = nodeInfo.documentation.includes('credentials') && 
                                !nodeInfo.documentation.includes('node documentation');
          console.log(`   - Is credential doc: ${isCredentialDoc} ${isCredentialDoc ? '❌' : '✅'}`);
        }
      } else {
        console.log(`\n❌ ${nodeName}: Not found in database`);
      }
    }
    
    // Test search functionality
    console.log('\n🔍 Testing search functionality:');
    
    const searchTests = [
      { query: 'webhook', label: 'Webhook nodes' },
      { query: 'http', label: 'HTTP nodes' },
      { query: 'slack', label: 'Slack nodes' }
    ];
    
    for (const test of searchTests) {
      const results = await service.searchNodes({ query: test.query });
      console.log(`\n   ${test.label}: ${results.length} results`);
      results.slice(0, 3).forEach(node => {
        console.log(`   - ${node.displayName} (${node.nodeType})`);
      });
    }
    
    // Get final statistics
    console.log('\n📊 Final database statistics:');
    const stats = service.getStatistics();
    console.log(`   - Total nodes: ${stats.totalNodes}`);
    console.log(`   - Nodes with documentation: ${stats.nodesWithDocs}`);
    console.log(`   - Nodes with examples: ${stats.nodesWithExamples}`);
    console.log(`   - Trigger nodes: ${stats.triggerNodes}`);
    console.log(`   - Webhook nodes: ${stats.webhookNodes}`);
    
    console.log('\n✅ All tests completed!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  } finally {
    service.close();
  }
}

testCompleteFix().catch(console.error);