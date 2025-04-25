import { Client as DiscordClient, GatewayIntentBits } from 'discord.js';
import type {
  Message,
  OmitPartialGroupDMChannel,
  TextChannel,
} from 'discord.js';

import { ROOIVALK_HELLO } from '@/constants';
import OpenAIClient from '@/services/openai/client';
import { getRooivalkError } from '@/utils/get-rooivalk-error';

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
          await (channel as TextChannel).send(ROOIVALK_HELLO);
        }
      } catch (err) {
        console.error('Error sending ready message:', err);
      }
    }
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

      if (response && usersToMention.size) {
        await message.reply({
          allowedMentions: { users: usersToMention.map((user) => user.id) },
          content: response,
        });
      } else if (response && !usersToMention.size) {
        await message.reply(response);
      } else {
        await message.reply(getRooivalkError());
      }
    } catch (error) {
      console.error('Error processing message:', error);
      const errorMessage = getRooivalkError();

      if (error instanceof Error) {
        const reply = `${errorMessage}\n\n\'\'\'${error.message}\'\'\'`;
        await message.reply(reply);
      } else {
        await message.reply(errorMessage);
      }
    }
  }

  public async init() {
    this._discordClient.once('ready', async () => {
      console.log(`🤖 Logged in as ${this._discordClient.user?.tag}`);
      if (this._discordClient.user?.id) {
        this._mentionRegex = new RegExp(
          `<@!?${this._discordClient.user.id}>`,
          'g'
        );
      }

      await this.sendReadyMessage();
    });

    this._discordClient.on('messageCreate', async (message) => {
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


    // finally log in after all event handlers have been set up
    this._discordClient.login(process.env.DISCORD_TOKEN);
  }
}

export default Rooivalk;
