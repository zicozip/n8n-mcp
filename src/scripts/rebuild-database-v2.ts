#!/usr/bin/env node

import { NodeDocumentationService } from '../services/node-documentation-service';
import { logger } from '../utils/logger';

async function rebuildDatabase() {
  console.log('🔄 Starting complete database rebuild...\n');
  
  const service = new NodeDocumentationService();
  
  try {
    const startTime = Date.now();
    
    console.log('1️⃣ Initializing services...');
    console.log('2️⃣ Fetching n8n-docs repository...');
    console.log('3️⃣ Discovering available nodes...');
    console.log('4️⃣ Extracting node information...\n');
    
    const stats = await service.rebuildDatabase();
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\n📊 Rebuild Results:');
    console.log(`   Total nodes processed: ${stats.total}`);
    console.log(`   Successfully stored: ${stats.successful}`);
    console.log(`   Failed: ${stats.failed}`);
    console.log(`   Duration: ${duration}s`);
    
    if (stats.errors.length > 0) {
      console.log('\n⚠️  First 5 errors:');
      stats.errors.slice(0, 5).forEach(error => {
        console.log(`   - ${error}`);
      });
      if (stats.errors.length > 5) {
        console.log(`   ... and ${stats.errors.length - 5} more errors`);
      }
    }
    
    // Get final statistics
    const dbStats = service.getStatistics();
    console.log('\n📈 Database Statistics:');
    console.log(`   Total nodes: ${dbStats.totalNodes}`);
    console.log(`   Nodes with documentation: ${dbStats.nodesWithDocs}`);
    console.log(`   Nodes with examples: ${dbStats.nodesWithExamples}`);
    console.log(`   Trigger nodes: ${dbStats.triggerNodes}`);
    console.log(`   Webhook nodes: ${dbStats.webhookNodes}`);
    console.log(`   Total packages: ${dbStats.totalPackages}`);
    
    console.log('\n✨ Database rebuild complete!');
    
  } catch (error) {
    console.error('\n❌ Database rebuild failed:', error);
    process.exit(1);
  } finally {
    service.close();
  }
}

// Run if called directly
if (require.main === module) {
  rebuildDatabase().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

export { rebuildDatabase };