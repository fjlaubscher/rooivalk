import type { Message } from 'discord.js';
import type { ConversationRef } from '../../types.ts';

export const resolveConversationLookupRef = (
  message: Message<boolean>,
): ConversationRef | null => {
  // Threads and DMs are both conversation scopes: one chain per channel. A DM
  // has no thread, so the DM channel id is stored under the 'thread' slot —
  // channel and thread snowflakes can never collide, so no third type (and no
  // CHECK-constraint migration on existing databases) is needed. Like threads,
  // the channel scope takes precedence over reply refs.
  if (message.channel.isThread() || !message.guild) {
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
  // Same conversation-scope rule as the lookup: threads and DMs keep one
  // chain per channel id, with no per-message rows.
  if (userMessage.channel.isThread() || !userMessage.guild) {
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
