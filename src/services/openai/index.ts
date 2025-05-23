import OpenAI from 'openai';

import {
  ROOIVALK_CONTEXT_DEFAULT,
  ROOIVALK_CONTEXT_LEARN,
} from '../rooivalk/constants';

type Persona = 'rooivalk' | 'rooivalk-learn';

type Tool = {
  type: 'web_search_preview';
  search_context_size?: 'low' | 'medium' | 'high';
};

class OpenAIClient {
  private _model: string;
  private _openai: OpenAI;
  private _tools: Tool[];

  constructor(model?: string) {
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
  }

  private getContext(persona: Persona): string {
    switch (persona) {
      case 'rooivalk':
        return ROOIVALK_CONTEXT_DEFAULT;
      case 'rooivalk-learn':
        return ROOIVALK_CONTEXT_LEARN;
      default:
        return ROOIVALK_CONTEXT_DEFAULT;
    }
  }

  async createResponse(persona: Persona, prompt: string) {
    try {
      const response = await this._openai.responses.create({
        model: this._model,
        tools: this._tools,
        instructions: this.getContext(persona),
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
}

export default OpenAIClient;
