import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import EmojiService from './index.ts';

describe('EmojiService', () => {
  let tmpDir: string;
  let dbPath: string;
  let emoji: EmojiService;

  const BASE = {
    guildId: 'guild-1',
    messageId: 'msg-1',
    channelId: 'channel-1',
    messageAuthorId: 'author-1',
    reactorId: 'reactor-1',
    emojiId: null,
    emojiName: '🔥',
    emojiAnimated: false,
  };

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rooivalk-emoji-'));
    dbPath = join(tmpDir, 'test.db');
    emoji = new EmojiService(dbPath);
  });

  afterEach(() => {
    emoji.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('getTopMessages', () => {
    it('returns the message after a reaction is recorded', () => {
      emoji.recordReaction(BASE);
      const now = Date.now();
      const rows = emoji.getTopMessages(
        'guild-1',
        now - 60_000,
        now + 60_000,
        5,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.message_id).toBe('msg-1');
      expect(rows[0]!.channel_id).toBe('channel-1');
      expect(rows[0]!.message_author_id).toBe('author-1');
      expect(rows[0]!.count).toBe(1);
    });

    it('aggregates multiple reactions on the same message', () => {
      emoji.recordReaction(BASE);
      emoji.recordReaction({ ...BASE, reactorId: 'reactor-2' });
      const now = Date.now();
      const rows = emoji.getTopMessages(
        'guild-1',
        now - 60_000,
        now + 60_000,
        5,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.count).toBe(2);
    });

    it('ranks individual messages, not authors', () => {
      // Same author, two messages: each message stays its own row.
      emoji.recordReaction({ ...BASE, messageId: 'msg-a', reactorId: 'r1' });
      emoji.recordReaction({ ...BASE, messageId: 'msg-b', reactorId: 'r2' });
      emoji.recordReaction({ ...BASE, messageId: 'msg-b', reactorId: 'r3' });
      const now = Date.now();
      const rows = emoji.getTopMessages(
        'guild-1',
        now - 60_000,
        now + 60_000,
        5,
      );
      expect(rows).toHaveLength(2);
      expect(rows[0]!.message_id).toBe('msg-b');
      expect(rows[0]!.count).toBe(2);
    });

    it('excludes reactions outside the window', () => {
      emoji.recordReaction(BASE);
      const past = Date.now() - 200_000;
      const rows = emoji.getTopMessages(
        'guild-1',
        past - 60_000,
        past - 1_000,
        5,
      );
      expect(rows).toHaveLength(0);
    });

    it('respects the limit', () => {
      for (let i = 0; i < 10; i++) {
        emoji.recordReaction({
          ...BASE,
          messageId: `msg-${i}`,
          reactorId: `r-${i}`,
        });
      }
      const now = Date.now();
      const rows = emoji.getTopMessages(
        'guild-1',
        now - 60_000,
        now + 60_000,
        3,
      );
      expect(rows).toHaveLength(3);
    });
  });

  describe('getTopGivers', () => {
    it('returns the reactor with their favourite emoji', () => {
      emoji.recordReaction(BASE);
      const now = Date.now();
      const rows = emoji.getTopGivers('guild-1', now - 60_000, now + 60_000, 5);
      expect(rows[0]!.user_id).toBe('reactor-1');
      expect(rows[0]!.count).toBe(1);
      expect(rows[0]!.fav_emoji_name).toBe('🔥');
      expect(rows[0]!.fav_emoji_id).toBeNull();
    });

    it('picks the most-used emoji as the favourite', () => {
      emoji.recordReaction({ ...BASE, emojiName: '🔥', messageId: 'm1' });
      emoji.recordReaction({ ...BASE, emojiName: '🔥', messageId: 'm2' });
      emoji.recordReaction({ ...BASE, emojiName: '😀', messageId: 'm3' });
      const now = Date.now();
      const rows = emoji.getTopGivers('guild-1', now - 60_000, now + 60_000, 5);
      expect(rows[0]!.count).toBe(3);
      expect(rows[0]!.fav_emoji_name).toBe('🔥');
    });

    it('sorts by count descending', () => {
      emoji.recordReaction({
        ...BASE,
        reactorId: 'reactor-a',
        messageId: 'a1',
      });
      emoji.recordReaction({
        ...BASE,
        reactorId: 'reactor-b',
        messageId: 'a2',
      });
      emoji.recordReaction({
        ...BASE,
        reactorId: 'reactor-b',
        messageId: 'a3',
      });
      const now = Date.now();
      const rows = emoji.getTopGivers('guild-1', now - 60_000, now + 60_000, 5);
      expect(rows[0]!.user_id).toBe('reactor-b');
      expect(rows[0]!.count).toBe(2);
    });

    it('excludes reactions outside the window', () => {
      emoji.recordReaction(BASE);
      const past = Date.now() - 200_000;
      const rows = emoji.getTopGivers(
        'guild-1',
        past - 60_000,
        past - 1_000,
        5,
      );
      expect(rows).toHaveLength(0);
    });
  });

  describe('getTopEmojis', () => {
    it('totals reactions per emoji across all users', () => {
      emoji.recordReaction({ ...BASE, emojiName: '🔥', reactorId: 'r1' });
      emoji.recordReaction({ ...BASE, emojiName: '🔥', reactorId: 'r2' });
      emoji.recordReaction({ ...BASE, emojiName: '😀', reactorId: 'r3' });
      const now = Date.now();
      const rows = emoji.getTopEmojis('guild-1', now - 60_000, now + 60_000, 5);
      expect(rows).toHaveLength(2);
      expect(rows[0]!.emoji_name).toBe('🔥');
      expect(rows[0]!.count).toBe(2);
    });

    it('handles custom guild emojis', () => {
      emoji.recordReaction({
        ...BASE,
        emojiId: '123456',
        emojiName: 'rooivalk',
        emojiAnimated: false,
      });
      const now = Date.now();
      const rows = emoji.getTopEmojis('guild-1', now - 60_000, now + 60_000, 5);
      expect(rows[0]!.emoji_id).toBe('123456');
      expect(rows[0]!.emoji_name).toBe('rooivalk');
    });

    it('respects the limit', () => {
      for (let i = 0; i < 10; i++) {
        emoji.recordReaction({
          ...BASE,
          emojiName: `emoji-${i}`,
          messageId: `m-${i}`,
        });
      }
      const now = Date.now();
      const rows = emoji.getTopEmojis('guild-1', now - 60_000, now + 60_000, 3);
      expect(rows.length).toBeLessThanOrEqual(3);
    });

    it('returns empty when no reactions exist', () => {
      const now = Date.now();
      const rows = emoji.getTopEmojis('guild-1', now - 60_000, now + 60_000, 5);
      expect(rows).toHaveLength(0);
    });
  });
});
