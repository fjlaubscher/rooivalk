import {
  Client as DiscordClient,
  Events as DiscordEvents,
  GatewayIntentBits,
  AttachmentBuilder,
  userMention,
} from 'discord.js';
import type {
  Message,
  MessageReplyOptions,
  OmitPartialGroupDMChannel,
  TextChannel,
} from 'discord.js';

import { DISCORD_MESSAGE_LIMIT, DISCORD_RETRY_EMOJI } from '@/constants';
import OpenAIClient from '@/services/openai';
import {
  storeLTUserMemory,
  retrieveLTUserMemory,
  storeSTUserMemory,
  retrieveSTUserMemory,
  getAllSTUserMemories,
  processMemoryResults
} from '@/services/memory';

import {
  ERROR_MESSAGES,
  EXCEEDED_DISCORD_LIMIT_MESSAGES,
  GREETING_MESSAGES,
} from './constants';

type DiscordMessage = OmitPartialGroupDMChannel<Message<boolean>>;
type RooivalkResponseType = 'error' | 'greeting' | 'discordLimit';

class Rooivalk {
  protected _discordClient: DiscordClient;
  protected _discordStartupChannelId: string | undefined;
  protected _discordLearnChannelId: string | undefined;
  protected _discordGuildId: string | undefined;
  protected _openaiClient: OpenAIClient;
  protected _mentionRegex: RegExp | null = null;

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

    this._discordStartupChannelId = process.env.DISCORD_STARTUP_CHANNEL_ID;
    this._discordLearnChannelId = process.env.DISCORD_LEARN_CHANNEL_ID;
    this._discordGuildId = process.env.DISCORD_GUILD_ID;
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
    if (this._discordStartupChannelId) {
      try {
        const channel = await this._discordClient.channels.fetch(
          this._discordStartupChannelId
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
    // if the content is too long, send it as an attachment
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
      content,
      allowedMentions: {
        users: allowedMentions,
      },
    };
  }

  private async getEnhancedPromptWithMemories(userId: string, channelId: string, prompt: string): Promise<string> {
    try {
      const [ltMemoryResults, stMemoryResults] = await Promise.all([
        retrieveLTUserMemory(userId, prompt),
        retrieveSTUserMemory(userId, channelId, prompt)
      ]);

      const ltMemories = processMemoryResults(ltMemoryResults);
      const stMemories = processMemoryResults(stMemoryResults);

      if (ltMemories.length === 0 && stMemories.length === 0) {
        return prompt;
      }

      let enhancedPrompt = prompt;

      if (ltMemories.length > 0) {
        const ltMemoriesStr = ltMemories.join('\n- ');
        enhancedPrompt = `These are the overall relevant memories about me:\n- ${ltMemoriesStr}\n\n${enhancedPrompt}`;
      }

      if (stMemories.length > 0) {
        const stMemoriesStr = stMemories.join('\n- ');
        enhancedPrompt = `These are the recent memories in this thread:\n- ${stMemoriesStr}\n\n${enhancedPrompt}`;
      }

      return enhancedPrompt;
    } catch (error) {
      console.error('Error retrieving memories:', error);
      return prompt;
    }
  }

  private async processMessage(message: DiscordMessage) {
    try {
      // switch to a more serious tone if the message is in the learn channel
      const isLearnChannel = message.channel.id === this._discordLearnChannelId;

      const prompt = message.content.replace(this._mentionRegex!, '').trim();
      const usersToMention = message.mentions.users.filter(
        (user) => user.id !== this._discordClient.user?.id
      );

      // get enhanced prompt with both long-term and short-term memories
      const userId = message.author.id;
      const channelId = message.channel.id;
      const enhancedPrompt = await this.getEnhancedPromptWithMemories(userId, channelId, prompt);

      // prompt openai with the enhanced content
      const response = await this._openaiClient.createResponse(
        isLearnChannel ? 'rooivalk-learn' : 'rooivalk',
        enhancedPrompt
      );

      if (response) {
        const reply = await this.buildMessageReply(
          response,
          usersToMention.map((user) => user.id)
        );
        await message.reply(reply);

        // store both LT and ST memories
        const messages = [
          { role: "user", content: prompt },
          { role: "assistant", content: response }
        ];
        const metadata = { timestamp: Date.now() };

        Promise.all([
          // store as LT memory (user-specific, across all channels)
          storeLTUserMemory(userId, messages, metadata).catch(error => {
            console.error('Error storing LT memory:', error);
          }),

          // store as ST memory (user+channel specific context)
          storeSTUserMemory(userId, channelId, messages, metadata).catch(error => {
            console.error('Error storing ST memory:', error);
          })
        ]);
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

    this._discordClient.on(DiscordEvents.MessageCreate, async (message) => {
      // Ignore messages from:
      // 1. Other bots
      // 2. Messages not from the specified guild (server)
      // 3. Messages that don't mention the bot
      if (
        message.author.bot ||
        message.guild?.id !== this._discordGuildId ||
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
          reaction.message.guild?.id !== this._discordGuildId
        ) {
          return;
        }

        if (reaction.emoji.name === DISCORD_RETRY_EMOJI) {
          const message = reaction.message as DiscordMessage;
          await this.processMessage(message);
        }
      }
    );

    // finally log in after all event handlers have been set up
    this._discordClient.login(process.env.DISCORD_TOKEN);
  }
}

export default Rooivalk;
