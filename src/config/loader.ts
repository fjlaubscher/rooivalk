import {
  CONFIG_FILE_ERRORS,
  CONFIG_FILE_GREETINGS,
  CONFIG_FILE_DISCORD_LIMIT,
  CONFIG_FILE_INSTAGRAM,
  CONFIG_FILE_REDDIT,
  CONFIG_FILE_TWITTER,
  CONFIG_FILE_PERMISSION_DENIED,
  CONFIG_FILE_BOAST,
  CONFIG_FILE_INSTRUCTIONS_OPENAI,
  CONFIG_FILE_INSTRUCTIONS_XAI,
  CONFIG_FILE_LEADERBOARD,
  CONFIG_FILE_MOTD,
  CONFIG_FILE_MOTD_IMAGE_PROMPT,
} from '../constants.ts';
import type { InMemoryConfig } from '../types.ts';
import { loadInstructions, loadMessageList } from './messages.ts';
import { loadProfileInstructions, loadProfiles } from './profiles.ts';
import { loadToolRoles } from './tool-roles.ts';

export const loadConfig = async (): Promise<InMemoryConfig> => {
  const [
    errorMessages,
    greetingMessages,
    discordLimitMessages,
    leaderboardEmptyMessages,
    instagramMessages,
    redditMessages,
    twitterMessages,
    permissionDeniedMessages,
    boastMessages,
    openaiInstructions,
    xaiInstructions,
    profiles,
    toolRoles,
    motd,
    motdImagePrompt,
  ] = await Promise.all([
    loadMessageList(CONFIG_FILE_ERRORS),
    loadMessageList(CONFIG_FILE_GREETINGS),
    loadMessageList(CONFIG_FILE_DISCORD_LIMIT),
    loadMessageList(CONFIG_FILE_LEADERBOARD),
    loadMessageList(CONFIG_FILE_INSTAGRAM),
    loadMessageList(CONFIG_FILE_REDDIT),
    loadMessageList(CONFIG_FILE_TWITTER),
    loadMessageList(CONFIG_FILE_PERMISSION_DENIED),
    loadMessageList(CONFIG_FILE_BOAST),
    loadInstructions(CONFIG_FILE_INSTRUCTIONS_OPENAI),
    loadInstructions(CONFIG_FILE_INSTRUCTIONS_XAI),
    loadProfiles(),
    loadToolRoles(),
    loadInstructions(CONFIG_FILE_MOTD),
    loadInstructions(CONFIG_FILE_MOTD_IMAGE_PROMPT),
  ]);

  const profileInstructions = await loadProfileInstructions(profiles);

  const config: InMemoryConfig = {
    errorMessages,
    greetingMessages,
    discordLimitMessages,
    leaderboardEmptyMessages,
    instagramMessages,
    redditMessages,
    twitterMessages,
    permissionDeniedMessages,
    boastMessages,
    instructions: {
      openai: openaiInstructions,
      xai: xaiInstructions,
    },
    profiles,
    profileInstructions,
    toolRoles,
    motd,
    motdImagePrompt,
  };

  return config;
};
