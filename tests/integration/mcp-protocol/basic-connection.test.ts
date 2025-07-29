import { describe, it, expect } from 'vitest';
import { N8NDocumentationMCPServer } from '../../../src/mcp/server';

describe('Basic MCP Connection', () => {
  it('should initialize MCP server', async () => {
    const server = new N8NDocumentationMCPServer();
    
    // Test executeTool directly - it returns raw data
    const result = await server.executeTool('get_database_statistics', {});
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    expect(result.totalNodes).toBeDefined();
    expect(result.statistics).toBeDefined();
    
    await server.shutdown();
  });
  
  it('should execute list_nodes tool', async () => {
    const server = new N8NDocumentationMCPServer();
    
    const result = await server.executeTool('list_nodes', { limit: 5 });
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    expect(result.nodes).toBeDefined();
    expect(Array.isArray(result.nodes)).toBe(true);
    expect(result.nodes).toHaveLength(5);
    expect(result.nodes[0]).toHaveProperty('nodeType');
    expect(result.nodes[0]).toHaveProperty('displayName');
    
    await server.shutdown();
  });
  
  it('should search nodes', async () => {
    const server = new N8NDocumentationMCPServer();
    
    const result = await server.executeTool('search_nodes', { query: 'webhook' });
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    expect(result.results).toBeDefined();
    expect(Array.isArray(result.results)).toBe(true);
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.totalCount).toBeGreaterThan(0);
    
    // Should find webhook node
    const webhookNode = result.results.find((n: any) => n.nodeType === 'nodes-base.webhook');
    expect(webhookNode).toBeDefined();
    expect(webhookNode.displayName).toContain('Webhook');
    
    await server.shutdown();
  });
});