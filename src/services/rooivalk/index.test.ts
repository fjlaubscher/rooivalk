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
import { Collection, Events as DiscordEvents } from 'discord.js';
import type {
  Attachment,
  Message,
  ChatInputCommandInteraction,
  ThreadChannel,
} from 'discord.js';

import { silenceConsole } from '@/test-utils/consoleMocks';
import { createMockMessage } from '@/test-utils/createMockMessage';
import { MOCK_CONFIG, MOCK_ENV } from '@/test-utils/mock';

import { buildPromptAuthor } from './helpers';

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
  getMessageChain: vi.fn(),
  buildMessageReply: vi.fn().mockResolvedValue({}),
  buildImageReply: vi.fn().mockReturnValue({ embeds: [], files: [] }),
  chunkContent: vi.fn(),
  getRooivalkResponse: vi.fn().mockReturnValue('Error!'),
  fetchScheduledEventsBetween: vi.fn(),
  buildMessageChainFromMessage: vi.fn(),
  buildMessageChainFromThreadMessage: vi.fn(),
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
    describe('and buildMessageChainFromMessage returns history', () => {
      it('should pass history to OpenAI if available', async () => {
        const userMessage = createMockMessage({
          content: `<@${BOT_ID}> Hi!`,
        } as Partial<Message<boolean>>);
        mockDiscordService.buildMessageChainFromMessage.mockResolvedValue(
          '- User: Hi!\n- Rooivalk: Hello!',
        );
        await (rooivalk as any).processMessage(userMessage);
        expect(
          mockDiscordService.buildMessageChainFromMessage,
        ).toHaveBeenCalledWith(userMessage);

        const expectedAuthor = buildPromptAuthor(userMessage.author);
        expect(mockOpenAIClient.createResponse).toHaveBeenCalledWith(
          expectedAuthor,
          'Hi!',
          [],
          '- User: Hi!\n- Rooivalk: Hello!',
          null,
        );
      });
    });

    it('should include allowed text attachments when prompting OpenAI', async () => {
      const attachment = {
        url: 'https://cdn.discordapp.com/attachments/file.md',
        contentType: 'text/markdown',
        name: 'file.md',
      } as unknown as Attachment;

      const userMessage = createMockMessage({
        content: `<@${BOT_ID}> Please review the attached notes`,
        attachments: new Collection<string, Attachment>([['1', attachment]]),
      } as Partial<Message<boolean>>);

      mockDiscordService.buildMessageChainFromMessage.mockResolvedValue(null);

      await (rooivalk as any).processMessage(userMessage);

      const expectedAuthor = buildPromptAuthor(userMessage.author);

      expect(mockOpenAIClient.createResponse).toHaveBeenCalledWith(
        expectedAuthor,
        'Please review the attached notes',
        [],
        null,
        [
          {
            url: attachment.url,
            name: attachment.name,
            contentType: 'text/markdown',
            kind: 'file',
          },
        ],
      );
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
          mockOpenAIClient,
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
          mockOpenAIClient,
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

    describe('and buildMessageChainFromMessage returns null', () => {
      it('should use message content if no history is available', async () => {
        const userMessage = createMockMessage({
          content: `<@${BOT_ID}> Hello bot!`,
        } as Partial<Message<boolean>>);
        mockDiscordService.buildMessageChainFromMessage.mockResolvedValue(null);
        await (rooivalk as any).processMessage(userMessage);

        const expectedAuthor = buildPromptAuthor(userMessage.author);
        expect(mockOpenAIClient.createResponse).toHaveBeenCalledWith(
          expectedAuthor,
          'Hello bot!',
          [],
          null,
          null,
        );
      });
    });

    describe('and OpenAI returns null', () => {
      it('should reply with error message if OpenAI response is null', async () => {
        const userMessage = createMockMessage({
          content: `<@${BOT_ID}> Fail!`,
        } as Partial<Message<boolean>>);
        mockDiscordService.buildMessageChainFromMessage.mockResolvedValue(null);
        mockOpenAIClient.createResponse.mockResolvedValue(null);
        await (rooivalk as any).processMessage(userMessage);
        expect(userMessage.reply).toHaveBeenCalledWith('Error!');
      });
    });

    describe('and OpenAI throws an error', () => {
      it('should reply with error message and error details if OpenAI throws', async () => {
        const userMessage = createMockMessage({
          content: `<@${BOT_ID}> Fail!`,
        } as Partial<Message<boolean>>);
        mockDiscordService.buildMessageChainFromMessage.mockResolvedValue(null);
        mockOpenAIClient.createResponse.mockRejectedValue(
          new Error('OpenAI error!'),
        );
        await (rooivalk as any).processMessage(userMessage);
        expect(userMessage.reply).toHaveBeenCalledWith(
          expect.stringContaining('OpenAI error!'),
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
        await rooivalk.sendMessageToChannel(
          'startup-channel-id',
          'Hello startup!',
        );
        expect(mockChannel.send).toHaveBeenCalled();
      });
    });

    describe('and the startup channel is not set', () => {
      it('should return null and log error if startup channel is not set', async () => {
        Object.defineProperty(mockDiscordService, 'startupChannelId', {
          get: () => undefined,
          configurable: true,
        });
        const result = await rooivalk.sendMessageToChannel(
          'startup-channel-id',
          'Hello startup!',
        );
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
        const result = await rooivalk.sendMessageToChannel(
          'startup-channel-id',
          'Hello startup!',
        );
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
        expect.objectContaining({
          content: expect.stringContaining('blocked'),
        }),
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

  describe('when initialized', () => {
    it('should set up event handlers and call login', async () => {
      // Patch the once method to immediately call the callback for ClientReady
      mockDiscordService.once.mockImplementation(
        (event: string, cb: (client: unknown) => void) => {
          if (event === DiscordEvents.ClientReady) {
            cb(mockDiscordService.client as any);
          }
          return mockDiscordService;
        },
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
        } as Partial<Message<boolean>>);

        mockDiscordService.buildMessageChainFromThreadMessage.mockResolvedValue(
          'thread conversation history',
        );
        mockDiscordService.buildMessageReply.mockReturnValue({
          content: 'Response',
        });

        await (rooivalk as any).processMessage(threadMessage);

        expect(
          mockDiscordService.buildMessageChainFromThreadMessage,
        ).toHaveBeenCalledWith(threadMessage);
        expect(
          mockDiscordService.buildMessageChainFromMessage,
        ).not.toHaveBeenCalled();

        const expectedAuthor = buildPromptAuthor(threadMessage.author);
        expect(mockOpenAIClient.createResponse).toHaveBeenCalledWith(
          expectedAuthor,
          'Hello in thread',
          [],
          'thread conversation history',
          null,
        );
      });

      it('should send response to thread channel', async () => {
        const threadMessage = createMockMessage({
          content: 'Hello in thread',
          channel: {
            isThread: vi.fn().mockReturnValue(true),
            send: vi.fn(),
          } as any,
        } as Partial<Message<boolean>>);

        mockDiscordService.buildMessageChainFromThreadMessage.mockResolvedValue(
          null,
        );
        mockDiscordService.buildMessageReply.mockReturnValue({
          content: 'Response',
        });

        await rooivalk.processMessage(threadMessage);

        expect((threadMessage.channel as any).send).toHaveBeenCalled();
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
        } as Partial<Message<boolean>>);

        mockDiscordService.buildMessageChainFromMessage.mockResolvedValue(
          'message chain history',
        );
        mockDiscordService.buildMessageReply.mockReturnValue({
          content: 'Response',
        });

        await rooivalk.processMessage(regularMessage);

        expect(
          mockDiscordService.buildMessageChainFromMessage,
        ).toHaveBeenCalledWith(regularMessage);
        expect(
          mockDiscordService.buildMessageChainFromThreadMessage,
        ).not.toHaveBeenCalled();

        const expectedAuthor = buildPromptAuthor(regularMessage.author);
        expect(mockOpenAIClient.createResponse).toHaveBeenCalledWith(
          expectedAuthor,
          'Hello outside thread',
          [],
          'message chain history',
          null,
        );
      });

      it('should send response as reply when not in thread', async () => {
        const regularMessage = createMockMessage({
          content: 'Hello outside thread',
          channel: {
            isThread: vi.fn().mockReturnValue(false),
            send: vi.fn(),
          } as any,
        } as Partial<Message<boolean>>);

        mockDiscordService.buildMessageChainFromMessage.mockResolvedValue(null);
        mockDiscordService.buildMessageReply.mockReturnValue({
          content: 'Response',
        });

        await (rooivalk as any).processMessage(regularMessage);

        expect(regularMessage.reply).toHaveBeenCalled();
        expect((regularMessage.channel as any).send).not.toHaveBeenCalled();
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
        } as Partial<Message<boolean>>);

        mockDiscordService.buildMessageChainFromMessage.mockResolvedValue(
          'conversation history',
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
        expect((replyMessage.channel as any).send).not.toHaveBeenCalled();
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
        } as Partial<Message<boolean>>);

        mockOpenAIClient.createResponse.mockRejectedValue(
          new Error('OpenAI API error'),
        );
        mockDiscordService.getRooivalkResponse.mockReturnValue(
          'Error occurred',
        );

        await (rooivalk as any).processMessage(replyMessage, mockThread);

        // Should send error to the thread, not reply to original message
        expect(mockThread.send).toHaveBeenCalledWith(
          'Error occurred\n```OpenAI API error```',
        );
        expect(replyMessage.reply).not.toHaveBeenCalled();
        expect((replyMessage.channel as any).send).not.toHaveBeenCalled();
      });
    });

    describe('when creating a thread from a reply', () => {
      it('should store initial context when history is available', async () => {
        const mockHistory =
          '- user: Original question\n- rooivalk: Previous response';
        const mockThread = {
          id: 'new-thread-123',
          members: { add: vi.fn() },
        } as any as ThreadChannel;

        const replyMessage = createMockMessage({
          content: 'Follow-up question',
          author: { id: 'user-123', displayName: 'TestUser' },
          startThread: vi.fn().mockResolvedValue(mockThread),
        } as unknown as Partial<Message<boolean>>);

        mockDiscordService.buildMessageChainFromMessage.mockResolvedValue(
          mockHistory,
        );
        mockOpenAIClient.generateThreadName.mockResolvedValue(
          'Discussion Thread',
        );

        const result = await rooivalk.createRooivalkThread(replyMessage);

        expect(result).toBe(mockThread);
        expect(mockOpenAIClient.generateThreadName).toHaveBeenCalledWith(
          mockHistory,
        );
        expect(replyMessage.startThread).toHaveBeenCalledWith({
          name: 'Discussion Thread',
          autoArchiveDuration: 60,
        });
        expect(mockThread.members.add).toHaveBeenCalledWith('user-123');
      });

      it('should store current message as initial context when no history is available', async () => {
        const mockThread = {
          id: 'new-thread-456',
          members: { add: vi.fn() },
        } as any as ThreadChannel;

        const replyMessage = createMockMessage({
          content: 'First message',
          author: { id: 'user-456', displayName: 'TestUser' },
          startThread: vi.fn().mockResolvedValue(mockThread),
        } as unknown as Partial<Message<boolean>>);

        mockDiscordService.buildMessageChainFromMessage.mockResolvedValue(null);
        mockOpenAIClient.generateThreadName.mockResolvedValue('New Discussion');

        const result = await rooivalk.createRooivalkThread(replyMessage);

        expect(result).toBe(mockThread);
        expect(mockOpenAIClient.generateThreadName).toHaveBeenCalledWith(
          'First message',
        );
      });

      it('should handle thread creation failure gracefully', async () => {
        const replyMessage = createMockMessage({
          content: 'Message',
          author: { id: 'user-789' },
          startThread: vi
            .fn()
            .mockRejectedValue(new Error('Thread creation failed')),
        } as unknown as Partial<Message<boolean>>);

        mockDiscordService.buildMessageChainFromMessage.mockResolvedValue(
          'some history',
        );
        mockOpenAIClient.generateThreadName.mockResolvedValue('Thread Name');

        await expect(
          rooivalk.createRooivalkThread(replyMessage),
        ).rejects.toThrow('Thread creation failed');
      });

      it('should use message content for thread name when history is null', async () => {
        const mockThread = {
          id: 'new-thread-789',
          members: { add: vi.fn() },
        } as any as ThreadChannel;

        const replyMessage = createMockMessage({
          content: 'Question about something',
          author: { id: 'user-789' },
          startThread: vi.fn().mockResolvedValue(mockThread),
        } as unknown as Partial<Message<boolean>>);

        mockDiscordService.buildMessageChainFromMessage.mockResolvedValue(null);
        mockOpenAIClient.generateThreadName.mockResolvedValue(
          'Generated Thread Name',
        );

        const result = await rooivalk.createRooivalkThread(replyMessage);

        expect(result).toBe(mockThread);
        expect(mockOpenAIClient.generateThreadName).toHaveBeenCalledWith(
          'Question about something',
        );
      });
    });
  });
});
