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
  DISCORD_COMMAND_DEFINITIONS,
} from '@/constants';
import type {
  InMemoryConfig,
  ResponseType,
  MessageInChain,
  OpenAIResponse,
} from '@/types';
import { formatMessageInChain } from './helpers';

export type DiscordMessage = OmitPartialGroupDMChannel<Message<boolean>>;

class DiscordService {
  private _discordClient: DiscordClient;
  private _mentionRegex: RegExp | null = null;
  private _startupChannelId: string | undefined;
  private _motdChannelId: string | undefined;
  private _allowedEmojis: string[];
  private _config: InMemoryConfig;
  private _threadMessageCache: Record<string, string> = {};
  private _threadInitialContext: Record<string, string> = {};

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
          this._startupChannelId,
        );
        if (channel && channel.isTextBased()) {
          await (channel as TextChannel).send(
            this.getRooivalkResponse('greeting'),
          );
        }
      } catch (err) {
        console.error('Error sending ready message:', err);
      }
    }
  }

  public buildMessageReply(
    response: OpenAIResponse,
    allowedMentions: string[] = [],
  ) {
    const exceedsDiscordLimit = response.content.length > DISCORD_MESSAGE_LIMIT;

    if (response.type === 'text' && exceedsDiscordLimit) {
      // create a markdown file attachment and send that instead
      const attachment = new AttachmentBuilder(
        Buffer.from(response.content, 'utf-8'),
        {
          name: 'rooivalk.md',
        },
      );

      return {
        content: this.getRooivalkResponse('discordLimit'),
        files: [attachment],
        allowedMentions: {
          users: allowedMentions,
        },
      };
    } else if (response.type === 'text' && !exceedsDiscordLimit) {
      return {
        content: response.content,
        allowedMentions: {
          users: allowedMentions,
        },
      };
    } else if (
      response.type === 'image_generation_call' &&
      response.base64Images.length > 0
    ) {
      // there are images to return from this response
      return {
        content: response.content,
        allowedMentions: {
          users: allowedMentions,
        },
        files: response.base64Images.map(
          (base64Image, index) =>
            new AttachmentBuilder(Buffer.from(base64Image, 'base64'), {
              name: `rooivalk_${index}.jpeg`,
            }),
        ),
        embeds: response.base64Images.map(
          (_, index) =>
            new EmbedBuilder({
              image: {
                url: `attachment://rooivalk_${index}.jpeg`,
              },
            }),
        ),
      };
    }

    return {
      content: this.getRooivalkResponse('error'),
    };
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
    end: Date,
  ): Promise<{ name: string; date: Date }[]> {
    try {
      const guild = await this._discordClient.guilds.fetch(
        process.env.DISCORD_GUILD_ID!,
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
        process.env.DISCORD_GUILD_ID!,
      );
      const emojis = await guild.emojis.fetch();
      this._allowedEmojis = emojis.map(
        (emoji) => `:${emoji.name}: → ${emoji.toString()}`,
      );
    } catch (error) {
      console.error('Error caching guild emojis:', error);
    }
  }

  public async getMessageChain(
    currentMessage: DiscordMessage,
  ): Promise<MessageInChain[]> {
    const messageChain: MessageInChain[] = [];

    try {
      // if the current message is a reply
      if (currentMessage.reference && currentMessage.reference.messageId) {
        // fetch the referenced message
        let referencedMessage = await currentMessage.channel.messages.fetch(
          currentMessage.reference.messageId,
        );
        const tempChain: MessageInChain[] = [];

        // while there are replies in the chain with content / attachments
        while (referencedMessage) {
          const hasAttachments = referencedMessage.attachments.size > 0;
          const hasContent = referencedMessage.content.length > 0;
          const isRooivalkMessage =
            referencedMessage.author.id === this._discordClient.user?.id;

          if (hasAttachments || hasContent) {
            // add the referenced message to the chain with attachments
            tempChain.push({
              author: isRooivalkMessage
                ? 'rooivalk'
                : referencedMessage.author.displayName,
              content: hasContent ? referencedMessage.content.trim() : '',
              attachmentUrls: hasAttachments
                ? referencedMessage.attachments.map((att) => att.url)
                : [],
            });
          }

          // if the current referenced message has a reference
          if (
            referencedMessage.reference &&
            referencedMessage.reference.messageId
          ) {
            try {
              // fetch the next referenced message
              referencedMessage =
                await referencedMessage.channel.messages.fetch(
                  referencedMessage.reference.messageId,
                );
            } catch (error) {
              console.error('Error fetching message chain:', error);
              break;
            }
          } else {
            // no more references, end of chain.
            break;
          }
        }

        // reverse the temp chain in chronological order and add it to the message chain
        messageChain.push(...tempChain.reverse());
      }
    } catch (error) {
      console.error('Error fetching message chain:', error);
    }

    // deliberately omit the current message from the chain
    return messageChain;
  }

  public async registerSlashCommands(): Promise<void> {
    const rest = new REST({ version: '10' }).setToken(
      process.env.DISCORD_TOKEN!,
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
          process.env.DISCORD_GUILD_ID!,
        ),
        { body: commands },
      );
      console.log('Successfully registered slash commands.');
    } catch (error) {
      console.error('Error registering slash command:', error);
    }
  }

  public async buildMessageChainFromMessage(
    currentMessage: DiscordMessage,
  ): Promise<string | null> {
    // get the message chain for the current message
    const messageChain = await this.getMessageChain(currentMessage);

    if (messageChain.length === 0) {
      return null;
    }

    return messageChain.map(formatMessageInChain).join('\n');
  }

  public async buildMessageChainFromThreadMessage(
    message: DiscordMessage,
  ): Promise<string | null> {
    if (message.channel.isThread()) {
      const thread = message.channel;
      const threadId = thread.id;

      // Return cached content if available
      if (this._threadMessageCache[threadId]) {
        return this._threadMessageCache[threadId];
      }

      // Get initial context that led to thread creation
      const initialContext = this.getThreadInitialContext(threadId);

      // Fetch and process messages
      const threadMessages = await thread.messages.fetch();
      const messageArray = Array.from(threadMessages.values())
        .reverse() // Discord returns messages in descending order, so reverse for chronological order
        .map((msg) => ({
          author:
            msg.author.id === this._discordClient.user?.id
              ? 'rooivalk'
              : msg.author.displayName,
          content: msg.content,
        }));

      if (messageArray && messageArray.length) {
        const chainWithCleanContent = messageArray.map((entry, index) => ({
          ...entry,
          content:
            index === messageArray.length - 1 &&
            entry.author !== 'rooivalk' &&
            this._mentionRegex
              ? entry.content.replace(this._mentionRegex, '').trim()
              : entry.content,
        }));

        const threadChain = chainWithCleanContent
          .map((entry) => `- ${entry.author}: ${entry.content}`)
          .join('\n');

        // Combine initial context with thread messages
        const fullChain = initialContext
          ? `${initialContext}\n${threadChain}`
          : threadChain;

        // Cache the result
        this._threadMessageCache[threadId] = fullChain;
        return fullChain;
      }
    }

    return null;
  }

  public clearThreadMessageCache(threadId?: string): void {
    if (threadId) {
      delete this._threadMessageCache[threadId];
      delete this._threadInitialContext[threadId];
    } else {
      this._threadMessageCache = {};
      this._threadInitialContext = {};
    }
  }

  public setThreadInitialContext(threadId: string, context: string): void {
    this._threadInitialContext[threadId] = context;
  }

  public getThreadInitialContext(threadId: string): string | null {
    return this._threadInitialContext[threadId] || null;
  }

  public setupMentionRegex(): void {
    if (this._discordClient.user?.id) {
      this._mentionRegex = new RegExp(
        userMention(this._discordClient.user.id),
        'g',
      );
    }
  }

  public on<K extends keyof ClientEvents>(
    event: K,
    listener: (...args: ClientEvents[K]) => void,
  ): void {
    this._discordClient.on(event, listener);
  }

  public once<K extends keyof ClientEvents>(
    event: K,
    listener: (...args: ClientEvents[K]) => void,
  ): void {
    this._discordClient.once(event, listener);
  }

  public async login(): Promise<void> {
    await this._discordClient.login(process.env.DISCORD_TOKEN);
  }
}

export default DiscordService;
