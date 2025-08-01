import { existsSync, watch } from 'fs';

import { CONFIG_DIR } from '@/constants';

export type ConfigReloadCallback = (changedFile: string) => void;

/**
 * Watches the config directory for changes to .md files and triggers the callback.
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
    if (filename && filename.endsWith('.md')) {
      // Debounce rapid changes
      lastChangedFile = filename;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        onReload(lastChangedFile!);
        console.log(
          `[watcher] Reloaded config due to change in ${lastChangedFile}`
        );
        lastChangedFile = null;
      }, 200);
    }
  });

  console.log(`[watcher] Watching config directory for changes: ${CONFIG_DIR}`);
};
