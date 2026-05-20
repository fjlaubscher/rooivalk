# Chat Service Agent Guidelines

## Overview

The `chat` module is a thin factory wrapper around `OpenAIService`. It exists so `RooivalkService` can hold a pluggable handle without depending on `OpenAIService` directly, and so the field-hospital instance is constructed in one place.

## Interface

`ChatService` is a type alias for `OpenAIService`. The relevant surface:

- `createResponse(author, prompt, previousResponseId?, attachments?, toolExecutor?, preferences?)` — chat completion with optional tool use, chained via OpenAI's `previous_response_id`
- `generateThreadName(prompt)` — short-form title generation
- `reloadConfig(newConfig)` — swap in new hot-reloaded config

## Conversation Continuity

The Responses API holds conversation state server-side; clients chain turns by passing the previous response id. `RooivalkService` looks up the prior id in SQLite (`conversation_responses`) before each call and stores the new id afterwards. There is no manual transcript reconstruction.

## Shared Tool Names

`tool-names.ts` is the single source of truth for tool name string constants. The OpenAI tool schema lives in `src/services/openai/tools.ts`.

When adding a new tool:

1. Add the name constant to `src/services/chat/tool-names.ts`
2. Add the tool definition to `src/services/openai/tools.ts`
3. Handle the name in the `RooivalkService` tool executor

## Field Hospital Chat Routing

`createFieldHospitalChatService()` returns a second `ChatService` instance with its own model and instruction set whenever **all** of the following are set:

- `OPENAI_MODEL_FIELD_HOSPITAL`
- `DISCORD_FIELD_HOSPITAL_ROLE_ID`
- `DISCORD_FIELD_HOSPITAL_CHANNEL_ID`
- `config/instructions_field_hospital.md` (loaded as `config.fieldHospitalInstructions`)

Any missing piece disables the feature silently. The field-hospital instance swaps in its own instruction set via `OpenAIService`'s `instructionsSelector` constructor option.

`RooivalkService` selects between the default and field-hospital instances per incoming message via `shouldUseFieldHospitalModel` (role + channel match, with thread inheritance through `channel.parentId`).
