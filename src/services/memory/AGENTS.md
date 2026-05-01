# MemoryService Agent Guidelines

## Overview

`MemoryService` is the bot's persistent key-value memory, backed by SQLite via the built-in `node:sqlite` module. It stores two things:

1. **Memories** — free-form notes the model decides to keep about a user.
2. **Phone numbers** — opt-in registry used to gate SMS sending via `ClickatellService`.

The service holds two connections to the same DB file: a writable one for mutations and a `readOnly: true` one used for reads (`recall`, `forgetMemory` lookup, `getPhoneNumberFor`). Read-only is enforced **at the SQLite level**, so even a programming bug that issues a write through the read handle fails in the engine.

## Schema

`schema.ts` is the source of truth. `IF NOT EXISTS` makes constructor calls idempotent — no migration framework yet.

- `memories(id, discord_user_id, content, created_at)` — index on `discord_user_id`.
- `phone_numbers(discord_user_id PK, phone_number, registered_at)` — one number per user, upsert via `ON CONFLICT`.

## Authority Model

Every memory/phone tool resolves the subject from `message.author.id` at the **executor**, never from tool args. The model can ask to `remember(content)` or `recall()`, but the executor pins the user to the speaker — there is no way to read or write another user's rows. `forget_memory` additionally checks that the row owner matches the requester before deleting.

## Configuration

- `ROOIVALK_DB_PATH` — file path for the SQLite database. Default `./data/rooivalk.db`. Parent directory is created on construction.
- The deploy target needs a persistent volume. On a fresh container per push, registrations evaporate.
- **Must point outside the rsynced source dirs** (`src/`, `config/`, etc.). The deploy workflow rsyncs those with `--delete`, so a DB path inside them would be wiped on every push. The default `./data/` is safe because the rsync source list excludes it.

## Testing

- Tests use a temp directory (`mkdtempSync` in `os.tmpdir()`). `:memory:` won't work because two connections to it are independent DBs.
- `index.test.ts` covers: writes, scoped recall, limit clamping, cross-user delete refusal, structural read-only enforcement, upsert, normalization, persistence across reopens.

## Out of Scope (for now)

No FTS, no tags, no expiry/TTL, no compaction, no migrations framework. Add as the table actually grows large enough to need them.
