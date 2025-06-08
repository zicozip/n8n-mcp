#!/usr/bin/env node
/**
 * n8n Documentation MCP Server
 * Copyright (c) 2025 n8n-mcp contributors
 * 
 * This software is licensed under the Sustainable Use License.
 * See the LICENSE file in the root directory of this source tree.
 */

import dotenv from 'dotenv';
import { N8NDocumentationMCPServer } from './mcp/server-v2';
import { MCPServerConfig } from './types';
import { logger } from './utils/logger';
import { NodeDocumentationService } from './services/node-documentation-service';

// Load environment variables
dotenv.config();

async function main() {
  const config: MCPServerConfig = {
    port: parseInt(process.env.MCP_SERVER_PORT || '3000', 10),
    host: process.env.MCP_SERVER_HOST || 'localhost',
    authToken: process.env.MCP_AUTH_TOKEN,
  };

  // Check if we should rebuild the database on startup
  const rebuildOnStart = process.env.REBUILD_ON_START === 'true';
  
  if (rebuildOnStart) {
    logger.info('Rebuilding database on startup...');
    const service = new NodeDocumentationService();
    try {
      const stats = await service.rebuildDatabase();
      logger.info('Database rebuild complete:', stats);
    } catch (error) {
      logger.error('Failed to rebuild database:', error);
      process.exit(1);
    } finally {
      service.close();
    }
  }

  const server = new N8NDocumentationMCPServer(config);
  
  try {
    await server.start();
  } catch (error) {
    logger.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down MCP server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down MCP server...');
  process.exit(0);
});

main().catch((error) => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});