import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import MemoryService, { normalizePhoneNumber } from './index.ts';

describe('normalizePhoneNumber', () => {
  it('strips leading + and whitespace and dashes', () => {
    expect(normalizePhoneNumber(' +27 82-123 4567 ')).toBe('27821234567');
  });
});

describe('MemoryService', () => {
  let tmpDir: string;
  let dbPath: string;
  let memory: MemoryService;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rooivalk-memory-'));
    dbPath = join(tmpDir, 'test.db');
    memory = new MemoryService(dbPath);
  });

  afterEach(() => {
    memory.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('memories', () => {
    it('writes a memory and reads it back via recall', () => {
      const { id } = memory.remember('user-1', 'loves Tabasco');
      expect(id).toBeGreaterThan(0);

      const rows = memory.recall('user-1');
      expect(rows).toHaveLength(1);
      expect(rows[0]!.content).toBe('loves Tabasco');
      expect(rows[0]!.discord_user_id).toBe('user-1');
    });

    it('recall is scoped to a single user', () => {
      memory.remember('user-1', 'a');
      memory.remember('user-2', 'b');
      expect(memory.recall('user-1')).toHaveLength(1);
      expect(memory.recall('user-2')).toHaveLength(1);
    });

    it('recall returns most recent first and respects limit', () => {
      memory.remember('user-1', 'first');
      memory.remember('user-1', 'second');
      memory.remember('user-1', 'third');

      const rows = memory.recall('user-1', 2);
      expect(rows.map((r) => r.content)).toEqual(['third', 'second']);
    });

    it('recall clamps limit to a sane range', () => {
      memory.remember('user-1', 'only');
      expect(memory.recall('user-1', 0)).toHaveLength(1);
      expect(memory.recall('user-1', -5)).toHaveLength(1);
      expect(memory.recall('user-1', 10000)).toHaveLength(1);
    });

    it('rejects empty content', () => {
      expect(() => memory.remember('user-1', '   ')).toThrow(
        /content cannot be empty/,
      );
    });

    it('forgetMemory deletes own memories', () => {
      const { id } = memory.remember('user-1', 'secret');
      const result = memory.forgetMemory(id, 'user-1');
      expect(result.deleted).toBe(true);
      expect(memory.recall('user-1')).toHaveLength(0);
    });

    it('forgetMemory refuses cross-user deletes', () => {
      const { id } = memory.remember('user-1', 'secret');
      const result = memory.forgetMemory(id, 'user-2');
      expect(result.deleted).toBe(false);
      expect(result.reason).toMatch(/only delete memories about yourself/);
      expect(memory.recall('user-1')).toHaveLength(1);
    });

    it('forgetMemory reports missing memories', () => {
      const result = memory.forgetMemory(99999, 'user-1');
      expect(result.deleted).toBe(false);
      expect(result.reason).toBe('Memory not found');
    });
  });

  describe('querySelect', () => {
    it('runs a SELECT and returns rows', () => {
      memory.remember('user-1', 'hello');
      const rows = memory.querySelect(
        "SELECT content FROM memories WHERE discord_user_id = 'user-1'",
      ) as Array<{ content: string }>;
      expect(rows).toEqual([{ content: 'hello' }]);
    });

    it('allows WITH ... SELECT', () => {
      memory.remember('user-1', 'a');
      const rows = memory.querySelect(
        'WITH x AS (SELECT content FROM memories) SELECT * FROM x',
      ) as Array<{ content: string }>;
      expect(rows.map((r) => r.content)).toEqual(['a']);
    });

    it('rejects empty SQL', () => {
      expect(() => memory.querySelect('   ')).toThrow(/cannot be empty/);
    });

    it('rejects non-SELECT statements', () => {
      expect(() => memory.querySelect('DELETE FROM memories')).toThrow(
        /Only SELECT/,
      );
      expect(() =>
        memory.querySelect('UPDATE memories SET content = 1'),
      ).toThrow(/Only SELECT/);
      expect(() => memory.querySelect('DROP TABLE memories')).toThrow(
        /Only SELECT/,
      );
      expect(() => memory.querySelect('PRAGMA table_info(memories)')).toThrow(
        /Only SELECT/,
      );
      expect(() => memory.querySelect('ATTACH DATABASE "x" AS y')).toThrow(
        /Only SELECT/,
      );
    });

    it('rejects multi-statement SQL', () => {
      expect(() =>
        memory.querySelect('SELECT 1; DELETE FROM memories'),
      ).toThrow(/Multiple statements/);
    });

    it('tolerates a single trailing semicolon', () => {
      memory.remember('user-1', 'x');
      expect(() =>
        memory.querySelect('SELECT content FROM memories;'),
      ).not.toThrow();
    });

    it('writes through the read-only handle fail at the SQLite level', () => {
      // sneaky: a SELECT that smuggles a write would still be blocked because
      // the read connection itself is read-only. Force it via the readDb
      // privately — verifies the structural guarantee, not just the parser.
      const readDb = (
        memory as unknown as { _readDb: { exec: (sql: string) => void } }
      )._readDb;
      expect(() =>
        readDb.exec("INSERT INTO memories VALUES (1, 'x', 'y', 0)"),
      ).toThrow();
    });
  });

  describe('phone numbers', () => {
    it('registers, looks up, and forgets a number', () => {
      memory.registerPhoneNumber('user-1', '+27 82 123 4567');
      expect(memory.getPhoneNumberFor('user-1')).toBe('27821234567');

      const forgot = memory.forgetPhoneNumber('user-1');
      expect(forgot.deleted).toBe(true);
      expect(memory.getPhoneNumberFor('user-1')).toBeNull();
    });

    it('upserts on conflict', () => {
      memory.registerPhoneNumber('user-1', '27821234567');
      memory.registerPhoneNumber('user-1', '27820000002');
      expect(memory.getPhoneNumberFor('user-1')).toBe('27820000002');
    });

    it('rejects malformed numbers', () => {
      expect(() =>
        memory.registerPhoneNumber('user-1', 'not-a-number'),
      ).toThrow(/Invalid phone number/);
    });

    it('forgetPhoneNumber on a missing user reports deleted: false', () => {
      const result = memory.forgetPhoneNumber('nobody');
      expect(result.deleted).toBe(false);
    });
  });

  describe('persistence', () => {
    it('survives reopening the same db file', () => {
      memory.remember('user-1', 'durable');
      memory.registerPhoneNumber('user-1', '27821234567');
      memory.close();

      memory = new MemoryService(dbPath);
      expect(memory.recall('user-1')[0]!.content).toBe('durable');
      expect(memory.getPhoneNumberFor('user-1')).toBe('27821234567');
    });
  });
});
