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