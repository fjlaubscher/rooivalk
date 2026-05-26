import type { Message, ThreadChannel } from 'discord.js';

import { runBash } from '../bash/index.ts';
import { TOOL_NAMES } from '../chat/tool-names.ts';
import type { ImageService } from '../chat/index.ts';
import { QUERY_SQLITE_SCHEMA } from '../openai/tools.ts';
import { validateQuerySql } from './query-sqlite-guard.ts';
import type DiscordService from '../discord/index.ts';
import type MemoryService from '../memory/index.ts';
import type { MemoryKind } from '../memory/index.ts';
import type SteamService from '../steam/index.ts';
import type YrService from '../yr/index.ts';
import type { ToolExecutionResult, ToolExecutor } from '../../types.ts';

export type ToolExecutorContext = {
  message: Message<boolean>;
  yr: YrService;
  discord: DiscordService;
  memory: MemoryService;
  steam: SteamService;
  image: ImageService;
  createThread: (
    message: Message<boolean>,
    name?: string,
  ) => Promise<ThreadChannel | null>;
};

function errorOutput(err: unknown): ToolExecutionResult {
  const errorMessage = err instanceof Error ? err.message : 'Unknown error';
  return { output: JSON.stringify({ error: errorMessage }) };
}

export function buildToolExecutor(ctx: ToolExecutorContext): ToolExecutor {
  const { message, yr, discord, memory, steam, image, createThread } = ctx;

  return async (name, args) => {
    switch (name) {
      case TOOL_NAMES.GET_WEATHER: {
        const city = args.city as string;
        const forecast = await yr.getForecastByLocation(city);
        return { output: JSON.stringify(forecast) };
      }
      case TOOL_NAMES.CREATE_THREAD: {
        if (message.channel.isThread()) {
          return {
            output: JSON.stringify({
              error: 'Cannot create a thread inside an existing thread',
            }),
          };
        }

        try {
          const threadName = (args.name as string | null) ?? undefined;
          const thread = await createThread(message, threadName);
          if (thread) {
            return {
              output: JSON.stringify({
                threadId: thread.id,
                name: thread.name,
              }),
              createdThread: thread,
            };
          }
          return {
            output: JSON.stringify({ error: 'Failed to create thread' }),
          };
        } catch (err) {
          return errorOutput(err);
        }
      }
      case TOOL_NAMES.REMEMBER: {
        try {
          const content = args.content as string;
          const kind: MemoryKind =
            args.kind === 'preference' ? 'preference' : 'memory';
          const { id } = memory.remember(message.author.id, content, kind);
          return {
            output: JSON.stringify({ status: 'ok', memory_id: id }),
          };
        } catch (err) {
          return errorOutput(err);
        }
      }
      case TOOL_NAMES.RECALL: {
        try {
          const limit = typeof args.limit === 'number' ? args.limit : undefined;
          const rows = memory.recall(message.author.id, limit);
          return { output: JSON.stringify({ memories: rows }) };
        } catch (err) {
          return errorOutput(err);
        }
      }
      case TOOL_NAMES.FORGET_MEMORY: {
        try {
          const memoryId = Number(args.memory_id);
          const result = memory.forgetMemory(memoryId, message.author.id);
          return { output: JSON.stringify(result) };
        } catch (err) {
          return errorOutput(err);
        }
      }
      case TOOL_NAMES.GET_GUILD_EVENTS: {
        const startDate = args.start_date
          ? new Date(args.start_date as string)
          : new Date();
        startDate.setHours(0, 0, 0, 0);

        const endDate = args.end_date
          ? new Date(args.end_date as string)
          : new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
        endDate.setHours(23, 59, 59, 999);

        const events = await discord.getGuildEventsBetween(startDate, endDate);
        return { output: JSON.stringify(events) };
      }
      case TOOL_NAMES.RUN_BASH: {
        const result = await runBash(args.command as string);
        if (!result.ok) {
          return { output: JSON.stringify({ error: result.error }) };
        }
        return { output: result.output };
      }
      case TOOL_NAMES.GET_GAME_LISTING: {
        const store = args.store as string;
        if (store !== 'steam') {
          return {
            output: JSON.stringify({
              error: `Store not yet supported: ${store}`,
            }),
          };
        }

        try {
          const query = args.query as string;
          const match = steam.findGame(query);
          if (!match) {
            return {
              output: JSON.stringify({
                error:
                  'Game not found — try a more specific name, or the app list may still be syncing.',
              }),
            };
          }

          const details = await steam.getGameDetails(match.appid);
          if (!details) {
            return {
              output: JSON.stringify({
                error: 'Could not retrieve game details from Steam.',
              }),
            };
          }

          return { output: JSON.stringify(details) };
        } catch (err) {
          return errorOutput(err);
        }
      }
      case TOOL_NAMES.GENERATE_IMAGE: {
        try {
          const prompt = args.prompt as string;
          const base64Image = await image.createImage(prompt);
          if (!base64Image) {
            return {
              output: JSON.stringify({
                error: 'Image generation returned no data',
              }),
            };
          }
          return {
            output: JSON.stringify({ status: 'ok' }),
            base64Image,
          };
        } catch (err) {
          return errorOutput(err);
        }
      }
      case TOOL_NAMES.DESCRIBE_SCHEMA: {
        return { output: JSON.stringify(QUERY_SQLITE_SCHEMA) };
      }
      case TOOL_NAMES.QUERY_SQLITE: {
        const validation = validateQuerySql(args.sql);
        if (!validation.ok) {
          return { output: JSON.stringify({ error: validation.error }) };
        }
        try {
          const rawParams = args.params as unknown;
          const params = Array.isArray(rawParams)
            ? (rawParams.filter(
                (p) =>
                  p === null || typeof p === 'string' || typeof p === 'number',
              ) as Array<string | number | null>)
            : [];
          const result = memory.query(validation.sql, params);
          return { output: JSON.stringify(result) };
        } catch (err) {
          return errorOutput(err);
        }
      }
      case TOOL_NAMES.GET_EMOJIS: {
        const emojis = discord.allowedEmojis;
        return {
          output:
            emojis.length > 0
              ? emojis.join('\n')
              : JSON.stringify({ note: 'No custom emojis available.' }),
        };
      }
      default:
        return {
          output: JSON.stringify({ error: `Unknown tool: ${name}` }),
        };
    }
  };
}
