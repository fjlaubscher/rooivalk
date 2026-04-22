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
