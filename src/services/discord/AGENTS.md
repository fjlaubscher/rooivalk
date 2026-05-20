# DiscordService Agent Guidelines

## Overview

`DiscordService` is a thin wrapper around discord.js. It handles client setup, event subscription, slash command registration, sending replies, and emoji/event lookups. It does **not** build conversation history — continuity is handled server-side via OpenAI's `previous_response_id` chain (see root [AGENTS.md](../../../AGENTS.md)).

## Key Responsibilities

- Discord client lifecycle (`login`, `on`, `once`).
- Mention regex setup.
- Slash command registration.
- `buildMessageReply` — turns an `OpenAIResponse` into the right discord.js message-send payload (text, file attachment for over-limit text, or image embed).
- `buildImageReply` — payload for the `/image` slash command.
- Guild emoji caching and scheduled-event lookup.
- `sendReadyMessage` on startup.

## Helpers (`helpers.ts`)

- `resolveConversationLookupRef(message)` — returns the `ConversationRef` to look up the previous response id for, or `null` for a standalone mention. Thread → `{type:'thread', refId: thread.id}`; reply → `{type:'msg', refId: parent.id}`.
- `resolveConversationStoreRefs(userMessage, botReply, createdThreadId)` — returns the refs to write the new response id under after a bot reply. Adds the thread ref on the turn a thread is born so chain continuity survives the transition.
- `formatEmojiEntry(name, tag)` — renders a `:name: → <:name:id>` line for the system prompt.

## Architecture Notes

- Class-based, private `_underscore` properties.
- All mutable client state lives on the service; consumers reach in via getters where needed.
- No history reconstruction. If you find yourself walking `message.reference.messageId` chains here, you're probably solving the wrong problem.

## Testing

- `index.test.ts` covers the lifecycle methods, reply building, and slash-command registration error paths.
- `helpers.test.ts` covers the ref resolvers and emoji formatter.
- Use `test-utils/createMockMessage.ts` for message mocks.

## Dependencies

- `discord.js` for the API client.
- `OpenAIResponse` type from `src/types.ts` for `buildMessageReply`.
