# Phase 2 Validation - Test Scenarios

## Quick Verification Tests

After reloading the MCP server, run these tests to verify all Phase 2 fixes work correctly.

---

## Test 1: Missing Language Model Detection ✅

**Issue**: HIGH-01 - AI Agent without language model wasn't validated

**Test Workflow**:
```json
{
  "name": "Test Missing LM",
  "nodes": [
    {
      "id": "agent1",
      "name": "AI Agent",
      "type": "@n8n/n8n-nodes-langchain.agent",
      "position": [500, 300],
      "parameters": {
        "promptType": "define",
        "text": "You are a helpful assistant"
      },
      "typeVersion": 1.7
    }
  ],
  "connections": {}
}
```

**Expected Result**:
```
valid: false
errors: [
  {
    type: "error",
    message: "AI Agent \"AI Agent\" requires an ai_languageModel connection...",
    code: "MISSING_LANGUAGE_MODEL"
  }
]
```

**Verify**: Error is returned with code `MISSING_LANGUAGE_MODEL`

---

## Test 2: AI Tool Connection Detection ✅

**Issue**: HIGH-04 - False "no tools connected" warning when tools ARE connected

**Test Workflow**:
```json
{
  "name": "Test Tool Detection",
  "nodes": [
    {
      "id": "openai1",
      "name": "OpenAI Chat Model",
      "type": "@n8n/n8n-nodes-langchain.lmChatOpenAi",
      "position": [200, 300],
      "parameters": {
        "modelName": "gpt-4"
      },
      "typeVersion": 1
    },
    {
      "id": "tool1",
      "name": "HTTP Request Tool",
      "type": "@n8n/n8n-nodes-langchain.toolHttpRequest",
      "position": [200, 400],
      "parameters": {
        "toolDescription": "Calls a weather API",
        "url": "https://api.weather.com"
      },
      "typeVersion": 1.1
    },
    {
      "id": "agent1",
      "name": "AI Agent",
      "type": "@n8n/n8n-nodes-langchain.agent",
      "position": [500, 300],
      "parameters": {
        "promptType": "define",
        "text": "You are a helpful assistant"
      },
      "typeVersion": 1.7
    }
  ],
  "connections": {
    "OpenAI Chat Model": {
      "ai_languageModel": [[{
        "node": "AI Agent",
        "type": "ai_languageModel",
        "index": 0
      }]]
    },
    "HTTP Request Tool": {
      "ai_tool": [[{
        "node": "AI Agent",
        "type": "ai_tool",
        "index": 0
      }]]
    }
  }
}
```

**Expected Result**:
```
valid: true (or only warnings, NO error about missing tools)
warnings: [] (should NOT contain "no ai_tool connections")
```

**Verify**: No false warning about missing tools

---

## Test 3A: Streaming Mode - Chat Trigger ✅

**Issue**: HIGH-08 - Streaming mode with main output wasn't validated

**Test Workflow**:
```json
{
  "name": "Test Streaming Chat Trigger",
  "nodes": [
    {
      "id": "trigger1",
      "name": "Chat Trigger",
      "type": "@n8n/n8n-nodes-langchain.chatTrigger",
      "position": [100, 300],
      "parameters": {
        "options": {
          "responseMode": "streaming"
        }
      },
      "typeVersion": 1
    },
    {
      "id": "openai1",
      "name": "OpenAI Chat Model",
      "type": "@n8n/n8n-nodes-langchain.lmChatOpenAi",
      "position": [300, 200],
      "parameters": {
        "modelName": "gpt-4"
      },
      "typeVersion": 1
    },
    {
      "id": "agent1",
      "name": "AI Agent",
      "type": "@n8n/n8n-nodes-langchain.agent",
      "position": [500, 300],
      "parameters": {
        "promptType": "define",
        "text": "You are a helpful assistant"
      },
      "typeVersion": 1.7
    },
    {
      "id": "response1",
      "name": "Response Node",
      "type": "n8n-nodes-base.respondToWebhook",
      "position": [700, 300],
      "parameters": {},
      "typeVersion": 1
    }
  ],
  "connections": {
    "Chat Trigger": {
      "main": [[{
        "node": "AI Agent",
        "type": "main",
        "index": 0
      }]]
    },
    "OpenAI Chat Model": {
      "ai_languageModel": [[{
        "node": "AI Agent",
        "type": "ai_languageModel",
        "index": 0
      }]]
    },
    "AI Agent": {
      "main": [[{
        "node": "Response Node",
        "type": "main",
        "index": 0
      }]]
    }
  }
}
```

**Expected Result**:
```
valid: false
errors: [
  {
    type: "error",
    message: "AI Agent \"AI Agent\" is in streaming mode... but has outgoing main connections...",
    code: "STREAMING_WITH_MAIN_OUTPUT" or "STREAMING_AGENT_HAS_OUTPUT"
  }
]
```

**Verify**: Error about streaming with main output

---

## Test 3B: Streaming Mode - AI Agent Own Setting ✅

**Issue**: HIGH-08 - Streaming mode validation incomplete (only checked Chat Trigger)

**Test Workflow**:
```json
{
  "name": "Test Streaming AI Agent",
  "nodes": [
    {
      "id": "openai1",
      "name": "OpenAI Chat Model",
      "type": "@n8n/n8n-nodes-langchain.lmChatOpenAi",
      "position": [200, 300],
      "parameters": {
        "modelName": "gpt-4"
      },
      "typeVersion": 1
    },
    {
      "id": "agent1",
      "name": "AI Agent",
      "type": "@n8n/n8n-nodes-langchain.agent",
      "position": [500, 300],
      "parameters": {
        "promptType": "define",
        "text": "You are a helpful assistant",
        "options": {
          "streamResponse": true
        }
      },
      "typeVersion": 1.7
    },
    {
      "id": "response1",
      "name": "Response Node",
      "type": "n8n-nodes-base.respondToWebhook",
      "position": [700, 300],
      "parameters": {},
      "typeVersion": 1
    }
  ],
  "connections": {
    "OpenAI Chat Model": {
      "ai_languageModel": [[{
        "node": "AI Agent",
        "type": "ai_languageModel",
        "index": 0
      }]]
    },
    "AI Agent": {
      "main": [[{
        "node": "Response Node",
        "type": "main",
        "index": 0
      }]]
    }
  }
}
```

**Expected Result**:
```
valid: false
errors: [
  {
    type: "error",
    message: "AI Agent \"AI Agent\" is in streaming mode (has streamResponse=true in options)...",
    code: "STREAMING_WITH_MAIN_OUTPUT"
  }
]
```

**Verify**: Detects streaming from AI Agent's own setting, not just Chat Trigger

---

## Test 4: get_node_essentials Examples ✅

**Issue**: MEDIUM-02 - Examples always returned empty array

**MCP Call**:
```javascript
get_node_essentials({
  nodeType: "@n8n/n8n-nodes-langchain.agent",
  includeExamples: true
})
```

**Expected Result**:
```json
{
  "nodeType": "nodes-langchain.agent",
  "workflowNodeType": "@n8n/n8n-nodes-langchain.agent",
  "displayName": "AI Agent",
  "examples": [
    {
      "configuration": { /* actual config */ },
      "source": {
        "template": "...",
        "views": 99999,
        "complexity": "medium"
      },
      "useCases": ["..."],
      "metadata": {
        "hasCredentials": false,
        "hasExpressions": true
      }
    }
  ],
  "examplesCount": 3
}
```

**Verify**:
- `examples` is an array with length > 0
- Each example has `configuration`, `source`, `useCases`, `metadata`
- `examplesCount` matches examples.length

**Note**: Requires templates to be fetched first:
```bash
npm run fetch:templates
```

---

## Test 5: Integration - Multiple Errors ✅

**Test Workflow**: Combine multiple errors
```json
{
  "name": "Test Multiple Errors",
  "nodes": [
    {
      "id": "trigger1",
      "name": "Chat Trigger",
      "type": "@n8n/n8n-nodes-langchain.chatTrigger",
      "position": [100, 300],
      "parameters": {
        "options": {
          "responseMode": "streaming"
        }
      },
      "typeVersion": 1
    },
    {
      "id": "agent1",
      "name": "AI Agent",
      "type": "@n8n/n8n-nodes-langchain.agent",
      "position": [500, 300],
      "parameters": {
        "promptType": "define",
        "text": "You are a helpful assistant"
      },
      "typeVersion": 1.7
    },
    {
      "id": "response1",
      "name": "Response Node",
      "type": "n8n-nodes-base.respondToWebhook",
      "position": [700, 300],
      "parameters": {},
      "typeVersion": 1
    }
  ],
  "connections": {
    "Chat Trigger": {
      "main": [[{
        "node": "AI Agent",
        "type": "main",
        "index": 0
      }]]
    },
    "AI Agent": {
      "main": [[{
        "node": "Response Node",
        "type": "main",
        "index": 0
      }]]
    }
  }
}
```

**Expected Result**:
```
valid: false
errors: [
  {
    type: "error",
    code: "MISSING_LANGUAGE_MODEL",
    message: "AI Agent \"AI Agent\" requires an ai_languageModel connection..."
  },
  {
    type: "error",
    code: "STREAMING_WITH_MAIN_OUTPUT" or "STREAMING_AGENT_HAS_OUTPUT",
    message: "AI Agent \"AI Agent\" is in streaming mode... but has outgoing main connections..."
  }
]
```

**Verify**: Both validation errors are detected and reported

---

## How to Run Tests

### Option 1: Using MCP Tools (Recommended)

After reloading MCP server, use the validation tools:

```javascript
// For workflow validation
validate_workflow({
  workflow: { /* paste test workflow JSON */ },
  profile: "ai-friendly"
})

// For examples
get_node_essentials({
  nodeType: "@n8n/n8n-nodes-langchain.agent",
  includeExamples: true
})
```

### Option 2: Using Debug Script

```bash
npm run build
npx tsx scripts/test-ai-validation-debug.ts
```

### Option 3: Using n8n-mcp-tester Agent

Ask the n8n-mcp-tester agent to run specific test scenarios from this document.

---

## Success Criteria

✅ All 5 test scenarios pass
✅ Error codes match expected values
✅ Error messages are clear and actionable
✅ No false positives or false negatives
✅ Examples retrieval works for AI nodes

---

## Fixes Applied

1. **Node Type Normalization** (21 locations)
   - Changed all comparisons from FULL form to SHORT form
   - Affects: ai-node-validator.ts, ai-tool-validators.ts

2. **Streaming Validation Enhancement**
   - Added check for AI Agent's own streamResponse setting
   - Previously only checked Chat Trigger streaming

3. **Examples Retrieval Consistency**
   - Use result.workflowNodeType instead of reconstructing
   - Matches search_nodes behavior

---

## Commits

- `92eb4ef`: Critical validation fixes (node type normalization)
- `81dfbbb`: Examples retrieval fix (workflowNodeType consistency)
- `3ba3f10`: Phase 2 completion documentation

Total: 3 commits, ~250 lines changed
