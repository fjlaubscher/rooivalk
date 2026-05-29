import { readFile } from 'fs/promises';
import { join } from 'path';

import {
  CONFIG_DIR,
  CONFIG_FILE_ERRORS,
  CONFIG_FILE_GREETINGS,
  CONFIG_FILE_DISCORD_LIMIT,
  CONFIG_FILE_INSTRUCTIONS_OPENAI,
  CONFIG_FILE_INSTRUCTIONS_XAI,
  CONFIG_FILE_LEADERBOARD,
  CONFIG_FILE_MOTD,
  CONFIG_FILE_ROUTES,
  getInstructionsProfilePath,
} from '../constants.ts';
import type { ChannelRoute, InMemoryConfig } from '../types.ts';

const getConfigFilePath = (filename: string): string =>
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
const loadMessageList = async (filename: string): Promise<string[]> => {
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
const loadInstructions = async (filename: string): Promise<string> => {
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

const loadOptionalInstructions = async (
  filename: string,
): Promise<string | undefined> => {
  try {
    return await loadInstructions(filename);
  } catch (err) {
    const message = (err as Error).message ?? '';
    if (message.includes('ENOENT')) {
      return undefined;
    }
    throw err;
  }
};

/**
 * Loads the declarative channel routes from `config/routes.json`.
 * The file is deployment-specific (gitignored); a missing file means no
 * routes are configured and the default chat service handles every channel.
 */
const loadRoutes = async (): Promise<ChannelRoute[]> => {
  const filePath = getConfigFilePath(CONFIG_FILE_ROUTES);
  let content: string;
  try {
    content = await readFile(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw new Error(
      `[config/loader] Failed to read ${CONFIG_FILE_ROUTES}: ${(err as Error).message}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new Error(
      `[config/loader] ${CONFIG_FILE_ROUTES} is not valid JSON: ${(err as Error).message}`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`[config/loader] ${CONFIG_FILE_ROUTES} must be an array`);
  }

  return parsed as ChannelRoute[];
};

/**
 * Loads the instruction profiles referenced by the given routes. A route that
 * points at a missing profile file is skipped silently — `RooivalkService`
 * then falls back to the default chat service for that channel.
 */
const loadProfiles = async (
  routes: ChannelRoute[],
): Promise<Record<string, string>> => {
  const profileNames = [...new Set(routes.map((route) => route.instructions))];

  const entries = await Promise.all(
    profileNames.map(async (name) => {
      const content = await loadOptionalInstructions(
        getInstructionsProfilePath(name),
      );
      if (!content) {
        console.warn(
          `[config/loader] route references missing instructions profile "${name}"`,
        );
      }
      return [name, content] as const;
    }),
  );

  const profiles: Record<string, string> = {};
  for (const [name, content] of entries) {
    if (content) {
      profiles[name] = content;
    }
  }
  return profiles;
};

export const loadConfig = async (): Promise<InMemoryConfig> => {
  const [
    errorMessages,
    greetingMessages,
    discordLimitMessages,
    leaderboardEmptyMessages,
    openaiInstructions,
    xaiInstructions,
    routes,
    motd,
  ] = await Promise.all([
    loadMessageList(CONFIG_FILE_ERRORS),
    loadMessageList(CONFIG_FILE_GREETINGS),
    loadMessageList(CONFIG_FILE_DISCORD_LIMIT),
    loadMessageList(CONFIG_FILE_LEADERBOARD),
    loadInstructions(CONFIG_FILE_INSTRUCTIONS_OPENAI),
    loadInstructions(CONFIG_FILE_INSTRUCTIONS_XAI),
    loadRoutes(),
    loadInstructions(CONFIG_FILE_MOTD),
  ]);

  const profiles = await loadProfiles(routes);

  const config: InMemoryConfig = {
    errorMessages,
    greetingMessages,
    discordLimitMessages,
    leaderboardEmptyMessages,
    instructions: {
      openai: openaiInstructions,
      xai: xaiInstructions,
    },
    profiles,
    routes,
    motd,
  };

  return config;
};
