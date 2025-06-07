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