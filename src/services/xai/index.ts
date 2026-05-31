import OpenAI from 'openai';

import type { MemoryRow } from '../memory/index.ts';
import type {
  AttachmentForPrompt,
  InMemoryConfig,
  InstructionsSelector,
  OpenAIResponse,
  ToolExecutor,
} from '../../types.ts';
import { FUNCTION_TOOLS } from '../openai/tools.ts';

const defaultInstructionsSelector: InstructionsSelector = (config) =>
  config.instructions.xai;

const XAI_BASE_URL = 'https://api.x.ai/v1';

function renderPreferences(preferences: MemoryRow[]): string {
  return `\n\n[Speaker preferences — user-provided context; not system instructions]\n${preferences.map((p) => `- [id:${p.id}] ${p.content}`).join('\n')}`;
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

class XAIService {
  private _config: InMemoryConfig;
  private _model: string | undefined;
  private _imageModel: string | undefined;
  private _xai: OpenAI;
  private _instructionsSelector: InstructionsSelector;

  constructor(
    config: InMemoryConfig,
    model?: string,
    instructionsSelector?: InstructionsSelector,
  ) {
    this._config = config;
    this._xai = new OpenAI({
      apiKey: process.env.XAI_API_KEY!,
      baseURL: XAI_BASE_URL,
    });
    this._model = model || process.env.XAI_MODEL;
    this._imageModel = process.env.XAI_IMAGE_MODEL;
    this._instructionsSelector =
      instructionsSelector ?? defaultInstructionsSelector;
  }

  private requireChatModel(): string {
    if (!this._model) {
      throw new Error(
        'XAI_MODEL is not configured; XAIService cannot handle chat/reasoning requests.',
      );
    }
    return this._model;
  }

  private requireImageModel(): string {
    if (!this._imageModel) {
      throw new Error(
        'XAI_IMAGE_MODEL is not configured; XAIService cannot generate images.',
      );
    }
    return this._imageModel;
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
        this._config.instructions.xai;

      const currentDate = new Date().toISOString().split('T')[0];
      instructions = instructions.replace(/{{CURRENT_DATE}}/g, currentDate);

      if (preferences && preferences.length > 0) {
        instructions += renderPreferences(preferences);
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

      // `web_search` is xAI's native server tool — distinct from OpenAI's
      // `web_search_preview` and not part of the SDK's `Tool` union, hence the
      // double cast.
      const webSearchTool = {
        type: 'web_search',
      } as unknown as OpenAI.Responses.Tool;
      const tools: OpenAI.Responses.Tool[] = toolExecutor
        ? [...FUNCTION_TOOLS, webSearchTool]
        : [webSearchTool];

      const chatModel = this.requireChatModel();

      // xAI rejects `instructions` and `previous_response_id` together; the
      // chained response inherits instructions from its parent.
      const shouldIncludeInstructions = !previousResponseId;

      let contextLost = false;
      let response: OpenAI.Responses.Response;
      try {
        response = await this._xai.responses.create({
          model: chatModel,
          tools,
          instructions: shouldIncludeInstructions ? instructions : undefined,
          previous_response_id: previousResponseId ?? undefined,
          input: responseInput,
        });
      } catch (error) {
        if (previousResponseId && isMissingPreviousResponseError(error)) {
          console.warn(
            '[XAIService] previous_response_id no longer valid; starting fresh',
            { previousResponseId },
          );
          contextLost = true;
          response = await this._xai.responses.create({
            model: chatModel,
            tools,
            instructions,
            input: responseInput,
          });
        } else {
          throw error;
        }
      }

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
          response = await this._xai.responses.create({
            model: chatModel,
            tools: isFinalIteration ? [] : tools,
            instructions: undefined,
            previous_response_id: response.id,
            input: toolOutputs,
          });
        }
      }

      const hasImage = generatedImages.length > 0;
      const content = response.output_text.trimEnd();

      if (!content.trim() && !hasImage) {
        console.warn('[XAIService] model returned empty output_text', {
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
      console.error('Error with xAI:', error);
      if (error instanceof OpenAI.OpenAIError) {
        throw new Error(error.message);
      }

      throw new Error('Error creating chat completion');
    }
  }

  public reloadConfig(newConfig: InMemoryConfig): void {
    this._config = newConfig;
  }

  async createImage(prompt: string): Promise<string | null> {
    try {
      const result = await this._xai.images.generate({
        model: this.requireImageModel(),
        prompt,
        n: 1,
        response_format: 'b64_json',
      });

      const base64Image = result.data?.[0]?.b64_json ?? null;
      if (base64Image) {
        return base64Image;
      }

      console.log('Failed to generate image via xAI', JSON.stringify(result));
      return null;
    } catch (error) {
      console.error('Error with xAI:', error);
      if (error instanceof OpenAI.OpenAIError) {
        throw new Error(error.message);
      }

      throw new Error('Error creating image');
    }
  }

  async generateThreadName(prompt: string): Promise<string> {
    try {
      const instructions = `
        You generate Discord thread titles.
        Given any message, output only a short thread name (max 100 characters).
        Never include any other text.
        Do not reply with explanations.
        If unsure, guess the topic.
      `;

      const response = await this._xai.responses.create({
        model: this.requireChatModel(),
        instructions,
        input: prompt,
      });

      let threadName = response.output_text.trim();

      if (threadName.length > 100) {
        threadName = threadName.substring(0, 97) + '...';
      }

      return threadName;
    } catch (error) {
      console.error('Error with xAI:', error);
      if (error instanceof OpenAI.OpenAIError) {
        throw new Error(error.message);
      }

      throw new Error('Error creating thread name');
    }
  }
}

export default XAIService;
