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
import {
  Client as DiscordClient,
  TextChannel,
  type MessageReference,
} from 'discord.js';

import { createMockMessage } from '@/test-utils/createMockMessage';
import { MOCK_CONFIG } from '@/test-utils/mock';
import type { ResponseType } from '@/types';
import { silenceConsole } from '@/test-utils/consoleMocks';

import DiscordService from '.';
import type { DiscordMessage } from '.';

vi.mock('discord.js', async (importOriginal) => {
  const actual = await importOriginal();
  return Object.assign({}, actual, {
    REST: vi.fn().mockImplementation(() => ({
      setToken: vi.fn().mockReturnValue({
        put: vi
          .fn()
          .mockResolvedValueOnce(undefined) // Simulate success
          .mockRejectedValueOnce(new Error('fail')), // Simulate error
      }),
    })),
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
          'string'
        );
        expect(() =>
          service.getRooivalkResponse('not-a-type' as ResponseType)
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
        const reply = service.buildMessageReply(longContent);
        expect(reply.files).toBeTruthy();
      });
    });

    describe('chunkContent', () => {
      it('splits content based on the discord limit', () => {
        const longContent = 'a'.repeat(4500);
        const chunks = service.chunkContent(longContent, 2000);
        expect(chunks.length).toBe(3);
        expect(chunks[0]!.length).toBe(2000);
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

    describe('getReferencedMessage', () => {
      it('should get the referenced message', async () => {
        const msg = createMockMessage({
          reference: { messageId: '123' },
        } as Partial<DiscordMessage>);
        (
          msg.channel.messages.fetch as unknown as MockInstance
        ).mockResolvedValueOnce('parent');
        expect(await service.getReferencedMessage(msg)).toBe('parent');
      });

      it('should return null on error', async () => {
        const msg = createMockMessage({
          reference: { messageId: '123' },
        } as Partial<DiscordMessage>);
        (
          msg.channel.messages.fetch as unknown as MockInstance
        ).mockRejectedValueOnce(new Error('fail'));

        expect(await service.getReferencedMessage(msg)).toBeNull();
      });
    });

    describe('getOriginalMessage', () => {
      it('walks the reply chain to find the first message', async () => {
        const root = createMockMessage();
        const mid = createMockMessage({
          reference: { messageId: 'root' } as MessageReference,
          channel: {
            messages: { fetch: vi.fn().mockResolvedValue(root) },
          } as any,
        } as Partial<DiscordMessage>);
        const msg = createMockMessage({
          reference: { messageId: 'mid' } as MessageReference,
          channel: {
            messages: { fetch: vi.fn().mockResolvedValue(mid) },
          } as any,
        } as Partial<DiscordMessage>);
        const result = await service.getOriginalMessage(msg);
        expect(result).toBe(root);
      });

      it('returns null on fetch error', async () => {
        const msg = createMockMessage({
          reference: { messageId: '123' },
        } as Partial<DiscordMessage>);
        (
          msg.channel.messages.fetch as unknown as MockInstance
        ).mockRejectedValueOnce(new Error('fail'));
        expect(await service.getOriginalMessage(msg)).toBeNull();
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
      it('should build prompt from message chain', async () => {
        const msg = createMockMessage({
          reference: { messageId: '123' },
        } as Partial<DiscordMessage>);
        vi.spyOn(service, 'getReferencedMessage').mockResolvedValue({
          author: { id: BOT_ID },
        } as any);
        vi.spyOn(service, 'getMessageChain').mockResolvedValue([
          { author: 'user', content: 'hi' },
          { author: 'rooivalk', content: 'yo' },
        ]);
        service.mentionRegex = /<@test-bot-id>/g;
        const prompt = await service.buildMessageChainFromMessage(msg);
        expect(typeof prompt).toBe('string');
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
      it('should build prompt from thread messages in chronological order', async () => {
        const mockThreadMessages = new Map([
          [
            '3',
            {
              author: { id: 'user-id', displayName: 'User' },
              content: 'Third message',
            },
          ],
          [
            '2',
            {
              author: { id: 'user-id', displayName: 'User' },
              content: 'Second message',
            },
          ],
          [
            '1',
            {
              author: { id: BOT_ID, displayName: 'Bot' },
              content: 'First message',
            },
          ],
        ]);

        const mockThread = {
          messages: {
            fetch: vi.fn().mockResolvedValue(mockThreadMessages),
          },
        };

        const msg = createMockMessage({
          channel: {
            isThread: vi.fn().mockReturnValue(true),
            ...mockThread,
          } as any,
        } as Partial<DiscordMessage>);

        service.mentionRegex = /<@test-bot-id>/g;
        const prompt = await service.buildMessageChainFromThreadMessage(msg);

        expect(prompt).toBe(
          '- rooivalk: First message\n- User: Second message\n- User: Third message'
        );
        expect(mockThread.messages.fetch).toHaveBeenCalled();
      });

      it('should clean mention from last user message', async () => {
        const mockThreadMessages = new Map([
          [
            '2',
            {
              author: { id: 'user-id', displayName: 'User' },
              content: '<@test-bot-id> Hello bot!',
            },
          ],
          [
            '1',
            {
              author: { id: BOT_ID, displayName: 'Bot' },
              content: 'Bot message',
            },
          ],
        ]);

        const mockThread = {
          messages: {
            fetch: vi.fn().mockResolvedValue(mockThreadMessages),
          },
        };

        const msg = createMockMessage({
          channel: {
            isThread: vi.fn().mockReturnValue(true),
            ...mockThread,
          } as any,
        } as Partial<DiscordMessage>);

        service.mentionRegex = /<@test-bot-id>/g;
        const prompt = await service.buildMessageChainFromThreadMessage(msg);

        expect(prompt).toBe('- rooivalk: Bot message\n- User: Hello bot!');
      });

      it('should return null when not in a thread', async () => {
        const msg = createMockMessage({
          channel: {
            isThread: vi.fn().mockReturnValue(false),
          } as any,
        } as Partial<DiscordMessage>);

        const prompt = await service.buildMessageChainFromThreadMessage(msg);
        expect(prompt).toBeNull();
      });

      it('should return null when thread has no messages', async () => {
        const mockThread = {
          messages: {
            fetch: vi.fn().mockResolvedValue(new Map()),
          },
        };

        const msg = createMockMessage({
          channel: {
            isThread: vi.fn().mockReturnValue(true),
            ...mockThread,
          } as any,
        } as Partial<DiscordMessage>);

        const prompt = await service.buildMessageChainFromThreadMessage(msg);
        expect(prompt).toBeNull();
      });

      it('should handle thread messages fetch error', async () => {
        const mockThread = {
          messages: {
            fetch: vi.fn().mockRejectedValue(new Error('Fetch failed')),
          },
        };

        const msg = createMockMessage({
          channel: {
            isThread: vi.fn().mockReturnValue(true),
            ...mockThread,
          } as any,
        } as Partial<DiscordMessage>);

        // Should not throw, but will likely return null or handle gracefully
        await expect(
          service.buildMessageChainFromThreadMessage(msg)
        ).rejects.toThrow('Fetch failed');
      });

      it('should include initial context when building thread message chain', async () => {
        const threadId = 'thread-123';
        const initialContext = '- user: Initial message\n- rooivalk: Initial response';
        const mockThreadMessages = new Map([
          [
            '1',
            {
              author: { id: 'user-id', displayName: 'User' },
              content: 'Thread message',
            },
          ],
        ]);

        // Set initial context
        service.setThreadInitialContext(threadId, initialContext);

        const mockThread = {
          id: threadId,
          messages: {
            fetch: vi.fn().mockResolvedValue(mockThreadMessages),
          },
        };

        const msg = createMockMessage({
          channel: {
            isThread: vi.fn().mockReturnValue(true),
            ...mockThread,
          } as any,
        } as Partial<DiscordMessage>);

        const result = await service.buildMessageChainFromThreadMessage(msg);

        expect(result).toBe(
          '- user: Initial message\n- rooivalk: Initial response\n- User: Thread message'
        );
        expect(mockThread.messages.fetch).toHaveBeenCalled();
      });

      it('should work without initial context when none is stored', async () => {
        const threadId = 'thread-456';
        const mockThreadMessages = new Map([
          [
            '1',
            {
              author: { id: 'user-id', displayName: 'User' },
              content: 'Thread message only',
            },
          ],
        ]);

        const mockThread = {
          id: threadId,
          messages: {
            fetch: vi.fn().mockResolvedValue(mockThreadMessages),
          },
        };

        const msg = createMockMessage({
          channel: {
            isThread: vi.fn().mockReturnValue(true),
            ...mockThread,
          } as any,
        } as Partial<DiscordMessage>);

        const result = await service.buildMessageChainFromThreadMessage(msg);

        expect(result).toBe('- User: Thread message only');
        expect(mockThread.messages.fetch).toHaveBeenCalled();
      });

      it('should cache combined initial context and thread messages', async () => {
        const threadId = 'thread-789';
        const initialContext = '- user: Cached initial\n- rooivalk: Cached response';
        const mockThreadMessages = new Map([
          [
            '1',
            {
              author: { id: 'user-id', displayName: 'User' },
              content: 'Cached thread message',
            },
          ],
        ]);

        service.setThreadInitialContext(threadId, initialContext);

        const mockThread = {
          id: threadId,
          messages: {
            fetch: vi.fn().mockResolvedValue(mockThreadMessages),
          },
        };

        const msg = createMockMessage({
          channel: {
            isThread: vi.fn().mockReturnValue(true),
            ...mockThread,
          } as any,
        } as Partial<DiscordMessage>);

        // First call should fetch and cache
        const result1 = await service.buildMessageChainFromThreadMessage(msg);
        expect(mockThread.messages.fetch).toHaveBeenCalledTimes(1);

        // Second call should use cache
        const result2 = await service.buildMessageChainFromThreadMessage(msg);
        expect(mockThread.messages.fetch).toHaveBeenCalledTimes(1); // Not called again
        expect(result1).toBe(result2);
        expect(result1).toBe(
          '- user: Cached initial\n- rooivalk: Cached response\n- User: Cached thread message'
        );
      });
    });

    describe('thread initial context management', () => {
      it('should store and retrieve thread initial context', () => {
        const threadId = 'thread-123';
        const initialContext = '- user: Hello\n- rooivalk: Hi there!';

        service.setThreadInitialContext(threadId, initialContext);
        expect(service.getThreadInitialContext(threadId)).toBe(initialContext);
      });

      it('should return null for non-existent thread context', () => {
        expect(service.getThreadInitialContext('non-existent')).toBeNull();
      });

      it('should clear specific thread initial context when clearing cache', () => {
        const threadId = 'thread-123';
        const initialContext = '- user: Hello\n- rooivalk: Hi there!';

        service.setThreadInitialContext(threadId, initialContext);
        expect(service.getThreadInitialContext(threadId)).toBe(initialContext);

        service.clearThreadMessageCache(threadId);
        expect(service.getThreadInitialContext(threadId)).toBeNull();
      });

      it('should clear all thread initial contexts when clearing all caches', () => {
        service.setThreadInitialContext('thread-1', 'context-1');
        service.setThreadInitialContext('thread-2', 'context-2');

        expect(service.getThreadInitialContext('thread-1')).toBe('context-1');
        expect(service.getThreadInitialContext('thread-2')).toBe('context-2');

        service.clearThreadMessageCache();

        expect(service.getThreadInitialContext('thread-1')).toBeNull();
        expect(service.getThreadInitialContext('thread-2')).toBeNull();
      });
    });

    describe('thread message caching', () => {
      it('should cache thread messages on first call', async () => {
        const mockThreadMessages = new Map([
          [
            '1',
            {
              author: { id: 'user-id', displayName: 'User' },
              content: 'Hello in thread',
            },
          ],
        ]);

        const mockThread = {
          id: 'thread-123',
          messages: {
            fetch: vi.fn().mockResolvedValue(mockThreadMessages),
          },
        };

        const msg = createMockMessage({
          channel: {
            isThread: vi.fn().mockReturnValue(true),
            ...mockThread,
          } as any,
        } as Partial<DiscordMessage>);

        // First call should fetch from API
        const result1 = await service.buildMessageChainFromThreadMessage(msg);
        expect(mockThread.messages.fetch).toHaveBeenCalledTimes(1);
        expect(result1).toBe('- User: Hello in thread');

        // Second call should use cache
        const result2 = await service.buildMessageChainFromThreadMessage(msg);
        expect(mockThread.messages.fetch).toHaveBeenCalledTimes(1); // Not called again
        expect(result2).toBe('- User: Hello in thread');
      });

      it('should cache different threads separately', async () => {
        const mockThreadMessages1 = new Map([
          [
            '1',
            {
              author: { id: 'user-id', displayName: 'User' },
              content: 'Thread 1 message',
            },
          ],
        ]);

        const mockThreadMessages2 = new Map([
          [
            '1',
            {
              author: { id: 'user-id', displayName: 'User' },
              content: 'Thread 2 message',
            },
          ],
        ]);

        const mockThread1 = {
          id: 'thread-123',
          messages: {
            fetch: vi.fn().mockResolvedValue(mockThreadMessages1),
          },
        };

        const mockThread2 = {
          id: 'thread-456',
          messages: {
            fetch: vi.fn().mockResolvedValue(mockThreadMessages2),
          },
        };

        const msg1 = createMockMessage({
          channel: {
            isThread: vi.fn().mockReturnValue(true),
            ...mockThread1,
          } as any,
        } as Partial<DiscordMessage>);

        const msg2 = createMockMessage({
          channel: {
            isThread: vi.fn().mockReturnValue(true),
            ...mockThread2,
          } as any,
        } as Partial<DiscordMessage>);

        // Cache both threads
        const result1 = await service.buildMessageChainFromThreadMessage(msg1);
        const result2 = await service.buildMessageChainFromThreadMessage(msg2);

        expect(result1).toBe('- User: Thread 1 message');
        expect(result2).toBe('- User: Thread 2 message');
        expect(mockThread1.messages.fetch).toHaveBeenCalledTimes(1);
        expect(mockThread2.messages.fetch).toHaveBeenCalledTimes(1);
      });

      it('should clear cache for specific thread', async () => {
        const mockThreadMessages = new Map([
          [
            '1',
            {
              author: { id: 'user-id', displayName: 'User' },
              content: 'Hello in thread',
            },
          ],
        ]);

        const mockThread = {
          id: 'thread-123',
          messages: {
            fetch: vi.fn().mockResolvedValue(mockThreadMessages),
          },
        };

        const msg = createMockMessage({
          channel: {
            isThread: vi.fn().mockReturnValue(true),
            ...mockThread,
          } as any,
        } as Partial<DiscordMessage>);

        // First call caches the result
        await service.buildMessageChainFromThreadMessage(msg);
        expect(mockThread.messages.fetch).toHaveBeenCalledTimes(1);

        // Clear cache for this thread
        service.clearThreadMessageCache('thread-123');

        // Next call should fetch from API again
        await service.buildMessageChainFromThreadMessage(msg);
        expect(mockThread.messages.fetch).toHaveBeenCalledTimes(2);
      });

      it('should clear all caches when no threadId provided', async () => {
        const mockThreadMessages1 = new Map([
          [
            '1',
            {
              author: { id: 'user-id', displayName: 'User' },
              content: 'Thread 1 message',
            },
          ],
        ]);

        const mockThreadMessages2 = new Map([
          [
            '1',
            {
              author: { id: 'user-id', displayName: 'User' },
              content: 'Thread 2 message',
            },
          ],
        ]);

        const mockThread1 = {
          id: 'thread-123',
          messages: {
            fetch: vi.fn().mockResolvedValue(mockThreadMessages1),
          },
        };

        const mockThread2 = {
          id: 'thread-456',
          messages: {
            fetch: vi.fn().mockResolvedValue(mockThreadMessages2),
          },
        };

        const msg1 = createMockMessage({
          channel: {
            isThread: vi.fn().mockReturnValue(true),
            ...mockThread1,
          } as any,
        } as Partial<DiscordMessage>);

        const msg2 = createMockMessage({
          channel: {
            isThread: vi.fn().mockReturnValue(true),
            ...mockThread2,
          } as any,
        } as Partial<DiscordMessage>);

        // Cache both threads
        await service.buildMessageChainFromThreadMessage(msg1);
        await service.buildMessageChainFromThreadMessage(msg2);
        expect(mockThread1.messages.fetch).toHaveBeenCalledTimes(1);
        expect(mockThread2.messages.fetch).toHaveBeenCalledTimes(1);

        // Clear all caches
        service.clearThreadMessageCache();

        // Both threads should fetch from API again
        await service.buildMessageChainFromThreadMessage(msg1);
        await service.buildMessageChainFromThreadMessage(msg2);
        expect(mockThread1.messages.fetch).toHaveBeenCalledTimes(2);
        expect(mockThread2.messages.fetch).toHaveBeenCalledTimes(2);
      });
    });
  });
});
