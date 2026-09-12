# OpenAIService Agent Guidelines

## Overview

`OpenAIService` wraps the OpenAI SDK. It handles chat/reasoning via the Responses API (including the tool-execution loop), image generation, and one-shot thread-name generation.

## `createResponse`

Signature:

```
createResponse(
  author,
  prompt,
  previousResponseId?: string | null,
  attachments?: AttachmentForPrompt[],
  toolExecutor?: ToolExecutor,
  preferences?: MemoryRow[],
): Promise<OpenAIResponse>
```

Behaviour:

- Builds a single-turn input (the user prompt + any image/file attachments). When the author is not `rooivalk`, the speaker identity is prefixed to the user text as a `[Discord message from <author>]` line — **not** a separate system message. System messages get treated as conversation-level framing, so with `previous_response_id` the model would anchor on the first turn's author and keep addressing a later replier as the initiator. Conversation history is **not** assembled — OpenAI chains turns server-side via `previous_response_id`.
- Passes `previous_response_id` through when provided. If the SDK returns a 404 with `param === 'previous_response_id'`, the call is retried once with no chain and the returned `OpenAIResponse` is flagged `contextLost: true`. Callers (`RooivalkService`) use that flag to surface a "context was lost" notice and clear the stale id from the store.
- Returns the new `response.id` as `responseId`. The caller persists it under the appropriate `ConversationRef` keys.
- Tool execution loop: up to `MAX_TOOL_ITERATIONS` (10) round-trips. On the final iteration, tools are stripped from the request so the model must produce a text response instead of yet another function call.
- Any `base64Image` returned by a tool result (via the `generate_image` function tool) is collected across iterations. If at least one image was produced the response is flagged `type: 'image_generation_call'` so the Discord renderer attaches it.
- Images generated during an iteration are also fed **back** to the model as a user turn of `input_image` data URIs (`detail: 'low'`) alongside that iteration's `function_call_output` items. A `function_call_output` can only carry text, so without this the model writes its caption having never seen what it drew — and the pixels never enter the chain, so follow-ups can't reason about the image either.
- `web_search` citation markers (`【…】`) are removed from output text.

## Other methods

- `createImage(prompt)` — direct image generation via `images.generate`, used by the `/image` slash command and the daily MOTD.
- `generateMotdImagePrompt(location, style, subject)` — asks the chat model to render a pre-chosen `location`/`style`/`subject` combination into a fresh MOTD image prompt (the combination is picked deterministically by the caller — see `src/services/memory/motd-rotation.ts`). Thin wrapper over the helper in `src/services/chat/motd-image-prompt.ts`; supplies the client, `requireChatModel()`, and the hot-reloaded instructions from `this._config.motdImagePrompt` (`config/motd-image-prompt.md`).
- `generateThreadName(prompt)` — one-shot title generation, capped to 100 chars.
- `reloadConfig(newConfig)` — hot-reload entry point.

## Tools

- `tools.ts` lists the function tools (`FUNCTION_TOOLS`) the model can call. Names are imported from `src/services/chat/tool-names.ts`. Add a new tool by adding the name constant, the schema here, and an executor case in `src/services/rooivalk/tool-executor.ts`. Inline image generation goes through the `generate_image` function tool.
- One native server tool is always attached: `web_search_preview`.

## Environment

- `OPENAI_API_KEY` — required.
- `OPENAI_MODEL` — chat/reasoning model.
- `OPENAI_IMAGE_MODEL` — image model (e.g. `gpt-image-1`).

A `model` and `instructionsSelector` may be passed to the constructor to build a per-profile instance with its own model and instructions (see `src/services/chat/AGENTS.md`); both default to `OPENAI_MODEL` and the OpenAI instructions when omitted.

## Testing

- `index.test.ts` mocks the SDK at module level. Includes the `previous_response_id` round-trip, the 404 retry, citation stripping, attachment handling, and the preferences-injection paths.

## Storage boundary

Local SQLite is our source of truth for **bot data**. It is not a
replacement for the Responses API's provider-side conversation state, and
preferring local storage must never be read as authorization to drop the
`previous_response_id` integration. The two stores hold different things:

**SQLite holds pointers and bot data — never transcripts.** `memories`
(user facts/preferences), `conversation_responses` (OpenAI `response.id`
values keyed by `(type, ref_id)` — ids only, no message bodies),
`motd_history`, `emoji_reactions` (reaction metadata, not message content),
and the `prompt_versions` / `eval_cases` / `eval_results` / `eval_scores`
evaluation tables (reviewer-written case text). Nothing in SQLite can
reconstruct a turn the way the provider can.

**Each OpenAI turn sends one fresh input plus a chain pointer.** The request
carries the rendered instructions, a single user turn (speaker tag, prompt,
attachments), the tool list, and `previous_response_id` when a stored id
exists. Turn-by-turn history lives provider-side; we never reassemble it
from Discord. If the stored id has aged out (404 with
`param === 'previous_response_id'`), the call is retried once unchained and
flagged `contextLost` — the same path every turn would take if chaining had
nothing to resolve to.

**Store policy: explicit `store: true`.** Every `responses.create` call in
this service (chat turn, unchained retry, tool-loop follow-ups,
`generateThreadName`) and the MOTD prompt helper in
`src/services/chat/motd-image-prompt.ts` pass `store: true` (via the
`STORE_RESPONSES` constant here; via a commented literal there, since that
helper uses the raw client). This preserves the long-standing default; it
was made
explicit (not changed) after reviewing the current official guides:

- [Conversation state](https://developers.openai.com/api/docs/guides/conversation-state):
  responses are stored by default, `previous_response_id` chains turns, and
  stored response objects expire after 30 days. The stateless pattern it
  documents (`store: false` plus replaying the full history — including
  reasoning items via `toResponseInputItems(response.output)`) is what a
  provider-stateless design would have to implement here: replaying not just
  user text but `function_call` / `function_call_output` pairs, the
  image-feedback user turns, and preferences context every turn.
- [Your data](https://developers.openai.com/api/docs/guides/your-data): API
  data is not used for training (since March 2023, unless opted in), but
  storage has two independent layers — application state (the response
  objects `store` governs) and abuse-monitoring logs (prompts/responses kept
  up to 30 days by default). Excluding content from those logs requires
  approved Zero Data Retention controls.

Consequences for future changes:

- "Local source of truth" describes where **bot data** lives. It is not a
  claim that no provider-side storage exists while `store: true` and
  chaining are in effect.
- `store: false` alone does not guarantee zero data retention — the
  abuse-monitoring layer is unaffected by the flag.
- Do not toggle storage off while assuming chaining keeps working. With no
  stored response to resolve, `previous_response_id` fails and the bot
  degrades to isolated one-shot turns (permanent `contextLost`).
- Keep this integration as-is until a separate decision both approves and
  implements local conversation-state replay.
