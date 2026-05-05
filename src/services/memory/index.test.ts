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

    it('defaults kind to memory when omitted', () => {
      memory.remember('user-1', 'loves Tabasco');
      const rows = memory.recall('user-1');
      expect(rows[0]!.kind).toBe('memory');
    });

    it('stores a preference row when kind is preference', () => {
      memory.remember('user-1', 'call me Francois', 'preference');
      const prefs = memory.getPreferences('user-1');
      expect(prefs).toHaveLength(1);
      expect(prefs[0]!.kind).toBe('preference');
      expect(prefs[0]!.content).toBe('call me Francois');
    });

    it('recall only returns memory rows even when preferences exist', () => {
      memory.remember('user-1', 'a fact', 'memory');
      memory.remember('user-1', 'a pref', 'preference');
      const recalled = memory.recall('user-1');
      expect(recalled).toHaveLength(1);
      expect(recalled[0]!.content).toBe('a fact');
    });

    it('getPreferences only returns preference rows, scoped to user', () => {
      memory.remember('user-1', 'u1 pref', 'preference');
      memory.remember('user-2', 'u2 pref', 'preference');
      memory.remember('user-1', 'u1 fact', 'memory');
      const prefs = memory.getPreferences('user-1');
      expect(prefs).toHaveLength(1);
      expect(prefs[0]!.content).toBe('u1 pref');
    });

    it('allows up to 5 preferences and rejects the 6th', () => {
      for (let i = 0; i < 5; i++) {
        memory.remember('user-1', `pref ${i}`, 'preference');
      }
      expect(() =>
        memory.remember('user-1', 'one too many', 'preference'),
      ).toThrow(/Preference cap reached \(5\)/);
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

    it('forgetMemory deletes preference rows', () => {
      const { id } = memory.remember(
        'user-1',
        'call me Francois',
        'preference',
      );
      const result = memory.forgetMemory(id, 'user-1');
      expect(result.deleted).toBe(true);
      expect(memory.getPreferences('user-1')).toHaveLength(0);
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

  describe('read-only handle', () => {
    it('rejects writes at the SQLite level', () => {
      const readDb = (
        memory as unknown as { _readDb: { exec: (sql: string) => void } }
      )._readDb;
      expect(() =>
        readDb.exec("INSERT INTO memories VALUES (1, 'x', 'y', 'memory', 0)"),
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
