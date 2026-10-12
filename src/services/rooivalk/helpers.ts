import { userMention } from 'discord.js';
import type { Embed, Message, User } from 'discord.js';

import {
  IMAGE_ATTACHMENT_EXTENSIONS,
  MAX_REFERENCED_EMBED_IMAGES,
  MAX_REFERENCED_EMBEDS,
  REFERENCED_EMBED_TEXT_MAX_LENGTH,
} from '../../constants.ts';
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

export const buildPromptAuthor = (author: User) =>
  `${author.displayName} (displayName) ${userMention(author.id)} (discord mention tag) ${author.id} (discord_user_id — use this when querying the database for rows belonging to the speaker)`;

/**
 * Builds a short context line describing the Discord channel a message was sent
 * in — its name and, when set, its description (topic). Threads inherit the
 * description from their parent channel. Returns `null` when neither a name nor
 * a description is available (e.g. DMs or bare test mocks) so callers can omit
 * the line entirely.
 */
export const buildPromptChannel = (
  message: Message<boolean>,
): string | null => {
  const { channel } = message;

  const name =
    'name' in channel && channel.name ? channel.name.trim() || null : null;

  let topic: string | null = null;
  if ('topic' in channel && channel.topic) {
    topic = channel.topic.trim() || null;
  } else if (
    channel.isThread() &&
    channel.parent &&
    'topic' in channel.parent &&
    channel.parent.topic
  ) {
    topic = channel.parent.topic.trim() || null;
  }

  if (!name && !topic) {
    return null;
  }

  const label = name ? `#${name}` : 'this channel';
  return topic
    ? `[Channel ${label} — description: "${topic}"]`
    : `[Channel ${label}]`;
};

/**
 * Clips a string to `max` characters, appending an ellipsis when it had to cut.
 * Used to keep quoted context a pointer rather than a payload.
 */
export const truncateForPrompt = (value: string, max: number): string =>
  value.length <= max ? value : `${value.slice(0, max).trimEnd()}…`;

/** Human-readable lines and fetchable image URLs pulled off a message's embeds. */
export type EmbedSummary = {
  text: string[];
  imageUrls: string[];
};

/**
 * An embed image URL carries no content type, so its extension is the only
 * signal available. Anything else — an animated GIF from a Tenor preview, an
 * extensionless CDN URL of unknown format — would be sent to the vision
 * endpoint blind, and an unsupported format fails the whole turn with a 400.
 * A silent drop is the better failure.
 */
const hasSupportedImageExtension = (url: string): boolean => {
  let pathname: string;
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    return false;
  }

  return IMAGE_ATTACHMENT_EXTENSIONS.some((extension) =>
    pathname.endsWith(extension),
  );
};

/**
 * Flattens an embed's human-readable fields into short lines and collects any
 * externally-fetchable image URLs.
 *
 * Three deliberate exclusions:
 * - `attachment://` URLs are dropped. They only resolve inside Discord, and the
 *   underlying file is already surfaced through the message's `attachments`
 *   collection — sending one to the model would just be a dead link.
 * - `thumbnail` is ignored in favour of `image`. Every link preview (YouTube,
 *   news sites) populates `thumbnail`, so including it would flood the vision
 *   payload with favicons; `image` is set for actual media previews.
 * - URLs that don't end in a supported image extension are dropped, mirroring
 *   the `isAttachmentAllowed` check real attachments go through.
 */
export const summarizeEmbeds = (
  embeds: readonly Embed[] | null | undefined,
): EmbedSummary => {
  if (!embeds || embeds.length === 0) {
    return { text: [], imageUrls: [] };
  }

  const text: string[] = [];
  const imageUrls: string[] = [];
  const seenUrls = new Set<string>();

  for (const embed of embeds.slice(0, MAX_REFERENCED_EMBEDS)) {
    if (!embed) {
      continue;
    }

    const parts = [
      embed.title,
      embed.description,
      embed.author?.name,
      embed.footer?.text,
    ]
      .map((part) => part?.trim())
      .filter((part): part is string => Boolean(part));

    if (parts.length > 0) {
      text.push(
        truncateForPrompt(parts.join(' — '), REFERENCED_EMBED_TEXT_MAX_LENGTH),
      );
    }

    const imageUrl = embed.image?.url?.trim();
    if (
      imageUrl &&
      /^https?:\/\//i.test(imageUrl) &&
      hasSupportedImageExtension(imageUrl) &&
      !seenUrls.has(imageUrl) &&
      imageUrls.length < MAX_REFERENCED_EMBED_IMAGES
    ) {
      seenUrls.add(imageUrl);
      imageUrls.push(imageUrl);
    }
  }

  return { text, imageUrls };
};

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
