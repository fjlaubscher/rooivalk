import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import GeminiClient from './index'; // Assuming default export
import { GEMINI_CONTEXT_GEMINIBOT, GEMINI_CONTEXT_GEMINIBOT_LEARN } from './constants';

describe('GeminiClient', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    vi.resetModules(); // Clear module cache to allow different env variables for each test
    process.env = { ...OLD_ENV }; // Make a copy
    process.env.GEMINI_API_KEY = 'test-api-key';
    process.env.GEMINI_MODEL = 'test-env-model';
  });

  afterEach(() => {
    process.env = OLD_ENV; // Restore old environment
    vi.restoreAllMocks();
  });

  it('should instantiate correctly with API key and default model from env', () => {
    const client = new GeminiClient();
    expect(client).toBeInstanceOf(GeminiClient);
    // @ts-expect-error _model is private
    expect(client._model).toBe('test-env-model');
  });

  it('should instantiate with a passed model, overriding env model', () => {
    const client = new GeminiClient('custom-model');
    expect(client).toBeInstanceOf(GeminiClient);
    // @ts-expect-error _model is private
    expect(client._model).toBe('custom-model');
  });

  it('should log a warning if GEMINI_API_KEY is not set', () => {
    delete process.env.GEMINI_API_KEY;
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    new GeminiClient();
    expect(consoleWarnSpy).toHaveBeenCalledWith('GEMINI_API_KEY environment variable is not set.');
    consoleWarnSpy.mockRestore();
  });

  describe('getContext', () => {
    let client: GeminiClient;
    beforeEach(() => {
      client = new GeminiClient();
    });

    it('should return GEMINI_CONTEXT_GEMINIBOT for "geminibot" persona', () => {
      // @ts-expect-error getContext is private
      expect(client.getContext('geminibot')).toBe(GEMINI_CONTEXT_GEMINIBOT);
    });
    
    it('should return GEMINI_CONTEXT_GEMINIBOT for "GEMINIBOT" persona (case-insensitive)', () => {
      // @ts-expect-error getContext is private
      expect(client.getContext('GEMINIBOT')).toBe(GEMINI_CONTEXT_GEMINIBOT);
    });

    it('should return GEMINI_CONTEXT_GEMINIBOT_LEARN for "geminibot-learn" persona', () => {
      // @ts-expect-error getContext is private
      expect(client.getContext('geminibot-learn')).toBe(GEMINI_CONTEXT_GEMINIBOT_LEARN);
    });
    
    it('should return GEMINI_CONTEXT_GEMINIBOT_LEARN for "GEMINIBOT-LEARN" persona (case-insensitive)', () => {
      // @ts-expect-error getContext is private
      expect(client.getContext('GEMINIBOT-LEARN')).toBe(GEMINI_CONTEXT_GEMINIBOT_LEARN);
    });

    it('should return GEMINI_CONTEXT_GEMINIBOT and log a warning for an unknown persona', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // @ts-expect-error getContext is private
      expect(client.getContext('unknown-persona')).toBe(GEMINI_CONTEXT_GEMINIBOT);
      expect(consoleWarnSpy).toHaveBeenCalledWith('Unknown persona: unknown-persona. Defaulting to geminibot context.');
      consoleWarnSpy.mockRestore();
    });
  });

  describe('createResponse', () => {
    let client: GeminiClient;
    beforeEach(() => {
      client = new GeminiClient('test-model-from-response');
    });

    it('should return a placeholder string including persona, model, and prompt', async () => {
      const persona = 'geminibot';
      const prompt = 'Hello Gemini!';
      const response = await client.createResponse(persona, prompt);
      expect(response).toBe(`Gemini response for persona "${persona}" (model: test-model-from-response) and prompt "${prompt}"`);
    });

    it('should call getContext with the correct persona', async () => {
      const persona = 'geminibot-learn';
      const prompt = 'Teach me something.';
      // @ts-expect-error getContext is private, but we need to spy on it
      const getContextSpy = vi.spyOn(client, 'getContext');
      await client.createResponse(persona, prompt);
      expect(getContextSpy).toHaveBeenCalledWith(persona);
      getContextSpy.mockRestore();
    });

    it('should throw an error if the underlying (mocked) API call fails', async () => {
        // For now, the placeholder doesn't actually throw.
        // This test would be more relevant once actual API calls are implemented.
        // We can simulate an error by making getContext throw, for example.
        const persona = 'geminibot';
        const prompt = 'Test error';
        // @ts-expect-error getContext is private
        vi.spyOn(client, 'getContext').mockImplementationOnce(() => {
          throw new Error('Simulated API error');
        });
        
        await expect(client.createResponse(persona, prompt)).rejects.toThrow('Simulated API error');
    });
  });
});
