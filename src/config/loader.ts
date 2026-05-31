import { readFile } from 'fs/promises';
import { join } from 'path';

import {
  CONFIG_DIR,
  CONFIG_FILE_ERRORS,
  CONFIG_FILE_GREETINGS,
  CONFIG_FILE_DISCORD_LIMIT,
  CONFIG_FILE_INSTAGRAM,
  CONFIG_FILE_PERMISSION_DENIED,
  CONFIG_FILE_INSTRUCTIONS_OPENAI,
  CONFIG_FILE_INSTRUCTIONS_XAI,
  CONFIG_FILE_LEADERBOARD,
  CONFIG_FILE_MOTD,
  CONFIG_FILE_PROFILES,
  CONFIG_FILE_TOOL_ROLES,
  getProfileInstructionsPath,
} from '../constants.ts';
import { TOOL_NAMES } from '../services/chat/tool-names.ts';
import type {
  ChatProvider,
  InMemoryConfig,
  Profile,
  ToolRoles,
} from '../types.ts';

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

const VALID_PROVIDERS: ChatProvider[] = ['openai', 'xai'];

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const isOptionalString = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === 'string';

/**
 * Validates a single parsed profile entry. Returns the typed profile, or `null`
 * (with a warning) when a required field is missing/mistyped or `provider` is
 * not a known value — a malformed profile is dropped rather than silently
 * routing to nowhere or keying the service map by `undefined`.
 */
const parseProfile = (entry: unknown, index: number): Profile | null => {
  const label = `${CONFIG_FILE_PROFILES}[${index}]`;

  if (typeof entry !== 'object' || entry === null) {
    console.warn(`[config/loader] ${label} is not an object — skipping`);
    return null;
  }

  const profile = entry as Record<string, unknown>;
  const problems: string[] = [];

  if (!isNonEmptyString(profile.name)) problems.push('name must be a string');
  if (!isNonEmptyString(profile.channelId))
    problems.push('channelId must be a string');
  if (!isOptionalString(profile.roleId))
    problems.push('roleId must be a string');
  if (!isOptionalString(profile.model)) problems.push('model must be a string');
  if (
    profile.provider !== undefined &&
    !VALID_PROVIDERS.includes(profile.provider as ChatProvider)
  ) {
    problems.push(`provider must be one of ${VALID_PROVIDERS.join(', ')}`);
  }

  if (problems.length > 0) {
    console.warn(
      `[config/loader] ${label} is malformed (${problems.join('; ')}) — skipping`,
    );
    return null;
  }

  return entry as Profile;
};

/**
 * Loads the declarative channel profiles from `config/profiles.json`.
 * The file is deployment-specific (gitignored); a missing file means no
 * profiles are configured and the default chat service handles every channel.
 * Malformed entries are skipped, and a name reused across entries keeps the
 * first occurrence (later duplicates are dropped) so the matcher and the
 * service map stay in agreement.
 */
const loadProfiles = async (): Promise<Profile[]> => {
  const filePath = getConfigFilePath(CONFIG_FILE_PROFILES);
  let content: string;
  try {
    content = await readFile(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw new Error(
      `[config/loader] Failed to read ${CONFIG_FILE_PROFILES}: ${(err as Error).message}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new Error(
      `[config/loader] ${CONFIG_FILE_PROFILES} is not valid JSON: ${(err as Error).message}`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`[config/loader] ${CONFIG_FILE_PROFILES} must be an array`);
  }

  const seen = new Set<string>();
  const profiles: Profile[] = [];
  parsed.forEach((entry, index) => {
    const profile = parseProfile(entry, index);
    if (!profile) return;
    if (seen.has(profile.name)) {
      console.warn(
        `[config/loader] duplicate profile name "${profile.name}" — keeping the first and skipping this one`,
      );
      return;
    }
    seen.add(profile.name);
    profiles.push(profile);
  });

  return profiles;
};

/**
 * Loads the instruction text for the given profiles from
 * `config/profiles/<name>.md`. A profile whose file is missing is skipped
 * silently — `RooivalkService` then falls back to the default chat service for
 * that channel.
 */
const loadProfileInstructions = async (
  profiles: Profile[],
): Promise<Record<string, string>> => {
  const profileNames = [...new Set(profiles.map((profile) => profile.name))];

  const entries = await Promise.all(
    profileNames.map(async (name) => {
      const content = await loadOptionalInstructions(
        getProfileInstructionsPath(name),
      );
      if (!content) {
        console.warn(
          `[config/loader] profile "${name}" is missing its instructions file`,
        );
      }
      return [name, content] as const;
    }),
  );

  const profileInstructions: Record<string, string> = {};
  for (const [name, content] of entries) {
    if (content) {
      profileInstructions[name] = content;
    }
  }
  return profileInstructions;
};

const KNOWN_TOOL_NAMES = new Set<string>(Object.values(TOOL_NAMES));

/**
 * Loads the role-based tool permissions from `config/tool-roles.json`. The file
 * is deployment-specific (gitignored); a missing file means no tool is
 * restricted. The shape is `{ "<role_id>": ["tool_name", ...] }`. A role whose
 * value is not an array of strings is dropped with a warning. Unknown tool
 * names are kept but warned about — they simply never match a real tool call.
 */
const loadToolRoles = async (): Promise<ToolRoles> => {
  const filePath = getConfigFilePath(CONFIG_FILE_TOOL_ROLES);
  let content: string;
  try {
    content = await readFile(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw new Error(
      `[config/loader] Failed to read ${CONFIG_FILE_TOOL_ROLES}: ${(err as Error).message}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new Error(
      `[config/loader] ${CONFIG_FILE_TOOL_ROLES} is not valid JSON: ${(err as Error).message}`,
    );
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `[config/loader] ${CONFIG_FILE_TOOL_ROLES} must be an object mapping role id to tool names`,
    );
  }

  const toolRoles: ToolRoles = {};
  for (const [roleId, tools] of Object.entries(
    parsed as Record<string, unknown>,
  )) {
    // Fail closed: this is a permission boundary, so a malformed entry or a
    // typo'd tool name must reject the config rather than silently leaving the
    // intended sensitive tool ungated (and therefore public).
    if (
      !Array.isArray(tools) ||
      !tools.every((tool) => typeof tool === 'string')
    ) {
      throw new Error(
        `[config/loader] ${CONFIG_FILE_TOOL_ROLES} role "${roleId}" must map to an array of tool names`,
      );
    }

    const unknownTools = tools.filter((tool) => !KNOWN_TOOL_NAMES.has(tool));
    if (unknownTools.length > 0) {
      throw new Error(
        `[config/loader] ${CONFIG_FILE_TOOL_ROLES} role "${roleId}" lists unknown tool name(s): ${unknownTools.join(', ')}. A typo would silently leave a sensitive tool ungated — fix or remove them.`,
      );
    }

    toolRoles[roleId] = tools;
  }

  return toolRoles;
};

export const loadConfig = async (): Promise<InMemoryConfig> => {
  const [
    errorMessages,
    greetingMessages,
    discordLimitMessages,
    leaderboardEmptyMessages,
    instagramMessages,
    permissionDeniedMessages,
    openaiInstructions,
    xaiInstructions,
    profiles,
    toolRoles,
    motd,
  ] = await Promise.all([
    loadMessageList(CONFIG_FILE_ERRORS),
    loadMessageList(CONFIG_FILE_GREETINGS),
    loadMessageList(CONFIG_FILE_DISCORD_LIMIT),
    loadMessageList(CONFIG_FILE_LEADERBOARD),
    loadMessageList(CONFIG_FILE_INSTAGRAM),
    loadMessageList(CONFIG_FILE_PERMISSION_DENIED),
    loadInstructions(CONFIG_FILE_INSTRUCTIONS_OPENAI),
    loadInstructions(CONFIG_FILE_INSTRUCTIONS_XAI),
    loadProfiles(),
    loadToolRoles(),
    loadInstructions(CONFIG_FILE_MOTD),
  ]);

  const profileInstructions = await loadProfileInstructions(profiles);

  const config: InMemoryConfig = {
    errorMessages,
    greetingMessages,
    discordLimitMessages,
    leaderboardEmptyMessages,
    instagramMessages,
    permissionDeniedMessages,
    instructions: {
      openai: openaiInstructions,
      xai: xaiInstructions,
    },
    profiles,
    profileInstructions,
    toolRoles,
    motd,
  };

  return config;
};
