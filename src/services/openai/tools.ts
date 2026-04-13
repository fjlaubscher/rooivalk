import type OpenAI from 'openai';

import { YR_COORDINATES } from '../../constants.ts';

export const TOOL_NAMES = Object.freeze({
  GET_WEATHER: 'get_weather',
  GET_ALL_WEATHER: 'get_all_weather',
  CREATE_THREAD: 'create_thread',
  GET_GUILD_EVENTS: 'get_guild_events',
});

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
    name: TOOL_NAMES.GET_ALL_WEATHER,
    description: 'Get weather forecasts for all available cities at once.',
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
];
