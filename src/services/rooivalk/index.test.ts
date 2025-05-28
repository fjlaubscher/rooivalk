import { vi, describe, beforeEach, afterEach, it, expect } from 'vitest';
import type { MockInstance } from 'vitest';

import { DiscordService } from '@/services/discord';
import type { DiscordMessage } from '@/services/discord';
import OpenAIClient from '@/services/openai';
import { createMockMessage } from '@/test-utils/createMockMessage';
import { MOCK_CONFIG, MOCK_ENV } from '@/test-utils/mock';

import Rooivalk from '.';

const BOT_ID = 'test-bot-id';

const mockDiscordServiceInstance = (() => {
  let _mentionRegex = new RegExp(`<@${BOT_ID}>`, 'g');
  let _client = { user: { id: BOT_ID, tag: 'TestBot#0000' } };
  let _startupChannelId = 'test-startup-channel-id';
  return {
    get mentionRegex() {
      return _mentionRegex;
    },
    set mentionRegex(val) {
      _mentionRegex = val;
    },
    get client() {
      return _client;
    },
    set client(val) {
      _client = val;
    },
    get startupChannelId() {
      return _startupChannelId;
    },
    set startupChannelId(val) {
      _startupChannelId = val;
    },
    getOriginalMessage: vi.fn(),
    getMessageChain: vi.fn(),
    buildMessageReply: vi.fn().mockResolvedValue({}),
    getRooivalkResponse: vi.fn().mockReturnValue('Error!'),
    buildPromptFromMessageChain: vi.fn(),
    registerSlashCommands: vi.fn(),
    sendReadyMessage: vi.fn(),
    setupMentionRegex: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    login: vi.fn(),
  } as unknown as DiscordService;
})();

const mockOpenAIClientInstance = {
  createResponse: vi.fn(),
} as unknown as OpenAIClient;

describe('Rooivalk', () => {
  let rooivalk: Rooivalk;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('process', { env: { ...MOCK_ENV } });

    mockOpenAIClientInstance.createResponse = vi
      .fn()
      .mockResolvedValue('Mocked AI Response');
    mockDiscordServiceInstance.mentionRegex = new RegExp(`<@${BOT_ID}>`, 'g');

    Object.defineProperty(mockDiscordServiceInstance, 'client', {
      get: () => ({
        user: { id: BOT_ID, tag: 'TestBot#0000' },
        channels: { fetch: vi.fn() },
      }),
      configurable: true,
    });

    rooivalk = new Rooivalk(
      MOCK_CONFIG,
      mockDiscordServiceInstance,
      mockOpenAIClientInstance
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('when processing a message', () => {
    describe('and buildPromptFromMessageChain returns a prompt', () => {
      it('should use buildPromptFromMessageChain if available', async () => {
        const userMessage = createMockMessage({
          content: `<@${BOT_ID}> Hi!`,
        } as Partial<DiscordMessage>);
        (
          mockDiscordServiceInstance.buildPromptFromMessageChain as unknown as MockInstance
        ).mockResolvedValue('User: Hi!\nRooivalk: Hello!');
        await (rooivalk as any).processMessage(userMessage);
        expect(
          mockDiscordServiceInstance.buildPromptFromMessageChain
        ).toHaveBeenCalledWith(userMessage);
        expect(mockOpenAIClientInstance.createResponse).toHaveBeenCalledWith(
          'rooivalk',
          'User: Hi!\nRooivalk: Hello!'
        );
      });
    });

    describe('and buildPromptFromMessageChain returns null', () => {
      it('should use message content if buildPromptFromMessageChain returns null', async () => {
        const userMessage = createMockMessage({
          content: `<@${BOT_ID}> Hello bot!`,
        } as Partial<DiscordMessage>);
        (
          mockDiscordServiceInstance.buildPromptFromMessageChain as unknown as MockInstance
        ).mockResolvedValue(null);
        await (rooivalk as any).processMessage(userMessage);
        expect(mockOpenAIClientInstance.createResponse).toHaveBeenCalledWith(
          'rooivalk',
          'Hello bot!'
        );
      });
    });

    describe('and message is in the learn channel', () => {
      it('should use "learn" persona in learn channel', async () => {
        const userMessage = createMockMessage({
          content: `<@${BOT_ID}> Teach me!`,
          channel: {
            id: MOCK_ENV.DISCORD_LEARN_CHANNEL_ID,
            messages: { fetch: vi.fn() },
            send: vi.fn(),
          },
        } as unknown as Partial<DiscordMessage>);
        (
          mockDiscordServiceInstance.buildPromptFromMessageChain as unknown as MockInstance
        ).mockResolvedValue(null);
        await (rooivalk as any).processMessage(userMessage);
        expect(mockOpenAIClientInstance.createResponse).toHaveBeenCalledWith(
          'learn',
          'Teach me!'
        );
      });
    });

    describe('and OpenAI returns null', () => {
      it('should reply with error message if OpenAI response is null', async () => {
        const userMessage = createMockMessage({
          content: `<@${BOT_ID}> Fail!`,
        } as Partial<DiscordMessage>);
        (
          mockDiscordServiceInstance.buildPromptFromMessageChain as unknown as MockInstance
        ).mockResolvedValue(null);
        (
          mockOpenAIClientInstance.createResponse as unknown as MockInstance
        ).mockResolvedValue(null);
        await (rooivalk as any).processMessage(userMessage);
        expect(userMessage.reply).toHaveBeenCalledWith('Error!');
      });
    });

    describe('and OpenAI throws an error', () => {
      it('should reply with error message and error details if OpenAI throws', async () => {
        const userMessage = createMockMessage({
          content: `<@${BOT_ID}> Fail!`,
        } as Partial<DiscordMessage>);
        (
          mockDiscordServiceInstance.buildPromptFromMessageChain as unknown as MockInstance
        ).mockResolvedValue(null);
        (
          mockOpenAIClientInstance.createResponse as unknown as MockInstance
        ).mockRejectedValue(new Error('OpenAI error!'));
        await (rooivalk as any).processMessage(userMessage);
        expect(userMessage.reply).toHaveBeenCalledWith(
          expect.stringContaining('OpenAI error!')
        );
      });
    });
  });

  describe('when sending a message to the startup channel', () => {
    describe('and the channel is available and text-based', () => {
      it('should send OpenAI response to startup channel', async () => {
        (
          mockOpenAIClientInstance.createResponse as unknown as MockInstance
        ).mockResolvedValue('Startup response');
        const mockChannel = { isTextBased: () => true, send: vi.fn() };
        // Patch the client getter to return a channels.fetch mock for this test
        Object.defineProperty(mockDiscordServiceInstance, 'client', {
          get: () => ({
            user: { id: BOT_ID, tag: 'TestBot#0000' },
            channels: { fetch: vi.fn().mockResolvedValue(mockChannel) },
          }),
          configurable: true,
        });
        // Ensure buildMessageReply returns a valid message object
        (mockDiscordServiceInstance.buildMessageReply as any).mockResolvedValue(
          {
            content: 'test',
          }
        );
        await rooivalk.sendMessageToStartupChannel('Hello startup!');
        expect(mockChannel.send).toHaveBeenCalled();
      });
    });

    describe('and the startup channel is not set', () => {
      it('should return null and log error if startup channel is not set', async () => {
        Object.defineProperty(mockDiscordServiceInstance, 'startupChannelId', {
          get: () => undefined,
          configurable: true,
        });
        const result =
          await rooivalk.sendMessageToStartupChannel('Hello startup!');
        expect(result).toBeNull();
      });
    });

    describe('and the channel is not text-based', () => {
      it('should return null and log error if channel is not text-based', async () => {
        (
          mockOpenAIClientInstance.createResponse as unknown as MockInstance
        ).mockResolvedValue('Startup response');
        const mockChannel = { isTextBased: () => false, send: vi.fn() };
        mockDiscordServiceInstance.client.channels = {
          fetch: vi.fn().mockResolvedValue(mockChannel),
        } as any;
        const result =
          await rooivalk.sendMessageToStartupChannel('Hello startup!');
        expect(result).toBeNull();
      });
    });
  });

  describe('when initialized', () => {
    it('should set up event handlers and call login', async () => {
      // Patch the once method to immediately call the callback for ClientReady
      vi.spyOn(mockDiscordServiceInstance, 'once').mockImplementation(
        (event, cb) => {
          if (event === 'ready') cb();
          return mockDiscordServiceInstance;
        }
      );
      const onSpy = vi.spyOn(mockDiscordServiceInstance, 'on');
      const loginSpy = vi.spyOn(mockDiscordServiceInstance, 'login');
      const registerSlashCommandsSpy = vi.spyOn(
        mockDiscordServiceInstance,
        'registerSlashCommands'
      );
      const sendReadyMessageSpy = vi.spyOn(
        mockDiscordServiceInstance,
        'sendReadyMessage'
      );
      const setupMentionRegexSpy = vi.spyOn(
        mockDiscordServiceInstance,
        'setupMentionRegex'
      );

      await rooivalk.init();

      expect(mockDiscordServiceInstance.once).toHaveBeenCalled();
      expect(onSpy).toHaveBeenCalled();
      expect(loginSpy).toHaveBeenCalled();
      expect(registerSlashCommandsSpy).toHaveBeenCalled();
      expect(sendReadyMessageSpy).toHaveBeenCalled();
      expect(setupMentionRegexSpy).toHaveBeenCalled();
    });
  });
});
