import { Events as DiscordEvents } from 'discord.js';
import type { Interaction } from 'discord.js';

import { DISCORD_EMOJI } from '@/constants';
import OpenAIClient from '@/services/openai';
import { DiscordService } from '@/services/discord';
import type { DiscordMessage } from '@/services/discord';

class Rooivalk {
  protected _discord: DiscordService;
  protected _openaiClient: OpenAIClient;

  constructor(openaiClient?: OpenAIClient, discordService?: DiscordService) {
    this._openaiClient = openaiClient ?? new OpenAIClient();
    this._discord = discordService ?? new DiscordService();
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
        isLearnChannel ? 'rooivalk-learn' : 'rooivalk',
        prompt
      );

      if (response) {
        const reply = await this._discord.buildMessageReply(
          response,
          usersToMention.map((user) => user.id)
        );
        await message.reply(reply);
      } else {
        await message.reply(this._discord.getRooivalkResponse('error'));
      }
    } catch (error) {
      console.error('Error processing message:', error);
      const errorMessage = this._discord.getRooivalkResponse('error');

      if (error instanceof Error) {
        const reply = `${errorMessage}\n\n\`\`\`${error.message}\`\`\``;
        await message.reply(reply);
      } else {
        await message.reply(errorMessage);
      }
    }
  }

  public async sendMessageToStartupChannel(
    prompt: string,
    persona: 'rooivalk' | 'rooivalk-learn' = 'rooivalk'
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
        const messageOptions = await this._discord.buildMessageReply(response);
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
          const repliedToMessage = await this._discord.getOriginalMessage(
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

          if (interaction.commandName === 'learn') {
            const prompt = interaction.options.getString('prompt', true);
            await interaction.deferReply();

            try {
              const response = await this._openaiClient.createResponse(
                'rooivalk-learn',
                prompt
              );
              const messageOptions =
                await this._discord.buildMessageReply(response);
              // Convert MessageReplyOptions to InteractionEditReplyOptions
              await interaction.editReply({
                content: messageOptions.content,
                embeds: messageOptions.embeds,
                files: messageOptions.files,
              });
            } catch (error) {
              await interaction.editReply({
                content: this._discord.getRooivalkResponse('error'),
              });
            }
          }
        }
      );

      // finally log in after all event handlers have been set up
      await this._discord.login();
    });
  }
}

export default Rooivalk;
