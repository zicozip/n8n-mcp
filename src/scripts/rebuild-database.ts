#!/usr/bin/env node

import { NodeSourceExtractor } from '../utils/node-source-extractor';
import { SQLiteStorageService } from '../services/sqlite-storage-service';
import { logger } from '../utils/logger';
import * as path from 'path';

/**
 * Rebuild the entire nodes database by extracting all available nodes
 */
async function rebuildDatabase() {
  console.log('🔄 Starting database rebuild...\n');
  
  const startTime = Date.now();
  const extractor = new NodeSourceExtractor();
  const storage = new SQLiteStorageService();
  
  try {
    // Step 1: Clear existing database
    console.log('1️⃣ Clearing existing database...');
    await storage.rebuildDatabase();
    
    // Step 2: Get all available nodes
    console.log('2️⃣ Discovering available nodes...');
    const allNodes = await extractor.listAvailableNodes();
    console.log(`   Found ${allNodes.length} nodes\n`);
    
    // Step 3: Extract and store each node
    console.log('3️⃣ Extracting and storing nodes...');
    let processed = 0;
    let stored = 0;
    let failed = 0;
    const errors: Array<{ node: string; error: string }> = [];
    
    // Process in batches for better performance
    const batchSize = 50;
    for (let i = 0; i < allNodes.length; i += batchSize) {
      const batch = allNodes.slice(i, Math.min(i + batchSize, allNodes.length));
      const nodeInfos = [];
      
      for (const node of batch) {
        processed++;
        
        try {
          const nodeType = node.packageName ? `${node.packageName}.${node.name}` : node.name;
          
          // Show progress
          if (processed % 100 === 0) {
            const progress = ((processed / allNodes.length) * 100).toFixed(1);
            console.log(`   Progress: ${processed}/${allNodes.length} (${progress}%)`);
          }
          
          const nodeInfo = await extractor.extractNodeSource(nodeType);
          nodeInfos.push(nodeInfo);
          stored++;
        } catch (error) {
          failed++;
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          errors.push({
            node: node.name,
            error: errorMsg
          });
          
          // Log first few errors
          if (errors.length <= 5) {
            logger.debug(`Failed to extract ${node.name}: ${errorMsg}`);
          }
        }
      }
      
      // Bulk store the batch
      if (nodeInfos.length > 0) {
        await storage.bulkStoreNodes(nodeInfos);
      }
    }
    
    // Step 4: Save statistics
    console.log('\n4️⃣ Saving statistics...');
    const stats = await storage.getStatistics();
    await storage.saveExtractionStats(stats);
    
    // Step 5: Display results
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\n✅ Database rebuild completed!\n');
    console.log('📊 Results:');
    console.log(`   Total nodes found: ${allNodes.length}`);
    console.log(`   Successfully stored: ${stored}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Duration: ${duration}s`);
    console.log(`   Database size: ${(stats.totalCodeSize / 1024 / 1024).toFixed(2)} MB`);
    
    console.log('\n📦 Package distribution:');
    stats.packageDistribution.slice(0, 10).forEach(pkg => {
      console.log(`   ${pkg.package}: ${pkg.count} nodes`);
    });
    
    if (errors.length > 0) {
      console.log(`\n⚠️  First ${Math.min(5, errors.length)} errors:`);
      errors.slice(0, 5).forEach(err => {
        console.log(`   - ${err.node}: ${err.error}`);
      });
      
      if (errors.length > 5) {
        console.log(`   ... and ${errors.length - 5} more errors`);
      }
    }
    
    // Close database connection
    storage.close();
    
    console.log('\n✨ Database is ready for use!');
    
  } catch (error) {
    console.error('\n❌ Database rebuild failed:', error);
    storage.close();
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  rebuildDatabase().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { rebuildDatabase };