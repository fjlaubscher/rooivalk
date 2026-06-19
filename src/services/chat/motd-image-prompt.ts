import type OpenAI from 'openai';

/**
 * Instructions for the LLM that crafts a MOTD image-generation prompt.
 *
 * The input is a configured location string, which may be a city, a suburb,
 * or a full place name (e.g. "Sea Point, Cape Town"). The whole configured
 * string is passed through verbatim so the model can use the full context.
 */
export const MOTD_IMAGE_PROMPT_INSTRUCTIONS = `
  You craft prompts for an AI image generator.
  Given a location (which may be a city, a suburb, or a full place name),
  output ONE vivid, detailed image-generation prompt depicting that place in
  an interesting way.
  Pick an evocative art style (for example: watercolour, oil painting,
  ukiyo-e woodblock, retro travel poster, pixel art, art nouveau,
  isometric illustration, comic book panel, or invent your own) and an
  interesting subject (a landmark, hidden gem, local cuisine, market,
  skyline at golden hour, natural landscape, festival, native wildlife,
  everyday street life, or a historical scene).
  Vary both the style and the subject so repeated runs differ.
  Output only the prompt, max 80 words, no explanations or quotes.
`;

/**
 * Generate a fresh MOTD image-generation prompt for the given location using
 * an OpenAI-compatible chat client (OpenAI or xAI). Returns null on error or
 * when the model produces no output, so callers can fall back to a stored
 * prompt.
 *
 * @param client - OpenAI-compatible client
 * @param model - chat model id to use
 * @param location - configured location string (city, suburb, or full place name)
 */
export async function generateMotdImagePrompt(
  client: OpenAI,
  model: string,
  location: string,
): Promise<string | null> {
  try {
    const response = await client.responses.create({
      model,
      instructions: MOTD_IMAGE_PROMPT_INSTRUCTIONS,
      input: location,
    });

    const imagePrompt = response.output_text.trim();
    return imagePrompt.length > 0 ? imagePrompt : null;
  } catch (error) {
    console.error('Error generating MOTD image prompt:', error);
    return null;
  }
}
