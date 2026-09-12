# EvalService Agent Guidelines

## Overview

`EvalService` is the bot's local prompt-evaluation workflow, backed by SQLite
via the built-in `node:sqlite` module (same read/write-split pattern as
`MemoryService` and `EmojiService`). It stores prompt versions, curated eval
cases, evaluated answers, and per-dimension scores in the shared
`ROOIVALK_DB_PATH` database. No hosted archive or model-training platform is
involved.

The existing `conversation_responses` / `emoji_reactions` rows are **not** a
training corpus: they hold response ids and reaction metadata, not message
bodies or model labels. Eval cases therefore carry their own recovered
`input` + `context` text, written by a reviewer — never auto-derived from a
reaction id.

## Schema (`schema.ts` is the source of truth)

- `prompt_versions(id, name, component, instructions, model, parent_id,
created_at, is_baseline)` — one row per prompt under test. `component`
  names the single prompt section this version changes (change one component
  at a time; `parent_id` tracks lineage back to the baseline).
- `eval_cases(id, slug UNIQUE, input, context, expected_tools JSON,
expected_language, expected_notes, split, nominated_by_reaction, source,
created_at)` — `split` is `heldout` (default, never pasted into a prompt)
  or `prompt_example` (explicitly allowed as in-prompt examples).
- `eval_nominations(id, message_id, channel_id, emoji_name,
message_snapshot, status, created_at)` — reaction nomination queue.
  `status` is `pending` / `approved` / `rejected`.
- `eval_results(id, case_id FK, prompt_version_id FK, model, output,
tools_used JSON, latency_ms, context_lost, created_at)` — records which
  prompt version **and** model produced each evaluated answer.
- `eval_scores(id, result_id FK, dimension, score 0-2, notes, created_at,
UNIQUE(result_id, dimension))` — one score per dimension so correctness,
  tool choice, language match, tone/humor, and length compare separately.

## Workflow

1. **Version**: `createPromptVersion({ name, component, instructions, model,
parentId, isBaseline })`. Mark the current production prompt baseline;
   each candidate changes one `component` and points `parentId` at it.
2. **Seed / curate**: `seedIfEmpty()` inserts the ~30 starter cases in
   `seed-cases.ts` (skips existing slugs). Add further cases with
   `createCase` — full text required; a bare message id is rejected.
3. **Nominate**: `nominateCase({ messageId, channelId, emojiName,
messageSnapshot })` queues a reaction-nominated message for review.
   Reactions are nominations, not labels: approving via `reviewNomination`
   only marks the queue row — the reviewer still calls `createCase` with
   recovered content. An absent reaction means nothing about quality.
4. **Run**: execute each held-out case against baseline and candidate with
   the harness of your choice and store answers via `recordResult({ caseId,
promptVersionId, model, output, toolsUsed, latencyMs, contextLost })`.
5. **Score**: `scoreResult({ resultId, dimension, score 0|1|2, notes })` per
   dimension (`correctness`, `tool_choice`, `language_match`, `tone_humor`,
   `length`). Re-scoring upserts.
6. **Compare**: `compareVersions(baselineId, candidateId)` returns
   per-dimension averages + deltas plus length summaries (avg/max,
   over-target/over-limit counts).
7. **Review / export**: `exportJson()` dumps versions, cases, results,
   scores, and nominations for local review. No OpenAI hosted Evals calls.

## Boundaries and removal

- Eval rows store case text only — no Discord user ids. Keep snapshots
  minimal and within the server's access boundaries.
- `deleteCase`, `deleteNomination`, and `deletePromptVersion` (cascading to
  results/scores) support removal requests for stored examples.

## Scoring assists (`scoring.ts`)

Pure, separately-tested helpers: `assessResponseLength` (1800-char target /
2000-char Discord limit), `compareToolChoice` (exact match or
`no-expectation`), `assistLanguageMatch` (transparent Afrikaans-signal assist
— the reviewer still assigns `language_match`), and `summarizeLengths` for
run-level bloat.

## Testing

- Tests use a temp directory (`mkdtempSync` in `os.tmpdir()`); `:memory:`
  won't work because the two connections would be independent DBs.
- `index.test.ts` covers: versioning + baseline moves, case CRUD + slug
  uniqueness + content requirement + split separation + removal, nomination
  queue semantics (no auto-cases), result provenance (version + model),
  per-dimension scoring + upsert + validation, version comparison, local
  export, seed size/idempotence/content, and the scoring assists.
