# ClaudeService Agent Guidelines

## Overview

The `ClaudeService` is one of two `ChatService` implementations (see `src/services/chat/AGENTS.md`). It wraps the Anthropic SDK and handles chat / reasoning when `ANTHROPIC_MODEL` is configured.

## Key Responsibilities

- Anthropic Messages API integration for chat completion
- System-prompt injection with `{{CURRENT_DATE}}` / `{{EMOJIS}}` substitution
- Prompt caching on the system block (`cache_control: ephemeral`)
- Function-tool loop (`tool_use` → `tool_result`) via the shared `ToolExecutor`
- Anthropic's server-side `web_search_20250305` tool for live search
- Thread-name generation

## Image Generation

Claude cannot generate images directly. When the active chat provider is Claude, the `generate_image` function tool routes through the `ToolExecutor` back to `OpenAIService.createImage()`. The resulting base64 image is surfaced on the `OpenAIResponse` via the `base64Image` field on `ToolExecutionResult`.

## Environment Variables

- `ANTHROPIC_API_KEY` — Anthropic API key
- `ANTHROPIC_MODEL` — model ID (e.g. `claude-sonnet-4-6`)

## Architecture Notes

- Class-based TypeScript with private `_underscore` properties
- Uses `@anthropic-ai/sdk`
- Returns the shared `OpenAIResponse` shape so callers stay provider-agnostic
- Errors wrapped as generic `Error` — `Anthropic.APIError` messages are preserved

## Testing

- Unit tests in `index.test.ts`
- `@anthropic-ai/sdk` is mocked via `vi.mock` with a `messages.create` spy
- `test-utils/mock.ts` provides `MOCK_CONFIG`
