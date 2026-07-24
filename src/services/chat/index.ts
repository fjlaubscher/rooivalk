import OpenAIService from '../openai/index.ts';
import type { InMemoryConfig, InstructionsSelector } from '../../types.ts';

export type ChatService = OpenAIService;
export type ImageService = OpenAIService;

/**
 * Builds the per-profile chat services, keyed by profile name. `RooivalkService`
 * picks one per incoming message via `matchProfile`, falling back to the
 * default chat service when no profile matches or a profile was skipped here.
 * Each service swaps in the profile's instructions and model override;
 * everything else stays at the default.
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

    if (!config.profileInstructions[profile.name]) {
      console.warn(
        `[chat] profile "${profile.name}" is missing its instructions file — skipping`,
      );
      continue;
    }

    const selectInstructions: InstructionsSelector = (c) =>
      c.profileInstructions[profile.name] ?? c.instructions;

    services.set(
      profile.name,
      new OpenAIService(config, profile.model, undefined, selectInstructions),
    );
    console.log(
      `[chat] profile "${profile.name}" active (channel: ${profile.channelId})`,
    );
  }

  return services;
}
