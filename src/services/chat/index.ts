import ClaudeService from '../claude/index.ts';
import OpenAIService from '../openai/index.ts';
import type {
  AttachmentForPrompt,
  InMemoryConfig,
  MessageInChain,
  OpenAIResponse,
  ToolExecutor,
} from '../../types.ts';

export interface ChatService {
  createResponse(
    author: string | 'rooivalk',
    prompt: string,
    emojis?: string[],
    history?: MessageInChain[] | null,
    attachments?: AttachmentForPrompt[] | null,
    toolExecutor?: ToolExecutor,
  ): Promise<OpenAIResponse>;
  generateThreadName(prompt: string): Promise<string>;
  reloadConfig(newConfig: InMemoryConfig): void;
}

export type ChatProvider = 'anthropic' | 'openai';

export function resolveChatProvider(
  env: NodeJS.ProcessEnv = process.env,
): ChatProvider {
  if (env.ANTHROPIC_MODEL) {
    return 'anthropic';
  }

  if (env.OPENAI_MODEL) {
    return 'openai';
  }

  throw new Error(
    'No chat model configured. Set ANTHROPIC_MODEL or OPENAI_MODEL.',
  );
}

export function createChatService(
  config: InMemoryConfig,
  openaiService?: OpenAIService,
): ChatService {
  const provider = resolveChatProvider();
  console.log(`[chat] Using ${provider} for chat/reasoning`);

  if (provider === 'anthropic') {
    return new ClaudeService(config);
  }

  // Reuse the existing OpenAI instance if one was provided, so the
  // image-generation service and chat service share a single client.
  return openaiService ?? new OpenAIService(config);
}

export function createElevatedChatService(
  config: InMemoryConfig,
  env: NodeJS.ProcessEnv = process.env,
): ChatService | undefined {
  const elevatedModel = env.ANTHROPIC_MODEL_FIELD_HOSPITAL;
  const roleId = env.DISCORD_FIELD_HOSPITAL_ROLE_ID;
  const channelId = env.DISCORD_FIELD_HOSPITAL_CHANNEL_ID;

  if (!elevatedModel || !roleId || !channelId) {
    return undefined;
  }

  // Elevated routing is Anthropic-only. If the base provider is OpenAI,
  // skip silently — the feature requires a configured Claude stack.
  if (resolveChatProvider(env) !== 'anthropic') {
    return undefined;
  }

  console.log('[chat] Elevated Anthropic chat provider active');
  return new ClaudeService(config, elevatedModel);
}
