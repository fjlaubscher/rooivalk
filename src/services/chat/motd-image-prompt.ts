import type OpenAI from 'openai';

/**
 * Generate a fresh MOTD image-generation prompt for a *pre-chosen*
 * location/style/subject combination. The caller picks the style and subject deterministically
 * (see `src/services/memory/motd-rotation.ts`); the model only renders that
 * fixed combination into a vivid prompt and must not substitute its own style
 * or subject. Returns null on error or empty output, so callers can fall back
 * to a stored prompt.
 *
 * @param client - OpenAI-compatible client
 * @param model - chat model id to use
 * @param instructions - system instructions from config (`config/motd-image-prompt.md`, hot-reloaded)
 * @param location - configured location string (city, suburb, or full place name)
 * @param style - the art style the prompt must use
 * @param subject - the subject/aspect the prompt must depict
 */
export async function generateMotdImagePrompt(
  client: OpenAI,
  model: string,
  instructions: string,
  location: string,
  style: string,
  subject: string,
): Promise<string | null> {
  try {
    const response = await client.responses.create({
      model,
      instructions,
      input: `Location: ${location}\nArt style: ${style}\nSubject: ${subject}`,
    });

    const imagePrompt = response.output_text.trim();
    return imagePrompt.length > 0 ? imagePrompt : null;
  } catch (error) {
    console.error('Error generating MOTD image prompt:', error);
    return null;
  }
}
