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

let server: any;

/**
 * Validate required environment variables
 */
function validateEnvironment() {
  const required = ['AUTH_TOKEN'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    logger.error(`Missing required environment variables: ${missing.join(', ')}`);
    console.error(`ERROR: Missing required environment variables: ${missing.join(', ')}`);
    console.error('Generate AUTH_TOKEN with: openssl rand -base64 32');
    process.exit(1);
  }
  
  // Validate AUTH_TOKEN length
  if (process.env.AUTH_TOKEN && process.env.AUTH_TOKEN.length < 32) {
    logger.warn('AUTH_TOKEN should be at least 32 characters for security');
    console.warn('WARNING: AUTH_TOKEN should be at least 32 characters for security');
  }
}

/**
 * Graceful shutdown handler
 */
async function shutdown() {
  logger.info('Shutting down HTTP server...');
  console.log('Shutting down HTTP server...');
  
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
      console.log('HTTP server closed');
      process.exit(0);
    });
    
    // Force shutdown after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
}

export async function startHTTPServer() {
  // Validate environment
  validateEnvironment();
  
  const app = express();
  
  // Parse JSON with strict limits
  app.use(express.json({ 
    limit: '1mb',     // More reasonable than 10mb
    strict: true      // Only accept arrays and objects
  }));
  
  // Security headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });
  
  // CORS configuration for mcp-remote compatibility
  app.use((req, res, next) => {
    const allowedOrigin = process.env.CORS_ORIGIN || '*';
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });
  
  // Request logging middleware
  app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
      contentLength: req.get('content-length')
    });
    next();
  });
  
  // Enhanced health check endpoint
  app.get('/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      mode: 'http',
      version: '2.3.0',
      uptime: Math.floor(process.uptime()),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        unit: 'MB'
      },
      timestamp: new Date().toISOString()
    });
  });
  
  // Main MCP endpoint - Create a new server and transport for each request (stateless)
  app.post('/mcp', async (req: express.Request, res: express.Response): Promise<void> => {
    const startTime = Date.now();
    
    // Simple auth check
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : authHeader;
    
    if (token !== process.env.AUTH_TOKEN) {
      logger.warn('Authentication failed', { 
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
      res.status(401).json({ 
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Unauthorized'
        },
        id: null
      });
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
      
      // Handle the request - Fixed: removed third parameter
      await transport.handleRequest(req, res);
      
      // Log request duration
      const duration = Date.now() - startTime;
      logger.info('MCP request completed', { 
        duration,
        method: req.body?.method 
      });
      
      // Clean up on close
      res.on('close', () => {
        logger.debug('Request closed, cleaning up');
        transport.close().catch(err => 
          logger.error('Error closing transport:', err)
        );
      });
    } catch (error) {
      logger.error('MCP request error:', error);
      const duration = Date.now() - startTime;
      logger.error('MCP request failed', { duration });
      
      if (!res.headersSent) {
        res.status(500).json({ 
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
            data: process.env.NODE_ENV === 'development' 
              ? (error as Error).message 
              : undefined
          },
          id: null
        });
      }
    }
  });
  
  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ 
      error: 'Not found',
      message: `Cannot ${req.method} ${req.path}`
    });
  });
  
  // Error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error('Express error handler:', err);
    
    if (!res.headersSent) {
      res.status(500).json({ 
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
          data: process.env.NODE_ENV === 'development' ? err.message : undefined
        },
        id: null
      });
    }
  });
  
  const port = parseInt(process.env.PORT || '3000');
  const host = process.env.HOST || '0.0.0.0';
  
  server = app.listen(port, host, () => {
    logger.info(`n8n MCP HTTP Server started`, { port, host });
    console.log(`n8n MCP HTTP Server running on ${host}:${port}`);
    console.log(`Health check: http://localhost:${port}/health`);
    console.log(`MCP endpoint: http://localhost:${port}/mcp`);
    console.log('\nPress Ctrl+C to stop the server');
  });
  
  // Handle errors
  server.on('error', (error: any) => {
    if (error.code === 'EADDRINUSE') {
      logger.error(`Port ${port} is already in use`);
      console.error(`ERROR: Port ${port} is already in use`);
      process.exit(1);
    } else {
      logger.error('Server error:', error);
      console.error('Server error:', error);
      process.exit(1);
    }
  });
  
  // Graceful shutdown handlers
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  
  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    console.error('Uncaught exception:', error);
    shutdown();
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection:', reason);
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    shutdown();
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