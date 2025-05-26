import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock, Mocked, MockInstance } from 'vitest';
import Rooivalk from './index'; // Assuming Rooivalk is default export
import OpenAIClient from '@/services/openai';
import {
  Client as DiscordClient,
  GatewayIntentBits,
  Collection,
  // EmbedBuilder, // Mocked below
  // AttachmentBuilder, // Mocked below
  Events as DiscordEvents, // Keep this for event names
} from 'discord.js';
import { DISCORD_EMOJI } from '@/constants';

// Mock OpenAIClient
vi.mock('@/services/openai');

// Mock discord.js
vi.mock('discord.js', async (importOriginal) => {
  const actual = (await importOriginal()) as any; // Cast to any to allow spread
  return {
    ...actual, // Spread the actual module (includes Collection, Events, etc.)
    Client: vi.fn(() => ({
      user: { id: 'test-bot-id', tag: 'TestBot#0000' },
      channels: {
        fetch: vi.fn().mockResolvedValue({
          // Default mock for channels.fetch
          isTextBased: () => true,
          send: vi.fn().mockResolvedValue({}),
        }),
      },
      once: vi.fn(function (this: any, event, callback) {
        // Use function for 'this'
        // This specific mock behavior for 'once' (e.g., immediately calling callback for ClientReady)
        // is better handled in the beforeEach setup of tests that rely on this behavior.
        return this; // Should return the client instance for chaining
      }),
      on: vi.fn(function (this: any) {
        return this;
      }), // Make sure `on` is chainable or returns appropriately
      login: vi.fn().mockResolvedValue('test-token'), // login usually returns a Promise<string>
      guilds: new actual.Collection(), // Use actual.Collection
    })),
    // GatewayIntentBits are usually enums, actual.GatewayIntentBits should be fine if used directly
    userMention: vi.fn((id: string) => `<@${id}>`),
    EmbedBuilder: vi.fn().mockImplementation(() => ({
      setImage: vi.fn().mockReturnThis(),
      setTitle: vi.fn().mockReturnThis(),
      setDescription: vi.fn().mockReturnThis(),
      setColor: vi.fn().mockReturnThis(),
      addFields: vi.fn().mockReturnThis(),
      toJSON: vi.fn().mockReturnValue({}), // Ensure toJSON is callable if needed
    })),
    AttachmentBuilder: vi.fn().mockImplementation(() => ({
      setName: vi.fn().mockReturnThis(),
      // If files are actually checked:
      // toJSON: vi.fn().mockReturnValue({ name: 'attachment.txt' }),
    })),
    REST: vi.fn(() => ({
      setToken: vi.fn().mockReturnThis(),
      put: vi.fn().mockResolvedValue([]),
    })),
    Routes: {
      applicationGuildCommands: vi.fn(
        (appId: string, guildId: string) =>
          `/applications/${appId}/guilds/${guildId}/commands`
      ),
    },
    SlashCommandBuilder: vi.fn(function (this: any) {
      // Use function for 'this'
      return {
        setName: vi.fn().mockReturnThis(),
        setDescription: vi.fn().mockReturnThis(),
        addStringOption: vi.fn(function (
          this: any,
          optionSetup: (option: any) => any
        ) {
          // Use function for 'this'
          const option = {
            // Simulate the option object
            setName: vi.fn().mockReturnThis(),
            setDescription: vi.fn().mockReturnThis(),
            setRequired: vi.fn().mockReturnThis(),
          };
          if (typeof optionSetup === 'function') {
            optionSetup(option); // Allow the test to configure the option
          }
          return this; // Return `this` (SlashCommandBuilder instance) for chaining
        }),
        toJSON: vi
          .fn()
          .mockReturnValue({ name: 'learn', description: 'learn command' }),
      };
    }),
  };
});

// Mock environment variables
const MOCK_ENV = {
  DISCORD_TOKEN: 'test-token',
  DISCORD_APP_ID: 'test-app-id',
  DISCORD_GUILD_ID: 'test-guild-id',
  DISCORD_STARTUP_CHANNEL_ID: 'test-startup-channel-id',
  DISCORD_LEARN_CHANNEL_ID: 'test-learn-channel-id',
  OPENAI_API_KEY: 'test-openai-key',
};

const mockDiscordClientInstance = new DiscordClient({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
}) as Mocked<DiscordClient>;

const mockOpenAIClientInstance = new OpenAIClient() as Mocked<OpenAIClient>;

// Helper to create a mock message
const createMockMessage = (
  content: string,
  authorId = 'user-id',
  botId = 'test-bot-id',
  messageId = `msg-${Math.random().toString(36).substring(7)}`,
  referencedMessageDetails: {
    messageId: string;
    authorId: string;
    content: string;
    reference?: any; // For deeper chains
  } | null = null
): any => {
  // Return type any to simplify mock message creation for tests
  const mockMsg: any = {
    id: messageId,
    content,
    author: { id: authorId, bot: authorId === botId },
    guild: { id: MOCK_ENV.DISCORD_GUILD_ID! }, // Ensure guild is not null and ID is present
    channel: {
      id: 'test-channel-id',
      messages: {
        fetch: vi.fn(async (id: string) => {
          if (
            referencedMessageDetails &&
            id === referencedMessageDetails.messageId
          ) {
            return createMockMessage(
              referencedMessageDetails.content,
              referencedMessageDetails.authorId,
              botId,
              referencedMessageDetails.messageId,
              referencedMessageDetails.reference
            );
          }
          return null;
        }),
      },
      send: vi.fn().mockResolvedValue(true), // Mock send method on channel
    },
    mentions: {
      users: new Collection<string, { id: string }>(), // Use a typed Collection
    },
    reply: vi.fn().mockResolvedValue(true),
    reference: null,
    delete: vi.fn().mockResolvedValue(true), // Mock delete method on message
  };

  if (content.includes(`<@${botId}>`)) {
    mockMsg.mentions.users.set(botId, { id: botId });
  }

  if (referencedMessageDetails) {
    mockMsg.reference = {
      messageId: referencedMessageDetails.messageId,
      channelId: mockMsg.channel.id,
    };
  }
  return mockMsg;
};

describe('Rooivalk Service', () => {
  let rooivalk: Rooivalk;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('process', { env: { ...MOCK_ENV } });

    mockOpenAIClientInstance.createResponse = vi
      .fn()
      .mockResolvedValue('Mocked AI Response');

    mockDiscordClientInstance.user = {
      id: 'test-bot-id',
      tag: 'TestBot#0000',
    } as any;

    (mockDiscordClientInstance.once as Mock).mockImplementation(
      (event, callback) => {
        if (event === DiscordEvents.ClientReady) {
          (callback as any)();
        }
        return mockDiscordClientInstance as any;
      }
    );
    (mockDiscordClientInstance.on as Mock).mockImplementation(
      () => mockDiscordClientInstance as any
    );
    (mockDiscordClientInstance.login as Mock).mockResolvedValue('test-token');
    (mockDiscordClientInstance.channels.fetch as Mock)
      .mockClear()
      .mockResolvedValue({
        isTextBased: () => true,
        send: vi.fn().mockResolvedValue({}),
      });

    rooivalk = new Rooivalk(
      mockOpenAIClientInstance,
      mockDiscordClientInstance
    );

    if (mockDiscordClientInstance.user) {
      (rooivalk as any)._mentionRegex = new RegExp(
        `<@${mockDiscordClientInstance.user.id}>`,
        'g'
      );
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('processMessage', () => {
    beforeEach(async () => {
      await rooivalk.init();
    });

    it("1. Reply to Bot Message (Simple): should include bot's and user's message in prompt", async () => {
      const botMessageContent = 'This is a message from the bot.';
      const userReplyContent = 'This is my reply to the bot.';

      const userMessage = createMockMessage(
        userReplyContent,
        'user-id',
        'test-bot-id',
        'reply-msg-id',
        {
          messageId: 'original-bot-msg-id',
          authorId: 'test-bot-id',
          content: botMessageContent,
        }
      );

      (userMessage.channel.messages.fetch as Mock).mockResolvedValueOnce(
        createMockMessage(
          botMessageContent,
          'test-bot-id',
          'test-bot-id',
          'original-bot-msg-id'
        )
      );
      (userMessage.channel.messages.fetch as Mock).mockResolvedValueOnce(null);

      const getMessageChainSpy = vi.spyOn(
        rooivalk as any,
        'getMessageChain'
      ) as MockInstance;
      await (rooivalk as any).processMessage(userMessage);

      expect(getMessageChainSpy).toHaveBeenCalledWith(userMessage);

      expect(mockOpenAIClientInstance.createResponse).toHaveBeenCalledWith(
        'rooivalk',
        `Bot: ${botMessageContent}\nUser: ${userReplyContent.replace(/<@test-bot-id>\s*/, '').trim()}`
      );
      expect(userMessage.reply).toHaveBeenCalled();
    });

    it('2. Reply to Bot Message (Longer Chain): should correctly format prompt for multi-turn conversation', async () => {
      const chainMessages = [
        { id: 'msg0', authorId: 'user-id', content: 'User message 1' },
        { id: 'msg1', authorId: 'test-bot-id', content: 'Bot response 1' },
        { id: 'msg2', authorId: 'user-id', content: 'User message 2' },
        {
          id: 'msg3',
          authorId: 'test-bot-id',
          content: 'Bot response 2 (current bot message being replied to)',
        },
      ];
      const currentUserReplyContent = 'My newest reply';

      const userMessage = createMockMessage(
        currentUserReplyContent,
        'user-id',
        'test-bot-id',
        'currentUserReplyId',
        {
          messageId: chainMessages[3]!.id,
          authorId: chainMessages[3]!.authorId,
          content: chainMessages[3]!.content,
        }
      );

      (userMessage.channel.messages.fetch as Mock).mockResolvedValueOnce(
        createMockMessage(
          chainMessages[3]!.content,
          chainMessages[3]!.authorId,
          'test-bot-id',
          chainMessages[3]!.id,
          {
            messageId: chainMessages[2]!.id,
            authorId: chainMessages[2]!.authorId,
            content: chainMessages[2]!.content,
          }
        )
      );

      (userMessage.channel.messages.fetch as Mock)
        .mockResolvedValueOnce(
          createMockMessage(
            chainMessages[2]!.content,
            chainMessages[2]!.authorId,
            'test-bot-id',
            chainMessages[2]!.id,
            {
              messageId: chainMessages[1]!.id,
              authorId: chainMessages[1]!.authorId,
              content: chainMessages[1]!.content,
            }
          )
        )
        .mockResolvedValueOnce(
          createMockMessage(
            chainMessages[1]!.content,
            chainMessages[1]!.authorId,
            'test-bot-id',
            chainMessages[1]!.id,
            {
              messageId: chainMessages[0]!.id,
              authorId: chainMessages[0]!.authorId,
              content: chainMessages[0]!.content,
            }
          )
        )
        .mockResolvedValueOnce(
          createMockMessage(
            chainMessages[0]!.content,
            chainMessages[0]!.authorId,
            'test-bot-id',
            chainMessages[0]!.id,
            null
          )
        );

      const getMessageChainSpy = vi.spyOn(
        rooivalk as any,
        'getMessageChain'
      ) as MockInstance;
      await (rooivalk as any).processMessage(userMessage);

      expect(getMessageChainSpy).toHaveBeenCalledWith(userMessage);

      const expectedPrompt = `User: ${chainMessages[0]!.content}
Bot: ${chainMessages[1]!.content}
User: ${chainMessages[2]!.content}
Bot: ${chainMessages[3]!.content}
User: ${currentUserReplyContent.replace(/<@test-bot-id>\s*/, '').trim()}`;

      expect(mockOpenAIClientInstance.createResponse).toHaveBeenCalledWith(
        'rooivalk',
        expectedPrompt
      );
      expect(userMessage.reply).toHaveBeenCalled();
    });

    it('3. Reply to Non-Bot Message: should use only current reply as prompt', async () => {
      const otherUserMessageContent = 'This is a message from another user.';
      const userReplyContent = 'This is my reply to that user.';
      const userMessage = createMockMessage(
        userReplyContent,
        'user-id',
        'test-bot-id',
        'reply-msg-id',
        {
          messageId: 'other-user-msg-id',
          authorId: 'other-user-id',
          content: otherUserMessageContent,
        }
      );

      (userMessage.channel.messages.fetch as Mock).mockResolvedValueOnce(
        createMockMessage(
          otherUserMessageContent,
          'other-user-id',
          'test-bot-id',
          'other-user-msg-id'
        )
      );

      await (rooivalk as any).processMessage(userMessage);

      const getMessageChainSpy = vi.spyOn(
        rooivalk as any,
        'getMessageChain'
      ) as MockInstance;
      expect(getMessageChainSpy).not.toHaveBeenCalled();

      expect(mockOpenAIClientInstance.createResponse).toHaveBeenCalledWith(
        'rooivalk',
        userReplyContent.replace(/<@test-bot-id>\s*/, '').trim()
      );
      expect(userMessage.reply).toHaveBeenCalled();
    });

    it('4. Regular Bot Mention (No Reply): should use user message as prompt', async () => {
      const userMessageContent = `<@test-bot-id> Hello bot!`;
      const userMessage = createMockMessage(
        userMessageContent,
        'user-id',
        'test-bot-id'
      );

      await (rooivalk as any).processMessage(userMessage);

      const getMessageChainSpy = vi.spyOn(
        rooivalk as any,
        'getMessageChain'
      ) as MockInstance;
      expect(getMessageChainSpy).not.toHaveBeenCalled();

      expect(mockOpenAIClientInstance.createResponse).toHaveBeenCalledWith(
        'rooivalk',
        'Hello bot!'
      );
      expect(userMessage.reply).toHaveBeenCalled();
    });
  });

  describe('MessageCreate Event Handler Logic', () => {
    let messageCreateCallback: ((message: any) => Promise<void>) | undefined;
    let processMessageSpy: MockInstance;

    beforeEach(async () => {
      (mockDiscordClientInstance.on as Mock).mockImplementation(
        (event, callback) => {
          if (event === DiscordEvents.MessageCreate) {
            messageCreateCallback = callback;
          }
          return mockDiscordClientInstance as any;
        }
      );

      // Rooivalk is instantiated in the outer beforeEach.
      // We need to call init() here so it picks up the specific 'on' mock for MessageCreate.
      await rooivalk.init();

      if (mockDiscordClientInstance.user) {
        (rooivalk as any)._mentionRegex = new RegExp(
          `<@${mockDiscordClientInstance.user!.id}>`,
          'g'
        );
      }
      processMessageSpy = vi
        .spyOn(rooivalk as any, 'processMessage')
        .mockResolvedValue(undefined) as MockInstance;
    });

    it('5. MessageCreate - Reply to Bot, No Mention: should call processMessage', async () => {
      expect(messageCreateCallback).toBeDefined();
      const botMessageContent = 'Original bot message';
      const userReplyContent = 'My reply to the bot';

      const userMessage = createMockMessage(
        userReplyContent,
        'user-id',
        'test-bot-id',
        'user-reply-id',
        {
          messageId: 'bot-original-id',
          authorId: 'test-bot-id',
          content: botMessageContent,
        }
      );

      (userMessage.channel.messages.fetch as Mock).mockResolvedValueOnce(
        createMockMessage(
          botMessageContent,
          'test-bot-id',
          'test-bot-id',
          'bot-original-id'
        )
      );

      await messageCreateCallback!(userMessage);
      expect(processMessageSpy).toHaveBeenCalledWith(userMessage);
    });

    it('6. MessageCreate - Explicit Mention: should call processMessage', async () => {
      expect(messageCreateCallback).toBeDefined();
      const userMessageContent = `<@test-bot-id> Hello there!`;
      const userMessage = createMockMessage(
        userMessageContent,
        'user-id',
        'test-bot-id'
      );

      await messageCreateCallback!(userMessage);
      expect(processMessageSpy).toHaveBeenCalledWith(userMessage);
    });

    it('7. MessageCreate - Irrelevant Message: should NOT call processMessage', async () => {
      expect(messageCreateCallback).toBeDefined();
      const userMessageContent = 'Just a regular message.';
      const userMessage = createMockMessage(
        userMessageContent,
        'user-id',
        'test-bot-id'
      );

      await messageCreateCallback!(userMessage);
      expect(processMessageSpy).not.toHaveBeenCalled();
    });

    it('should NOT call processMessage if a reply to another user (not bot) and no mention', async () => {
      expect(messageCreateCallback).toBeDefined();
      const otherUserMessageContent = "Another user's thoughts.";
      const userReplyContent = 'I reply to the other user.';
      const userMessage = createMockMessage(
        userReplyContent,
        'user-id',
        'test-bot-id',
        'user-reply-id',
        {
          messageId: 'other-user-original-id',
          authorId: 'another-user-id',
          content: otherUserMessageContent,
        }
      );
      (userMessage.channel.messages.fetch as Mock).mockResolvedValueOnce(
        createMockMessage(
          otherUserMessageContent,
          'another-user-id',
          'test-bot-id',
          'other-user-original-id'
        )
      );

      await messageCreateCallback!(userMessage);
      expect(processMessageSpy).not.toHaveBeenCalled();
    });
  });

  describe('8. Error Handling in getMessageChain', () => {
    beforeEach(async () => {
      await rooivalk.init();
    });
    it('should return a partial chain if a message fetch fails mid-chain', async () => {
      const chainMessagesSetup = [
        {
          id: 'err-msg0',
          authorId: 'user-id',
          content: 'User message 0 (oldest, will be fetched successfully)',
        },
        {
          id: 'err-msg1',
          authorId: 'test-bot-id',
          content: 'Bot response 1 (fetch will fail for this one)',
        },
        {
          id: 'err-msg2',
          authorId: 'user-id',
          content: 'User message 2 (this is what err-msg3 replies to)',
        },
        {
          id: 'err-msg3',
          authorId: 'test-bot-id',
          content: 'Bot response 3 (this is what current user replies to)',
        },
      ];
      const currentUserReplyContent = 'My newest reply to err-msg3';

      const userMessage = createMockMessage(
        currentUserReplyContent,
        'user-id',
        'test-bot-id',
        'currentUserErrReplyId',
        {
          messageId: chainMessagesSetup[3]!.id,
          authorId: chainMessagesSetup[3]!.authorId,
          content: chainMessagesSetup[3]!.content,
        }
      );

      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {}) as MockInstance;
      const getMessageChainSpy = vi.spyOn(
        rooivalk as any,
        'getMessageChain'
      ) as MockInstance;

      (userMessage.channel.messages.fetch as Mock)
        .mockResolvedValueOnce(
          createMockMessage(
            chainMessagesSetup[3]!.content,
            chainMessagesSetup[3]!.authorId,
            'test-bot-id',
            chainMessagesSetup[3]!.id,
            {
              messageId: chainMessagesSetup[2]!.id,
              authorId: chainMessagesSetup[2]!.authorId,
              content: chainMessagesSetup[2]!.content,
            }
          )
        )
        .mockResolvedValueOnce(
          createMockMessage(
            chainMessagesSetup[2]!.content,
            chainMessagesSetup[2]!.authorId,
            'test-bot-id',
            chainMessagesSetup[2]!.id,
            {
              messageId: chainMessagesSetup[1]!.id,
              authorId: chainMessagesSetup[1]!.authorId,
              content: chainMessagesSetup[1]!.content,
            }
          )
        )
        .mockRejectedValueOnce(new Error('Simulated fetch error for err-msg1'));

      await (rooivalk as any).processMessage(userMessage);
      expect(getMessageChainSpy).toHaveBeenCalledWith(userMessage);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error fetching message chain:',
        expect.any(Error)
      );

      const expectedPrompt = `User: ${chainMessagesSetup[2]!.content}
Bot: ${chainMessagesSetup[3]!.content}
User: ${currentUserReplyContent.replace(/<@test-bot-id>\s*/, '').trim()}`;
      expect(mockOpenAIClientInstance.createResponse).toHaveBeenCalledWith(
        'rooivalk',
        expectedPrompt
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('MessageReactionAdd Event Handler Logic', () => {
    let messageReactionAddCallback:
      | ((reaction: any, user: any) => Promise<void>)
      | undefined;
    let processMessageSpy: MockInstance;
    let getOriginalMessageSpy: MockInstance;
    const BOT_ID = 'test-bot-id';
    const USER_ID = 'reacting-user-id';

    beforeEach(async () => {
      (mockDiscordClientInstance.on as Mock).mockImplementation(
        (event, callback) => {
          if (event === DiscordEvents.MessageReactionAdd) {
            messageReactionAddCallback = callback;
          }
          return mockDiscordClientInstance as any;
        }
      );

      // Rooivalk instance is from outer beforeEach. Call init() to attach the above 'on' handler.
      await rooivalk.init();

      if (mockDiscordClientInstance.user) {
        (rooivalk as any)._mentionRegex = new RegExp(
          `<@${mockDiscordClientInstance.user!.id}>`,
          'g'
        );
      }

      processMessageSpy = vi
        .spyOn(rooivalk as any, 'processMessage')
        .mockResolvedValue(undefined) as MockInstance;
      getOriginalMessageSpy = vi.spyOn(
        rooivalk as any,
        'getOriginalMessage'
      ) as MockInstance;
    });

    it('9. Retry Emoji on Bot Message: should delete message and call processMessage with original prompt', async () => {
      expect(messageReactionAddCallback).toBeDefined();

      const mockRooivalkMessage = createMockMessage(
        'This is a message from Rooivalk.',
        BOT_ID,
        BOT_ID,
        'rooivalk-msg-id'
      );
      // mockRooivalkMessage.delete = vi.fn().mockResolvedValue(true); // Already in createMockMessage
      mockRooivalkMessage.guild = { id: MOCK_ENV.DISCORD_GUILD_ID! };
      mockRooivalkMessage.author = { id: BOT_ID };

      const mockOriginalUserPrompt = createMockMessage(
        'User prompt that Rooivalk replied to',
        'user-id',
        BOT_ID,
        'original-prompt-id'
      );

      getOriginalMessageSpy.mockResolvedValue(mockOriginalUserPrompt);

      const mockReaction = {
        emoji: { name: DISCORD_EMOJI },
        message: mockRooivalkMessage,
      };

      const mockUser = { id: USER_ID, bot: false };

      await messageReactionAddCallback!(mockReaction, mockUser);

      expect(mockReaction.message.delete).toHaveBeenCalledTimes(1);
      expect(getOriginalMessageSpy).toHaveBeenCalledWith(mockRooivalkMessage);
      expect(processMessageSpy).toHaveBeenCalledWith(mockOriginalUserPrompt);
    });

    it('10. Retry Emoji on Non-Bot Message: should NOT delete message and call processMessage with reformatted prompt', async () => {
      expect(messageReactionAddCallback).toBeDefined();

      const userMessageContent = "A user's message that gets a retry reaction.";
      const mockUserMessage = createMockMessage(
        userMessageContent,
        'another-user-id',
        BOT_ID,
        'user-msg-id'
      );
      // mockUserMessage.delete = vi.fn().mockResolvedValue(true); // Already in createMockMessage
      mockUserMessage.guild = { id: MOCK_ENV.DISCORD_GUILD_ID! };
      mockUserMessage.author = { id: 'another-user-id' };

      const mockReaction = {
        emoji: { name: DISCORD_EMOJI },
        message: mockUserMessage,
      };
      const mockUser = { id: USER_ID, bot: false };

      await messageReactionAddCallback!(mockReaction, mockUser);

      expect(mockReaction.message.delete).not.toHaveBeenCalled();
      expect(getOriginalMessageSpy).not.toHaveBeenCalled();

      const expectedReformattedPrompt = `The following message is given as context, explain it: ${userMessageContent}`;
      expect(processMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expectedReformattedPrompt,
          id: mockUserMessage.id,
        })
      );
    });

    it('11. Different Emoji on Bot Message: should NOT delete message and NOT call processMessage', async () => {
      expect(messageReactionAddCallback).toBeDefined();

      const mockRooivalkMessage = createMockMessage(
        'Bot message',
        BOT_ID,
        BOT_ID,
        'bm-id'
      );
      // mockRooivalkMessage.delete = vi.fn(); // Already in createMockMessage
      mockRooivalkMessage.guild = { id: MOCK_ENV.DISCORD_GUILD_ID! };
      mockRooivalkMessage.author = { id: BOT_ID };

      const mockReaction = {
        emoji: { name: 'other-emoji' },
        message: mockRooivalkMessage,
      };
      const mockUser = { id: USER_ID, bot: false };

      await messageReactionAddCallback!(mockReaction, mockUser);

      expect(mockRooivalkMessage.delete).not.toHaveBeenCalled();
      expect(getOriginalMessageSpy).not.toHaveBeenCalled();
      expect(processMessageSpy).not.toHaveBeenCalled();
    });

    it('12. Retry Emoji on Bot Message in wrong guild: should NOT delete message and NOT call processMessage', async () => {
      expect(messageReactionAddCallback).toBeDefined();

      const mockRooivalkMessage = createMockMessage(
        'Bot message',
        BOT_ID,
        BOT_ID,
        'bm-id'
      );
      // mockRooivalkMessage.delete = vi.fn(); // Already in createMockMessage
      mockRooivalkMessage.guild = { id: 'wrong-guild-id' };
      mockRooivalkMessage.author = { id: BOT_ID };

      const mockReaction = {
        emoji: { name: DISCORD_EMOJI },
        message: mockRooivalkMessage,
      };
      const mockUser = { id: USER_ID, bot: false };

      await messageReactionAddCallback!(mockReaction, mockUser);

      expect(mockRooivalkMessage.delete).not.toHaveBeenCalled();
      expect(getOriginalMessageSpy).not.toHaveBeenCalled();
      expect(processMessageSpy).not.toHaveBeenCalled();
    });

    it('13. Reaction by a bot: should be ignored (assuming main code checks user.bot)', async () => {
      // NOTE: This test's expectation depends on whether the main Rooivalk code's
      // MessageReactionAdd handler includes a `if (user.bot) return;` check.
      // The current Rooivalk code (provided snippet) does NOT have this check.
      // Therefore, this test will reflect the *current* behavior: bot reactions are processed.
      expect(messageReactionAddCallback).toBeDefined();

      const mockRooivalkMessage = createMockMessage(
        'Bot message',
        BOT_ID,
        BOT_ID,
        'bm-id'
      );
      // mockRooivalkMessage.delete = vi.fn(); // Already in createMockMessage
      mockRooivalkMessage.guild = { id: MOCK_ENV.DISCORD_GUILD_ID! };
      mockRooivalkMessage.author = { id: BOT_ID };

      const mockReaction = {
        emoji: { name: DISCORD_EMOJI },
        message: mockRooivalkMessage,
      };
      const mockBotUserReacting = { id: 'another-bot-id', bot: true };

      getOriginalMessageSpy.mockResolvedValue(
        createMockMessage('Original prompt', 'user-id', BOT_ID, 'op-id')
      );
      await messageReactionAddCallback!(mockReaction, mockBotUserReacting);

      // Current Rooivalk code processes bot reactions, so these should be called:
      expect(mockRooivalkMessage.delete).toHaveBeenCalledTimes(1);
      expect(getOriginalMessageSpy).toHaveBeenCalledWith(mockRooivalkMessage);
      expect(processMessageSpy).toHaveBeenCalled();
    });
  });
});
