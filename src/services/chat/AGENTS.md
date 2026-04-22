# Chat Service Agent Guidelines

## Overview

The `chat` module is the provider-agnostic entry point for chat / reasoning. It defines the `ChatService` interface and a factory that resolves the active provider at runtime based on environment variables.

## Interface

`ChatService` exposes the shared contract both `OpenAIService` and `ClaudeService` implement:

- `createResponse(author, prompt, emojis?, history?, attachments?, toolExecutor?)` — chat completion with optional tool use
- `generateThreadName(prompt)` — short-form title generation
- `reloadConfig(newConfig)` — swap in new hot-reloaded config

Both providers return the same `OpenAIResponse` shape. Rooivalk consumes the interface only and stays agnostic about the backing provider.

## Provider Selection

`resolveChatProvider()` / `createChatService()` pick a provider by inspecting env vars — the **model** env var is the trigger, because `OPENAI_API_KEY` is always present for image generation:

1. `ANTHROPIC_MODEL` set → `ClaudeService`
2. Else if `OPENAI_MODEL` set → `OpenAIService`
3. Else throws at startup

The factory reuses the `OpenAIService` instance passed in for image generation when OpenAI is also selected as the chat provider, so both surfaces share a single client.

## Shared Tool Names

`tool-names.ts` is the single source of truth for tool name string constants used by both providers. Each provider's `tools.ts` imports from here and builds its own provider-shaped tool definitions (OpenAI Responses-API shape vs Anthropic Messages-API shape).

When adding a new tool:

1. Add the name constant to `src/services/chat/tool-names.ts`
2. Add the tool definition to each provider's `tools.ts` that should expose it (not every tool is appropriate for every provider — e.g., `GENERATE_IMAGE` is only on Claude because OpenAI has a native `image_generation` server tool)
3. Handle the name in the `RooivalkService` tool executor

## Swapping Providers

To switch chat providers at runtime, change the model env var — no code changes required. The image-generation path is always handled by `OpenAIService` regardless.

## Field Hospital Chat Routing

`createFieldHospitalChatService()` returns a second `ChatService` instance pinned to **OpenAI** (regardless of the base chat provider) whenever **all** of the following are set:

- `OPENAI_MODEL_FIELD_HOSPITAL`
- `DISCORD_FIELD_HOSPITAL_ROLE_ID`
- `DISCORD_FIELD_HOSPITAL_CHANNEL_ID`
- `config/instructions_field_hospital.md` (loaded as `config.fieldHospitalInstructions`)

Any missing piece disables the feature silently. The field-hospital instance swaps in its own instruction set via `OpenAIService`'s `instructionsSelector` constructor option.

`RooivalkService` selects between the default and field-hospital instances per incoming message via `shouldUseFieldHospitalModel` (role + channel match, with thread inheritance through `channel.parentId`). The `ChatService` interface is unchanged — there is no per-call model override.

The provider is pinned to OpenAI for now because Claude's read on the target use case was less reliable in side-by-side comparison. If that changes, extend the factory rather than introducing a new config knob.
