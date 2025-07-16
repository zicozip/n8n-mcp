#!/bin/sh
set -e

# Helper function for safe logging (prevents stdio mode corruption)
log_message() {
    [ "$MCP_MODE" != "stdio" ] && echo "$@"
}

# Environment variable validation
if [ "$MCP_MODE" = "http" ] && [ -z "$AUTH_TOKEN" ] && [ -z "$AUTH_TOKEN_FILE" ]; then
    log_message "ERROR: AUTH_TOKEN or AUTH_TOKEN_FILE is required for HTTP mode" >&2
    exit 1
fi

# Validate AUTH_TOKEN_FILE if provided
if [ -n "$AUTH_TOKEN_FILE" ] && [ ! -f "$AUTH_TOKEN_FILE" ]; then
    log_message "ERROR: AUTH_TOKEN_FILE specified but file not found: $AUTH_TOKEN_FILE" >&2
    exit 1
fi

# Database path configuration - respect NODE_DB_PATH if set
if [ -n "$NODE_DB_PATH" ]; then
    # Basic validation - must end with .db
    case "$NODE_DB_PATH" in
        *.db) ;;
        *) log_message "ERROR: NODE_DB_PATH must end with .db" >&2; exit 1 ;;
    esac
    
    # Use the path as-is (Docker paths should be absolute anyway)
    DB_PATH="$NODE_DB_PATH"
else
    DB_PATH="/app/data/nodes.db"
fi

DB_DIR=$(dirname "$DB_PATH")

# Ensure database directory exists with correct ownership
if [ ! -d "$DB_DIR" ]; then
    log_message "Creating database directory: $DB_DIR"
    if [ "$(id -u)" = "0" ]; then
        # Create as root but immediately fix ownership
        mkdir -p "$DB_DIR" && chown nodejs:nodejs "$DB_DIR"
    else
        mkdir -p "$DB_DIR"
    fi
fi

# Database initialization with file locking to prevent race conditions
if [ ! -f "$DB_PATH" ]; then
    log_message "Database not found at $DB_PATH. Initializing..."
    # Use a lock file to prevent multiple containers from initializing simultaneously
    (
        flock -x 200
        # Double-check inside the lock
        if [ ! -f "$DB_PATH" ]; then
            log_message "Initializing database at $DB_PATH..."
            cd /app && NODE_DB_PATH="$DB_PATH" node dist/scripts/rebuild.js || {
                log_message "ERROR: Database initialization failed" >&2
                exit 1
            }
        fi
    ) 200>"$DB_DIR/.db.lock"
fi

# Fix permissions if running as root (for development)
if [ "$(id -u)" = "0" ]; then
    log_message "Running as root, fixing permissions..."
    chown -R nodejs:nodejs "$DB_DIR"
    # Also ensure /app/data exists for backward compatibility
    if [ -d "/app/data" ]; then
        chown -R nodejs:nodejs /app/data
    fi
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
if [ "$MCP_MODE" = "stdio" ]; then
    # Debug: Log to stderr to check if wrapper exists
    if [ "$DEBUG_DOCKER" = "true" ]; then
        echo "MCP_MODE is stdio, checking for wrapper..." >&2
        ls -la /app/dist/mcp/stdio-wrapper.js >&2 || echo "Wrapper not found!" >&2
    fi
    
    if [ -f "/app/dist/mcp/stdio-wrapper.js" ]; then
        # Use the stdio wrapper for clean JSON-RPC output
        exec node /app/dist/mcp/stdio-wrapper.js
    else
        # Fallback: run with explicit environment
        exec env MCP_MODE=stdio DISABLE_CONSOLE_OUTPUT=true LOG_LEVEL=error node /app/dist/mcp/index.js
    fi
else
    # HTTP mode or other
    exec "$@"
fi