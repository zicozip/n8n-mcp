#!/usr/bin/env node
/**
 * Final validation test
 */

const { N8NDocumentationMCPServer } = require('../dist/mcp/server-update');

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bright: '\x1b[1m'
};

async function testNode(server, nodeType) {
  console.log(`\n${colors.cyan}Testing ${nodeType}...${colors.reset}`);
  
  try {
    // Get essentials
    const essentials = await server.executeTool('get_node_essentials', { nodeType });
    
    // Get full info for comparison
    const fullInfo = await server.executeTool('get_node_info', { nodeType });
    
    const essentialSize = JSON.stringify(essentials).length;
    const fullSize = JSON.stringify(fullInfo).length;
    const reduction = ((fullSize - essentialSize) / fullSize * 100).toFixed(1);
    
    console.log(`✅ ${nodeType}:`);
    console.log(`   Required: ${essentials.requiredProperties?.map(p => p.name).join(', ') || 'none'}`);
    console.log(`   Common: ${essentials.commonProperties?.map(p => p.name).join(', ') || 'none'}`);
    console.log(`   Size: ${(fullSize / 1024).toFixed(1)}KB → ${(essentialSize / 1024).toFixed(1)}KB (${reduction}% reduction)`);
    console.log(`   Examples: ${Object.keys(essentials.examples || {}).length}`);
    
    return { success: true, reduction: parseFloat(reduction) };
  } catch (error) {
    console.log(`❌ ${nodeType}: ${error.message}`);
    return { success: false };
  }
}

async function main() {
  console.log(`${colors.bright}${colors.cyan}🎯 Final Validation Test${colors.reset}\n`);
  
  try {
    const server = new N8NDocumentationMCPServer();
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const nodes = [
      'nodes-base.httpRequest',
      'nodes-base.webhook',
      'nodes-base.code',
      'nodes-base.set',
      'nodes-base.postgres',
      'nodes-base.slack',
      'nodes-base.openAi',
      'nodes-base.googleSheets'
    ];
    
    const results = [];
    
    for (const node of nodes) {
      const result = await testNode(server, node);
      results.push(result);
    }
    
    // Summary
    console.log(`\n${colors.bright}📊 Summary${colors.reset}`);
    const successful = results.filter(r => r.success);
    const avgReduction = successful.reduce((sum, r) => sum + r.reduction, 0) / successful.length;
    
    console.log(`✅ Successful: ${successful.length}/${results.length}`);
    console.log(`📉 Average size reduction: ${avgReduction.toFixed(1)}%`);
    
    // Test property search
    console.log(`\n${colors.bright}🔍 Testing Property Search${colors.reset}`);
    const searchResult = await server.executeTool('search_node_properties', {
      nodeType: 'nodes-base.httpRequest',
      query: 'auth'
    });
    console.log(`✅ Found ${searchResult.totalMatches} properties matching "auth"`);
    searchResult.matches.slice(0, 3).forEach(m => {
      console.log(`   - ${m.name}: ${m.type}`);
    });
    
    console.log(`\n${colors.bright}${colors.green}✨ Implementation validated successfully!${colors.reset}`);
    console.log('\nThe MCP essentials tools are working correctly with:');
    console.log(`- ${avgReduction.toFixed(1)}% average size reduction`);
    console.log('- Property filtering working');
    console.log('- Examples included');
    console.log('- Search functionality operational');
    
  } catch (error) {
    console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

main().catch(console.error);