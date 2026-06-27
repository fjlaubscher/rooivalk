import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import MemoryService from './index.ts';

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

  describe('MOTD city rotation', () => {
    const CITIES = ['Cape Town', 'Gdańsk', 'Dubai'];

    it('throws when the city list is empty', () => {
      expect(() => memory.pickMotdCity([])).toThrow(/empty list/);
    });

    it('returns a city from the provided list', () => {
      const city = memory.pickMotdCity(CITIES);
      expect(CITIES).toContain(city);
    });

    it('does not repeat a city until all have been used, then resets', () => {
      const first = memory.pickMotdCity(CITIES);
      const second = memory.pickMotdCity(CITIES);
      const third = memory.pickMotdCity(CITIES);

      // First full cycle covers every city exactly once.
      expect(new Set([first, second, third])).toEqual(new Set(CITIES));

      // Cycle reset: the fourth pick is allowed to be any city again.
      const fourth = memory.pickMotdCity(CITIES);
      expect(CITIES).toContain(fourth);
      // The rotation table now holds only the post-reset pick.
      const { rows } = memory.query('SELECT city FROM motd_city_rotation');
      expect(rows).toEqual([{ city: fourth }]);
    });

    it('handles a single-city list by resetting each time', () => {
      expect(memory.pickMotdCity(['Solo'])).toBe('Solo');
      expect(memory.pickMotdCity(['Solo'])).toBe('Solo');
    });

    it('persists rotation state across reopens', () => {
      const first = memory.pickMotdCity(CITIES);
      memory.close();
      memory = new MemoryService(dbPath);
      const second = memory.pickMotdCity(CITIES);
      expect(second).not.toBe(first);
    });
  });

  describe('MOTD prompt history', () => {
    it('records prompts and returns them newest first', () => {
      memory.recordMotdPrompt('first prompt');
      memory.recordMotdPrompt('second prompt');
      expect(memory.getRecentMotdPrompts()).toEqual([
        'second prompt',
        'first prompt',
      ]);
    });

    it('ignores empty prompts', () => {
      memory.recordMotdPrompt('   ');
      expect(memory.getRecentMotdPrompts()).toHaveLength(0);
    });

    it('prunes history to the newest `keep` rows', () => {
      for (let i = 0; i < 5; i++) {
        memory.recordMotdPrompt(`prompt ${i}`, 3);
      }
      const recent = memory.getRecentMotdPrompts();
      expect(recent).toEqual(['prompt 4', 'prompt 3', 'prompt 2']);
    });

    it('respects the recall limit', () => {
      for (let i = 0; i < 4; i++) {
        memory.recordMotdPrompt(`p${i}`);
      }
      expect(memory.getRecentMotdPrompts(2)).toEqual(['p3', 'p2']);
    });

    it('persists prompt history across reopens', () => {
      memory.recordMotdPrompt('durable prompt');
      memory.close();
      memory = new MemoryService(dbPath);
      expect(memory.getRecentMotdPrompts()).toEqual(['durable prompt']);
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

  describe('query', () => {
    it('returns rows from a parameterised SELECT', () => {
      memory.remember('user-1', 'fact A');
      memory.remember('user-2', 'fact B');
      const { rows, truncated } = memory.query(
        'SELECT content FROM memories WHERE discord_user_id = ? ORDER BY id',
        ['user-1'],
      );
      expect(truncated).toBe(false);
      expect(rows).toEqual([{ content: 'fact A' }]);
    });

    it('caps results at rowLimit and flags truncation', () => {
      for (let i = 0; i < 5; i++) {
        memory.remember('user-1', `fact ${i}`);
      }
      const { rows, truncated } = memory.query(
        'SELECT id FROM memories',
        [],
        3,
      );
      expect(rows).toHaveLength(3);
      expect(truncated).toBe(true);
    });

    it('rejects writes — the read handle is read-only', () => {
      expect(() => memory.query('DELETE FROM memories', [])).toThrow();
    });
  });

  describe('persistence', () => {
    it('survives reopening the same db file', () => {
      memory.remember('user-1', 'durable');
      memory.close();

      memory = new MemoryService(dbPath);
      expect(memory.recall('user-1')[0]!.content).toBe('durable');
    });
  });
});
