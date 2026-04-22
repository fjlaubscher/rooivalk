import { userMention } from 'discord.js';
import type { Message, User } from 'discord.js';

export const isRooivalkThread = (
  message: Message<boolean>,
  discordClientId: string | undefined,
): boolean => {
  if (message.channel.isThread()) {
    return message.channel.ownerId === discordClientId;
  }

  return false;
};

export const isReplyToRooivalk = async (
  message: Message<boolean>,
  discordClientId: string | undefined,
): Promise<boolean> => {
  if (message.reference?.messageId) {
    try {
      const referencedMessage = await message.channel.messages.fetch(
        message.reference.messageId,
      );

      if (
        referencedMessage &&
        referencedMessage.author.id === discordClientId
      ) {
        return true;
      }
    } catch (error) {
      // Referenced message doesn't exist (deleted, from another server, etc.)
      return false;
    }
  }
  return false;
};

export const buildPromptAuthor = (author: User) =>
  `${author.displayName} (displayName) ${userMention(author.id)} (discord mention tag)`;

export const shouldUseFieldHospitalModel = (
  message: Message<boolean>,
  roleId: string | undefined,
  channelId: string | undefined,
): boolean => {
  if (!roleId || !channelId) {
    return false;
  }

  const hasRole = message.member?.roles?.cache?.has(roleId) ?? false;
  if (!hasRole) {
    return false;
  }

  if (message.channelId === channelId) {
    return true;
  }

  if (message.channel.isThread() && message.channel.parentId === channelId) {
    return true;
  }

  return false;
};
