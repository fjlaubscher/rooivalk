import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { SCHEMA_SQL } from './schema.ts';

export type MemoryRow = {
  id: number;
  discord_user_id: string;
  content: string;
  created_at: number;
};

export type PhoneNumberRow = {
  discord_user_id: string;
  phone_number: string;
  registered_at: number;
};

export const PHONE_NUMBER_PATTERN = /^\d{6,15}$/;

export function normalizePhoneNumber(input: string): string {
  return input.trim().replace(/^\+/, '').replace(/[\s-]/g, '');
}

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
  ): { id: number; createdAt: number } {
    const trimmed = content?.trim();
    if (!trimmed) {
      throw new Error('Memory content cannot be empty');
    }

    const createdAt = Date.now();
    const stmt = this._writeDb.prepare(
      'INSERT INTO memories (discord_user_id, content, created_at) VALUES (?, ?, ?)',
    );
    const result = stmt.run(discordUserId, trimmed, createdAt);
    return {
      id: Number(result.lastInsertRowid),
      createdAt,
    };
  }

  public recall(discordUserId: string, limit = 10): MemoryRow[] {
    const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 100);
    const stmt = this._readDb.prepare(
      'SELECT id, discord_user_id, content, created_at FROM memories WHERE discord_user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?',
    );
    return stmt.all(discordUserId, safeLimit) as MemoryRow[];
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

  public querySelect(sql: string): unknown[] {
    const trimmed = sql.trim().replace(/;+\s*$/, '');
    if (!trimmed) {
      throw new Error('SQL query cannot be empty');
    }

    if (trimmed.includes(';')) {
      throw new Error('Multiple statements are not allowed');
    }

    const opening = trimmed.toLowerCase().slice(0, 6);
    if (!opening.startsWith('select') && !opening.startsWith('with')) {
      throw new Error(
        'Only SELECT (or WITH ... SELECT) statements are allowed',
      );
    }

    const stmt = this._readDb.prepare(trimmed);
    return stmt.all();
  }

  public registerPhoneNumber(
    discordUserId: string,
    phoneNumber: string,
  ): { phoneNumber: string } {
    const normalized = normalizePhoneNumber(phoneNumber);
    if (!PHONE_NUMBER_PATTERN.test(normalized)) {
      throw new Error(
        `Invalid phone number: ${phoneNumber}. Use international format, digits only.`,
      );
    }

    this._writeDb
      .prepare(
        `INSERT INTO phone_numbers (discord_user_id, phone_number, registered_at)
         VALUES (?, ?, ?)
         ON CONFLICT(discord_user_id) DO UPDATE SET
           phone_number = excluded.phone_number,
           registered_at = excluded.registered_at`,
      )
      .run(discordUserId, normalized, Date.now());

    return { phoneNumber: normalized };
  }

  public forgetPhoneNumber(discordUserId: string): { deleted: boolean } {
    const result = this._writeDb
      .prepare('DELETE FROM phone_numbers WHERE discord_user_id = ?')
      .run(discordUserId);
    return { deleted: result.changes > 0 };
  }

  public getPhoneNumberFor(discordUserId: string): string | null {
    const row = this._readDb
      .prepare(
        'SELECT phone_number FROM phone_numbers WHERE discord_user_id = ?',
      )
      .get(discordUserId) as { phone_number: string } | undefined;
    return row ? row.phone_number : null;
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
