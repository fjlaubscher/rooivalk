import {
  Client as DiscordClient,
  Events as DiscordEvents,
  GatewayIntentBits,
  AttachmentBuilder,
  userMention,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
} from 'discord.js';
import type {
  Message,
  MessageReplyOptions,
  OmitPartialGroupDMChannel,
  TextChannel,
  Interaction,
} from 'discord.js';

import { DISCORD_MESSAGE_LIMIT, DISCORD_RETRY_EMOJI } from '@/constants';
import OpenAIClient from '@/services/openai';

import {
  ERROR_MESSAGES,
  EXCEEDED_DISCORD_LIMIT_MESSAGES,
  GREETING_MESSAGES,
} from './constants';

type DiscordMessage = OmitPartialGroupDMChannel<Message<boolean>>;
type RooivalkResponseType = 'error' | 'greeting' | 'discordLimit';

class Rooivalk {
  protected _discordClient: DiscordClient;
  protected _openaiClient: OpenAIClient;
  protected _mentionRegex: RegExp | null = null;
  protected _startupChannelId: string | undefined;

  constructor(openaiClient?: OpenAIClient, discordClient?: DiscordClient) {
    this._openaiClient = openaiClient ?? new OpenAIClient();
    this._discordClient =
      discordClient ??
      new DiscordClient({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.GuildMessageReactions,
          GatewayIntentBits.MessageContent,
        ],
      });
    this._startupChannelId = process.env.DISCORD_STARTUP_CHANNEL_ID;
  }

  private getRooivalkResponse(type: RooivalkResponseType): string {
    let arrayToUse = [];

    switch (type) {
      case 'error':
        arrayToUse = ERROR_MESSAGES;
        break;
      case 'greeting':
        arrayToUse = GREETING_MESSAGES;
        break;
      case 'discordLimit':
        arrayToUse = EXCEEDED_DISCORD_LIMIT_MESSAGES;
        break;
      default:
        throw new Error('Invalid response type');
    }

    const index = Math.floor(Math.random() * arrayToUse.length);
    return arrayToUse[index]!;
  }

  private async sendReadyMessage() {
    if (this._startupChannelId) {
      try {
        const channel = await this._discordClient.channels.fetch(
          this._startupChannelId
        );
        if (channel && channel.isTextBased()) {
          await (channel as TextChannel).send(
            this.getRooivalkResponse('greeting')
          );
        }
      } catch (err) {
        console.error('Error sending ready message:', err);
      }
    }
  }

  private async buildMessageReply(
    content: string,
    allowedMentions: string[] = []
  ): Promise<MessageReplyOptions> {
    // Extract image URLs from markdown image tags
    const imageRegex =
      /!\[.*?\]\((https?:\/\/.*?\.(?:png|jpe?g|gif|webp)(?:\?.*?)?)\)/g;
    const imageMatches = [...content.matchAll(imageRegex)];
    const imageUrls = imageMatches.map((match) => match[1]);

    // Remove the image markdown tags from the content
    const contentWithoutImages = content.replace(imageRegex, '').trim();

    // Create embeds for the images
    const embeds = imageUrls.map((url) => new EmbedBuilder().setImage(url!));

    // if the content is too long, send it as an attachment
    if (contentWithoutImages.length > DISCORD_MESSAGE_LIMIT) {
      const attachment = new AttachmentBuilder(
        Buffer.from(contentWithoutImages, 'utf-8'),
        {
          name: 'rooivalk.md',
        }
      );

      return {
        content: this.getRooivalkResponse('discordLimit'),
        files: [attachment],
        allowedMentions: {
          users: allowedMentions,
        },
        embeds: embeds.length > 0 ? embeds : undefined,
      };
    }

    return {
      content: contentWithoutImages,
      allowedMentions: {
        users: allowedMentions,
      },
      embeds: embeds.length > 0 ? embeds : undefined,
    };
  }

  private async processMessage(message: DiscordMessage) {
    try {
      // switch to a more serious tone if the message is in the learn channel
      const isLearnChannel =
        message.channel.id === process.env.DISCORD_LEARN_CHANNEL_ID;

      const prompt = message.content.replace(this._mentionRegex!, '').trim();
      const usersToMention = message.mentions.users.filter(
        (user) => user.id !== this._discordClient.user?.id
      );

      // prompt openai with the enhanced content
      const response = await this._openaiClient.createResponse(
        isLearnChannel ? 'rooivalk-learn' : 'rooivalk',
        prompt
      );

      if (response) {
        const reply = await this.buildMessageReply(
          response,
          usersToMention.map((user) => user.id)
        );
        await message.reply(reply);
      } else {
        await message.reply(this.getRooivalkResponse('error'));
      }
    } catch (error) {
      console.error('Error processing message:', error);
      const errorMessage = this.getRooivalkResponse('error');

      if (error instanceof Error) {
        const reply = `${errorMessage}\n\n\`\`\`${error.message}\`\`\``;
        await message.reply(reply);
      } else {
        await message.reply(errorMessage);
      }
    }
  }

  public async registerSlashCommands() {
    const rest = new REST({ version: '10' }).setToken(
      process.env.DISCORD_TOKEN!
    );
    const commands = [
      new SlashCommandBuilder()
        .setName('learn')
        .setDescription('Learn with @rooivalk!')
        .addStringOption((option) =>
          option
            .setName('prompt')
            .setDescription('Your question or prompt')
            .setRequired(true)
        )
        .toJSON(),
    ];
    try {
      await rest.put(
        Routes.applicationGuildCommands(
          process.env.DISCORD_APP_ID!,
          process.env.DISCORD_GUILD_ID!
        ),
        { body: commands }
      );
      console.log('Successfully registered /learn slash command.');
    } catch (error) {
      console.error('Error registering slash command:', error);
    }
  }

  public async sendMessageToStartupChannel(
    prompt: string,
    persona: 'rooivalk' | 'rooivalk-learn' = 'rooivalk'
  ) {
    if (!this._startupChannelId) {
      console.error('Startup channel ID not set');
      return null;
    }

    try {
      // Generate response from OpenAI
      const response = await this._openaiClient.createResponse(persona, prompt);

      // Send the response to the startup channel
      const channel = await this._discordClient.channels.fetch(
        this._startupChannelId
      );
      if (channel && channel.isTextBased()) {
        const messageOptions = await this.buildMessageReply(response);
        await (channel as TextChannel).send(messageOptions);
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

  public async init() {
    this._discordClient.once(DiscordEvents.ClientReady, async () => {
      console.log(`🤖 Logged in as ${this._discordClient.user?.tag}`);

      if (this._discordClient.user?.id) {
        this._mentionRegex = new RegExp(
          userMention(this._discordClient.user.id),
          'g'
        );
      }

      await this.sendReadyMessage();
    });

    await this.registerSlashCommands();

    this._discordClient.on(DiscordEvents.MessageCreate, async (message) => {
      // Ignore messages from:
      // 1. Other bots
      // 2. Messages not from the specified guild (server)
      // 3. Messages that don't mention the bot
      if (
        message.author.bot ||
        message.guild?.id !== process.env.DISCORD_GUILD_ID ||
        !this._mentionRegex ||
        !this._mentionRegex.test(message.content)
      ) {
        return;
      }

      this.processMessage(message);
    });

    this._discordClient.on(
      DiscordEvents.MessageReactionAdd,
      async (reaction) => {
        // Ignore reactions from:
        // 1. Other bots
        // 2. Messages not from the specified guild (server)
        if (
          reaction.message.author?.bot ||
          reaction.message.guild?.id !== process.env.DISCORD_GUILD_ID
        ) {
          return;
        }

        console.log('what is the reaction', reaction.emoji.name);
        if (reaction.emoji.name === DISCORD_RETRY_EMOJI) {
          const message = reaction.message as DiscordMessage;
          await this.processMessage(message);
        }
      }
    );

    this._discordClient.on(
      DiscordEvents.InteractionCreate,
      async (interaction: Interaction) => {
        if (!interaction.isChatInputCommand()) return;

        if (interaction.commandName === 'learn') {
          const prompt = interaction.options.getString('prompt', true);
          await interaction.deferReply();

          try {
            const response = await this._openaiClient.createResponse(
              'rooivalk-learn',
              prompt
            );
            const messageOptions = await this.buildMessageReply(response);
            // Convert MessageReplyOptions to InteractionEditReplyOptions
            await interaction.editReply({
              content: messageOptions.content,
              embeds: messageOptions.embeds,
              files: messageOptions.files,
            });
          } catch (error) {
            await interaction.editReply({
              content: this.getRooivalkResponse('error'),
            });
          }
        }
      }
    );

    // finally log in after all event handlers have been set up
    this._discordClient.login(process.env.DISCORD_TOKEN);
  }
}

export default Rooivalk;
