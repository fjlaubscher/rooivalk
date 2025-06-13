import { Events as DiscordEvents } from 'discord.js';
import type {
  ChatInputCommandInteraction,
  Interaction,
  TextChannel,
} from 'discord.js';

import { DISCORD_COMMANDS, DISCORD_EMOJI } from '@/constants';
import OpenAIClient from '@/services/openai';
import { DiscordService } from '@/services/discord';
import type { DiscordMessage } from '@/services/discord';

import type { InMemoryConfig } from '@/types';

class Rooivalk {
  protected _config: InMemoryConfig;
  protected _discord: DiscordService;
  protected _openaiClient: OpenAIClient;
  private _allowedAppIds: string[];

  constructor(
    config: InMemoryConfig,
    discordService?: DiscordService,
    openaiClient?: OpenAIClient
  ) {
    this._config = config;
    this._openaiClient = openaiClient ?? new OpenAIClient(this._config);
    this._discord = discordService ?? new DiscordService(this._config);

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
    this._openaiClient.reloadConfig(newConfig);
  }

  private async processMessage(message: DiscordMessage) {
    try {
      let prompt = message.content
        .replace(this._discord.mentionRegex!, '')
        .trim();
      const isLearnChannel =
        message.channel.id === process.env.DISCORD_LEARN_CHANNEL_ID;

      // Use DiscordService helper to build prompt from message chain if replying to bot
      const chainPrompt =
        await this._discord.buildPromptFromMessageChain(message);
      if (chainPrompt) {
        prompt = chainPrompt;
      }

      const usersToMention = message.mentions.users.filter(
        (user) => user.id !== this._discord.client.user?.id
      );

      // prompt openai with the enhanced content
      const response = await this._openaiClient.createResponse(
        isLearnChannel ? 'learn' : 'rooivalk',
        prompt
      );

      if (response) {
        const reply = this._discord.buildMessageReply(
          response,
          usersToMention.map((user) => user.id)
        );
        if (message.thread) {
          await message.thread.send(reply);
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
          ? `${errorMessage}\n\n\`\`\`${error.message}\`\`\``
          : errorMessage;

      if (message.thread) {
        await message.thread.send(reply);
      } else {
        await message.reply(reply);
      }
      return;
    }
  }

  public async sendMotdToStartupChannel() {
    if (!this._config.motd) {
      console.log('No MOTD configured');
      return;
    }

    await this.sendMessageToStartupChannel(this._config.motd);
  }

  public async sendMessageToStartupChannel(
    prompt: string,
    persona: 'rooivalk' | 'learn' = 'rooivalk'
  ) {
    if (!this._discord.startupChannelId) {
      console.error('Startup channel ID not set');
      return null;
    }

    try {
      // Generate response from OpenAI
      const response = await this._openaiClient.createResponse(persona, prompt);

      // Send the response to the startup channel
      const channel = await this._discord.client.channels.fetch(
        this._discord.startupChannelId
      );
      if (channel && channel.isTextBased()) {
        const messageOptions = this._discord.buildMessageReply(response);
        await (channel as any).send(messageOptions);
        return response;
      } else {
        console.error('Startup channel is not text-based');
        return null;
      }
    } catch (err) {
      console.error('Error sending message to startup channel:', err);
      return null;
    }
  }

  private async handleLearnCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const prompt = interaction.options.getString('prompt', true);
    await interaction.deferReply();

    try {
      const response = await this._openaiClient.createResponse('learn', prompt);
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
      const base64Image = await this._openaiClient.createImage(prompt);

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
        (await this._openaiClient.generateThreadName(prompt)) ||
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

      const response = await this._openaiClient.createResponse(
        'rooivalk',
        prompt
      );
      if (response) {
        const chunks = this._discord.chunkContent(response);
        for (const chunk of chunks) {
          await thread.send(chunk);
        }
        await interaction.editReply({
          content: `Thread created: ${threadName}`,
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

  public init(): Promise<void> {
    return new Promise(async (resolve) => {
      this._discord.once(DiscordEvents.ClientReady, async () => {
        console.log(`🤖 Logged in as ${this._discord.client.user?.tag}`);

        this._discord.setupMentionRegex();

        await this._discord.sendReadyMessage();
        resolve(); // Resolve the promise when ClientReady is fired
      });

      await this._discord.registerSlashCommands();

      this._discord.on(DiscordEvents.MessageCreate, async (message) => {
        if (
          !this.shouldProcessMessage(message, process.env.DISCORD_GUILD_ID!)
        ) {
          return;
        }

        // Check if the message is a reply to the bot
        let isReplyToBot = false;
        if (message.reference && message.reference.messageId) {
          const repliedToMessage = await this._discord.getReferencedMessage(
            message as DiscordMessage
          );
          if (
            repliedToMessage &&
            repliedToMessage.author.id === this._discord.client.user?.id
          ) {
            isReplyToBot = true;
          }
        }

        // Check if the bot is mentioned directly
        const isMentioned =
          this._discord.mentionRegex &&
          this._discord.mentionRegex.test(message.content);

        // If not a reply to the bot and not mentioned, ignore the message
        if (!isReplyToBot && !isMentioned) {
          return;
        }

        // If mentionRegex is null (bot not fully initialized), and it's not a reply to the bot, ignore.
        if (!this._discord.mentionRegex && !isReplyToBot) {
          console.warn(
            'Mention regex not initialized, ignoring non-reply message.'
          );
          return;
        }

        this.processMessage(message as DiscordMessage);
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
    });
  }
}

export default Rooivalk;
