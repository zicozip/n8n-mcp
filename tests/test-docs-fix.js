#!/usr/bin/env node

const { DocumentationFetcher } = require('../dist/utils/documentation-fetcher');
const { NodeSourceExtractor } = require('../dist/utils/node-source-extractor');

async function testDocsFix() {
  console.log('=== Testing Documentation Fix ===\n');
  
  const docsFetcher = new DocumentationFetcher();
  const extractor = new NodeSourceExtractor();
  
  try {
    // Test nodes
    const testNodes = [
      'n8n-nodes-base.slack',
      'n8n-nodes-base.if',
      'n8n-nodes-base.httpRequest',
      'n8n-nodes-base.webhook'
    ];
    
    for (const nodeType of testNodes) {
      console.log(`\n📋 Testing ${nodeType}:`);
      
      // Test documentation fetching
      const docs = await docsFetcher.getNodeDocumentation(nodeType);
      if (docs) {
        console.log(`  ✅ Documentation found`);
        console.log(`  📄 URL: ${docs.url}`);
        const titleMatch = docs.markdown.match(/title:\s*(.+)/);
        if (titleMatch) {
          console.log(`  📝 Title: ${titleMatch[1]}`);
        }
        console.log(`  📏 Length: ${docs.markdown.length} characters`);
        console.log(`  🔧 Has examples: ${docs.examples && docs.examples.length > 0}`);
      } else {
        console.log(`  ❌ No documentation found`);
      }
      
      // Test source extraction
      try {
        const source = await extractor.extractNodeSource(nodeType);
        console.log(`  ✅ Source code found at: ${source.location}`);
      } catch (error) {
        console.log(`  ❌ Source extraction failed: ${error.message}`);
      }
    }
    
    console.log('\n✅ Test completed!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
  } finally {
    await docsFetcher.cleanup();
  }
}

testDocsFix().catch(console.error);