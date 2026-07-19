import { vi, describe, it, expect } from 'vitest';
import type { ThreadChannel } from 'discord.js';
import {
  isRooivalkThread,
  isReplyToRooivalk,
  buildPromptChannel,
  matchProfile,
  rewriteEmbedLink,
} from './helpers.ts';
import type { Profile } from '../../types.ts';
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

  describe('matchProfile', () => {
    const ROLE_ID = 'role-123';
    const CHANNEL_ID = 'channel-456';

    const PROFILE: Profile = {
      name: 'field-hospital',
      channelId: CHANNEL_ID,
      roleId: ROLE_ID,
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
      expect(matchProfile(msg, [PROFILE])).toBe(PROFILE);
    });

    it('matches inside a thread whose parent is the target channel', () => {
      const msg = buildMessage({
        channelId: 'thread-id',
        isThread: true,
        parentId: CHANNEL_ID,
      });
      expect(matchProfile(msg, [PROFILE])).toBe(PROFILE);
    });

    it('does not match when user lacks the required role', () => {
      const msg = buildMessage({ roleIds: ['some-other-role'] });
      expect(matchProfile(msg, [PROFILE])).toBeUndefined();
    });

    it('does not match in a different channel', () => {
      const msg = buildMessage({ channelId: 'some-other-channel' });
      expect(matchProfile(msg, [PROFILE])).toBeUndefined();
    });

    it('does not match in a thread whose parent is a different channel', () => {
      const msg = buildMessage({
        channelId: 'thread-id',
        isThread: true,
        parentId: 'some-other-channel',
      });
      expect(matchProfile(msg, [PROFILE])).toBeUndefined();
    });

    it('does not match when member is missing on a role-gated profile', () => {
      const msg = buildMessage({ hasMember: false });
      expect(matchProfile(msg, [PROFILE])).toBeUndefined();
    });

    it('matches on channel alone when the profile has no role', () => {
      const channelOnly: Profile = {
        name: 'lobby',
        channelId: CHANNEL_ID,
      };
      const msg = buildMessage({ hasMember: false });
      expect(matchProfile(msg, [channelOnly])).toBe(channelOnly);
    });

    it('returns the first matching profile and undefined when none match', () => {
      const other: Profile = {
        name: 'other',
        channelId: 'some-other-channel',
      };
      const msg = buildMessage({});
      expect(matchProfile(msg, [other, PROFILE])).toBe(PROFILE);
      expect(matchProfile(msg, [])).toBeUndefined();
    });
  });

  describe('buildPromptChannel', () => {
    it('includes the channel name and description when both are present', () => {
      const msg = createMockMessage({
        channel: {
          name: 'general',
          topic: 'Chit-chat about anything and everything',
          isThread: () => false,
        },
      });

      expect(buildPromptChannel(msg)).toBe(
        '[Channel #general — description: "Chit-chat about anything and everything"]',
      );
    });

    it('includes only the channel name when there is no description', () => {
      const msg = createMockMessage({
        channel: {
          name: 'random',
          topic: null,
          isThread: () => false,
        },
      });

      expect(buildPromptChannel(msg)).toBe('[Channel #random]');
    });

    it('trims whitespace and ignores blank descriptions', () => {
      const msg = createMockMessage({
        channel: {
          name: '  announcements  ',
          topic: '   ',
          isThread: () => false,
        },
      });

      expect(buildPromptChannel(msg)).toBe('[Channel #announcements]');
    });

    it('falls back to the parent channel description inside a thread', () => {
      const msg = createMockMessage({
        channel: {
          name: 'help-thread',
          isThread: () => true,
          parent: {
            name: 'support',
            topic: 'Ask for help here',
          },
        },
      });

      expect(buildPromptChannel(msg)).toBe(
        '[Channel #help-thread — description: "Ask for help here"]',
      );
    });

    it('returns null when neither a name nor a description is available', () => {
      const msg = createMockMessage({
        channel: {
          isThread: () => false,
        },
      });

      expect(buildPromptChannel(msg)).toBeNull();
    });
  });

  describe('rewriteEmbedLink', () => {
    it('rewrites a lone Instagram link to the kkclip host', () => {
      expect(
        rewriteEmbedLink('https://www.instagram.com/reel/abc123/'),
      ).toEqual({
        type: 'instagram',
        link: 'https://kkclip.com/reel/abc123/',
      });
    });

    it('handles Instagram links without a www subdomain', () => {
      expect(rewriteEmbedLink('https://instagram.com/p/xyz')).toEqual({
        type: 'instagram',
        link: 'https://kkclip.com/p/xyz',
      });
    });

    it('preserves the path and query string', () => {
      expect(
        rewriteEmbedLink('https://www.instagram.com/reel/abc?igsh=token123'),
      ).toEqual({
        type: 'instagram',
        link: 'https://kkclip.com/reel/abc?igsh=token123',
      });
    });

    it('ignores surrounding whitespace', () => {
      expect(rewriteEmbedLink('  https://instagram.com/p/xyz  ')).toEqual({
        type: 'instagram',
        link: 'https://kkclip.com/p/xyz',
      });
    });

    it('returns null when the link is accompanied by other text', () => {
      expect(
        rewriteEmbedLink('look at this https://instagram.com/p/xyz'),
      ).toBeNull();
    });

    it('returns null for unsupported links', () => {
      expect(rewriteEmbedLink('https://example.com/p/xyz')).toBeNull();
    });

    it('returns null for non-link content', () => {
      expect(rewriteEmbedLink('just a normal message')).toBeNull();
    });
  });
});
