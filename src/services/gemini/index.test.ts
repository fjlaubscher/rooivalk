import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import GeminiClient from './index'; // Assuming default export
import { ROOIVALK_CONTEXT_DEFAULT, ROOIVALK_CONTEXT_LEARN } from '../../rooivalk/constants';

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

    it('should return ROOIVALK_CONTEXT_DEFAULT for "rooivalk" persona', () => {
      // @ts-expect-error getContext is private
      expect(client.getContext('rooivalk')).toBe(ROOIVALK_CONTEXT_DEFAULT);
    });
    
    it('should return ROOIVALK_CONTEXT_DEFAULT for "ROOIVALK" persona (case-insensitive)', () => {
      // @ts-expect-error getContext is private
      expect(client.getContext('ROOIVALK')).toBe(ROOIVALK_CONTEXT_DEFAULT);
    });

    it('should return ROOIVALK_CONTEXT_LEARN for "rooivalk-learn" persona', () => {
      // @ts-expect-error getContext is private
      expect(client.getContext('rooivalk-learn')).toBe(ROOIVALK_CONTEXT_LEARN);
    });
    
    it('should return ROOIVALK_CONTEXT_LEARN for "ROOIVALK-LEARN" persona (case-insensitive)', () => {
      // @ts-expect-error getContext is private
      expect(client.getContext('ROOIVALK-LEARN')).toBe(ROOIVALK_CONTEXT_LEARN);
    });

    it('should return ROOIVALK_CONTEXT_DEFAULT and log a warning for an unknown persona', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // @ts-expect-error getContext is private
      expect(client.getContext('unknown-persona')).toBe(ROOIVALK_CONTEXT_DEFAULT);
      expect(consoleWarnSpy).toHaveBeenCalledWith('Unknown persona: unknown-persona. Defaulting to rooivalk context for GeminiClient.');
      consoleWarnSpy.mockRestore();
    });
  });

  describe('createResponse', () => {
    let client: GeminiClient;
    beforeEach(() => {
      client = new GeminiClient('test-model-from-response');
    });

    it('should return a placeholder string including persona, model, and prompt for "rooivalk" persona', async () => {
      const persona = 'rooivalk';
      const prompt = 'Hello Gemini!';
      const response = await client.createResponse(persona, prompt);
      expect(response).toBe(`Gemini response for persona "${persona}" (model: test-model-from-response) and prompt "${prompt}"`);
    });
    
    it('should return a placeholder string including persona, model, and prompt for "rooivalk-learn" persona', async () => {
      const persona = 'rooivalk-learn';
      const prompt = 'Teach me something!';
      const response = await client.createResponse(persona, prompt);
      expect(response).toBe(`Gemini response for persona "${persona}" (model: test-model-from-response) and prompt "${prompt}"`);
    });

    it('should call getContext with the correct "rooivalk-learn" persona', async () => {
      const persona = 'rooivalk-learn';
      const prompt = 'Teach me something.';
      // @ts-expect-error getContext is private, but we need to spy on it
      const getContextSpy = vi.spyOn(client, 'getContext');
      await client.createResponse(persona, prompt);
      expect(getContextSpy).toHaveBeenCalledWith(persona);
      getContextSpy.mockRestore();
    });

    it('should call getContext with the correct "rooivalk" persona', async () => {
      const persona = 'rooivalk';
      const prompt = 'Tell me a joke.';
      // @ts-expect-error getContext is private, but we need to spy on it
      const getContextSpy = vi.spyOn(client, 'getContext');
      await client.createResponse(persona, prompt);
      expect(getContextSpy).toHaveBeenCalledWith(persona);
      getContextSpy.mockRestore();
    });

    it('should throw an error if the underlying (mocked) API call fails', async () => {
        const persona = 'rooivalk'; 
        const prompt = 'Test error';
        // @ts-expect-error getContext is private
        vi.spyOn(client, 'getContext').mockImplementationOnce(() => {
          throw new Error('Simulated API error');
        });
        
        await expect(client.createResponse(persona, prompt)).rejects.toThrow('Simulated API error');
    });
  });
});
