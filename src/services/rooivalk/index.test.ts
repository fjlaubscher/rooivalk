import {
  vi,
  describe,
  beforeEach,
  afterEach,
  it,
  expect,
  beforeAll,
  afterAll,
} from 'vitest';
import { silenceConsole } from '@/test-utils/consoleMocks';

let restoreConsole: () => void;

beforeAll(() => {
  restoreConsole = silenceConsole({
    ignoreErrors: ['OpenAI error!', 'Startup channel ID not set', 'blocked'],
    ignoreLogs: ['🤖 Logged in as', 'Successfully registered slash commands.'],
  });
});

afterAll(() => {
  restoreConsole();
});

import type { DiscordMessage } from '@/services/discord';
import type { ChatInputCommandInteraction, ThreadChannel } from 'discord.js';
import { createMockMessage } from '@/test-utils/createMockMessage';
import { MOCK_CONFIG, MOCK_ENV } from '@/test-utils/mock';

import Rooivalk from '.';

// Create mock instances using vi.mocked
const mockDiscordService = vi.mocked({
  mentionRegex: new RegExp(`<@test-bot-id>`, 'g'),
  client: {
    user: { id: 'test-bot-id', tag: 'TestBot#0000' },
    channels: { fetch: vi.fn() },
  },
  allowedEmojis: [],
  startupChannelId: 'test-startup-channel-id',
  getReferencedMessage: vi.fn(),
  getOriginalMessage: vi.fn(),
  getMessageChain: vi.fn(),
  buildMessageReply: vi.fn().mockResolvedValue({}),
  buildImageReply: vi.fn().mockReturnValue({ embeds: [], files: [] }),
  chunkContent: vi.fn(),
  getRooivalkResponse: vi.fn().mockReturnValue('Error!'),
  fetchScheduledEventsBetween: vi.fn(),
  buildPromptFromMessageChain: vi.fn(),
  buildPromptFromMessageThread: vi.fn(),
  registerSlashCommands: vi.fn(),
  sendReadyMessage: vi.fn(),
  setupMentionRegex: vi.fn(),
  cacheGuildEmojis: vi.fn(), // Add mock for cacheGuildEmojis
  on: vi.fn(),
  once: vi.fn(),
  login: vi.fn(),
} as any);

const mockOpenAIClient = vi.mocked({
  createResponse: vi.fn(),
  createImage: vi.fn(),
  generateThreadName: vi.fn(),
} as any);

const BOT_ID = 'test-bot-id';

describe('Rooivalk', () => {
  let rooivalk: Rooivalk;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('process', { env: { ...MOCK_ENV } });

    mockOpenAIClient.createResponse.mockResolvedValue('Mocked AI Response');
    mockOpenAIClient.createImage.mockReset();
    mockOpenAIClient.generateThreadName.mockResolvedValue('Thread Title');
    mockDiscordService.mentionRegex = new RegExp(`<@${BOT_ID}>`, 'g');

    Object.defineProperty(mockDiscordService, 'client', {
      get: () => ({
        user: { id: BOT_ID, tag: 'TestBot#0000' },
        channels: { fetch: vi.fn() },
      }),
      configurable: true,
    });

    rooivalk = new Rooivalk(MOCK_CONFIG, mockDiscordService, mockOpenAIClient);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('when processing a message', () => {
    describe('and buildPromptFromMessageChain returns history', () => {
      it('should pass history to OpenAI if available', async () => {
        const userMessage = createMockMessage({
          content: `<@${BOT_ID}> Hi!`,
        } as Partial<DiscordMessage>);
        mockDiscordService.buildPromptFromMessageChain.mockResolvedValue(
          'User: Hi!\nRooivalk: Hello!'
        );
        await (rooivalk as any).processMessage(userMessage);
        expect(
          mockDiscordService.buildPromptFromMessageChain
        ).toHaveBeenCalledWith(userMessage);

        expect(mockOpenAIClient.createResponse).toHaveBeenCalledWith(
          'rooivalk',
          'Hi!',
          [],
          'User: Hi!\nRooivalk: Hello!',
          null
        );
      });
    });

    describe('Rooivalk private shouldProcessMessage', () => {
      it('returns true for whitelisted bot', () => {
        const allowedBotId = 'allowed-bot-id';
        // Set up environment with allowed bot ID
        vi.stubGlobal('process', {
          env: { ...MOCK_ENV, DISCORD_ALLOWED_APPS: allowedBotId },
        });

        // Create new instance with updated environment
        const testRooivalk = new Rooivalk(
          MOCK_CONFIG,
          mockDiscordService,
          mockOpenAIClient
        );

        const msg = Object.assign(createMockMessage(), {
          author: { id: allowedBotId, bot: true } as any,
          guild: { id: 'guild-id' } as any,
        });
        // @ts-expect-error: testing private method
        expect(testRooivalk.shouldProcessMessage(msg, 'guild-id')).toBe(true);
      });

      it('returns false for non-whitelisted bot', () => {
        const msg = Object.assign(createMockMessage(), {
          author: { id: 'not-allowed-bot-id', bot: true } as any,
          guild: { id: 'guild-id' } as any,
        });
        // @ts-expect-error: testing private method
        expect(rooivalk.shouldProcessMessage(msg, 'guild-id')).toBe(false);
      });

      it('returns false for wrong guild', () => {
        const allowedBotId = 'allowed-bot-id';
        // Set up environment with allowed bot ID
        vi.stubGlobal('process', {
          env: { ...MOCK_ENV, DISCORD_ALLOWED_APPS: allowedBotId },
        });

        // Create new instance with updated environment
        const testRooivalk = new Rooivalk(
          MOCK_CONFIG,
          mockDiscordService,
          mockOpenAIClient
        );

        const msg = Object.assign(createMockMessage(), {
          author: { id: allowedBotId, bot: true } as any,
          guild: { id: 'other-guild' } as any,
        });
        // @ts-expect-error: testing private method
        expect(testRooivalk.shouldProcessMessage(msg, 'guild-id')).toBe(false);
      });

      it('returns true for a user (not a bot)', () => {
        const msg = Object.assign(createMockMessage(), {
          author: { id: 'user-id', bot: false } as any,
          guild: { id: 'guild-id' } as any,
        });
        // @ts-expect-error: testing private method
        expect(rooivalk.shouldProcessMessage(msg, 'guild-id')).toBe(true);
      });
    });

    describe('and buildPromptFromMessageChain returns null', () => {
      it('should use message content if no history is available', async () => {
        const userMessage = createMockMessage({
          content: `<@${BOT_ID}> Hello bot!`,
        } as Partial<DiscordMessage>);
        mockDiscordService.buildPromptFromMessageChain.mockResolvedValue(null);
        await (rooivalk as any).processMessage(userMessage);

        expect(mockOpenAIClient.createResponse).toHaveBeenCalledWith(
          'rooivalk',
          'Hello bot!',
          [],
          null,
          null
        );
      });
    });

    describe('and OpenAI returns null', () => {
      it('should reply with error message if OpenAI response is null', async () => {
        const userMessage = createMockMessage({
          content: `<@${BOT_ID}> Fail!`,
        } as Partial<DiscordMessage>);
        mockDiscordService.buildPromptFromMessageChain.mockResolvedValue(null);
        mockOpenAIClient.createResponse.mockResolvedValue(null);
        await (rooivalk as any).processMessage(userMessage);
        expect(userMessage.reply).toHaveBeenCalledWith('Error!');
      });
    });

    describe('and OpenAI throws an error', () => {
      it('should reply with error message and error details if OpenAI throws', async () => {
        const userMessage = createMockMessage({
          content: `<@${BOT_ID}> Fail!`,
        } as Partial<DiscordMessage>);
        mockDiscordService.buildPromptFromMessageChain.mockResolvedValue(null);
        mockOpenAIClient.createResponse.mockRejectedValue(
          new Error('OpenAI error!')
        );
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
        mockOpenAIClient.createResponse.mockResolvedValue('Startup response');
        const mockChannel = { isTextBased: () => true, send: vi.fn() };
        // Patch the client getter to return a channels.fetch mock for this test
        Object.defineProperty(mockDiscordService, 'client', {
          get: () => ({
            user: { id: BOT_ID, tag: 'TestBot#0000' },
            channels: { fetch: vi.fn().mockResolvedValue(mockChannel) },
          }),
          configurable: true,
        });
        // Ensure buildMessageReply returns a valid message object
        mockDiscordService.buildMessageReply.mockResolvedValue({
          content: 'test',
        });
        await rooivalk.sendMessageToStartupChannel('Hello startup!');
        expect(mockChannel.send).toHaveBeenCalled();
      });
    });

    describe('and the startup channel is not set', () => {
      it('should return null and log error if startup channel is not set', async () => {
        Object.defineProperty(mockDiscordService, 'startupChannelId', {
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
        mockOpenAIClient.createResponse.mockResolvedValue('Startup response');
        const mockChannel = { isTextBased: () => false, send: vi.fn() };
        Object.defineProperty(mockDiscordService, 'client', {
          get: () => ({
            user: { id: BOT_ID, tag: 'TestBot#0000' },
            channels: { fetch: vi.fn().mockResolvedValue(mockChannel) },
          }),
          configurable: true,
        });
        const result =
          await rooivalk.sendMessageToStartupChannel('Hello startup!');
        expect(result).toBeNull();
      });
    });
  });

  describe('when handling an image command', () => {
    it('should send image when OpenAI returns data', async () => {
      const interaction = {
        options: { getString: vi.fn().mockReturnValue('cat') },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction;

      mockOpenAIClient.createImage.mockResolvedValue('img');
      mockDiscordService.buildImageReply.mockReturnValue({
        embeds: ['e'],
        files: ['f'],
      });

      await (rooivalk as any).handleImageCommand(interaction);
      expect(interaction.editReply).toHaveBeenCalledWith({
        embeds: ['e'],
        files: ['f'],
      });
    });

    it('should reply with error details if OpenAI throws', async () => {
      const interaction = {
        options: { getString: vi.fn().mockReturnValue('dog') },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction;

      mockOpenAIClient.createImage.mockRejectedValue(new Error('blocked'));

      await (rooivalk as any).handleImageCommand(interaction);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('blocked') })
      );
    });

    it('should reply with error message if OpenAI returns null', async () => {
      const interaction = {
        options: { getString: vi.fn().mockReturnValue('bird') },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction;

      mockOpenAIClient.createImage.mockResolvedValue(null);

      await (rooivalk as any).handleImageCommand(interaction);
      expect(interaction.editReply).toHaveBeenCalledWith({ content: 'Error!' });
    });
  });

  describe('when handling a thread command', () => {
    it('should chunk long responses', async () => {
      const interaction = {
        options: { getString: vi.fn().mockReturnValue('prompt') },
        deferReply: vi.fn(),
        editReply: vi.fn(),
        channel: {
          threads: { create: vi.fn() },
        },
        user: {
          username: 'alice',
          toString: () => '<@123>',
        },
      } as unknown as ChatInputCommandInteraction;

      const mockThread = { send: vi.fn(), url: 'thread-url' } as any;
      (interaction.channel as any).threads.create.mockResolvedValue(mockThread);

      const longResponse = 'a'.repeat(4500);
      mockOpenAIClient.createResponse.mockResolvedValue(longResponse);
      mockDiscordService.chunkContent.mockReturnValue([
        'a'.repeat(2000),
        'a'.repeat(2000),
        'a'.repeat(500),
      ]);

      await (rooivalk as any).handleThreadCommand(interaction);

      expect(mockThread.send).toHaveBeenCalledTimes(4);
      expect(mockThread.send).toHaveBeenNthCalledWith(1, '>>> prompt');
      expect(interaction.deferReply).toHaveBeenCalled();

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: '<@123> created a thread.\n>>> prompt',
      });
    });
  });

  describe('when initialized', () => {
    it('should set up event handlers and call login', async () => {
      // Patch the once method to immediately call the callback for ClientReady
      mockDiscordService.once.mockImplementation(
        (event: string, cb: () => void) => {
          if (event === 'ready') cb();
          return mockDiscordService;
        }
      );

      await rooivalk.init();

      expect(mockDiscordService.once).toHaveBeenCalled();
      expect(mockDiscordService.on).toHaveBeenCalled();
      expect(mockDiscordService.login).toHaveBeenCalled();
      expect(mockDiscordService.registerSlashCommands).toHaveBeenCalled();
      expect(mockDiscordService.sendReadyMessage).toHaveBeenCalled();
      expect(mockDiscordService.setupMentionRegex).toHaveBeenCalled();
    });
  });

  describe('thread handling', () => {
    describe('when message is sent in a thread', () => {
      it('should use thread history when processing messages in threads', async () => {
        const threadMessage = createMockMessage({
          content: 'Hello in thread',
          channel: {
            isThread: vi.fn().mockReturnValue(true),
            send: vi.fn(),
          } as any,
        } as Partial<DiscordMessage>);

        mockDiscordService.buildPromptFromMessageThread.mockResolvedValue(
          'thread conversation history'
        );
        mockDiscordService.buildMessageReply.mockReturnValue({
          content: 'Response',
        });

        await (rooivalk as any).processMessage(threadMessage);

        expect(
          mockDiscordService.buildPromptFromMessageThread
        ).toHaveBeenCalledWith(threadMessage);
        expect(
          mockDiscordService.buildPromptFromMessageChain
        ).not.toHaveBeenCalled();
        expect(mockOpenAIClient.createResponse).toHaveBeenCalledWith(
          'rooivalk',
          'Hello in thread',
          [],
          'thread conversation history',
          null
        );
      });

      it('should send response to thread channel', async () => {
        const threadMessage = createMockMessage({
          content: 'Hello in thread',
          channel: {
            isThread: vi.fn().mockReturnValue(true),
            send: vi.fn(),
          } as any,
        } as Partial<DiscordMessage>);

        mockDiscordService.buildPromptFromMessageThread.mockResolvedValue(null);
        mockDiscordService.buildMessageReply.mockReturnValue({
          content: 'Response',
        });

        await (rooivalk as any).processMessage(threadMessage);

        expect(threadMessage.channel.send).toHaveBeenCalled();
        expect(threadMessage.reply).not.toHaveBeenCalled();
      });
    });

    describe('when message is not in a thread', () => {
      it('should use message chain history when processing non-thread messages', async () => {
        const regularMessage = createMockMessage({
          content: 'Hello outside thread',
          channel: {
            isThread: vi.fn().mockReturnValue(false),
          } as any,
        } as Partial<DiscordMessage>);

        mockDiscordService.buildPromptFromMessageChain.mockResolvedValue(
          'message chain history'
        );
        mockDiscordService.buildMessageReply.mockReturnValue({
          content: 'Response',
        });

        await (rooivalk as any).processMessage(regularMessage);

        expect(
          mockDiscordService.buildPromptFromMessageChain
        ).toHaveBeenCalledWith(regularMessage);
        expect(
          mockDiscordService.buildPromptFromMessageThread
        ).not.toHaveBeenCalled();
        expect(mockOpenAIClient.createResponse).toHaveBeenCalledWith(
          'rooivalk',
          'Hello outside thread',
          [],
          'message chain history',
          null
        );
      });

      it('should send response as reply when not in thread', async () => {
        const regularMessage = createMockMessage({
          content: 'Hello outside thread',
          channel: {
            isThread: vi.fn().mockReturnValue(false),
            send: vi.fn(),
          } as any,
        } as Partial<DiscordMessage>);

        mockDiscordService.buildPromptFromMessageChain.mockResolvedValue(null);
        mockDiscordService.buildMessageReply.mockReturnValue({
          content: 'Response',
        });

        await (rooivalk as any).processMessage(regularMessage);

        expect(regularMessage.reply).toHaveBeenCalled();
        expect(regularMessage.channel.send).not.toHaveBeenCalled();
      });
    });

    describe('when creating a new thread from reply', () => {
      it('should send response to newly created thread instead of original channel', async () => {
        const mockThread = {
          send: vi.fn(),
          isThread: vi.fn().mockReturnValue(true),
        } as any as ThreadChannel;

        const replyMessage = createMockMessage({
          content: 'Reply to bot message',
          channel: {
            isThread: vi.fn().mockReturnValue(false),
            send: vi.fn(),
          } as any,
        } as Partial<DiscordMessage>);

        mockDiscordService.buildPromptFromMessageChain.mockResolvedValue(
          'conversation history'
        );
        mockDiscordService.buildMessageReply.mockReturnValue({
          content: 'Thread response',
        });

        // Test the processMessage method with targetChannel parameter
        await (rooivalk as any).processMessage(replyMessage, mockThread);

        // Should send to the thread, not reply to original message
        expect(mockThread.send).toHaveBeenCalledWith({
          content: 'Thread response',
        });
        expect(replyMessage.reply).not.toHaveBeenCalled();
        expect(replyMessage.channel.send).not.toHaveBeenCalled();
      });

      it('should handle errors and send to thread when targetChannel is provided', async () => {
        const mockThread = {
          send: vi.fn(),
          isThread: vi.fn().mockReturnValue(true),
        } as any as ThreadChannel;

        const replyMessage = createMockMessage({
          content: 'Reply that will cause error',
          channel: {
            isThread: vi.fn().mockReturnValue(false),
            send: vi.fn(),
          } as any,
        } as Partial<DiscordMessage>);

        mockOpenAIClient.createResponse.mockRejectedValue(
          new Error('OpenAI API error')
        );
        mockDiscordService.getRooivalkResponse.mockReturnValue(
          'Error occurred'
        );

        await (rooivalk as any).processMessage(replyMessage, mockThread);

        // Should send error to the thread, not reply to original message
        expect(mockThread.send).toHaveBeenCalledWith(
          'Error occurred\n```OpenAI API error```'
        );
        expect(replyMessage.reply).not.toHaveBeenCalled();
        expect(replyMessage.channel.send).not.toHaveBeenCalled();
      });
    });
  });
});
