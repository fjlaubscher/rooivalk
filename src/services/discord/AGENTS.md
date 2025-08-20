# DiscordService Agent Guidelines

## Overview

The DiscordService handles Discord API integration, event listening, message routing, and reply handling. It manages the bot's interaction with Discord servers and channels.

## Key Responsibilities

- Discord API integration and event handling
- Message routing and processing
- Thread creation and management
- Conversation history building
- Reply handling and message formatting

## Core Methods

### Message Chain Building

- `buildMessageChainFromMessage` - Returns formatted conversation history from reply chains
- `buildMessageChainFromThreadMessage` - Returns formatted conversation history from Discord threads, including initial context that led to thread creation

### Thread Management

- Creates threads when users reply to bot messages
- Handles thread ownership verification
- Manages thread context storage via `setThreadInitialContext()` and `getThreadInitialContext()`
- Preserves full conversational continuity between regular messages and thread messages

## Architecture Notes

- Uses class-based TypeScript with private `_underscore` properties
- Implements Discord.js client event handlers
- Integrates with other services via dependency injection
- Handles both direct messages and thread conversations

## Common Tasks

| Task                        | Action                                  | Notes                                                           |
| --------------------------- | --------------------------------------- | --------------------------------------------------------------- |
| Add Discord command         | Extend message/interaction handlers     | Update event listeners in index.ts                              |
| Update message history      | Modify `buildMessageChainFrom*` methods | Use `setThreadInitialContext()` for thread context preservation |
| Add thread-related features | Update thread creation/management logic | Consider thread ownership and auto-archiving                    |
| Handle new Discord events   | Add event listeners                     | Follow existing pattern for event handling                      |

## Testing

- Unit tests in `index.test.ts`
- Use `test-utils/createMockMessage.ts` for Discord message mocking
- Use `test-utils/mock.ts` for common environment and config mocks
- Mock Discord.js Client and related objects as needed

## Helper Functions

- `formatMessageInChain` (in `helpers.ts`) - Formats messages with attachments for conversation chains

## Dependencies

- Discord.js library for Discord API
- Integration with RooivalkService for business logic
- Access to shared types and constants
