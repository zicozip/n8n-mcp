# HTTP Implementation Technical Guide

## Deep Technical Analysis

### Current MCP Transport Mechanism

The current implementation uses `StdioServerTransport` which:
1. Reads JSON-RPC messages from stdin
2. Writes responses to stdout
3. Maintains a single, persistent connection
4. Has implicit trust (local execution)

### Target HTTP Transport Mechanism

The `StreamableHTTPServerTransport`:
1. Accepts HTTP POST requests with JSON-RPC payloads
2. Can upgrade to Server-Sent Events (SSE) for server-initiated messages
3. Requires session management for state persistence
4. Needs explicit authentication

## Detailed Implementation Steps

### Step 1: Install Required Dependencies

```bash
npm install express cors helmet compression dotenv
npm install --save-dev @types/express @types/cors
```

### Step 2: Create HTTP Server Structure

```typescript
// src/mcp/transports/http-transport.ts
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { randomUUID } from 'crypto';
import { 
  StreamableHTTPServerTransport,
  StreamableHTTPServerTransportOptions 
} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { logger } from '../../utils/logger';

export interface HTTPServerConfig {
  port: number;
  host: string;
  authToken?: string;
  corsOrigins?: string[];
  sessionTimeout?: number; // in milliseconds
  maxSessions?: number;
}

export interface MCPSession {
  id: string;
  transport: StreamableHTTPServerTransport;
  server: any; // Your MCP server instance
  createdAt: Date;
  lastActivity: Date;
  metadata?: Record<string, any>;
}

export class HTTPTransportServer {
  private app: express.Application;
  private sessions: Map<string, MCPSession> = new Map();
  private config: HTTPServerConfig;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: HTTPServerConfig) {
    this.config = {
      sessionTimeout: 30 * 60 * 1000, // 30 minutes default
      maxSessions: 100,
      ...config
    };
    
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.startSessionCleanup();
  }

  private setupMiddleware(): void {
    // Security headers
    this.app.use(helmet());
    
    // CORS configuration
    this.app.use(cors({
      origin: this.config.corsOrigins || true,
      credentials: true,
      methods: ['POST', 'GET', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'MCP-Session-ID']
    }));
    
    // Compression
    this.app.use(compression());
    
    // JSON parsing with size limit
    this.app.use(express.json({ limit: '10mb' }));
    
    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        sessionId: req.headers['mcp-session-id'],
        ip: req.ip
      });
      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        sessions: this.sessions.size,
        uptime: process.uptime()
      });
    });
    
    // Main MCP endpoint
    this.app.post('/mcp', 
      this.authenticateRequest.bind(this),
      this.handleMCPRequest.bind(this)
    );
    
    // Session management endpoint
    this.app.get('/sessions',
      this.authenticateRequest.bind(this),
      (req, res) => {
        const sessionInfo = Array.from(this.sessions.entries()).map(([id, session]) => ({
          id,
          createdAt: session.createdAt,
          lastActivity: session.lastActivity,
          metadata: session.metadata
        }));
        res.json({ sessions: sessionInfo });
      }
    );
  }

  private authenticateRequest(req: Request, res: Response, next: NextFunction): void {
    if (!this.config.authToken) {
      return next();
    }
    
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : authHeader;
    
    if (token !== this.config.authToken) {
      logger.warn('Authentication failed', { ip: req.ip });
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    next();
  }

  private async handleMCPRequest(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = req.headers['mcp-session-id'] as string;
      let session = sessionId ? this.sessions.get(sessionId) : null;
      
      // Create new session if needed
      if (!session) {
        if (this.sessions.size >= this.config.maxSessions!) {
          return res.status(503).json({ error: 'Server at capacity' });
        }
        
        session = await this.createSession();
        res.setHeader('MCP-Session-ID', session.id);
      }
      
      // Update last activity
      session.lastActivity = new Date();
      
      // Handle the request through the transport
      await session.transport.handleRequest(req, res);
      
    } catch (error) {
      logger.error('Error handling MCP request', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async createSession(): Promise<MCPSession> {
    const id = randomUUID();
    const transport = new StreamableHTTPServerTransport();
    
    // Create your MCP server instance here
    const { N8NDocumentationMCPServer } = await import('../server-update');
    const server = new N8NDocumentationMCPServer();
    
    // Connect transport to server
    await server.connect(transport);
    
    const session: MCPSession = {
      id,
      transport,
      server,
      createdAt: new Date(),
      lastActivity: new Date()
    };
    
    this.sessions.set(id, session);
    logger.info('Created new session', { sessionId: id });
    
    return session;
  }

  private startSessionCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const timeout = this.config.sessionTimeout!;
      
      for (const [id, session] of this.sessions.entries()) {
        if (now - session.lastActivity.getTime() > timeout) {
          this.destroySession(id);
        }
      }
    }, 60000); // Check every minute
  }

  private destroySession(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      // Cleanup server resources
      if (session.server && typeof session.server.close === 'function') {
        session.server.close();
      }
      
      this.sessions.delete(id);
      logger.info('Destroyed session', { sessionId: id });
    }
  }

  public start(): void {
    this.app.listen(this.config.port, this.config.host, () => {
      logger.info(`HTTP MCP Server listening on ${this.config.host}:${this.config.port}`);
    });
  }

  public stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    // Cleanup all sessions
    for (const id of this.sessions.keys()) {
      this.destroySession(id);
    }
  }
}
```

### Step 3: Modify MCP Server for Transport Flexibility

```typescript
// src/mcp/server-update.ts modifications
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Transport } from '@modelcontextprotocol/sdk/types.js';

export class N8NDocumentationMCPServer {
  private server: Server;
  // ... existing code ...

  // Add connect method to accept any transport
  async connect(transport: Transport): Promise<void> {
    await this.ensureInitialized();
    await this.server.connect(transport);
    logger.info('MCP Server connected with transport', { 
      transportType: transport.constructor.name 
    });
  }

  // Modify run method to be transport-agnostic
  async run(transport?: Transport): Promise<void> {
    await this.ensureInitialized();
    
    if (!transport) {
      // Default to stdio for backward compatibility
      transport = new StdioServerTransport();
    }
    
    await this.connect(transport);
    logger.info('n8n Documentation MCP Server running');
  }
}
```

### Step 4: Create Unified Entry Point

```typescript
// src/mcp/index-universal.ts
#!/usr/bin/env node
import { N8NDocumentationMCPServer } from './server-update';
import { HTTPTransportServer } from './transports/http-transport';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { logger } from '../utils/logger';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface CLIArgs {
  mode: 'stdio' | 'http';
  port?: number;
  host?: string;
  authToken?: string;
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const config: CLIArgs = {
    mode: 'stdio' // default
  };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--mode':
        config.mode = args[++i] as 'stdio' | 'http';
        break;
      case '--port':
        config.port = parseInt(args[++i]);
        break;
      case '--host':
        config.host = args[++i];
        break;
      case '--auth-token':
        config.authToken = args[++i];
        break;
    }
  }
  
  // Allow environment variables to override
  config.mode = (process.env.MCP_MODE as any) || config.mode;
  config.port = parseInt(process.env.MCP_PORT || '') || config.port || 3000;
  config.host = process.env.MCP_HOST || config.host || '0.0.0.0';
  config.authToken = process.env.MCP_AUTH_TOKEN || config.authToken;
  
  return config;
}

async function main() {
  try {
    const config = parseArgs();
    logger.info('Starting MCP server', config);
    
    if (config.mode === 'http') {
      // HTTP mode - server manages its own lifecycle
      const httpServer = new HTTPTransportServer({
        port: config.port!,
        host: config.host!,
        authToken: config.authToken,
        corsOrigins: process.env.MCP_CORS_ORIGINS?.split(','),
        sessionTimeout: parseInt(process.env.MCP_SESSION_TIMEOUT || '') || undefined,
        maxSessions: parseInt(process.env.MCP_MAX_SESSIONS || '') || undefined
      });
      
      httpServer.start();
      
      // Graceful shutdown
      process.on('SIGINT', () => {
        logger.info('Shutting down HTTP server...');
        httpServer.stop();
        process.exit(0);
      });
      
    } else {
      // Stdio mode - traditional single instance
      const server = new N8NDocumentationMCPServer();
      await server.run(); // Uses stdio by default
    }
    
  } catch (error) {
    logger.error('Failed to start MCP server', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
```

### Step 5: Environment Configuration

```bash
# .env.example
# Server mode: stdio or http
MCP_MODE=http

# HTTP server configuration
MCP_PORT=3000
MCP_HOST=0.0.0.0
MCP_AUTH_TOKEN=your-secure-token-here

# CORS origins (comma-separated)
MCP_CORS_ORIGINS=https://claude.ai,http://localhost:3000

# Session management
MCP_SESSION_TIMEOUT=1800000  # 30 minutes in milliseconds
MCP_MAX_SESSIONS=100

# Existing configuration
NODE_ENV=production
LOG_LEVEL=info
```

### Step 6: Docker Configuration for Remote Deployment

```dockerfile
# Dockerfile.http
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/data ./data

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"

# Start the server
CMD ["node", "dist/mcp/index-universal.js", "--mode", "http"]
```

### Step 7: Production Deployment Script

```bash
#!/bin/bash
# deploy.sh

# Configuration
DOMAIN="mcp.your-domain.com"
EMAIL="your-email@example.com"
AUTH_TOKEN=$(openssl rand -base64 32)

# Update system
sudo apt update && sudo apt upgrade -y

# Install dependencies
sudo apt install -y docker.io docker-compose nginx certbot python3-certbot-nginx

# Clone repository
git clone https://github.com/yourusername/n8n-mcp.git
cd n8n-mcp

# Create .env file
cat > .env << EOF
MCP_MODE=http
MCP_PORT=3000
MCP_HOST=0.0.0.0
MCP_AUTH_TOKEN=$AUTH_TOKEN
MCP_CORS_ORIGINS=https://claude.ai
NODE_ENV=production
LOG_LEVEL=info
EOF

# Build and run with Docker
docker build -f Dockerfile.http -t n8n-mcp-http .
docker run -d \
  --name n8n-mcp \
  --restart always \
  -p 127.0.0.1:3000:3000 \
  --env-file .env \
  n8n-mcp-http

# Configure Nginx
sudo tee /etc/nginx/sites-available/mcp << EOF
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN;
    
    # SSL will be configured by certbot
    
    location /mcp {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Timeouts for long-running requests
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    location /health {
        proxy_pass http://127.0.0.1:3000;
    }
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/mcp /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Get SSL certificate
sudo certbot --nginx -d $DOMAIN --email $EMAIL --agree-tos --non-interactive

echo "Deployment complete!"
echo "Your MCP server is available at: https://$DOMAIN/mcp"
echo "Auth token: $AUTH_TOKEN"
echo "Save this token - you'll need it for client configuration"
```

### Step 8: Client Configuration with mcp-remote

```json
// claude_desktop_config.json for remote server
{
  "mcpServers": {
    "n8n-remote": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote@latest",
        "connect",
        "https://mcp.your-domain.com/mcp"
      ],
      "env": {
        "MCP_AUTH_TOKEN": "your-auth-token-here"
      }
    }
  }
}
```

### Step 9: Monitoring and Logging

```typescript
// src/utils/monitoring.ts
import { Request, Response, NextFunction } from 'express';

export interface RequestMetrics {
  path: string;
  method: string;
  statusCode: number;
  duration: number;
  sessionId?: string;
  timestamp: Date;
}

export class MonitoringService {
  private metrics: RequestMetrics[] = [];
  
  public middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const metric: RequestMetrics = {
          path: req.path,
          method: req.method,
          statusCode: res.statusCode,
          duration: Date.now() - start,
          sessionId: req.headers['mcp-session-id'] as string,
          timestamp: new Date()
        };
        
        this.metrics.push(metric);
        
        // Keep only last 1000 metrics in memory
        if (this.metrics.length > 1000) {
          this.metrics.shift();
        }
      });
      
      next();
    };
  }
  
  public getMetrics() {
    return {
      requests: this.metrics.length,
      avgDuration: this.calculateAverage('duration'),
      errorRate: this.calculateErrorRate(),
      activeSessions: new Set(this.metrics.map(m => m.sessionId)).size
    };
  }
  
  private calculateAverage(field: keyof RequestMetrics): number {
    if (this.metrics.length === 0) return 0;
    const sum = this.metrics.reduce((acc, m) => acc + (m[field] as number || 0), 0);
    return sum / this.metrics.length;
  }
  
  private calculateErrorRate(): number {
    if (this.metrics.length === 0) return 0;
    const errors = this.metrics.filter(m => m.statusCode >= 400).length;
    return errors / this.metrics.length;
  }
}
```

## Security Considerations

### 1. Authentication Token Management
- Use strong, random tokens (minimum 32 characters)
- Rotate tokens regularly
- Never commit tokens to version control
- Use environment variables or secret management systems

### 2. Rate Limiting
```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});

app.use('/mcp', limiter);
```

### 3. Input Validation
- Validate JSON-RPC structure
- Limit request body size
- Sanitize any user inputs
- Use schema validation for MCP tool parameters

### 4. HTTPS/TLS
- Always use HTTPS in production
- Use strong TLS configurations
- Enable HSTS headers
- Consider certificate pinning for high-security deployments

## Performance Optimization

### 1. Database Connection Pooling
Since we're using SQLite through our adapter, consider:
- Read-only replicas for query operations
- In-memory caching for frequently accessed nodes
- Connection pooling if switching to PostgreSQL

### 2. Response Caching
```typescript
const nodeCache = new NodeCache({ stdTTL: 600 }); // 10 minute cache

// In your tool handlers
const cachedResult = nodeCache.get(cacheKey);
if (cachedResult) {
  return cachedResult;
}
```

### 3. Compression
- Already implemented with compression middleware
- Consider additional optimizations for large responses

### 4. CDN Integration
- Serve static assets through CDN
- Cache API responses where appropriate
- Use geographic distribution for global access

## Testing Strategy

### 1. Unit Tests
```typescript
// src/test/http-transport.test.ts
describe('HTTPTransportServer', () => {
  it('should create new session on first request', async () => {
    // Test implementation
  });
  
  it('should reuse existing session', async () => {
    // Test implementation
  });
  
  it('should cleanup expired sessions', async () => {
    // Test implementation
  });
});
```

### 2. Integration Tests
- Test full request/response cycle
- Verify authentication
- Test session persistence
- Validate error handling

### 3. Load Testing
```bash
# Using Apache Bench
ab -n 1000 -c 10 -H "Authorization: Bearer your-token" https://your-server/mcp

# Using k6
k6 run load-test.js
```

## Troubleshooting Guide

### Common Issues

1. **Connection Refused**
   - Check firewall rules
   - Verify nginx configuration
   - Ensure Docker container is running

2. **Authentication Failures**
   - Verify token format (Bearer prefix)
   - Check environment variables
   - Ensure token matches server configuration

3. **Session Timeout**
   - Adjust MCP_SESSION_TIMEOUT
   - Check client keep-alive settings
   - Monitor server resources

4. **Performance Issues**
   - Enable monitoring
   - Check database query performance
   - Review nginx access logs
   - Monitor Docker container resources

## Future Enhancements

1. **WebSocket Support**
   - Implement full duplex communication
   - Reduce latency for real-time updates
   - Better support for server-initiated messages

2. **OAuth2 Integration**
   - Support for third-party authentication
   - User-specific access controls
   - Integration with enterprise SSO

3. **Multi-tenancy**
   - Separate databases per organization
   - Role-based access control
   - Usage tracking and quotas

4. **Horizontal Scaling**
   - Redis for session storage
   - Load balancer configuration
   - Distributed caching

## Conclusion

This implementation provides a robust foundation for running n8n-MCP as a remote HTTP service. The dual-mode support ensures backward compatibility while enabling new deployment scenarios. With proper security measures and monitoring in place, this solution can scale from single-user deployments to enterprise-wide installations.