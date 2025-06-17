#!/usr/bin/env node

/**
 * Stdio wrapper for MCP server
 * Ensures clean JSON-RPC communication by suppressing all non-JSON output
 */

// Suppress all console output before anything else
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleInfo = console.info;
const originalConsoleDebug = console.debug;

// Override all console methods
console.log = () => {};
console.error = () => {};
console.warn = () => {};
console.info = () => {};
console.debug = () => {};

// Set environment to ensure logger suppression
process.env.MCP_MODE = 'stdio';
process.env.DISABLE_CONSOLE_OUTPUT = 'true';
process.env.LOG_LEVEL = 'error';

// Import and run the server
import { N8NDocumentationMCPServer } from './server-update';

async function main() {
  try {
    const server = new N8NDocumentationMCPServer();
    await server.run();
  } catch (error) {
    // In case of fatal error, output to stderr only
    originalConsoleError('Fatal error:', error);
    process.exit(1);
  }
}

// Handle uncaught errors silently
process.on('uncaughtException', (error) => {
  originalConsoleError('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  originalConsoleError('Unhandled rejection:', reason);
  process.exit(1);
});

main();