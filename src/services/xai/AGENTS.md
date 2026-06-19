# XAIService Agent Guidelines

## Overview

`XAIService` is the chat/image provider class for xAI Grok. It uses the OpenAI SDK pointed at `https://api.x.ai/v1` and exposes the same surface as [`OpenAIService`](../openai/AGENTS.md) so the two are interchangeable behind the `ChatService` / `ImageService` union types in [`src/services/chat`](../chat/AGENTS.md).

The class is a deliberate parallel implementation rather than a subclass or an env-driven branch in `OpenAIService`. xAI and OpenAI diverge in subtle ways (native server tool support, image-API params and response fields) and keeping each provider's code as a self-contained class is preferred over conditionals.

## Surface

- `createResponse(author, prompt, previousResponseId?, attachments?, toolExecutor?, preferences?)` — chat via the xAI Responses API, including the function-tool execution loop and the same 404 → retry-without-id flow that flips `contextLost: true`.
- `createImage(prompt)` — direct image generation via `images.generate`. Requests `response_format: 'b64_json'` (the standard OpenAI-compat field) instead of OpenAI's `output_format` (which is `gpt-image-1`-specific).
- `generateMotdImagePrompt(location)` — asks the chat model for a fresh MOTD image prompt for the given location. Thin wrapper over the shared helper in [`src/services/chat/motd-image-prompt.ts`](../chat/AGENTS.md#motd-image-prompt); supplies this provider's client and `requireChatModel()`.
- `generateThreadName(prompt)` — one-shot thread title generation, capped to 100 chars.
- `reloadConfig(newConfig)` — hot-reload entry point.

## Differences from `OpenAIService`

- **Server tools differ.** xAI's Responses API exposes its own native tools (`web_search`, `x_search`, `code_execution`) on a different surface than OpenAI's (`web_search_preview`). `XAIService` always attaches `web_search` (xAI's variant — not in the OpenAI SDK's `Tool` union, hence the double cast at the call site) plus function tools (`FUNCTION_TOOLS`) when a `toolExecutor` is provided. Inline image generation is provided via the shared `generate_image` function tool, the same path OpenAI uses.
- **No web_search citation stripping.** xAI's chat surface does not produce `【…】` citation markers via this code path.
- **Image API params differ.** `createImage` sends `response_format: 'b64_json'` and no `output_format`. If you later add quality/size knobs, they go here independently of the OpenAI version.
- **Separate instructions file.** Defaults to `config/instructions/xai.md` (loaded as `config.instructions.xai`) rather than the OpenAI version. The two diverge in tone — keep them in sync only when the change is provider-agnostic. An instance built for an `xai` channel profile can override this via the constructor's optional `model` and `instructionsSelector` arguments (see `src/services/chat/AGENTS.md`).

## Environment

- `XAI_API_KEY` — required when the chat or image factory routes to xAI.
- `XAI_MODEL` — chat/reasoning model. Presence triggers `createChatService` to return an `XAIService`.
- `XAI_IMAGE_MODEL` — image model. Presence triggers `createImageService` to return an `XAIService`.

If either model env is set without `XAI_API_KEY`, the factory logs a warning and falls back to `OpenAIService`.
