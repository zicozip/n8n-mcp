/**
 * n8n-MCP - Model Context Protocol Server for n8n
 * Copyright (c) 2024 AiAdvisors Romuald Czlonkowski
 * Licensed under the Sustainable Use License v1.0
 */

import dotenv from 'dotenv';
import { N8NMCPServer } from './mcp/server';
import { MCPServerConfig, N8NConfig } from './types';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

async function main() {
  const config: MCPServerConfig = {
    port: parseInt(process.env.MCP_SERVER_PORT || '3000', 10),
    host: process.env.MCP_SERVER_HOST || 'localhost',
    authToken: process.env.MCP_AUTH_TOKEN,
  };

  const n8nConfig: N8NConfig = {
    apiUrl: process.env.N8N_API_URL || 'http://localhost:5678',
    apiKey: process.env.N8N_API_KEY || '',
  };

  const server = new N8NMCPServer(config, n8nConfig);
  
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