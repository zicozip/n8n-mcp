#!/usr/bin/env npx tsx
/**
 * Test MCP search behavior
 */
import { createDatabaseAdapter } from '../src/database/database-adapter';
import { TemplateService } from '../src/templates/template-service';
import { TemplateRepository } from '../src/templates/template-repository';

async function testMCPSearch() {
  console.log('🔍 Testing MCP search behavior...\n');
  
  // Set MCP_MODE to simulate Docker environment
  process.env.MCP_MODE = 'stdio';
  console.log('Environment: MCP_MODE =', process.env.MCP_MODE);
  
  const db = await createDatabaseAdapter('./data/nodes.db');
  
  // Test 1: Direct repository search
  console.log('\n1️⃣ Testing TemplateRepository directly:');
  const repo = new TemplateRepository(db);
  
  try {
    const repoResults = repo.searchTemplates('webhook', 5);
    console.log(`  Repository search returned: ${repoResults.length} results`);
    if (repoResults.length > 0) {
      console.log(`  First result: ${repoResults[0].name}`);
    }
  } catch (error) {
    console.log('  Repository search error:', error);
  }
  
  // Test 2: Service layer search (what MCP uses)
  console.log('\n2️⃣ Testing TemplateService (MCP layer):');
  const service = new TemplateService(db);
  
  try {
    const serviceResults = await service.searchTemplates('webhook', 5);
    console.log(`  Service search returned: ${serviceResults.length} results`);
    if (serviceResults.length > 0) {
      console.log(`  First result: ${serviceResults[0].name}`);
    }
  } catch (error) {
    console.log('  Service search error:', error);
  }
  
  // Test 3: Test with empty query
  console.log('\n3️⃣ Testing with empty query:');
  try {
    const emptyResults = await service.searchTemplates('', 5);
    console.log(`  Empty query returned: ${emptyResults.length} results`);
  } catch (error) {
    console.log('  Empty query error:', error);
  }
  
  // Test 4: Test getTemplatesForTask (which works)
  console.log('\n4️⃣ Testing getTemplatesForTask (control):');
  try {
    const taskResults = await service.getTemplatesForTask('webhook_processing');
    console.log(`  Task search returned: ${taskResults.length} results`);
    if (taskResults.length > 0) {
      console.log(`  First result: ${taskResults[0].name}`);
    }
  } catch (error) {
    console.log('  Task search error:', error);
  }
  
  // Test 5: Direct SQL queries
  console.log('\n5️⃣ Testing direct SQL queries:');
  try {
    // Count templates
    const count = db.prepare('SELECT COUNT(*) as count FROM templates').get() as { count: number };
    console.log(`  Total templates: ${count.count}`);
    
    // Test LIKE search
    const likeResults = db.prepare(`
      SELECT COUNT(*) as count FROM templates 
      WHERE name LIKE '%webhook%' OR description LIKE '%webhook%'
    `).get() as { count: number };
    console.log(`  LIKE search for 'webhook': ${likeResults.count} results`);
    
    // Check if FTS5 table exists
    const ftsExists = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='templates_fts'
    `).get() as { name: string } | undefined;
    console.log(`  FTS5 table exists: ${ftsExists ? 'Yes' : 'No'}`);
    
    if (ftsExists) {
      // Test FTS5 search
      try {
        const ftsResults = db.prepare(`
          SELECT COUNT(*) as count FROM templates t
          JOIN templates_fts ON t.id = templates_fts.rowid
          WHERE templates_fts MATCH 'webhook'
        `).get() as { count: number };
        console.log(`  FTS5 search for 'webhook': ${ftsResults.count} results`);
      } catch (ftsError) {
        console.log(`  FTS5 search error:`, ftsError);
      }
    }
  } catch (error) {
    console.log('  Direct SQL error:', error);
  }
  
  db.close();
}

// Run if called directly
if (require.main === module) {
  testMCPSearch().catch(console.error);
}

export { testMCPSearch };