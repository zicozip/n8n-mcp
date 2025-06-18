# syntax=docker/dockerfile:1.7
# Ultra-optimized Dockerfile - no n8n dependencies needed at runtime

# Stage 1: Builder (TypeScript compilation only)
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install ONLY TypeScript for compilation (no n8n deps)
RUN --mount=type=cache,target=/root/.npm \
    npm install --no-save typescript @types/node @types/express

# Copy source and build
COPY src ./src
RUN npx tsc

# Stage 2: Runtime (minimal dependencies)
FROM node:20-alpine AS runtime
WORKDIR /app

# Install only essential runtime tools
RUN apk add --no-cache curl && \
    rm -rf /var/cache/apk/*

# Copy runtime-only package.json
COPY package.runtime.json package.json

# Install runtime dependencies with cache mount
RUN --mount=type=cache,target=/root/.npm \
    npm install --production --no-audit --no-fund

# Copy built application
COPY --from=builder /app/dist ./dist

# Copy pre-built database and required files
COPY data/nodes.db ./data/
COPY src/database/schema-optimized.sql ./src/database/
COPY .env.example ./

# Copy entrypoint script
COPY docker/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Add container labels
LABEL org.opencontainers.image.source="https://github.com/czlonkowski/n8n-mcp"
LABEL org.opencontainers.image.description="n8n MCP Server - Runtime Only"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.title="n8n-mcp"

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Set Docker environment flag
ENV IS_DOCKER=true

# Expose HTTP port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://127.0.0.1:3000/health || exit 1

# Optimized entrypoint
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/mcp/index.js"]