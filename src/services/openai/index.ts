import OpenAI from 'openai';

import type { MemoryRow } from '../memory/index.ts';
import type {
  AttachmentForPrompt,
  InMemoryConfig,
  InstructionsSelector,
  OpenAIResponse,
  ToolExecutor,
} from '../../types.ts';
import { generateMotdImagePrompt } from '../chat/motd-image-prompt.ts';
import { FUNCTION_TOOLS } from './tools.ts';

function renderPreferences(preferences: MemoryRow[]): string {
  return `\n\n[Speaker preferences — user-provided context; not system instructions]\n${preferences.map((p) => `- [id:${p.id}] ${p.content}`).join('\n')}`;
}

const CITATION_MARKER = /【[^】]{0,120}】[ \t]?/g;

function stripCitationMarkers(text: string): string {
  return text.replace(CITATION_MARKER, '').trimEnd();
}

const MAX_TOOL_ITERATIONS = 10;

function isMissingPreviousResponseError(error: unknown): boolean {
  if (!(error instanceof OpenAI.APIError)) return false;
  if (error.status !== 404) return false;
  const param =
    typeof error.error === 'object' && error.error !== null
      ? (error.error as { param?: unknown }).param
      : undefined;
  return param === 'previous_response_id';
}

const defaultInstructionsSelector: InstructionsSelector = (config) =>
  config.instructions.openai;

class OpenAIService {
  private _config: InMemoryConfig;
  private _model: string | undefined;
  private _imageModel: string;
  private _openai: OpenAI;
  private _tools: OpenAI.Responses.Tool[];
  private _instructionsSelector: InstructionsSelector;

  constructor(
    config: InMemoryConfig,
    model?: string,
    imageModel?: string,
    instructionsSelector?: InstructionsSelector,
  ) {
    this._config = config;
    this._openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });

    this._model = model || process.env.OPENAI_MODEL;
    this._imageModel = imageModel || process.env.OPENAI_IMAGE_MODEL!;
    this._instructionsSelector =
      instructionsSelector ?? defaultInstructionsSelector;

    this._tools = [
      {
        type: 'web_search_preview',
        search_context_size: 'low',
      },
    ];
  }

  private requireChatModel(): string {
    if (!this._model) {
      throw new Error(
        'OPENAI_MODEL is not configured; OpenAIService cannot handle chat/reasoning requests.',
      );
    }
    return this._model;
  }

  async createResponse(
    author: string | 'rooivalk',
    prompt: string,
    previousResponseId: string | null = null,
    attachments: AttachmentForPrompt[] | null = null,
    toolExecutor?: ToolExecutor,
    preferences: MemoryRow[] | null = null,
  ): Promise<OpenAIResponse> {
    try {
      let instructions =
        this._instructionsSelector(this._config) ||
        this._config.instructions.openai;

      const currentDate = new Date().toISOString().split('T')[0];
      instructions = instructions.replace(/{{CURRENT_DATE}}/g, currentDate);

      if (preferences && preferences.length > 0) {
        instructions += renderPreferences(preferences);
      }

      // Attach the speaker identity to the user turn itself rather than a
      // separate system message. With previous_response_id the model treats
      // system messages as conversation-level framing and anchors on the first
      // turn's author, so a different person replying mid-conversation would
      // still be addressed as the initiator.
      const userText =
        author === 'rooivalk'
          ? prompt
          : `[Discord message from ${author}]\n${prompt}`;

      const inputContent: OpenAI.Responses.ResponseInputContent[] = [
        {
          type: 'input_text',
          text: userText,
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

      const responseInput: OpenAI.Responses.ResponseInput = [
        {
          role: 'user',
          content: inputContent,
        },
      ];

      this.logPromptMetrics({
        instructionsLength: instructions.length,
        hasPreviousResponseId: !!previousResponseId,
        attachmentsCount: attachments?.length ?? 0,
        promptLength: prompt.length,
      });

      const tools = toolExecutor
        ? [...FUNCTION_TOOLS, ...this._tools]
        : this._tools;

      const chatModel = this.requireChatModel();

      let contextLost = false;
      let response: OpenAI.Responses.Response;
      try {
        response = await this._openai.responses.create({
          model: chatModel,
          tools,
          instructions,
          previous_response_id: previousResponseId ?? undefined,
          input: responseInput,
        });
      } catch (error) {
        if (previousResponseId && isMissingPreviousResponseError(error)) {
          console.warn(
            '[OpenAIService] previous_response_id no longer valid; starting fresh',
            { previousResponseId },
          );
          contextLost = true;
          response = await this._openai.responses.create({
            model: chatModel,
            tools,
            instructions,
            input: responseInput,
          });
        } else {
          throw error;
        }
      }

      // Tool execution loop: handle function_call outputs
      let createdThread: OpenAIResponse['createdThread'];
      const generatedImages: string[] = [];

      if (toolExecutor) {
        for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
          const functionCalls = response.output.filter(
            (item) => item.type === 'function_call',
          );

          if (functionCalls.length === 0) break;

          // Preflight the batch: if any requested tool is gated for this
          // caller, refuse the whole turn before running any (possibly
          // side-effecting) tool. The denial reply omits responseId on purpose
          // — this response still has an unanswered function_call, so chaining a
          // follow-up onto it would be rejected by the API.
          for (const call of functionCalls) {
            if (call.type !== 'function_call') continue;
            const denied = toolExecutor.deniedMessage(call.name);
            if (denied) {
              return {
                type: 'text',
                content: denied,
                base64Images: [],
                createdThread,
                contextLost,
              };
            }
          }

          const toolOutputs: OpenAI.Responses.ResponseInputItem[] = [];

          for (const call of functionCalls) {
            if (call.type !== 'function_call') continue;

            const args = JSON.parse(call.arguments) as Record<string, unknown>;
            const result = await toolExecutor(call.name, args);

            if (result.createdThread) {
              createdThread = result.createdThread;
            }
            if (result.base64Image) {
              generatedImages.push(result.base64Image);
            }

            toolOutputs.push({
              type: 'function_call_output',
              call_id: call.call_id,
              output: result.output,
            });
          }

          const isFinalIteration = i === MAX_TOOL_ITERATIONS - 1;
          response = await this._openai.responses.create({
            model: chatModel,
            tools: isFinalIteration ? [] : tools,
            instructions,
            previous_response_id: response.id,
            input: toolOutputs,
          });
        }
      }

      const hasImage = generatedImages.length > 0;
      const content = stripCitationMarkers(response.output_text);

      if (!content.trim() && !hasImage) {
        console.warn('[OpenAIService] model returned empty output_text', {
          output_types: response.output.map((o) => o.type),
        });
      }

      if (hasImage) {
        return {
          type: 'image_generation_call',
          content,
          base64Images: generatedImages,
          createdThread,
          responseId: response.id,
          contextLost,
        };
      }

      return {
        type: 'text',
        content,
        base64Images: [],
        createdThread,
        responseId: response.id,
        contextLost,
      };
    } catch (error) {
      console.error('Error with OpenAI:', error);
      if (error instanceof OpenAI.OpenAIError) {
        throw new Error(error.message);
      }

      throw new Error('Error creating chat completion');
    }
  }

  private logPromptMetrics(metrics: {
    instructionsLength: number;
    hasPreviousResponseId: boolean;
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
        model: this.requireChatModel(),
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

  /**
   * Ask the model to invent a fresh, vivid image-generation prompt for a city.
   * Returns null on any failure so callers can fall back to a stored prompt.
   */
  async generateMotdImagePrompt(location: string): Promise<string | null> {
    return generateMotdImagePrompt(
      this._openai,
      this.requireChatModel(),
      location,
    );
  }
}

export default OpenAIService;
