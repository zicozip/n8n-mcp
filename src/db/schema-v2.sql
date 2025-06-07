-- Main nodes table with documentation and examples
CREATE TABLE IF NOT EXISTS nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_type TEXT UNIQUE NOT NULL,        -- e.g., "n8n-nodes-base.if"
  name TEXT NOT NULL,                    -- e.g., "If"
  display_name TEXT,                     -- e.g., "If"
  description TEXT,                      -- Brief description from node definition
  category TEXT,                         -- e.g., "Core Nodes", "Flow"
  subcategory TEXT,                      -- More specific categorization
  icon TEXT,                             -- Icon identifier/path
  
  -- Source code
  source_code TEXT NOT NULL,             -- Full node source code
  credential_code TEXT,                  -- Credential type definitions
  code_hash TEXT NOT NULL,               -- Hash for change detection
  code_length INTEGER NOT NULL,          -- Source code size
  
  -- Documentation
  documentation_markdown TEXT,           -- Full markdown documentation from n8n-docs
  documentation_url TEXT,                -- URL to documentation page
  
  -- Example usage
  example_workflow TEXT,                 -- JSON example workflow using this node
  example_parameters TEXT,               -- JSON example of node parameters
  properties_schema TEXT,                -- JSON schema of node properties
  
  -- Metadata
  package_name TEXT NOT NULL,            -- e.g., "n8n-nodes-base"
  version TEXT,                          -- Node version
  codex_data TEXT,                       -- Additional codex/metadata JSON
  aliases TEXT,                          -- JSON array of alternative names
  
  -- Flags
  has_credentials INTEGER DEFAULT 0,
  is_trigger INTEGER DEFAULT 0,          -- Whether it's a trigger node
  is_webhook INTEGER DEFAULT 0,          -- Whether it's a webhook node
  
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

-- Full Text Search virtual table for comprehensive search
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

-- Table for storing node documentation versions
CREATE TABLE IF NOT EXISTS documentation_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,                  -- 'n8n-docs-repo', 'inline', 'generated'
  commit_hash TEXT,                      -- Git commit hash if from repo
  fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Statistics table
CREATE TABLE IF NOT EXISTS extraction_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  total_nodes INTEGER NOT NULL,
  nodes_with_docs INTEGER NOT NULL,
  nodes_with_examples INTEGER NOT NULL,
  total_code_size INTEGER NOT NULL,
  total_docs_size INTEGER NOT NULL,
  extraction_date DATETIME DEFAULT CURRENT_TIMESTAMP
);