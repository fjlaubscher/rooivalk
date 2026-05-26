import OpenAIService from '../openai/index.ts';
import XAIService from '../xai/index.ts';
import type { InMemoryConfig } from '../../types.ts';

export type ChatService = OpenAIService | XAIService;
export type ImageService = OpenAIService | XAIService;

export function createChatService(config: InMemoryConfig): ChatService {
  if (process.env.XAI_MODEL) {
    if (!process.env.XAI_API_KEY) {
      console.warn(
        '[chat] XAI_MODEL set but XAI_API_KEY missing — falling back to OpenAI',
      );
    } else {
      console.log(
        `[chat] xAI chat provider active (model: ${process.env.XAI_MODEL})`,
      );
      return new XAIService(config);
    }
  }
  return new OpenAIService(config);
}

export function createImageService(config: InMemoryConfig): ImageService {
  if (process.env.XAI_IMAGE_MODEL) {
    if (!process.env.XAI_API_KEY) {
      console.warn(
        '[image] XAI_IMAGE_MODEL set but XAI_API_KEY missing — falling back to OpenAI',
      );
    } else {
      console.log(
        `[image] xAI image provider active (model: ${process.env.XAI_IMAGE_MODEL})`,
      );
      return new XAIService(config);
    }
  }
  return new OpenAIService(config);
}

export function createFieldHospitalChatService(
  config: InMemoryConfig,
): ChatService | undefined {
  const model = process.env.OPENAI_MODEL_FIELD_HOSPITAL;
  const roleId = process.env.DISCORD_FIELD_HOSPITAL_ROLE_ID;
  const channelId = process.env.DISCORD_FIELD_HOSPITAL_CHANNEL_ID;

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
