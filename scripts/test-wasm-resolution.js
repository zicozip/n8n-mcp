#!/usr/bin/env node

const path = require('path');
const fs = require('fs');

console.log('Testing WASM file resolution...\n');

// Show current environment
console.log('Current directory:', process.cwd());
console.log('Script directory:', __dirname);
console.log('Node version:', process.version);
console.log('');

// Test different path resolutions
const testPaths = [
  // Local development path
  path.join(__dirname, '../node_modules/sql.js/dist/sql-wasm.wasm'),
  // When installed as npm package
  path.join(__dirname, '../../sql.js/dist/sql-wasm.wasm'),
  // Alternative npm package path
  path.join(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm'),
];

console.log('Checking potential WASM file locations:');
testPaths.forEach((testPath, index) => {
  const exists = fs.existsSync(testPath);
  console.log(`${index + 1}. ${testPath}`);
  console.log(`   Exists: ${exists ? '✅' : '❌'}`);
});

// Try require.resolve
console.log('\nTrying require.resolve:');
try {
  const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
  console.log('✅ Found via require.resolve:', wasmPath);
  console.log('   Exists:', fs.existsSync(wasmPath) ? '✅' : '❌');
} catch (e) {
  console.log('❌ Failed to resolve via require.resolve:', e.message);
}

// Try to find sql.js package location
console.log('\nTrying to find sql.js package:');
try {
  const sqlJsPath = require.resolve('sql.js');
  console.log('✅ Found sql.js at:', sqlJsPath);
  const sqlJsDir = path.dirname(sqlJsPath);
  const wasmFromSqlJs = path.join(sqlJsDir, '../dist/sql-wasm.wasm');
  console.log('   Derived WASM path:', wasmFromSqlJs);
  console.log('   Exists:', fs.existsSync(wasmFromSqlJs) ? '✅' : '❌');
} catch (e) {
  console.log('❌ Failed to find sql.js package:', e.message);
}