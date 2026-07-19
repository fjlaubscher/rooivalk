import { userMention } from 'discord.js';
import type { Message, User } from 'discord.js';

import type { Profile, ResponseType } from '../../types.ts';

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

/** A lone social link rewritten to a Discord-friendly embed host. */
export type RewrittenLink = {
  /** Which flavour-message pool (and `ResponseType`) the reply draws from. */
  type: ResponseType;
  /** The rewritten, embed-friendly URL. */
  link: string;
};

/**
 * Declarative rule for swapping a social platform's host for one that renders
 * proper embeds in Discord. Adding a platform (TikTok, …) is a new entry here
 * plus a matching `<type>.md` flavour-message file — no new detection or
 * reply code.
 */
type LinkFixer = {
  /** Flavour-message pool to draw the reply quip from. */
  type: ResponseType;
  /** Base domain to match, e.g. `instagram.com`. */
  domain: string;
  /** Embed-friendly replacement host, e.g. `kkclip.com`. */
  embedHost: string;
};

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Matches a message whose entire content is a single link for `domain` and
// nothing else. Subdomains (e.g. `www.`, `old.`) are tolerated; a path must be
// present so a bare `domain.com` doesn't trip it.
const loneLinkRegex = (domain: string): RegExp =>
  new RegExp(`^https?://(?:[a-z0-9-]+\\.)*${escapeRegExp(domain)}/\\S+$`, 'i');

// Matches the host (with optional subdomains) for in-place replacement.
const hostRegex = (domain: string): RegExp =>
  new RegExp(`(?:[a-z0-9-]+\\.)*${escapeRegExp(domain)}`, 'i');

const LINK_FIXER_RULES: LinkFixer[] = [
  { type: 'instagram', domain: 'instagram.com', embedHost: 'kkclip.com' },
];

const LINK_FIXERS = LINK_FIXER_RULES.map((fixer) => ({
  ...fixer,
  match: loneLinkRegex(fixer.domain),
  host: hostRegex(fixer.domain),
}));

/**
 * If a message contains *only* a supported social link (no other text), returns
 * the link rewritten to that platform's embed host — which renders the post in
 * Discord. The embed service resolves the post type (text/image/gallery/video)
 * server-side, so we don't branch on it. Returns `null` for anything else —
 * extra words, multiple links, or unsupported URLs are left untouched.
 */
export const rewriteEmbedLink = (content: string): RewrittenLink | null => {
  const trimmed = content.trim();

  for (const fixer of LINK_FIXERS) {
    if (!fixer.match.test(trimmed)) {
      continue;
    }

    return {
      type: fixer.type,
      link: trimmed.replace(fixer.host, fixer.embedHost),
    };
  }

  return null;
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
