#!/bin/bash

echo "n8n-MCP Claude Desktop Diagnostic"
echo "================================="
echo ""

# Check current directory
echo "1. Current directory:"
pwd
echo ""

# Check git status
echo "2. Git status:"
git log -1 --oneline
git status --short
echo ""

# Check if built
echo "3. Build status:"
if [ -f "dist/mcp/index.js" ]; then
    echo "✅ dist/mcp/index.js exists"
    echo "   Last modified: $(stat -f "%Sm" dist/mcp/index.js 2>/dev/null || stat -c "%y" dist/mcp/index.js 2>/dev/null)"
else
    echo "❌ dist/mcp/index.js not found - run 'npm run build'"
fi

if [ -f "dist/mcp/server-update.js" ]; then
    echo "✅ dist/mcp/server-update.js exists"
    echo "   Last modified: $(stat -f "%Sm" dist/mcp/server-update.js 2>/dev/null || stat -c "%y" dist/mcp/server-update.js 2>/dev/null)"
else
    echo "❌ dist/mcp/server-update.js not found"
fi

if [ -f "dist/mcp/tools-update.js" ]; then
    echo "✅ dist/mcp/tools-update.js exists"
    echo "   Last modified: $(stat -f "%Sm" dist/mcp/tools-update.js 2>/dev/null || stat -c "%y" dist/mcp/tools-update.js 2>/dev/null)"
else
    echo "❌ dist/mcp/tools-update.js not found"
fi
echo ""

# Check database
echo "4. Database status:"
if [ -f "data/nodes.db" ]; then
    echo "✅ data/nodes.db exists"
    echo "   Size: $(du -h data/nodes.db | cut -f1)"
    echo "   Last modified: $(stat -f "%Sm" data/nodes.db 2>/dev/null || stat -c "%y" data/nodes.db 2>/dev/null)"
else
    echo "❌ data/nodes.db not found - run 'npm run rebuild'"
fi
echo ""

# Check tools in compiled code
echo "5. Compiled tools check:"
if [ -f "dist/mcp/tools-update.js" ]; then
    TOOL_COUNT=$(grep "name: '" dist/mcp/tools-update.js | wc -l | tr -d ' ')
    echo "   Total tools found: $TOOL_COUNT"
    echo "   New tools present:"
    for tool in "get_node_for_task" "validate_node_config" "get_property_dependencies" "list_tasks" "search_node_properties" "get_node_essentials"; do
        if grep -q "name: '$tool'" dist/mcp/tools-update.js; then
            echo "   ✅ $tool"
        else
            echo "   ❌ $tool"
        fi
    done
else
    echo "❌ Cannot check - file not found"
fi
echo ""

# Test MCP server
echo "6. MCP server test:"
if [ -f "dist/mcp/index.js" ] && [ -f "data/nodes.db" ]; then
    echo "   Running quick MCP server test..."
    if node test-mcp-tools.js 2>/dev/null | grep -q "get_node_for_task: ✅ Found"; then
        echo "✅ MCP server correctly exposes all new tools"
    else
        echo "❌ MCP server issue detected"
    fi
else
    echo "❌ Cannot test - missing required files"
fi
echo ""

# Check Node.js version
echo "7. Node.js version:"
node --version
echo ""

# Claude Desktop config location
echo "8. Claude Desktop config location:"
if [[ "$OSTYPE" == "darwin"* ]]; then
    CONFIG_PATH="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    CONFIG_PATH="$HOME/.config/Claude/claude_desktop_config.json"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
    CONFIG_PATH="$APPDATA/Claude/claude_desktop_config.json"
fi

if [ -f "$CONFIG_PATH" ]; then
    echo "✅ Config file found at: $CONFIG_PATH"
    echo "   Checking n8n-mcp entry..."
    if grep -q "n8n-mcp" "$CONFIG_PATH" 2>/dev/null; then
        echo "✅ n8n-mcp server configured"
        # Extract the path
        NODE_PATH=$(grep -A5 "n8n-mcp" "$CONFIG_PATH" | grep -o '"args".*\[.*".*"' | sed 's/.*\[\s*"\(.*\)".*/\1/')
        if [ ! -z "$NODE_PATH" ]; then
            echo "   Configured path: $NODE_PATH"
            if [ -f "$NODE_PATH" ]; then
                echo "✅ Path exists"
            else
                echo "❌ Path does not exist!"
            fi
        fi
    else
        echo "❌ n8n-mcp not found in config"
    fi
else
    echo "❌ Config file not found at expected location: $CONFIG_PATH"
fi
echo ""

# Recommended actions
echo "9. Recommended actions:"
echo "   If any ❌ items above:"
echo "   1. git pull                    # Get latest code"
echo "   2. npm install                 # Install dependencies"
echo "   3. npm run build               # Build TypeScript"
echo "   4. npm run rebuild             # Rebuild database"
echo "   5. Update Claude Desktop config with absolute path to $(pwd)/dist/mcp/index.js"
echo "   6. Completely quit and restart Claude Desktop"
echo ""
echo "   If all ✅ but tools still missing in Claude:"
echo "   - Try removing and re-adding the n8n-mcp server in Claude Desktop config"
echo "   - Check Claude Desktop logs: View > Developer > Logs"
echo ""