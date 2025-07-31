import {
  Client as DiscordClient,
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
  OmitPartialGroupDMChannel,
  TextChannel,
  ClientEvents,
} from 'discord.js';

import {
  DISCORD_MESSAGE_LIMIT,
  DISCORD_MAX_MESSAGE_CHAIN_LENGTH,
  DISCORD_COMMAND_DEFINITIONS,
} from '@/constants';

import type { InMemoryConfig, ResponseType } from '@/types';

export type DiscordMessage = OmitPartialGroupDMChannel<Message<boolean>>;

class DiscordService {
  private _discordClient: DiscordClient;
  private _mentionRegex: RegExp | null = null;
  private _startupChannelId: string | undefined;
  private _motdChannelId: string | undefined;
  private _allowedEmojis: string[];
  private _config: InMemoryConfig;

  constructor(config: InMemoryConfig, discordClient?: DiscordClient) {
    this._config = config;
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
    this._motdChannelId = process.env.DISCORD_MOTD_CHANNEL_ID;
    this._allowedEmojis = [];
  }

  public reloadConfig(newConfig: InMemoryConfig): void {
    this._config = newConfig;
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

  public get motdChannelId(): string | undefined {
    return this._motdChannelId;
  }

  public get allowedEmojis(): string[] {
    return this._allowedEmojis;
  }

  public getRooivalkResponse(type: ResponseType): string {
    let arrayToUse: string[] = [];
    switch (type) {
      case 'error':
        arrayToUse = this._config.errorMessages;
        break;
      case 'greeting':
        arrayToUse = this._config.greetingMessages;
        break;
      case 'discordLimit':
        arrayToUse = this._config.discordLimitMessages;
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

  public buildMessageReply(content: string, allowedMentions: string[] = []) {
    if (content.length > DISCORD_MESSAGE_LIMIT) {
      const attachment = new AttachmentBuilder(Buffer.from(content, 'utf-8'), {
        name: 'rooivalk.md',
      });

      return {
        content: this.getRooivalkResponse('discordLimit'),
        files: [attachment],
        allowedMentions: {
          users: allowedMentions,
        },
      };
    }

    return {
      content: content,
      allowedMentions: {
        users: allowedMentions,
      },
    };
  }

  /**
   * Splits content into chunks that respect the Discord message limit.
   */
  public chunkContent(
    content: string,
    limit: number = DISCORD_MESSAGE_LIMIT
  ): string[] {
    const chunks: string[] = [];
    let remaining = content;

    while (remaining.length > limit) {
      chunks.push(remaining.slice(0, limit));
      remaining = remaining.slice(limit);
    }

    if (remaining.length > 0) {
      chunks.push(remaining);
    }

    return chunks;
  }

  public buildImageReply(prompt: string, base64Image: string) {
    return {
      files: [
        new AttachmentBuilder(Buffer.from(base64Image, 'base64'), {
          name: 'rooivalk.jpeg',
        }),
      ],
      embeds: [
        new EmbedBuilder({
          title: 'Image by @rooivalk',
          description: prompt,
          image: {
            url: 'attachment://rooivalk.jpeg',
          },
        }),
      ],
    };
  }

  public async getGuildEventsBetween(
    start: Date,
    end: Date
  ): Promise<{ name: string; date: Date }[]> {
    try {
      const guild = await this._discordClient.guilds.fetch(
        process.env.DISCORD_GUILD_ID!
      );
      const events = await guild.scheduledEvents.fetch();
      return Array.from(events.values())
        .filter((event) => {
          const date = event.scheduledStartAt;
          return date && date >= start && date < end;
        })
        .map((event) => ({ name: event.name, date: event.scheduledStartAt! }));
    } catch (error) {
      console.error('Error fetching scheduled events:', error);
      return [];
    }
  }

  public async cacheGuildEmojis() {
    try {
      const guild = await this._discordClient.guilds.fetch(
        process.env.DISCORD_GUILD_ID!
      );
      const emojis = await guild.emojis.fetch();
      this._allowedEmojis = emojis.map(
        (emoji) => `:${emoji.name}: → ${emoji.toString()}`
      );
    } catch (error) {
      console.error('Error caching guild emojis:', error);
    }
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

  /**
   * Fetches the message being replied to.
   */
  public async getReferencedMessage(message: DiscordMessage) {
    try {
      const reference = message.reference;
      if (!reference?.messageId) {
        return null;
      }
      return await message.channel.messages.fetch(reference.messageId);
    } catch (error) {
      console.error('Error fetching referenced message:', error);
      return null;
    }
  }

  /**
   * Walks up the reply chain to find the first message in the conversation.
   */
  public async getOriginalMessage(message: DiscordMessage) {
    try {
      if (!message.reference?.messageId) {
        return null;
      }

      let current = await message.channel.messages.fetch(
        message.reference.messageId
      );
      let depth = 0;

      while (
        current.reference?.messageId &&
        depth < DISCORD_MAX_MESSAGE_CHAIN_LENGTH
      ) {
        current = await current.channel.messages.fetch(
          current.reference.messageId
        );
        depth += 1;
      }

      return current;
    } catch (error) {
      console.error('Error fetching original message:', error);
      return null;
    }
  }

  public async registerSlashCommands(): Promise<void> {
    const rest = new REST({ version: '10' }).setToken(
      process.env.DISCORD_TOKEN!
    );

    try {
      const commands = Object.keys(DISCORD_COMMAND_DEFINITIONS)
        .map((key) => {
          const def = DISCORD_COMMAND_DEFINITIONS[key];
          if (!def) {
            return false;
          }

          const builder = new SlashCommandBuilder();
          builder.setName(key);
          builder.setDescription(def.description);

          def.parameters.forEach((param) => {
            builder.addStringOption((option) => {
              const commandOption = option
                .setName(param.name)
                .setDescription(param.description)
                .setRequired(param.required);

              if (param.choices) {
                commandOption.addChoices(param.choices);
              }

              return commandOption;
            });
          });

          return builder.toJSON();
        })
        .filter(Boolean);

      await rest.put(
        Routes.applicationGuildCommands(
          process.env.DISCORD_APP_ID!,
          process.env.DISCORD_GUILD_ID!
        ),
        { body: commands }
      );
      console.log('Successfully registered slash commands.');
    } catch (error) {
      console.error('Error registering slash command:', error);
    }
  }

  public async buildPromptFromMessageChain(
    message: DiscordMessage
  ): Promise<string | null> {
    if (message.reference && message.reference.messageId) {
      const repliedToMessage = await this.getReferencedMessage(message);
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

  public async buildHistoryFromMessageChain(
    message: DiscordMessage
  ): Promise<string | null> {
    const chain = await this.buildPromptFromMessageChain(message);
    if (!chain) {
      return null;
    }
    const lines = chain.split('\n');
    if (lines.length === 0) {
      return null;
    }
    lines.pop();
    return lines.length > 0 ? lines.join('\n') : null;
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

export default DiscordService;
