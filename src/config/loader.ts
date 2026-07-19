import {
  CONFIG_FILE_ERRORS,
  CONFIG_FILE_GREETINGS,
  CONFIG_FILE_DISCORD_LIMIT,
  CONFIG_FILE_INSTAGRAM,
  CONFIG_FILE_PERMISSION_DENIED,
  CONFIG_FILE_BOAST,
  CONFIG_FILE_INSTRUCTIONS_OPENAI,
  CONFIG_FILE_INSTRUCTIONS_XAI,
  CONFIG_FILE_LEADERBOARD,
  CONFIG_FILE_MOTD,
  CONFIG_FILE_MOTD_IMAGE_PROMPT,
  CONFIG_FILE_GITHUB_ISSUE_TEMPLATE,
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
    permissionDeniedMessages,
    boastMessages,
    openaiInstructions,
    xaiInstructions,
    profiles,
    toolRoles,
    motd,
    motdImagePrompt,
    githubIssueTemplate,
  ] = await Promise.all([
    loadMessageList(CONFIG_FILE_ERRORS),
    loadMessageList(CONFIG_FILE_GREETINGS),
    loadMessageList(CONFIG_FILE_DISCORD_LIMIT),
    loadMessageList(CONFIG_FILE_LEADERBOARD),
    loadMessageList(CONFIG_FILE_INSTAGRAM),
    loadMessageList(CONFIG_FILE_PERMISSION_DENIED),
    loadMessageList(CONFIG_FILE_BOAST),
    loadInstructions(CONFIG_FILE_INSTRUCTIONS_OPENAI),
    loadInstructions(CONFIG_FILE_INSTRUCTIONS_XAI),
    loadProfiles(),
    loadToolRoles(),
    loadInstructions(CONFIG_FILE_MOTD),
    loadInstructions(CONFIG_FILE_MOTD_IMAGE_PROMPT),
    loadInstructions(CONFIG_FILE_GITHUB_ISSUE_TEMPLATE),
  ]);

  const profileInstructions = await loadProfileInstructions(profiles);

  const config: InMemoryConfig = {
    errorMessages,
    greetingMessages,
    discordLimitMessages,
    leaderboardEmptyMessages,
    instagramMessages,
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
    githubIssueTemplate,
  };

  return config;
};
