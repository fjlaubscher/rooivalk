import {
  CONFIG_FILE_PROFILES,
  getProfileInstructionsPath,
} from '../constants.ts';
import type { ChatProvider, Profile } from '../types.ts';
import { loadJsonConfig } from './json-config.ts';
import { loadOptionalInstructions } from './messages.ts';

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
export const parseProfile = (entry: unknown, index: number): Profile | null => {
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
 * Validates the parsed `profiles.json` shape (an array of profile entries).
 * Malformed entries are skipped, and a name reused across entries keeps the
 * first occurrence (later duplicates are dropped) so the matcher and the
 * service map stay in agreement.
 */
export const parseProfiles = (parsed: unknown): Profile[] => {
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
 * Loads the declarative channel profiles from `config/profiles.json`. The file
 * is deployment-specific (gitignored); a missing file means no profiles are
 * configured and the default chat service handles every channel.
 */
export const loadProfiles = async (): Promise<Profile[]> =>
  loadJsonConfig(CONFIG_FILE_PROFILES, parseProfiles, () => []);

/**
 * Loads the instruction text for the given profiles from
 * `config/profiles/<name>.md`. A profile whose file is missing is skipped
 * silently — `RooivalkService` then falls back to the default chat service for
 * that channel.
 */
export const loadProfileInstructions = async (
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
