# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
# Install all dependencies including dev for building
RUN npm ci

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build TypeScript
RUN npm run build

# Stage 3: Simple Runtime
FROM node:20-alpine AS runtime
WORKDIR /app

# Install only essential tools (flock is in util-linux)
RUN apk add --no-cache curl su-exec util-linux && \
    rm -rf /var/cache/apk/*

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built application
COPY --from=builder /app/dist ./dist

# Create data directory
RUN mkdir -p /app/data

# Copy necessary source files for database initialization
COPY src/database/schema.sql ./src/database/
COPY scripts ./scripts

# Copy necessary files
COPY .env.example .env.example
COPY LICENSE LICENSE
COPY README.md README.md

# Add container labels
LABEL org.opencontainers.image.source="https://github.com/czlonkowski/n8n-mcp"
LABEL org.opencontainers.image.description="n8n MCP Server - Simple Version"
LABEL org.opencontainers.image.licenses="Sustainable-Use-1.0"
LABEL org.opencontainers.image.vendor="n8n-mcp"
LABEL org.opencontainers.image.title="n8n-mcp"

# Create data directory and fix permissions
RUN mkdir -p /app/data && \
    addgroup -g 1001 -S nodejs && \
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
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://127.0.0.1:3000/health || exit 1

# Entrypoint
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/mcp/index.js"]