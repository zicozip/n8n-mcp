#!/usr/bin/env node

import { N8NDocumentationMCPServer } from './server-update';
import { logger } from '../utils/logger';

// Add error details to stderr for Claude Desktop debugging
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  logger.error('Unhandled Rejection:', reason);
  process.exit(1);
});

async function main() {
  try {
    const mode = process.env.MCP_MODE || 'stdio';
    
    console.error(`Starting n8n Documentation MCP Server in ${mode} mode...`);
    console.error('Current directory:', process.cwd());
    console.error('Node version:', process.version);
    
    if (mode === 'http') {
      // HTTP mode - for remote deployment with single-session architecture
      const { SingleSessionHTTPServer } = await import('../http-server-single-session');
      const server = new SingleSessionHTTPServer();
      
      // Graceful shutdown handlers
      const shutdown = async () => {
        await server.shutdown();
        process.exit(0);
      };
      
      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);
      
      await server.start();
    } else {
      // Stdio mode - for local Claude Desktop
      const server = new N8NDocumentationMCPServer();
      await server.run();
    }
  } catch (error) {
    console.error('Failed to start MCP server:', error);
    logger.error('Failed to start MCP server', error);
    
    // Provide helpful error messages
    if (error instanceof Error && error.message.includes('nodes.db not found')) {
      console.error('\nTo fix this issue:');
      console.error('1. cd to the n8n-mcp directory');
      console.error('2. Run: npm run build');
      console.error('3. Run: npm run rebuild');
    } else if (error instanceof Error && error.message.includes('NODE_MODULE_VERSION')) {
      console.error('\nTo fix this Node.js version mismatch:');
      console.error('1. cd to the n8n-mcp directory');
      console.error('2. Run: npm rebuild better-sqlite3');
      console.error('3. If that doesn\'t work, try: rm -rf node_modules && npm install');
    }
    
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}