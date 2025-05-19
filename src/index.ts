import 'dotenv/config';
import { REQUIRED_ENV } from '@/constants';
import initCronTasks from '@/cron';
import Rooivalk from '@/services/rooivalk';

// Validate required environment variables at startup
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length) {
  console.error(
    `Missing required environment variables: ${missingEnv.join(', ')}`
  );
  process.exit(1);
}

const rooivalk = new Rooivalk();
rooivalk.init();

initCronTasks(rooivalk);
