#!/usr/bin/env node

// Force sql.js usage by temporarily hiding better-sqlite3
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id) {
  if (id === 'better-sqlite3') {
    throw new Error('Simulating better-sqlite3 not available (NODE_MODULE_VERSION mismatch)');
  }
  return originalRequire.apply(this, arguments);
};

const { createDatabaseAdapter } = require('../dist/database/database-adapter');
const path = require('path');

async function testSqlJsFallback() {
  console.log('Testing sql.js fallback...\n');
  
  const dbPath = path.join(__dirname, '../data/nodes.db');
  
  try {
    console.log('Creating database adapter (better-sqlite3 disabled)...');
    const adapter = await createDatabaseAdapter(dbPath);
    
    console.log('\n✅ Database adapter created successfully with sql.js!');
    
    // Test a simple query
    console.log('\nTesting database query...');
    const stmt = adapter.prepare('SELECT COUNT(*) as count FROM nodes');
    const result = stmt.get();
    console.log(`✅ Database contains ${result.count} nodes`);
    
    adapter.close();
    console.log('\n✅ sql.js fallback works correctly!');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testSqlJsFallback();