import { describe, it, expect } from 'vitest';

import { validateQuerySql } from './query-sqlite-guard.ts';

describe('validateQuerySql', () => {
  it('accepts a plain SELECT', () => {
    const result = validateQuerySql('SELECT * FROM emoji_reactions LIMIT 10');
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.sql).toBe('SELECT * FROM emoji_reactions LIMIT 10');
  });

  it('accepts a WITH (CTE) statement', () => {
    const result = validateQuerySql(
      'WITH top AS (SELECT * FROM emoji_reactions) SELECT * FROM top',
    );
    expect(result.ok).toBe(true);
  });

  it('strips a single trailing semicolon', () => {
    const result = validateQuerySql('SELECT 1;');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sql).toBe('SELECT 1');
  });

  it('rejects empty input', () => {
    expect(validateQuerySql('   ').ok).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(validateQuerySql(null).ok).toBe(false);
    expect(validateQuerySql(42).ok).toBe(false);
  });

  it('rejects multi-statement queries', () => {
    const result = validateQuerySql('SELECT 1; SELECT 2');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/semicolon/i);
  });

  it('rejects non-SELECT/WITH statements (DELETE, PRAGMA, etc.)', () => {
    expect(validateQuerySql('DELETE FROM emoji_reactions').ok).toBe(false);
    expect(validateQuerySql('PRAGMA table_list').ok).toBe(false);
    expect(validateQuerySql('UPDATE x SET y=1').ok).toBe(false);
  });

  it('rejects queries that touch the memories table', () => {
    const result = validateQuerySql('SELECT * FROM memories');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/memories/i);
  });

  it('rejects memories table referenced in a JOIN', () => {
    const result = validateQuerySql(
      'SELECT e.* FROM emoji_reactions e JOIN memories m ON m.discord_user_id = e.reactor_id',
    );
    expect(result.ok).toBe(false);
  });

  it('allows column names that contain the substring memories without word boundary', () => {
    // sanity: no real column has this, but verify the \b regex is doing what we want
    const result = validateQuerySql('SELECT x_memories_y FROM emoji_reactions');
    expect(result.ok).toBe(true);
  });
});
