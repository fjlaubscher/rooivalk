export const EMOJI_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS emoji_reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_author_id TEXT NOT NULL,
  reactor_id TEXT NOT NULL,
  emoji_id TEXT,
  emoji_name TEXT NOT NULL,
  emoji_animated INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_emoji_reactions_created_at ON emoji_reactions(created_at);
CREATE INDEX IF NOT EXISTS idx_emoji_reactions_window_receiver
  ON emoji_reactions(created_at, message_author_id);
CREATE INDEX IF NOT EXISTS idx_emoji_reactions_window_reactor
  ON emoji_reactions(created_at, reactor_id);
`;
