export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'memory' CHECK (kind IN ('memory', 'preference')),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memories_user_kind ON memories(discord_user_id, kind);

CREATE TABLE IF NOT EXISTS phone_numbers (
  discord_user_id TEXT PRIMARY KEY,
  phone_number TEXT NOT NULL,
  registered_at INTEGER NOT NULL
);
`;
