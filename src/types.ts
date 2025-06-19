export type Env = {
  DISCORD_STARTUP_CHANNEL_ID: string;
  DISCORD_MOTD_CHANNEL_ID: string;
  DISCORD_LEARN_CHANNEL_ID: string;
  DISCORD_GUILD_ID: string;
  DISCORD_APP_ID: string;
  DISCORD_TOKEN: string;
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;
  OPENAI_IMAGE_MODEL: string;
  ROOIVALK_MOTD_CRON: string;
};

export type InMemoryConfig = {
  errorMessages: string[];
  greetingMessages: string[];
  discordLimitMessages: string[];
  instructionsRooivalk: string;
  instructionsLearn: string;
  motd: string;
};

export type Persona = 'rooivalk' | 'learn';
export type ResponseType = 'error' | 'greeting' | 'discordLimit';
