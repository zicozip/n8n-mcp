-- Ultra-simple schema for MVP
CREATE TABLE IF NOT EXISTS nodes (
  node_type TEXT PRIMARY KEY,
  package_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  development_style TEXT CHECK(development_style IN ('declarative', 'programmatic')),
  is_ai_tool INTEGER DEFAULT 0,
  is_trigger INTEGER DEFAULT 0,
  is_webhook INTEGER DEFAULT 0,
  is_versioned INTEGER DEFAULT 0,
  version TEXT,
  documentation TEXT,
  properties_schema TEXT,
  operations TEXT,
  credentials_required TEXT,
  outputs TEXT, -- JSON array of output definitions
  output_names TEXT, -- JSON array of output names
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Minimal indexes for performance
CREATE INDEX IF NOT EXISTS idx_package ON nodes(package_name);
CREATE INDEX IF NOT EXISTS idx_ai_tool ON nodes(is_ai_tool);
CREATE INDEX IF NOT EXISTS idx_category ON nodes(category);

-- Templates table for n8n workflow templates
CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY,
  workflow_id INTEGER UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  author_name TEXT,
  author_username TEXT,
  author_verified INTEGER DEFAULT 0,
  nodes_used TEXT, -- JSON array of node types
  workflow_json TEXT, -- Complete workflow JSON (deprecated, use workflow_json_compressed)
  workflow_json_compressed TEXT, -- Compressed workflow JSON (base64 encoded gzip)
  categories TEXT, -- JSON array of categories
  views INTEGER DEFAULT 0,
  created_at DATETIME,
  updated_at DATETIME,
  url TEXT,
  scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT, -- Structured metadata from OpenAI (JSON)
  metadata_generated_at DATETIME -- When metadata was generated
);

-- Templates indexes
CREATE INDEX IF NOT EXISTS idx_template_nodes ON templates(nodes_used);
CREATE INDEX IF NOT EXISTS idx_template_updated ON templates(updated_at);
CREATE INDEX IF NOT EXISTS idx_template_name ON templates(name);
CREATE INDEX IF NOT EXISTS idx_template_metadata ON templates(metadata_generated_at);

-- Pre-extracted node configurations from templates
-- This table stores the top node configurations from popular templates
-- Provides fast access to real-world configuration examples
CREATE TABLE IF NOT EXISTS template_node_configs (
  id INTEGER PRIMARY KEY,
  node_type TEXT NOT NULL,
  template_id INTEGER NOT NULL,
  template_name TEXT NOT NULL,
  template_views INTEGER DEFAULT 0,

  -- Node configuration (extracted from workflow)
  node_name TEXT,                  -- Node name in workflow (e.g., "HTTP Request")
  parameters_json TEXT NOT NULL,   -- JSON: node.parameters
  credentials_json TEXT,            -- JSON: node.credentials (if present)

  -- Pre-calculated metadata for filtering
  has_credentials INTEGER DEFAULT 0,
  has_expressions INTEGER DEFAULT 0,  -- Contains {{...}} or $json/$node
  complexity TEXT CHECK(complexity IN ('simple', 'medium', 'complex')),
  use_cases TEXT,                   -- JSON array from template.metadata.use_cases

  -- Pre-calculated ranking (1 = best, 2 = second best, etc.)
  rank INTEGER DEFAULT 0,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_config_node_type_rank
  ON template_node_configs(node_type, rank);

CREATE INDEX IF NOT EXISTS idx_config_complexity
  ON template_node_configs(node_type, complexity, rank);

CREATE INDEX IF NOT EXISTS idx_config_auth
  ON template_node_configs(node_type, has_credentials, rank);

-- View for easy querying of top configs
CREATE VIEW IF NOT EXISTS ranked_node_configs AS
SELECT
  node_type,
  template_name,
  template_views,
  parameters_json,
  credentials_json,
  has_credentials,
  has_expressions,
  complexity,
  use_cases,
  rank
FROM template_node_configs
WHERE rank <= 5  -- Top 5 per node type
ORDER BY node_type, rank;

-- Note: FTS5 tables are created conditionally at runtime if FTS5 is supported
-- See template-repository.ts initializeFTS5() method