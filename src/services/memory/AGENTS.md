# MemoryService Agent Guidelines

## Overview

`MemoryService` is the bot's persistent key-value memory, backed by SQLite via the built-in `node:sqlite` module. It stores two things:

1. **Memories** — free-form notes the model decides to keep about a user.
2. **Phone numbers** — opt-in registry used to gate SMS sending via `ClickatellService`.

The service holds two connections to the same DB file: a writable one for mutations and a `readOnly: true` one used for `querySelect` (the model's SQL escape hatch). Read-only is enforced **at the SQLite level**, not just the parser.

## Schema

`schema.ts` is the source of truth. `IF NOT EXISTS` makes constructor calls idempotent — no migration framework yet.

- `memories(id, discord_user_id, content, created_at)` — index on `discord_user_id`.
- `phone_numbers(discord_user_id PK, phone_number, registered_at)` — one number per user, upsert via `ON CONFLICT`.

## Authority Model

Writes are stamped with `message.author.id` at the **executor** in `RooivalkService`, never trusted from tool args. The model can ask to `remember(content)` but cannot pretend to be someone else. The same applies to `register_phone_number`, `forget_phone_number`, and `forget_memory` (the executor checks the requester matches the row owner before deleting).

## `querySelect` Safety

- Read-only SQLite handle (`SQLITE_OPEN_READONLY`) — writes fail at the engine level.
- Parser-level checks reject anything not starting with `SELECT` / `WITH`, multi-statement SQL, `PRAGMA`, `ATTACH`, etc.
- Single trailing `;` is tolerated; embedded `;` is rejected.

## Configuration

- `ROOIVALK_DB_PATH` — file path for the SQLite database. Default `./data/rooivalk.db`. Parent directory is created on construction.
- The deploy target needs a persistent volume. On a fresh container per push, registrations evaporate.
- **Must point outside the rsynced source dirs** (`src/`, `config/`, etc.). The deploy workflow rsyncs those with `--delete`, so a DB path inside them would be wiped on every push. The default `./data/` is safe because the rsync source list excludes it.

## Testing

- Tests use a temp directory (`mkdtempSync` in `os.tmpdir()`). `:memory:` won't work because two connections to it are independent DBs.
- `index.test.ts` covers: writes, scoped recall, limit clamping, cross-user delete refusal, parser rejections, structural read-only enforcement, upsert, normalization, persistence across reopens.

## Out of Scope (for now)

No FTS, no tags, no expiry/TTL, no compaction, no migrations framework. Add as the table actually grows large enough to need them.
