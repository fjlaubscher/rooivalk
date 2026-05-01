export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(discord_user_id);

CREATE TABLE IF NOT EXISTS phone_numbers (
  discord_user_id TEXT PRIMARY KEY,
  phone_number TEXT NOT NULL,
  registered_at INTEGER NOT NULL
);
`;
