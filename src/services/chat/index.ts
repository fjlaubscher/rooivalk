import OpenAIService from '../openai/index.ts';
import XAIService from '../xai/index.ts';
import type { InMemoryConfig } from '../../types.ts';

export type ChatService = OpenAIService | XAIService;
export type ImageService = OpenAIService | XAIService;

export function createChatService(
  config: InMemoryConfig,
  env: NodeJS.ProcessEnv = process.env,
): ChatService {
  if (env.XAI_MODEL) {
    if (!env.XAI_API_KEY) {
      console.warn(
        '[chat] XAI_MODEL set but XAI_API_KEY missing — falling back to OpenAI',
      );
    } else {
      console.log(`[chat] xAI chat provider active (model: ${env.XAI_MODEL})`);
      return new XAIService(config);
    }
  }
  return new OpenAIService(config);
}

export function createImageService(
  config: InMemoryConfig,
  env: NodeJS.ProcessEnv = process.env,
): ImageService {
  if (env.XAI_IMAGE_MODEL) {
    if (!env.XAI_API_KEY) {
      console.warn(
        '[image] XAI_IMAGE_MODEL set but XAI_API_KEY missing — falling back to OpenAI',
      );
    } else {
      console.log(
        `[image] xAI image provider active (model: ${env.XAI_IMAGE_MODEL})`,
      );
      return new XAIService(config);
    }
  }
  return new OpenAIService(config);
}

export function createFieldHospitalChatService(
  config: InMemoryConfig,
  env: NodeJS.ProcessEnv = process.env,
): ChatService | undefined {
  const model = env.OPENAI_MODEL_FIELD_HOSPITAL;
  const roleId = env.DISCORD_FIELD_HOSPITAL_ROLE_ID;
  const channelId = env.DISCORD_FIELD_HOSPITAL_CHANNEL_ID;

  if (!model || !roleId || !channelId) {
    return undefined;
  }

  if (!config.fieldHospitalInstructions) {
    return undefined;
  }

  console.log('[chat] Field hospital chat provider active');
  return new OpenAIService(
    config,
    model,
    undefined,
    (c) => c.fieldHospitalInstructions ?? c.instructions,
  );
}
