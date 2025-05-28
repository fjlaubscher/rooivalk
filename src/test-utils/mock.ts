import type { Env, InMemoryConfig } from '@/types';

export const MOCK_ENV: Env = {
  DISCORD_TOKEN: 'test-token',
  DISCORD_APP_ID: 'test-app-id',
  DISCORD_GUILD_ID: 'test-guild-id',
  DISCORD_STARTUP_CHANNEL_ID: 'test-startup-channel-id',
  DISCORD_LEARN_CHANNEL_ID: 'test-learn-channel-id',
  OPENAI_API_KEY: 'test-openai-key',
  OPENAI_MODEL: 'test-openai-model',
  OPENAI_IMAGE_MODEL: 'test-openai-image-model',
  ROOIVALK_MOTD_CRON: 'test-rooivalk-motd-cron',
};

export const MOCK_CONFIG: InMemoryConfig = {
  errorMessages: ['Error!'],
  greetingMessages: ['Hello!'],
  discordLimitMessages: ['Too long!'],
  instructionsRooivalk: 'Rooivalk instructions',
  instructionsLearn: 'Learn instructions',
  motd: 'Message of the day',
};
