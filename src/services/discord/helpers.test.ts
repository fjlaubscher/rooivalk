import { describe, it, expect } from 'vitest';
import {
  formatEmojiEntry,
  resolveConversationLookupRef,
  resolveConversationStoreRefs,
} from './helpers.ts';
import { createMockMessage } from '../../test-utils/createMockMessage.ts';

describe('discord helpers', () => {
  describe('formatEmojiEntry', () => {
    it('formats a static emoji entry', () => {
      expect(formatEmojiEntry('rooivalk', '<:rooivalk:123456789>')).toBe(
        ':rooivalk: → <:rooivalk:123456789>',
      );
    });

    it('formats an animated emoji entry', () => {
      expect(formatEmojiEntry('fire', '<a:fire:987654321>')).toBe(
        ':fire: → <a:fire:987654321>',
      );
    });
  });

  describe('resolveConversationLookupRef', () => {
    it('returns a thread ref for messages in a thread', () => {
      const message = createMockMessage({
        channel: { isThread: () => true, id: 'thread-1' } as any,
      });
      expect(resolveConversationLookupRef(message)).toEqual({
        type: 'thread',
        refId: 'thread-1',
      });
    });

    it('returns a msg ref for replies in a regular channel', () => {
      const message = createMockMessage({
        channel: { isThread: () => false } as any,
        reference: { messageId: 'parent-msg-1' } as any,
      });
      expect(resolveConversationLookupRef(message)).toEqual({
        type: 'msg',
        refId: 'parent-msg-1',
      });
    });

    it('returns null for standalone messages', () => {
      const message = createMockMessage({
        channel: { isThread: () => false } as any,
        reference: null as any,
      });
      expect(resolveConversationLookupRef(message)).toBeNull();
    });
  });

  describe('resolveConversationStoreRefs', () => {
    it('returns a single thread ref when the user message is in a thread', () => {
      const userMessage = createMockMessage({
        channel: { isThread: () => true, id: 'thread-9' } as any,
      });
      const botReply = createMockMessage({ id: 'bot-reply-id' });
      expect(resolveConversationStoreRefs(userMessage, botReply, null)).toEqual(
        [{ type: 'thread', refId: 'thread-9' }],
      );
    });

    it('returns a msg ref for channel replies without a created thread', () => {
      const userMessage = createMockMessage({
        channel: { isThread: () => false } as any,
      });
      const botReply = createMockMessage({ id: 'bot-reply-2' });
      expect(resolveConversationStoreRefs(userMessage, botReply, null)).toEqual(
        [{ type: 'msg', refId: 'bot-reply-2' }],
      );
    });

    it('writes both msg and thread refs when a thread was created this turn', () => {
      const userMessage = createMockMessage({
        channel: { isThread: () => false } as any,
      });
      const botReply = createMockMessage({ id: 'bot-reply-3' });
      expect(
        resolveConversationStoreRefs(userMessage, botReply, 'new-thread-5'),
      ).toEqual([
        { type: 'msg', refId: 'bot-reply-3' },
        { type: 'thread', refId: 'new-thread-5' },
      ]);
    });
  });
});
