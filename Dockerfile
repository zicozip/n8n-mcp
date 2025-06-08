# Production stage
FROM node:18-alpine

# Install SQLite (for database management)
RUN apk add --no-cache sqlite

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built files
COPY dist ./dist
COPY tests ./tests
COPY scripts ./scripts

# Create data directory for SQLite database
RUN mkdir -p /app/data

# Create a non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Change ownership (including data directory)
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Set environment variable for database location
ENV NODE_DB_PATH=/app/data/nodes-v2.db

# Create a startup script
RUN printf '#!/bin/sh\n\
echo "🚀 Starting n8n Documentation MCP server..."\n\
\n\
# Initialize database if it does not exist\n\
if [ ! -f "$NODE_DB_PATH" ]; then\n\
  echo "📦 Initializing database..."\n\
  node dist/scripts/rebuild-database-v2.js\n\
fi\n\
\n\
echo "🎯 Database ready, starting documentation server..."\n\
exec node dist/index-v2.js\n' > /app/start.sh && chmod +x /app/start.sh

# Expose the MCP server port (if using HTTP transport)
EXPOSE 3000

# Volume for persistent database storage
VOLUME ["/app/data"]

# Start the MCP server with database initialization
CMD ["/bin/sh", "/app/start.sh"]