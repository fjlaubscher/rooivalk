import type OpenAI from 'openai';

import { GITHUB_REPOS, YR_COORDINATES } from '../../constants.ts';
import { TOOL_NAMES } from '../chat/tool-names.ts';

export const QUERY_SQLITE_SCHEMA = {
  tables: [
    {
      name: 'conversation_responses',
      columns: ['type', 'ref_id', 'response_id', 'updated_at'],
      notes: "type is 'msg' or 'thread'; updated_at is unix epoch ms.",
    },
    {
      name: 'emoji_reactions',
      columns: [
        'id',
        'guild_id',
        'message_id',
        'channel_id',
        'message_author_id',
        'reactor_id',
        'emoji_id',
        'emoji_name',
        'emoji_animated',
        'created_at',
      ],
      notes: 'created_at is unix epoch ms. emoji_id is null for unicode emoji.',
    },
    {
      name: 'steam_apps',
      columns: [
        'appid',
        'name',
        'search_name',
        'last_modified',
        'price_change_number',
      ],
      notes: 'search_name is lowercased for matching.',
    },
    {
      name: 'steam_meta',
      columns: ['key', 'value'],
    },
  ],
  excluded: ['memories'],
  notes:
    "The 'memories' table is excluded — use the recall/remember/forget_memory tools instead.",
} as const;

export const FUNCTION_TOOLS: OpenAI.Responses.Tool[] = [
  {
    type: 'function',
    name: TOOL_NAMES.GET_WEATHER,
    description:
      'Get the current weather forecast for a specific city. Available cities are limited to a predefined set.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          enum: Object.keys(YR_COORDINATES),
          description: 'The city to get the weather for',
        },
      },
      required: ['city'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: TOOL_NAMES.CREATE_THREAD,
    description:
      'Create a new Discord thread on the current message. Only use when explicitly asked to create a thread.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: ['string', 'null'],
          description:
            'Optional thread name (max 100 chars). If null, one will be auto-generated.',
        },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: TOOL_NAMES.REMEMBER,
    description:
      'Store a memory about the user who is currently talking to you. Use sparingly — only for durably useful facts (preferences, context, things they explicitly asked you to remember). Do NOT store conversational fluff.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The fact or note to remember. One short sentence.',
        },
        kind: {
          type: ['string', 'null'],
          description:
            '`memory` (default, or null) for facts, events, one-off context fetched via `recall`. `preference` for stable traits that shape every reply (name, tone, hard nos). Use `preference` sparingly — injected on every turn. Cap: 5.',
        },
      },
      required: ['content', 'kind'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: TOOL_NAMES.RECALL,
    description:
      "Look up recent memories about the user currently talking to you. Always scoped to the speaker — you cannot recall another user's memories. Returns up to `limit` rows ordered most recent first. Only returns `memory` kind — preferences are already in context.",
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: ['number', 'null'],
          description: 'Max rows to return (1-100). Null = default of 10.',
        },
      },
      required: ['limit'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: TOOL_NAMES.FORGET_MEMORY,
    description:
      'Delete a specific memory by id. Works for both `memory` and `preference` kind. Only the user the memory is about can delete it. Use when the speaker explicitly asks you to forget something — call `recall` first to find the id for memories; preferences are visible in context.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        memory_id: {
          type: 'number',
          description: 'The id of the memory row to delete.',
        },
      },
      required: ['memory_id'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: TOOL_NAMES.GET_GUILD_EVENTS,
    description:
      'Get scheduled Discord server events, optionally filtered by date range.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        start_date: {
          type: ['string', 'null'],
          description:
            'Start date in ISO 8601 format (YYYY-MM-DD). Defaults to today if null.',
        },
        end_date: {
          type: ['string', 'null'],
          description:
            'End date in ISO 8601 format (YYYY-MM-DD). Defaults to 7 days from start if null.',
        },
      },
      required: ['start_date', 'end_date'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: TOOL_NAMES.RUN_BASH,
    description:
      'Run a read-only shell command on the server. Use to inspect source files, grep the codebase, or read PM2 logs when diagnosing issues. Sandboxed to the project directory — relative paths only for file commands.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description:
            'The command to run. Allowed prefixes: ls, cat, grep, find, head, tail, wc (relative paths only), pm2 logs rooivalk, pm2 status, pm2 show rooivalk.',
        },
      },
      required: ['command'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: TOOL_NAMES.GET_EMOJIS,
    description:
      'List all custom emojis available in this Discord server. Call this before using a custom emoji to get the correct <:name:id> tokens.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: TOOL_NAMES.GENERATE_IMAGE,
    description:
      "Generate an image inline as part of your reply. Use when the user explicitly asks for an image, drawing, picture, meme, or visual. Pass a self-contained prompt describing the image — the image model does not see the surrounding conversation. The generated image is attached to your Discord reply automatically; you don't need to embed a URL. Your text reply can be short or empty when the image is the whole answer.",
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'A self-contained description of the image to generate. Be specific about subject, style, and composition.',
        },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: TOOL_NAMES.DESCRIBE_SCHEMA,
    description:
      "Return the tables and columns available to query_sqlite. Call this first when you don't already know the layout; the result stays in conversation context so you only need it once per thread.",
    strict: true,
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: TOOL_NAMES.QUERY_SQLITE,
    description:
      "Run a SELECT against the bot's SQLite. Call describe_schema first if you don't know the layout. SELECT or WITH only, single statement. The 'memories' table is off-limits — use recall/remember/forget_memory instead. Use ? placeholders and pass values in 'params'. Default 100 rows, max 500.",
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        sql: {
          type: 'string',
          description:
            'A single SQL statement. SELECT only — writes will fail.',
        },
        params: {
          type: ['array', 'null'],
          description:
            'Positional bind values for ? placeholders in sql. Null = no params. Each item must be a string, number, or null.',
          items: {
            type: ['string', 'number', 'null'],
          },
        },
      },
      required: ['sql', 'params'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: TOOL_NAMES.GET_GAME_LISTING,
    description:
      "Look up a game on a digital store and return its full listing: price, description, genres, release date, and platform availability. Use when the user asks about a game's price, store page, or availability.",
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'The game name to search for. Be as specific as possible to avoid wrong matches.',
        },
        store: {
          type: 'string',
          enum: ['steam'],
          description: 'The store to query.',
        },
      },
      required: ['query', 'store'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: TOOL_NAMES.CREATE_GITHUB_ISSUE,
    description:
      'File a new GitHub issue on one of a predefined set of repos. Only use when the user explicitly asks to file, open, or report an issue/bug. Only the listed repos are available. Call get_github_issue_template first and structure the body with it.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        repo: {
          type: 'string',
          enum: Object.keys(GITHUB_REPOS),
          description: 'The repo to file the issue on.',
        },
        title: {
          type: 'string',
          description: 'A short, descriptive issue title.',
        },
        body: {
          type: ['string', 'null'],
          description: 'The issue body/description. Null for no body.',
        },
      },
      required: ['repo', 'title', 'body'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: TOOL_NAMES.GET_GITHUB_ISSUE_TEMPLATE,
    description:
      'Get the markdown template a GitHub issue body must follow. Call this before create_github_issue and structure the body with the returned template.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: TOOL_NAMES.SEARCH_GITHUB_ISSUES,
    description:
      'Search or list GitHub issues on one of a predefined set of repos. Use to check whether a bug/issue exists or has already been fixed.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        repo: {
          type: 'string',
          enum: Object.keys(GITHUB_REPOS),
          description: 'The repo to search issues on.',
        },
        query: {
          type: ['string', 'null'],
          description:
            'Free-text search terms. Null to list without filtering.',
        },
        state: {
          type: 'string',
          enum: ['open', 'closed', 'all'],
          description: 'Filter issues by state.',
        },
      },
      required: ['repo', 'query', 'state'],
      additionalProperties: false,
    },
  },
];
