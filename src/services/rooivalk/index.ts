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

import { DISCORD_EMOJI, DISCORD_MESSAGE_LIMIT } from '@/constants';
import { LLMClient } from '../llm/types';

import {
  ERROR_MESSAGES,
  EXCEEDED_DISCORD_LIMIT_MESSAGES,
  GREETING_MESSAGES,
} from './constants';

const MAX_MESSAGE_CHAIN_LENGTH = 10;

type DiscordMessage = OmitPartialGroupDMChannel<Message<boolean>>;
type RooivalkResponseType = 'error' | 'greeting' | 'discordLimit';

class Rooivalk {
  protected _discordClient: DiscordClient;
  protected _llmClient: LLMClient;
  protected _mentionRegex: RegExp | null = null;
  protected _startupChannelId: string | undefined;

  constructor(llmClient: LLMClient, discordClient?: DiscordClient) {
    this._llmClient = llmClient;
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
    const imageUrls = imageMatches
      .map((match) => match[1])
      .filter((url): url is string => typeof url === 'string');

    // Remove the image markdown tags from the content
    const contentWithoutImages = content.replace(imageRegex, '').trim();

    // Create embeds for the images
    const embeds = imageUrls.map((url) => ({ image: { url } }));

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

  private async getMessageChain(
    currentMessage: DiscordMessage
  ): Promise<{ author: 'user' | 'bot'; content: string }[]> {
    const messageChain: { author: 'user' | 'bot'; content: string }[] = [];
    let nextMessageToFetch = currentMessage;

    try {
      // Start with the message currently being replied to
      if (nextMessageToFetch.reference && nextMessageToFetch.reference.messageId) {
        let referencedMessage = await nextMessageToFetch.channel.messages.fetch(
          nextMessageToFetch.reference.messageId
        );

        while (referencedMessage && messageChain.length < MAX_MESSAGE_CHAIN_LENGTH) {
          messageChain.unshift({
            author:
              referencedMessage.author.id === this._discordClient.user?.id
                ? 'bot'
                : 'user',
            content: referencedMessage.content,
          });

          if (referencedMessage.reference && referencedMessage.reference.messageId) {
            referencedMessage = await referencedMessage.channel.messages.fetch(
              referencedMessage.reference.messageId
            );
          } else {
            break; // No more references, end of the chain
          }
        }
      }
    } catch (error) {
      console.error('Error fetching message chain:', error);
      // Return whatever was fetched so far, or an empty array if the first fetch failed
    }
    return messageChain;
  }

  private async processMessage(message: DiscordMessage) {
    try {
      let prompt = message.content.replace(this._mentionRegex!, '').trim();
      const isLearnChannel =
        message.channel.id === process.env.DISCORD_LEARN_CHANNEL_ID;

      // Check if the message is a reply and if it's replying to the bot
      if (message.reference && message.reference.messageId) {
        const repliedToMessage = await this.getOriginalMessage(message);
        if (repliedToMessage && repliedToMessage.author.id === this._discordClient.user?.id) {
          const messageChain = await this.getMessageChain(message);
          if (messageChain.length > 0) {
            const formattedChain = messageChain
              .map(
                (entry) =>
                  `${entry.author === 'user' ? 'User' : 'Bot'}: ${
                    entry.content
                  }`
              )
              .join('\n');
            prompt = `${formattedChain}\nUser: ${prompt}`;
          }
        }
      }

      const usersToMention = message.mentions.users.filter(
        (user) => user.id !== this._discordClient.user?.id
      );

      // prompt openai with the enhanced content
      const response = await this._llmClient.createResponse(
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

  /**
   * Helper to fetch the content of the original message if this message is a reply.
   * Returns the original message content, or null if not a reply or not found.
   */
  public async getOriginalMessage(message: DiscordMessage) {
    try {
      const reference = message.reference;
      if (!reference?.messageId) {
        return null;
      }
      // Fetch the original message from the same channel
      return await message.channel.messages.fetch(reference.messageId);
    } catch (error) {
      console.error('Error fetching original message:', error);
      return null;
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
      // Generate response from LLM
      const response = await this._llmClient.createResponse(persona, prompt);

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
      // Ignore messages from other bots or from different guilds
      if (
        message.author.bot ||
        message.guild?.id !== process.env.DISCORD_GUILD_ID
      ) {
        return;
      }

      // Check if the message is a reply to the bot
      let isReplyToBot = false;
      if (message.reference && message.reference.messageId) {
        const repliedToMessage = await this.getOriginalMessage(
          message as DiscordMessage
        );
        if (repliedToMessage && repliedToMessage.author.id === this._discordClient.user?.id) {
          isReplyToBot = true;
        }
      }

      // Check if the bot is mentioned directly
      const isMentioned =
        this._mentionRegex && this._mentionRegex.test(message.content);

      // If not a reply to the bot and not mentioned, ignore the message
      if (!isReplyToBot && !isMentioned) {
        return;
      }

      // If mentionRegex is null (bot not fully initialized), and it's not a reply to the bot, ignore.
      // This prevents processing messages that aren't direct mentions if the regex isn't ready,
      // unless it's a reply to the bot, which doesn't strictly need the regex.
      if (!this._mentionRegex && !isReplyToBot) {
        console.warn(
          'Mention regex not initialized, ignoring non-reply message.'
        );
        return;
      }

      this.processMessage(message as DiscordMessage);
    });

    this._discordClient.on(
      DiscordEvents.MessageReactionAdd,
      async (reaction) => {
        // Ignore reactions from:
        // 1. Other bots
        // 2. Messages not from the specified guild (server)
        if (reaction.message.guild?.id !== process.env.DISCORD_GUILD_ID) {
          return;
        }

        const isRooivalkMessage =
          reaction.message?.author?.id === this._discordClient.user?.id;

        if (reaction.emoji.name === DISCORD_EMOJI) {
          const message = reaction.message as DiscordMessage;
          if (isRooivalkMessage) {
            const originalPrompt = await this.getOriginalMessage(message);
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
            const response = await this._llmClient.createResponse(
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
