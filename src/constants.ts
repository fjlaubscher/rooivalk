import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DiscordCommandParams, WeatherLocation } from '@/types';

export const ALLOWED_ATTACHMENT_CONTENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'application/json',
  'text/json',
  'text/csv',
  'application/csv',
  'text/tab-separated-values',
];

export const ALLOWED_ATTACHMENT_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.csv',
  '.tsv',
];

export const DISCORD_MESSAGE_LIMIT = 2000;
export const DISCORD_EMOJI = 'rooivalk';
export const DISCORD_COMMANDS = {
  IMAGE: 'image',
  WEATHER: 'weather',
};

// Config file names for hot-swappable markdown configs
export const CONFIG_FILE_ERRORS = 'errors.md';
export const CONFIG_FILE_GREETINGS = 'greetings.md';
export const CONFIG_FILE_DISCORD_LIMIT = 'discord_limit.md';
export const CONFIG_FILE_INSTRUCTIONS = 'instructions.md';
export const CONFIG_FILE_MOTD = 'motd.md';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Directory where config markdown files are located (relative to dist or src)
export const CONFIG_DIR = join(__dirname, '..', 'config');

// Yr related constants
export const YR_USER_AGENT = 'rooivalk github.com/fjlaubscher/rooivalk';

export const YR_COORDINATES: Record<string, WeatherLocation> = {
  BONNIEVALE: {
    name: 'Bonnievale, South Africa',
    latitude: -33.9159,
    longitude: 20.0807,
  },
  LAKESIDE: {
    name: 'Lakeside, South Africa',
    latitude: -34.0849,
    longitude: 18.4561,
  },
  TABLEVIEW: {
    name: 'Table View, South Africa',
    latitude: -33.8236,
    longitude: 18.4903,
  },
  DUBAI: {
    name: 'Dubai, United Arab Emirates',
    latitude: 25.2647,
    longitude: 55.2924,
  },
  TAMARIN: {
    name: 'Tamarin, Mauritius',
    latitude: -20.3292,
    longitude: 57.3777,
  },
};

type DiscordCommand = (typeof DISCORD_COMMANDS)[keyof typeof DISCORD_COMMANDS];

export const DISCORD_COMMAND_DEFINITIONS: Record<
  DiscordCommand,
  DiscordCommandParams
> = {
  [DISCORD_COMMANDS.IMAGE]: {
    description: 'Generate an image with @rooivalk!',
    parameters: [
      {
        name: 'prompt',
        description: 'Your prompt for the image',
        required: true,
      },
    ],
  },
  [DISCORD_COMMANDS.WEATHER]: {
    description: 'Get the weather with @rooivalk!',
    parameters: [
      {
        name: 'city',
        description: 'The city to get the weather for',
        required: true,
        choices: Object.keys(YR_COORDINATES).map((key) => ({
          name: YR_COORDINATES[key].name,
          value: key,
        })),
      },
    ],
  },
};

export const REQUIRED_ENV = [
  'DISCORD_STARTUP_CHANNEL_ID',
  'DISCORD_MOTD_CHANNEL_ID',
  'DISCORD_GUILD_ID',
  'DISCORD_APP_ID',
  'DISCORD_TOKEN',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'OPENAI_IMAGE_MODEL',
  'ROOIVALK_MOTD_CRON',
];
