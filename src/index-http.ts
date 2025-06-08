#!/usr/bin/env node
/**
 * n8n Documentation MCP Server
 * Copyright (c) 2025 n8n-mcp contributors
 * 
 * This software is licensed under the Sustainable Use License.
 * See the LICENSE file in the root directory of this source tree.
 */

import dotenv from 'dotenv';
import { N8NDocumentationRemoteServer } from './mcp/remote-server';
import { logger } from './utils/logger';
import * as path from 'path';

// Load environment variables
dotenv.config();

async function main() {
  try {
    // Get configuration from environment
    const config = {
      port: parseInt(process.env.MCP_PORT || '3000', 10),
      host: process.env.MCP_HOST || '0.0.0.0',
      domain: process.env.MCP_DOMAIN || 'localhost',
      authToken: process.env.MCP_AUTH_TOKEN,
      cors: process.env.MCP_CORS === 'true',
      tlsCert: process.env.MCP_TLS_CERT,
      tlsKey: process.env.MCP_TLS_KEY,
    };

    // Validate required configuration
    if (!config.domain || config.domain === 'localhost') {
      logger.warn('MCP_DOMAIN not set or set to localhost. Using default: localhost');
      logger.warn('For production, set MCP_DOMAIN to your actual domain (e.g., n8ndocumentation.aiservices.pl)');
    }

    if (!config.authToken) {
      logger.warn('MCP_AUTH_TOKEN not set. Server will run without authentication.');
      logger.warn('For production, set MCP_AUTH_TOKEN to a secure value.');
    }

    // Set database path if not already set
    if (!process.env.NODE_DB_PATH) {
      process.env.NODE_DB_PATH = path.join(__dirname, '../data/nodes-v2.db');
    }

    logger.info('Starting n8n Documentation MCP Remote Server');
    logger.info('Configuration:', {
      port: config.port,
      host: config.host,
      domain: config.domain,
      cors: config.cors,
      authEnabled: !!config.authToken,
      tlsEnabled: !!(config.tlsCert && config.tlsKey),
      databasePath: process.env.NODE_DB_PATH,
    });

    const server = new N8NDocumentationRemoteServer(config);
    
    // Start the server
    await server.start();

    // Handle graceful shutdown
    const shutdown = async () => {
      logger.info('Received shutdown signal');
      await server.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    logger.info('Server is ready to accept connections');
    logger.info(`Claude Desktop configuration:`);
    logger.info(JSON.stringify({
      "mcpServers": {
        "n8n-nodes-remote": {
          "command": "curl",
          "args": [
            "-X", "POST",
            "-H", "Content-Type: application/json",
            "-H", `Authorization: Bearer ${config.authToken || 'YOUR_AUTH_TOKEN'}`,
            "-d", "@-",
            `https://${config.domain}/mcp`
          ],
          "env": {}
        }
      }
    }, null, 2));

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Run the server
main().catch((error) => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});