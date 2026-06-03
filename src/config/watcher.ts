import { existsSync, watch } from 'fs';

import { CONFIG_DIR, CONFIG_FILE_TOOL_ROLES } from '../constants.ts';

export type ConfigReloadCallback = (changedFile: string) => void;

/**
 * Whether a changed top-level config file should trigger a reload. Every
 * `*.md` message list and instruction file qualifies, plus `tool-roles.json`:
 * unlike `profiles.json` (whose services are built once at construction), the
 * tool permissions are read live per message, so reloading them takes effect on
 * the next message with no reconstruction needed.
 */
const isReloadable = (filename: string): boolean =>
  filename.endsWith('.md') || filename === CONFIG_FILE_TOOL_ROLES;

/**
 * Watches the config directory for changes to reloadable config files and
 * triggers the callback.
 * @param onReload Callback to invoke when a config file changes.
 */
export const watchConfigs = (onReload: ConfigReloadCallback): void => {
  if (!existsSync(CONFIG_DIR)) {
    console.warn(`[watcher] Config directory does not exist: ${CONFIG_DIR}`);
    return;
  }

  let debounceTimer: NodeJS.Timeout | null = null;
  let lastChangedFile: string | null = null;

  watch(CONFIG_DIR, (_: string, filename: string | null) => {
    if (filename && isReloadable(filename)) {
      // Debounce rapid changes
      lastChangedFile = filename;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        onReload(lastChangedFile!);
        console.log(
          `[watcher] Reloaded config due to change in ${lastChangedFile}`,
        );
        lastChangedFile = null;
      }, 200);
    }
  });

  console.log(`[watcher] Watching config directory for changes: ${CONFIG_DIR}`);
};
