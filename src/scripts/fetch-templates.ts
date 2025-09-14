#!/usr/bin/env node
import { createDatabaseAdapter } from '../database/database-adapter';
import { TemplateService } from '../templates/template-service';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import type { MetadataRequest } from '../templates/metadata-generator';

// Load environment variables
dotenv.config();

async function fetchTemplates(mode: 'rebuild' | 'update' = 'rebuild', generateMetadata: boolean = false) {
  const modeEmoji = mode === 'rebuild' ? '🔄' : '⬆️';
  const modeText = mode === 'rebuild' ? 'Rebuilding' : 'Updating';
  console.log(`${modeEmoji} ${modeText} n8n workflow templates...\n`);
  
  if (generateMetadata) {
    console.log('🤖 Metadata generation enabled (using OpenAI)\n');
  }
  
  // Ensure data directory exists
  const dataDir = './data';
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  // Initialize database
  const db = await createDatabaseAdapter('./data/nodes.db');
  
  // Only drop tables in rebuild mode
  if (mode === 'rebuild') {
    try {
      db.exec('DROP TABLE IF EXISTS templates');
      db.exec('DROP TABLE IF EXISTS templates_fts');
      console.log('🗑️  Dropped existing templates tables (rebuild mode)\n');
    } catch (error) {
      // Ignore errors if tables don't exist
    }
  } else {
    console.log('📊 Update mode: Keeping existing templates\n');
  }
  
  // Apply schema with updated constraint
  const schema = fs.readFileSync(path.join(__dirname, '../../src/database/schema.sql'), 'utf8');
  db.exec(schema);
  
  // Pre-create FTS5 tables if supported
  const hasFTS5 = db.checkFTS5Support();
  if (hasFTS5) {
    console.log('🔍  Creating FTS5 tables for template search...');
    try {
      // Create FTS5 virtual table
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS templates_fts USING fts5(
          name, description, content=templates
        );
      `);
      
      // Create triggers to keep FTS5 in sync
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS templates_ai AFTER INSERT ON templates BEGIN
          INSERT INTO templates_fts(rowid, name, description)
          VALUES (new.id, new.name, new.description);
        END;
      `);
      
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS templates_au AFTER UPDATE ON templates BEGIN
          UPDATE templates_fts SET name = new.name, description = new.description
          WHERE rowid = new.id;
        END;
      `);
      
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS templates_ad AFTER DELETE ON templates BEGIN
          DELETE FROM templates_fts WHERE rowid = old.id;
        END;
      `);
      
      console.log('✅  FTS5 tables created successfully\n');
    } catch (error) {
      console.log('⚠️  Failed to create FTS5 tables:', error);
      console.log('   Template search will use LIKE fallback\n');
    }
  } else {
    console.log('ℹ️  FTS5 not supported in this SQLite build');
    console.log('   Template search will use LIKE queries\n');
  }
  
  // Create service
  const service = new TemplateService(db);
  
  // Progress tracking
  let lastMessage = '';
  const startTime = Date.now();
  
  try {
    await service.fetchAndUpdateTemplates((message, current, total) => {
      // Clear previous line
      if (lastMessage) {
        process.stdout.write('\r' + ' '.repeat(lastMessage.length) + '\r');
      }
      
      const progress = total > 0 ? Math.round((current / total) * 100) : 0;
      lastMessage = `📊 ${message}: ${current}/${total} (${progress}%)`;
      process.stdout.write(lastMessage);
    }, mode);
    
    console.log('\n'); // New line after progress
    
    // Get stats
    const stats = await service.getTemplateStats();
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    
    console.log('✅ Template fetch complete!\n');
    console.log('📈 Statistics:');
    console.log(`   - Total templates: ${stats.totalTemplates}`);
    console.log(`   - Average views: ${stats.averageViews}`);
    console.log(`   - Time elapsed: ${elapsed} seconds`);
    console.log('\n🔝 Top used nodes:');
    
    stats.topUsedNodes.forEach((node: any, index: number) => {
      console.log(`   ${index + 1}. ${node.node} (${node.count} templates)`);
    });
    
    // Generate metadata if requested
    if (generateMetadata && process.env.OPENAI_API_KEY) {
      console.log('\n🤖 Generating metadata for templates...');
      await generateTemplateMetadata(db, service);
    } else if (generateMetadata && !process.env.OPENAI_API_KEY) {
      console.log('\n⚠️  Metadata generation requested but OPENAI_API_KEY not set');
    }
    
  } catch (error) {
    console.error('\n❌ Error fetching templates:', error);
    process.exit(1);
  }
  
  // Close database
  if ('close' in db && typeof db.close === 'function') {
    db.close();
  }
}

// Generate metadata for templates using OpenAI
async function generateTemplateMetadata(db: any, service: TemplateService) {
  try {
    const { BatchProcessor } = await import('../templates/batch-processor');
    const repository = (service as any).repository;
    
    // Get templates without metadata
    const templatesWithoutMetadata = repository.getTemplatesWithoutMetadata(500);
    
    if (templatesWithoutMetadata.length === 0) {
      console.log('✅ All templates already have metadata');
      return;
    }
    
    console.log(`Found ${templatesWithoutMetadata.length} templates without metadata`);
    
    // Create batch processor
    const processor = new BatchProcessor({
      apiKey: process.env.OPENAI_API_KEY!,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      batchSize: parseInt(process.env.OPENAI_BATCH_SIZE || '100'),
      outputDir: './temp/batch'
    });
    
    // Prepare metadata requests
    const requests: MetadataRequest[] = templatesWithoutMetadata.map((t: any) => ({
      templateId: t.id,
      name: t.name,
      description: t.description,
      nodes: JSON.parse(t.nodes_used),
      workflow: t.workflow_json_compressed 
        ? JSON.parse(Buffer.from(t.workflow_json_compressed, 'base64').toString())
        : (t.workflow_json ? JSON.parse(t.workflow_json) : undefined)
    }));
    
    // Process in batches
    const results = await processor.processTemplates(requests, (message, current, total) => {
      process.stdout.write(`\r📊 ${message}: ${current}/${total}`);
    });
    
    console.log('\n');
    
    // Update database with metadata
    const metadataMap = new Map();
    for (const [templateId, result] of results) {
      if (!result.error) {
        metadataMap.set(templateId, result.metadata);
      }
    }
    
    if (metadataMap.size > 0) {
      repository.batchUpdateMetadata(metadataMap);
      console.log(`✅ Updated metadata for ${metadataMap.size} templates`);
    }
    
    // Show stats
    const stats = repository.getMetadataStats();
    console.log('\n📈 Metadata Statistics:');
    console.log(`   - Total templates: ${stats.total}`);
    console.log(`   - With metadata: ${stats.withMetadata}`);
    console.log(`   - Without metadata: ${stats.withoutMetadata}`);
    console.log(`   - Outdated (>30 days): ${stats.outdated}`);
  } catch (error) {
    console.error('\n❌ Error generating metadata:', error);
  }
}

// Parse command line arguments
function parseArgs(): { mode: 'rebuild' | 'update', generateMetadata: boolean } {
  const args = process.argv.slice(2);
  
  let mode: 'rebuild' | 'update' = 'rebuild';
  let generateMetadata = false;
  
  // Check for --mode flag
  const modeIndex = args.findIndex(arg => arg.startsWith('--mode'));
  if (modeIndex !== -1) {
    const modeArg = args[modeIndex];
    const modeValue = modeArg.includes('=') ? modeArg.split('=')[1] : args[modeIndex + 1];
    
    if (modeValue === 'update') {
      mode = 'update';
    }
  }
  
  // Check for --update flag as shorthand
  if (args.includes('--update')) {
    mode = 'update';
  }
  
  // Check for --generate-metadata flag
  if (args.includes('--generate-metadata') || args.includes('--metadata')) {
    generateMetadata = true;
  }
  
  // Show help if requested
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: npm run fetch:templates [options]\n');
    console.log('Options:');
    console.log('  --mode=rebuild|update  Rebuild from scratch or update existing (default: rebuild)');
    console.log('  --update               Shorthand for --mode=update');
    console.log('  --generate-metadata    Generate AI metadata for templates (requires OPENAI_API_KEY)');
    console.log('  --metadata             Shorthand for --generate-metadata');
    console.log('  --help, -h             Show this help message');
    process.exit(0);
  }
  
  return { mode, generateMetadata };
}

// Run if called directly
if (require.main === module) {
  const { mode, generateMetadata } = parseArgs();
  fetchTemplates(mode, generateMetadata).catch(console.error);
}

export { fetchTemplates };