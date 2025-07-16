# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS builder
WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy package files and tsconfig
COPY package*.json tsconfig.json ./

# Install all dependencies for building (including devDependencies)
RUN npm ci --no-audit --no-fund

# Copy source code
COPY src ./src

# Build the app (transpile TypeScript)
RUN npm run build

# --- Final minimal image ---
FROM node:20-alpine AS runtime
WORKDIR /app

# Install runtime-only OS deps
RUN apk add --no-cache curl && \
    rm -rf /var/cache/apk/*

# Copy only the prod package.json (edit as needed for your setup)
COPY package*.json ./

# Install *production* node_modules only
RUN npm ci --only=production --no-audit --no-fund

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Copy assets, configs, and needed files
COPY data/ ./data/
COPY src/database/schema-optimized.sql ./src/database/
COPY .env.example ./

# Entrypoint script if you use one:
# COPY docker/docker-entrypoint.sh /usr/local/bin/
# RUN chmod +x /usr/local/bin/docker-entrypoint.sh
# ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# Metadata
LABEL org.opencontainers.image.source="https://github.com/czlonkowski/n8n-mcp"
LABEL org.opencontainers.image.description="n8n MCP Server"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.title="n8n-mcp"

# Non-root user (optional, best practice)
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 && chown -R nodejs:nodejs /app
USER nodejs

# Env
ENV NODE_ENV=production
ENV IS_DOCKER=true

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://127.0.0.1:3000/health || exit 1

CMD ["node", "dist/mcp/index.js"]
