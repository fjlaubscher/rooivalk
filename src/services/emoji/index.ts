import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { EMOJI_SCHEMA_SQL } from './schema.ts';
import type { EmojiChampion, RecordReactionParams, TopUser } from './types.ts';

class EmojiService {
  private _writeDb: DatabaseSync;
  private _readDb: DatabaseSync;

  constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      mkdirSync(dirname(dbPath), { recursive: true });
    }

    this._writeDb = new DatabaseSync(dbPath);
    this._writeDb.exec(EMOJI_SCHEMA_SQL);
    this._readDb = new DatabaseSync(dbPath, { readOnly: true });
  }

  public recordReaction(params: RecordReactionParams): void {
    this._writeDb
      .prepare(
        `INSERT INTO emoji_reactions
          (guild_id, message_id, channel_id, message_author_id, reactor_id, emoji_id, emoji_name, emoji_animated, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        params.guildId,
        params.messageId,
        params.channelId,
        params.messageAuthorId,
        params.reactorId,
        params.emojiId ?? null,
        params.emojiName,
        params.emojiAnimated ? 1 : 0,
        Date.now(),
      );
  }

  public getTopReceivers(
    windowStart: number,
    windowEnd: number,
    limit: number,
  ): TopUser[] {
    return this._readDb
      .prepare(
        `SELECT message_author_id AS user_id, COUNT(*) AS count
         FROM emoji_reactions
         WHERE created_at >= ? AND created_at < ?
         GROUP BY message_author_id
         ORDER BY count DESC
         LIMIT ?`,
      )
      .all(windowStart, windowEnd, limit) as TopUser[];
  }

  public getTopGivers(
    windowStart: number,
    windowEnd: number,
    limit: number,
  ): TopUser[] {
    return this._readDb
      .prepare(
        `SELECT reactor_id AS user_id, COUNT(*) AS count
         FROM emoji_reactions
         WHERE created_at >= ? AND created_at < ?
         GROUP BY reactor_id
         ORDER BY count DESC
         LIMIT ?`,
      )
      .all(windowStart, windowEnd, limit) as TopUser[];
  }

  public getEmojiChampions(
    windowStart: number,
    windowEnd: number,
    emojiLimit: number,
  ): EmojiChampion[] {
    return this._readDb
      .prepare(
        `WITH emoji_totals AS (
           SELECT emoji_id, emoji_name, emoji_animated, SUM(1) AS total
           FROM emoji_reactions
           WHERE created_at >= ? AND created_at < ?
           GROUP BY emoji_id, emoji_name, emoji_animated
           ORDER BY total DESC
           LIMIT ?
         ),
         per_user AS (
           SELECT r.emoji_id, r.emoji_name, r.emoji_animated, r.reactor_id AS user_id, COUNT(*) AS count
           FROM emoji_reactions r
           INNER JOIN emoji_totals t ON r.emoji_id IS t.emoji_id AND r.emoji_name = t.emoji_name
           WHERE r.created_at >= ? AND r.created_at < ?
           GROUP BY r.emoji_id, r.emoji_name, r.emoji_animated, r.reactor_id
         ),
         ranked AS (
           SELECT *, ROW_NUMBER() OVER (PARTITION BY emoji_id, emoji_name ORDER BY count DESC) AS rn
           FROM per_user
         )
         SELECT emoji_id, emoji_name, emoji_animated, user_id, count
         FROM ranked
         WHERE rn = 1`,
      )
      .all(
        windowStart,
        windowEnd,
        emojiLimit,
        windowStart,
        windowEnd,
      ) as EmojiChampion[];
  }

  public close(): void {
    this._writeDb.close();
    this._readDb.close();
  }
}

export default EmojiService;
