# Preferences Plan

Add `kind` to memories. `'memory'` (default) = fetch via `recall`. `'preference'` = inject every turn. Solves: model not calling `recall` when it should. Preferences bypass that decision entirely.

DB will be wiped. No migration. Single user (me) right now.

---

## Schema

`src/services/memory/schema.ts` — replace `memories` table:

```sql
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'memory' CHECK (kind IN ('memory', 'preference')),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memories_user_kind ON memories(discord_user_id, kind);
```

`phone_numbers` unchanged.

---

## MemoryService changes

`src/services/memory/index.ts`

- `MemoryRow` gets `kind: 'memory' | 'preference'`.
- Export `MemoryKind = 'memory' | 'preference'`.
- `MAX_PREFERENCES = 5` constant. Hard cap.

Methods:

- `remember(userId, content, kind = 'memory')` — if `kind === 'preference'`, count existing preferences for user. If `>= MAX_PREFERENCES`, throw with message like `Preference cap reached (20). Forget one first.` Otherwise insert with `kind`.
- `recall(userId, limit)` — add `AND kind = 'memory'` to the WHERE. Preferences never returned here. They're already in context.
- `getPreferences(userId)` — new. Read-handle. `SELECT id, discord_user_id, content, kind, created_at FROM memories WHERE discord_user_id = ? AND kind = 'preference' ORDER BY created_at DESC, id DESC`. No limit (cap enforced on write). Returns `MemoryRow[]`.
- `forgetMemory(id, requesterId)` — unchanged. Works for both kinds. Ownership check stays.

---

## Tool surface

`src/services/chat/tool-names.ts` — no new tool names.

Per provider tool schema (`src/services/claude/tools.ts`, `src/services/openai/tools.ts`):

- `remember` — add optional `kind` arg, enum `['memory', 'preference']`, default `'memory'`. Description should bias toward memory:

  > `kind`: `"memory"` (default) for facts, events, one-off context fetched via `recall`. `"preference"` for stable traits that should shape every reply (name, tone, hard nos). Use `"preference"` sparingly — injected on every turn.

- `recall` — unchanged shape. Description note: only returns `memory` kind. Preferences already in context, don't try to recall them.
- `forget_memory` — unchanged. Description note: works for both kinds.

Executor `src/services/rooivalk/tool-executor.ts`:

- `REMEMBER` case — read `kind` from args, pass to `memory.remember(userId, content, kind)`. Catch the cap error like other errors.
- `RECALL` and `FORGET_MEMORY` cases — unchanged.

---

## Injection into system prompt

Goal: preferences land in context every turn, after the cached `instructions` block, so cache stays valid.

`src/services/chat/index.ts` — extend `ChatService.createResponse` signature:

```ts
createResponse(
  author: string | 'rooivalk',
  prompt: string,
  emojis?: string[],
  history?: MessageInChain[] | null,
  attachments?: AttachmentForPrompt[] | null,
  toolExecutor?: ToolExecutor,
  preferences?: MemoryRow[] | null,  // new, last arg
): Promise<OpenAIResponse>;
```

Last arg, optional, defaults `null`. Existing callers don't break.

Render helper (where it lives — probably `src/services/chat/helpers.ts` or inline in each provider):

```
[Speaker preferences]
- <content of pref 1>
- <content of pref 2>
```

Skip the whole block if `preferences` null/empty. Empty state = zero tokens added.

`src/services/claude/index.ts` — add a second `system` block after the cached instructions block:

```ts
const system: TextBlockParam[] = [
  { type: 'text', text: instructions, cache_control: { type: 'ephemeral' } },
];
if (preferences && preferences.length > 0) {
  system.push({ type: 'text', text: renderPreferences(preferences) });
  // no cache_control on this one — varies per user
}
```

Important: don't put preferences inside the cached block. They vary per speaker, would bust the cache for everyone.

`src/services/openai/index.ts` — same idea, append to its system/instructions string. OpenAI provider has different system shape, follow what's already there.

---

## Wire-up in RooivalkService

`src/services/rooivalk/index.ts` — `processMessage`:

Before `chat.createResponse(...)`:

```ts
const preferences = this._memory.getPreferences(message.author.id);
```

Pass as last arg to `createResponse`.

That's it. One read per message, hits the read-only handle, indexed lookup, tiny rows.

---

## instructions.md rubric

`config/instructions.md` — short addition near the existing memory guidance. Something like:

> When storing things you learn about the user, you have two kinds:
> - `memory` (default) — facts, events, one-off context. Fetched via `recall` when relevant.
> - `preference` — stable traits that shape every reply: name preferences, tone, communication style, hard nos. Always present in context, no `recall` needed.
>
> Default to `memory`. Use `preference` only for things that should influence every single reply.

---

## Tests

`src/services/memory/index.test.ts`:

- `remember` with no kind defaults to `'memory'`, row has `kind: 'memory'`.
- `remember` with `kind: 'preference'` stores as preference.
- `recall` only returns `memory` rows even when preferences exist for same user.
- `getPreferences` returns only preference rows, scoped to user.
- Cap: 20 preferences ok, 21st throws.
- `forgetMemory` deletes preference row, ownership check still works cross-user.
- Cross-user reads still scoped (existing test still passes).

`src/services/rooivalk/index.test.ts`:

- `processMessage` calls `getPreferences(authorId)` and passes result to `chat.createResponse` as last arg. Mock chat service, assert.

`src/services/claude/index.test.ts` and `src/services/openai/index.test.ts`:

- When `preferences` arg has rows, system payload contains rendered block.
- When `preferences` null/empty, no extra system block / no `[Speaker preferences]` text.
- Preferences block is NOT inside the cached instructions block (Claude only — assert second system entry, no cache_control).

---

## AGENTS.md updates

`src/services/memory/AGENTS.md`:

- Update Schema section: memories table now has `kind` column.
- New section: kinds — `memory` is on-demand via `recall`, `preference` is always-injected via `getPreferences`. Hard cap of 20 preferences per user.

---

## Not in this PR

- Promote / demote tools. If model misclassifies, user can `forget_memory` and re-`remember`. Add later if it actually hurts.
- Migration framework. Wiping the DB is fine.
- Per-preference TTL, ordering hints, structured fields. YAGNI.

---

## Order to implement

1. Schema + `MemoryService` methods + memory tests. Wipe DB.
2. Tool schema `kind` arg + executor wiring + tool tests.
3. `ChatService.createResponse` signature + Claude render + OpenAI render + provider tests.
4. `processMessage` fetch + pass-through + rooivalk test.
5. `config/instructions.md` rubric.
6. `AGENTS.md` updates.

Each step compiles and tests on its own.
