import type { Message } from 'discord.js';
import type { ConversationRef } from '../../types.ts';

export const resolveConversationLookupRef = (
  message: Message<boolean>,
): ConversationRef | null => {
  if (message.channel.isThread()) {
    return { type: 'thread', refId: message.channel.id };
  }
  if (message.reference?.messageId) {
    return { type: 'msg', refId: message.reference.messageId };
  }
  return null;
};

export const resolveConversationStoreRefs = (
  userMessage: Message<boolean>,
  botReply: Message<boolean>,
  createdThreadId: string | null,
): ConversationRef[] => {
  if (userMessage.channel.isThread()) {
    return [{ type: 'thread', refId: userMessage.channel.id }];
  }
  const refs: ConversationRef[] = [{ type: 'msg', refId: botReply.id }];
  if (createdThreadId) {
    refs.push({ type: 'thread', refId: createdThreadId });
  }
  return refs;
};

export const formatEmojiEntry = (name: string, tag: string): string =>
  `:${name}: → ${tag}`;
