# RooivalkService Agent Guidelines

## Overview

The RooivalkService contains the core business logic for the bot. It processes messages, prepares prompts, integrates weather/events, shapes responses, and manages conversational context.

## Key Responsibilities

- Core business logic and message processing
- Prompt preparation and context management
- Weather and event data integration
- Response shaping and formatting
- Thread handling and automatic responses
- Message filtering and routing decisions

## Core Functionality

### Message Processing

- Determines when to process messages based on mentions, replies to bot, or thread ownership
- Processes message content and prepares appropriate responses
- Integrates contextual information (weather, events, etc.)

### Thread Handling

- Automatically responds to ALL messages in bot-created threads (no mentions needed).
- Thread names are generated one-shot from the current message content via `ChatService.generateThreadName`.

### Conversation Continuity

- `processMessage` derives a `ConversationRef` via `resolveConversationLookupRef`, fetches any stored `previous_response_id` from `MemoryService`, and hands it to the selected `ChatService.createResponse`.
- After the reply is sent, the new response id is written under every ref returned by `resolveConversationStoreRefs` (msg id, plus thread id when a thread was created this turn).
- When the chat provider reports `contextLost: true` (an aged-out `previous_response_id` triggers a one-shot retry without it), the stale id is cleared and a short "context was lost in the void" notice is prepended to the reply.

Prompt context splits by **scope**, and the split decides when it is sent. Keep this distinction when adding new context — collapsing the two is what caused [#93](https://github.com/fjlaubscher/rooivalk/issues/93).

| Scope                                                   | Examples                                                     | Sent            |
| ------------------------------------------------------- | ------------------------------------------------------------ | --------------- |
| **Message-scoped** — a fact about _this_ turn           | `[Replying to …]` plus that message's attachments and embeds | every turn      |
| **Conversation-scoped** — a fact about _where_ it lives | `[Thread started by …]`, `[Channel #… — description: "…"]`   | first turn only |

- `loadReferencedMessageContext` fetches the replied-to message on **every** turn and prepends a `[Replying to <author>: "<content>" [embed: …] (N attachments)]` block. The provider cannot know which message the user just replied to — that is not something `previous_response_id` retains — and mid-conversation that message's image is usually the entire question. Its allowed attachments are merged ahead of the current message's and deduped by URL. A fetch failure, or a message that resolves to nothing, falls back silently to the bare prompt.
- `buildMessageContext` also reads the referenced message's **embeds** via `summarizeEmbeds` (in `helpers.ts`): `title`/`description`/`author`/`footer` become `[embed: …]` text, and `image.url` joins the attachment list. Three deliberate exclusions — `attachment://` URLs are dropped (they only resolve inside Discord, and the file is already in `attachments`); `thumbnail` is ignored so link previews don't flood the vision payload with favicons; and URLs that don't end in an `IMAGE_ATTACHMENT_EXTENSIONS` extension are dropped. That last one mirrors the `isAttachmentAllowed` check real attachments go through: an embed image URL carries no content type, so the extension is the only signal, and forwarding an unsupported format (an animated Tenor GIF, an extensionless CDN URL) fails the whole turn with a 400 rather than degrading. This is what lets a follow-up about the MOTD picture reach both the JPEG and the prompt that generated it.
- Quoted content is capped at `REFERENCED_CONTENT_MAX_LENGTH` (500 chars) and embed text at `REFERENCED_EMBED_TEXT_MAX_LENGTH` — a referenced message is a pointer, not a document.
- On the first turn only, `loadThreadStarterContext` reads the message a thread was started from via `ThreadChannel.fetchStarterMessage()` and prepends a `[Thread started by <author>: …]` block through the same `buildMessageContext`. A thread a user opens on a bot post — the MOTD especially — carries no reply reference, so without this the post the thread is _about_ never reaches the model. It is skipped when the reply already targets the starter (a message-started thread shares its id with its starter message, so that would send it twice) and when a fetch fails or returns nothing. **This does not change where the bot speaks** — unprompted replies are still limited to threads it owns via `isRooivalkThread`; anywhere else still needs a mention.
- On the first turn only, `buildPromptChannel` (in `helpers.ts`) prepends a `[Channel #<name> — description: "<topic>"]` line so the model knows where the conversation is happening. The channel topic is read from `channel.topic`; inside a thread it falls back to the parent channel's topic. The line is omitted entirely when neither a name nor a description is available (e.g. DMs), and skipped on follow-up turns — the provider already retains it server-side via `previous_response_id`, so re-sending it (channel descriptions can be up to 2000 chars) would only bloat the prompt.

### Context Integration

- Weather data from `YrService` for the daily MOTD prompt.
- Per-user preferences from `MemoryService` are passed to every chat turn.

### MOTD Image Generation

The daily MOTD uses a two-tier image fallback strategy:

1. **AI-generated image** (primary): Calls `ImageService.createImage()` with the prompt for the selected location
2. **Peapix** (fallback): Fetches Bing's image of the day via `PeapixService.getImage()`

The image prompt is built around a **deterministically chosen** `city / style / aspect` combination. `MemoryService.pickMotdSelection({ cities, styles, aspects })` picks all three in code, steering away from recently-used values (see [`src/services/memory/AGENTS.md`](../memory/AGENTS.md#motd-image-variety)). The pools are:

- `YR_COORDINATES` location names — the candidate cities
- `MOTD_IMAGE_STYLES` — art styles (watercolour, pixel art, retro travel poster, etc.)
- `MOTD_CITY_ASPECTS` — subject topics (landmarks, cuisine, wildlife, etc.)

The chosen combination then drives the prompt in two tiers:

1. **LLM-rendered** (primary): `ImageService.generateMotdImagePrompt(city, style, aspect)` asks the chat model to render _that exact_ combination into vivid prose. The model does **not** choose the style or subject — that's the whole point, and it's what stops the image defaulting to the same style (e.g. "retro travel poster") every day. The implementation lives in [`src/services/chat/motd-image-prompt.ts`](../chat/AGENTS.md#motd-image-prompt); the model's instructions are hot-reloaded from `config/motd-image-prompt.md` (`config.motdImagePrompt`), so the prompt can be tuned without a redeploy.
2. **Stored style/aspect** (fallback): when the model is unavailable or returns nothing, the same chosen `style`/`aspect`/`city` are dropped into a template string — `` `${style} depicting ${aspect} of ${city}. Vivid, detailed, atmospheric.` ``.

Because the selection is recorded inside `pickMotdSelection`, the day's combo is remembered even if image generation fails and the MOTD falls back to Peapix.

**The MOTD post deliberately does not write a `conversation_responses` row**, and adding one would be a regression, not a fix. Its chat turn is sealed before `createImage` runs, so that chain has never seen the picture — chaining replies onto it would let the model answer image questions with total confidence and zero pixels, which is exactly the [#93](https://github.com/fjlaubscher/rooivalk/issues/93) failure. It would also anchor every reply fork to a raw weather/events JSON prompt. Replies instead pick the MOTD up as message-scoped context: the real JPEG from `attachments`, and the generation prompt from the embed footer. The only version of this worth revisiting is generating the image _inside_ a chat turn via the `generate_image` tool, so it lands in the chain natively.

## Bot Behavior Logic

### Message Processing Rules

1. **Direct mentions**: Bot responds when mentioned anywhere (`@rooivalk message`)
2. **Replies to bot**: When users reply to bot messages, creates a thread automatically
3. **Thread conversations**: Bot responds to ALL messages in threads it created (no mentions needed)
4. **Other threads**: Bot ignores messages unless directly mentioned

## Architecture Notes

- Uses class-based TypeScript with private `_underscore` properties
- Integrates with DiscordService for Discord operations
- Integrates with `OpenAIService` for AI responses
- Integrates with YrService for weather data
- Coordinates overall bot behavior and decision-making

## Common Tasks

| Task                     | Action                                 | Notes                                            |
| ------------------------ | -------------------------------------- | ------------------------------------------------ |
| Enhance business logic   | Extend message/state handling          | Update core processing logic in index.ts         |
| Modify thread behavior   | Update thread detection/creation logic | Consider automatic response rules                |
| Add context integration  | Extend weather/event integration       | Coordinate with YrService and other data sources |
| Update message filtering | Modify when bot should respond         | Update mention/reply/thread logic                |

## Testing

- Unit tests in `index.test.ts`
- Use mock threads with `createMockMessage` for thread testing
- Use `test-utils/mock.ts` for common environment and config mocks
- Test message filtering and routing logic
- Validate context integration and response formatting

## Integration Points

- **DiscordService**: For Discord API operations and message handling
- **ChatService**: For AI-generated text responses and thread-name generation (MOTD, conversations)
- **ImageService**: For image generation (`createImage`) — used by MOTD and the `/image` slash command
- **YrService**: For weather data integration
- **PeapixService**: For Bing image of the day (MOTD last-resort fallback)
- **CronService**: For scheduled tasks and operations
- **Config system**: For hot-swappable configuration

## Helper Functions

- `isRooivalkThread` (in `helpers.ts`) - Determines if a Discord thread was created by the bot
- `isReplyToRooivalk` (in `helpers.ts`) - Checks if a message is a direct reply to the bot

## Dependencies

- All other services via dependency injection
- Shared types and constants
- Config system for dynamic behavior
- Environment configuration
