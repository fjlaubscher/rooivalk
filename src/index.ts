import 'dotenv/config';
import { REQUIRED_ENV } from '@/constants';
import initCronTasks from '@/cron';
import Rooivalk from '@/services/rooivalk';
import { LLMClient } from '@/services/llm/types';
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

let selectedLlmClient: LLMClient;
const llmPreference = process.env.LLM_CLIENT_PREFERENCE?.toLowerCase();

if (llmPreference === 'gemini') {
  selectedLlmClient = new GeminiClient();
  console.log('Using GeminiClient based on LLM_CLIENT_PREFERENCE.');
} else {
  selectedLlmClient = new OpenAIClient();
  if (llmPreference && llmPreference !== 'openai') {
    console.warn(
      `Invalid LLM_CLIENT_PREFERENCE "${process.env.LLM_CLIENT_PREFERENCE}". Defaulting to OpenAIClient.`
    );
  } else {
    console.log('Using OpenAIClient (default or explicitly set).');
  }
}

const rooivalk = new Rooivalk(selectedLlmClient);
rooivalk.init();

initCronTasks(rooivalk);
