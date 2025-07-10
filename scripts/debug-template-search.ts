#!/usr/bin/env npx tsx
/**
 * Debug template search issues
 */
import { createDatabaseAdapter } from '../src/database/database-adapter';
import { TemplateRepository } from '../src/templates/template-repository';

async function debug() {
  console.log('🔍 Debugging template search...\n');
  
  const db = await createDatabaseAdapter('./data/nodes.db');
  
  // Check FTS5 support
  const hasFTS5 = db.checkFTS5Support();
  console.log(`FTS5 support: ${hasFTS5}`);
  
  // Check template count
  const templateCount = db.prepare('SELECT COUNT(*) as count FROM templates').get() as { count: number };
  console.log(`Total templates: ${templateCount.count}`);
  
  // Check FTS5 tables
  const ftsTables = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type IN ('table', 'virtual') AND name LIKE 'templates_fts%'
    ORDER BY name
  `).all() as { name: string }[];
  
  console.log('\nFTS5 tables:');
  ftsTables.forEach(t => console.log(`  - ${t.name}`));
  
  // Check FTS5 content
  if (hasFTS5) {
    try {
      const ftsCount = db.prepare('SELECT COUNT(*) as count FROM templates_fts').get() as { count: number };
      console.log(`\nFTS5 entries: ${ftsCount.count}`);
    } catch (error) {
      console.log('\nFTS5 query error:', error);
    }
  }
  
  // Test template repository
  console.log('\n📋 Testing TemplateRepository...');
  const repo = new TemplateRepository(db);
  
  // Test different searches
  const searches = ['webhook', 'api', 'automation'];
  
  for (const query of searches) {
    console.log(`\n🔎 Searching for "${query}"...`);
    
    // Direct SQL LIKE search
    const likeResults = db.prepare(`
      SELECT COUNT(*) as count FROM templates 
      WHERE name LIKE ? OR description LIKE ?
    `).get(`%${query}%`, `%${query}%`) as { count: number };
    console.log(`  LIKE search matches: ${likeResults.count}`);
    
    // Repository search
    try {
      const repoResults = repo.searchTemplates(query, 5);
      console.log(`  Repository search returned: ${repoResults.length} results`);
      if (repoResults.length > 0) {
        console.log(`  First result: ${repoResults[0].name}`);
      }
    } catch (error) {
      console.log(`  Repository search error:`, error);
    }
    
    // Direct FTS5 search if available
    if (hasFTS5) {
      try {
        const ftsQuery = `"${query}"`;
        const ftsResults = db.prepare(`
          SELECT COUNT(*) as count 
          FROM templates t
          JOIN templates_fts ON t.id = templates_fts.rowid
          WHERE templates_fts MATCH ?
        `).get(ftsQuery) as { count: number };
        console.log(`  Direct FTS5 matches: ${ftsResults.count}`);
      } catch (error) {
        console.log(`  Direct FTS5 error:`, error);
      }
    }
  }
  
  // Check if templates_fts is properly synced
  if (hasFTS5) {
    console.log('\n🔄 Checking FTS5 sync...');
    try {
      // Get a few template IDs and check if they're in FTS
      const templates = db.prepare('SELECT id, name FROM templates LIMIT 5').all() as { id: number, name: string }[];
      
      for (const template of templates) {
        try {
          const inFTS = db.prepare('SELECT rowid FROM templates_fts WHERE rowid = ?').get(template.id);
          console.log(`  Template ${template.id} "${template.name.substring(0, 30)}...": ${inFTS ? 'IN FTS' : 'NOT IN FTS'}`);
        } catch (error) {
          console.log(`  Error checking template ${template.id}:`, error);
        }
      }
    } catch (error) {
      console.log('  FTS sync check error:', error);
    }
  }
  
  db.close();
}

// Run if called directly
if (require.main === module) {
  debug().catch(console.error);
}

export { debug };