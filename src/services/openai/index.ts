import OpenAI from 'openai';

import type { InMemoryConfig, OpenAIResponse } from '@/types';

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
    this._imageModel = imageModel || process.env.OPENAI_IMAGE_MODEL!;

    this._tools = [
      {
        type: 'web_search_preview',
        search_context_size: 'low',
      },
      {
        type: 'image_generation',
        model: this._imageModel as `gpt-image-1`,
        output_format: 'jpeg',
      },
    ];
  }

  async createResponse(
    author: string | 'rooivalk',
    prompt: string,
    emojis: string[] = [],
    history: string | null = null,
    attachmentUrls: string[] | null = null
  ): Promise<OpenAIResponse> {
    try {
      let instructions = this._config.instructions;

      // inject emojis if available
      if (emojis) {
        instructions = instructions.replace(/{{EMOJIS}}/, emojis.join('\n'));
      }

      // inject conversation history if available
      if (history) {
        instructions += `\n\n### Conversation history:\n${history}`;
      }

      const inputContent: OpenAI.Responses.ResponseInputContent[] = [
        {
          type: 'input_text',
          text: prompt,
        },
      ];

      if (attachmentUrls && attachmentUrls.length > 0) {
        attachmentUrls.forEach((url) => {
          inputContent.push({
            type: 'input_image',
            image_url: url,
            detail: 'auto',
          });
        });
      }

      const responseInput: OpenAI.Responses.ResponseInput = [];

      if (author !== 'rooivalk') {
        responseInput.push({
          role: 'system',
          content: `The following prompt is a discord message from ${author}`,
        });
      }

      responseInput.push({
        role: 'user',
        content: inputContent,
      });

      const response = await this._openai.responses.create({
        model: this._model,
        tools: this._tools,
        instructions,
        input: responseInput,
      });

      const generatedImages = response.output
        .filter((output) => output.type === 'image_generation_call')
        .map((output) => output.result ?? '')
        .filter(Boolean);

      if (generatedImages.length > 0) {
        return {
          type: 'image_generation_call',
          content: response.output_text,
          base64Images: generatedImages,
        };
      }

      return {
        type: 'text',
        content: response.output_text,
        base64Images: []
      };
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
