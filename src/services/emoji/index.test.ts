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

  describe('getTopReceivers', () => {
    it('returns the receiver after a reaction is recorded', () => {
      emoji.recordReaction(BASE);
      const now = Date.now();
      const rows = emoji.getTopReceivers(now - 60_000, now + 60_000, 5);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.user_id).toBe('author-1');
      expect(rows[0]!.count).toBe(1);
    });

    it('aggregates multiple reactions to the same author', () => {
      emoji.recordReaction(BASE);
      emoji.recordReaction({ ...BASE, reactorId: 'reactor-2' });
      const now = Date.now();
      const rows = emoji.getTopReceivers(now - 60_000, now + 60_000, 5);
      expect(rows[0]!.count).toBe(2);
    });

    it('sorts by count descending', () => {
      emoji.recordReaction({
        ...BASE,
        messageAuthorId: 'author-a',
        reactorId: 'r1',
      });
      emoji.recordReaction({
        ...BASE,
        messageAuthorId: 'author-b',
        reactorId: 'r2',
      });
      emoji.recordReaction({
        ...BASE,
        messageAuthorId: 'author-b',
        reactorId: 'r3',
      });
      const now = Date.now();
      const rows = emoji.getTopReceivers(now - 60_000, now + 60_000, 5);
      expect(rows[0]!.user_id).toBe('author-b');
      expect(rows[0]!.count).toBe(2);
    });

    it('excludes reactions outside the window', () => {
      emoji.recordReaction(BASE);
      const past = Date.now() - 200_000;
      const rows = emoji.getTopReceivers(past - 60_000, past - 1_000, 5);
      expect(rows).toHaveLength(0);
    });

    it('respects the limit', () => {
      for (let i = 0; i < 10; i++) {
        emoji.recordReaction({
          ...BASE,
          messageAuthorId: `author-${i}`,
          reactorId: `r-${i}`,
        });
      }
      const now = Date.now();
      const rows = emoji.getTopReceivers(now - 60_000, now + 60_000, 3);
      expect(rows).toHaveLength(3);
    });
  });

  describe('getTopGivers', () => {
    it('returns the reactor after a reaction is recorded', () => {
      emoji.recordReaction(BASE);
      const now = Date.now();
      const rows = emoji.getTopGivers(now - 60_000, now + 60_000, 5);
      expect(rows[0]!.user_id).toBe('reactor-1');
      expect(rows[0]!.count).toBe(1);
    });

    it('sorts by count descending', () => {
      emoji.recordReaction({
        ...BASE,
        reactorId: 'reactor-a',
        messageAuthorId: 'a1',
      });
      emoji.recordReaction({
        ...BASE,
        reactorId: 'reactor-b',
        messageAuthorId: 'a2',
      });
      emoji.recordReaction({
        ...BASE,
        reactorId: 'reactor-b',
        messageAuthorId: 'a3',
      });
      const now = Date.now();
      const rows = emoji.getTopGivers(now - 60_000, now + 60_000, 5);
      expect(rows[0]!.user_id).toBe('reactor-b');
      expect(rows[0]!.count).toBe(2);
    });

    it('excludes reactions outside the window', () => {
      emoji.recordReaction(BASE);
      const past = Date.now() - 200_000;
      const rows = emoji.getTopGivers(past - 60_000, past - 1_000, 5);
      expect(rows).toHaveLength(0);
    });
  });

  describe('getEmojiChampions', () => {
    it('picks the top user per emoji', () => {
      emoji.recordReaction({ ...BASE, emojiName: '🔥', reactorId: 'r1' });
      emoji.recordReaction({
        ...BASE,
        emojiName: '🔥',
        reactorId: 'r1',
        messageAuthorId: 'a2',
      });
      emoji.recordReaction({
        ...BASE,
        emojiName: '🔥',
        reactorId: 'r2',
        messageAuthorId: 'a3',
      });
      const now = Date.now();
      const rows = emoji.getEmojiChampions(now - 60_000, now + 60_000, 5);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.emoji_name).toBe('🔥');
      expect(rows[0]!.user_id).toBe('r1');
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
      const rows = emoji.getEmojiChampions(now - 60_000, now + 60_000, 5);
      expect(rows[0]!.emoji_id).toBe('123456');
      expect(rows[0]!.emoji_name).toBe('rooivalk');
    });

    it('respects the emoji limit', () => {
      for (let i = 0; i < 10; i++) {
        emoji.recordReaction({ ...BASE, emojiName: `emoji-${i}` });
      }
      const now = Date.now();
      const rows = emoji.getEmojiChampions(now - 60_000, now + 60_000, 3);
      expect(rows.length).toBeLessThanOrEqual(3);
    });

    it('returns empty when no reactions exist', () => {
      const now = Date.now();
      const rows = emoji.getEmojiChampions(now - 60_000, now + 60_000, 5);
      expect(rows).toHaveLength(0);
    });
  });
});
