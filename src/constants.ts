import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DiscordCommandParams, WeatherLocation } from '@/types';

export const ALLOWED_ATTACHMENT_CONTENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
];

export const DISCORD_MESSAGE_LIMIT = 2000;
export const DISCORD_MAX_MESSAGE_CHAIN_LENGTH = 10;
export const DISCORD_EMOJI = 'rooivalk';
export const DISCORD_COMMANDS = {
  LEARN: 'learn',
  IMAGE: 'image',
  THREAD: 'thread',
  WEATHER: 'weather',
};

// Config file names for hot-swappable markdown configs
export const CONFIG_FILE_ERRORS = 'errors.md';
export const CONFIG_FILE_GREETINGS = 'greetings.md';
export const CONFIG_FILE_DISCORD_LIMIT = 'discord_limit.md';
export const CONFIG_FILE_INSTRUCTIONS_ROOIVALK = 'instructions_rooivalk.md';
export const CONFIG_FILE_INSTRUCTIONS_LEARN = 'instructions_learn.md';
export const CONFIG_FILE_MOTD = 'motd.md';
export const CONFIG_FILE_QOTD = 'qotd.md';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Directory where config markdown files are located (relative to dist or src)
export const CONFIG_DIR = join(__dirname, '..', 'config');

// Yr related constants
export const YR_USER_AGENT = 'rooivalk github.com/fjlaubscher/rooivalk';

export const YR_COORDINATES: Record<string, WeatherLocation> = {
  CAPE_TOWN: {
    name: 'Cape Town, South Africa',
    latitude: -33.92584,
    longitude: 18.42322,
  },
  DUBAI: {
    name: 'Dubai, United Arab Emirates',
    latitude: 25.26472,
    longitude: 55.29241,
  },
  TAMARIN: {
    name: 'Tamarin, Mauritius',
    latitude: -20.32922,
    longitude: 57.37768,
  },
};

type DiscordCommand = (typeof DISCORD_COMMANDS)[keyof typeof DISCORD_COMMANDS];

export const DISCORD_COMMAND_DEFINITIONS: Record<
  DiscordCommand,
  DiscordCommandParams
> = {
  [DISCORD_COMMANDS.LEARN]: {
    description: 'Learn with @rooivalk!',
    parameters: [
      {
        name: 'prompt',
        description: 'Your question to @rooivalk',
        required: true,
      },
    ],
  },
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
  [DISCORD_COMMANDS.THREAD]: {
    description: 'Start a thread with @rooivalk!',
    parameters: [
      {
        name: 'prompt',
        description: 'Your prompt for the thread',
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
