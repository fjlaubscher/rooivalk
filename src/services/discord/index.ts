import {
  Client as DiscordClient,
  GatewayIntentBits,
  AttachmentBuilder,
  userMention,
  REST,
  Routes,
  SlashCommandBuilder,
} from 'discord.js';
import type {
  Message,
  MessageReplyOptions,
  OmitPartialGroupDMChannel,
  TextChannel,
  ClientEvents,
} from 'discord.js';

import {
  DISCORD_MESSAGE_LIMIT,
  DISCORD_MAX_MESSAGE_CHAIN_LENGTH,
} from '@/constants';
import {
  ERROR_MESSAGES,
  EXCEEDED_DISCORD_LIMIT_MESSAGES,
  GREETING_MESSAGES,
} from '@/services/rooivalk/constants';

export type DiscordMessage = OmitPartialGroupDMChannel<Message<boolean>>;
export type RooivalkResponseType = 'error' | 'greeting' | 'discordLimit';

export class DiscordService {
  private _discordClient: DiscordClient;
  private _mentionRegex: RegExp | null = null;
  private _startupChannelId: string | undefined;

  constructor(discordClient?: DiscordClient) {
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

  public get client(): DiscordClient {
    return this._discordClient;
  }

  public get mentionRegex(): RegExp | null {
    return this._mentionRegex;
  }

  public set mentionRegex(regex: RegExp | null) {
    this._mentionRegex = regex;
  }

  public get startupChannelId(): string | undefined {
    return this._startupChannelId;
  }

  public getRooivalkResponse(type: RooivalkResponseType): string {
    let arrayToUse: string[] = [];
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

  public async sendReadyMessage(): Promise<void> {
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

  public async buildMessageReply(
    content: string,
    allowedMentions: string[] = []
  ): Promise<MessageReplyOptions> {
    const imageRegex =
      /!\[.*?\]\((https?:\/\/.*?\.(?:png|jpe?g|gif|webp)(?:\?.*?)?)\)/g;
    const imageMatches = [...content.matchAll(imageRegex)];
    const imageUrls = imageMatches
      .map((match) => match[1])
      .filter((url): url is string => typeof url === 'string');

    const contentWithoutImages = content.replace(imageRegex, '').trim();
    const embeds = imageUrls.map((url) => ({ image: { url } }));

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

  public async getMessageChain(
    currentMessage: DiscordMessage
  ): Promise<{ author: 'user' | 'rooivalk'; content: string }[]> {
    const messageChain: { author: 'user' | 'rooivalk'; content: string }[] = [];
    try {
      if (currentMessage.reference && currentMessage.reference.messageId) {
        let referencedMessage = await currentMessage.channel.messages.fetch(
          currentMessage.reference.messageId
        );
        const tempChain: { author: 'user' | 'rooivalk'; content: string }[] =
          [];
        while (
          referencedMessage &&
          tempChain.length < DISCORD_MAX_MESSAGE_CHAIN_LENGTH
        ) {
          tempChain.push({
            author:
              referencedMessage.author.id === this._discordClient.user?.id
                ? 'rooivalk'
                : 'user',
            content: referencedMessage.content,
          });
          if (
            referencedMessage.reference &&
            referencedMessage.reference.messageId
          ) {
            try {
              referencedMessage =
                await referencedMessage.channel.messages.fetch(
                  referencedMessage.reference.messageId
                );
            } catch (error) {
              console.error('Error fetching message chain:', error);
              break;
            }
          } else {
            break;
          }
        }
        messageChain.push(...tempChain.reverse());
      }
    } catch (error) {
      console.error('Error fetching message chain:', error);
    }
    messageChain.push({
      author:
        currentMessage.author.id === this._discordClient.user?.id
          ? 'rooivalk'
          : 'user',
      content: currentMessage.content,
    });
    return messageChain;
  }

  public async getOriginalMessage(message: DiscordMessage) {
    try {
      const reference = message.reference;
      if (!reference?.messageId) {
        return null;
      }
      return await message.channel.messages.fetch(reference.messageId);
    } catch (error) {
      console.error('Error fetching original message:', error);
      return null;
    }
  }

  public async registerSlashCommands(): Promise<void> {
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

  public async buildPromptFromMessageChain(
    message: DiscordMessage
  ): Promise<string | null> {
    if (message.reference && message.reference.messageId) {
      const repliedToMessage = await this.getOriginalMessage(message);
      if (
        repliedToMessage &&
        repliedToMessage.author.id === this._discordClient.user?.id
      ) {
        const messageChain = await this.getMessageChain(message);
        if (messageChain.length > 0) {
          const chainWithCleanContent = messageChain.map((entry, index) => ({
            ...entry,
            content:
              index === messageChain.length - 1 &&
              entry.author === 'user' &&
              this._mentionRegex
                ? entry.content.replace(this._mentionRegex, '').trim()
                : entry.content,
          }));

          return chainWithCleanContent
            .map(
              (entry) =>
                `${entry.author === 'user' ? 'User' : 'Rooivalk'}: ${entry.content}`
            )
            .join('\n');
        }
      }
    }
    return null;
  }

  public setupMentionRegex(): void {
    if (this._discordClient.user?.id) {
      this._mentionRegex = new RegExp(
        userMention(this._discordClient.user.id),
        'g'
      );
    }
  }

  public on<K extends keyof ClientEvents>(
    event: K,
    listener: (...args: ClientEvents[K]) => void
  ): void {
    this._discordClient.on(event, listener);
  }

  public once<K extends keyof ClientEvents>(
    event: K,
    listener: (...args: ClientEvents[K]) => void
  ): void {
    this._discordClient.once(event, listener);
  }

  public async login(): Promise<void> {
    await this._discordClient.login(process.env.DISCORD_TOKEN);
  }
}
