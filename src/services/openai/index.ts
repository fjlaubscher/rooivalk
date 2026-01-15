import OpenAI from 'openai';

import type {
  AttachmentForPrompt,
  InMemoryConfig,
  OpenAIResponse,
} from '@/types';

const NO_HISTORY_FALLBACK =
  'No prior sorties logged. Start fresh but stay on-mission.';
const MAX_HISTORY_LINES = 40;
const MAX_HISTORY_CHARACTERS = 6000;

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
        model: this._imageModel as `gpt-image-1.5`,
        output_format: 'jpeg',
      },
    ];
  }

  async createResponse(
    author: string | 'rooivalk',
    prompt: string,
    emojis: string[] = [],
    history: string | null = null,
    attachments: AttachmentForPrompt[] | null = null,
  ): Promise<OpenAIResponse> {
    try {
      let instructions = this._config.instructions;

      const currentDate = new Date().toISOString().split('T')[0];
      instructions = instructions.replace(/{{CURRENT_DATE}}/g, currentDate);

      // inject emojis if available
      if (emojis) {
        instructions = instructions.replace(/{{EMOJIS}}/, emojis.join('\n'));
      }

      const sanitizedHistory = history?.trim() ?? '';
      const hasHistory = sanitizedHistory.length > 0;
      const historyContent = hasHistory
        ? this.truncateConversationHistory(sanitizedHistory)
        : NO_HISTORY_FALLBACK;

      if (instructions.includes('{{CONVERSATION_HISTORY}}')) {
        instructions = instructions.replace(
          /{{CONVERSATION_HISTORY}}/g,
          historyContent,
        );
      } else if (hasHistory) {
        instructions += `\n\n### Conversation history:\n${historyContent}`;
      }

      const inputContent: OpenAI.Responses.ResponseInputContent[] = [
        {
          type: 'input_text',
          text: prompt,
        },
      ];

      if (attachments && attachments.length > 0) {
        attachments.forEach((attachment) => {
          if (attachment.kind === 'image') {
            inputContent.push({
              type: 'input_image',
              image_url: attachment.url,
              detail: 'auto',
            });
            return;
          }

          const metadata: string[] = [];
          if (attachment.name) {
            metadata.push(`name=${attachment.name}`);
          }
          if (attachment.contentType) {
            metadata.push(`type=${attachment.contentType}`);
          }

          const metadataSuffix =
            metadata.length > 0 ? ` (${metadata.join(', ')})` : '';

          inputContent.push({
            type: 'input_text',
            text: `Attachment${metadataSuffix}: ${attachment.url}`,
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

      this.logPromptMetrics({
        instructionsLength: instructions.length,
        hasHistory,
        historyLength: sanitizedHistory.length,
        attachmentsCount: attachments?.length ?? 0,
        promptLength: prompt.length,
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
        base64Images: [],
      };
    } catch (error) {
      console.error('Error with OpenAI:', error);
      if (error instanceof OpenAI.OpenAIError) {
        throw new Error(error.message);
      }

      throw new Error('Error creating chat completion');
    }
  }

  private truncateConversationHistory(history: string): string {
    const lines = history.split('\n');
    let truncatedLines = lines;
    const notices: string[] = [];

    if (lines.length > MAX_HISTORY_LINES) {
      truncatedLines = lines.slice(lines.length - MAX_HISTORY_LINES);
      notices.push('...prior sorties truncated...');
    }

    let truncated = truncatedLines.join('\n');

    if (truncated.length > MAX_HISTORY_CHARACTERS) {
      truncated = truncated.slice(truncated.length - MAX_HISTORY_CHARACTERS);
      const firstNewline = truncated.indexOf('\n');
      if (firstNewline > -1) {
        truncated = truncated.slice(firstNewline + 1);
      }
      notices.push('...history clipped for length...');
    }

    const parts = [...notices, truncated].filter(Boolean);
    return parts.join('\n').trim();
  }

  private logPromptMetrics(metrics: {
    instructionsLength: number;
    hasHistory: boolean;
    historyLength: number;
    attachmentsCount: number;
    promptLength: number;
  }): void {
    if (process.env.LOG_LEVEL?.toLowerCase() !== 'debug') {
      return;
    }

    console.debug('[OpenAIService] prompt metrics', metrics);
  }

  public reloadConfig(newConfig: InMemoryConfig): void {
    this._config = newConfig;
  }

  async createImage(prompt: string): Promise<string | null> {
    try {
      const result = await this._openai.images.generate({
        model: this._imageModel,
        prompt,
        n: 1,
        output_format: 'jpeg',
      });

      const base64Image = result.data?.[0]?.b64_json ?? null;
      if (base64Image) {
        return base64Image;
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
