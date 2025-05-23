export interface LLMClient {
  createResponse(persona: string, prompt: string): Promise<string | null>;
}
