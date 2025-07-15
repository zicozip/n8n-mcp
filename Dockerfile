# syntax=docker/dockerfile:1.7
# Ultra-optimized Dockerfile for Railway deployment of n8n-mcp

# --- Stage 1: Builder ---
FROM node:20-alpine AS builder
WORKDIR /app

# Install build dependencies only (no n8n runtime packages)
COPY tsconfig.json ./
RUN --mount=type=cache,id=builder-npm-cache,target=/root/.npm \
    echo '{}' > package.json && \
    npm install --no-save typescript@^5.8.3 @types/node@^22.15.30 @types/express@^5.0.3 \
        @modelcontextprotocol/sdk@^1.12.1 dotenv@^16.5.0 express@^5.1.0 axios@^1.10.0 \
        n8n-workflow@^1.96.0 uuid@^11.0.5 @types/uuid@^10.0.0

COPY src ./src
RUN npx tsc

# --- Stage 2: Runtime ---
FROM node:20-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache curl && rm -rf /var/cache/apk/*

# Use only runtime deps
COPY package.runtime.json package.json
RUN --mount=type=cache,id=runtime-npm-cache,target=/root/.npm \
    npm install --production --no-audit --no-fund

# Copy built app and essential files
COPY --from=builder /app/dist ./dist
COPY data/nodes.db ./data/
COPY src/database/schema-optimized.sql ./src/database/
COPY .env.example ./

# Container labels
LABEL org.opencontainers.image.source="https://github.com/czlonkowski/n8n-mcp"
LABEL org.opencontainers.image.description="n8n MCP Server - Runtime Only"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.title="n8n-mcp"

# Run as non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app
USER nodejs

ENV IS_DOCKER=true

# Railway exposes $PORT, but default to 3000 if not set
EXPOSE 3000

# Healthcheck respects dynamic port
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://127.0.0.1:${PORT:-3000}/health || exit 1

# Main CMD: always run HTTP mode (so Claude etc can reach it, and Railway works)
CMD ["node", "dist/mcp/index.js", "--http"]
