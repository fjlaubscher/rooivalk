import type OpenAI from 'openai';

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
 */
export async function generateMotdImagePrompt(
  client: OpenAI,
  model: string,
  instructions: string,
  location: string,
): Promise<string | null> {
  try {
    const response = await client.responses.create({
      model,
      instructions,
      input: location,
    });

    const imagePrompt = response.output_text.trim();
    return imagePrompt.length > 0 ? imagePrompt : null;
  } catch (error) {
    console.error('Error generating MOTD image prompt:', error);
    return null;
  }
}
