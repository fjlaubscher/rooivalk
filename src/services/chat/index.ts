import OpenAIService from '../openai/index.ts';
import XAIService from '../xai/index.ts';
import type {
  InMemoryConfig,
  InstructionsSelector,
  Profile,
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
 * Builds a chat service for a single channel profile, or `undefined` if it
 * can't be satisfied (missing instructions file, or an xAI profile without an
 * API key). The service swaps in the profile's instructions and model override;
 * everything else stays at the provider default.
 */
function createProfileChatService(
  config: InMemoryConfig,
  profile: Profile,
): ChatService | undefined {
  if (!config.profileInstructions[profile.name]) {
    console.warn(
      `[chat] profile "${profile.name}" is missing its instructions file — skipping`,
    );
    return undefined;
  }

  const provider = profile.provider ?? 'openai';
  const selectInstructions: InstructionsSelector = (c) =>
    c.profileInstructions[profile.name] ??
    (provider === 'xai' ? c.instructions.xai : c.instructions.openai);

  if (provider === 'xai') {
    if (!process.env.XAI_API_KEY) {
      console.warn(
        `[chat] profile "${profile.name}" targets xAI but XAI_API_KEY is missing — skipping`,
      );
      return undefined;
    }
    return new XAIService(config, profile.model, selectInstructions);
  }

  return new OpenAIService(
    config,
    profile.model,
    undefined,
    selectInstructions,
  );
}

/**
 * Builds the per-profile chat services, keyed by profile name. `RooivalkService`
 * picks one per incoming message via `matchProfile`, falling back to the
 * default chat service when no profile matches or a profile was skipped here.
 */
export function createProfileChatServices(
  config: InMemoryConfig,
): Map<string, ChatService> {
  const services = new Map<string, ChatService>();

  for (const profile of config.profiles) {
    // `matchProfile` resolves to the first profile with a given name, so a
    // duplicate name here would shadow the earlier profile's service. The
    // loader already dedupes; guard anyway since this can run on a hand-built
    // config.
    if (services.has(profile.name)) {
      console.warn(
        `[chat] duplicate profile name "${profile.name}" — keeping the first and skipping this one`,
      );
      continue;
    }

    const service = createProfileChatService(config, profile);
    if (service) {
      services.set(profile.name, service);
      console.log(
        `[chat] profile "${profile.name}" active (channel: ${profile.channelId}, provider: ${profile.provider ?? 'openai'})`,
      );
    }
  }

  return services;
}
