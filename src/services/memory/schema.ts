export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'memory' CHECK (kind IN ('memory', 'preference')),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memories_user_kind ON memories(discord_user_id, kind);

CREATE TABLE IF NOT EXISTS conversation_responses (
  type TEXT NOT NULL CHECK (type IN ('msg', 'thread')),
  ref_id TEXT NOT NULL,
  response_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (type, ref_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_responses_updated_at
  ON conversation_responses(updated_at);
`;
