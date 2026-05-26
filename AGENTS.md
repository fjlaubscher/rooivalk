# AGENTS.MD

## Overview

This repository implements `Rooivalk`, a Node.js + TypeScript Discord bot. The bot integrates with Discord and a pluggable LLM provider to:

- Listen for mentions and replies
- Generate responses via the OpenAI Responses API (or xAI Grok via the OpenAI SDK), with conversation continuity handled server-side via `previous_response_id`
- Generate images via OpenAI `gpt-image-1` or xAI Grok image models, surfaced both as the `/image` slash command and the `generate_image` function tool the chat model can call
- Create and manage Discord threads for conversations
- Post responses back to Discord
- Maintain some internal state via class-based services with private fields

The chat and image providers are independently swappable: `XAI_MODEL` flips chat to xAI, `XAI_IMAGE_MODEL` flips image generation to xAI, neither affects the field-hospital chat service which always uses OpenAI.

The codebase uses a modular, service-based architecture. All services are TypeScript classes using private properties with an underscore prefix (e.g., `private _propertyName`).

## Project Structure

- `src/services/chat/` – ChatService factory wrapper around OpenAIService - [See AGENTS.md](src/services/chat/AGENTS.md)
- `src/services/discord/` – DiscordService (Discord integration) - [See AGENTS.md](src/services/discord/AGENTS.md)
  - `helpers.ts` – Message parsing and formatting utilities
- `src/services/openai/` – OpenAIService (OpenAI chat provider + image generation) - [See AGENTS.md](src/services/openai/AGENTS.md)
- `src/services/xai/` – XAIService (xAI Grok chat + image provider via OpenAI SDK) - [See AGENTS.md](src/services/xai/AGENTS.md)
- `src/services/rooivalk/` – RooivalkService (core business logic) - [See AGENTS.md](src/services/rooivalk/AGENTS.md)
  - `helpers.ts` – Thread detection and reply handling utilities
- `src/services/yr/` – YrService (weather integration) - [See AGENTS.md](src/services/yr/AGENTS.md)
- `src/services/peapix/` – PeapixService (Bing image-of-the-day fallback for MOTD) - [See AGENTS.md](src/services/peapix/AGENTS.md)
- `src/services/emoji/` – EmojiService (SQLite-backed emoji reaction tracking + leaderboard queries) - [See AGENTS.md](src/services/emoji/AGENTS.md)
- `src/services/memory/` – MemoryService (SQLite-backed memory + preferences) - [See AGENTS.md](src/services/memory/AGENTS.md)
- `src/services/cron/` – CronService (scheduled jobs) - [See AGENTS.md](src/services/cron/AGENTS.md)
- `src/test-utils/` – Shared test utilities (`createMockMessage.ts`, `mock.ts`, `consoleMocks.ts`)
- `src/config/` – Config loading and hot-reloading system (`loader.ts`, `watcher.ts`)
- `src/constants.ts` – Global constants
- `src/types.ts` – Shared types
- `config/` – Hot-swappable markdown configs (per-provider `instructions/openai.md` and `instructions/xai.md`, greetings, errors, etc.)

Other files and directories follow standard Node.js/TypeScript project conventions.

## Development Commands

- **Start**: `pnpm start` - Runs the bot using native TypeScript execution
- **Test**: `pnpm test` - Runs all unit tests with Vitest
- **Type Check**: `pnpm typecheck` - Runs TypeScript type checking
- **Format Check**: `pnpm prettier:check` - Checks code formatting
- **Format Fix**: `pnpm format` - Auto-formats code

**Before committing**, always run `pnpm format` followed by `pnpm test`. CI enforces both `prettier:check` and the test suite — commits that skip formatting will fail the pipeline.

## Entry Point

- `src/index.ts` bootstraps the application, loads environment variables, instantiates services, and starts the Discord client.
- Start script: `node src/index.ts` — runs TypeScript natively via Node.js 24+ (no build step or custom loader required). CI pins 24.12.0.

## Environment

- Copy `.env.example` to `.env` and configure required credentials.
- Required: `DISCORD_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_APP_ID`, `DISCORD_STARTUP_CHANNEL_ID`, `DISCORD_MOTD_CHANNEL_ID`, `OPENAI_API_KEY`, `OPENAI_IMAGE_MODEL`, `ROOIVALK_MOTD_CRON`.
- Optional: `OPENAI_MODEL` (chat), `OPENAI_MODEL_FIELD_HOSPITAL` + `DISCORD_FIELD_HOSPITAL_ROLE_ID` + `DISCORD_FIELD_HOSPITAL_CHANNEL_ID` (field hospital routing), `XAI_API_KEY` + `XAI_MODEL` (chat → xAI), `XAI_IMAGE_MODEL` (image gen → xAI), `STEAM_API_KEY` (nightly Steam app catalogue sync), `ROOIVALK_DB_PATH` (default `./data/rooivalk.db`), `ROOIVALK_LEADERBOARD_CRON`, `DISCORD_ALLOWED_APPS` (comma-separated bot ids permitted to interact), `LOG_LEVEL` (`debug` enables prompt-metric logging).

## Coding Conventions

- TypeScript 6 strict mode with `nodenext` module resolution
- All imports use relative paths with `.ts` extensions (no path aliases)
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
- Threads created automatically when users reply to bot messages.
- Thread names generated via OpenAI from the current message content (one-shot).
- Threads auto-archive after 60 minutes of inactivity.

### Conversation Continuity
- The OpenAI Responses API holds full turn-by-turn state; clients chain turns via `previous_response_id`. The bot does not reconstruct history from Discord.
- Per-conversation response ids live in SQLite (`conversation_responses` table) keyed by `(type, ref_id)` where `type` is `'msg'` (a bot reply id) or `'thread'` (a thread id).
- On the turn that creates a thread, the new response id is written under **both** the msg id and the thread id so the chain survives the transition.
- If a stored response id has aged out (OpenAI 404), `OpenAIService` transparently retries without it and flags `contextLost: true` so `RooivalkService` can prepend a notice to the reply.

## Agent Task Examples

| Task                         | File(s) to Modify                        | Notes                                       |
|------------------------------|------------------------------------------|---------------------------------------------|
| Add Discord command          | `services/discord/index.ts`              | Extend message/interaction handlers         |
| Add OpenAI model support     | `services/openai/index.ts`               | Add model ID, update API payload/env vars   |
| Add new chat tool            | `services/chat/tool-names.ts` + `services/openai/tools.ts` + `services/rooivalk/tool-executor.ts` | Add the tool name constant, the schema, and the executor case. The schema is shared by both `OpenAIService` and `XAIService`. |
| Enhance business logic       | `services/rooivalk/index.ts`             | Extend message/state handling               |
| Modify thread behavior       | `services/rooivalk/helpers.ts`           | Update `isRooivalkThread`, `isReplyToRooivalk` functions |
| Add Discord helper utility   | `services/discord/helpers.ts`            | Conversation-ref resolvers live here       |
| Add thread-related tests     | `services/rooivalk/index.test.ts`        | Use mock threads with `createMockMessage`   |
| Change conversation-chain storage | `services/memory/schema.ts` + `services/memory/index.ts` | `conversation_responses` table; keep `(type, ref_id)` composite PK |
| Add test                     | `<service>/index.test.ts`                | Use `test-utils/createMockMessage.ts` and `test-utils/mock.ts` |
| Update MOTD image feed       | `services/rooivalk/index.ts`             | AI generation is primary (via the active `ImageService.createImage`), Peapix is the only fallback. Style/aspect arrays are in `index.ts`. |
| Update config system         | `src/config/loader.ts`, `config/*.md`    | Modify config loading/watching; update markdown configs |
| Update config/constants      | `constants.ts`, `.env.example`           | Add new constants or env vars               |

---

> **Agents:** If a task is unclear, ask clarifying questions in commit messages. Always follow the existing architecture and class structure.
