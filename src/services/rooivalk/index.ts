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

import { getRooivalkResponse } from './get-rooivalk-response';

type DiscordMessage = OmitPartialGroupDMChannel<Message<boolean>>;

class Rooivalk {
  private _discordClient: DiscordClient;
  private _discordStartupChannelId: string | undefined;
  private _discordLearnChannelId: string | undefined;
  private _discordGuildId: string | undefined;
  private _openaiClient: OpenAIClient;
  private _mentionRegex: RegExp | null = null;

  constructor() {
    this._openaiClient = new OpenAIClient();
    this._discordClient = new DiscordClient({
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

  private async sendReadyMessage() {
    if (this._discordStartupChannelId) {
      try {
        const channel = await this._discordClient.channels.fetch(
          this._discordStartupChannelId
        );
        if (channel && channel.isTextBased()) {
          await (channel as TextChannel).send(getRooivalkResponse('greeting'));
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
        content: getRooivalkResponse('discordLimit'),
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

  private async processMessage(message: DiscordMessage) {
    try {
      // switch to a more serious tone if the message is in the learn channel
      const isLearnChannel = message.channel.id === this._discordLearnChannelId;

      const prompt = message.content.replace(this._mentionRegex!, '');
      const usersToMention = message.mentions.users.filter(
        (user) => user.id !== this._discordClient.user?.id
      );

      // prompt openai with the message content
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
        await message.reply(getRooivalkResponse('error'));
      }
    } catch (error) {
      console.error('Error processing message:', error);
      const errorMessage = getRooivalkResponse('error');

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
