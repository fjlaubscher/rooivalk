import { vi, describe, it, expect } from 'vitest';
import type { ThreadChannel } from 'discord.js';
import {
  isRooivalkThread,
  isReplyToRooivalk,
  matchChannelRoute,
} from './helpers.ts';
import type { ChannelRoute } from '../../types.ts';
import { createMockMessage } from '../../test-utils/createMockMessage.ts';
import { MOCK_ENV } from '../../test-utils/mock.ts';

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

  describe('matchChannelRoute', () => {
    const ROLE_ID = 'role-123';
    const CHANNEL_ID = 'channel-456';

    const ROUTE: ChannelRoute = {
      name: 'field-hospital',
      channelId: CHANNEL_ID,
      roleId: ROLE_ID,
      instructions: 'field-hospital',
    };

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

    it('matches when user has role and is in the target channel', () => {
      const msg = buildMessage({});
      expect(matchChannelRoute(msg, [ROUTE])).toBe(ROUTE);
    });

    it('matches inside a thread whose parent is the target channel', () => {
      const msg = buildMessage({
        channelId: 'thread-id',
        isThread: true,
        parentId: CHANNEL_ID,
      });
      expect(matchChannelRoute(msg, [ROUTE])).toBe(ROUTE);
    });

    it('does not match when user lacks the required role', () => {
      const msg = buildMessage({ roleIds: ['some-other-role'] });
      expect(matchChannelRoute(msg, [ROUTE])).toBeUndefined();
    });

    it('does not match in a different channel', () => {
      const msg = buildMessage({ channelId: 'some-other-channel' });
      expect(matchChannelRoute(msg, [ROUTE])).toBeUndefined();
    });

    it('does not match in a thread whose parent is a different channel', () => {
      const msg = buildMessage({
        channelId: 'thread-id',
        isThread: true,
        parentId: 'some-other-channel',
      });
      expect(matchChannelRoute(msg, [ROUTE])).toBeUndefined();
    });

    it('does not match when member is missing on a role-gated route', () => {
      const msg = buildMessage({ hasMember: false });
      expect(matchChannelRoute(msg, [ROUTE])).toBeUndefined();
    });

    it('matches on channel alone when the route has no role', () => {
      const channelOnly: ChannelRoute = {
        name: 'lobby',
        channelId: CHANNEL_ID,
        instructions: 'lobby',
      };
      const msg = buildMessage({ hasMember: false });
      expect(matchChannelRoute(msg, [channelOnly])).toBe(channelOnly);
    });

    it('returns the first matching route and undefined when none match', () => {
      const other: ChannelRoute = {
        name: 'other',
        channelId: 'some-other-channel',
        instructions: 'other',
      };
      const msg = buildMessage({});
      expect(matchChannelRoute(msg, [other, ROUTE])).toBe(ROUTE);
      expect(matchChannelRoute(msg, [])).toBeUndefined();
    });
  });
});
