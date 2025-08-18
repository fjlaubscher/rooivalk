# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Build**: `pnpm build` - Compiles TypeScript to JavaScript
- **Start**: `pnpm start` - Runs the bot using native TypeScript execution
- **Test**: `pnpm test` - Runs all unit tests with Vitest
- **Format Check**: `pnpm prettier:check` - Checks code formatting
- **Format Fix**: `pnpm prettier:format` - Auto-formats code

## Architecture and Rules

For detailed project structure, architecture, and coding conventions, use these MCP tools:

- `mcp__agent-rules__load_agents` - Load comprehensive project guidelines from AGENTS.md
- `mcp__agent-rules__get_agents` - Get current project architecture and conventions

## Environment Setup

- Copy `.env.example` to `.env` and configure required Discord/OpenAI credentials
- Key variables: `DISCORD_TOKEN`, `OPENAI_API_KEY`, `DISCORD_GUILD_ID`, `DISCORD_APP_ID`

## Key Development Notes

- TypeScript strict mode with class-based services using private `_underscore` properties
- pnpm package manager (v10.x) with Node.js 22+ requirement
- Vitest for testing with utilities in `src/test-utils/`
- Hot-reloadable config system via `config/*.md` files
