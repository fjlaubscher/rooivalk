import OpenAIService from '../openai/index.ts';
import XAIService from '../xai/index.ts';
import type {
  ChannelRoute,
  InMemoryConfig,
  InstructionsSelector,
} from '../../types.ts';

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

/**
 * Builds a chat service for a single channel route, or `undefined` if it can't
 * be satisfied (missing instruction profile, or an xAI route without an API
 * key). The service swaps in the route's instruction profile and model
 * override; everything else stays at the provider default.
 */
function createRoutedChatService(
  config: InMemoryConfig,
  route: ChannelRoute,
): ChatService | undefined {
  if (!config.profiles[route.instructions]) {
    console.warn(
      `[chat] route "${route.name}" references missing instructions profile "${route.instructions}" — skipping`,
    );
    return undefined;
  }

  const provider = route.provider ?? 'openai';
  const selectInstructions: InstructionsSelector = (c) =>
    c.profiles[route.instructions] ??
    (provider === 'xai' ? c.instructions.xai : c.instructions.openai);

  if (provider === 'xai') {
    if (!process.env.XAI_API_KEY) {
      console.warn(
        `[chat] route "${route.name}" targets xAI but XAI_API_KEY is missing — skipping`,
      );
      return undefined;
    }
    return new XAIService(config, route.model, selectInstructions);
  }

  return new OpenAIService(config, route.model, undefined, selectInstructions);
}

/**
 * Builds the per-route chat services, keyed by route name. `RooivalkService`
 * picks one per incoming message via `matchChannelRoute`, falling back to the
 * default chat service when no route matches or a route was skipped here.
 */
export function createRoutedChatServices(
  config: InMemoryConfig,
): Map<string, ChatService> {
  const services = new Map<string, ChatService>();

  for (const route of config.routes) {
    // `matchChannelRoute` resolves to the first route with a given name, so a
    // duplicate name here would shadow the earlier route's service. The loader
    // already dedupes; guard anyway since this can run on a hand-built config.
    if (services.has(route.name)) {
      console.warn(
        `[chat] duplicate route name "${route.name}" — keeping the first and skipping this one`,
      );
      continue;
    }

    const service = createRoutedChatService(config, route);
    if (service) {
      services.set(route.name, service);
      console.log(
        `[chat] route "${route.name}" active (channel: ${route.channelId}, provider: ${route.provider ?? 'openai'})`,
      );
    }
  }

  return services;
}
