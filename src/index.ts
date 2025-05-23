import 'dotenv/config'; // Keep first for side effects
import { REQUIRED_ENV } from '@/constants';
import initCronTasks from '@/cron';
import GeminiClient from '@/services/gemini'; // Sorted
import OpenAIClient from '@/services/openai'; // Sorted
import Rooivalk from '@/services/rooivalk'; // Sorted

// Validate required environment variables at startup
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length) {
  console.error(
    `Missing required environment variables: ${missingEnv.join(', ')}`
  );
  process.exit(1);
}

const openAIClient = new OpenAIClient();
const geminiClient = new GeminiClient();

// Pass both clients to Rooivalk constructor
const rooivalk = new Rooivalk(openAIClient, geminiClient);
rooivalk.init();

initCronTasks(rooivalk);
