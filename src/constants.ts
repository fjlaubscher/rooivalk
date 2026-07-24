import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DiscordCommandParams, WeatherLocation } from './types.ts';

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

export const IMAGE_ATTACHMENT_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];

export const ALLOWED_ATTACHMENT_EXTENSIONS = [
  ...IMAGE_ATTACHMENT_EXTENSIONS,
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.csv',
  '.tsv',
];

export const DISCORD_MESSAGE_LIMIT = 2000;

// OpenAI keeps stored responses for ~30 days. Anything older in our
// conversation_responses table is dead weight and can be pruned.
export const CONVERSATION_RESPONSE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const DISCORD_COMMANDS = {
  IMAGE: 'image',
  WEATHER: 'weather',
  SYNC_STEAM: 'sync-steam',
};

// Config file names for hot-swappable markdown configs
export const CONFIG_FILE_ERRORS = 'errors.md';
export const CONFIG_FILE_GREETINGS = 'greetings.md';
export const CONFIG_FILE_DISCORD_LIMIT = 'discord_limit.md';
export const CONFIG_FILE_INSTAGRAM = 'instagram.md';
export const CONFIG_FILE_PERMISSION_DENIED = 'permission_denied.md';
export const CONFIG_FILE_BOAST = 'boast.md';
export const CONFIG_FILE_INSTRUCTIONS = 'instructions.md';
export const CONFIG_FILE_PROFILES = 'profiles.json';
export const CONFIG_FILE_TOOL_ROLES = 'tool-roles.json';
export const CONFIG_FILE_MOTD = 'motd.md';
export const CONFIG_FILE_MOTD_IMAGE_PROMPT = 'motd-image-prompt.md';
export const CONFIG_FILE_GITHUB_ISSUE_TEMPLATE = 'github_issue_template.md';

// Each channel profile's instructions live in its own markdown file, addressed
// by profile name. Deployment-specific, separate from the default instructions.
export const getProfileInstructionsPath = (name: string): string =>
  `profiles/${name}.md`;
export const CONFIG_FILE_LEADERBOARD = 'leaderboard.md';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Directory where config markdown files are located (relative to dist or src)
export const CONFIG_DIR = join(__dirname, '..', 'config');

// Yr related constants
export const YR_USER_AGENT = 'rooivalk github.com/fjlaubscher/rooivalk';

// Steam related constants
export const STEAM_USER_AGENT = 'rooivalk github.com/fjlaubscher/rooivalk';
export const STEAM_CC = 'ZA';

// GitHub related constants
export const GITHUB_USER_AGENT = 'rooivalk github.com/fjlaubscher/rooivalk';
export const GITHUB_API_BASE = 'https://api.github.com';

// Allowlisted repos the create/search issue tools may operate on. Key is the
// short slug the model picks; value is the `owner/repo` GitHub identifier.
export const GITHUB_REPOS: Record<string, string> = {
  warren: 'fjlaubscher/warren',
  rooivalk: 'fjlaubscher/rooivalk',
  depot: 'fjlaubscher/depot',
};

export const YR_COORDINATES: Record<string, WeatherLocation> = {
  BONNIEVALE: {
    name: 'Bonnievale, South Africa',
    latitude: -33.9255,
    longitude: 20.0827,
  },
  LAKESIDE: {
    name: 'Lakeside, South Africa',
    latitude: -34.0867,
    longitude: 18.4558,
  },
  TABLEVIEW: {
    name: 'Table View, South Africa',
    latitude: -33.8218,
    longitude: 18.4915,
  },
  DUBAI: {
    name: 'Dubai, United Arab Emirates',
    latitude: 25.2048,
    longitude: 55.2708,
  },
  GDANSK: {
    name: 'Gdańsk, Poland',
    latitude: 54.352,
    longitude: 18.6466,
  },
  TAMARIN: {
    name: 'Tamarin, Mauritius',
    latitude: -20.3378,
    longitude: 57.3751,
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
  [DISCORD_COMMANDS.SYNC_STEAM]: {
    description: 'Manually trigger a Steam app list sync.',
    parameters: [],
  },
};

export const REQUIRED_ENV = [
  'DISCORD_STARTUP_CHANNEL_ID',
  'DISCORD_MOTD_CHANNEL_ID',
  'DISCORD_GUILD_ID',
  'DISCORD_APP_ID',
  'DISCORD_TOKEN',
  'OPENAI_API_KEY',
  'OPENAI_IMAGE_MODEL',
  'ROOIVALK_MOTD_CRON',
];
