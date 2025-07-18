/**
 * Normalizes node type from n8n export format to database format
 * 
 * Examples:
 * - 'n8n-nodes-base.httpRequest' → 'nodes-base.httpRequest'
 * - '@n8n/n8n-nodes-langchain.agent' → 'nodes-langchain.agent'
 * - 'nodes-base.slack' → 'nodes-base.slack' (unchanged)
 * 
 * @param nodeType The node type to normalize
 * @returns The normalized node type
 */
export function normalizeNodeType(nodeType: string): string {
  // Handle n8n-nodes-base -> nodes-base
  if (nodeType.startsWith('n8n-nodes-base.')) {
    return nodeType.replace('n8n-nodes-base.', 'nodes-base.');
  }
  
  // Handle @n8n/n8n-nodes-langchain -> nodes-langchain
  if (nodeType.startsWith('@n8n/n8n-nodes-langchain.')) {
    return nodeType.replace('@n8n/n8n-nodes-langchain.', 'nodes-langchain.');
  }
  
  // Return unchanged if already normalized or unknown format
  return nodeType;
}

/**
 * Gets alternative node type formats to try for lookups
 * 
 * @param nodeType The original node type
 * @returns Array of alternative formats to try
 */
export function getNodeTypeAlternatives(nodeType: string): string[] {
  const alternatives: string[] = [];
  
  // Add lowercase version
  alternatives.push(nodeType.toLowerCase());
  
  // If it's just a bare node name, try with common prefixes
  if (!nodeType.includes('.')) {
    alternatives.push(`nodes-base.${nodeType}`);
    alternatives.push(`nodes-langchain.${nodeType}`);
  }
  
  return alternatives;
}

/**
 * Constructs the workflow node type from package name and normalized node type
 * This creates the format that n8n expects in workflow definitions
 * 
 * Examples:
 * - ('n8n-nodes-base', 'nodes-base.webhook') → 'n8n-nodes-base.webhook'
 * - ('@n8n/n8n-nodes-langchain', 'nodes-langchain.agent') → '@n8n/n8n-nodes-langchain.agent'
 * 
 * @param packageName The package name from the database
 * @param nodeType The normalized node type from the database
 * @returns The workflow node type for use in n8n workflows
 */
export function getWorkflowNodeType(packageName: string, nodeType: string): string {
  // Extract just the node name from the normalized type
  const nodeName = nodeType.split('.').pop() || nodeType;
  
  // Construct the full workflow type based on package
  if (packageName === 'n8n-nodes-base') {
    return `n8n-nodes-base.${nodeName}`;
  } else if (packageName === '@n8n/n8n-nodes-langchain') {
    return `@n8n/n8n-nodes-langchain.${nodeName}`;
  }
  
  // Fallback for unknown packages - return as is
  return nodeType;
}