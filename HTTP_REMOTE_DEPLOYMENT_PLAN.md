# HTTP Remote Deployment Plan for n8n-MCP

## Executive Summary

This document outlines the comprehensive plan to transform the n8n-MCP server from a local stdio-based implementation to a remote HTTP-accessible service that can be deployed on the internet and accessed by Claude Desktop users from anywhere.

## Current State Analysis

### Current Architecture
- **Transport**: StdioServerTransport (requires local execution)
- **Communication**: stdin/stdout between Claude Desktop and the MCP server
- **Deployment**: Must run on the same machine as Claude Desktop
- **Authentication**: None (implicit trust from local execution)
- **State Management**: Single instance per process

### Limitations
1. Users must install and maintain the server locally
2. No centralized updates or management
3. Limited to single-user scenarios
4. Requires Node.js and dependencies on client machine

## Target Architecture

### Goals
1. Deploy n8n-MCP server on remote infrastructure (VPS, cloud, etc.)
2. Enable multiple Claude Desktop users to connect to a single server instance
3. Maintain security through authentication and encryption
4. Support both local (stdio) and remote (HTTP) modes for flexibility

### Technical Requirements

#### 1. HTTP Transport Implementation
- Use `StreamableHTTPServerTransport` from `@modelcontextprotocol/sdk`
- Implement session management for stateful connections
- Support JSON-RPC 2.0 protocol over HTTP
- Handle both request/response and server-sent events

#### 2. Authentication & Security
- Implement Bearer token authentication
- Use HTTPS/TLS for all communications
- Consider OAuth2 for advanced scenarios
- Rate limiting and DDoS protection

#### 3. Infrastructure Requirements
- HTTP server (Express.js recommended)
- SSL certificates (Let's Encrypt)
- Reverse proxy (nginx/Caddy)
- Process manager (PM2)
- Domain name for stable endpoint

## Implementation Plan

### Phase 1: Core HTTP Server Implementation

#### 1.1 Create HTTP Server Module
```typescript
// src/mcp/http-server.ts
import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { N8NDocumentationMCPServer } from './server-update';

interface Session {
  id: string;
  transport: StreamableHTTPServerTransport;
  server: N8NDocumentationMCPServer;
  lastActivity: Date;
}
```

#### 1.2 Session Management
- Implement session creation and cleanup
- Handle concurrent sessions
- Add session timeout (e.g., 30 minutes)
- Store session state in memory (consider Redis for production)

#### 1.3 Authentication Middleware
```typescript
const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token || token !== process.env.AUTH_TOKEN) {
    return res.sendStatus(401);
  }
  
  next();
};
```

### Phase 2: Dual-Mode Support

#### 2.1 Configuration System
```typescript
interface ServerConfig {
  mode: 'stdio' | 'http';
  http?: {
    port: number;
    host: string;
    authToken: string;
    ssl?: {
      cert: string;
      key: string;
    };
  };
}
```

#### 2.2 Entry Point Refactoring
- Create unified entry point that can start either stdio or HTTP server
- Use environment variables or CLI arguments for mode selection
- Maintain backward compatibility with existing stdio mode

### Phase 3: Client Adapter Implementation

#### 3.1 mcp-remote Integration
Since Claude Desktop doesn't natively support HTTP transport yet, we need to:
1. Document how to use `mcp-remote` adapter
2. Create wrapper scripts for easy setup
3. Provide configuration examples

#### 3.2 Claude Desktop Configuration
```json
{
  "mcpServers": {
    "n8n-documentation-remote": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://your-server.com/mcp",
        "--auth-token", "your-auth-token"
      ]
    }
  }
}
```

### Phase 4: Deployment Infrastructure

#### 4.1 Docker Container
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm ci --only=production
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "start:http"]
```

#### 4.2 Nginx Configuration
```nginx
server {
    listen 443 ssl http2;
    server_name mcp.your-domain.com;
    
    ssl_certificate /etc/letsencrypt/live/mcp.your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mcp.your-domain.com/privkey.pem;
    
    location /mcp {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### 4.3 PM2 Configuration
```json
{
  "apps": [{
    "name": "n8n-mcp-server",
    "script": "./dist/mcp/http-server.js",
    "env": {
      "NODE_ENV": "production",
      "PORT": 3000,
      "AUTH_TOKEN": "your-secure-token"
    }
  }]
}
```

## Technical Challenges & Solutions

### 1. State Management
**Challenge**: MCP servers can be stateful, but HTTP is stateless by nature.
**Solution**: Implement session management with unique session IDs in headers.

### 2. Authentication with mcp-remote
**Challenge**: mcp-remote needs to pass authentication to the remote server.
**Solution**: Use environment variables or command-line arguments for auth tokens.

### 3. Database Access
**Challenge**: Multiple concurrent sessions accessing SQLite database.
**Solution**: Our database adapter already handles this; sql.js runs in-memory with persistence.

### 4. Performance & Scaling
**Challenge**: Single server instance handling multiple clients.
**Solution**: 
- Implement connection pooling
- Add caching layer for frequently accessed data
- Consider horizontal scaling with load balancer

### 5. Security
**Challenge**: Exposing MCP server to the internet.
**Solution**:
- Mandatory HTTPS
- Strong authentication tokens
- Rate limiting
- Input validation
- Regular security audits

## Implementation Timeline

### Week 1: Core HTTP Server
- [ ] Implement basic HTTP server with Express
- [ ] Integrate StreamableHTTPServerTransport
- [ ] Add session management
- [ ] Implement authentication

### Week 2: Dual-Mode Support
- [ ] Refactor entry points
- [ ] Add configuration system
- [ ] Test both stdio and HTTP modes
- [ ] Update documentation

### Week 3: Client Integration
- [ ] Test with mcp-remote adapter
- [ ] Create setup scripts
- [ ] Document Claude Desktop configuration
- [ ] Create troubleshooting guide

### Week 4: Deployment
- [ ] Create Docker container
- [ ] Set up test deployment
- [ ] Configure nginx/SSL
- [ ] Performance testing
- [ ] Security hardening

## Alternative Approaches

### 1. Cloudflare Workers
- **Pros**: Global edge deployment, built-in DDoS protection
- **Cons**: Limited execution time, stateless by design

### 2. AWS Lambda
- **Pros**: Serverless, auto-scaling
- **Cons**: Cold starts, complex state management

### 3. Dedicated WebSocket Server
- **Pros**: Real-time bidirectional communication
- **Cons**: More complex implementation, not standard MCP transport

## Success Metrics

1. **Functionality**: All MCP tools work identically in remote mode
2. **Performance**: Response time < 200ms for most operations
3. **Reliability**: 99.9% uptime
4. **Security**: No unauthorized access incidents
5. **Usability**: Clear documentation and easy setup

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|---------|------------|
| Claude Desktop HTTP support delayed | High | Use mcp-remote adapter as bridge |
| Security breach | High | Regular audits, penetration testing |
| Performance degradation | Medium | Caching, CDN, horizontal scaling |
| Database corruption | Medium | Regular backups, read replicas |
| Cost overruns | Low | Start with single VPS, scale as needed |

## Next Steps

1. **Validate Approach**: Test StreamableHTTPServerTransport with simple example
2. **Prototype**: Build minimal HTTP server with single tool
3. **Security Review**: Have security expert review authentication approach
4. **Community Feedback**: Share plan with MCP community for input
5. **Begin Implementation**: Start with Phase 1 core server

## Conclusion

Transitioning n8n-MCP to support remote HTTP deployment will significantly expand its usability and reach. While Claude Desktop doesn't yet natively support HTTP transport, the mcp-remote adapter provides a viable bridge solution. The implementation plan balances immediate functionality with future-proofing for when native HTTP support arrives.

The key to success will be maintaining compatibility with existing stdio users while providing a seamless experience for remote users. With proper security measures and careful implementation, n8n-MCP can become a centrally-hosted service that benefits the entire Claude Desktop community.