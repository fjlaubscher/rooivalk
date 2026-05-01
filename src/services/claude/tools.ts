import type Anthropic from '@anthropic-ai/sdk';

import { YR_COORDINATES } from '../../constants.ts';
import { TOOL_NAMES } from '../chat/tool-names.ts';

export { TOOL_NAMES };

export const FUNCTION_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: TOOL_NAMES.GET_WEATHER,
    description:
      'Get the current weather forecast for a specific city. Available cities are limited to a predefined set.',
    input_schema: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          enum: Object.keys(YR_COORDINATES),
          description: 'The city to get the weather for',
        },
      },
      required: ['city'],
    },
  },
  {
    name: TOOL_NAMES.GET_ALL_WEATHER,
    description: 'Get weather forecasts for all available cities at once.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: TOOL_NAMES.CREATE_THREAD,
    description:
      'Create a new Discord thread on the current message. Only use when explicitly asked to create a thread.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description:
            'Optional thread name (max 100 chars). Omit to auto-generate one.',
        },
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.GET_GUILD_EVENTS,
    description:
      'Get scheduled Discord server events, optionally filtered by date range.',
    input_schema: {
      type: 'object',
      properties: {
        start_date: {
          type: 'string',
          description:
            'Start date in ISO 8601 format (YYYY-MM-DD). Defaults to today if omitted.',
        },
        end_date: {
          type: 'string',
          description:
            'End date in ISO 8601 format (YYYY-MM-DD). Defaults to 7 days from start if omitted.',
        },
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.GENERATE_IMAGE,
    description:
      'Generate an image from a text prompt. Use when the user explicitly asks you to create, draw, or generate an image.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'A detailed description of the image to generate. Refine the user prompt if it is vague.',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: TOOL_NAMES.SEND_SMS,
    description:
      'Send an SMS via Clickatell. Use only when the user explicitly asks you to send an SMS or text message. Confirm the recipient number and message content before calling.',
    input_schema: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description:
            'Recipient phone number in international format, digits only (e.g. "27821234567"). No leading +, spaces, or dashes.',
        },
        content: {
          type: 'string',
          description: 'The SMS message body. Keep it concise.',
        },
      },
      required: ['to', 'content'],
    },
  },
];
