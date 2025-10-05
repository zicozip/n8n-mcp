/**
 * Node Repository Utility for Integration Tests
 *
 * Provides a singleton NodeRepository instance for integration tests
 * that require validation or autofix functionality.
 */

import path from 'path';
import { createDatabaseAdapter } from '../../../../src/database/database-adapter';
import { NodeRepository } from '../../../../src/database/node-repository';

let repositoryInstance: NodeRepository | null = null;

/**
 * Get or create NodeRepository instance
 * Uses the production nodes.db database
 */
export async function getNodeRepository(): Promise<NodeRepository> {
  if (repositoryInstance) {
    return repositoryInstance;
  }

  const dbPath = path.join(process.cwd(), 'data/nodes.db');
  const db = await createDatabaseAdapter(dbPath);
  repositoryInstance = new NodeRepository(db);

  return repositoryInstance;
}

/**
 * Reset repository instance (useful for test cleanup)
 */
export function resetNodeRepository(): void {
  repositoryInstance = null;
}
