# 🚀 Claude Desktop Can Now Build Perfect n8n Workflows - Thanks to MCP

Hey n8n community! 👋

**TL;DR:** I built an MCP server that gives Claude Desktop complete, up-to-date knowledge of all 525 n8n nodes. Now it can build workflows perfectly on the first try. What used to take 45 minutes with errors now takes 3 minutes with zero mistakes.

## The Problem

Remember when Claude would guess node names wrong and mix up properties? 

```
Me: "Create a Slack webhook workflow"
Claude: "Use slackNode with message property..."
Me: "It's 'slack' with 'text' property..."
Claude: "Oh, webhookTrigger then?"
Me: "Just 'webhook'..."
```

45 painful minutes later, maybe you'd have a working workflow.

## The Solution: n8n-MCP

Now Claude has direct access to:
- ✅ **All 525 n8n nodes** with complete documentation
- ✅ **Every property and operation** (no more guessing!)
- ✅ **Working examples** for common tasks
- ✅ **Real-time validation** before deployment

Result: **45 minutes → 3 minutes**, **6 errors → 0 errors**

## Quick Installation (5 Minutes)

Add this to your Claude Desktop config:
```json
{
  "mcpServers": {
    "n8n-mcp": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "--pull", "always",
        "ghcr.io/czlonkowski/n8n-mcp:latest"
      ]
    }
  }
}
```

**Config locations:**
- Mac: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Restart Claude Desktop and you're done! 🎉

## What You Can Do Now

Ask Claude to:
- "Build a workflow that monitors RSS feeds and posts to Discord"
- "Create an API endpoint that validates data and saves to Postgres"
- "Set up a daily report that pulls from multiple sources"

Claude will deliver working JSON you can paste directly into n8n.

## More Options & Details

🔗 **GitHub**: [github.com/czlonkowski/n8n-mcp](https://github.com/czlonkowski/n8n-mcp)
- Local installation options
- Full documentation
- MIT licensed (free forever)

## Feedback Welcome!

What workflow challenges do you face? What would make Claude even better at n8n? Drop a comment or open an issue on GitHub.

Let's make n8n + AI workflow creation delightful! ⭐

---

**P.S.** - Claude even discovered features I didn't know about, like Google Sheets' built-in duplicate detection. Sometimes the AI teaches the human! 😄