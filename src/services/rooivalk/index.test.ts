// @ts-nocheck
import { describe, it, expect, jest, beforeEach } from 'bun:test';
import { Collection, Events as DiscordEvents, userMention } from 'discord.js';

import Rooivalk from '.';

const ROOIVALK_ID = 'bot-id';
const ROOIVALK_MENTION = userMention(ROOIVALK_ID);

// Mock OpenAIClient
class MockOpenAIClient {
  createResponse = jest.fn(
    async (persona: string, prompt: string) => `Echo: ${prompt}`
  );
}

// Mock DiscordClient (minimal, just for constructor)
class MockDiscordClient {
  user = { id: ROOIVALK_ID, tag: 'rooivalk#0001' };
  channels = { fetch: jest.fn() };
  once = jest.fn((_event: string, cb: Function) => cb());
  on = jest.fn();
  login = jest.fn();
}

const BASE_MESSAGE = {
  channel: { id: 'test-channel' },
  mentions: { users: new Collection([[ROOIVALK_ID, { id: ROOIVALK_ID }]]) },
  guild: { id: process.env.DISCORD_GUILD_ID },
  author: { bot: false },
};

describe('Rooivalk', () => {
  let openai: MockOpenAIClient;
  let discord: MockDiscordClient;
  let rooivalk: Rooivalk;

  beforeEach(() => {
    openai = new MockOpenAIClient();
    discord = new MockDiscordClient();
    rooivalk = new Rooivalk(openai, discord);
  });

  describe('when logged in to discord', () => {
    it('should send a ready message to the startup channel', async () => {
      (discord.channels.fetch as jest.Mock).mockResolvedValue({
        send: jest.fn(),
        isTextBased: () => true,
      });
      await rooivalk.init();
      expect(discord.channels.fetch).toHaveBeenCalledWith(
        process.env.DISCORD_STARTUP_CHANNEL_ID
      );
    });

    it('should set up event listeners for messages and reactions', async () => {
      await rooivalk.init();

      expect(discord.once).toHaveBeenCalledWith(
        DiscordEvents.ClientReady,
        expect.any(Function)
      );

      expect(discord.on).toHaveBeenCalledWith(
        DiscordEvents.MessageCreate,
        expect.any(Function)
      );

      expect(discord.on).toHaveBeenCalledWith(
        DiscordEvents.MessageReactionAdd,
        expect.any(Function)
      );
    });

    it('should call processMessage only for valid messages', async () => {
      const openai = new MockOpenAIClient();
      const discord = new MockDiscordClient();
      const rooivalk = new Rooivalk(openai, discord);
      const processMessageSpy = jest
        .spyOn(rooivalk, 'processMessage')
        .mockResolvedValue(undefined);
      rooivalk._discordGuildId = 'guild-id';
      rooivalk._mentionRegex = /<@bot-id>/g;
      discord.user = { id: 'bot-id', tag: 'rooivalk#0001' };

      // Simulate event handler registration
      let messageHandler: any;
      discord.on = jest.fn((event, cb) => {
        if (event === 'messageCreate') messageHandler = cb;
      });
      await rooivalk.init();

      // Valid message
      await messageHandler({
        author: { bot: false },
        guild: { id: 'guild-id' },
        content: '<@bot-id> hi',
      });

      expect(processMessageSpy).toHaveBeenCalledTimes(1);

      // Message from a bot
      await messageHandler({
        author: { bot: true },
        guild: { id: 'guild-id' },
        content: '<@bot-id> hi',
      });

      // Message from wrong guild
      await messageHandler({
        author: { bot: false },
        guild: { id: 'other-guild' },
        content: '<@bot-id> hi',
      });

      // Message not mentioning bot
      await messageHandler({
        author: { bot: false },
        guild: { id: 'guild-id' },
        content: 'hi',
      });

      expect(processMessageSpy).toHaveBeenCalledTimes(1); // Only the first call should go through
    });
  });

  describe('when a message is processed', () => {
    let message: any;

    beforeEach(() => {
      message = {
        ...BASE_MESSAGE,
        content: `${ROOIVALK_MENTION} test`,
        reply: jest.fn(),
        mentions: {
          users: new Collection([[ROOIVALK_ID, { id: ROOIVALK_ID }]]),
        },
      };
      rooivalk._mentionRegex = new RegExp(ROOIVALK_MENTION, 'g');
      rooivalk._discordLearnChannelId = process.env.DISCORD_LEARN_CHANNEL_ID;
      rooivalk._discordClient = { user: { id: ROOIVALK_ID } } as any;
    });

    describe('and the message is from #learn', () => {
      it('should reply to the message with a response using `rooivalk-learn`', async () => {
        await rooivalk.processMessage({
          ...message,
          channel: { id: process.env.DISCORD_LEARN_CHANNEL_ID },
        });

        expect(openai.createResponse).toHaveBeenCalledWith(
          'rooivalk-learn',
          'test'
        );
        expect(message.reply).toHaveBeenCalled();
      });
    });

    describe('and the message is not from #learn', () => {
      it('should reply to the message with a response using `rooivalk`', async () => {
        await rooivalk.processMessage(message);

        expect(openai.createResponse).toHaveBeenCalledWith('rooivalk', 'test');
        expect(message.reply).toHaveBeenCalled();
      });
    });

    it('should reply with an error message if OpenAIClient.createResponse throws', async () => {
      (openai.createResponse as jest.Mock).mockImplementationOnce(async () => {
        throw new Error('OpenAI error');
      });

      await rooivalk.processMessage(message);

      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('OpenAI error')
      );
    });
    it('should reply with a discord limit message and attachment if the response is too long', async () => {
      (openai.createResponse as jest.Mock).mockResolvedValueOnce(
        'A'.repeat(2001)
      );

      await rooivalk.processMessage(message);

      expect(message.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringMatching(
            /too long|limit|file|attach|novel|epicness|brilliance|ego|.md/i
          ),
          files: expect.any(Array),
        })
      );
    });
  });
});
