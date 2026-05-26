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

- Builds a single-turn input (optional system note identifying the speaker + the user prompt + any image/file attachments). Conversation history is **not** assembled — OpenAI chains turns server-side via `previous_response_id`.
- Passes `previous_response_id` through when provided. If the SDK returns a 404 with `param === 'previous_response_id'`, the call is retried once with no chain and the returned `OpenAIResponse` is flagged `contextLost: true`. Callers (`RooivalkService`) use that flag to surface a "context was lost" notice and clear the stale id from the store.
- Returns the new `response.id` as `responseId`. The caller persists it under the appropriate `ConversationRef` keys.
- Tool execution loop: up to `MAX_TOOL_ITERATIONS` (10) round-trips. On the final iteration, tools are stripped from the request so the model must produce a text response instead of yet another function call.
- Any `base64Image` returned by a tool result (via the `generate_image` function tool) is collected across iterations. If at least one image was produced the response is flagged `type: 'image_generation_call'` so the Discord renderer attaches it.
- `web_search` citation markers (`【…】`) are removed from output text.

## Other methods

- `createImage(prompt)` — direct image generation via `images.generate`, used by the `/image` slash command and the daily MOTD.
- `generateThreadName(prompt)` — one-shot title generation, capped to 100 chars.
- `reloadConfig(newConfig)` — hot-reload entry point.

## Tools

- `tools.ts` lists the function tools (`FUNCTION_TOOLS`) the model can call. Names are imported from `src/services/chat/tool-names.ts`. Add a new tool by adding the name constant, the schema here, and an executor case in `src/services/rooivalk/tool-executor.ts`. Inline image generation goes through the `generate_image` function tool so the same surface works on both OpenAI and xAI.
- One native server tool is always attached: `web_search_preview`.

## Environment

- `OPENAI_API_KEY` — required.
- `OPENAI_MODEL` — chat/reasoning model.
- `OPENAI_IMAGE_MODEL` — image model (e.g. `gpt-image-1`).
- `OPENAI_MODEL_FIELD_HOSPITAL` — optional; a second `OpenAIService` instance routed to in matching role/channel combos (see `src/services/chat/AGENTS.md`).

## Testing

- `index.test.ts` mocks the SDK at module level. Includes the `previous_response_id` round-trip, the 404 retry, citation stripping, attachment handling, and the preferences-injection paths.
