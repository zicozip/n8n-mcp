#!/usr/bin/env node

const { EnhancedDocumentationFetcher } = require('../dist/utils/enhanced-documentation-fetcher');
const { EnhancedSQLiteStorageService } = require('../dist/services/enhanced-sqlite-storage-service');
const { NodeSourceExtractor } = require('../dist/utils/node-source-extractor');

async function testEnhancedDocumentation() {
  console.log('=== Enhanced Documentation Parser Test ===\n');

  const fetcher = new EnhancedDocumentationFetcher();
  const extractor = new NodeSourceExtractor();

  try {
    // Test 1: Parse Slack documentation
    console.log('1. Parsing Slack node documentation...');
    const slackDoc = await fetcher.getEnhancedNodeDocumentation('n8n-nodes-base.slack');
    
    if (slackDoc) {
      console.log('\n✓ Slack Documentation Parsed:');
      console.log(`  Title: ${slackDoc.title}`);
      console.log(`  Description: ${slackDoc.description?.substring(0, 100)}...`);
      console.log(`  URL: ${slackDoc.url}`);
      console.log(`  Operations: ${slackDoc.operations?.length || 0} found`);
      console.log(`  API Methods: ${slackDoc.apiMethods?.length || 0} found`);
      console.log(`  Related Resources: ${slackDoc.relatedResources?.length || 0} found`);
      
      // Show sample operations
      if (slackDoc.operations && slackDoc.operations.length > 0) {
        console.log('\n  Sample Operations (first 10):');
        slackDoc.operations.slice(0, 10).forEach((op, i) => {
          console.log(`    ${i + 1}. ${op.resource}.${op.operation}: ${op.description}`);
        });
      }
      
      // Show sample API mappings
      if (slackDoc.apiMethods && slackDoc.apiMethods.length > 0) {
        console.log('\n  Sample API Method Mappings (first 5):');
        slackDoc.apiMethods.slice(0, 5).forEach((api, i) => {
          console.log(`    ${i + 1}. ${api.resource}.${api.operation} → ${api.apiMethod} (${api.apiUrl})`);
        });
      }
      
      // Show related resources
      if (slackDoc.relatedResources && slackDoc.relatedResources.length > 0) {
        console.log('\n  Related Resources:');
        slackDoc.relatedResources.forEach((res, i) => {
          console.log(`    ${i + 1}. ${res.title} (${res.type}): ${res.url}`);
        });
      }
    }

    // Test 2: Parse HTTP Request documentation (if available)
    console.log('\n\n2. Parsing HTTP Request node documentation...');
    const httpDoc = await fetcher.getEnhancedNodeDocumentation('n8n-nodes-base.httpRequest');
    
    if (httpDoc) {
      console.log('\n✓ HTTP Request Documentation Parsed:');
      console.log(`  Title: ${httpDoc.title}`);
      console.log(`  Examples: ${httpDoc.examples?.length || 0} found`);
      
      if (httpDoc.examples && httpDoc.examples.length > 0) {
        console.log('\n  Code Examples:');
        httpDoc.examples.forEach((ex, i) => {
          console.log(`    ${i + 1}. ${ex.title || 'Example'} (${ex.type}): ${ex.code.length} characters`);
        });
      }
    } else {
      console.log('  HTTP Request documentation not found');
    }

    // Test 3: Database storage test with smaller database
    console.log('\n\n3. Testing enhanced database storage...');
    const storage = new EnhancedSQLiteStorageService('./data/demo-enhanced.db');
    
    try {
      // Store Slack node with documentation
      const slackNodeInfo = await extractor.extractNodeSource('n8n-nodes-base.slack');
      if (slackNodeInfo) {
        const storedNode = await storage.storeNodeWithDocumentation(slackNodeInfo);
        
        console.log('\n✓ Slack node stored with documentation:');
        console.log(`  Node Type: ${storedNode.nodeType}`);
        console.log(`  Documentation: ${storedNode.documentationTitle || 'No title'}`);
        console.log(`  Operations stored: ${storedNode.operationCount}`);
        console.log(`  API methods stored: ${storedNode.apiMethodCount}`);
        console.log(`  Examples stored: ${storedNode.exampleCount}`);
        console.log(`  Resources stored: ${storedNode.resourceCount}`);
      }

      // Store a few more nodes
      const nodeTypes = ['n8n-nodes-base.if', 'n8n-nodes-base.webhook'];
      for (const nodeType of nodeTypes) {
        try {
          const nodeInfo = await extractor.extractNodeSource(nodeType);
          if (nodeInfo) {
            await storage.storeNodeWithDocumentation(nodeInfo);
            console.log(`  ✓ Stored ${nodeType}`);
          }
        } catch (e) {
          console.log(`  ✗ Failed to store ${nodeType}: ${e.message}`);
        }
      }

      // Test search functionality
      console.log('\n\n4. Testing enhanced search...');
      
      const searchTests = [
        { query: 'slack', description: 'Search for "slack"' },
        { query: 'message send', description: 'Search for "message send"' },
        { query: 'webhook', description: 'Search for "webhook"' }
      ];
      
      for (const test of searchTests) {
        const results = await storage.searchNodes({ query: test.query });
        console.log(`\n  ${test.description}: ${results.length} results`);
        if (results.length > 0) {
          const first = results[0];
          console.log(`    Top result: ${first.displayName || first.name} (${first.nodeType})`);
          if (first.documentationTitle) {
            console.log(`    Documentation: ${first.documentationTitle}`);
          }
        }
      }

      // Get final statistics
      console.log('\n\n5. Database Statistics:');
      const stats = await storage.getEnhancedStatistics();
      
      console.log(`  Total Nodes: ${stats.totalNodes}`);
      console.log(`  Nodes with Documentation: ${stats.nodesWithDocumentation} (${stats.documentationCoverage}% coverage)`);
      console.log(`  Total Operations: ${stats.totalOperations}`);
      console.log(`  Total API Methods: ${stats.totalApiMethods}`);
      console.log(`  Total Examples: ${stats.totalExamples}`);
      console.log(`  Total Resources: ${stats.totalResources}`);
      
      if (stats.topDocumentedNodes && stats.topDocumentedNodes.length > 0) {
        console.log('\n  Best Documented Nodes:');
        stats.topDocumentedNodes.forEach((node, i) => {
          console.log(`    ${i + 1}. ${node.display_name || node.name}: ${node.operation_count} operations, ${node.example_count} examples`);
        });
      }
      
    } finally {
      storage.close();
    }

  } catch (error) {
    console.error('\nError:', error);
  } finally {
    await fetcher.cleanup();
    console.log('\n\n✓ Test completed and cleaned up');
  }
}

// Run the test
testEnhancedDocumentation().catch(console.error);