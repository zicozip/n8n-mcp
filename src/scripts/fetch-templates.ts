#!/usr/bin/env node
import { createDatabaseAdapter } from '../database/database-adapter';
import { TemplateService } from '../templates/template-service';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as dotenv from 'dotenv';
import type { MetadataRequest } from '../templates/metadata-generator';

// Load environment variables
dotenv.config();

async function fetchTemplates(mode: 'rebuild' | 'update' = 'rebuild', generateMetadata: boolean = false, metadataOnly: boolean = false) {
  // If metadata-only mode, skip template fetching entirely
  if (metadataOnly) {
    console.log('🤖 Metadata-only mode: Generating metadata for existing templates...\n');
    
    if (!process.env.OPENAI_API_KEY) {
      console.error('❌ OPENAI_API_KEY not set in environment');
      process.exit(1);
    }
    
    const db = await createDatabaseAdapter('./data/nodes.db');
    const service = new TemplateService(db);
    
    await generateTemplateMetadata(db, service);
    
    if ('close' in db && typeof db.close === 'function') {
      db.close();
    }
    return;
  }
  
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
  
  // Handle database schema based on mode
  if (mode === 'rebuild') {
    try {
      // Drop existing tables in rebuild mode
      db.exec('DROP TABLE IF EXISTS templates');
      db.exec('DROP TABLE IF EXISTS templates_fts');
      console.log('🗑️  Dropped existing templates tables (rebuild mode)\n');
      
      // Apply fresh schema
      const schema = fs.readFileSync(path.join(__dirname, '../../src/database/schema.sql'), 'utf8');
      db.exec(schema);
      console.log('📋 Applied database schema\n');
    } catch (error) {
      console.error('❌ Error setting up database schema:', error);
      throw error;
    }
  } else {
    console.log('📊 Update mode: Keeping existing templates and schema\n');
    
    // In update mode, only ensure new columns exist (for migration)
    try {
      // Check if metadata columns exist, add them if not (migration support)
      const columns = db.prepare("PRAGMA table_info(templates)").all() as any[];
      const hasMetadataColumn = columns.some((col: any) => col.name === 'metadata_json');
      
      if (!hasMetadataColumn) {
        console.log('📋 Adding metadata columns to existing schema...');
        db.exec(`
          ALTER TABLE templates ADD COLUMN metadata_json TEXT;
          ALTER TABLE templates ADD COLUMN metadata_generated_at DATETIME;
        `);
        console.log('✅ Metadata columns added\n');
      }
    } catch (error) {
      // Columns might already exist, that's fine
      console.log('📋 Schema is up to date\n');
    }
  }
  
  // FTS5 initialization is handled by TemplateRepository
  // No need to duplicate the logic here
  
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
    }, mode);  // Pass the mode parameter!
    
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
    
    // Get templates without metadata (0 = no limit)
    const limit = parseInt(process.env.METADATA_LIMIT || '0');
    const templatesWithoutMetadata = limit > 0 
      ? repository.getTemplatesWithoutMetadata(limit)
      : repository.getTemplatesWithoutMetadata(999999); // Get all
    
    if (templatesWithoutMetadata.length === 0) {
      console.log('✅ All templates already have metadata');
      return;
    }
    
    console.log(`Found ${templatesWithoutMetadata.length} templates without metadata`);
    
    // Create batch processor
    const batchSize = parseInt(process.env.OPENAI_BATCH_SIZE || '50');
    console.log(`Processing in batches of ${batchSize} templates each`);
    
    // Warn if batch size is very large
    if (batchSize > 100) {
      console.log(`⚠️  Large batch size (${batchSize}) may take longer to process`);
      console.log(`   Consider using OPENAI_BATCH_SIZE=50 for faster results`);
    }
    
    const processor = new BatchProcessor({
      apiKey: process.env.OPENAI_API_KEY!,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      batchSize: batchSize,
      outputDir: './temp/batch'
    });
    
    // Prepare metadata requests
    const requests: MetadataRequest[] = templatesWithoutMetadata.map((t: any) => {
      let workflow = undefined;
      try {
        if (t.workflow_json_compressed) {
          const decompressed = zlib.gunzipSync(Buffer.from(t.workflow_json_compressed, 'base64'));
          workflow = JSON.parse(decompressed.toString());
        } else if (t.workflow_json) {
          workflow = JSON.parse(t.workflow_json);
        }
      } catch (error) {
        console.warn(`Failed to parse workflow for template ${t.id}:`, error);
      }
      
      return {
        templateId: t.id,
        name: t.name,
        description: t.description,
        nodes: JSON.parse(t.nodes_used),
        workflow
      };
    });
    
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
function parseArgs(): { mode: 'rebuild' | 'update', generateMetadata: boolean, metadataOnly: boolean } {
  const args = process.argv.slice(2);
  
  let mode: 'rebuild' | 'update' = 'rebuild';
  let generateMetadata = false;
  let metadataOnly = false;
  
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
  
  // Check for --metadata-only flag
  if (args.includes('--metadata-only')) {
    metadataOnly = true;
  }
  
  // Show help if requested
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: npm run fetch:templates [options]\n');
    console.log('Options:');
    console.log('  --mode=rebuild|update  Rebuild from scratch or update existing (default: rebuild)');
    console.log('  --update               Shorthand for --mode=update');
    console.log('  --generate-metadata    Generate AI metadata after fetching templates');
    console.log('  --metadata             Shorthand for --generate-metadata');
    console.log('  --metadata-only        Only generate metadata, skip template fetching');
    console.log('  --help, -h             Show this help message');
    process.exit(0);
  }
  
  return { mode, generateMetadata, metadataOnly };
}

// Run if called directly
if (require.main === module) {
  const { mode, generateMetadata, metadataOnly } = parseArgs();
  fetchTemplates(mode, generateMetadata, metadataOnly).catch(console.error);
}

export { fetchTemplates };