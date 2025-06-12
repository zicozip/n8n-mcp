#!/usr/bin/env node

import { N8NDocumentationMCPServer } from './server-update';
import { logger } from '../utils/logger';

async function main() {
  try {
    const server = new N8NDocumentationMCPServer();
    await server.run();
  } catch (error) {
    logger.error('Failed to start MCP server', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}