# Chat Service Agent Guidelines

## Overview

The `chat` module is a thin factory layer that picks which provider class backs the chat handle and the image handle on `RooivalkService`. It exists so the rest of the codebase depends on a provider-agnostic union rather than a specific class, and so the channel-routed instances are constructed in one place.

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

### `createRoutedChatServices(config)`

Builds one chat service per entry in `config.routes`, keyed by route `name`, and returns them as a `Map<string, ChatService>`. Each routed service swaps in the route's instruction profile (via the provider's `instructionsSelector` constructor option) and its `model` override; provider defaults to OpenAI but may be set to `xai` per route.

A route is skipped (with a warning) when its `instructions` profile file is missing, or when it targets xAI without `XAI_API_KEY` set. Skipping a route means `RooivalkService` falls back to the default chat service for that channel.

`RooivalkService` selects a route per incoming message via `matchChannelRoute` (channel match — with thread inheritance through `channel.parentId` — plus the route's optional role gate) and looks up the corresponding service in the map.

## Channel Routing

Channel-specific behaviour is declarative config, not code. Routes live in `config/routes.json` (deployment-specific, gitignored; see `config/routes.example.json`). Each route is a [`ChannelRoute`](../../types.ts):

| Field          | Required | Meaning                                                       |
| -------------- | -------- | ------------------------------------------------------------- |
| `name`         | yes      | Label, and the key the built service is stored under          |
| `channelId`    | yes      | Channel the route applies to (threads inherit via `parentId`) |
| `roleId`       | no       | When set, the message author must hold this role to match     |
| `instructions` | yes      | Profile name → `config/instructions/<instructions>.md`        |
| `model`        | no       | Model override; falls back to the provider's default model    |
| `provider`     | no       | `openai` (default) or `xai`                                   |

Adding a behaviour is two files and no code: a route entry plus a `config/instructions/<name>.md` profile. The field-hospital behaviour is one such route — an OpenAI route with its own model override and the `field-hospital` instruction profile.

Instruction-profile edits hot-reload through the config watcher; adding or removing a route requires a restart (services are built once at construction).

## Conversation Continuity

The Responses API holds conversation state server-side; clients chain turns by passing the previous response id. `RooivalkService` looks up the prior id in SQLite (`conversation_responses`) before each call and stores the new id afterwards. There is no manual transcript reconstruction. xAI's Responses API supports this too, with the same 404 → retry-without-id behavior baked into both provider classes.

## Shared Tool Names

`tool-names.ts` is the single source of truth for tool name string constants. The function-tool schema lives in `src/services/openai/tools.ts` and is consumed by both provider classes.

When adding a new tool:

1. Add the name constant to `src/services/chat/tool-names.ts`
2. Add the tool definition to `src/services/openai/tools.ts`
3. Handle the name in `src/services/rooivalk/tool-executor.ts`
