# AGENTS.MD

## Overview

This repository implements `Rooivalk`, a Node.js + TypeScript Discord bot. The bot integrates with Discord and OpenAI to:

- Listen for mentions
- Generate responses via OpenAI's API
- Generate images via OpenAI image API
- Post responses back to Discord
- Maintain some internal state via class-based services with private fields

The codebase uses a modular service-based architecture, grouping responsibilities under the `services/` directory.

> **Note to agents:** All services should be implemented using TypeScript classes. Use private properties with an underscore prefix (e.g., `private _propertyName`) to encapsulate internal state.

## Project Structure

```bash
rooivalk/
├── src/
│   ├── constants.ts            # Global constants
│   ├── index.ts                # Main entry point
│   ├── types.ts                # Shared TypeScript types
│   ├── config/                 # Runtime config loader and watcher
│   │   ├── loader.ts           # Loads markdown configs
│   │   └── watcher.ts          # Watches config directory for changes
│   ├── test-utils/             # Shared test utilities
│   │   └── createMockMessage.ts
│   ├── services/               # Core services
│   │   ├── discord/            # Discord integration layer
│   │   │   ├── index.ts        # DiscordService implementation
│   │   │   └── index.test.ts   # Unit tests for DiscordService
│   │   ├── openai/             # OpenAI integration layer
│   │   │   └── index.ts        # OpenAIService implementation
│   │   ├── rooivalk/           # Rooivalk core business logic
│   │   │   ├── index.test.ts   # Unit tests for RooivalkService
│   │   │   └── index.ts        # RooivalkService implementation
│   │   └── cron/               # Cron job service
│   │       ├── index.ts        # CronService implementation
│   │       └── index.test.ts   # Unit tests for CronService
├── config/                     # Hot-swappable markdown configs
│   ├── discord_limit.md        # Discord-specific rate limits and thresholds
│   ├── errors.md               # Error messages and handling configurations
│   ├── greetings.md            # Greeting messages for the bot
│   ├── instructions_learn.md   # Instructions for the `/learn` command
│   ├── instructions_rooivalk.md # System instructions for Rooivalk's behavior
│   └── motd.md                 # Message of the Day configurations
├── scripts/                    # Build helpers
│   ├── postbuild.mjs
│   └── resolve-ts-paths-loader.mjs
├── vitest.config.ts            # Vitest configuration
├── vitest.setup.ts             # Test setup hooks
├── package.json                # Node.js package configuration
├── tsconfig.json               # TypeScript configuration
├── .env.example                # Environment variable example file
├── yarn.lock                   # Yarn lockfile
└── README.md                   # Project documentation
```

## Architectural Notes

### Entry Point

- `src/index.ts` bootstraps the application.
- Loads environment variables.
- Instantiates service classes.
- Starts Discord client.

### Services

#### DiscordService (`services/discord/index.ts`)

- Connects to Discord API.
- Listens for events (`messageCreate`, `interactionCreate`, etc).
- Routes incoming messages to the Rooivalk service for processing.
- Sends replies and attachments back to Discord.
- Keeps track of client state and connection.

#### OpenAIService (`services/openai/index.ts`)

- Wraps OpenAI API interactions.
- Supports both `chat` and `image generation` endpoints.
- Handles rate limiting, error handling, and prompt injection.
- Models and API settings are configured via environment variables (`OPENAI_MODEL`, `OPENAI_IMAGE_MODEL`).

#### RooivalkService (`services/rooivalk/index.ts`)

- Core business logic of Rooivalk.
- Processes messages routed by DiscordService.
- Prepares prompts for OpenAIService.
- Applies additional logic for thread creation, message summarization, and response shaping.
- Keeps track of message context and state.

### Utilities

#### Test Utilities

- Located under `src/test-utils/`
- `createMockMessage.ts` used for mocking Discord messages in unit tests.

### Constants

- Global constants (shared across services) are in `src/constants.ts`.
- Service-specific constants live in their respective `services/<service>/constants.ts` files.

### Environment Variables

- Environment variables are loaded via `.env` (see `.env.example`).
- Common env vars:
  - `DISCORD_TOKEN`
  - `OPENAI_API_KEY`
  - `OPENAI_MODEL`
  - `LOG_LEVEL`

## Coding Conventions

- TypeScript only
- Class-based services with private properties (use underscore prefixes for private fields)
- Use dependency injection where applicable
- Unit tests should be placed alongside service files (e.g. `index.test.ts`)
- Use `async/await` for all async operations
- Handle errors gracefully and log meaningful output

## Agent Task Examples

| Task                         | File(s) to Modify                                          | Notes                                       |
| ---------------------------- | ---------------------------------------------------------- | ------------------------------------------- |
| Add new Discord command      | `services/discord/index.ts`                                | Extend message or interaction handlers      |
| Add new OpenAI model support | `services/openai/index.ts` | Include model ID, modify API payload, update env vars |
| Enhance business logic       | `services/rooivalk/index.ts`                               | Extend message processing or state handling |
| Add new test                 | `<service>/index.test.ts`                                  | Use `test-utils/createMockMessage.ts`       |
| Update config                | `constants.ts`, `.env.example`                             | Add new constants or env vars               |

---

> **Final note to agents:** Ask clarifying questions in commit messages if the task is underspecified. Follow existing architecture and class structure for all changes.
