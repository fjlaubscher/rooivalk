import type OpenAI from 'openai';

/**
 * Builds the avoid-list block appended to the instructions so the model steers
 * away from prompts it recently produced. Returns an empty string when there is
 * nothing to avoid.
 */
const buildAvoidBlock = (recentPrompts: readonly string[]): string => {
  const cleaned = recentPrompts.map((p) => p.trim()).filter(Boolean);
  if (cleaned.length === 0) {
    return '';
  }
  const list = cleaned.map((p) => `- ${p}`).join('\n');
  return `\n\nDo NOT produce a prompt similar in art style or subject to any of these recent ones. Deliberately pick a different style and subject:\n${list}`;
};

/**
 * Generate a fresh MOTD image-generation prompt for the given location using
 * an OpenAI-compatible chat client (OpenAI or xAI). Returns null on error or
 * when the model produces no output, so callers can fall back to a stored
 * prompt.
 *
 * @param client - OpenAI-compatible client
 * @param model - chat model id to use
 * @param instructions - system instructions from config (`config/motd-image-prompt.md`, hot-reloaded)
 * @param location - configured location string (city, suburb, or full place name)
 * @param recentPrompts - recently used prompts to steer away from (newest first)
 */
export async function generateMotdImagePrompt(
  client: OpenAI,
  model: string,
  instructions: string,
  location: string,
  recentPrompts: readonly string[] = [],
): Promise<string | null> {
  try {
    const response = await client.responses.create({
      model,
      instructions: `${instructions}${buildAvoidBlock(recentPrompts)}`,
      input: location,
    });

    const imagePrompt = response.output_text.trim();
    return imagePrompt.length > 0 ? imagePrompt : null;
  } catch (error) {
    console.error('Error generating MOTD image prompt:', error);
    return null;
  }
}
