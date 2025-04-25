import OpenAI from 'openai';

import {
  OPENAI_CONTEXT_ROOIVALK,
  OPENAI_CONTEXT_ROOIVALK_LEARN,
} from './constants';

type Persona = 'rooivalk' | 'rooivalk-learn';

class OpenAIClient {
  private _model: string;
  private _openai: OpenAI;

  constructor(model?: string) {
    this._openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });

    this._model = model || process.env.OPENAI_MODEL!;
  }

  private getContext(persona: Persona): string {
    switch (persona) {
      case 'rooivalk':
        return OPENAI_CONTEXT_ROOIVALK;
      case 'rooivalk-learn':
        return OPENAI_CONTEXT_ROOIVALK_LEARN;
      default:
        return OPENAI_CONTEXT_ROOIVALK;
    }
  }

  async createResponse(persona: Persona, prompt: string) {
    try {
      const response = await this._openai.responses.create({
        model: this._model,
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
