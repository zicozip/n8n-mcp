import { InstanceContext } from '../../../../src/types/instance-context';
import { getN8nCredentials } from './credentials';

/**
 * Creates MCP context for testing MCP handlers against real n8n instance
 * This is what gets passed to MCP handlers (handleCreateWorkflow, etc.)
 */
export function createMcpContext(): InstanceContext {
  const creds = getN8nCredentials();
  return {
    n8nApiUrl: creds.url,
    n8nApiKey: creds.apiKey
  };
}
