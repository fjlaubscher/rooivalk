# XAIService Agent Guidelines

## Overview

`XAIService` is the chat/image provider class for xAI Grok. It uses the OpenAI SDK pointed at `https://api.x.ai/v1` and exposes the same surface as [`OpenAIService`](../openai/AGENTS.md) so the two are interchangeable behind the `ChatService` / `ImageService` union types in [`src/services/chat`](../chat/AGENTS.md).

The class is a deliberate parallel implementation rather than a subclass or an env-driven branch in `OpenAIService`. xAI and OpenAI diverge in subtle ways (native server tool support, image-API params and response fields) and keeping each provider's code as a self-contained class is preferred over conditionals.

## Surface

- `createResponse(author, prompt, previousResponseId?, attachments?, toolExecutor?, preferences?)` — chat via the xAI Responses API, including the function-tool execution loop and the same 404 → retry-without-id flow that flips `contextLost: true`.
- `createImage(prompt)` — direct image generation via `images.generate`. Requests `response_format: 'b64_json'` (the standard OpenAI-compat field) instead of OpenAI's `output_format` (which is `gpt-image-1`-specific).
- `generateThreadName(prompt)` — one-shot thread title generation, capped to 100 chars.
- `reloadConfig(newConfig)` — hot-reload entry point.

## Differences from `OpenAIService`

- **No native server tools.** xAI's Responses API exposes its own native tools (`web_search`, `x_search`, `code_execution`) on a different surface than OpenAI's (`web_search_preview`). `XAIService` attaches no native tools and ships only function tools (`FUNCTION_TOOLS`) when a `toolExecutor` is provided. Inline image generation is provided via the shared `generate_image` function tool, the same path OpenAI uses.
- **No web_search citation stripping.** xAI's chat surface does not produce `【…】` citation markers via this code path.
- **Image API params differ.** `createImage` sends `response_format: 'b64_json'` and no `output_format`. If you later add quality/size knobs, they go here independently of the OpenAI version.

## Environment

- `XAI_API_KEY` — required when the chat or image factory routes to xAI.
- `XAI_MODEL` — chat/reasoning model. Presence triggers `createChatService` to return an `XAIService`.
- `XAI_IMAGE_MODEL` — image model. Presence triggers `createImageService` to return an `XAIService`.

If either model env is set without `XAI_API_KEY`, the factory logs a warning and falls back to `OpenAIService`.
