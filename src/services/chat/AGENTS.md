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

### `createProfileChatServices(config)`

Builds one chat service per entry in `config.profiles`, keyed by profile `name`, and returns them as a `Map<string, ChatService>`. Each service swaps in the profile's instructions (via the provider's `instructionsSelector` constructor option) and its `model` override; provider defaults to OpenAI but may be set to `xai` per profile.

A profile is skipped (with a warning) when its instructions file is missing, or when it targets xAI without `XAI_API_KEY` set. Skipping a profile means `RooivalkService` falls back to the default chat service for that channel.

`RooivalkService` selects a profile per incoming message via `matchProfile` (channel match — with thread inheritance through `channel.parentId` — plus the profile's optional role gate) and looks up the corresponding service in the map.

## Channel Profiles

Channel-specific behaviour is declarative config, not code. Profiles live in `config/profiles.json` (deployment-specific, gitignored; see `config/profiles.example.json`). Each profile is a [`Profile`](../../types.ts):

| Field       | Required | Meaning                                                         |
| ----------- | -------- | --------------------------------------------------------------- |
| `name`      | yes      | Label, service map key, and instructions file basename          |
| `channelId` | yes      | Channel the profile applies to (threads inherit via `parentId`) |
| `roleId`    | no       | When set, the message author must hold this role to match       |
| `model`     | no       | Model override; falls back to the provider's default model      |
| `provider`  | no       | `openai` (default) or `xai`                                     |

A profile's instructions are loaded from `config/profiles/<name>.md`, resolved from its `name`. Adding a behaviour is two files and no code: a profile entry plus its `config/profiles/<name>.md` instructions (see `config/profiles/example.md`). The field-hospital behaviour is one such profile — an OpenAI profile with its own model override and a `field-hospital.md` instructions file.

The config watcher only picks up changes to top-level `config/*.md` files (it watches `CONFIG_DIR` non-recursively), so editing a profile's instructions under `config/profiles/` requires a restart — as does adding or removing a profile (services are built once at construction).

## Conversation Continuity

The Responses API holds conversation state server-side; clients chain turns by passing the previous response id. `RooivalkService` looks up the prior id in SQLite (`conversation_responses`) before each call and stores the new id afterwards. There is no manual transcript reconstruction. xAI's Responses API supports this too, with the same 404 → retry-without-id behavior baked into both provider classes.

## Shared Tool Names

`tool-names.ts` is the single source of truth for tool name string constants. The function-tool schema lives in `src/services/openai/tools.ts` and is consumed by both provider classes.

When adding a new tool:

1. Add the name constant to `src/services/chat/tool-names.ts`
2. Add the tool definition to `src/services/openai/tools.ts`
3. Handle the name in `src/services/rooivalk/tool-executor.ts`

## Role-Based Tool Permissions

Tool access can be gated by Discord role, independent of channel profiles.
`config/tool-roles.json` (deployment-specific, gitignored; see
`tool-roles.example.json`) maps a role id to the tool names its holders may use:

```json
{ "<role_id>": ["run_bash", "query_sqlite", "describe_schema"] }
```

A tool listed under any role is restricted — only members holding a role that
grants it may invoke it. Tools listed nowhere are unrestricted. The gate is
channel-independent, so it applies in every channel whether or not a channel
profile matches.

Enforcement lives in `buildToolExecutor`
(`src/services/rooivalk/tool-executor.ts`): before dispatching a call it checks
the caller's roles, and on a miss returns a `deniedMessage` — a random line from
`config/permission_denied.md` via `DiscordService.getRooivalkResponse`. The
provider tool loop (`OpenAIService`/`XAIService`) stops on that signal and
replies with the line rather than letting the model narrate the refusal. The
file is read at startup, so changing it needs a restart.
