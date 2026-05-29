import { userMention } from 'discord.js';
import type { Message, User } from 'discord.js';

import type { ChannelRoute } from '../../types.ts';

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
  `${author.displayName} (displayName) ${userMention(author.id)} (discord mention tag) ${author.id} (discord_user_id — use this when querying the database for rows belonging to the speaker)`;

const messageMatchesRoute = (
  message: Message<boolean>,
  route: ChannelRoute,
): boolean => {
  if (route.roleId) {
    const hasRole = message.member?.roles?.cache?.has(route.roleId) ?? false;
    if (!hasRole) {
      return false;
    }
  }

  if (message.channelId === route.channelId) {
    return true;
  }

  if (
    message.channel.isThread() &&
    message.channel.parentId === route.channelId
  ) {
    return true;
  }

  return false;
};

/**
 * Returns the first channel route a message matches, or `undefined` for none.
 * A route matches when the message is in its channel (or a thread whose parent
 * is that channel) and — if the route names a role — the author holds it.
 */
export const matchChannelRoute = (
  message: Message<boolean>,
  routes: ChannelRoute[],
): ChannelRoute | undefined =>
  routes.find((route) => messageMatchesRoute(message, route));
