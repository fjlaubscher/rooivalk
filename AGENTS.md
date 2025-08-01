# AGENTS.MD

## Overview

This repository implements `Rooivalk`, a Node.js + TypeScript Discord bot. The bot integrates with Discord and OpenAI to:

- Listen for mentions and replies
- Generate responses via OpenAI's API  
- Generate images via OpenAI image API
- Create and manage Discord threads for conversations
- Post responses back to Discord
- Maintain some internal state via class-based services with private fields

The codebase uses a modular, service-based architecture. All services are TypeScript classes using private properties with an underscore prefix (e.g., `private _propertyName`).

## Project Structure (Key Parts)

- `src/services/discord/` – DiscordService (Discord integration)
- `src/services/openai/` – OpenAIService (OpenAI API integration)
  - `src/services/openai/index.test.ts` – unit tests for OpenAIService
- `src/services/rooivalk/` – RooivalkService (core business logic)
- `src/services/yr/` – YrService (weather integration)
- `src/services/cron/` – CronService (scheduled jobs)
- `src/test-utils/` – Shared test utilities
- `src/constants.ts` – Global constants
- `src/types.ts` – Shared types
- `config/` – Hot-swappable markdown configs (instructions, greetings, errors, etc.)

Other files and directories follow standard Node.js/TypeScript project conventions.

## Architectural Notes

### Entry Point

- `src/index.ts` bootstraps the application, loads environment variables, instantiates services, and starts the Discord client.

### Services

#### DiscordService
- Discord API integration, event listening, message routing, and reply handling.
- `buildPromptFromMessageChain` returns formatted conversation history from reply chains.
- `buildPromptFromMessageThread` returns formatted conversation history from Discord threads.
- Thread management: creates threads when users reply to bot, handles thread ownership verification.

#### OpenAIService
- OpenAI API integration (chat, image generation), prompt injection, error and rate limit handling.

#### YrService
- Fetches and summarizes weather data from Yr.no for predefined locations; used by RooivalkService for MOTD and enhanced responses.

#### RooivalkService  
- Core business logic: processes messages, prepares prompts, integrates weather/events, shapes responses, manages context.
- Thread handling: automatically responds to all messages in bot-created threads without requiring mentions.
- Message filtering: determines when to process messages based on mentions, replies to bot, or thread ownership.

### Utilities & Constants

- Test utilities: `src/test-utils/` (e.g., `createMockMessage.ts`,
  `consoleMocks.ts`)
- Global constants: `src/constants.ts`
- Shared types: `src/types.ts`
- Service-specific constants: `services/<service>/constants.ts`
- Config directory resolver: `src/config/constants.ts`

### Environment

- Environment variables loaded via `.env` (see `.env.example`).
- Key vars: `DISCORD_TOKEN`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `LOG_LEVEL`

## Coding Conventions

- TypeScript only, strict mode enabled
- Class-based services with private properties (`_underscore`)
- Use dependency injection where applicable
- Unit tests go alongside service files (e.g. `index.test.ts`)
- Use `async/await` for async operations
- Handle errors gracefully and log meaningful output
- Follow Prettier defaults (2-space indent, semicolons)
- Group imports by origin (Node.js, external, internal)
- Type annotate function arguments/returns unless trivially inferred

## Bot Behavior

### Message Processing Logic
1. **Direct mentions**: Bot responds when mentioned anywhere (`@rooivalk message`)
2. **Replies to bot**: When users reply to bot messages, creates a thread automatically
3. **Thread conversations**: Bot responds to ALL messages in threads it created (no mentions needed)
4. **Other threads**: Bot ignores messages unless directly mentioned

### Thread Management
- Threads created automatically when users reply to bot messages
- Thread names generated via OpenAI based on conversation context
- Full conversation history maintained within threads for better context
- Threads auto-archive after 60 minutes of inactivity

## Agent Task Examples

| Task                         | File(s) to Modify                        | Notes                                       |
|------------------------------|------------------------------------------|---------------------------------------------|
| Add Discord command          | `services/discord/index.ts`              | Extend message/interaction handlers         |
| Add OpenAI model support     | `services/openai/index.ts`               | Add model ID, update API payload/env vars   |
| Enhance business logic       | `services/rooivalk/index.ts`             | Extend message/state handling               |
| Modify thread behavior       | `services/rooivalk/index.ts`             | Update thread detection/creation logic      |
| Add thread-related tests     | `services/rooivalk/index.test.ts`        | Use mock threads with `createMockMessage`   |
| Update message history       | `services/discord/index.ts`              | Modify `buildPromptFromMessage*` methods    |
| Add test                     | `<service>/index.test.ts`                | Use `test-utils/createMockMessage.ts`       |
| Update config/constants      | `constants.ts`, `.env.example`           | Add new constants or env vars               |

---

> **Agents:** If a task is unclear, ask clarifying questions in commit messages. Always follow the existing architecture and class structure.
