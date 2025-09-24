import { NodeRepository } from '../database/node-repository';
import { logger } from '../utils/logger';

export interface NodeSuggestion {
  nodeType: string;
  displayName: string;
  confidence: number;
  reason: string;
  category?: string;
  description?: string;
}

export interface SimilarityScore {
  nameSimilarity: number;
  categoryMatch: number;
  packageMatch: number;
  patternMatch: number;
  totalScore: number;
}

export interface CommonMistakePattern {
  pattern: RegExp | string;
  suggestion: string;
  confidence: number;
  reason: string;
}

export class NodeSimilarityService {
  private repository: NodeRepository;
  private commonMistakes: Map<string, CommonMistakePattern[]>;
  private nodeCache: any[] | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  constructor(repository: NodeRepository) {
    this.repository = repository;
    this.commonMistakes = this.initializeCommonMistakes();
  }

  /**
   * Initialize common mistake patterns
   */
  private initializeCommonMistakes(): Map<string, CommonMistakePattern[]> {
    const patterns = new Map<string, CommonMistakePattern[]>();

    // Case variations
    patterns.set('case_variations', [
      { pattern: /^HttpRequest$/i, suggestion: 'nodes-base.httpRequest', confidence: 0.95, reason: 'Incorrect capitalization' },
      { pattern: /^HTTPRequest$/i, suggestion: 'nodes-base.httpRequest', confidence: 0.95, reason: 'Common capitalization mistake' },
      { pattern: /^Webhook$/i, suggestion: 'nodes-base.webhook', confidence: 0.95, reason: 'Incorrect capitalization' },
      { pattern: /^WebHook$/i, suggestion: 'nodes-base.webhook', confidence: 0.95, reason: 'Common capitalization mistake' },
      { pattern: /^Slack$/i, suggestion: 'nodes-base.slack', confidence: 0.9, reason: 'Missing package prefix' },
      { pattern: /^Gmail$/i, suggestion: 'nodes-base.gmail', confidence: 0.9, reason: 'Missing package prefix' },
      { pattern: /^GoogleSheets$/i, suggestion: 'nodes-base.googleSheets', confidence: 0.9, reason: 'Missing package prefix' },
    ]);

    // Missing prefixes
    patterns.set('missing_prefix', [
      { pattern: /^(httpRequest|webhook|slack|gmail|googleSheets|telegram|discord|notion|airtable|postgres|mysql|mongodb)$/i,
        suggestion: '', confidence: 0.9, reason: 'Missing package prefix' },
    ]);

    // Old versions or deprecated names
    patterns.set('deprecated', [
      { pattern: /^n8n-nodes-base\./i, suggestion: '', confidence: 0.95, reason: 'Full package name used instead of short form' },
      { pattern: /^@n8n\/n8n-nodes-langchain\./i, suggestion: '', confidence: 0.95, reason: 'Full package name used instead of short form' },
    ]);

    // Common typos
    patterns.set('typos', [
      { pattern: /^htpRequest$/i, suggestion: 'nodes-base.httpRequest', confidence: 0.8, reason: 'Likely typo' },
      { pattern: /^httpReqest$/i, suggestion: 'nodes-base.httpRequest', confidence: 0.8, reason: 'Likely typo' },
      { pattern: /^webook$/i, suggestion: 'nodes-base.webhook', confidence: 0.8, reason: 'Likely typo' },
      { pattern: /^slak$/i, suggestion: 'nodes-base.slack', confidence: 0.8, reason: 'Likely typo' },
      { pattern: /^goggleSheets$/i, suggestion: 'nodes-base.googleSheets', confidence: 0.8, reason: 'Likely typo' },
    ]);

    // AI/LangChain specific
    patterns.set('ai_nodes', [
      { pattern: /^openai$/i, suggestion: 'nodes-langchain.openAi', confidence: 0.85, reason: 'AI node - incorrect package' },
      { pattern: /^nodes-base\.openai$/i, suggestion: 'nodes-langchain.openAi', confidence: 0.9, reason: 'Wrong package - OpenAI is in LangChain package' },
      { pattern: /^chatOpenAI$/i, suggestion: 'nodes-langchain.lmChatOpenAi', confidence: 0.85, reason: 'LangChain node naming convention' },
      { pattern: /^vectorStore$/i, suggestion: 'nodes-langchain.vectorStoreInMemory', confidence: 0.7, reason: 'Generic vector store reference' },
    ]);

    return patterns;
  }

  /**
   * Find similar nodes for an invalid type
   */
  async findSimilarNodes(invalidType: string, limit: number = 5): Promise<NodeSuggestion[]> {
    if (!invalidType || invalidType.trim() === '') {
      return [];
    }

    const suggestions: NodeSuggestion[] = [];

    // First, check for exact common mistakes
    const mistakeSuggestion = this.checkCommonMistakes(invalidType);
    if (mistakeSuggestion) {
      suggestions.push(mistakeSuggestion);
    }

    // Get all nodes (with caching)
    const allNodes = await this.getCachedNodes();

    // Calculate similarity scores for all nodes
    const scores = allNodes.map(node => ({
      node,
      score: this.calculateSimilarityScore(invalidType, node)
    }));

    // Sort by total score and filter high scores
    scores.sort((a, b) => b.score.totalScore - a.score.totalScore);

    // Add top suggestions (excluding already added exact matches)
    for (const { node, score } of scores) {
      if (suggestions.some(s => s.nodeType === node.nodeType)) {
        continue;
      }

      if (score.totalScore >= 50) {
        suggestions.push(this.createSuggestion(node, score));
      }

      if (suggestions.length >= limit) {
        break;
      }
    }

    return suggestions;
  }

  /**
   * Check for common mistake patterns
   */
  private checkCommonMistakes(invalidType: string): NodeSuggestion | null {
    const cleanType = invalidType.trim();

    // Check each category of patterns
    for (const [category, patterns] of this.commonMistakes) {
      for (const pattern of patterns) {
        let match = false;
        let actualSuggestion = pattern.suggestion;

        if (pattern.pattern instanceof RegExp) {
          match = pattern.pattern.test(cleanType);
        } else {
          match = cleanType === pattern.pattern;
        }

        if (match) {
          // Handle dynamic suggestions (e.g., missing prefix)
          if (category === 'missing_prefix' && !actualSuggestion) {
            actualSuggestion = `nodes-base.${cleanType}`;
          } else if (category === 'deprecated' && !actualSuggestion) {
            // Remove package prefix
            actualSuggestion = cleanType.replace(/^n8n-nodes-base\./, 'nodes-base.')
                                       .replace(/^@n8n\/n8n-nodes-langchain\./, 'nodes-langchain.');
          }

          // Verify the suggestion exists
          const node = this.repository.getNode(actualSuggestion);
          if (node) {
            return {
              nodeType: actualSuggestion,
              displayName: node.displayName,
              confidence: pattern.confidence,
              reason: pattern.reason,
              category: node.category,
              description: node.description
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * Calculate multi-factor similarity score
   */
  private calculateSimilarityScore(invalidType: string, node: any): SimilarityScore {
    const cleanInvalid = this.normalizeNodeType(invalidType);
    const cleanValid = this.normalizeNodeType(node.nodeType);
    const displayNameClean = this.normalizeNodeType(node.displayName);

    // Special handling for very short search terms (e.g., "http", "sheet")
    const isShortSearch = invalidType.length <= 5;

    // Name similarity (40% weight)
    let nameSimilarity = Math.max(
      this.getStringSimilarity(cleanInvalid, cleanValid),
      this.getStringSimilarity(cleanInvalid, displayNameClean)
    ) * 40;

    // For short searches that are substrings, give a small name similarity boost
    if (isShortSearch && (cleanValid.includes(cleanInvalid) || displayNameClean.includes(cleanInvalid))) {
      nameSimilarity = Math.max(nameSimilarity, 10);
    }

    // Category match (20% weight)
    let categoryMatch = 0;
    if (node.category) {
      const categoryClean = this.normalizeNodeType(node.category);
      if (cleanInvalid.includes(categoryClean) || categoryClean.includes(cleanInvalid)) {
        categoryMatch = 20;
      }
    }

    // Package match (15% weight)
    let packageMatch = 0;
    const invalidParts = cleanInvalid.split(/[.-]/);
    const validParts = cleanValid.split(/[.-]/);

    if (invalidParts[0] === validParts[0]) {
      packageMatch = 15;
    }

    // Pattern match (25% weight)
    let patternMatch = 0;

    // Check if it's a substring match
    if (cleanValid.includes(cleanInvalid) || displayNameClean.includes(cleanInvalid)) {
      // Boost score significantly for short searches that are exact substring matches
      // Short searches need more boost to reach the 50 threshold
      patternMatch = isShortSearch ? 45 : 25;
    } else if (this.getEditDistance(cleanInvalid, cleanValid) <= 2) {
      // Small edit distance indicates likely typo
      patternMatch = 20;
    } else if (this.getEditDistance(cleanInvalid, displayNameClean) <= 2) {
      patternMatch = 18;
    }

    // For very short searches, also check if the search term appears at the start
    if (isShortSearch && (cleanValid.startsWith(cleanInvalid) || displayNameClean.startsWith(cleanInvalid))) {
      patternMatch = Math.max(patternMatch, 40);
    }

    const totalScore = nameSimilarity + categoryMatch + packageMatch + patternMatch;

    return {
      nameSimilarity,
      categoryMatch,
      packageMatch,
      patternMatch,
      totalScore
    };
  }

  /**
   * Create a suggestion object from node and score
   */
  private createSuggestion(node: any, score: SimilarityScore): NodeSuggestion {
    let reason = 'Similar node';

    if (score.patternMatch >= 20) {
      reason = 'Name similarity';
    } else if (score.categoryMatch >= 15) {
      reason = 'Same category';
    } else if (score.packageMatch >= 10) {
      reason = 'Same package';
    }

    // Calculate confidence (0-1 scale)
    const confidence = Math.min(score.totalScore / 100, 1);

    return {
      nodeType: node.nodeType,
      displayName: node.displayName,
      confidence,
      reason,
      category: node.category,
      description: node.description
    };
  }

  /**
   * Normalize node type for comparison
   */
  private normalizeNodeType(type: string): string {
    return type
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  /**
   * Calculate string similarity (0-1)
   */
  private getStringSimilarity(s1: string, s2: string): number {
    if (s1 === s2) return 1;
    if (!s1 || !s2) return 0;

    const distance = this.getEditDistance(s1, s2);
    const maxLen = Math.max(s1.length, s2.length);

    return 1 - (distance / maxLen);
  }

  /**
   * Calculate Levenshtein distance
   */
  private getEditDistance(s1: string, s2: string): number {
    const m = s1.length;
    const n = s2.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (s1[i - 1] === s2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }

    return dp[m][n];
  }

  /**
   * Get cached nodes or fetch from repository
   */
  private async getCachedNodes(): Promise<any[]> {
    const now = Date.now();

    if (!this.nodeCache || now > this.cacheExpiry) {
      try {
        this.nodeCache = this.repository.getAllNodes();
        this.cacheExpiry = now + this.CACHE_DURATION;
      } catch (error) {
        logger.error('Failed to fetch nodes for similarity service', error);
        return [];
      }
    }

    return this.nodeCache || [];
  }

  /**
   * Format suggestions into a user-friendly message
   */
  formatSuggestionMessage(suggestions: NodeSuggestion[], invalidType: string): string {
    if (suggestions.length === 0) {
      return `Unknown node type: "${invalidType}". No similar nodes found.`;
    }

    let message = `Unknown node type: "${invalidType}"\n\nDid you mean one of these?\n`;

    for (const suggestion of suggestions) {
      const confidence = Math.round(suggestion.confidence * 100);
      message += `• ${suggestion.nodeType} (${confidence}% match)`;

      if (suggestion.displayName) {
        message += ` - ${suggestion.displayName}`;
      }

      message += `\n  → ${suggestion.reason}`;

      if (suggestion.confidence >= 0.9) {
        message += ' (can be auto-fixed)';
      }

      message += '\n';
    }

    return message;
  }

  /**
   * Check if a suggestion is high confidence for auto-fixing
   */
  isAutoFixable(suggestion: NodeSuggestion): boolean {
    return suggestion.confidence >= 0.9;
  }

  /**
   * Clear the node cache (useful after database updates)
   */
  clearCache(): void {
    this.nodeCache = null;
    this.cacheExpiry = 0;
  }
}