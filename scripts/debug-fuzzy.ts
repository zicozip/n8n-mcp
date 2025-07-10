#!/usr/bin/env node

import { N8NDocumentationMCPServer } from '../src/mcp/server';

async function debugFuzzy() {
  const server = new N8NDocumentationMCPServer();
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Get the actual implementation
  const serverAny = server as any;
  
  // Test nodes we expect to find
  const testNodes = [
    { node_type: 'nodes-base.slack', display_name: 'Slack', description: 'Consume Slack API' },
    { node_type: 'nodes-base.webhook', display_name: 'Webhook', description: 'Handle webhooks' },
    { node_type: 'nodes-base.httpRequest', display_name: 'HTTP Request', description: 'Make HTTP requests' },
    { node_type: 'nodes-base.emailSend', display_name: 'Send Email', description: 'Send emails' }
  ];
  
  const testQueries = ['slak', 'webook', 'htpp', 'emial'];
  
  console.log('Testing fuzzy scoring...\n');
  
  for (const query of testQueries) {
    console.log(`\nQuery: "${query}"`);
    console.log('-'.repeat(40));
    
    for (const node of testNodes) {
      const score = serverAny.calculateFuzzyScore(node, query);
      const distance = serverAny.getEditDistance(query, node.display_name.toLowerCase());
      console.log(`${node.display_name.padEnd(15)} - Score: ${score.toFixed(0).padStart(4)}, Distance: ${distance}`);
    }
    
    // Test actual search
    console.log('\nActual search result:');
    const result = await server.executeTool('search_nodes', {
      query: query,
      mode: 'FUZZY',
      limit: 5
    });
    console.log(`Found ${result.results.length} results`);
    if (result.results.length > 0) {
      console.log('Top result:', result.results[0].displayName);
    }
  }
}

debugFuzzy().catch(console.error);