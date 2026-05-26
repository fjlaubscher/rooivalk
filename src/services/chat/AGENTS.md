# Chat Service Agent Guidelines

## Overview

The `chat` module is a thin factory layer that picks which provider class backs the chat handle and the image handle on `RooivalkService`. It exists so the rest of the codebase depends on a provider-agnostic union rather than a specific class, and so the field-hospital instance is constructed in one place.

## Provider Types

Two classes implement the provider surface:

- [`OpenAIService`](../openai/AGENTS.md) — talks to OpenAI directly.
- [`XAIService`](../xai/AGENTS.md) — talks to xAI Grok via the OpenAI SDK pointed at `https://api.x.ai/v1`.

The factories return either, narrowed via union types:

- `ChatService = OpenAIService | XAIService` — the chat surface (`createResponse`, `generateThreadName`, `reloadConfig`).
- `ImageService = OpenAIService | XAIService` — the image surface (`createImage`, `reloadConfig`).

Both classes are kept as parallel implementations rather than a unified class with provider branches. The two providers diverge in subtle ways (native server tool support, image API response shape, image params), and duplicating the SDK-using code keeps each path readable on its own.

## Factories

### `createChatService(config, env)`

Returns the default chat provider:

- If `XAI_MODEL` and `XAI_API_KEY` are both set → `XAIService`.
- If `XAI_MODEL` is set without `XAI_API_KEY` → warns and falls back to `OpenAIService`.
- Otherwise → `OpenAIService`.

### `createImageService(config, env)`

Returns the image provider used by `_openai` on `RooivalkService` (MOTD + `/image` slash command):

- If `XAI_IMAGE_MODEL` and `XAI_API_KEY` are both set → `XAIService`.
- If `XAI_IMAGE_MODEL` is set without `XAI_API_KEY` → warns and falls back to `OpenAIService`.
- Otherwise → `OpenAIService`.

Chat and image are toggled independently — you can run chat through xAI while keeping images on OpenAI, or vice-versa.

### `createFieldHospitalChatService(config, env)`

Returns a second `OpenAIService` instance with its own model and instruction set whenever **all** of the following are set:

- `OPENAI_MODEL_FIELD_HOSPITAL`
- `DISCORD_FIELD_HOSPITAL_ROLE_ID`
- `DISCORD_FIELD_HOSPITAL_CHANNEL_ID`
- `config/instructions_field_hospital.md` (loaded as `config.fieldHospitalInstructions`)

Any missing piece disables the feature silently. Field hospital is **always** routed to OpenAI regardless of the `XAI_*` env vars — the field-hospital instructions are tuned for OpenAI's chat model and must not be routed elsewhere. The field-hospital instance swaps in its own instruction set via `OpenAIService`'s `instructionsSelector` constructor option.

`RooivalkService` selects between the default and field-hospital instances per incoming message via `shouldUseFieldHospitalModel` (role + channel match, with thread inheritance through `channel.parentId`).

## Conversation Continuity

The Responses API holds conversation state server-side; clients chain turns by passing the previous response id. `RooivalkService` looks up the prior id in SQLite (`conversation_responses`) before each call and stores the new id afterwards. There is no manual transcript reconstruction. xAI's Responses API supports this too, with the same 404 → retry-without-id behavior baked into both provider classes.

## Shared Tool Names

`tool-names.ts` is the single source of truth for tool name string constants. The function-tool schema lives in `src/services/openai/tools.ts` and is consumed by both provider classes.

When adding a new tool:

1. Add the name constant to `src/services/chat/tool-names.ts`
2. Add the tool definition to `src/services/openai/tools.ts`
3. Handle the name in `src/services/rooivalk/tool-executor.ts`
