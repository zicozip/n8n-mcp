#!/usr/bin/env node

const { NodeDocumentationService } = require('../dist/services/node-documentation-service');
const { NodeSourceExtractor } = require('../dist/utils/node-source-extractor');
const { DocumentationFetcher } = require('../dist/utils/documentation-fetcher');

async function testSlackFix() {
  console.log('=== Testing Slack Node Fix ===\n');
  
  const extractor = new NodeSourceExtractor();
  const docsFetcher = new DocumentationFetcher();
  
  try {
    // Test 1: Node source extraction
    console.log('1️⃣ Testing Slack node source extraction...');
    const slackSource = await extractor.extractNodeSource('n8n-nodes-base.slack');
    console.log(`   ✅ Source code found at: ${slackSource.location}`);
    console.log(`   📏 Source length: ${slackSource.sourceCode.length} bytes`);
    
    // Extract display name from source
    const displayNameMatch = slackSource.sourceCode.match(/displayName\s*[:=]\s*['"`]([^'"`]+)['"`]/);
    console.log(`   📛 Display name: ${displayNameMatch ? displayNameMatch[1] : 'Not found'}`);
    
    // Test 2: Documentation fetching
    console.log('\n2️⃣ Testing Slack documentation fetching...');
    const slackDocs = await docsFetcher.getNodeDocumentation('n8n-nodes-base.slack');
    
    if (slackDocs) {
      console.log(`   ✅ Documentation found`);
      console.log(`   📄 URL: ${slackDocs.url}`);
      
      // Extract title from markdown
      const titleMatch = slackDocs.markdown.match(/title:\s*(.+)/);
      console.log(`   📝 Title: ${titleMatch ? titleMatch[1] : 'Not found'}`);
      
      // Check if it's the correct documentation
      const isNodeDoc = slackDocs.markdown.includes('Slack node') || 
                       slackDocs.markdown.includes('node documentation');
      const isCredentialDoc = slackDocs.markdown.includes('Slack credentials') &&
                            !slackDocs.markdown.includes('node documentation');
                            
      console.log(`   ✅ Is node documentation: ${isNodeDoc}`);
      console.log(`   ❌ Is credential documentation: ${isCredentialDoc}`);
      
      if (isNodeDoc && !isCredentialDoc) {
        console.log('\n🎉 SUCCESS: Slack node documentation is correctly fetched!');
      } else {
        console.log('\n⚠️  WARNING: Documentation may not be correct');
      }
      
      // Show first few lines of content
      console.log('\n📋 Documentation preview:');
      const lines = slackDocs.markdown.split('\n').slice(0, 15);
      lines.forEach(line => console.log(`   ${line}`));
      
    } else {
      console.log('   ❌ No documentation found');
    }
    
    // Test 3: Complete node info using NodeDocumentationService
    console.log('\n3️⃣ Testing complete node info storage...');
    const service = new NodeDocumentationService('./data/test-slack-fix.db');
    
    try {
      // Parse node definition
      const nodeDefinition = {
        displayName: displayNameMatch ? displayNameMatch[1] : 'Slack',
        description: 'Send messages to Slack channels, users and conversations',
        category: 'Communication',
        icon: 'file:slack.svg',
        version: 2
      };
      
      // Store node info
      await service.storeNode({
        nodeType: 'n8n-nodes-base.slack',
        name: 'slack',
        displayName: nodeDefinition.displayName,
        description: nodeDefinition.description,
        category: nodeDefinition.category,
        icon: nodeDefinition.icon,
        sourceCode: slackSource.sourceCode,
        credentialCode: slackSource.credentialCode,
        documentation: slackDocs?.markdown,
        documentationUrl: slackDocs?.url,
        packageName: 'n8n-nodes-base',
        version: nodeDefinition.version,
        hasCredentials: !!slackSource.credentialCode,
        isTrigger: false,
        isWebhook: false
      });
      
      console.log('   ✅ Node info stored successfully');
      
      // Retrieve and verify
      const retrievedNode = await service.getNodeInfo('n8n-nodes-base.slack');
      if (retrievedNode) {
        console.log('   ✅ Node retrieved successfully');
        console.log(`   📛 Display name: ${retrievedNode.displayName}`);
        console.log(`   📝 Has documentation: ${!!retrievedNode.documentation}`);
        console.log(`   📄 Documentation URL: ${retrievedNode.documentationUrl || 'N/A'}`);
      }
      
      service.close();
    } catch (error) {
      console.error('   ❌ Error with node service:', error.message);
      service.close();
    }
    
    console.log('\n✅ All tests completed!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
  } finally {
    await docsFetcher.cleanup();
  }
}

testSlackFix().catch(console.error);