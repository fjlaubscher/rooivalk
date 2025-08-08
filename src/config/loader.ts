import { readFile } from 'fs/promises';
import { join } from 'path';

import {
  CONFIG_DIR,
  CONFIG_FILE_ERRORS,
  CONFIG_FILE_GREETINGS,
  CONFIG_FILE_DISCORD_LIMIT,
  CONFIG_FILE_INSTRUCTIONS_ROOIVALK,
  CONFIG_FILE_INSTRUCTIONS_LEARN,
  CONFIG_FILE_MOTD,
  CONFIG_FILE_QOTD,
} from '@/constants';
import type { InMemoryConfig } from '@/types';

export const getConfigFilePath = (filename: string): string =>
  join(CONFIG_DIR, filename);

/**
 * Loads a list of messages from a markdown file.
 * Expects each message to be on its own line, prefixed with '- '.
 */
export const loadMessageList = async (filename: string): Promise<string[]> => {
  const filePath = getConfigFilePath(filename);
  try {
    const content = await readFile(filePath, 'utf8');
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- '))
      .map((line) => line.slice(2).trim())
      .filter(Boolean);
  } catch (err) {
    throw new Error(
      `[config/loader] Failed to load message list from ${filename}: ${(err as Error).message}`
    );
  }
};

/**
 * Loads instructions from a markdown file.
 * Returns the content as a single string, removing the first heading if present.
 */
export const loadInstructions = async (filename: string): Promise<string> => {
  const filePath = getConfigFilePath(filename);
  try {
    const content = await readFile(filePath, 'utf8');
    // Remove the first heading (e.g., "# Instructions") if present
    return content.replace(/^#.*\n/, '').trim();
  } catch (err) {
    throw new Error(
      `[config/loader] Failed to load instructions from ${filename}: ${(err as Error).message}`
    );
  }
};

export const loadConfig = async (): Promise<InMemoryConfig> => {
  const [
    errorMessages,
    greetingMessages,
    discordLimitMessages,
    instructionsRooivalk,
    instructionsLearn,
    motd,
    qotd,
  ] = await Promise.all([
    loadMessageList(CONFIG_FILE_ERRORS),
    loadMessageList(CONFIG_FILE_GREETINGS),
    loadMessageList(CONFIG_FILE_DISCORD_LIMIT),
    loadInstructions(CONFIG_FILE_INSTRUCTIONS_ROOIVALK),
    loadInstructions(CONFIG_FILE_INSTRUCTIONS_LEARN),
    loadInstructions(CONFIG_FILE_MOTD),
    loadInstructions(CONFIG_FILE_QOTD),
  ]);

  const config: InMemoryConfig = {
    errorMessages,
    greetingMessages,
    discordLimitMessages,
    instructionsRooivalk,
    instructionsLearn,
    motd,
    qotd,
  };

  return config;
};
