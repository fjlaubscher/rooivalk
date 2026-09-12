export const EVAL_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS prompt_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  component TEXT NOT NULL,
  instructions TEXT NOT NULL,
  model TEXT,
  parent_id INTEGER REFERENCES prompt_versions(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  is_baseline INTEGER NOT NULL DEFAULT 0 CHECK (is_baseline IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_prompt_versions_baseline
  ON prompt_versions(is_baseline);

CREATE TABLE IF NOT EXISTS eval_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  input TEXT NOT NULL,
  context TEXT,
  expected_tools TEXT NOT NULL DEFAULT '[]',
  expected_language TEXT,
  expected_notes TEXT,
  split TEXT NOT NULL DEFAULT 'heldout' CHECK (split IN ('heldout', 'prompt_example')),
  nominated_by_reaction INTEGER NOT NULL DEFAULT 0 CHECK (nominated_by_reaction IN (0, 1)),
  source TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_eval_cases_split
  ON eval_cases(split);

CREATE TABLE IF NOT EXISTS eval_nominations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  emoji_name TEXT NOT NULL,
  message_snapshot TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_eval_nominations_status
  ON eval_nominations(status);

CREATE TABLE IF NOT EXISTS eval_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL REFERENCES eval_cases(id) ON DELETE CASCADE,
  prompt_version_id INTEGER NOT NULL REFERENCES prompt_versions(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  output TEXT NOT NULL,
  tools_used TEXT NOT NULL DEFAULT '[]',
  latency_ms INTEGER,
  context_lost INTEGER NOT NULL DEFAULT 0 CHECK (context_lost IN (0, 1)),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_eval_results_case_version
  ON eval_results(case_id, prompt_version_id);
CREATE INDEX IF NOT EXISTS idx_eval_results_version
  ON eval_results(prompt_version_id);

CREATE TABLE IF NOT EXISTS eval_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  result_id INTEGER NOT NULL REFERENCES eval_results(id) ON DELETE CASCADE,
  dimension TEXT NOT NULL CHECK (dimension IN ('correctness', 'tool_choice', 'language_match', 'tone_humor', 'length')),
  score REAL NOT NULL CHECK (score >= 0 AND score <= 2),
  notes TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (result_id, dimension)
);

CREATE INDEX IF NOT EXISTS idx_eval_scores_result
  ON eval_scores(result_id);
`;
