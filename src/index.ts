import 'dotenv/config';
import { REQUIRED_ENV } from '@/constants';
import initCronTasks from '@/cron';
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

  const rooivalk = new Rooivalk();
  await rooivalk.init(); // Await the init method

  initCronTasks(rooivalk); // Call this after init completes
}

main().catch(error => {
  console.error("Application failed to initialize:", error);
  process.exit(1);
});
