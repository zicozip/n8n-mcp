#!/bin/bash

echo "🚀 Quick n8n-MCP Node Extraction Test"
echo "===================================="
echo ""

# Start services
echo "1. Starting Docker services..."
docker compose -f docker-compose.test.yml up -d

echo ""
echo "2. Waiting for services to start (30 seconds)..."
sleep 30

echo ""
echo "3. Testing AI Agent node extraction..."
docker compose -f docker-compose.test.yml run --rm n8n-mcp node -e "
const { NodeSourceExtractor } = require('./dist/utils/node-source-extractor');

async function test() {
  const extractor = new NodeSourceExtractor();
  
  console.log('\\n🔍 Extracting AI Agent node...');
  try {
    const result = await extractor.extractNodeSource('@n8n/n8n-nodes-langchain.Agent');
    console.log('✅ SUCCESS!');
    console.log('📦 Node Type:', result.nodeType);
    console.log('📏 Code Size:', result.sourceCode.length, 'bytes');
    console.log('📍 Location:', result.location);
    console.log('\\n📄 First 200 characters of code:');
    console.log(result.sourceCode.substring(0, 200) + '...');
  } catch (error) {
    console.log('❌ FAILED:', error.message);
  }
}

test();
"

echo ""
echo "4. Listing available AI nodes..."
docker compose -f docker-compose.test.yml run --rm n8n-mcp node -e "
const { NodeSourceExtractor } = require('./dist/utils/node-source-extractor');

async function test() {
  const extractor = new NodeSourceExtractor();
  
  console.log('\\n📋 Listing AI/LangChain nodes...');
  const nodes = await extractor.listAvailableNodes();
  const aiNodes = nodes.filter(n => n.location && n.location.includes('langchain'));
  
  console.log('Found', aiNodes.length, 'AI nodes:');
  aiNodes.slice(0, 10).forEach(node => {
    console.log('  -', node.name);
  });
}

test();
"

echo ""
echo "5. Cleaning up..."
docker compose -f docker-compose.test.yml down -v

echo ""
echo "✅ Test complete!"