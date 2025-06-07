#!/usr/bin/env node

// Simple test to verify node extraction works
const { NodeSourceExtractor } = require('./dist/utils/node-source-extractor');

async function testExtraction() {
  const extractor = new NodeSourceExtractor();
  
  console.log('🧪 Testing n8n Node Extraction\n');
  
  // Test cases
  const testNodes = [
    'n8n-nodes-base.Function',
    'n8n-nodes-base.Webhook',
    '@n8n/n8n-nodes-langchain.Agent'
  ];
  
  for (const nodeType of testNodes) {
    console.log(`\n📦 Testing: ${nodeType}`);
    console.log('-'.repeat(40));
    
    try {
      const result = await extractor.extractNodeSource(nodeType);
      
      console.log('✅ Success!');
      console.log(`   Size: ${result.sourceCode.length} bytes`);
      console.log(`   Location: ${result.location}`);
      console.log(`   Has package info: ${result.packageInfo ? 'Yes' : 'No'}`);
      
      if (result.packageInfo) {
        console.log(`   Package: ${result.packageInfo.name} v${result.packageInfo.version}`);
      }
      
    } catch (error) {
      console.log('❌ Failed:', error.message);
    }
  }
  
  console.log('\n\n📋 Listing available nodes...');
  const allNodes = await extractor.listAvailableNodes();
  console.log(`Found ${allNodes.length} total nodes`);
  
  // Show first 5
  console.log('\nFirst 5 nodes:');
  allNodes.slice(0, 5).forEach(node => {
    console.log(`  - ${node.name} (${node.displayName || 'no display name'})`);
  });
}

testExtraction().catch(console.error);