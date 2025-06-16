# Optimized Dockerfile - builds database at build time, minimal runtime image

# Stage 1: Dependencies (includes n8n for building)
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
# Configure npm for reliability
RUN npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-timeout 300000
# Install all dependencies including n8n packages
RUN npm ci

# Stage 2: Builder (compiles TypeScript)
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build TypeScript
RUN npm run build

# Stage 3: Database Builder (extracts all node info and builds database)
FROM builder AS db-builder
WORKDIR /app
# Clone n8n-docs for documentation (if available)
# Fix git SSL issues in Alpine and configure git properly
RUN apk add --no-cache git ca-certificates && \
    git config --global http.sslVerify false && \
    git config --global init.defaultBranch main && \
    git clone --depth 1 https://github.com/n8n-io/n8n-docs.git /tmp/n8n-docs 2>/dev/null || \
    echo "Warning: Could not clone n8n-docs, continuing without documentation"
ENV N8N_DOCS_PATH=/tmp/n8n-docs
# Build the complete database with source code
RUN mkdir -p data && \
    npm run rebuild:optimized || \
    (echo "Warning: Optimized rebuild failed, trying regular rebuild" && \
     npm run rebuild) || \
    (echo "Error: Database build failed" && exit 1)

# Stage 4: Minimal Runtime (no n8n packages)
FROM node:20-alpine AS runtime
WORKDIR /app

# Install only essential runtime tools
RUN apk add --no-cache curl && \
    rm -rf /var/cache/apk/*

# Create package.json with only runtime dependencies
RUN echo '{ \
  "name": "n8n-mcp-runtime", \
  "version": "1.0.0", \
  "private": true, \
  "dependencies": { \
    "@modelcontextprotocol/sdk": "^1.12.1", \
    "better-sqlite3": "^11.10.0", \
    "sql.js": "^1.13.0", \
    "express": "^5.1.0", \
    "dotenv": "^16.5.0" \
  } \
}' > package.json

# Install only runtime dependencies
RUN npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm install --production --no-audit --no-fund

# Copy built application
COPY --from=builder /app/dist ./dist

# Copy pre-built database with all source code
COPY --from=db-builder /app/data/nodes.db ./data/

# Copy minimal required files
COPY src/database/schema-optimized.sql ./src/database/
COPY .env.example ./

# Add container labels
LABEL org.opencontainers.image.source="https://github.com/czlonkowski/n8n-mcp"
LABEL org.opencontainers.image.description="n8n MCP Server - Optimized Version"
LABEL org.opencontainers.image.licenses="Sustainable-Use-1.0"
LABEL org.opencontainers.image.title="n8n-mcp-optimized"

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

# Copy entrypoint script
COPY docker/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Switch to non-root user
USER nodejs

# Expose HTTP port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://127.0.0.1:3000/health || exit 1

# Optimized entrypoint
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/mcp/index.js"]