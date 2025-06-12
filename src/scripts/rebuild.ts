#!/usr/bin/env node
import Database from 'better-sqlite3';
import { N8nNodeLoader } from '../loaders/node-loader';
import { SimpleParser } from '../parsers/simple-parser';
import { DocsMapper } from '../mappers/docs-mapper';
import { readFileSync } from 'fs';
import path from 'path';

async function rebuild() {
  console.log('🔄 Rebuilding n8n node database...\n');
  
  const db = new Database('./data/nodes.db');
  const loader = new N8nNodeLoader();
  const parser = new SimpleParser();
  const mapper = new DocsMapper();
  
  // Initialize database
  const schemaPath = path.join(__dirname, '../../src/database/schema.sql');
  const schema = readFileSync(schemaPath, 'utf8');
  db.exec(schema);
  
  // Clear existing data
  db.exec('DELETE FROM nodes');
  console.log('🗑️  Cleared existing data\n');
  
  // Load all nodes
  const nodes = await loader.loadAllNodes();
  console.log(`📦 Loaded ${nodes.length} nodes from packages\n`);
  
  // Statistics
  let successful = 0;
  let failed = 0;
  let aiTools = 0;
  
  // Process each node
  for (const { packageName, nodeName, NodeClass } of nodes) {
    try {
      // Debug: log what we're working with
      // Don't check for description here since it might be an instance property
      if (!NodeClass) {
        console.error(`❌ Node ${nodeName} has no NodeClass`);
        failed++;
        continue;
      }
      
      // Parse node
      const parsed = parser.parse(NodeClass);
      
      // Get documentation
      const docs = await mapper.fetchDocumentation(parsed.nodeType);
      
      // Insert into database
      db.prepare(`
        INSERT INTO nodes (
          node_type, package_name, display_name, description,
          category, development_style, is_ai_tool, is_trigger,
          is_webhook, is_versioned, version, documentation,
          properties_schema, operations, credentials_required
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        parsed.nodeType,
        packageName,
        parsed.displayName,
        parsed.description,
        parsed.category,
        parsed.style,
        parsed.isAITool ? 1 : 0,
        parsed.isTrigger ? 1 : 0,
        parsed.isWebhook ? 1 : 0,
        parsed.isVersioned ? 1 : 0,
        parsed.version,
        docs,
        JSON.stringify(parsed.properties),
        JSON.stringify(parsed.operations),
        JSON.stringify(parsed.credentials)
      );
      
      successful++;
      if (parsed.isAITool) aiTools++;
      
      console.log(`✅ ${parsed.nodeType}`);
    } catch (error) {
      failed++;
      console.error(`❌ Failed to process ${nodeName}: ${(error as Error).message}`);
    }
  }
  
  // Summary
  console.log('\n📊 Summary:');
  console.log(`   Total nodes: ${nodes.length}`);
  console.log(`   Successful: ${successful}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   AI Tools: ${aiTools}`);
  console.log('\n✨ Rebuild complete!');
  
  db.close();
}

// Run if called directly
if (require.main === module) {
  rebuild().catch(console.error);
}