export const DISCORD_MESSAGE_LIMIT = 2000;
export const DISCORD_MAX_MESSAGE_CHAIN_LENGTH = 10;
export const DISCORD_EMOJI = 'rooivalk';
export const DISCORD_COMMANDS = {
  LEARN: 'learn',
  IMAGE: 'image',
};

// Config file names for hot-swappable markdown configs
export const CONFIG_FILE_ERRORS = 'errors.md';
export const CONFIG_FILE_GREETINGS = 'greetings.md';
export const CONFIG_FILE_DISCORD_LIMIT = 'discord_limit.md';
export const CONFIG_FILE_INSTRUCTIONS_ROOIVALK = 'instructions_rooivalk.md';
export const CONFIG_FILE_INSTRUCTIONS_LEARN = 'instructions_learn.md';
export const CONFIG_FILE_MOTD = 'motd.md';

type DiscordCommand = (typeof DISCORD_COMMANDS)[keyof typeof DISCORD_COMMANDS];

export const DISCORD_COMMAND_DEFINITIONS: Record<
  DiscordCommand,
  {
    description: string;
    parameters: { name: string; description: string; required: boolean }[];
  }
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
};

export const REQUIRED_ENV = [
  'DISCORD_STARTUP_CHANNEL_ID',
  'DISCORD_LEARN_CHANNEL_ID',
  'DISCORD_GUILD_ID',
  'DISCORD_APP_ID',
  'DISCORD_TOKEN',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'OPENAI_IMAGE_MODEL',
  'ROOIVALK_MOTD_CRON',
];
