import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { SCHEMA_SQL } from './schema.ts';
import type { ConversationRef } from '../../types.ts';

export type MemoryKind = 'memory' | 'preference';

export type MemoryRow = {
  id: number;
  discord_user_id: string;
  content: string;
  kind: MemoryKind;
  created_at: number;
};

const MAX_PREFERENCES = 5;

class MemoryService {
  private _writeDb: DatabaseSync;
  private _readDb: DatabaseSync;
  private _closed = false;

  constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      mkdirSync(dirname(dbPath), { recursive: true });
    }

    this._writeDb = new DatabaseSync(dbPath);
    this._writeDb.exec(SCHEMA_SQL);
    this._readDb = new DatabaseSync(dbPath, { readOnly: true });
  }

  public remember(
    discordUserId: string,
    content: string,
    kind: MemoryKind = 'memory',
  ): { id: number; createdAt: number } {
    const trimmed = content?.trim();
    if (!trimmed) {
      throw new Error('Memory content cannot be empty');
    }

    const createdAt = Date.now();

    if (kind === 'preference') {
      this._writeDb.exec('BEGIN IMMEDIATE');
      let committed = false;
      try {
        const row = this._writeDb
          .prepare(
            'SELECT COUNT(*) as count FROM memories WHERE discord_user_id = ? AND kind = ?',
          )
          .get(discordUserId, 'preference') as { count: number };
        if (row.count >= MAX_PREFERENCES) {
          throw new Error(
            `Preference cap reached (${MAX_PREFERENCES}). Forget one first.`,
          );
        }
        const result = this._writeDb
          .prepare(
            'INSERT INTO memories (discord_user_id, content, kind, created_at) VALUES (?, ?, ?, ?)',
          )
          .run(discordUserId, trimmed, kind, createdAt);
        this._writeDb.exec('COMMIT');
        committed = true;
        return { id: Number(result.lastInsertRowid), createdAt };
      } finally {
        if (!committed) {
          this._writeDb.exec('ROLLBACK');
        }
      }
    }

    const stmt = this._writeDb.prepare(
      'INSERT INTO memories (discord_user_id, content, kind, created_at) VALUES (?, ?, ?, ?)',
    );
    const result = stmt.run(discordUserId, trimmed, kind, createdAt);
    return {
      id: Number(result.lastInsertRowid),
      createdAt,
    };
  }

  public recall(discordUserId: string, limit = 10): MemoryRow[] {
    const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 100);
    const stmt = this._readDb.prepare(
      'SELECT id, discord_user_id, content, kind, created_at FROM memories WHERE discord_user_id = ? AND kind = ? ORDER BY created_at DESC, id DESC LIMIT ?',
    );
    return stmt.all(discordUserId, 'memory', safeLimit) as MemoryRow[];
  }

  public getPreferences(discordUserId: string): MemoryRow[] {
    const stmt = this._readDb.prepare(
      'SELECT id, discord_user_id, content, kind, created_at FROM memories WHERE discord_user_id = ? AND kind = ? ORDER BY created_at DESC, id DESC',
    );
    return stmt.all(discordUserId, 'preference') as MemoryRow[];
  }

  public forgetMemory(
    memoryId: number,
    requesterDiscordUserId: string,
  ): { deleted: boolean; reason?: string } {
    const row = this._readDb
      .prepare('SELECT discord_user_id FROM memories WHERE id = ?')
      .get(memoryId) as { discord_user_id: string } | undefined;

    if (!row) {
      return { deleted: false, reason: 'Memory not found' };
    }

    if (row.discord_user_id !== requesterDiscordUserId) {
      return {
        deleted: false,
        reason: 'You can only delete memories about yourself',
      };
    }

    const result = this._writeDb
      .prepare('DELETE FROM memories WHERE id = ?')
      .run(memoryId);
    return { deleted: result.changes > 0 };
  }

  public getConversationResponseId(ref: ConversationRef): string | null {
    const row = this._readDb
      .prepare(
        'SELECT response_id FROM conversation_responses WHERE type = ? AND ref_id = ?',
      )
      .get(ref.type, ref.refId) as { response_id: string } | undefined;
    return row ? row.response_id : null;
  }

  public setConversationResponseId(
    ref: ConversationRef,
    responseId: string,
  ): void {
    this._writeDb
      .prepare(
        `INSERT INTO conversation_responses (type, ref_id, response_id, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(type, ref_id) DO UPDATE SET
           response_id = excluded.response_id,
           updated_at = excluded.updated_at`,
      )
      .run(ref.type, ref.refId, responseId, Date.now());
  }

  public clearConversationResponseId(ref: ConversationRef): void {
    this._writeDb
      .prepare(
        'DELETE FROM conversation_responses WHERE type = ? AND ref_id = ?',
      )
      .run(ref.type, ref.refId);
  }

  public query(
    sql: string,
    params: ReadonlyArray<string | number | null> = [],
    rowLimit = 100,
  ): { rows: Record<string, unknown>[]; truncated: boolean } {
    const cappedLimit = Math.min(Math.max(1, Math.floor(rowLimit)), 500);
    const stmt = this._readDb.prepare(sql);
    const rows: Record<string, unknown>[] = [];
    let truncated = false;
    for (const row of stmt.iterate(...params) as Iterable<
      Record<string, unknown>
    >) {
      if (rows.length >= cappedLimit) {
        truncated = true;
        break;
      }
      rows.push(row);
    }
    return { rows, truncated };
  }

  public pruneConversationResponses(olderThanMs: number): number {
    const cutoff = Date.now() - olderThanMs;
    const result = this._writeDb
      .prepare('DELETE FROM conversation_responses WHERE updated_at < ?')
      .run(cutoff);
    return result.changes as number;
  }

  /**
   * Picks a MOTD city from `cities`, avoiding any used in the current rotation
   * cycle. When every city has been used the rotation resets and starts over,
   * so no city repeats until all of them have appeared. The pick is recorded
   * atomically. Returns the chosen city name.
   */
  public pickMotdCity(cities: readonly string[]): string {
    if (cities.length === 0) {
      throw new Error('Cannot pick a MOTD city from an empty list');
    }

    this._writeDb.exec('BEGIN IMMEDIATE');
    let committed = false;
    try {
      const usedRows = this._writeDb
        .prepare('SELECT city FROM motd_city_rotation')
        .all() as { city: string }[];
      const used = new Set(usedRows.map((r) => r.city));

      let available = cities.filter((c) => !used.has(c));
      if (available.length === 0) {
        // Every city has been used — reset the cycle and start over.
        this._writeDb.exec('DELETE FROM motd_city_rotation');
        available = [...cities];
      }

      const chosen = available[Math.floor(Math.random() * available.length)]!;
      this._writeDb
        .prepare(
          'INSERT OR REPLACE INTO motd_city_rotation (city, used_at) VALUES (?, ?)',
        )
        .run(chosen, Date.now());

      this._writeDb.exec('COMMIT');
      committed = true;
      return chosen;
    } finally {
      if (!committed) {
        this._writeDb.exec('ROLLBACK');
      }
    }
  }

  /**
   * Records a MOTD image prompt and prunes the history to the newest `keep`
   * rows, so the recent-prompt context stays bounded.
   */
  public recordMotdPrompt(prompt: string, keep = 20): void {
    const trimmed = prompt?.trim();
    if (!trimmed) {
      return;
    }
    this._writeDb
      .prepare(
        'INSERT INTO motd_prompt_history (prompt, created_at) VALUES (?, ?)',
      )
      .run(trimmed, Date.now());

    const safeKeep = Math.max(0, Math.floor(keep));
    this._writeDb
      .prepare(
        `DELETE FROM motd_prompt_history
         WHERE id NOT IN (
           SELECT id FROM motd_prompt_history ORDER BY created_at DESC, id DESC LIMIT ?
         )`,
      )
      .run(safeKeep);
  }

  /** Returns the most recent MOTD image prompts, newest first. */
  public getRecentMotdPrompts(limit = 10): string[] {
    const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 100);
    const rows = this._readDb
      .prepare(
        'SELECT prompt FROM motd_prompt_history ORDER BY created_at DESC, id DESC LIMIT ?',
      )
      .all(safeLimit) as { prompt: string }[];
    return rows.map((r) => r.prompt);
  }

  public close(): void {
    if (this._closed) {
      return;
    }
    this._closed = true;
    this._readDb.close();
    this._writeDb.close();
  }
}

export default MemoryService;
