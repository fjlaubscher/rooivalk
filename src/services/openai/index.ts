import OpenAI from 'openai';

import type { InMemoryConfig, Persona } from '@/types';

class OpenAIService {
  private _config: InMemoryConfig;
  private _model: string;
  private _imageModel: string;
  private _openai: OpenAI;
  private _tools: OpenAI.Responses.Tool[];

  constructor(config: InMemoryConfig, model?: string, imageModel?: string) {
    this._config = config;
    this._openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });

    this._model = model || process.env.OPENAI_MODEL!;
    this._tools = [
      {
        type: 'web_search_preview',
        search_context_size: 'low',
      },
    ];

    this._imageModel = imageModel || process.env.OPENAI_IMAGE_MODEL!;
  }

  private getInstructions(persona: Persona, emojis: string[] = []): string {
    switch (persona) {
      case 'rooivalk':
        let rooivalkInstructions = this._config.instructionsRooivalk;

        rooivalkInstructions = rooivalkInstructions.replace(
          /{{EMOJIS}}/,
          emojis.join('\n')
        );

        return rooivalkInstructions;
      case 'learn':
        return this._config.instructionsLearn;
      default:
        return this._config.instructionsRooivalk;
    }
  }

  async createResponse(
    persona: Persona,
    prompt: string,
    emojis: string[] = [],
    history?: string | null
  ) {
    try {
      let instructions = this.getInstructions(persona, emojis);

      if (history) {
        instructions += `\n\nConversation history:\n${history}`;
      }

      const response = await this._openai.responses.create({
        model: this._model,
        tools: this._tools,
        instructions,
        input: prompt,
      });

      return response.output_text;
    } catch (error) {
      console.error('Error with OpenAI:', error);
      if (error instanceof OpenAI.OpenAIError) {
        throw new Error(error.message);
      }

      throw new Error('Error creating chat completion');
    }
  }

  public reloadConfig(newConfig: InMemoryConfig): void {
    this._config = newConfig;
  }

  async createImage(prompt: string) {
    try {
      const result = await this._openai.images.generate({
        model: this._imageModel,
        prompt,
        n: 1,
        output_format: 'jpeg',
      });

      if (result.data && result.data[0]) {
        return result.data[0].b64_json;
      }

      console.log('Failed to generate image', JSON.stringify(result));
      return null;
    } catch (error) {
      console.error('Error with OpenAI:', error);
      if (error instanceof OpenAI.OpenAIError) {
        throw new Error(error.message);
      }

      throw new Error('Error creating image');
    }
  }

  async generateThreadName(prompt: string) {
    try {
      const instructions = `
        You generate Discord thread titles.
        Given any message, output only a short thread name (max 100 characters).
        Never include any other text.
        Do not reply with explanations.
        If unsure, guess the topic.
      `;

      const response = await this._openai.responses.create({
        model: this._model,
        tools: this._tools,
        instructions,
        input: prompt,
      });

      let threadName = response.output_text.trim();

      // Ensure the thread name is within the 100-character limit
      if (threadName.length > 100) {
        threadName = threadName.substring(0, 97) + '...'; // Truncate and add ellipsis
      }

      return threadName;
    } catch (error) {
      console.error('Error with OpenAI:', error);
      if (error instanceof OpenAI.OpenAIError) {
        throw new Error(error.message);
      }

      throw new Error('Error creating thread name');
    }
  }
}

export default OpenAIService;
