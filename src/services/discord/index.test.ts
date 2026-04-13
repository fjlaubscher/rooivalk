import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterAll,
} from 'vitest';
import type { MockInstance } from 'vitest';
import { Collection, Client as DiscordClient, TextChannel } from 'discord.js';
import type { Message } from 'discord.js';

import { createMockMessage } from '../../test-utils/createMockMessage.ts';
import { createMockThread } from '../../test-utils/createMockThread.ts';
import { MOCK_CONFIG } from '../../test-utils/mock.ts';
import type { ResponseType } from '../../types.ts';
import { silenceConsole } from '../../test-utils/consoleMocks.ts';

import DiscordService from './index.ts';

vi.mock('discord.js', async (importOriginal) => {
  const actual = await importOriginal();
  return Object.assign({}, actual, {
    REST: vi.fn().mockImplementation(function () {
      return {
        setToken: vi.fn().mockReturnValue({
          put: vi
            .fn()
            .mockResolvedValueOnce(undefined) // Simulate success
            .mockRejectedValueOnce(new Error('fail')), // Simulate error
        }),
      };
    }),
  });
});

const BOT_ID = 'test-bot-id';

let restoreConsole: () => void;

beforeAll(() => {
  restoreConsole = silenceConsole({
    ignoreErrors: [
      'Error sending ready message',
      'Error fetching referenced message',
      'Error fetching original message',
    ],
    ignoreLogs: ['Successfully registered slash commands.', '🤖 Logged in as'],
  });
});

afterAll(() => {
  restoreConsole();
});

function createMockDiscordClient() {
  return {
    user: { id: BOT_ID, tag: 'TestBot#0000' },
    channels: { fetch: vi.fn() },
    on: vi.fn(),
    once: vi.fn(),
    login: vi.fn(),
  } as unknown as DiscordClient;
}

describe('DiscordService', () => {
  let discordClient: DiscordClient;
  let service: DiscordService;

  beforeEach(() => {
    discordClient = createMockDiscordClient();
    service = new DiscordService(MOCK_CONFIG, discordClient);
    vi.clearAllMocks();
    process.env.DISCORD_STARTUP_CHANNEL_ID = 'startup-channel';
    process.env.DISCORD_TOKEN = 'token';
    process.env.DISCORD_APP_ID = 'appid';
    process.env.DISCORD_GUILD_ID = 'guildid';
  });

  describe('when initialized', () => {
    describe('getRooivalkResponse', () => {
      it('should return a greeting, error, or discordLimit response', () => {
        expect(typeof service.getRooivalkResponse('greeting')).toBe('string');
        expect(typeof service.getRooivalkResponse('error')).toBe('string');
        expect(typeof service.getRooivalkResponse('discordLimit')).toBe(
          'string',
        );
        expect(() =>
          service.getRooivalkResponse('not-a-type' as ResponseType),
        ).toThrow();
      });
    });

    describe('sendReadyMessage', () => {
      describe('when the startup channel is available', () => {
        it('should send a ready message to the startup channel', async () => {
          const mockSend = vi.fn();
          const mockChannel = {
            isTextBased: () => true,
            send: mockSend,
          } as unknown as TextChannel;
          (
            discordClient.channels.fetch as unknown as MockInstance
          ).mockResolvedValue(mockChannel);
          await service.sendReadyMessage();
          expect(mockSend).toHaveBeenCalled();
        });
      });

      describe('when the startup channel fetch fails', () => {
        it('should handle error when sending ready message', async () => {
          (
            discordClient.channels.fetch as unknown as MockInstance
          ).mockRejectedValue(new Error('fail'));
          await service.sendReadyMessage(); // Should not throw
        });
      });
    });

    describe('buildMessageReply', () => {
      it('should build a message reply with attachments', () => {
        const longContent = 'a'.repeat(2100);
        const reply = service.buildMessageReply({
          type: 'text',
          content: longContent,
          base64Images: [],
        });
        expect(reply.files).toBeTruthy();
      });
    });

    describe('getMessageChain', () => {
      it('should get a message chain and handle errors', async () => {
        const msg = createMockMessage();
        (
          msg.channel.messages.fetch as unknown as MockInstance
        ).mockResolvedValueOnce(undefined);
        const chain = await service.getMessageChain(msg);
        expect(Array.isArray(chain)).toBe(true);
      });
    });

    describe('registerSlashCommands', () => {
      describe('when called with a valid token', () => {
        it('should register slash commands', async () => {
          await service.registerSlashCommands();
        });
      });

      describe('when called with an invalid token', () => {
        it('should handle errors', async () => {
          vi.spyOn(console, 'error').mockImplementation(() => {});
          process.env.DISCORD_TOKEN = '';
          await service.registerSlashCommands();
          (console.error as any).mockRestore?.();
        });
      });
    });

    describe('buildMessageChainFromMessage', () => {
      it('should return MessageInChain array from message chain', async () => {
        const msg = createMockMessage({
          reference: { messageId: '123' },
        } as Partial<Message<boolean>>);

        vi.spyOn(msg.channel.messages, 'fetch').mockResolvedValue({
          author: { id: BOT_ID },
        } as any);

        const mockChain = [
          { author: 'user', content: 'hi', attachmentUrls: [] },
          { author: 'rooivalk', content: 'yo', attachmentUrls: [] },
        ];

        vi.spyOn(service, 'getMessageChain').mockResolvedValue(mockChain);

        service.mentionRegex = /<@test-bot-id>/g;
        const result = await service.buildMessageChainFromMessage(msg);
        expect(result).toEqual(mockChain);
      });
    });

    describe('setupMentionRegex', () => {
      it('should set up mention regex', () => {
        service.setupMentionRegex();
        expect(service.mentionRegex).toBeInstanceOf(RegExp);
      });
    });

    describe('login and event handlers', () => {
      it('should call on/once/login', async () => {
        service.on('ready', () => {});
        service.once('ready', () => {});
        await service.login();
        expect(discordClient.on).toHaveBeenCalled();
        expect(discordClient.once).toHaveBeenCalled();
        expect(discordClient.login).toHaveBeenCalled();
      });
    });

    describe('buildMessageChainFromThreadMessage', () => {
      it('should return MessageInChain array from thread messages in chronological order', async () => {
        const mockThreadMessages = new Map([
          [
            '3',
            {
              author: { id: 'user-id', displayName: 'User' },
              content: 'Third message',
              attachments: new Collection<string, string>(),
            },
          ],
          [
            '2',
            {
              author: { id: 'user-id', displayName: 'User' },
              content: 'Second message',
              attachments: new Collection<string, string>(),
            },
          ],
          [
            '1',
            {
              author: { id: BOT_ID, displayName: 'Bot' },
              content: 'First message',
              attachments: new Collection<string, string>(),
            },
          ],
        ]);

        const mockThread = createMockThread({
          messages: mockThreadMessages,
          starterMessage: {
            author: { id: 'user-id', displayName: 'User' },
            content: 'Thread starter message',
            attachments: new Collection(),
          },
        });

        const msg = createMockMessage({
          channel: {
            isThread: vi.fn().mockReturnValue(true),
            ...mockThread,
          } as any,
        } as Partial<Message<boolean>>);

        service.mentionRegex = /<@test-bot-id>/g;

        // Mock buildMessageChainFromMessage for the starter message
        vi.spyOn(service, 'buildMessageChainFromMessage').mockResolvedValue([
          {
            author: 'OlderUser',
            content: 'Previous context',
            attachmentUrls: [],
          },
        ]);

        const result = await service.buildMessageChainFromThreadMessage(msg);

        expect(result).toEqual([
          {
            author: 'OlderUser',
            content: 'Previous context',
            attachmentUrls: [],
          },
          {
            author: 'User',
            content: 'Thread starter message',
            attachmentUrls: [],
          },
          { author: 'rooivalk', content: 'First message', attachmentUrls: [] },
          { author: 'User', content: 'Second message', attachmentUrls: [] },
          { author: 'User', content: 'Third message', attachmentUrls: [] },
        ]);
        expect(mockThread.messages.fetch).toHaveBeenCalled();
      });

      it('should return null when not in a thread', async () => {
        const msg = createMockMessage({
          channel: {
            isThread: vi.fn().mockReturnValue(false),
          } as any,
        } as Partial<Message<boolean>>);

        const prompt = await service.buildMessageChainFromThreadMessage(msg);
        expect(prompt).toBeNull();
      });

      it('should return null when thread has no messages', async () => {
        const mockThread = createMockThread({
          messages: new Map(),
          starterMessage: null,
        });

        const msg = createMockMessage({
          channel: {
            isThread: vi.fn().mockReturnValue(true),
            ...mockThread,
          } as any,
        } as Partial<Message<boolean>>);

        const prompt = await service.buildMessageChainFromThreadMessage(msg);
        expect(prompt).toBeNull();
      });

      it('should handle thread messages fetch error', async () => {
        const mockThread = createMockThread({
          fetchError: true,
        });

        const msg = createMockMessage({
          channel: {
            isThread: vi.fn().mockReturnValue(true),
            ...mockThread,
          } as any,
        } as Partial<Message<boolean>>);

        // Should handle error gracefully and return null
        const result = await service.buildMessageChainFromThreadMessage(msg);
        expect(result).toBeNull();
      });

      it('should include pre-thread context and starter message', async () => {
        const mockThreadMessages = new Map([
          [
            '1',
            {
              author: { id: 'user-id', displayName: 'User' },
              content: 'Thread message',
              attachments: new Collection<string, string>(),
            },
          ],
        ]);

        const mockThread = createMockThread({
          messages: mockThreadMessages,
          starterMessage: {
            author: { id: 'user-id', displayName: 'User' },
            content: 'Start thread message',
            attachments: new Collection(),
          },
        });

        const msg = createMockMessage({
          channel: {
            isThread: vi.fn().mockReturnValue(true),
            ...mockThread,
          } as any,
        } as Partial<Message<boolean>>);

        // Mock buildMessageChainFromMessage for pre-thread context
        vi.spyOn(service, 'buildMessageChainFromMessage').mockResolvedValue([
          { author: 'user', content: 'Previous context', attachmentUrls: [] },
          { author: 'rooivalk', content: 'Bot response', attachmentUrls: [] },
        ]);

        const result = await service.buildMessageChainFromThreadMessage(msg);

        expect(result).toEqual([
          { author: 'user', content: 'Previous context', attachmentUrls: [] },
          { author: 'rooivalk', content: 'Bot response', attachmentUrls: [] },
          {
            author: 'User',
            content: 'Start thread message',
            attachmentUrls: [],
          },
          { author: 'User', content: 'Thread message', attachmentUrls: [] },
        ]);
        expect(mockThread.messages.fetch).toHaveBeenCalled();
      });

      it('should work when no pre-thread context exists', async () => {
        const mockThreadMessages = new Map([
          [
            '1',
            {
              author: { id: 'user-id', displayName: 'User' },
              content: 'Thread message only',
              attachments: new Collection<string, string>(),
            },
          ],
        ]);

        const mockThread = createMockThread({
          messages: mockThreadMessages,
          starterMessage: {
            author: { id: 'user-id', displayName: 'User' },
            content: 'Thread starter',
            attachments: new Collection(),
          },
        });

        const msg = createMockMessage({
          channel: {
            isThread: vi.fn().mockReturnValue(true),
            ...mockThread,
          } as any,
        } as Partial<Message<boolean>>);

        // Mock buildMessageChainFromMessage to return null (no pre-thread context)
        vi.spyOn(service, 'buildMessageChainFromMessage').mockResolvedValue(
          null,
        );

        const result = await service.buildMessageChainFromThreadMessage(msg);

        expect(result).toEqual([
          { author: 'User', content: 'Thread starter', attachmentUrls: [] },
          {
            author: 'User',
            content: 'Thread message only',
            attachmentUrls: [],
          },
        ]);
        expect(mockThread.messages.fetch).toHaveBeenCalled();
      });
    });

    describe('thread message handling', () => {
      it('should include bot messages with attachments but no content', async () => {
        const mockAttachment = {
          url: 'https://example.com/image.png',
        };
        const mockAttachments = new Collection();
        mockAttachments.set('1', mockAttachment as any);

        const mockThreadMessages = new Map([
          [
            '1',
            {
              author: { id: 'user-id', displayName: 'User' },
              content: 'generate a picture',
              attachments: new Collection<string, string>(),
            },
          ],
          [
            '2',
            {
              author: { id: BOT_ID, displayName: 'Bot' },
              content: '', // Bot message with no text content
              attachments: mockAttachments,
            },
          ],
          [
            '3',
            {
              author: { id: 'user-id', displayName: 'User' },
              content: 'great!',
              attachments: new Collection<string, string>(),
            },
          ],
        ]);

        const mockThread = createMockThread({
          messages: mockThreadMessages,
        });

        const msg = createMockMessage({
          channel: {
            isThread: vi.fn().mockReturnValue(true),
            ...mockThread,
          } as any,
        } as Partial<Message<boolean>>);

        // Mock buildMessageChainFromMessage
        vi.spyOn(service, 'buildMessageChainFromMessage').mockResolvedValue(
          null,
        );

        const result = await service.buildMessageChainFromThreadMessage(msg);

        // The bot message with attachment should be included
        expect(result).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              author: 'User',
              content: 'Thread starter message',
            }),
            expect.objectContaining({
              author: 'rooivalk',
              content: '',
              attachmentUrls: ['https://example.com/image.png'],
            }),
            expect.objectContaining({
              author: 'User',
              content: 'generate a picture',
            }),
            expect.objectContaining({ author: 'User', content: 'great!' }),
          ]),
        );
        expect(mockThread.messages.fetch).toHaveBeenCalled();
      });

      it('should filter out empty messages with no content and no attachments', async () => {
        const mockThreadMessages = new Map([
          [
            '1',
            {
              author: { id: 'user-id', displayName: 'User' },
              content: 'hello',
              attachments: new Collection<string, string>(),
            },
          ],
          [
            '2',
            {
              author: { id: BOT_ID, displayName: 'Bot' },
              content: '', // Empty bot message with no attachments
              attachments: new Collection<string, string>(),
            },
          ],
          [
            '3',
            {
              author: { id: 'user-id', displayName: 'User' },
              content: 'are you there?',
              attachments: new Collection<string, string>(),
            },
          ],
        ]);

        const mockThread = createMockThread({
          messages: mockThreadMessages,
        });

        const msg = createMockMessage({
          channel: {
            isThread: vi.fn().mockReturnValue(true),
            ...mockThread,
          } as any,
        } as Partial<Message<boolean>>);

        // Mock buildMessageChainFromMessage
        vi.spyOn(service, 'buildMessageChainFromMessage').mockResolvedValue(
          null,
        );

        const result = await service.buildMessageChainFromThreadMessage(msg);

        // The empty bot message should be filtered out
        expect(result).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              author: 'User',
              content: 'Thread starter message',
            }),
            expect.objectContaining({ author: 'User', content: 'hello' }),
            expect.objectContaining({
              author: 'User',
              content: 'are you there?',
            }),
          ]),
        );
        // No rooivalk messages should be present (empty one was filtered)
        expect(result!.some((m: any) => m.author === 'rooivalk')).toBe(false);
        expect(mockThread.messages.fetch).toHaveBeenCalled();
      });
    });
  });
});
