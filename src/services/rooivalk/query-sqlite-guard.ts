// Hard limits applied to the `query_sqlite` tool. The model can ask anything;
// these guards stop it from touching the per-user memories table or chaining
// statements via the read-only SQLite handle.

const ALLOWED_PREFIXES = ['SELECT', 'WITH'];
const FORBIDDEN_TABLE_PATTERN = /\bmemories\b/i;

export type QueryValidation =
  | { ok: true; sql: string }
  | { ok: false; error: string };

export function validateQuerySql(input: unknown): QueryValidation {
  if (typeof input !== 'string') {
    return { ok: false, error: 'sql must be a string' };
  }

  const trimmed = input.trim().replace(/;\s*$/, '');

  if (!trimmed) {
    return { ok: false, error: 'sql is empty' };
  }

  if (trimmed.includes(';')) {
    return {
      ok: false,
      error: 'Multiple statements are not allowed (no semicolons inside sql)',
    };
  }

  const firstWord = trimmed.split(/\s+/, 1)[0]?.toUpperCase() ?? '';
  if (!ALLOWED_PREFIXES.includes(firstWord)) {
    return {
      ok: false,
      error: `Only SELECT or WITH statements are allowed (got ${firstWord || 'empty'})`,
    };
  }

  if (FORBIDDEN_TABLE_PATTERN.test(trimmed)) {
    return {
      ok: false,
      error:
        "The 'memories' table is off-limits to query_sqlite. Use the recall, remember, or forget_memory tools instead.",
    };
  }

  return { ok: true, sql: trimmed };
}
