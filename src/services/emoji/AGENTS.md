# EmojiService Agent Guidelines

## Overview

EmojiService records Discord reaction events and provides the three aggregation queries that power the weekly emoji leaderboard posted to the MOTD channel every Wednesday.

## Key Responsibilities

- Inserting one row per `MessageReactionAdd` event that passes all filter rules
- `getTopMessages` — individual messages that received the most reactions in a time window, with the author and channel/message IDs needed to build a jump link
- `getTopGivers` — users who handed out the most reactions in a time window, each with their single most-used (favourite) emoji
- `getTopEmojis` — the most-used emojis server-wide in a time window, by total reaction count

## Architecture Notes

- Uses `DatabaseSync` from `node:sqlite` (Node.js built-in) — same pattern as `MemoryService` and `SteamService`
- Opens separate write and readOnly connections to the shared `ROOIVALK_DB_PATH` database
- Types live in `src/services/emoji/types.ts`; import from there explicitly, not re-exported through `index.ts`
- The raw event log approach (one row per reaction) keeps reporting flexible; no pre-aggregation

## Filtering rules (enforced in `Rooivalk.processMessageReaction`)

Reactions are **not** recorded if:

- The message guild does not match `DISCORD_GUILD_ID`
- The reactor is a bot
- The message author is a bot
- The reactor and message author are the same user (self-reaction)
- Partial fetch throws (reaction or user data unresolvable)

Removing a reaction does **not** decrement — only `MessageReactionAdd` is handled.

## Common Tasks

| Task                        | File(s)                                                           | Notes                                                       |
| --------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------- |
| Change leaderboard window   | `src/services/rooivalk/index.ts` (`sendLeaderboardToMotdChannel`) | Adjust `7 * 24 * 60 * 60 * 1000`                            |
| Change top-N limit          | `src/services/rooivalk/index.ts`                                  | `LEADERBOARD_LIMIT` constant                                |
| Add a new aggregation query | `src/services/emoji/index.ts`                                     | Follow existing prepared-statement pattern                  |
| Change leaderboard schedule | `src/index.ts` + `.env.example`                                   | `ROOIVALK_LEADERBOARD_CRON`, default `5 8 * * 3`            |
| Update empty-state messages | `config/leaderboard.md`                                           | One `- message` per line; hot-reloaded via `InMemoryConfig` |
