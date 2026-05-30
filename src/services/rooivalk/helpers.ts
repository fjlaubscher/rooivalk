import { userMention } from 'discord.js';
import type { Message, User } from 'discord.js';

import type { Profile } from '../../types.ts';

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

// Matches a message whose entire content is a single Instagram link and
// nothing else. Subdomains (e.g. `www.`) are tolerated; the path must be
// present so bare `instagram.com` doesn't trip it.
const INSTAGRAM_ONLY_LINK_REGEX =
  /^https?:\/\/(?:[a-z0-9-]+\.)*instagram\.com\/\S+$/i;

/**
 * If a message contains *only* an Instagram link (no other text), returns that
 * link with the `instagram.com` host swapped for `kkclip.com` so the embed
 * actually renders in Discord. Returns `null` for anything else — extra words,
 * multiple links, or non-Instagram URLs are left untouched.
 */
export const rewriteInstagramLink = (content: string): string | null => {
  const trimmed = content.trim();

  if (!INSTAGRAM_ONLY_LINK_REGEX.test(trimmed)) {
    return null;
  }

  return trimmed.replace(/(?:[a-z0-9-]+\.)*instagram\.com/i, 'kkclip.com');
};

export const buildPromptAuthor = (author: User) =>
  `${author.displayName} (displayName) ${userMention(author.id)} (discord mention tag) ${author.id} (discord_user_id — use this when querying the database for rows belonging to the speaker)`;

const messageMatchesProfile = (
  message: Message<boolean>,
  profile: Profile,
): boolean => {
  if (profile.roleId) {
    const hasRole = message.member?.roles?.cache?.has(profile.roleId) ?? false;
    if (!hasRole) {
      return false;
    }
  }

  if (message.channelId === profile.channelId) {
    return true;
  }

  if (
    message.channel.isThread() &&
    message.channel.parentId === profile.channelId
  ) {
    return true;
  }

  return false;
};

/**
 * Returns the first channel profile a message matches, or `undefined` for none.
 * A profile matches when the message is in its channel (or a thread whose
 * parent is that channel) and — if the profile names a role — the author holds
 * it.
 */
export const matchProfile = (
  message: Message<boolean>,
  profiles: Profile[],
): Profile | undefined =>
  profiles.find((profile) => messageMatchesProfile(message, profile));
