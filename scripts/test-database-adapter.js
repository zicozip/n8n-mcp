#!/usr/bin/env node

const { createDatabaseAdapter } = require('../dist/database/database-adapter');
const path = require('path');

async function testDatabaseAdapter() {
  console.log('Testing database adapter initialization...\n');
  
  const dbPath = path.join(__dirname, '../data/nodes.db');
  console.log('Database path:', dbPath);
  
  try {
    console.log('Creating database adapter...');
    const adapter = await createDatabaseAdapter(dbPath);
    
    console.log('\n✅ Database adapter created successfully!');
    
    // Test a simple query
    console.log('\nTesting database query...');
    const stmt = adapter.prepare('SELECT COUNT(*) as count FROM nodes');
    const result = stmt.get();
    console.log(`✅ Database contains ${result.count} nodes`);
    
    // Check FTS5 support
    console.log('\nChecking FTS5 support...');
    const hasFTS5 = adapter.checkFTS5Support();
    console.log(`FTS5 support: ${hasFTS5 ? '✅ Available' : '❌ Not available'}`);
    
    adapter.close();
    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testDatabaseAdapter();