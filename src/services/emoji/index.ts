import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { EMOJI_SCHEMA_SQL } from './schema.ts';
import type {
  RecordReactionParams,
  TopEmoji,
  TopGiver,
  TopMessage,
} from './types.ts';

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

  public getTopMessages(
    guildId: string,
    windowStart: number,
    windowEnd: number,
    limit: number,
  ): TopMessage[] {
    return this._readDb
      .prepare(
        `SELECT message_id, channel_id, message_author_id, COUNT(*) AS count
         FROM emoji_reactions
         WHERE guild_id = ? AND created_at >= ? AND created_at < ?
         GROUP BY message_id, channel_id, message_author_id
         ORDER BY count DESC
         LIMIT ?`,
      )
      .all(guildId, windowStart, windowEnd, limit) as TopMessage[];
  }

  public getTopGivers(
    guildId: string,
    windowStart: number,
    windowEnd: number,
    limit: number,
  ): TopGiver[] {
    return this._readDb
      .prepare(
        `WITH givers AS (
           SELECT reactor_id, COUNT(*) AS count
           FROM emoji_reactions
           WHERE guild_id = ? AND created_at >= ? AND created_at < ?
           GROUP BY reactor_id
           ORDER BY count DESC
           LIMIT ?
         ),
         fav AS (
           SELECT reactor_id, emoji_id, emoji_name, emoji_animated,
                  ROW_NUMBER() OVER (
                    PARTITION BY reactor_id ORDER BY COUNT(*) DESC
                  ) AS rn
           FROM emoji_reactions
           WHERE guild_id = ? AND created_at >= ? AND created_at < ?
             AND reactor_id IN (SELECT reactor_id FROM givers)
           GROUP BY reactor_id, emoji_id, emoji_name, emoji_animated
         )
         SELECT g.reactor_id AS user_id,
                g.count,
                f.emoji_id AS fav_emoji_id,
                f.emoji_name AS fav_emoji_name,
                f.emoji_animated AS fav_emoji_animated
         FROM givers g
         INNER JOIN fav f ON f.reactor_id = g.reactor_id AND f.rn = 1
         ORDER BY g.count DESC`,
      )
      .all(
        guildId,
        windowStart,
        windowEnd,
        limit,
        guildId,
        windowStart,
        windowEnd,
      ) as TopGiver[];
  }

  public getTopEmojis(
    guildId: string,
    windowStart: number,
    windowEnd: number,
    limit: number,
  ): TopEmoji[] {
    return this._readDb
      .prepare(
        `SELECT emoji_id, emoji_name, emoji_animated, COUNT(*) AS count
         FROM emoji_reactions
         WHERE guild_id = ? AND created_at >= ? AND created_at < ?
         GROUP BY emoji_id, emoji_name, emoji_animated
         ORDER BY count DESC
         LIMIT ?`,
      )
      .all(guildId, windowStart, windowEnd, limit) as TopEmoji[];
  }

  public close(): void {
    this._writeDb.close();
    this._readDb.close();
  }
}

export default EmojiService;
