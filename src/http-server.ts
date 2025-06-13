#!/usr/bin/env node
/**
 * Minimal HTTP server for n8n-MCP
 * Single-user, stateless design for private deployments
 */
import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { N8NDocumentationMCPServer } from './mcp/server-update';
import { logger } from './utils/logger';
import dotenv from 'dotenv';

dotenv.config();

export async function startHTTPServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  
  // Simple token auth
  const authToken = process.env.AUTH_TOKEN;
  if (!authToken) {
    logger.error('AUTH_TOKEN environment variable required');
    console.error('ERROR: AUTH_TOKEN environment variable is required for HTTP mode');
    console.error('Generate one with: openssl rand -base64 32');
    process.exit(1);
  }
  
  // Request logging middleware
  app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`, {
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
    next();
  });
  
  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      mode: 'http',
      version: '2.3.0'
    });
  });
  
  // Main MCP endpoint - Create a new server and transport for each request (stateless)
  app.post('/mcp', async (req: express.Request, res: express.Response): Promise<void> => {
    // Simple auth check
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : authHeader;
    
    if (token !== authToken) {
      logger.warn('Authentication failed', { ip: req.ip });
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    
    // Create new instances for each request (stateless)
    const mcpServer = new N8NDocumentationMCPServer();
    
    try {
      // Create a stateless transport
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // Stateless mode
      });
      
      // Connect server to transport
      await mcpServer.connect(transport);
      
      // Handle the request
      await transport.handleRequest(req, res, req.body);
      
      // Clean up on close
      res.on('close', () => {
        logger.debug('Request closed, cleaning up');
        transport.close();
      });
    } catch (error) {
      logger.error('MCP request error:', error);
      if (!res.headersSent) {
        res.status(500).json({ 
          error: 'Internal server error',
          message: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
        });
      }
    }
  });
  
  // Error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error('Request error:', err);
    res.status(500).json({ 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  });
  
  const port = parseInt(process.env.PORT || '3000');
  const host = process.env.HOST || '0.0.0.0';
  
  app.listen(port, host, () => {
    logger.info(`n8n MCP HTTP Server started`, { port, host });
    console.log(`n8n MCP HTTP Server running on ${host}:${port}`);
    console.log(`Health check: http://localhost:${port}/health`);
    console.log(`MCP endpoint: http://localhost:${port}/mcp`);
  });
}

// Start if called directly
if (require.main === module) {
  startHTTPServer().catch(error => {
    logger.error('Failed to start HTTP server:', error);
    console.error('Failed to start HTTP server:', error);
    process.exit(1);
  });
}