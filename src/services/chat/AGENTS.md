# Chat Service Agent Guidelines

## Overview

The `chat` module is a thin factory layer that picks which provider class backs the chat handle and the image handle on `RooivalkService`. It exists so the rest of the codebase depends on a provider-agnostic union rather than a specific class, and so the channel-routed instances are constructed in one place.

## Provider Types

Two classes implement the provider surface:

- [`OpenAIService`](../openai/AGENTS.md) — talks to OpenAI directly.
- [`XAIService`](../xai/AGENTS.md) — talks to xAI Grok via the OpenAI SDK pointed at `https://api.x.ai/v1`.

The factories return either, narrowed via union types:

- `ChatService = OpenAIService | XAIService` — the chat surface (`createResponse`, `generateThreadName`, `reloadConfig`).
- `ImageService = OpenAIService | XAIService` — the image surface (`createImage`, `generateMotdImagePrompt`, `reloadConfig`).

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

The config watcher picks up changes to top-level `config/*.md` files plus `config/tool-roles.json` (it watches `CONFIG_DIR` non-recursively). Editing a profile's instructions under `config/profiles/` requires a restart — as does adding or removing a profile (services are built once at construction).

## Conversation Continuity

The Responses API holds conversation state server-side; clients chain turns by passing the previous response id. `RooivalkService` looks up the prior id in SQLite (`conversation_responses`) before each call and stores the new id afterwards. There is no manual transcript reconstruction. xAI's Responses API supports this too, with the same 404 → retry-without-id behavior baked into both provider classes.

## Shared Tool Names

`tool-names.ts` is the single source of truth for tool name string constants. The function-tool schema lives in `src/services/openai/tools.ts` and is consumed by both provider classes.

When adding a new tool:

1. Add the name constant to `src/services/chat/tool-names.ts`
2. Add the tool definition to `src/services/openai/tools.ts`
3. Handle the name in `src/services/rooivalk/tool-executor.ts`

## MOTD Image Prompt

`motd-image-prompt.ts` is the single source of truth for the daily MOTD image
prompt, shared by both provider classes so they stay in sync.

- `MOTD_IMAGE_PROMPT_INSTRUCTIONS` — the system instructions that tell the model
  to craft one vivid image-generation prompt for a location.
- `generateMotdImagePrompt(client, model, location)` — runs the request against
  any OpenAI-compatible client (`_openai` or `_xai`) and returns the prompt, or
  `null` on error / empty output so callers can fall back to a stored prompt.

The `location` is the configured place string passed through verbatim — it may
be a city, a suburb, or a full place name (e.g. `Sea Point, Cape Town`). Each
provider's `generateMotdImagePrompt(location)` method is a thin wrapper that
supplies its own client and `requireChatModel()`. `RooivalkService` consumes
this via the `ImageService` union (see `src/services/rooivalk/AGENTS.md`).

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
(`src/services/rooivalk/tool-executor.ts`), which exposes a `deniedMessage(name)`
check. Before running a batch of tool calls, the provider tool loop
(`OpenAIService`/`XAIService`) preflights every call: if any is gated for the
caller it refuses the whole turn — replying with a random line from
`config/permission_denied.md` (via `DiscordService.getRooivalkResponse`) instead
of running any tool or letting the model narrate the refusal. Preflighting
before dispatch means no side-effecting tool (e.g. `create_thread`) runs when a
later call in the same batch is denied.

Both config files hot-reload. `permission_denied.md` is a top-level `config/*.md`
file, picked up like the other message lists. The watcher also watches
`tool-roles.json` specifically: the permission map is read live per message (via
`buildToolExecutor` reading `this._config.toolRoles`), so an edit takes effect on
the next message with no service reconstruction — unlike `profiles.json`, whose
chat services are built once at construction. The loader fails closed, so a
malformed or half-saved edit makes the reload throw and the last good permission
map is kept.
