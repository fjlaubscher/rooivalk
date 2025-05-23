import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock clients and Rooivalk service
const mockOpenAIClientInstance = { createResponse: vi.fn() };
const mockGeminiClientInstance = { createResponse: vi.fn() };
const mockRooivalkInstance = { init: vi.fn() };

vi.mock('@/services/openai', () => ({
  default: vi.fn(() => mockOpenAIClientInstance),
}));
vi.mock('@/services/gemini', () => ({
  default: vi.fn(() => mockGeminiClientInstance),
}));
vi.mock('@/services/rooivalk', () => ({
  default: vi.fn(() => mockRooivalkInstance),
}));
vi.mock('@/cron', () => ({
  default: vi.fn(), // Mock initCronTasks
}));


describe('LLM Client Selection in src/index.ts', () => {
  const OLD_ENV = process.env;
  let OpenAIClientMock: any;
  let GeminiClientMock: any;
  let RooivalkMock: any;
  let consoleWarnSpy: any;

  beforeEach(async () => {
    vi.resetModules(); // Important to clear module cache for different env variables
    process.env = { ...OLD_ENV }; // Make a copy

    // Ensure mocks are reset before each test run
    vi.clearAllMocks();

    // Dynamically import mocks to get the latest mock constructor instances
    const openAIMockModule = await import('@/services/openai');
    OpenAIClientMock = openAIMockModule.default;
    const geminiMockModule = await import('@/services/gemini');
    GeminiClientMock = geminiMockModule.default;
    const rooivalkMockModule = await import('@/services/rooivalk');
    RooivalkMock = rooivalkMockModule.default;
    
    // Set required environment variables that are checked at the start of index.ts
    process.env.DISCORD_TOKEN = 'test-token';
    process.env.DISCORD_GUILD_ID = 'test-guild';
    process.env.DISCORD_APP_ID = 'test-app';
    process.env.OPENAI_API_KEY = 'test-openai-key'; // Needed for OpenAIClient default path

    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = OLD_ENV; // Restore old environment
    vi.restoreAllMocks(); // Restore all spies and mocks
  });

  async function loadIndexModule() {
    // This will execute the top-level code in src/index.ts
    await import('../src/index'); 
  }

  it('should instantiate OpenAIClient when LLM_CLIENT_PREFERENCE is "openai"', async () => {
    process.env.LLM_CLIENT_PREFERENCE = 'openai';
    await loadIndexModule();
    expect(OpenAIClientMock).toHaveBeenCalledTimes(1);
    expect(GeminiClientMock).not.toHaveBeenCalled();
    expect(RooivalkMock).toHaveBeenCalledWith(mockOpenAIClientInstance);
  });

  it('should instantiate OpenAIClient when LLM_CLIENT_PREFERENCE is undefined', async () => {
    delete process.env.LLM_CLIENT_PREFERENCE;
    await loadIndexModule();
    expect(OpenAIClientMock).toHaveBeenCalledTimes(1);
    expect(GeminiClientMock).not.toHaveBeenCalled();
    expect(RooivalkMock).toHaveBeenCalledWith(mockOpenAIClientInstance);
  });

  it('should instantiate OpenAIClient and log a warning when LLM_CLIENT_PREFERENCE is invalid', async () => {
    process.env.LLM_CLIENT_PREFERENCE = 'someotherclient';
    await loadIndexModule();
    expect(OpenAIClientMock).toHaveBeenCalledTimes(1);
    expect(GeminiClientMock).not.toHaveBeenCalled();
    expect(RooivalkMock).toHaveBeenCalledWith(mockOpenAIClientInstance);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Invalid LLM_CLIENT_PREFERENCE "someotherclient". Defaulting to OpenAIClient.'
    );
  });

  it('should instantiate GeminiClient when LLM_CLIENT_PREFERENCE is "gemini"', async () => {
    process.env.LLM_CLIENT_PREFERENCE = 'gemini';
    process.env.GEMINI_API_KEY = 'test-gemini-key'; // Required for GeminiClient
    await loadIndexModule();
    expect(GeminiClientMock).toHaveBeenCalledTimes(1);
    expect(OpenAIClientMock).not.toHaveBeenCalled();
    expect(RooivalkMock).toHaveBeenCalledWith(mockGeminiClientInstance);
  });
  
  it('should instantiate GeminiClient when LLM_CLIENT_PREFERENCE is "GEMINI" (case-insensitive)', async () => {
    process.env.LLM_CLIENT_PREFERENCE = 'GEMINI';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    await loadIndexModule();
    expect(GeminiClientMock).toHaveBeenCalledTimes(1);
    expect(OpenAIClientMock).not.toHaveBeenCalled();
    expect(RooivalkMock).toHaveBeenCalledWith(mockGeminiClientInstance);
  });
});
