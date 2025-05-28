import 'dotenv/config';

import { REQUIRED_ENV } from '@/constants';
import { watchConfigs } from '@/config/watcher';
import { loadConfig } from '@/config/loader';
import initCronTasks from '@/services/cron';
import Rooivalk from '@/services/rooivalk';

async function main() {
  // Validate required environment variables at startup
  const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missingEnv.length) {
    console.error(
      `Missing required environment variables: ${missingEnv.join(', ')}`
    );
    process.exit(1);
  }

  const config = await loadConfig();
  // Pass config to Rooivalk and other services as needed
  const rooivalk = new Rooivalk(config);

  // Watch for config changes and reload in-memory config
  watchConfigs(async (_) => {
    try {
      const newConfig = await loadConfig();
      rooivalk.reloadConfig(newConfig);
    } catch (error) {
      console.error('Failed to reload config:', error);
    }
  });

  await rooivalk.init(); // Await the init method

  initCronTasks(rooivalk); // Call this after init completes
}

main().catch((error) => {
  console.error('Application failed to initialize:', error);
  process.exit(1);
});
