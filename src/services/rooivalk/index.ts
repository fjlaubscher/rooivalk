import { Events as DiscordEvents } from 'discord.js';
import type {
  ChatInputCommandInteraction,
  Client,
  Interaction,
  TextChannel,
  ThreadChannel,
} from 'discord.js';

import {
  ALLOWED_ATTACHMENT_CONTENT_TYPES,
  DISCORD_COMMANDS,
  DISCORD_EMOJI,
} from '@/constants';
import DiscordService from '@/services/discord';
import type { DiscordMessage } from '@/services/discord';
import OpenAIService from '@/services/openai';
import YrService from '@/services/yr';

import type { InMemoryConfig } from '@/types';

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
    yrService?: YrService
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
    message: DiscordMessage,
    guildId: string
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

  private async processMessage(
    message: DiscordMessage,
    targetChannel?: ThreadChannel
  ) {
    try {
      let prompt = message.content
        .replace(this._discord.mentionRegex!, '')
        .trim();

      let conversationHistory: string | null = null;

      if (message.channel.isThread()) {
        conversationHistory =
          await this._discord.buildPromptFromMessageThread(message);
      } else {
        conversationHistory =
          await this._discord.buildPromptFromMessageChain(message);
      }

      const usersToMention = message.mentions.users.filter(
        (user) => user.id !== this._discord.client.user?.id
      );

      // filter attachments to only those with allowed content types
      const attachmentUrls = message.attachments
        .filter((attachment) =>
          attachment.contentType
            ? ALLOWED_ATTACHMENT_CONTENT_TYPES.includes(attachment.contentType)
            : false
        )
        .map((attachment) => attachment.url);

      // prompt openai with the enhanced content
      const response = await this._openai.createResponse(
        'rooivalk',
        prompt,
        this._discord.allowedEmojis,
        conversationHistory,
        attachmentUrls.length > 0 ? attachmentUrls : null
      );

      if (response) {
        const reply = this._discord.buildMessageReply(
          response,
          usersToMention.map((user) => user.id)
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
      JSON.stringify(forecasts || [])
    );
    motd = motd.replace(/{{EVENTS_JSON}}/, JSON.stringify(events || []));

    // finally send the message
    await this.sendMessageToMotdChannel(motd);
  }

  public async sendMessageToStartupChannel(
    prompt: string,
    persona: 'rooivalk' | 'learn' = 'rooivalk',
    suffix?: string
  ) {
    return this.sendMessageToChannel(
      this._discord.startupChannelId,
      'startup',
      prompt,
      persona,
      suffix
    );
  }

  public async sendMessageToMotdChannel(
    prompt: string,
    persona: 'rooivalk' | 'learn' = 'rooivalk',
    suffix?: string
  ) {
    return this.sendMessageToChannel(
      this._discord.motdChannelId,
      'motd',
      prompt,
      persona,
      suffix
    );
  }

  private async sendMessageToChannel(
    channelId: string | undefined,
    label: string,
    prompt: string,
    persona: 'rooivalk' | 'learn' = 'rooivalk',
    suffix?: string
  ) {
    if (!channelId) {
      console.error(
        `${label.charAt(0).toUpperCase() + label.slice(1)} channel ID not set`
      );
      return null;
    }

    try {
      const response = await this._openai.createResponse(
        persona,
        prompt,
        this._discord.allowedEmojis,
        undefined
      );
      const content = suffix ? `${response}\n${suffix}` : response;
      const channel = await this._discord.client.channels.fetch(channelId);
      if (channel && channel.isTextBased()) {
        const messageOptions = this._discord.buildMessageReply(content);
        await (channel as any).send(messageOptions);
        return response;
      } else {
        console.error(
          `${label.charAt(0).toUpperCase() + label.slice(1)} channel is not text-based`
        );
        return null;
      }
    } catch (err) {
      console.error(`Error sending message to ${label} channel:`, err);
      return null;
    }
  }

  private async handleLearnCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const prompt = interaction.options.getString('prompt', true);
    await interaction.deferReply();

    try {
      const response = await this._openai.createResponse(
        'learn',
        prompt,
        [],
        undefined
      );
      const messageOptions = this._discord.buildMessageReply(response);
      // Convert MessageReplyOptions to InteractionEditReplyOptions
      await interaction.editReply({
        content: messageOptions.content,
        files: messageOptions.files,
      });
    } catch (error) {
      console.error('Error handling learn command:', error);

      await interaction.editReply({
        content: this._discord.getRooivalkResponse('error'),
      });
      return;
    }
  }

  private async handleImageCommand(
    interaction: ChatInputCommandInteraction
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

  private async handleThreadCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const prompt = interaction.options.getString('prompt', true);
    await interaction.deferReply();

    try {
      const threadName =
        (await this._openai.generateThreadName(prompt)) ||
        'Conversation with rooivalk';

      const thread = await (interaction.channel as TextChannel)?.threads.create(
        {
          name: threadName,
          autoArchiveDuration: 60,
        }
      );

      if (!thread) {
        await interaction.editReply({
          content: this._discord.getRooivalkResponse('error'),
        });
        return;
      }

      // echo the prompt in the new thread
      await thread.send(`>>> ${prompt}`);

      const response = await this._openai.createResponse(
        'rooivalk',
        prompt,
        this._discord.allowedEmojis,
        undefined
      );

      if (response) {
        const chunks = this._discord.chunkContent(response);
        for (const chunk of chunks) {
          try {
            await thread.send(chunk);
          } catch (error) {
            console.error('Error sending chunk to thread:', error);
          }
        }

        await interaction.editReply({
          content: `${interaction.user} created a thread.\n>>> ${prompt}`,
        });
      } else {
        await interaction.editReply({
          content: this._discord.getRooivalkResponse('error'),
        });
      }
    } catch (error) {
      console.error('Error handling thread command:', error);
      await interaction.editReply({
        content: this._discord.getRooivalkResponse('error'),
      });
    }
  }

  public async handleWeatherCommand(
    interaction: ChatInputCommandInteraction
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
            - Average precipitation (mm) -- exclude this if it's 0
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
          'rooivalk',
          prompt,
          this._discord.allowedEmojis
        );
        await interaction.editReply({
          content: response,
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

  public async init(): Promise<void> {
    const ready = new Promise<Client<boolean>>((res) =>
      this._discord.once(DiscordEvents.ClientReady, (client) => res(client))
    );

    await this._discord.registerSlashCommands();

    this._discord.on(DiscordEvents.MessageCreate, async (message) => {
      if (!this.shouldProcessMessage(message, process.env.DISCORD_GUILD_ID!)) {
        return;
      }

      // Check if the message is in a thread (not creating a thread)
      let isInBotThread = false;
      if (message.channel.isThread()) {
        const thread = message.channel;
        // Check if this thread was created by the bot by examining the starter message
        try {
          const starterMessage = await thread.fetchStarterMessage();
          if (starterMessage) {
            // If the starter message is a reply to the bot, then the bot created this thread
            const repliedToMessage =
              await this._discord.getReferencedMessage(starterMessage);
            if (
              repliedToMessage &&
              repliedToMessage.author.id === this._discord.client.user?.id
            ) {
              isInBotThread = true;
            }
          }
        } catch (error) {
          console.error('Error checking thread ownership:', error);
        }
      }

      // Check if the message is a reply to the bot
      let isReplyToBot = false;
      if (message.reference?.messageId) {
        const repliedToMessage = await this._discord.getReferencedMessage(
          message as DiscordMessage
        );

        if (
          repliedToMessage &&
          repliedToMessage.author.id === this._discord.client.user?.id
        ) {
          isReplyToBot = true;

          // since the user is replying to the bot, create a thread to continue the discussion
          if (!isInBotThread) {
            const history =
              await this._discord.buildPromptFromMessageChain(message);
            const threadName = await this._openai.generateThreadName(
              history ?? message.content.trim()
            );
            const thread = await message.startThread({
              name: threadName,
              autoArchiveDuration: 60,
            });
            await thread.members.add(message.author.id);

            // Process the message in the newly created thread
            await this.processMessage(message as DiscordMessage, thread);
            return;
          }
        }
      }

      // Check if the bot is mentioned directly
      const isMentioned =
        this._discord.mentionRegex &&
        this._discord.mentionRegex.test(message.content);

      // If not a reply to the bot and not mentioned and not in a bot thread, ignore the message
      if (!isReplyToBot && !isMentioned && !isInBotThread) {
        return;
      }

      // If mentionRegex is null (bot not fully initialized), and it's not a reply to the bot or bot thread, ignore.
      if (!this._discord.mentionRegex && !isReplyToBot && !isInBotThread) {
        console.warn(
          'Mention regex not initialized, ignoring non-reply message.'
        );
        return;
      }

      // Process the message (thread messages, replies, and mentions are all processed)
      await this.processMessage(message as DiscordMessage);
    });

    this._discord.on(DiscordEvents.MessageReactionAdd, async (reaction) => {
      // Ignore reactions from:
      // 1. Other bots
      // 2. Messages not from the specified guild (server)
      if (reaction.message.guild?.id !== process.env.DISCORD_GUILD_ID) {
        return;
      }

      const isRooivalkMessage =
        reaction.message?.author?.id === this._discord.client.user?.id;

      if (reaction.emoji.name === DISCORD_EMOJI) {
        const message = reaction.message as DiscordMessage;
        if (isRooivalkMessage) {
          const originalPrompt =
            await this._discord.getOriginalMessage(message);
          if (originalPrompt) {
            await reaction.message.delete();
            await this.processMessage(originalPrompt as DiscordMessage);
          } else {
            console.error(
              'Original message not found or not a reply to a message'
            );
          }
        } else {
          // if the message is not from Rooivalk, we need to reformat it to be a prompt
          const messageAsPrompt = `The following message is given as context, explain it: ${message.content}`;
          message.content = messageAsPrompt;
          await this.processMessage(message);
        }
      }
    });

    this._discord.on(
      DiscordEvents.InteractionCreate,
      async (interaction: Interaction) => {
        if (!interaction.isChatInputCommand()) return;

        switch (interaction.commandName) {
          case DISCORD_COMMANDS.LEARN:
            await this.handleLearnCommand(interaction);
            break;
          case DISCORD_COMMANDS.IMAGE:
            await this.handleImageCommand(interaction);
            break;
          case DISCORD_COMMANDS.THREAD:
            await this.handleThreadCommand(interaction);
            break;
          case DISCORD_COMMANDS.WEATHER:
            await this.handleWeatherCommand(interaction);
            break;
          default:
            console.error(
              `Invalid command received: ${interaction.commandName}`
            );
            await interaction.reply({
              content: `❌ Invalid command: \`${interaction.commandName}\`. Please use a valid command.`,
              ephemeral: true,
            });
            return;
        }
      }
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
