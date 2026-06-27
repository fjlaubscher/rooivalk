# MemoryService Agent Guidelines

## Overview

`MemoryService` is the bot's persistent key-value store, backed by SQLite via the built-in `node:sqlite` module. It stores two things:

1. **Memories** — free-form notes the model decides to keep about a user (`memory` kind), plus a capped set of stable user preferences (`preference` kind) injected into every turn.
2. **Conversation response ids** — per-conversation OpenAI `response.id` values used to chain turns via `previous_response_id`.
3. **MOTD image history** — the city rotation cycle and recent image prompts that keep the daily MOTD image varied (see MOTD section below).

The service holds two connections to the same DB file: a writable one for mutations and a `readOnly: true` one used for reads (`recall`, `getPreferences`, `forgetMemory` lookup, `getConversationResponseId`, ad-hoc `query`). Read-only is enforced **at the SQLite level**, so even a programming bug that issues a write through the read handle fails in the engine.

## `query`

`query(sql, params?, rowLimit?)` runs an arbitrary SQL statement against the read-only connection. Backs the `query_sqlite` tool so the model can inspect its own data. The read-only handle is the safety boundary — any write attempt is rejected by SQLite before the prepared statement runs. Results are capped at `rowLimit` (default 100) with a `truncated` flag set when there were more rows. Use parameter placeholders (`?`) and pass values via `params`; never interpolate user input into `sql`.

## Schema

`schema.ts` is the source of truth. `IF NOT EXISTS` makes constructor calls idempotent — no migration framework yet.

- `memories(id, discord_user_id, content, kind, created_at)` — composite index on `(discord_user_id, kind)`. `kind` is `'memory'` or `'preference'`, enforced by a CHECK constraint.
- `conversation_responses(type, ref_id, response_id, updated_at)` — composite PK on `(type, ref_id)`. `type` is `'msg'` (a bot reply id) or `'thread'` (a thread id), enforced by a CHECK constraint. Upserted via `ON CONFLICT(type, ref_id)`. Read/written via `getConversationResponseId(ref)` / `setConversationResponseId(ref, id)` / `clearConversationResponseId(ref)`. Index on `updated_at` supports the TTL prune. `pruneConversationResponses(olderThanMs)` deletes any row past its expiry — wired to a daily cron in `src/index.ts` with `CONVERSATION_RESPONSE_TTL_MS` (30 days) since OpenAI's response retention window is the upper bound on usefulness.
- `motd_city_rotation(city, used_at)` — cities used in the current MOTD rotation cycle. `city` is the PK.
- `motd_prompt_history(id, prompt, created_at)` — recent MOTD image prompts, pruned to the newest N. Index on `created_at` supports ordered recall and pruning.

## MOTD image variety

These methods keep the daily MOTD image from repeating, and back the city rotation and recent-prompt avoidance in `RooivalkService.sendMotdToMotdChannel()`:

- `pickMotdCity(cities)` — returns a city not yet used in the current cycle, recording the pick atomically (wrapped in `BEGIN IMMEDIATE` so concurrent calls can't double-pick or skip the reset). When every city has been used the rotation table is cleared and the cycle restarts, so no city repeats until all have appeared. Throws on an empty list.
- `recordMotdPrompt(prompt, keep = 20)` — stores a prompt and prunes the history to the newest `keep` rows. Blank prompts are ignored.
- `getRecentMotdPrompts(limit = 10)` — returns recent prompts newest-first; fed to the model as an avoid-list so it steers away from repeating a style or subject.

## Memory kinds

- `memory` — on-demand facts, events, one-off context. Returned by `recall`; never by `getPreferences`.
- `preference` — stable traits injected into every turn via `getPreferences`. Hard cap of 5 per user, enforced on write. Never returned by `recall`.

`forgetMemory` works on both kinds. The cap is intentionally tight — preferences should be reserved for things that belong in every single reply.

## Authority Model

Every memory tool resolves the subject from `message.author.id` at the **executor**, never from tool args. The model can ask to `remember(content)` or `recall()`, but the executor pins the user to the speaker — there is no way to read or write another user's rows. `forget_memory` additionally checks that the row owner matches the requester before deleting.

## Configuration

- `ROOIVALK_DB_PATH` — file path for the SQLite database. Default `./data/rooivalk.db`. Parent directory is created on construction.
- The deploy target needs a persistent volume. On a fresh container per push, registrations evaporate.
- **Must point outside the rsynced source dirs** (`src/`, `config/`, etc.). The deploy workflow rsyncs those with `--delete`, so a DB path inside them would be wiped on every push. The default `./data/` is safe because the rsync source list excludes it.

## Testing

- Tests use a temp directory (`mkdtempSync` in `os.tmpdir()`). `:memory:` won't work because two connections to it are independent DBs.
- `index.test.ts` covers: writes, scoped recall, limit clamping, cross-user delete refusal, structural read-only enforcement, ad-hoc `query` (parameterised SELECT, row-limit truncation, write rejection), persistence across reopens, MOTD city rotation (no repeat until cycle reset, single-city lists, persistence) and MOTD prompt history (ordering, pruning, blank handling).

## Out of Scope (for now)

No FTS, no tags, no expiry/TTL, no compaction, no migrations framework. Add as the table actually grows large enough to need them.
