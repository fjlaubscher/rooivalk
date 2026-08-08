import { vi, describe, it, expect } from 'vitest';
import type { ThreadChannel } from 'discord.js';
import {
  isRooivalkThread,
  isReplyToRooivalk,
  buildPromptChannel,
  matchProfile,
  rewriteEmbedLink,
  summarizeEmbeds,
  truncateForPrompt,
} from './helpers.ts';
import type { Embed } from 'discord.js';
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

  describe('truncateForPrompt', () => {
    it('leaves a string shorter than the cap untouched', () => {
      expect(truncateForPrompt('short', 10)).toBe('short');
    });

    it('leaves a string exactly at the cap untouched', () => {
      expect(truncateForPrompt('exactlyten', 10)).toBe('exactlyten');
    });

    it('clips and ellipsises a string over the cap', () => {
      expect(truncateForPrompt('abcdefghijk', 5)).toBe('abcde…');
    });

    it('trims trailing whitespace before the ellipsis', () => {
      expect(truncateForPrompt('abc     defg', 6)).toBe('abc…');
    });
  });

  describe('summarizeEmbeds', () => {
    const embed = (value: Record<string, unknown>) => value as unknown as Embed;

    it('returns empty results for undefined, null and empty input', () => {
      expect(summarizeEmbeds(undefined)).toEqual({ text: [], imageUrls: [] });
      expect(summarizeEmbeds(null)).toEqual({ text: [], imageUrls: [] });
      expect(summarizeEmbeds([])).toEqual({ text: [], imageUrls: [] });
    });

    it('joins title, description, author and footer into one line', () => {
      const result = summarizeEmbeds([
        embed({
          title: 'Title',
          description: 'Description',
          author: { name: 'Author' },
          footer: { text: 'Footer' },
        }),
      ]);

      expect(result.text).toEqual(['Title — Description — Author — Footer']);
    });

    it('omits embeds with no readable text', () => {
      const result = summarizeEmbeds([
        embed({ image: { url: 'https://example.com/a.png' } }),
      ]);

      expect(result.text).toEqual([]);
      expect(result.imageUrls).toEqual(['https://example.com/a.png']);
    });

    it('skips attachment:// image urls', () => {
      const result = summarizeEmbeds([
        embed({
          description: 'Bonnievale',
          footer: { text: 'oil painting of a nightlife district' },
          image: { url: 'attachment://rooivalk_motd.jpg' },
        }),
      ]);

      expect(result.text).toEqual([
        'Bonnievale — oil painting of a nightlife district',
      ]);
      expect(result.imageUrls).toEqual([]);
    });

    it('ignores thumbnails so link previews do not flood the payload', () => {
      const result = summarizeEmbeds([
        embed({
          title: 'Some article',
          thumbnail: { url: 'https://example.com/thumb.png' },
        }),
      ]);

      expect(result.imageUrls).toEqual([]);
    });

    it('caps the number of embeds it reads', () => {
      const result = summarizeEmbeds(
        Array.from({ length: 5 }, (_, index) =>
          embed({ title: `Embed ${index}` }),
        ),
      );

      expect(result.text).toEqual(['Embed 0', 'Embed 1', 'Embed 2']);
    });

    it('caps and dedupes image urls', () => {
      const result = summarizeEmbeds([
        embed({ image: { url: 'https://example.com/a.png' } }),
        embed({ image: { url: 'https://example.com/a.png' } }),
        embed({ image: { url: 'https://example.com/b.png' } }),
      ]);

      expect(result.imageUrls).toEqual([
        'https://example.com/a.png',
        'https://example.com/b.png',
      ]);
    });

    it('drops embed images the vision endpoint would reject', () => {
      const result = summarizeEmbeds([
        // Animated GIF from a Tenor/Giphy preview — a hard 400 if forwarded.
        embed({ image: { url: 'https://media.tenor.com/abc.gif' } }),
        // Extensionless CDN URL — unknown format, so equally unsafe.
        embed({ image: { url: 'https://example.com/render?id=42' } }),
        embed({ image: { url: 'not a url at all' } }),
      ]);

      expect(result.imageUrls).toEqual([]);
    });

    it('accepts supported extensions through query strings and uppercase', () => {
      const result = summarizeEmbeds([
        embed({ image: { url: 'https://example.com/a.JPG?width=600&ex=abc' } }),
        embed({ image: { url: 'https://example.com/b.webp#frag' } }),
      ]);

      expect(result.imageUrls).toEqual([
        'https://example.com/a.JPG?width=600&ex=abc',
        'https://example.com/b.webp#frag',
      ]);
    });

    it('truncates long embed text', () => {
      const result = summarizeEmbeds([embed({ description: 'x'.repeat(400) })]);

      expect(result.text[0]).toBe(`${'x'.repeat(300)}…`);
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
