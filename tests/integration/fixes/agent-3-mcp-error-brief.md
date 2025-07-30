# Agent 3: MCP Error Handling Fix Brief

## Assignment
Fix 16 failing tests related to MCP protocol error handling and validation.

## Files to Fix
- `tests/integration/mcp-protocol/error-handling.test.ts` (16 tests)

## Specific Failures to Address

### 1. Invalid Params Handling (3 retries)
```
FAIL: should handle invalid params
Expected: error message to match /missing|required|nodeType/i
Actual: 'MCP error -32603: MCP error -32603: C...'
```

### 2. Invalid Category Filter (2 retries)
```
FAIL: should handle invalid category filter
Test is not properly validating category parameter
```

### 3. Empty Search Query (3 retries)
```
FAIL: should handle empty search query
Expected: error message to contain 'query'
Actual: 'Should have thrown an error' (no error thrown)
```

### 4. Malformed Workflow Structure (3 retries)
```
FAIL: should handle malformed workflow structure
Expected: error to contain 'nodes'
Actual: No error thrown, or wrong error message
Error in logs: TypeError: workflow.nodes is not iterable
```

### 5. Circular Workflow References (2 retries)
Test implementation missing or incorrect

### 6. Non-existent Documentation Topics (2 retries)
Documentation tool not returning expected errors

### 7. Large Node Info Requests (2 retries)
Performance/memory issues with large payloads

### 8. Large Workflow Validation (2 retries)
Timeout or memory issues

### 9. Workflow with Many Nodes (2 retries)
Performance degradation not handled

### 10. Empty Responses (2 retries)
Edge case handling failure

### 11. Special Characters in Parameters (2 retries)
Unicode/special character validation issues

### 12. Unicode in Parameters (2 retries)
Unicode handling failures

### 13. Null and Undefined Handling (2 retries)
Null/undefined parameter validation

### 14. Error Message Quality (3 retries)
```
Expected: error to match /not found|invalid|missing/
Actual: 'should have thrown an error'
```

### 15. Missing Required Parameters (2 retries)
Parameter validation not working correctly

## Root Causes
1. **Validation Logic**: MCP server not properly validating input parameters
2. **Error Propagation**: Errors caught but not properly formatted/returned
3. **Type Checking**: Missing or incorrect type validation
4. **Error Messages**: Generic errors instead of specific validation messages

## Recommended Fixes

### 1. Enhance Parameter Validation
```typescript
// In mcp/server.ts or relevant handler
async function validateToolParams(tool: string, params: any): Promise<void> {
  switch (tool) {
    case 'get_node_info':
      if (!params.nodeType) {
        throw new Error('Missing required parameter: nodeType');
      }
      if (typeof params.nodeType !== 'string') {
        throw new Error('Parameter nodeType must be a string');
      }
      break;
      
    case 'search_nodes':
      if (params.query !== undefined && params.query === '') {
        throw new Error('Parameter query cannot be empty');
      }
      break;
      
    case 'list_nodes':
      if (params.category && !['trigger', 'transform', 'output', 'input'].includes(params.category)) {
        throw new Error(`Invalid category: ${params.category}. Must be one of: trigger, transform, output, input`);
      }
      break;
  }
}
```

### 2. Fix Workflow Structure Validation
```typescript
// In workflow validator
function validateWorkflowStructure(workflow: any): void {
  if (!workflow || typeof workflow !== 'object') {
    throw new Error('Workflow must be an object');
  }
  
  if (!Array.isArray(workflow.nodes)) {
    throw new Error('Workflow must have a nodes array');
  }
  
  if (!workflow.connections || typeof workflow.connections !== 'object') {
    throw new Error('Workflow must have a connections object');
  }
  
  // Check for circular references
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  
  for (const node of workflow.nodes) {
    if (hasCircularReference(node.id, workflow.connections, visited, recursionStack)) {
      throw new Error(`Circular reference detected starting from node: ${node.id}`);
    }
  }
}
```

### 3. Improve Error Response Format
```typescript
// In MCP error handler
function formatMCPError(error: any, code: number = -32603): MCPError {
  let message = 'Internal error';
  
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  }
  
  // Ensure specific error messages
  if (message.includes('Missing required parameter')) {
    code = -32602; // Invalid params
  }
  
  return {
    code,
    message,
    data: process.env.NODE_ENV === 'test' ? { 
      originalError: error.toString() 
    } : undefined
  };
}
```

### 4. Handle Large Payloads
```typescript
// Add payload size validation
function validatePayloadSize(data: any, maxSize: number = 10 * 1024 * 1024): void {
  const size = JSON.stringify(data).length;
  if (size > maxSize) {
    throw new Error(`Payload too large: ${size} bytes (max: ${maxSize})`);
  }
}

// In large workflow handler
async function handleLargeWorkflow(workflow: any): Promise<any> {
  // Validate size first
  validatePayloadSize(workflow);
  
  // Process in chunks if needed
  const nodeChunks = chunkArray(workflow.nodes, 100);
  const results = [];
  
  for (const chunk of nodeChunks) {
    const partialWorkflow = { ...workflow, nodes: chunk };
    const result = await validateWorkflow(partialWorkflow);
    results.push(result);
  }
  
  return mergeValidationResults(results);
}
```

### 5. Unicode and Special Character Handling
```typescript
// Sanitize and validate unicode input
function validateUnicodeInput(input: any): void {
  if (typeof input === 'string') {
    // Check for control characters
    if (/[\x00-\x1F\x7F]/.test(input)) {
      throw new Error('Control characters not allowed in input');
    }
    
    // Validate UTF-8
    try {
      // This will throw if invalid UTF-8
      Buffer.from(input, 'utf8').toString('utf8');
    } catch {
      throw new Error('Invalid UTF-8 encoding in input');
    }
  } else if (typeof input === 'object' && input !== null) {
    // Recursively validate object properties
    for (const [key, value] of Object.entries(input)) {
      validateUnicodeInput(key);
      validateUnicodeInput(value);
    }
  }
}
```

### 6. Null/Undefined Handling
```typescript
// Strict null/undefined validation
function validateNotNullish(params: any, paramName: string): void {
  if (params[paramName] === null) {
    throw new Error(`Parameter ${paramName} cannot be null`);
  }
  if (params[paramName] === undefined) {
    throw new Error(`Missing required parameter: ${paramName}`);
  }
}
```

## Testing Strategy
1. Add validation at MCP entry points
2. Ensure errors bubble up correctly
3. Test each error scenario in isolation
4. Verify error messages are helpful

## Dependencies
- Depends on Agent 2 (MSW) for proper mock setup
- May affect Agent 6 (Session) error handling

## Success Metrics
- [ ] All 16 error handling tests pass
- [ ] Clear, specific error messages
- [ ] Proper error codes returned
- [ ] Large payloads handled gracefully
- [ ] Unicode/special characters validated

## Progress Tracking
Create `/tests/integration/fixes/agent-3-progress.md` and update after each fix:
```markdown
# Agent 3 Progress

## Fixed Tests
- [ ] should handle invalid params
- [ ] should handle invalid category filter  
- [ ] should handle empty search query
- [ ] should handle malformed workflow structure
- [ ] should handle circular workflow references
- [ ] should handle non-existent documentation topics
- [ ] should handle large node info requests
- [ ] should handle large workflow validation
- [ ] should handle workflow with many nodes
- [ ] should handle empty responses gracefully
- [ ] should handle special characters in parameters
- [ ] should handle unicode in parameters
- [ ] should handle null and undefined gracefully
- [ ] should provide helpful error messages
- [ ] should indicate missing required parameters
- [ ] (identify 16th test)

## Blockers
- None yet

## Notes
- [Document validation rules added]
- [Note any error format changes]
```