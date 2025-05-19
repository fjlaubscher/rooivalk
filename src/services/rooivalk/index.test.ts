// @ts-nocheck
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Collection, Events as DiscordEvents, userMention } from 'discord.js';

// Hoisted mock for REST, only for registerSlashCommands test
let restPutMock: any;
vi.mock('discord.js', async () => {
  const actual = await vi.importActual('discord.js');
  return {
    ...actual,
    REST: class {
      setToken() {
        return this;
      }
      put(...args: any[]) {
        if (restPutMock) return restPutMock(...args);
        return Promise.resolve();
      }
    },
  };
});

import Rooivalk from '.';

const ROOIVALK_ID = 'bot-id';
const ROOIVALK_MENTION = userMention(ROOIVALK_ID);

// Mock OpenAIClient
class MockOpenAIClient {
  createResponse = vi.fn(
    async (persona: string, prompt: string) => `Echo: ${prompt}`
  );
}

// Mock DiscordClient (minimal, just for constructor)
class MockDiscordClient {
  user = { id: ROOIVALK_ID, tag: 'rooivalk#0001' };
  channels = { fetch: vi.fn() };
  once = vi.fn((_event: string, cb: Function) => cb());
  on = vi.fn();
  login = vi.fn();
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
      (discord.channels.fetch as vi.Mock).mockResolvedValue({
        send: vi.fn(),
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

    describe('when processing messages', () => {
      it('should call processMessage only for valid messages', async () => {
        const openai = new MockOpenAIClient();
        const discord = new MockDiscordClient();
        const rooivalk = new Rooivalk(openai, discord);
        const processMessageSpy = vi
          .spyOn(rooivalk, 'processMessage')
          .mockResolvedValue(undefined);
        rooivalk._discordGuildId = 'guild-id';
        rooivalk._mentionRegex = /<@bot-id>/g;
        discord.user = { id: 'bot-id', tag: 'rooivalk#0001' };

        // Valid message
        await rooivalk.processMessage({
          author: { bot: false },
          guild: { id: 'guild-id' },
          content: '<@bot-id> hi',
          mentions: { users: new Collection() },
          channel: { id: 'chan' },
        });
        expect(processMessageSpy).toHaveBeenCalledTimes(1);

        // Message from a bot
        await rooivalk.processMessage({
          author: { bot: true },
          guild: { id: 'guild-id' },
          content: '<@bot-id> hi',
          mentions: { users: new Collection() },
          channel: { id: 'chan' },
        });

        // Message from wrong guild
        await rooivalk.processMessage({
          author: { bot: false },
          guild: { id: 'other-guild' },
          content: '<@bot-id> hi',
          mentions: { users: new Collection() },
          channel: { id: 'chan' },
        });

        // Message not mentioning bot
        await rooivalk.processMessage({
          author: { bot: false },
          guild: { id: 'guild-id' },
          content: 'hi',
          mentions: { users: new Collection() },
          channel: { id: 'chan' },
        });

        expect(processMessageSpy).toHaveBeenCalledTimes(4); // All calls go through, but only the first is valid
      });
    });
  });

  describe('when a message is processed', () => {
    let message: any;

    beforeEach(() => {
      message = {
        ...BASE_MESSAGE,
        content: `${ROOIVALK_MENTION} test`,
        reply: vi.fn(),
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

    describe('and OpenAIClient.createResponse throws', () => {
      it('should reply with an error message', async () => {
        (openai.createResponse as vi.Mock).mockImplementationOnce(async () => {
          throw new Error('OpenAI error');
        });

        await rooivalk.processMessage(message);

        expect(message.reply).toHaveBeenCalledWith(
          expect.stringContaining('OpenAI error')
        );
      });
    });

    describe('and the response is too long', () => {
      it('should reply with a discord limit message and attachment', async () => {
        (openai.createResponse as vi.Mock).mockResolvedValueOnce(
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

  describe('when building a message reply', () => {
    it('should create embeds for image markdown and strip them from content', async () => {
      const content = 'Hello! ![img](https://example.com/test.png)';
      const result = await rooivalk['buildMessageReply'](content, ['123']);
      expect(result.content).toBe('Hello!');
      expect(result.embeds?.length).toBe(1);
      expect(result.embeds?.[0].data.image?.url).toBe(
        'https://example.com/test.png'
      );
      expect(result.allowedMentions?.users).toContain('123');
    });

    it('should not include embeds if no images are present', async () => {
      const content = 'Just text';
      const result = await rooivalk['buildMessageReply'](content);
      expect(result.embeds).toBeUndefined();
      expect(result.content).toBe('Just text');
    });
  });

  describe('when getting a Rooivalk response', () => {
    it('should throw on invalid type', () => {
      // @ts-expect-error
      expect(() => rooivalk['getRooivalkResponse']('not-a-type')).toThrow(
        'Invalid response type'
      );
    });
    it('should return a value from the correct array', () => {
      const error = rooivalk['getRooivalkResponse']('error');
      expect(typeof error).toBe('string');
      const greeting = rooivalk['getRooivalkResponse']('greeting');
      expect(typeof greeting).toBe('string');
      const limit = rooivalk['getRooivalkResponse']('discordLimit');
      expect(typeof limit).toBe('string');
    });
  });

  describe('sendMessageToStartupChannel', () => {
    describe('when the startup channel is not set', () => {
      it('should return null and log an error', async () => {
        rooivalk._startupChannelId = undefined;
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const result = await rooivalk.sendMessageToStartupChannel('prompt');
        expect(result).toBeNull();
        expect(spy).toHaveBeenCalledWith('Startup channel ID not set');
        spy.mockRestore();
      });
    });

    describe('when the startup channel is not text-based', () => {
      it('should return null and log an error', async () => {
        rooivalk._startupChannelId = 'chan';
        rooivalk._discordClient.channels.fetch = vi
          .fn()
          .mockResolvedValue({ isTextBased: () => false });
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const result = await rooivalk.sendMessageToStartupChannel('prompt');
        expect(result).toBeNull();
        expect(spy).toHaveBeenCalledWith('Startup channel is not text-based');
        spy.mockRestore();
      });
    });

    describe('when OpenAI throws in sendMessageToStartupChannel', () => {
      it('should return null and log an error', async () => {
        rooivalk._startupChannelId = 'chan';
        rooivalk._openaiClient.createResponse = vi
          .fn()
          .mockRejectedValue(new Error('fail'));
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const result = await rooivalk.sendMessageToStartupChannel('prompt');
        expect(result).toBeNull();
        expect(spy).toHaveBeenCalledWith(
          'Error sending message to startup channel:',
          expect.any(Error)
        );
        spy.mockRestore();
      });
    });

    describe('when the startup channel is valid', () => {
      it('should send with correct persona', async () => {
        rooivalk._startupChannelId = 'chan';
        rooivalk._openaiClient.createResponse = vi.fn().mockResolvedValue('hi');
        const send = vi.fn();
        rooivalk._discordClient.channels.fetch = vi
          .fn()
          .mockResolvedValue({ isTextBased: () => true, send });
        const result = await rooivalk.sendMessageToStartupChannel(
          'prompt',
          'rooivalk-learn'
        );
        expect(rooivalk._openaiClient.createResponse).toHaveBeenCalledWith(
          'rooivalk-learn',
          'prompt'
        );
        expect(send).toHaveBeenCalled();
        expect(result).toBe('hi');
      });
    });
  });

  describe('when registering slash commands', () => {
    it('should log error if REST put fails', async () => {
      restPutMock = vi.fn().mockRejectedValue(new Error('fail'));
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await new Rooivalk(openai, discord).registerSlashCommands();
      expect(spy).toHaveBeenCalledWith(
        'Error registering slash command:',
        expect.any(Error)
      );
      spy.mockRestore();
      restPutMock = undefined;
    }, 15000);
  });
});
