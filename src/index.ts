import 'dotenv/config';
import { REQUIRED_ENV } from '@/constants';
import initCronTasks from '@/cron';
import Rooivalk from '@/services/rooivalk';
import OpenAIClient from '@/services/openai';
import GeminiClient from '@/services/gemini';

// Validate required environment variables at startup
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length) {
  console.error(
    `Missing required environment variables: ${missingEnv.join(', ')}`
  );
  process.exit(1);
}

const openAIClient = new OpenAIClient();
const geminiClient = new GeminiClient(); // Instantiated but not used by Rooivalk yet

// Pass openAIClient to Rooivalk constructor
const rooivalk = new Rooivalk(openAIClient);
rooivalk.init();

initCronTasks(rooivalk);
