import { readFile } from 'fs/promises';
import { join } from 'path';

import {
  CONFIG_DIR,
  CONFIG_FILE_ERRORS,
  CONFIG_FILE_GREETINGS,
  CONFIG_FILE_DISCORD_LIMIT,
  CONFIG_FILE_INSTRUCTIONS,
  CONFIG_FILE_MOTD,
  CONFIG_FILE_QOTD,
} from '@/constants';
import type { InMemoryConfig } from '@/types';

export const getConfigFilePath = (filename: string): string =>
  join(CONFIG_DIR, filename);

/**
 * Reads the version from package.json
 */
const getPackageVersion = async (): Promise<string> => {
  const packagePath = join(CONFIG_DIR, '..', 'package.json');
  try {
    const content = await readFile(packagePath, 'utf8');
    const packageJson = JSON.parse(content);
    return packageJson.version;
  } catch (err) {
    throw new Error(
      `[config/loader] Failed to read package version: ${(err as Error).message}`,
    );
  }
};

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
      `[config/loader] Failed to load message list from ${filename}: ${(err as Error).message}`,
    );
  }
};

/**
 * Loads instructions from a markdown file.
 * Returns the content as a single string, removing the first heading if present.
 * Replaces {{VERSION}} template with the version from package.json.
 */
export const loadInstructions = async (filename: string): Promise<string> => {
  const filePath = getConfigFilePath(filename);
  try {
    const [content, version] = await Promise.all([
      readFile(filePath, 'utf8'),
      getPackageVersion(),
    ]);

    let processed = content
      // Remove the first heading (e.g., "# Instructions") if present
      .replace(/^#.*\n/, '')
      // Replace version template
      .replace(/{{VERSION}}/g, `v${version}`)
      .trim();

    return processed;
  } catch (err) {
    throw new Error(
      `[config/loader] Failed to load instructions from ${filename}: ${(err as Error).message}`,
    );
  }
};

export const loadConfig = async (): Promise<InMemoryConfig> => {
  const [
    errorMessages,
    greetingMessages,
    discordLimitMessages,
    instructions,
    motd,
    qotd,
  ] = await Promise.all([
    loadMessageList(CONFIG_FILE_ERRORS),
    loadMessageList(CONFIG_FILE_GREETINGS),
    loadMessageList(CONFIG_FILE_DISCORD_LIMIT),
    loadInstructions(CONFIG_FILE_INSTRUCTIONS),
    loadInstructions(CONFIG_FILE_MOTD),
    loadInstructions(CONFIG_FILE_QOTD),
  ]);

  const config: InMemoryConfig = {
    errorMessages,
    greetingMessages,
    discordLimitMessages,
    instructions,
    motd,
    qotd,
  };

  return config;
};
