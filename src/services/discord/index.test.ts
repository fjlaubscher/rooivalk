import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { Client as DiscordClient, TextChannel } from 'discord.js';

import { createMockMessage } from '@/test-utils/createMockMessage';

import { DiscordService } from '.';
import type { DiscordMessage, RooivalkResponseType } from '.';

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
    service = new DiscordService(discordClient);
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
          service.getRooivalkResponse('not-a-type' as RooivalkResponseType)
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

    describe('getOriginalMessage', () => {
      describe('when the original message is fetched successfully', () => {
        it('should get original message', async () => {
          const msg = createMockMessage({
            reference: { messageId: '123' },
          } as Partial<DiscordMessage>);
          (
            msg.channel.messages.fetch as unknown as MockInstance
          ).mockResolvedValueOnce('original');
          expect(await service.getOriginalMessage(msg)).toBe('original');
        });
      });

      describe('when fetching the original message fails', () => {
        it('should return null on error', async () => {
          const msg = createMockMessage({
            reference: { messageId: '123' },
          } as Partial<DiscordMessage>);
          (
            msg.channel.messages.fetch as unknown as MockInstance
          ).mockRejectedValueOnce(new Error('fail'));
          expect(await service.getOriginalMessage(msg)).toBeNull();
        });
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

    describe('buildPromptFromMessageChain', () => {
      it('should build prompt from message chain', async () => {
        const msg = createMockMessage({
          reference: { messageId: '123' },
        } as Partial<DiscordMessage>);
        vi.spyOn(service, 'getOriginalMessage').mockResolvedValue({
          author: { id: BOT_ID },
        } as any);
        vi.spyOn(service, 'getMessageChain').mockResolvedValue([
          { author: 'user', content: 'hi' },
          { author: 'rooivalk', content: 'yo' },
        ]);
        service.mentionRegex = /<@test-bot-id>/g;
        const prompt = await service.buildPromptFromMessageChain(msg);
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
  });
});
