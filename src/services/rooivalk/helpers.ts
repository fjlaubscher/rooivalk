import { userMention } from 'discord.js';
import type { Message, User } from 'discord.js';

export const isRooivalkThread = async (
  message: Message<boolean>,
  discordClientId: string | undefined,
): Promise<boolean> => {
  if (message.channel.isThread()) {
    const thread = message.channel;
    // Check if this thread was created by the bot by examining the starter message
    try {
      const starterMessage = await thread.fetchStarterMessage();
      if (starterMessage) {
        // If the starter message is a reply to the bot, then the bot created this thread
        const repliedToMessage =
          starterMessage.reference?.messageId &&
          thread.parent &&
          'messages' in thread.parent
            ? await thread.parent.messages
                .fetch(starterMessage.reference.messageId)
                .catch(() => null)
            : null;
        if (
          repliedToMessage &&
          repliedToMessage.author.id === discordClientId
        ) {
          return true;
        }
      }
    } catch (error) {
      console.error('Error checking thread ownership:', error);
    }
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
