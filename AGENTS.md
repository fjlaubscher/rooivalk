# AGENTS.MD

## Overview

This repository implements `Rooivalk`, a Node.js + TypeScript Discord bot. The bot integrates with Discord and OpenAI to:

- Listen for mentions and replies
- Generate responses via OpenAI's API
- Generate images via OpenAI gpt-image-1 model
- Create and manage Discord threads for conversations
- Post responses back to Discord
- Maintain some internal state via class-based services with private fields

The codebase uses a modular, service-based architecture. All services are TypeScript classes using private properties with an underscore prefix (e.g., `private _propertyName`).

## Project Structure

- `src/services/discord/` – DiscordService (Discord integration) - [See AGENTS.md](src/services/discord/AGENTS.md)
  - `helpers.ts` – Message parsing and formatting utilities
- `src/services/openai/` – OpenAIService (OpenAI API integration) - [See AGENTS.md](src/services/openai/AGENTS.md)
- `src/services/rooivalk/` – RooivalkService (core business logic) - [See AGENTS.md](src/services/rooivalk/AGENTS.md)
  - `helpers.ts` – Thread detection and reply handling utilities
- `src/services/yr/` – YrService (weather integration) - [See AGENTS.md](src/services/yr/AGENTS.md)
- `src/services/peapix/` – PeapixService (Bing image feed integration) - [See AGENTS.md](src/services/peapix/AGENTS.md)
- `src/services/cron/` – CronService (scheduled jobs) - [See AGENTS.md](src/services/cron/AGENTS.md)
- `src/test-utils/` – Shared test utilities (`createMockMessage.ts`, `mock.ts`, `consoleMocks.ts`)
- `src/config/` – Config loading and hot-reloading system (`loader.ts`, `watcher.ts`)
- `src/constants.ts` – Global constants
- `src/types.ts` – Shared types
- `config/` – Hot-swappable markdown configs (`instructions.md`, greetings, errors, etc.)

Other files and directories follow standard Node.js/TypeScript project conventions.

## Entry Point

- `src/index.ts` bootstraps the application, loads environment variables, instantiates services, and starts the Discord client.

## Environment

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
- **Initial context preservation**: Original conversation history that led to thread creation is captured and stored
- **Full conversation continuity**: Thread messages include both initial context AND thread-specific messages
- Thread message caching for performance with combined initial context + thread messages
- Threads auto-archive after 60 minutes of inactivity

## Agent Task Examples

| Task                         | File(s) to Modify                        | Notes                                       |
|------------------------------|------------------------------------------|---------------------------------------------|
| Add Discord command          | `services/discord/index.ts`              | Extend message/interaction handlers         |
| Add OpenAI model support     | `services/openai/index.ts`               | Add model ID, update API payload/env vars   |
| Enhance business logic       | `services/rooivalk/index.ts`             | Extend message/state handling               |
| Modify thread behavior       | `services/rooivalk/helpers.ts`           | Update `isRooivalkThread`, `isReplyToRooivalk` functions |
| Add Discord message parsing  | `services/discord/helpers.ts`            | Extend `parseMessageInChain`, `formatMessageInChain` utilities |
| Add thread-related tests     | `services/rooivalk/index.test.ts`        | Use mock threads with `createMockMessage`   |
| Update message history       | `services/discord/index.ts`              | Modify `buildMessageChainFrom*` methods; use `setThreadInitialContext()` for thread context preservation |
| Add test                     | `<service>/index.test.ts`                | Use `test-utils/createMockMessage.ts` and `test-utils/mock.ts` |
| Update MOTD image feed       | `services/peapix/index.ts`               | Adjust feed params/parsing and image metadata handling |
| Update config system         | `src/config/loader.ts`, `config/*.md`    | Modify config loading/watching; update markdown configs |
| Update config/constants      | `constants.ts`, `.env.example`           | Add new constants or env vars               |

---

> **Agents:** If a task is unclear, ask clarifying questions in commit messages. Always follow the existing architecture and class structure.
