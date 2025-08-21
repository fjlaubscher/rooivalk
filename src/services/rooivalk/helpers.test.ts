import { vi, describe, it, expect } from 'vitest';
import type { Message, ThreadChannel, TextChannel } from 'discord.js';
import { isRooivalkThread, isReplyToRooivalk } from './helpers';
import { createMockMessage } from '@/test-utils/createMockMessage';
import { MOCK_CONFIG, MOCK_ENV } from '@/test-utils/mock';

describe('rooivalk helpers', () => {
  const mockDiscordClientId = MOCK_ENV.DISCORD_APP_ID;

  describe('isRooivalkThread', () => {
    it('should return true when thread starter message is a reply to the bot', async () => {
      const mockBotMessage = createMockMessage({
        id: 'bot-message-id',
        author: { id: mockDiscordClientId },
      });

      const mockStarterMessage = createMockMessage({
        id: 'starter-message-id',
        reference: {
          messageId: 'bot-message-id',
          channelId: 'channel-id',
          guildId: 'guild-id',
          type: 0,
        },
      });

      const mockParentChannel = {
        messages: {
          fetch: vi.fn().mockResolvedValue(mockBotMessage),
        },
      } as unknown as TextChannel;

      const mockThread = {
        fetchStarterMessage: vi.fn().mockResolvedValue(mockStarterMessage),
        parent: mockParentChannel,
        isThread: () => true,
        createdTimestamp: Date.now(),
      } as unknown as ThreadChannel;

      const mockMessage = createMockMessage({
        channel: mockThread as any,
      });

      const result = await isRooivalkThread(mockMessage, mockDiscordClientId);

      expect(result).toBe(true);
      expect(mockThread.fetchStarterMessage).toHaveBeenCalled();
      expect(mockParentChannel.messages.fetch).toHaveBeenCalledWith(
        'bot-message-id',
      );
    });

    it('should return false when thread starter message is not a reply to the bot', async () => {
      const mockOtherMessage = createMockMessage({
        id: 'other-message-id',
        author: { id: 'other-user-id' },
      });

      const mockStarterMessage = createMockMessage({
        id: 'starter-message-id',
        reference: {
          messageId: 'other-message-id',
          channelId: 'channel-id',
          guildId: 'guild-id',
          type: 0,
        },
      });

      const mockParentChannel = {
        messages: {
          fetch: vi.fn().mockResolvedValue(mockOtherMessage),
        },
      } as unknown as TextChannel;

      const mockThread = {
        fetchStarterMessage: vi.fn().mockResolvedValue(mockStarterMessage),
        parent: mockParentChannel,
        isThread: () => true,
        createdTimestamp: Date.now(),
      } as unknown as ThreadChannel;

      const mockMessage = createMockMessage({
        channel: mockThread as any,
      });

      const result = await isRooivalkThread(mockMessage, mockDiscordClientId);

      expect(result).toBe(false);
    });

    it('should return false when not in a thread', async () => {
      const mockMessage = createMockMessage({
        channel: {
          isThread: (() => false) as any,
        },
      });

      const result = await isRooivalkThread(mockMessage, mockDiscordClientId);

      expect(result).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      const mockThread = {
        fetchStarterMessage: vi
          .fn()
          .mockRejectedValue(new Error('Fetch failed')),
        isThread: () => true,
        createdTimestamp: Date.now(),
      } as unknown as ThreadChannel;

      const mockMessage = createMockMessage({
        channel: mockThread as any,
      });

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const result = await isRooivalkThread(mockMessage, mockDiscordClientId);

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error checking thread ownership:',
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });
  });

  describe('isReplyToRooivalk', () => {
    it('should return true when message is a reply to the bot', async () => {
      const mockBotMessage = createMockMessage({
        id: 'bot-message-id',
        author: { id: mockDiscordClientId },
      });

      const mockMessage = createMockMessage({
        reference: {
          messageId: 'bot-message-id',
          channelId: 'channel-id',
          guildId: 'guild-id',
          type: 0,
        },
        channel: {
          messages: {
            fetch: vi.fn().mockResolvedValue(mockBotMessage),
          },
        },
      });

      const result = await isReplyToRooivalk(mockMessage, mockDiscordClientId);

      expect(result).toBe(true);
      expect(mockMessage.channel.messages.fetch).toHaveBeenCalledWith(
        'bot-message-id',
      );
    });

    it('should return false when message is not a reply', async () => {
      const mockMessage = createMockMessage({
        reference: null,
      });

      const result = await isReplyToRooivalk(mockMessage, mockDiscordClientId);

      expect(result).toBe(false);
    });

    it('should return false when reply is not to the bot', async () => {
      const mockOtherMessage = createMockMessage({
        id: 'other-message-id',
        author: { id: 'other-user-id' },
      });

      const mockMessage = createMockMessage({
        reference: {
          messageId: 'other-message-id',
          channelId: 'channel-id',
          guildId: 'guild-id',
          type: 0,
        },
        channel: {
          messages: {
            fetch: vi.fn().mockResolvedValue(mockOtherMessage),
          },
        },
      });

      const result = await isReplyToRooivalk(mockMessage, mockDiscordClientId);

      expect(result).toBe(false);
    });
  });
});
