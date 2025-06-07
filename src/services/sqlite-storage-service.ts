import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { NodeSourceInfo } from '../utils/node-source-extractor';
import { StoredNode, NodeSearchQuery } from './node-storage-service';
import { logger } from '../utils/logger';

export class SQLiteStorageService {
  private db: Database.Database;
  private readonly dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || process.env.NODE_DB_PATH || path.join(process.cwd(), 'data', 'nodes.db');
    
    // Ensure data directory exists
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    this.db = new Database(this.dbPath, {
      verbose: process.env.NODE_ENV === 'development' ? (msg: unknown) => logger.debug(String(msg)) : undefined
    });
    
    // Enable WAL mode for better performance
    this.db.pragma('journal_mode = WAL');
    
    this.initializeDatabase();
  }

  /**
   * Initialize database with schema
   */
  private initializeDatabase(): void {
    try {
      const schema = `
        -- Main nodes table
        CREATE TABLE IF NOT EXISTS nodes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          node_type TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          package_name TEXT NOT NULL,
          display_name TEXT,
          description TEXT,
          code_hash TEXT NOT NULL,
          code_length INTEGER NOT NULL,
          source_location TEXT NOT NULL,
          source_code TEXT NOT NULL,
          credential_code TEXT,
          package_info TEXT, -- JSON
          has_credentials INTEGER DEFAULT 0,
          extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Indexes for performance
        CREATE INDEX IF NOT EXISTS idx_nodes_package_name ON nodes(package_name);
        CREATE INDEX IF NOT EXISTS idx_nodes_code_hash ON nodes(code_hash);
        CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);

        -- Full Text Search virtual table for node search
        CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
          node_type,
          name,
          display_name,
          description,
          package_name,
          content=nodes,
          content_rowid=id
        );

        -- Triggers to keep FTS in sync
        CREATE TRIGGER IF NOT EXISTS nodes_ai AFTER INSERT ON nodes
        BEGIN
          INSERT INTO nodes_fts(rowid, node_type, name, display_name, description, package_name)
          VALUES (new.id, new.node_type, new.name, new.display_name, new.description, new.package_name);
        END;

        CREATE TRIGGER IF NOT EXISTS nodes_ad AFTER DELETE ON nodes
        BEGIN
          DELETE FROM nodes_fts WHERE rowid = old.id;
        END;

        CREATE TRIGGER IF NOT EXISTS nodes_au AFTER UPDATE ON nodes
        BEGIN
          DELETE FROM nodes_fts WHERE rowid = old.id;
          INSERT INTO nodes_fts(rowid, node_type, name, display_name, description, package_name)
          VALUES (new.id, new.node_type, new.name, new.display_name, new.description, new.package_name);
        END;

        -- Statistics table for metadata
        CREATE TABLE IF NOT EXISTS extraction_stats (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          total_nodes INTEGER NOT NULL,
          total_packages INTEGER NOT NULL,
          total_code_size INTEGER NOT NULL,
          nodes_with_credentials INTEGER NOT NULL,
          extraction_date DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `;
      
      this.db.exec(schema);
      logger.info('Database initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize database:', error);
      throw error;
    }
  }

  /**
   * Store a node in the database
   */
  async storeNode(nodeInfo: NodeSourceInfo): Promise<StoredNode> {
    const codeHash = crypto.createHash('sha256').update(nodeInfo.sourceCode).digest('hex');
    
    // Parse display name and description from source
    const displayName = this.extractDisplayName(nodeInfo.sourceCode);
    const description = this.extractDescription(nodeInfo.sourceCode);
    
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO nodes (
        node_type, name, package_name, display_name, description,
        code_hash, code_length, source_location, source_code,
        credential_code, package_info, has_credentials,
        updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
      )
    `);
    
    const name = nodeInfo.nodeType.split('.').pop() || nodeInfo.nodeType;
    const packageName = nodeInfo.nodeType.split('.')[0] || 'unknown';
    
    const result = stmt.run(
      nodeInfo.nodeType,
      name,
      packageName,
      displayName || null,
      description || null,
      codeHash,
      nodeInfo.sourceCode.length,
      nodeInfo.location,
      nodeInfo.sourceCode,
      nodeInfo.credentialCode || null,
      nodeInfo.packageInfo ? JSON.stringify(nodeInfo.packageInfo) : null,
      nodeInfo.credentialCode ? 1 : 0
    );
    
    logger.info(`Stored node: ${nodeInfo.nodeType} (${codeHash.substring(0, 8)}...)`);
    
    return {
      id: String(result.lastInsertRowid),
      nodeType: nodeInfo.nodeType,
      name,
      packageName,
      displayName,
      description,
      codeHash,
      codeLength: nodeInfo.sourceCode.length,
      sourceLocation: nodeInfo.location,
      hasCredentials: !!nodeInfo.credentialCode,
      extractedAt: new Date(),
      updatedAt: new Date(),
      sourceCode: nodeInfo.sourceCode,
      credentialCode: nodeInfo.credentialCode,
      packageInfo: nodeInfo.packageInfo
    };
  }

  /**
   * Search for nodes using FTS
   */
  async searchNodes(query: NodeSearchQuery): Promise<StoredNode[]> {
    let sql = `
      SELECT DISTINCT n.*
      FROM nodes n
    `;
    
    const params: any[] = [];
    const conditions: string[] = [];
    
    if (query.query) {
      // Use FTS for text search
      sql += ` JOIN nodes_fts fts ON n.id = fts.rowid`;
      conditions.push(`nodes_fts MATCH ?`);
      // Convert search query to FTS syntax (prefix search)
      const ftsQuery = query.query.split(' ')
        .map(term => `${term}*`)
        .join(' ');
      params.push(ftsQuery);
    }
    
    if (query.packageName) {
      conditions.push(`n.package_name = ?`);
      params.push(query.packageName);
    }
    
    if (query.nodeType) {
      conditions.push(`n.node_type LIKE ?`);
      params.push(`%${query.nodeType}%`);
    }
    
    if (query.hasCredentials !== undefined) {
      conditions.push(`n.has_credentials = ?`);
      params.push(query.hasCredentials ? 1 : 0);
    }
    
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    sql += ` ORDER BY n.name`;
    
    if (query.limit) {
      sql += ` LIMIT ?`;
      params.push(query.limit);
      
      if (query.offset) {
        sql += ` OFFSET ?`;
        params.push(query.offset);
      }
    }
    
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params);
    
    return rows.map(row => this.rowToStoredNode(row));
  }

  /**
   * Get node by type
   */
  async getNode(nodeType: string): Promise<StoredNode | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM nodes WHERE node_type = ?
    `);
    
    const row = stmt.get(nodeType);
    return row ? this.rowToStoredNode(row) : null;
  }

  /**
   * Get all packages
   */
  async getPackages(): Promise<Array<{ name: string; nodeCount: number }>> {
    const stmt = this.db.prepare(`
      SELECT package_name as name, COUNT(*) as nodeCount
      FROM nodes
      GROUP BY package_name
      ORDER BY nodeCount DESC
    `);
    
    return stmt.all() as Array<{ name: string; nodeCount: number }>;
  }

  /**
   * Bulk store nodes (used for database rebuild)
   */
  async bulkStoreNodes(nodeInfos: NodeSourceInfo[]): Promise<{
    stored: number;
    failed: number;
    errors: Array<{ nodeType: string; error: string }>;
  }> {
    const results = {
      stored: 0,
      failed: 0,
      errors: [] as Array<{ nodeType: string; error: string }>
    };
    
    // Use transaction for bulk insert
    const insertMany = this.db.transaction((nodes: NodeSourceInfo[]) => {
      for (const nodeInfo of nodes) {
        try {
          this.storeNode(nodeInfo);
          results.stored++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            nodeType: nodeInfo.nodeType,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    });
    
    insertMany(nodeInfos);
    
    return results;
  }

  /**
   * Get statistics
   */
  async getStatistics(): Promise<{
    totalNodes: number;
    totalPackages: number;
    totalCodeSize: number;
    nodesWithCredentials: number;
    averageNodeSize: number;
    packageDistribution: Array<{ package: string; count: number }>;
  }> {
    const stats = this.db.prepare(`
      SELECT 
        COUNT(*) as totalNodes,
        COUNT(DISTINCT package_name) as totalPackages,
        SUM(code_length) as totalCodeSize,
        SUM(has_credentials) as nodesWithCredentials
      FROM nodes
    `).get() as any;
    
    const packageDist = this.db.prepare(`
      SELECT package_name as package, COUNT(*) as count
      FROM nodes
      GROUP BY package_name
      ORDER BY count DESC
    `).all() as Array<{ package: string; count: number }>;
    
    return {
      totalNodes: stats.totalNodes || 0,
      totalPackages: stats.totalPackages || 0,
      totalCodeSize: stats.totalCodeSize || 0,
      nodesWithCredentials: stats.nodesWithCredentials || 0,
      averageNodeSize: stats.totalNodes > 0 ? Math.round(stats.totalCodeSize / stats.totalNodes) : 0,
      packageDistribution: packageDist
    };
  }

  /**
   * Rebuild entire database
   */
  async rebuildDatabase(): Promise<void> {
    logger.info('Starting database rebuild...');
    
    // Clear existing data
    this.db.exec('DELETE FROM nodes');
    this.db.exec('DELETE FROM extraction_stats');
    
    logger.info('Database cleared for rebuild');
  }

  /**
   * Save extraction statistics
   */
  async saveExtractionStats(stats: {
    totalNodes: number;
    totalPackages: number;
    totalCodeSize: number;
    nodesWithCredentials: number;
  }): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO extraction_stats (
        total_nodes, total_packages, total_code_size, nodes_with_credentials
      ) VALUES (?, ?, ?, ?)
    `);
    
    stmt.run(
      stats.totalNodes,
      stats.totalPackages,
      stats.totalCodeSize,
      stats.nodesWithCredentials
    );
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Convert database row to StoredNode
   */
  private rowToStoredNode(row: any): StoredNode {
    return {
      id: String(row.id),
      nodeType: row.node_type,
      name: row.name,
      packageName: row.package_name,
      displayName: row.display_name,
      description: row.description,
      codeHash: row.code_hash,
      codeLength: row.code_length,
      sourceLocation: row.source_location,
      hasCredentials: row.has_credentials === 1,
      extractedAt: new Date(row.extracted_at),
      updatedAt: new Date(row.updated_at),
      sourceCode: row.source_code,
      credentialCode: row.credential_code,
      packageInfo: row.package_info ? JSON.parse(row.package_info) : undefined
    };
  }

  /**
   * Extract display name from source code
   */
  private extractDisplayName(sourceCode: string): string | undefined {
    const match = sourceCode.match(/displayName:\s*["'`]([^"'`]+)["'`]/);
    return match ? match[1] : undefined;
  }

  /**
   * Extract description from source code
   */
  private extractDescription(sourceCode: string): string | undefined {
    const match = sourceCode.match(/description:\s*["'`]([^"'`]+)["'`]/);
    return match ? match[1] : undefined;
  }
}