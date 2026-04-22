import { vi, describe, it, expect } from 'vitest';
import type { Message, ThreadChannel, TextChannel } from 'discord.js';
import {
  isRooivalkThread,
  isReplyToRooivalk,
  shouldUseFieldHospitalModel,
} from './helpers.ts';
import { createMockMessage } from '../../test-utils/createMockMessage.ts';
import { MOCK_CONFIG, MOCK_ENV } from '../../test-utils/mock.ts';

describe('rooivalk helpers', () => {
  const mockDiscordClientId = MOCK_ENV.DISCORD_APP_ID;

  describe('isRooivalkThread', () => {
    it('should return true when thread is owned by the bot', () => {
      const mockThread = {
        ownerId: mockDiscordClientId,
        isThread: () => true,
      } as unknown as ThreadChannel;

      const mockMessage = createMockMessage({
        channel: mockThread as any,
      });

      const result = isRooivalkThread(mockMessage, mockDiscordClientId);

      expect(result).toBe(true);
    });

    it('should return false when thread is owned by another user', () => {
      const mockThread = {
        ownerId: 'other-user-id',
        isThread: () => true,
      } as unknown as ThreadChannel;

      const mockMessage = createMockMessage({
        channel: mockThread as any,
      });

      const result = isRooivalkThread(mockMessage, mockDiscordClientId);

      expect(result).toBe(false);
    });

    it('should return false when not in a thread', () => {
      const mockMessage = createMockMessage({
        channel: {
          isThread: (() => false) as any,
        },
      });

      const result = isRooivalkThread(mockMessage, mockDiscordClientId);

      expect(result).toBe(false);
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

  describe('shouldUseFieldHospitalModel', () => {
    const ROLE_ID = 'role-123';
    const CHANNEL_ID = 'channel-456';

    const buildMessage = (opts: {
      channelId?: string;
      roleIds?: string[];
      hasMember?: boolean;
      isThread?: boolean;
      parentId?: string | null;
    }) => {
      const {
        channelId = CHANNEL_ID,
        roleIds = [ROLE_ID],
        hasMember = true,
        isThread = false,
        parentId = null,
      } = opts;

      const roles = {
        cache: {
          has: (id: string) => roleIds.includes(id),
        },
      };

      return createMockMessage({
        channelId,
        member: hasMember ? { roles } : null,
        channel: {
          id: channelId,
          isThread: () => isThread,
          parentId,
        },
      });
    };

    it('returns true when user has role and is in the target channel', () => {
      const msg = buildMessage({});
      expect(shouldUseFieldHospitalModel(msg, ROLE_ID, CHANNEL_ID)).toBe(true);
    });

    it('returns true when inside a thread whose parent is the target channel', () => {
      const msg = buildMessage({
        channelId: 'thread-id',
        isThread: true,
        parentId: CHANNEL_ID,
      });
      expect(shouldUseFieldHospitalModel(msg, ROLE_ID, CHANNEL_ID)).toBe(true);
    });

    it('returns false when user lacks the role', () => {
      const msg = buildMessage({ roleIds: ['some-other-role'] });
      expect(shouldUseFieldHospitalModel(msg, ROLE_ID, CHANNEL_ID)).toBe(false);
    });

    it('returns false when in a different channel', () => {
      const msg = buildMessage({ channelId: 'some-other-channel' });
      expect(shouldUseFieldHospitalModel(msg, ROLE_ID, CHANNEL_ID)).toBe(false);
    });

    it('returns false when in a thread whose parent is a different channel', () => {
      const msg = buildMessage({
        channelId: 'thread-id',
        isThread: true,
        parentId: 'some-other-channel',
      });
      expect(shouldUseFieldHospitalModel(msg, ROLE_ID, CHANNEL_ID)).toBe(false);
    });

    it('returns false when member is missing', () => {
      const msg = buildMessage({ hasMember: false });
      expect(shouldUseFieldHospitalModel(msg, ROLE_ID, CHANNEL_ID)).toBe(false);
    });

    it('returns false when role or channel env is unset', () => {
      const msg = buildMessage({});
      expect(shouldUseFieldHospitalModel(msg, undefined, CHANNEL_ID)).toBe(
        false,
      );
      expect(shouldUseFieldHospitalModel(msg, ROLE_ID, undefined)).toBe(false);
    });
  });
});
