import { readFile } from 'fs/promises';
import { join } from 'path';

import { CONFIG_DIR } from '../constants.ts';

/** Resolves a config file name to its absolute path under `CONFIG_DIR`. */
export const getConfigFilePath = (filename: string): string =>
  join(CONFIG_DIR, filename);

/**
 * Reads and parses a deployment-specific JSON config file, handing the parsed
 * value to `validate`. A missing file yields `onMissing()` — these JSON configs
 * are optional and gitignored, so absence is a valid "nothing configured" state.
 * Invalid JSON, or a `validate` that throws, surfaces as an error: both
 * `profiles.json` and `tool-roles.json` reject malformed input rather than load
 * a partial config.
 */
export const loadJsonConfig = async <T>(
  filename: string,
  validate: (parsed: unknown) => T,
  onMissing: () => T,
): Promise<T> => {
  const filePath = getConfigFilePath(filename);
  let content: string;
  try {
    content = await readFile(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return onMissing();
    }
    throw new Error(
      `[config/loader] Failed to read ${filename}: ${(err as Error).message}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new Error(
      `[config/loader] ${filename} is not valid JSON: ${(err as Error).message}`,
    );
  }

  return validate(parsed);
};
