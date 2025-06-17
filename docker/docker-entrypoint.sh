#!/bin/sh
set -e

# Environment variable validation
if [ "$MCP_MODE" = "http" ] && [ -z "$AUTH_TOKEN" ]; then
    echo "ERROR: AUTH_TOKEN is required for HTTP mode"
    exit 1
fi

# Database initialization with file locking to prevent race conditions
if [ ! -f "/app/data/nodes.db" ]; then
    echo "Database not found. Initializing..."
    # Use a lock file to prevent multiple containers from initializing simultaneously
    (
        flock -x 200
        # Double-check inside the lock
        if [ ! -f "/app/data/nodes.db" ]; then
            echo "Initializing database..."
            cd /app && node dist/scripts/rebuild.js || {
                echo "ERROR: Database initialization failed"
                exit 1
            }
        fi
    ) 200>/app/data/.db.lock
fi

# Fix permissions if running as root (for development)
if [ "$(id -u)" = "0" ]; then
    echo "Running as root, fixing permissions..."
    chown -R nodejs:nodejs /app/data
    # Switch to nodejs user (using Alpine's native su)
    exec su nodejs -c "$*"
fi

# Trap signals for graceful shutdown
# In stdio mode, don't output anything to stdout as it breaks JSON-RPC
if [ "$MCP_MODE" = "stdio" ]; then
    # Silent trap - no output at all
    trap 'kill -TERM $PID 2>/dev/null || true' TERM INT EXIT
else
    # In HTTP mode, output to stderr
    trap 'echo "Shutting down..." >&2; kill -TERM $PID 2>/dev/null' TERM INT EXIT
fi

# Execute the main command in background
# In stdio mode, use the wrapper for clean output
if [ "$MCP_MODE" = "stdio" ] && [ -f "/app/dist/mcp/stdio-wrapper.js" ]; then
    node /app/dist/mcp/stdio-wrapper.js &
else
    "$@" &
fi
PID=$!
wait $PID