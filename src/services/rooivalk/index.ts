import {
  AttachmentBuilder,
  EmbedBuilder,
  Events as DiscordEvents,
  formatEmoji,
  userMention,
} from 'discord.js';
import type {
  Attachment,
  ChatInputCommandInteraction,
  Client,
  Interaction,
  ThreadChannel,
  Message,
  MessageReaction,
  PartialMessageReaction,
  SendableChannels,
  User,
  PartialUser,
} from 'discord.js';

import {
  ALLOWED_ATTACHMENT_CONTENT_TYPES,
  ALLOWED_ATTACHMENT_EXTENSIONS,
  DISCORD_COMMANDS,
  IMAGE_ATTACHMENT_EXTENSIONS,
  YR_COORDINATES,
} from '../../constants.ts';
import {
  createChatService,
  createImageService,
  createProfileChatServices,
} from '../chat/index.ts';
import type { ChatService, ImageService } from '../chat/index.ts';
import DiscordService from '../discord/index.ts';
import EmojiService from '../emoji/index.ts';
import GithubService from '../github/index.ts';
import MemoryService from '../memory/index.ts';
import PeapixService from '../peapix/index.ts';
import SteamService from '../steam/index.ts';
import YrService from '../yr/index.ts';
import type { AttachmentForPrompt, InMemoryConfig } from '../../types.ts';

import {
  resolveConversationLookupRef,
  resolveConversationStoreRefs,
} from '../discord/helpers.ts';
import {
  isReplyToRooivalk,
  isRooivalkThread,
  buildPromptAuthor,
  buildPromptChannel,
  matchProfile,
  rewriteEmbedLink,
} from './helpers.ts';
import type { RewrittenLink } from './helpers.ts';
import { buildToolExecutor } from './tool-executor.ts';
import type { ToolExecutor } from '../../types.ts';

const MOTD_IMAGE_ATTACHMENT_NAME = 'rooivalk_motd.jpg';

const LEADERBOARD_EMBED_COLOR = 0xe74c3c;
const LEADERBOARD_MEDALS = ['🥇', '🥈', '🥉'];

const leaderboardRank = (index: number): string =>
  LEADERBOARD_MEDALS[index] ?? `\`${index + 1}.\``;

const formatReactionEmoji = (
  emojiId: string | null,
  emojiName: string,
  emojiAnimated: number,
): string =>
  emojiId
    ? formatEmoji({
        id: emojiId,
        animated: emojiAnimated === 1,
        name: emojiName,
      })
    : emojiName;

const MOTD_IMAGE_STYLES = [
  'watercolour painting',
  'oil painting',
  'digital concept art',
  'pencil sketch',
  'pop art',
  'art nouveau illustration',
  'impressionist painting',
  'ukiyo-e woodblock print',
  'pixel art',
  'retro travel poster',
  'isometric illustration',
  'stained glass window design',
  'vintage postcard',
  'charcoal drawing',
  'comic book panel',
  'gouache painting',
  'ink wash painting',
  'low-poly 3D render',
  'cyberpunk neon illustration',
  'steampunk illustration',
  'minimalist flat vector art',
  'surrealist painting',
  'cubist painting',
  'expressionist painting',
  'baroque oil painting',
  'fresco mural',
  'linocut print',
  'risograph print',
  'cross-stitch embroidery',
  'claymation diorama',
  'paper cut-out collage',
  'chalk pastel drawing',
  'graffiti street mural',
  'art deco poster',
  'vaporwave aesthetic',
  'storybook illustration',
  'cinematic matte painting',
  'silhouette illustration',
  'mosaic tile artwork',
  'blueprint technical drawing',
];

const MOTD_CITY_ASPECTS = [
  'a famous landmark or monument',
  'the local cuisine and street food',
  'a hidden gem only locals know about',
  'the skyline at golden hour',
  'a bustling local market scene',
  'the surrounding natural landscape',
  'a cultural festival or tradition',
  'the distinctive architecture',
  'everyday street life',
  'wildlife native to the region',
  'the coastline or waterfront',
  'a historical scene from the past',
  'a rainy night with reflections on the streets',
  'a snowy winter morning',
  'a view from a rooftop cafe',
  'the old town quarter at dusk',
  'a busy transit hub or train station',
  'a tranquil park or garden',
  'a vibrant nightlife district',
  'a panoramic aerial view',
  'a misty sunrise over the city',
  'traditional local clothing and people',
  'a beloved local sport or pastime',
  'the river winding through the city',
  'a famous bridge or crossing',
  'an iconic local mode of transport',
  'the city seen from a nearby hill',
  'a quiet cobblestone alleyway',
  'a seasonal scene unique to the region',
];

class Rooivalk {
  protected _config: InMemoryConfig;
  protected _discord: DiscordService;
  protected _chat: ChatService;
  protected _profileChats: Map<string, ChatService>;
  protected _openai: ImageService;
  protected _yr: YrService;
  protected _peapix: PeapixService;
  protected _emoji: EmojiService;
  protected _memory: MemoryService;
  protected _steam: SteamService;
  protected _github: GithubService;
  private _allowedAppIds: string[];

  constructor(
    config: InMemoryConfig,
    discordService?: DiscordService,
    chatService?: ChatService,
    openaiService?: ImageService,
    yrService?: YrService,
    peapixService?: PeapixService,
    profileChatServices?: Map<string, ChatService>,
    memoryService?: MemoryService,
    steamService?: SteamService,
    emojiService?: EmojiService,
    githubService?: GithubService,
  ) {
    this._config = config;
    this._discord = discordService ?? new DiscordService(this._config);
    this._openai = openaiService ?? createImageService(this._config);
    this._chat = chatService ?? createChatService(this._config);
    this._profileChats =
      profileChatServices ?? createProfileChatServices(this._config);
    this._yr = yrService ?? new YrService();
    this._peapix = peapixService ?? new PeapixService();
    this._memory =
      memoryService ??
      new MemoryService(process.env.ROOIVALK_DB_PATH ?? './data/rooivalk.db');
    this._steam =
      steamService ??
      new SteamService(
        process.env.ROOIVALK_DB_PATH ?? './data/rooivalk.db',
        process.env.STEAM_API_KEY,
      );
    this._emoji =
      emojiService ??
      new EmojiService(process.env.ROOIVALK_DB_PATH ?? './data/rooivalk.db');
    this._github = githubService ?? new GithubService(process.env.GITHUB_TOKEN);

    // Parse DISCORD_ALLOWED_APPS once and store
    const allowedAppsEnv = process.env.DISCORD_ALLOWED_APPS;
    this._allowedAppIds = allowedAppsEnv
      ? allowedAppsEnv
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : [];
  }

  /**
   * Determines if a message should be processed based on allowlist and guild.
   * @param message The Discord message.
   * @param guildId The guild/server ID to match.
   */
  private shouldProcessMessage(
    message: Message<boolean>,
    guildId: string,
  ): boolean {
    if (
      (message.author.bot &&
        !this._allowedAppIds.includes(message.author.id)) ||
      message.guild?.id !== guildId
    ) {
      return false;
    }
    return true;
  }

  private isAttachmentAllowed(attachment: Attachment): boolean {
    const normalizedContentType = this.normalizeContentType(
      attachment.contentType,
    );

    if (
      normalizedContentType &&
      ALLOWED_ATTACHMENT_CONTENT_TYPES.includes(normalizedContentType)
    ) {
      return true;
    }

    if (attachment.name) {
      const lowerCaseName = attachment.name.toLowerCase();
      return ALLOWED_ATTACHMENT_EXTENSIONS.some((extension) =>
        lowerCaseName.endsWith(extension),
      );
    }

    return false;
  }

  private getAttachmentKind(
    attachment: Attachment,
  ): AttachmentForPrompt['kind'] {
    const normalizedContentType = this.normalizeContentType(
      attachment.contentType,
    );

    if (normalizedContentType?.startsWith('image/')) {
      return 'image';
    }

    if (attachment.name) {
      const lowerCaseName = attachment.name.toLowerCase();
      if (
        IMAGE_ATTACHMENT_EXTENSIONS.some((extension) =>
          lowerCaseName.endsWith(extension),
        )
      ) {
        return 'image';
      }
    }

    return 'file';
  }

  private buildAttachmentForPrompt(
    attachment: Attachment,
  ): AttachmentForPrompt {
    const normalizedContentType = this.normalizeContentType(
      attachment.contentType,
    );

    return {
      url: attachment.url,
      name: attachment.name ?? null,
      contentType: normalizedContentType,
      kind: this.getAttachmentKind(attachment),
    };
  }

  private async loadReferencedMessageContext(
    message: Message<boolean>,
  ): Promise<{ prefix: string; attachments: AttachmentForPrompt[] } | null> {
    if (!message.reference?.messageId) {
      return null;
    }

    let referenced: Message<boolean>;
    try {
      referenced = await message.channel.messages.fetch(
        message.reference.messageId,
      );
    } catch (error) {
      console.warn(
        '[Rooivalk] failed to fetch referenced message for context',
        error,
      );
      return null;
    }

    const author = referenced.author.displayName ?? referenced.author.username;
    const content = referenced.content?.trim() ?? '';
    const attachments = Array.from(referenced.attachments.values())
      .filter((attachment) => this.isAttachmentAllowed(attachment))
      .map((attachment) => this.buildAttachmentForPrompt(attachment));

    if (!content && attachments.length === 0) {
      return null;
    }

    const parts: string[] = [];
    if (content) {
      parts.push(`"${content}"`);
    }
    if (attachments.length > 0) {
      const noun = attachments.length === 1 ? 'attachment' : 'attachments';
      parts.push(`(${attachments.length} ${noun})`);
    }

    return {
      prefix: `[Replying to ${author}: ${parts.join(' ')}]\n`,
      attachments,
    };
  }

  private normalizeContentType(contentType?: string | null): string | null {
    if (!contentType) {
      return null;
    }

    const [parsedContentType] = contentType.split(';');
    return parsedContentType ? parsedContentType.trim().toLowerCase() : null;
  }

  /**
   * Reloads the config for Rooivalk and propagates to child services.
   */
  reloadConfig(newConfig: InMemoryConfig) {
    this._config = newConfig;
    this._discord.reloadConfig(newConfig);
    this._chat.reloadConfig(newConfig);
    for (const profileChat of this._profileChats.values()) {
      profileChat.reloadConfig(newConfig);
    }
    this._openai.reloadConfig(newConfig);
  }

  private selectChatService(message: Message<boolean>): ChatService {
    if (this._profileChats.size === 0) {
      return this._chat;
    }

    const profile = matchProfile(message, this._config.profiles);
    if (!profile) {
      return this._chat;
    }

    return this._profileChats.get(profile.name) ?? this._chat;
  }

  private createToolExecutor(message: Message<boolean>): ToolExecutor {
    return buildToolExecutor({
      message,
      yr: this._yr,
      discord: this._discord,
      image: this._openai,
      memory: this._memory,
      steam: this._steam,
      github: this._github,
      createThread: (msg, name) => this.createRooivalkThread(msg, name),
      toolRoles: this._config.toolRoles,
    });
  }

  public async syncSteamAppList(): Promise<void> {
    await this._steam.syncAppList();
  }

  public pruneConversationResponses(olderThanMs: number): number {
    const pruned = this._memory.pruneConversationResponses(olderThanMs);
    if (pruned > 0) {
      console.log(
        `[Rooivalk] pruned ${pruned} expired conversation_responses rows`,
      );
    }
    return pruned;
  }

  public async processMessage(message: Message<boolean>) {
    try {
      const prompt = message.content
        .replace(this._discord.mentionRegex!, '')
        .trim();

      const lookupRef = resolveConversationLookupRef(message);
      const previousResponseId = lookupRef
        ? this._memory.getConversationResponseId(lookupRef)
        : null;

      const usersToMention = message.mentions.users.filter(
        (user) => user.id !== this._discord.client.user?.id,
      );

      const attachments = Array.from(message.attachments.values())
        .filter((attachment) => this.isAttachmentAllowed(attachment))
        .map((attachment) => this.buildAttachmentForPrompt(attachment));

      let finalPrompt = prompt;
      let referencedAttachments: AttachmentForPrompt[] = [];
      // Conversation-scoped context (referenced message + channel) is only
      // attached on the first turn. Once `previousResponseId` exists the
      // provider already retains it server-side, so re-sending it just bloats
      // the prompt — channel descriptions alone can be up to 2000 chars.
      if (!previousResponseId) {
        if (message.reference?.messageId) {
          const referencedContext =
            await this.loadReferencedMessageContext(message);
          if (referencedContext) {
            finalPrompt = `${referencedContext.prefix}${prompt}`;
            referencedAttachments = referencedContext.attachments;
          }
        }

        const channelContext = buildPromptChannel(message);
        if (channelContext) {
          finalPrompt = `${channelContext}\n${finalPrompt}`;
        }
      }

      const combinedAttachments = [...referencedAttachments, ...attachments];

      const toolExecutor = this.createToolExecutor(message);
      const chat = this.selectChatService(message);
      const preferences = this._memory.getPreferences(message.author.id);

      const response = await chat.createResponse(
        buildPromptAuthor(message.author),
        finalPrompt,
        previousResponseId,
        combinedAttachments.length > 0 ? combinedAttachments : null,
        toolExecutor,
        preferences,
      );

      if (!response) {
        await message.reply(this._discord.getRooivalkResponse('error'));
        return;
      }

      if (response.contextLost && lookupRef) {
        this._memory.clearConversationResponseId(lookupRef);
      }

      const reply = this._discord.buildMessageReply(
        response,
        usersToMention.map((user) => user.id),
      );

      if (response.contextLost) {
        reply.content =
          `*[the previous context of this conversation was lost in the void — starting fresh]*\n${reply.content ?? ''}`.trimEnd();
      }

      let botMessage: Message<boolean>;
      if (response.createdThread) {
        botMessage = await response.createdThread.send(reply);
      } else if (message.channel.isThread()) {
        botMessage = await message.channel.send(reply);
      } else {
        botMessage = await message.reply(reply);
      }

      if (response.responseId) {
        const storeRefs = resolveConversationStoreRefs(
          message,
          botMessage,
          response.createdThread?.id ?? null,
        );
        for (const ref of storeRefs) {
          this._memory.setConversationResponseId(ref, response.responseId);
        }
      }
    } catch (error) {
      console.error('Error processing message:', error);
      const errorMessage = this._discord.getRooivalkResponse('error');

      const reply =
        error instanceof Error
          ? `${errorMessage}\n\`\`\`${error.message}\`\`\``
          : errorMessage;

      if (message.channel.isThread()) {
        await message.channel.send(reply);
      } else {
        await message.reply(reply);
      }
      return;
    }
  }

  public async sendMotdToMotdChannel() {
    if (!this._config.motd) {
      console.log('No MOTD configured');
      return;
    }

    // set a date range of today
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    let motd = this._config.motd;
    const forecasts = await this._yr.getAllForecasts();
    const events = await this._discord.getGuildEventsBetween(start, end);

    // replace placeholders with JSON for the prompt
    motd = motd.replace(
      /{{WEATHER_FORECASTS_JSON}}/,
      JSON.stringify(forecasts || []),
    );
    motd = motd.replace(/{{EVENTS_JSON}}/, JSON.stringify(events || []));

    try {
      const response = await this._chat.createResponse('rooivalk', motd);

      const rawMotdContent = response.content?.trim();
      if (!rawMotdContent) {
        console.error('MOTD response was empty');
        return;
      }

      let motdImage: {
        heading: string;
        attribution: string;
        buffer: Buffer;
      } | null = null;

      // Deterministically pick today's city/style/aspect, steering away from
      // recently-used values (cooldowns scale with each pool's size). The model
      // only renders this fixed combination — it never re-picks — which is what
      // stops the daily image defaulting to the same style. The pick is
      // recorded inside `pickMotdSelection`.
      const cityNames = Object.values(YR_COORDINATES).map((l) => l.name);
      const { city, style, aspect } = this._memory.pickMotdSelection({
        cities: cityNames,
        styles: MOTD_IMAGE_STYLES,
        aspects: MOTD_CITY_ASPECTS,
      });
      const fallbackImagePrompt = `${style} depicting ${aspect} of ${city}. Vivid, detailed, atmospheric.`;

      // Prefer a fresh LLM-generated prompt for richer wording; fall back to the
      // deterministic style/aspect template if the model is unavailable.
      let imagePrompt = fallbackImagePrompt;
      try {
        const generatedPrompt = await this._openai.generateMotdImagePrompt(
          city,
          style,
          aspect,
        );
        if (generatedPrompt) {
          imagePrompt = generatedPrompt;
        }
      } catch (err) {
        console.error(`AI image prompt generation failed for ${city}:`, err);
      }

      try {
        const base64Image = await this._openai.createImage(imagePrompt);
        if (base64Image) {
          motdImage = {
            heading: city,
            attribution: imagePrompt,
            buffer: Buffer.from(base64Image, 'base64'),
          };
        }
      } catch (err) {
        console.error(`AI image generation failed for ${city}:`, err);
      }

      if (!motdImage) {
        console.warn('AI image generation failed. Falling back to Peapix.');
        try {
          const peapixImage = await this._peapix.getImage();
          if (peapixImage) {
            motdImage = {
              heading: peapixImage.title ?? 'Image of the day',
              attribution: peapixImage.copyright,
              buffer: peapixImage.buffer,
            };
          } else {
            console.warn('Peapix fallback returned no image.');
          }
        } catch (peapixErr) {
          console.error(
            'Peapix fallback image fetch threw an error:',
            peapixErr,
          );
        }
      }

      if (!motdImage) {
        console.error(
          'MOTD image sources exhausted: AI generation and Peapix both failed to provide an image. ' +
            'The MOTD will be sent without an image.',
        );
      }

      if (!this._discord.motdChannelId) {
        console.error('Channel ID not set');
        return;
      }

      const channel = await this._discord.client.channels.fetch(
        this._discord.motdChannelId,
      );
      if (!channel || !channel.isTextBased()) {
        console.error(
          `Cannot send MOTD: Channel ${this._discord.motdChannelId} is not text-based`,
        );
        return;
      }

      const messageOptions = this._discord.buildMessageReply({
        type: 'text',
        content: rawMotdContent,
        base64Images: [],
      });

      const files = [...(messageOptions.files ?? [])];
      const embeds = [...(messageOptions.embeds ?? [])];

      if (motdImage) {
        files.push(
          new AttachmentBuilder(motdImage.buffer, {
            name: MOTD_IMAGE_ATTACHMENT_NAME,
          }),
        );

        embeds.push(
          new EmbedBuilder({
            description: motdImage.heading,
            footer: {
              text: motdImage.attribution,
            },
            image: {
              url: `attachment://${MOTD_IMAGE_ATTACHMENT_NAME}`,
            },
          }),
        );
      }

      if (!('send' in channel)) {
        console.error(
          `Cannot send MOTD: Channel ${this._discord.motdChannelId} is not sendable`,
        );
        return;
      }

      await (channel as SendableChannels).send({
        ...messageOptions,
        files: files.length > 0 ? files : undefined,
        embeds: embeds.length > 0 ? embeds : undefined,
      });
    } catch (err) {
      console.error(`Error sending MOTD to channel:`, err);
    }
  }

  public async sendLeaderboardToMotdChannel(): Promise<void> {
    if (!this._discord.motdChannelId) {
      console.error('[Rooivalk] Leaderboard: MOTD channel ID not set');
      return;
    }

    const LEADERBOARD_LIMIT = 5;
    const now = Date.now();
    const windowStart = now - 7 * 24 * 60 * 60 * 1000;
    const guildId = process.env.DISCORD_GUILD_ID!;

    try {
      const messages = this._emoji.getTopMessages(
        guildId,
        windowStart,
        now,
        LEADERBOARD_LIMIT,
      );
      const givers = this._emoji.getTopGivers(
        guildId,
        windowStart,
        now,
        LEADERBOARD_LIMIT,
      );
      const emojis = this._emoji.getTopEmojis(
        guildId,
        windowStart,
        now,
        LEADERBOARD_LIMIT,
      );

      const channel = await this._discord.client.channels.fetch(
        this._discord.motdChannelId,
      );
      if (!channel || !channel.isTextBased() || !('send' in channel)) {
        console.error(
          `[Rooivalk] Leaderboard: channel ${this._discord.motdChannelId} is not sendable`,
        );
        return;
      }

      if (!messages.length && !givers.length && !emojis.length) {
        const msgs = this._config.leaderboardEmptyMessages;
        const msg =
          msgs.length > 0
            ? msgs[Math.floor(Math.random() * msgs.length)]!
            : 'Quieter than a ghost town in Pyongyang this week.';
        await (channel as SendableChannels).send({
          content: msg,
          allowedMentions: { users: [] },
        });
        return;
      }

      const embed = new EmbedBuilder({
        title: '🏆 Weekly Emoji Recap',
        description: 'Reactions from the last 7 days',
        color: LEADERBOARD_EMBED_COLOR,
      });

      if (messages.length) {
        embed.addFields({
          name: 'Most-loved messages',
          value: messages
            .map((m, i) => {
              const link = `https://discord.com/channels/${guildId}/${m.channel_id}/${m.message_id}`;
              const plural = m.count === 1 ? '' : 's';
              return `${leaderboardRank(i)} ${userMention(m.message_author_id)} — [${m.count} reaction${plural}](${link})`;
            })
            .join('\n'),
        });
      }

      if (givers.length) {
        embed.addFields({
          name: 'Most reactive',
          value: givers
            .map((g, i) => {
              const plural = g.count === 1 ? '' : 's';
              const fav = formatReactionEmoji(
                g.fav_emoji_id,
                g.fav_emoji_name,
                g.fav_emoji_animated,
              );
              return `${leaderboardRank(i)} ${userMention(g.user_id)} — ${g.count} reaction${plural} given — ${fav} is their favourite`;
            })
            .join('\n'),
        });
      }

      if (emojis.length) {
        embed.addFields({
          name: 'Top emojis',
          value: emojis
            .map((e, i) => {
              const emojiStr = formatReactionEmoji(
                e.emoji_id,
                e.emoji_name,
                e.emoji_animated,
              );
              const plural = e.count === 1 ? '' : 's';
              return `${leaderboardRank(i)} ${emojiStr} — ${e.count} use${plural}`;
            })
            .join('\n'),
        });
      }

      // Mentions inside an embed never notify — to actually ping the
      // featured users they must appear in the message content, and the
      // same IDs must be whitelisted in allowedMentions. Rooivalk never pings
      // itself: when its own message lands on the board it boasts instead.
      const rooivalkId = this._discord.client.user?.id;
      const rooivalkFeatured = messages.some(
        (m) => m.message_author_id === rooivalkId,
      );
      const featuredIds = [
        ...new Set([
          ...messages.map((m) => m.message_author_id),
          ...givers.map((g) => g.user_id),
        ]),
      ].filter((id) => id !== rooivalkId);

      const bowLine = featuredIds.length
        ? `🏆 This week's emoji recap — take a bow ${featuredIds
            .map((id) => userMention(id))
            .join(' ')}`
        : null;
      const boastLine = rooivalkFeatured
        ? this._discord.getRooivalkResponse('boast')
        : null;
      const content = [bowLine, boastLine].filter(Boolean).join('\n\n');

      await (channel as SendableChannels).send({
        content: content || undefined,
        embeds: [embed],
        allowedMentions: { users: featuredIds },
      });
    } catch (err) {
      console.error('[Rooivalk] Error sending leaderboard:', err);
    }
  }

  public async sendMessageToChannel(
    channelId: string | undefined,
    prompt: string,
  ) {
    if (!channelId) {
      console.error(`Channel ID not set`);
      return null;
    }

    try {
      const response = await this._chat.createResponse('rooivalk', prompt);

      const channel = await this._discord.client.channels.fetch(channelId);
      if (channel && channel.isTextBased()) {
        const messageOptions = this._discord.buildMessageReply(response);
        await (channel as any).send(messageOptions);
        return response;
      } else {
        console.error(`Channel: ${channelId} is not text-based`);
        return null;
      }
    } catch (err) {
      console.error(`Error sending message to channel:`, err);
      return null;
    }
  }

  private async handleSyncSteamCommand(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    if (!process.env.STEAM_API_KEY) {
      await interaction.reply({
        content: '`STEAM_API_KEY` is not configured — sync is unavailable.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    try {
      await this._steam.syncAppList();
      await interaction.editReply({ content: 'Steam app list sync complete.' });
    } catch (error) {
      console.error('Error syncing Steam app list:', error);
      const message = error instanceof Error ? error.message : String(error);
      await interaction.editReply({
        content: `Steam sync failed.\n\n\`\`\`${message}\`\`\``,
      });
    }
  }

  private async handleImageCommand(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const prompt = interaction.options.getString('prompt', true);
    await interaction.deferReply();

    try {
      const base64Image = await this._openai.createImage(prompt);

      if (base64Image) {
        const message = this._discord.buildImageReply(prompt, base64Image);

        await interaction.editReply({
          embeds: message.embeds,
          files: message.files,
        });
      } else {
        await interaction.editReply({
          content: this._discord.getRooivalkResponse('error'),
        });
      }
    } catch (error) {
      console.error('Error handling image command:', error);

      const errorMessage = this._discord.getRooivalkResponse('error');
      if (error instanceof Error) {
        await interaction.editReply({
          content: `${errorMessage}\n\n\`\`\`${error.message}\`\`\``,
        });
        return;
      } else {
        await interaction.editReply({
          content: errorMessage,
        });
        return;
      }
    }
  }

  public async handleWeatherCommand(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const city = interaction.options.getString('city', true);
    await interaction.deferReply();

    try {
      const weather = await this._yr.getForecastByLocation(city);
      if (!weather) {
        await interaction.editReply({
          content: this._discord.getRooivalkResponse('error'),
        });
        return;
      }

      const prompt = `
        You will be provided with a daily weather forecast in JSON format.

        ## Weather formatting
        - Include the friendlyName along with the country flag emoji.
        - Add a short description of the weather, including:
          - Average wind speed (m/s) and direction
          - Average humidity (%)
          - Total precipitation (mm) -- exclude this if it's 0
        - Add 1–2 relevant weather emojis.
        - Keep the style readable but punchy.
        - Do **not** mention the \`location\` value — it's for internal use only.
        - Mention the data is provided by yr.no under the CC BY 4.0 license. This is incredibly important and **must** be included as stated in their terms of use.

        ### Forecast Data
        \`\`\`json
        ${JSON.stringify(weather)}
        \`\`\`
      `;

      const response = await this._chat.createResponse(
        interaction.user.displayName,
        prompt,
      );
      await interaction.editReply({
        content: response.content,
      });
    } catch (error) {
      console.error('Error handling weather command:', error);
      const errorMessage = this._discord.getRooivalkResponse('error');
      const reply =
        error instanceof Error
          ? `${errorMessage}\n\n\`\`\`${error.message}\`\`\``
          : errorMessage;
      await interaction.editReply({ content: reply });
    }
  }

  public async createRooivalkThread(
    message: Message<boolean>,
    name?: string,
  ): Promise<ThreadChannel | null> {
    let threadName: string;

    const trimmedName = name?.trim();

    if (trimmedName && trimmedName.length > 0) {
      threadName = trimmedName.substring(0, 100);
    } else {
      const chat = this.selectChatService(message);
      threadName = await chat.generateThreadName(message.content.trim());
    }

    const thread = await message.startThread({
      name: threadName,
      autoArchiveDuration: 60,
    });
    await thread.members.add(message.author.id);

    return thread;
  }

  public async processMessageReaction(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
  ): Promise<void> {
    try {
      if (reaction.partial) reaction = await reaction.fetch();
      if (reaction.message.partial) await reaction.message.fetch();
      if (user.partial) user = await user.fetch();
    } catch (err) {
      console.error('[Rooivalk] Failed to fetch partial reaction data:', err);
      return;
    }

    if (reaction.message.guild?.id !== process.env.DISCORD_GUILD_ID) return;
    if (user.bot) return;
    if (!reaction.message.author) return;
    // Allow bot-authored messages only when they're rooivalk's own — this lets
    // the bot's messages compete on the leaderboard while still excluding every
    // other bot.
    const rooivalkId = this._discord.client.user?.id;
    if (
      reaction.message.author.bot &&
      reaction.message.author.id !== rooivalkId
    )
      return;
    if (user.id === reaction.message.author.id) return;

    try {
      this._emoji.recordReaction({
        guildId: process.env.DISCORD_GUILD_ID!,
        messageId: reaction.message.id,
        channelId: reaction.message.channelId,
        messageAuthorId: reaction.message.author.id,
        reactorId: user.id,
        emojiId: reaction.emoji.id ?? null,
        emojiName: reaction.emoji.name ?? 'unknown',
        emojiAnimated: reaction.emoji.animated ?? false,
      });
    } catch (err) {
      console.error('[Rooivalk] Failed to record emoji reaction:', err);
    }
  }

  /**
   * Replies to a lone social link (Instagram, Reddit, …) with a quirky
   * targeting-system quip and the same link rewritten to that platform's embed
   * host so the post renders in Discord.
   */
  public async processEmbedLink(
    message: Message<boolean>,
    { type, link }: RewrittenLink,
  ): Promise<void> {
    try {
      const reply = this._discord
        .getRooivalkResponse(type)
        .replace('{{LINK}}', link);

      await message.reply({
        content: reply,
        allowedMentions: { repliedUser: false },
      });
    } catch (err) {
      console.error(`[Rooivalk] Failed to fix ${type} link:`, err);
    }
  }

  public async init(): Promise<void> {
    const ready = new Promise<Client<boolean>>((res) =>
      this._discord.once(DiscordEvents.ClientReady, (client) => res(client)),
    );

    await this._discord.registerSlashCommands();

    this._discord.on(DiscordEvents.MessageCreate, async (message) => {
      if (!this.shouldProcessMessage(message, process.env.DISCORD_GUILD_ID!)) {
        return;
      }

      // Lone social links (Instagram, Reddit, …) get their embed fixed, no
      // mention required.
      const embedLink = await rewriteEmbedLink(message.content);
      if (embedLink) {
        await this.processEmbedLink(message, embedLink);
        return;
      }

      const isMentioned = this._discord.mentionRegex
        ? this._discord.mentionRegex.test(message.content)
        : false;
      const isInRooivalkThread = isRooivalkThread(
        message,
        this._discord.client.user?.id,
      );
      const isReply = await isReplyToRooivalk(
        message,
        this._discord.client.user?.id,
      );

      if (!isMentioned && !isInRooivalkThread && !isReply) {
        return;
      }

      await this.processMessage(message);
    });

    this._discord.on(DiscordEvents.MessageReactionAdd, async (reaction, user) =>
      this.processMessageReaction(reaction, user),
    );

    this._discord.on(
      DiscordEvents.InteractionCreate,
      async (interaction: Interaction) => {
        if (!interaction.isChatInputCommand()) return;

        switch (interaction.commandName) {
          case DISCORD_COMMANDS.IMAGE:
            await this.handleImageCommand(interaction);
            break;
          case DISCORD_COMMANDS.WEATHER:
            await this.handleWeatherCommand(interaction);
            break;
          case DISCORD_COMMANDS.SYNC_STEAM:
            await this.handleSyncSteamCommand(interaction);
            break;
          default:
            console.error(
              `Invalid command received: ${interaction.commandName}`,
            );
            await interaction.reply({
              content: `❌ Invalid command: \`${interaction.commandName}\`. Please use a valid command.`,
              ephemeral: true,
            });
            return;
        }
      },
    );

    // finally log in after all event handlers have been set up
    await this._discord.login();

    await ready;

    console.log(`🤖 Logged in as ${this._discord.client.user?.tag}`);

    this._discord.setupMentionRegex();
    this._discord.cacheGuildEmojis();

    await this._discord.sendReadyMessage();
  }
}

export default Rooivalk;
