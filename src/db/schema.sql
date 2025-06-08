-- Enhanced n8n Node Documentation Database Schema
-- This schema stores comprehensive node information including source code,
-- documentation, operations, API methods, examples, and metadata

-- Main nodes table with rich documentation
CREATE TABLE IF NOT EXISTS nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_type TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  display_name TEXT,
  description TEXT,
  category TEXT,
  subcategory TEXT,
  icon TEXT,
  
  -- Source code
  source_code TEXT NOT NULL,
  credential_code TEXT,
  code_hash TEXT NOT NULL,
  code_length INTEGER NOT NULL,
  
  -- Documentation
  documentation_markdown TEXT,
  documentation_url TEXT,
  documentation_title TEXT,
  
  -- Enhanced documentation fields (stored as JSON)
  operations TEXT,
  api_methods TEXT,
  documentation_examples TEXT,
  templates TEXT,
  related_resources TEXT,
  required_scopes TEXT,
  
  -- Example usage
  example_workflow TEXT,
  example_parameters TEXT,
  properties_schema TEXT,
  
  -- Metadata
  package_name TEXT NOT NULL,
  version TEXT,
  codex_data TEXT,
  aliases TEXT,
  
  -- Flags
  has_credentials INTEGER DEFAULT 0,
  is_trigger INTEGER DEFAULT 0,
  is_webhook INTEGER DEFAULT 0,
  
  -- Timestamps
  extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_nodes_package_name ON nodes(package_name);
CREATE INDEX IF NOT EXISTS idx_nodes_category ON nodes(category);
CREATE INDEX IF NOT EXISTS idx_nodes_code_hash ON nodes(code_hash);
CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
CREATE INDEX IF NOT EXISTS idx_nodes_is_trigger ON nodes(is_trigger);
CREATE INDEX IF NOT EXISTS idx_nodes_has_credentials ON nodes(has_credentials);

-- Full Text Search table
CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
  node_type,
  name,
  display_name,
  description,
  category,
  documentation_markdown,
  aliases,
  content=nodes,
  content_rowid=id
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS nodes_ai AFTER INSERT ON nodes
BEGIN
  INSERT INTO nodes_fts(rowid, node_type, name, display_name, description, category, documentation_markdown, aliases)
  VALUES (new.id, new.node_type, new.name, new.display_name, new.description, new.category, new.documentation_markdown, new.aliases);
END;

CREATE TRIGGER IF NOT EXISTS nodes_ad AFTER DELETE ON nodes
BEGIN
  DELETE FROM nodes_fts WHERE rowid = old.id;
END;

CREATE TRIGGER IF NOT EXISTS nodes_au AFTER UPDATE ON nodes
BEGIN
  DELETE FROM nodes_fts WHERE rowid = old.id;
  INSERT INTO nodes_fts(rowid, node_type, name, display_name, description, category, documentation_markdown, aliases)
  VALUES (new.id, new.node_type, new.name, new.display_name, new.description, new.category, new.documentation_markdown, new.aliases);
END;

-- Documentation sources tracking
CREATE TABLE IF NOT EXISTS documentation_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  commit_hash TEXT,
  fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Statistics tracking
CREATE TABLE IF NOT EXISTS extraction_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  total_nodes INTEGER NOT NULL,
  nodes_with_docs INTEGER NOT NULL,
  nodes_with_examples INTEGER NOT NULL,
  total_code_size INTEGER NOT NULL,
  total_docs_size INTEGER NOT NULL,
  extraction_date DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Views for common queries
CREATE VIEW IF NOT EXISTS nodes_summary AS
SELECT 
  node_type,
  name,
  display_name,
  description,
  category,
  package_name,
  CASE WHEN documentation_markdown IS NOT NULL THEN 1 ELSE 0 END as has_documentation,
  CASE WHEN documentation_examples IS NOT NULL THEN 1 ELSE 0 END as has_examples,
  CASE WHEN operations IS NOT NULL THEN 1 ELSE 0 END as has_operations,
  has_credentials,
  is_trigger,
  is_webhook
FROM nodes;

CREATE VIEW IF NOT EXISTS package_summary AS
SELECT 
  package_name,
  COUNT(*) as node_count,
  SUM(CASE WHEN documentation_markdown IS NOT NULL THEN 1 ELSE 0 END) as nodes_with_docs,
  SUM(CASE WHEN documentation_examples IS NOT NULL THEN 1 ELSE 0 END) as nodes_with_examples,
  SUM(has_credentials) as nodes_with_credentials,
  SUM(is_trigger) as trigger_nodes,
  SUM(is_webhook) as webhook_nodes
FROM nodes
GROUP BY package_name
ORDER BY node_count DESC;