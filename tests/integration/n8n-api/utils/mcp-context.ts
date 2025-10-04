/**
 * MCP Context Helper for Integration Tests
 *
 * Provides a configured InstanceContext for testing MCP handlers
 * against a real n8n instance.
 */

import { InstanceContext } from '../../../../src/types/instance-context';
import { getN8nCredentials } from './credentials';

/**
 * Create an InstanceContext configured with n8n API credentials
 *
 * This context is passed to MCP handlers to configure them to use
 * the test n8n instance.
 */
export function createMcpContext(): InstanceContext {
  const creds = getN8nCredentials();

  return {
    n8nApiUrl: creds.url,
    n8nApiKey: creds.apiKey
  };
}
