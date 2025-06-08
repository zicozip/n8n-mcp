#!/usr/bin/env node

const { EnhancedDocumentationFetcher } = require('../dist/utils/enhanced-documentation-fetcher');

async function debugTest() {
  console.log('=== Debug Enhanced Documentation ===\n');

  const fetcher = new EnhancedDocumentationFetcher();

  try {
    await fetcher.ensureDocsRepository();
    
    // Test Slack documentation parsing
    console.log('Testing Slack documentation...');
    const slackDoc = await fetcher.getEnhancedNodeDocumentation('n8n-nodes-base.slack');
    
    if (slackDoc) {
      console.log('\nSlack Documentation:');
      console.log('- Operations found:', slackDoc.operations?.length || 0);
      
      // Show raw markdown around operations section
      const operationsIndex = slackDoc.markdown.indexOf('## Operations');
      if (operationsIndex > -1) {
        console.log('\nRaw markdown around Operations section:');
        console.log('---');
        console.log(slackDoc.markdown.substring(operationsIndex, operationsIndex + 1000));
        console.log('---');
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await fetcher.cleanup();
  }
}

debugTest().catch(console.error);