import { Events as DiscordEvents } from 'discord.js';
import type {
  ChatInputCommandInteraction,
  Client,
  Interaction,
  ThreadChannel,
  Message,
  MessageReaction,
  PartialMessageReaction,
} from 'discord.js';

import {
  ALLOWED_ATTACHMENT_CONTENT_TYPES,
  DISCORD_COMMANDS,
} from '@/constants';
import DiscordService from '@/services/discord';
import OpenAIService from '@/services/openai';
import YrService from '@/services/yr';

import type { InMemoryConfig } from '@/types';

import {
  isReplyToRooivalk,
  isRooivalkThread,
  buildPromptAuthor,
} from './helpers';

class Rooivalk {
  protected _config: InMemoryConfig;
  protected _discord: DiscordService;
  protected _openai: OpenAIService;
  protected _yr: YrService;
  private _allowedAppIds: string[];

  constructor(
    config: InMemoryConfig,
    discordService?: DiscordService,
    openaiService?: OpenAIService,
    yrService?: YrService,
  ) {
    this._config = config;
    this._discord = discordService ?? new DiscordService(this._config);
    this._openai = openaiService ?? new OpenAIService(this._config);
    this._yr = yrService ?? new YrService();

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

  /**
   * Reloads the config for Rooivalk and propagates to child services.
   */
  reloadConfig(newConfig: InMemoryConfig) {
    this._config = newConfig;
    this._discord.reloadConfig(newConfig);
    this._openai.reloadConfig(newConfig);
  }

  public async processMessage(
    message: Message<boolean>,
    targetChannel?: ThreadChannel,
  ) {
    try {
      let prompt = message.content
        .replace(this._discord.mentionRegex!, '')
        .trim();

      let conversationHistory: string | null = null;

      if (message.channel.isThread()) {
        conversationHistory =
          await this._discord.buildMessageChainFromThreadMessage(message);
      } else {
        conversationHistory =
          await this._discord.buildMessageChainFromMessage(message);
      }

      const usersToMention = message.mentions.users.filter(
        (user) => user.id !== this._discord.client.user?.id,
      );

      // filter attachments to only those with allowed content types
      const attachmentUrls = message.attachments
        .filter((attachment) =>
          attachment.contentType
            ? ALLOWED_ATTACHMENT_CONTENT_TYPES.includes(attachment.contentType)
            : false,
        )
        .map((attachment) => attachment.url);

      // prompt openai with the enhanced content
      const response = await this._openai.createResponse(
        buildPromptAuthor(message.author),
        prompt,
        this._discord.allowedEmojis,
        conversationHistory,
        attachmentUrls.length > 0 ? attachmentUrls : null,
      );

      if (response) {
        const reply = this._discord.buildMessageReply(
          response,
          usersToMention.map((user) => user.id),
        );
        if (targetChannel) {
          await targetChannel.send(reply);
        } else if (message.channel.isThread()) {
          await message.channel.send(reply);
        } else {
          await message.reply(reply);
        }
      } else {
        await message.reply(this._discord.getRooivalkResponse('error'));
      }
    } catch (error) {
      console.error('Error processing message:', error);
      const errorMessage = this._discord.getRooivalkResponse('error');

      const reply =
        error instanceof Error
          ? `${errorMessage}\n\`\`\`${error.message}\`\`\``
          : errorMessage;

      if (targetChannel) {
        await targetChannel.send(reply);
      } else if (message.channel.isThread()) {
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

    // finally send the message
    await this.sendMessageToChannel(this._discord.motdChannelId, motd);
  }

  public async sendQotdToMotdChannel(): Promise<void> {
    if (!this._config.qotd) {
      console.log('No QOTD configured');
      return;
    }

    const qotd = this._config.qotd;
    await this.sendMessageToChannel(this._discord.motdChannelId, qotd);
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
      const response = await this._openai.createResponse(
        'rooivalk',
        prompt,
        this._discord.allowedEmojis,
        undefined,
      );

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

    if (city) {
      const weather = await this._yr.getForecastByLocation(city);
      if (weather) {
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
          - Do **not** mention the \`location\` value — it’s for internal use only.
          - Mention the data is provided by yr.no under the CC BY 4.0 license. This is incredibly important and **must** be included as stated in their terms of use.

          ### Forecast Data
          \`\`\`json
          ${JSON.stringify(weather)}
          \`\`\`
        `;

        const response = await this._openai.createResponse(
          interaction.user.displayName,
          prompt,
          this._discord.allowedEmojis,
        );
        await interaction.editReply({
          content: response.content,
        });
      } else {
        await interaction.editReply({
          content: this._discord.getRooivalkResponse('error'),
        });
      }
    } else {
      await interaction.editReply({
        content: this._discord.getRooivalkResponse('error'),
      });
    }
  }

  public async createRooivalkThread(
    message: Message<boolean>,
  ): Promise<ThreadChannel | null> {
    const history = await this._discord.buildMessageChainFromMessage(message);
    const threadName = await this._openai.generateThreadName(
      history ?? message.content.trim(),
    );
    const thread = await message.startThread({
      name: threadName,
      autoArchiveDuration: 60,
    });
    await thread.members.add(message.author.id);

    return thread;
  }

  public async processMessageReaction(
    reaction: MessageReaction | PartialMessageReaction,
  ) {
    // Ignore reactions from:
    // 1. Other bots
    // 2. Messages not from the specified guild (server)
    if (reaction.message.guild?.id !== process.env.DISCORD_GUILD_ID) {
      return;
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

      const isMentioned = this._discord.mentionRegex
        ? this._discord.mentionRegex.test(message.content)
        : false;
      const isInRooivalkThread = await isRooivalkThread(
        message,
        this._discord.client.user?.id,
      );
      const isReply = await isReplyToRooivalk(
        message,
        this._discord.client.user?.id,
      );

      if (!isInRooivalkThread && isReply) {
        // If the message is a reply to Rooivalk, create a thread to continue the discussion
        const thread = await this.createRooivalkThread(message);
        if (thread) {
          // Process the message in the newly created thread
          await this.processMessage(message, thread);
        }
        return;
      }

      // If not a reply to the bot and not mentioned and not in a bot thread, ignore the message
      if (!isMentioned && !isInRooivalkThread) {
        return;
      }

      // Process the message (thread messages, replies, and mentions are all processed)
      await this.processMessage(message);
    });

    this._discord.on(DiscordEvents.MessageReactionAdd, async (reaction) =>
      this.processMessageReaction(reaction),
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
