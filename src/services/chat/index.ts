import OpenAIService from '../openai/index.ts';
import type { InMemoryConfig } from '../../types.ts';

export type ChatService = OpenAIService;

export function createChatService(
  config: InMemoryConfig,
  openaiService?: OpenAIService,
): ChatService {
  return openaiService ?? new OpenAIService(config);
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
