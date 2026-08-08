# AGENTS.MD

## Overview

This repository implements `Rooivalk`, a Node.js + TypeScript Discord bot. The bot integrates with Discord and OpenAI to:

- Listen for mentions and replies
- Generate responses via the OpenAI Responses API, with conversation continuity handled server-side via `previous_response_id`
- Generate images via OpenAI `gpt-image-1`, surfaced both as the `/image` slash command and the `generate_image` function tool the chat model can call
- Create and manage Discord threads for conversations
- Post responses back to Discord
- Maintain some internal state via class-based services with private fields

Channel-specific chat behaviour is layered on top via declarative profiles in `config/profiles.json` (see `src/services/chat/AGENTS.md`).

The codebase uses a modular, service-based architecture. All services are TypeScript classes using private properties with an underscore prefix (e.g., `private _propertyName`).

## Project Structure

- `src/services/chat/` – Channel-profile chat services built on OpenAIService - [See AGENTS.md](src/services/chat/AGENTS.md)
- `src/services/discord/` – DiscordService (Discord integration) - [See AGENTS.md](src/services/discord/AGENTS.md)
  - `helpers.ts` – Message parsing and formatting utilities
- `src/services/openai/` – OpenAIService (OpenAI chat provider + image generation) - [See AGENTS.md](src/services/openai/AGENTS.md)
- `src/services/rooivalk/` – RooivalkService (core business logic) - [See AGENTS.md](src/services/rooivalk/AGENTS.md)
  - `helpers.ts` – Thread detection and reply handling utilities
- `src/services/yr/` – YrService (weather integration) - [See AGENTS.md](src/services/yr/AGENTS.md)
- `src/services/peapix/` – PeapixService (Bing image-of-the-day fallback for MOTD) - [See AGENTS.md](src/services/peapix/AGENTS.md)
- `src/services/emoji/` – EmojiService (SQLite-backed emoji reaction tracking + leaderboard queries) - [See AGENTS.md](src/services/emoji/AGENTS.md)
- `src/services/github/` – GithubService (create/search issues on an allowlisted set of repos) - [See AGENTS.md](src/services/github/AGENTS.md)
- `src/services/memory/` – MemoryService (SQLite-backed memory + preferences) - [See AGENTS.md](src/services/memory/AGENTS.md)
- `src/services/cron/` – CronService (scheduled jobs) - [See AGENTS.md](src/services/cron/AGENTS.md)
- `src/test-utils/` – Shared test utilities (`createMockMessage.ts`, `mock.ts`, `consoleMocks.ts`)
- `src/config/` – Config loading and hot-reloading system. `loader.ts` orchestrates `loadConfig`; the loaders are split by concern: `messages.ts` (markdown message lists and instructions), `profiles.ts` and `tool-roles.ts` (each exposing a pure validator plus its loader), and `json-config.ts` (shared config-path + JSON read/parse helper). `watcher.ts` reloads on `config/*.md` and `tool-roles.json` changes.
- `src/constants.ts` – Global constants
- `src/types.ts` – Shared types
- `config/` – Hot-swappable markdown configs (`instructions.md`, greetings, errors, etc.) plus channel profiles in `profiles.json` (gitignored; see `profiles.example.json`), each profile's instructions in `profiles/<name>.md` (gitignored; see `profiles/example.md`), and role-based tool permissions in `tool-roles.json` (gitignored; see `tool-roles.example.json`)

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
- Optional: `OPENAI_MODEL` (chat), `STEAM_API_KEY` (nightly Steam app catalogue sync), `GITHUB_TOKEN` (enables the create/search GitHub issue tools on the repos allowlisted in `GITHUB_REPOS`), `ROOIVALK_DB_PATH` (default `./data/rooivalk.db`), `ROOIVALK_LEADERBOARD_CRON`, `DISCORD_ALLOWED_APPS` (comma-separated bot ids permitted to interact), `LOG_LEVEL` (`debug` enables prompt-metric logging).
- Channel-specific chat behaviour (e.g. field hospital) is configured as profiles in `config/profiles.json`, not env — see `src/services/chat/AGENTS.md`.

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
- Prompt context splits by scope: **message-scoped** context (the replied-to message's text, embeds and attachments) is forwarded on *every* turn, because the provider cannot know what this turn points at; **conversation-scoped** context (the channel name and topic) is sent on the first turn only, since `previous_response_id` already retains it.

## Agent Task Examples

| Task                         | File(s) to Modify                        | Notes                                       |
|------------------------------|------------------------------------------|---------------------------------------------|
| Add Discord command          | `services/discord/index.ts`              | Extend message/interaction handlers         |
| Add OpenAI model support     | `services/openai/index.ts`               | Add model ID, update API payload/env vars   |
| Add new chat tool            | `services/chat/tool-names.ts` + `services/openai/tools.ts` + `services/rooivalk/tool-executor.ts` | Add the tool name constant, the schema, and the executor case. |
| Enhance business logic       | `services/rooivalk/index.ts`             | Extend message/state handling               |
| Modify thread behavior       | `services/rooivalk/helpers.ts`           | Update `isRooivalkThread`, `isReplyToRooivalk` functions |
| Add Discord helper utility   | `services/discord/helpers.ts`            | Conversation-ref resolvers live here       |
| Add thread-related tests     | `services/rooivalk/index.test.ts`        | Use mock threads with `createMockMessage`   |
| Change conversation-chain storage | `services/memory/schema.ts` + `services/memory/index.ts` | `conversation_responses` table; keep `(type, ref_id)` composite PK |
| Add test                     | `<service>/index.test.ts`                | Use `test-utils/createMockMessage.ts` and `test-utils/mock.ts` |
| Update MOTD image feed       | `services/rooivalk/index.ts`             | AI generation is primary (via `ImageService.createImage`), Peapix is the only fallback. Style/aspect arrays are in `index.ts`. |
| Update config system         | `src/config/loader.ts`, `config/*.md`    | Modify config loading/watching; update markdown configs |
| Update config/constants      | `constants.ts`, `.env.example`           | Add new constants or env vars               |

---

> **Agents:** If a task is unclear, ask clarifying questions in commit messages. Always follow the existing architecture and class structure.
