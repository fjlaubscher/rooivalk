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

describe('LLM Client Instantiation in src/index.ts', () => {
  const OLD_ENV = process.env;
  let OpenAIClientMock: any;
  let GeminiClientMock: any;
  let RooivalkMock: any;

  beforeEach(async () => {
    vi.resetModules(); // Important to clear module cache
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
    // These were identified as required in previous interactions with src/index.ts
    process.env.DISCORD_TOKEN = 'test-token';
    process.env.DISCORD_GUILD_ID = 'test-guild';
    process.env.DISCORD_APP_ID = 'test-app';
    process.env.OPENAI_API_KEY = 'test-openai-key'; 
    // GEMINI_API_KEY is not strictly required for instantiation if GeminiClient handles its absence,
    // but good to set if its constructor expects it for full functionality.
    // Based on GeminiClient's current constructor, it only logs a warning if it's missing.
    process.env.GEMINI_API_KEY = 'test-gemini-key';
  });

  afterEach(() => {
    process.env = OLD_ENV; // Restore old environment
    vi.restoreAllMocks(); // Restore all spies and mocks
  });

  async function loadIndexModule() {
    // This will execute the top-level code in src/index.ts
    await import('../src/index'); 
  }

  it('should instantiate OpenAIClient', async () => {
    await loadIndexModule();
    expect(OpenAIClientMock).toHaveBeenCalledTimes(1);
  });

  it('should instantiate GeminiClient', async () => {
    await loadIndexModule();
    expect(GeminiClientMock).toHaveBeenCalledTimes(1);
  });

  it('should pass the OpenAIClient instance to the Rooivalk constructor', async () => {
    await loadIndexModule();
    expect(RooivalkMock).toHaveBeenCalledTimes(1);
    expect(RooivalkMock).toHaveBeenCalledWith(mockOpenAIClientInstance, mockGeminiClientInstance);
  });
  
  it('should call rooivalk.init()', async () => {
    await loadIndexModule();
    expect(mockRooivalkInstance.init).toHaveBeenCalledTimes(1);
  });
});
