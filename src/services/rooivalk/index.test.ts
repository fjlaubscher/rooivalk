import {
  vi,
  describe,
  beforeEach,
  afterEach,
  it,
  expect,
  beforeAll,
  afterAll,
} from 'vitest';
import { Collection, Events as DiscordEvents } from 'discord.js';
import type {
  Attachment,
  Message,
  ChatInputCommandInteraction,
  ThreadChannel,
} from 'discord.js';

import { silenceConsole } from '../../test-utils/consoleMocks.ts';
import { createMockMessage } from '../../test-utils/createMockMessage.ts';
import { MOCK_CONFIG, MOCK_ENV } from '../../test-utils/mock.ts';

import { buildPromptAuthor } from './helpers.ts';

let restoreConsole: () => void;

beforeAll(() => {
  restoreConsole = silenceConsole({
    ignoreErrors: ['OpenAI error!', 'Startup channel ID not set', 'blocked'],
    ignoreLogs: ['🤖 Logged in as', 'Successfully registered slash commands.'],
  });
});

afterAll(() => {
  restoreConsole();
});

import Rooivalk from './index.ts';

// Create mock instances using vi.mocked
const mockDiscordService = vi.mocked({
  mentionRegex: new RegExp(`<@test-bot-id>`, 'g'),
  client: {
    user: { id: 'test-bot-id', tag: 'TestBot#0000' },
    channels: { fetch: vi.fn() },
  },
  allowedEmojis: [],
  startupChannelId: 'test-startup-channel-id',
  buildMessageReply: vi.fn().mockReturnValue({}),
  buildImageReply: vi.fn().mockReturnValue({ embeds: [], files: [] }),
  chunkContent: vi.fn(),
  getRooivalkResponse: vi.fn().mockReturnValue('Error!'),
  getGuildEventsBetween: vi.fn(),
  fetchScheduledEventsBetween: vi.fn(),
  registerSlashCommands: vi.fn(),
  sendReadyMessage: vi.fn(),
  setupMentionRegex: vi.fn(),
  cacheGuildEmojis: vi.fn(),
  on: vi.fn(),
  once: vi.fn(),
  login: vi.fn(),
} as any);

const mockChatClient = vi.mocked({
  createResponse: vi.fn(),
  generateThreadName: vi.fn(),
  reloadConfig: vi.fn(),
} as any);

const mockMemoryService = vi.mocked({
  getPreferences: vi.fn().mockReturnValue([]),
  getConversationResponseId: vi.fn().mockReturnValue(null),
  setConversationResponseId: vi.fn(),
  clearConversationResponseId: vi.fn(),
  recall: vi.fn(),
  remember: vi.fn(),
  forgetMemory: vi.fn(),
  close: vi.fn(),
} as any);

const mockOpenAIClient = vi.mocked({
  createResponse: vi.fn(),
  createImage: vi.fn(),
  generateThreadName: vi.fn(),
  reloadConfig: vi.fn(),
} as any);

const BOT_ID = 'test-bot-id';
const mockPeapixService = vi.mocked({
  getImage: vi.fn(),
} as any);

const mockEmojiService = vi.mocked({
  recordReaction: vi.fn(),
  getTopMessages: vi.fn().mockReturnValue([]),
  getTopGivers: vi.fn().mockReturnValue([]),
  getTopEmojis: vi.fn().mockReturnValue([]),
  close: vi.fn(),
} as any);

describe('Rooivalk', () => {
  let rooivalk: Rooivalk;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('process', { env: { ...MOCK_ENV } });

    mockChatClient.createResponse.mockResolvedValue('Mocked AI Response');
    mockChatClient.generateThreadName.mockResolvedValue('Thread Title');
    mockOpenAIClient.createImage.mockReset();
    mockPeapixService.getImage.mockResolvedValue(null);
    mockDiscordService.mentionRegex = new RegExp(`<@${BOT_ID}>`, 'g');

    Object.defineProperty(mockDiscordService, 'client', {
      get: () => ({
        user: { id: BOT_ID, tag: 'TestBot#0000' },
        channels: { fetch: vi.fn() },
      }),
      configurable: true,
    });

    rooivalk = new Rooivalk(
      MOCK_CONFIG,
      mockDiscordService,
      mockChatClient,
      mockOpenAIClient,
      undefined,
      undefined,
      undefined,
      mockMemoryService,
      undefined,
      mockEmojiService,
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('when processing a message', () => {
    describe('previous_response_id lookup', () => {
      it('passes null when the user message is a standalone mention', async () => {
        const userMessage = createMockMessage({
          content: `<@${BOT_ID}> Hi!`,
        } as Partial<Message<boolean>>);
        mockChatClient.createResponse.mockResolvedValue({
          type: 'text',
          content: 'ok',
          base64Images: [],
          responseId: 'resp-new',
        });
        mockDiscordService.buildMessageReply.mockReturnValue({
          content: 'ok',
        });
        (userMessage.reply as any).mockResolvedValue(
          createMockMessage({ id: 'bot-reply-1' }),
        );

        await (rooivalk as any).processMessage(userMessage);

        const expectedAuthor = buildPromptAuthor(userMessage.author);
        expect(mockChatClient.createResponse).toHaveBeenCalledWith(
          expectedAuthor,
          'Hi!',
          null,
          null,
          expect.any(Function),
          expect.any(Array),
        );
      });

      it('passes the stored previous_response_id for replies to bot messages', async () => {
        const userMessage = createMockMessage({
          content: `<@${BOT_ID}> Follow up`,
          reference: { messageId: 'prev-bot-msg' } as any,
        } as Partial<Message<boolean>>);

        mockMemoryService.getConversationResponseId.mockReturnValueOnce(
          'stored-resp-id',
        );
        mockChatClient.createResponse.mockResolvedValue({
          type: 'text',
          content: 'ok',
          base64Images: [],
          responseId: 'resp-new',
        });
        mockDiscordService.buildMessageReply.mockReturnValue({
          content: 'ok',
        });
        (userMessage.reply as any).mockResolvedValue(
          createMockMessage({ id: 'bot-reply-2' }),
        );

        await (rooivalk as any).processMessage(userMessage);

        expect(
          mockMemoryService.getConversationResponseId,
        ).toHaveBeenCalledWith({
          type: 'msg',
          refId: 'prev-bot-msg',
        });
        const call = mockChatClient.createResponse.mock.calls.at(-1)!;
        expect(call[2]).toBe('stored-resp-id');
      });

      it('persists the new response_id under the bot reply message id', async () => {
        const userMessage = createMockMessage({
          content: `<@${BOT_ID}> Hi!`,
        } as Partial<Message<boolean>>);
        mockChatClient.createResponse.mockResolvedValue({
          type: 'text',
          content: 'ok',
          base64Images: [],
          responseId: 'resp-fresh',
        });
        mockDiscordService.buildMessageReply.mockReturnValue({
          content: 'ok',
        });
        (userMessage.reply as any).mockResolvedValue(
          createMockMessage({ id: 'bot-reply-stored' }),
        );

        await (rooivalk as any).processMessage(userMessage);

        expect(
          mockMemoryService.setConversationResponseId,
        ).toHaveBeenCalledWith(
          { type: 'msg', refId: 'bot-reply-stored' },
          'resp-fresh',
        );
      });

      it('writes both a msg and a thread ref when a thread was created this turn', async () => {
        const userMessage = createMockMessage({
          content: `<@${BOT_ID}> spawn a thread please`,
        } as Partial<Message<boolean>>);
        const createdThread = {
          id: 'newborn-thread',
          send: vi
            .fn()
            .mockResolvedValue(createMockMessage({ id: 'bot-in-thread' })),
        } as any;
        mockChatClient.createResponse.mockResolvedValue({
          type: 'text',
          content: 'sure',
          base64Images: [],
          createdThread,
          responseId: 'resp-thread-born',
        });
        mockDiscordService.buildMessageReply.mockReturnValue({
          content: 'sure',
        });

        await (rooivalk as any).processMessage(userMessage);

        const calls = mockMemoryService.setConversationResponseId.mock.calls;
        expect(calls).toEqual(
          expect.arrayContaining([
            [{ type: 'msg', refId: 'bot-in-thread' }, 'resp-thread-born'],
            [{ type: 'thread', refId: 'newborn-thread' }, 'resp-thread-born'],
          ]),
        );
      });

      it('includes the referenced message as quoted context when no prior response id is stored', async () => {
        const userMessage = createMockMessage({
          content: `<@${BOT_ID}> wat se ek hier`,
          reference: { messageId: 'plain-user-msg' } as any,
        } as Partial<Message<boolean>>);
        (userMessage.channel.messages.fetch as any).mockResolvedValue({
          author: { displayName: 'chipgatsby', username: 'chipgatsby' } as any,
          content: 'blablabla',
          attachments: new Collection<string, Attachment>(),
        });
        mockChatClient.createResponse.mockResolvedValue({
          type: 'text',
          content: 'ok',
          base64Images: [],
          responseId: 'resp-new',
        });
        mockDiscordService.buildMessageReply.mockReturnValue({ content: 'ok' });
        (userMessage.reply as any).mockResolvedValue(
          createMockMessage({ id: 'bot-reply-ctx' }),
        );

        await (rooivalk as any).processMessage(userMessage);

        expect(userMessage.channel.messages.fetch).toHaveBeenCalledWith(
          'plain-user-msg',
        );
        const call = mockChatClient.createResponse.mock.calls.at(-1)!;
        expect(call[1]).toBe(
          '[Replying to chipgatsby: "blablabla"]\nwat se ek hier',
        );
        expect(call[2]).toBeNull();
      });

      it('forwards attachments from the referenced message', async () => {
        const refImage = {
          url: 'https://cdn.discordapp.com/attachments/ref-image.png',
          contentType: 'image/png',
          name: 'ref-image.png',
        } as unknown as Attachment;
        const userMessage = createMockMessage({
          content: `<@${BOT_ID}> what's in this image?`,
          reference: { messageId: 'msg-with-image' } as any,
        } as Partial<Message<boolean>>);
        (userMessage.channel.messages.fetch as any).mockResolvedValue({
          author: { displayName: 'chipgatsby', username: 'chipgatsby' } as any,
          content: 'check this out',
          attachments: new Collection<string, Attachment>([['1', refImage]]),
        });
        mockChatClient.createResponse.mockResolvedValue({
          type: 'text',
          content: 'ok',
          base64Images: [],
          responseId: 'resp-new',
        });
        mockDiscordService.buildMessageReply.mockReturnValue({ content: 'ok' });
        (userMessage.reply as any).mockResolvedValue(
          createMockMessage({ id: 'bot-reply-att' }),
        );

        await (rooivalk as any).processMessage(userMessage);

        const call = mockChatClient.createResponse.mock.calls.at(-1)!;
        expect(call[1]).toBe(
          '[Replying to chipgatsby: "check this out" (1 attachment)]\nwhat\'s in this image?',
        );
        expect(call[3]).toEqual([
          {
            url: refImage.url,
            name: refImage.name,
            contentType: 'image/png',
            kind: 'image',
          },
        ]);
      });

      it('does not fetch the referenced message when a prior response id was found', async () => {
        const userMessage = createMockMessage({
          content: `<@${BOT_ID}> follow up`,
          reference: { messageId: 'prev-bot-msg' } as any,
        } as Partial<Message<boolean>>);
        mockMemoryService.getConversationResponseId.mockReturnValueOnce(
          'stored-resp-id',
        );
        mockChatClient.createResponse.mockResolvedValue({
          type: 'text',
          content: 'ok',
          base64Images: [],
          responseId: 'resp-new',
        });
        mockDiscordService.buildMessageReply.mockReturnValue({ content: 'ok' });
        (userMessage.reply as any).mockResolvedValue(
          createMockMessage({ id: 'bot-reply-skip' }),
        );

        await (rooivalk as any).processMessage(userMessage);

        expect(userMessage.channel.messages.fetch).not.toHaveBeenCalled();
        const call = mockChatClient.createResponse.mock.calls.at(-1)!;
        expect(call[1]).toBe('follow up');
      });

      it('falls back to the bare prompt when fetching the referenced message fails', async () => {
        const userMessage = createMockMessage({
          content: `<@${BOT_ID}> wat se ek hier`,
          reference: { messageId: 'gone-msg' } as any,
        } as Partial<Message<boolean>>);
        (userMessage.channel.messages.fetch as any).mockRejectedValue(
          new Error('blocked'),
        );
        mockChatClient.createResponse.mockResolvedValue({
          type: 'text',
          content: 'ok',
          base64Images: [],
          responseId: 'resp-new',
        });
        mockDiscordService.buildMessageReply.mockReturnValue({ content: 'ok' });
        (userMessage.reply as any).mockResolvedValue(
          createMockMessage({ id: 'bot-reply-fail' }),
        );

        await (rooivalk as any).processMessage(userMessage);

        const call = mockChatClient.createResponse.mock.calls.at(-1)!;
        expect(call[1]).toBe('wat se ek hier');
        expect(call[3]).toBeNull();
      });

      it('clears the stored response id when the context is lost', async () => {
        const userMessage = createMockMessage({
          content: `<@${BOT_ID}> still there?`,
          reference: { messageId: 'lost-ref' } as any,
        } as Partial<Message<boolean>>);
        mockMemoryService.getConversationResponseId.mockReturnValueOnce(
          'stale-id',
        );
        mockChatClient.createResponse.mockResolvedValue({
          type: 'text',
          content: 'starting fresh',
          base64Images: [],
          responseId: 'resp-fresh',
          contextLost: true,
        });
        mockDiscordService.buildMessageReply.mockReturnValue({
          content: 'starting fresh',
        });
        (userMessage.reply as any).mockResolvedValue(
          createMockMessage({ id: 'bot-after-loss' }),
        );

        await (rooivalk as any).processMessage(userMessage);

        expect(
          mockMemoryService.clearConversationResponseId,
        ).toHaveBeenCalledWith({ type: 'msg', refId: 'lost-ref' });
      });
    });

    it('should include allowed text attachments when prompting OpenAI', async () => {
      const attachment = {
        url: 'https://cdn.discordapp.com/attachments/file.md',
        contentType: 'text/markdown',
        name: 'file.md',
      } as unknown as Attachment;

      const userMessage = createMockMessage({
        content: `<@${BOT_ID}> Please review the attached notes`,
        attachments: new Collection<string, Attachment>([['1', attachment]]),
      } as Partial<Message<boolean>>);

      await (rooivalk as any).processMessage(userMessage);

      const expectedAuthor = buildPromptAuthor(userMessage.author);

      expect(mockChatClient.createResponse).toHaveBeenCalledWith(
        expectedAuthor,
        'Please review the attached notes',
        null,
        [
          {
            url: attachment.url,
            name: attachment.name,
            contentType: 'text/markdown',
            kind: 'file',
          },
        ],
        expect.any(Function),
        expect.any(Array),
      );
    });

    describe('Rooivalk private shouldProcessMessage', () => {
      it('returns true for whitelisted bot', () => {
        const allowedBotId = 'allowed-bot-id';
        // Set up environment with allowed bot ID
        vi.stubGlobal('process', {
          env: { ...MOCK_ENV, DISCORD_ALLOWED_APPS: allowedBotId },
        });

        // Create new instance with updated environment
        const testRooivalk = new Rooivalk(
          MOCK_CONFIG,
          mockDiscordService,
          mockChatClient,
          mockOpenAIClient,
        );

        const msg = Object.assign(createMockMessage(), {
          author: { id: allowedBotId, bot: true } as any,
          guild: { id: 'guild-id' } as any,
        });
        // @ts-expect-error: testing private method
        expect(testRooivalk.shouldProcessMessage(msg, 'guild-id')).toBe(true);
      });

      it('returns false for non-whitelisted bot', () => {
        const msg = Object.assign(createMockMessage(), {
          author: { id: 'not-allowed-bot-id', bot: true } as any,
          guild: { id: 'guild-id' } as any,
        });
        // @ts-expect-error: testing private method
        expect(rooivalk.shouldProcessMessage(msg, 'guild-id')).toBe(false);
      });

      it('returns false for wrong guild', () => {
        const allowedBotId = 'allowed-bot-id';
        // Set up environment with allowed bot ID
        vi.stubGlobal('process', {
          env: { ...MOCK_ENV, DISCORD_ALLOWED_APPS: allowedBotId },
        });

        // Create new instance with updated environment
        const testRooivalk = new Rooivalk(
          MOCK_CONFIG,
          mockDiscordService,
          mockChatClient,
          mockOpenAIClient,
        );

        const msg = Object.assign(createMockMessage(), {
          author: { id: allowedBotId, bot: true } as any,
          guild: { id: 'other-guild' } as any,
        });
        // @ts-expect-error: testing private method
        expect(testRooivalk.shouldProcessMessage(msg, 'guild-id')).toBe(false);
      });

      it('returns true for a user (not a bot)', () => {
        const msg = Object.assign(createMockMessage(), {
          author: { id: 'user-id', bot: false } as any,
          guild: { id: 'guild-id' } as any,
        });
        // @ts-expect-error: testing private method
        expect(rooivalk.shouldProcessMessage(msg, 'guild-id')).toBe(true);
      });
    });

    it('uses the bare message content when no prior response id is stored', async () => {
      const userMessage = createMockMessage({
        content: `<@${BOT_ID}> Hello bot!`,
      } as Partial<Message<boolean>>);
      await (rooivalk as any).processMessage(userMessage);

      const expectedAuthor = buildPromptAuthor(userMessage.author);
      expect(mockChatClient.createResponse).toHaveBeenCalledWith(
        expectedAuthor,
        'Hello bot!',
        null,
        null,
        expect.any(Function),
        expect.any(Array),
      );
    });

    it('fetches preferences for the author and passes them to createResponse', async () => {
      const mockGetPreferences = vi.fn().mockReturnValue([
        {
          id: 1,
          discord_user_id: 'mock-user-id',
          content: 'call me Francois',
          kind: 'preference',
          created_at: 0,
        },
      ]);
      const mockMemory = { getPreferences: mockGetPreferences } as any;

      const rooivalkWithMemory = new Rooivalk(
        MOCK_CONFIG,
        mockDiscordService,
        mockChatClient,
        mockOpenAIClient,
        undefined,
        undefined,
        undefined,
        mockMemory,
      );

      const userMessage = createMockMessage({
        content: `<@${BOT_ID}> Hi!`,
      } as Partial<Message<boolean>>);

      await (rooivalkWithMemory as any).processMessage(userMessage);

      expect(mockGetPreferences).toHaveBeenCalledWith(userMessage.author.id);
      const callArgs = mockChatClient.createResponse.mock.calls[0]!;
      expect(callArgs[5]).toEqual([
        {
          id: 1,
          discord_user_id: 'mock-user-id',
          content: 'call me Francois',
          kind: 'preference',
          created_at: 0,
        },
      ]);
    });

    describe('and OpenAI returns null', () => {
      it('should reply with error message if OpenAI response is null', async () => {
        const userMessage = createMockMessage({
          content: `<@${BOT_ID}> Fail!`,
        } as Partial<Message<boolean>>);
        mockChatClient.createResponse.mockResolvedValue(null);
        await (rooivalk as any).processMessage(userMessage);
        expect(userMessage.reply).toHaveBeenCalledWith('Error!');
      });
    });

    describe('and OpenAI throws an error', () => {
      it('should reply with error message and error details if OpenAI throws', async () => {
        const userMessage = createMockMessage({
          content: `<@${BOT_ID}> Fail!`,
        } as Partial<Message<boolean>>);
        mockChatClient.createResponse.mockRejectedValue(
          new Error('OpenAI error!'),
        );
        await (rooivalk as any).processMessage(userMessage);
        expect(userMessage.reply).toHaveBeenCalledWith(
          expect.stringContaining('OpenAI error!'),
        );
      });
    });

    describe('and a channel route is configured', () => {
      const FH_ROLE_ID = 'fh-role-id';
      const FH_CHANNEL_ID = 'fh-channel-id';
      const ROUTE_NAME = 'field-hospital';

      const ROUTED_CONFIG = {
        ...MOCK_CONFIG,
        profiles: { [ROUTE_NAME]: 'Field hospital instructions' },
        routes: [
          {
            name: ROUTE_NAME,
            channelId: FH_CHANNEL_ID,
            roleId: FH_ROLE_ID,
            instructions: ROUTE_NAME,
          },
        ],
      };

      const mockRoutedChat = vi.mocked({
        createResponse: vi.fn(),
        generateThreadName: vi.fn(),
        reloadConfig: vi.fn(),
      } as any);

      const routedChatServices = new Map([[ROUTE_NAME, mockRoutedChat]]);

      const buildRouteMessage = (roleIds: string[], channelId: string) =>
        createMockMessage({
          content: `<@${BOT_ID}> xray please`,
          channelId,
          member: {
            roles: { cache: { has: (id: string) => roleIds.includes(id) } },
          },
          channel: {
            id: channelId,
            isThread: () => false,
            parentId: null,
          },
        } as Partial<Message<boolean>>);

      beforeEach(() => {
        mockRoutedChat.createResponse.mockResolvedValue(
          'Field hospital response',
        );
        mockRoutedChat.generateThreadName.mockResolvedValue(
          'Field Hospital Title',
        );
      });

      it('routes to the matching chat service when role and channel match', async () => {
        const routedRooivalk = new Rooivalk(
          ROUTED_CONFIG,
          mockDiscordService,
          mockChatClient,
          mockOpenAIClient,
          undefined,
          undefined,
          routedChatServices,
        );

        const msg = buildRouteMessage([FH_ROLE_ID], FH_CHANNEL_ID);
        await (routedRooivalk as any).processMessage(msg);

        expect(mockRoutedChat.createResponse).toHaveBeenCalledTimes(1);
        expect(mockChatClient.createResponse).not.toHaveBeenCalled();
      });

      it('falls back to the default chat service when no route matches', async () => {
        const routedRooivalk = new Rooivalk(
          ROUTED_CONFIG,
          mockDiscordService,
          mockChatClient,
          mockOpenAIClient,
          undefined,
          undefined,
          routedChatServices,
        );

        const msg = buildRouteMessage([FH_ROLE_ID], 'other-channel');
        await (routedRooivalk as any).processMessage(msg);

        expect(mockChatClient.createResponse).toHaveBeenCalledTimes(1);
        expect(mockRoutedChat.createResponse).not.toHaveBeenCalled();
      });
    });

    describe('get_emojis tool executor', () => {
      it('returns the cached emoji list when emojis are available', async () => {
        Object.defineProperty(mockDiscordService, 'allowedEmojis', {
          get: () => [':foo: → <:foo:111>', ':bar: → <:bar:222>'],
          configurable: true,
        });

        const message = createMockMessage({
          content: `<@${BOT_ID}> what emojis do we have`,
        } as Partial<Message<boolean>>);

        const executor = (rooivalk as any).createToolExecutor(message);
        const result = await executor('get_emojis', {});

        expect(result.output).toContain(':foo: → <:foo:111>');
        expect(result.output).toContain(':bar: → <:bar:222>');
      });

      it('returns a note when no emojis are cached', async () => {
        Object.defineProperty(mockDiscordService, 'allowedEmojis', {
          get: () => [],
          configurable: true,
        });

        const message = createMockMessage({
          content: `<@${BOT_ID}> emojis?`,
        } as Partial<Message<boolean>>);

        const executor = (rooivalk as any).createToolExecutor(message);
        const result = await executor('get_emojis', {});

        const parsed = JSON.parse(result.output);
        expect(parsed.note).toContain('No custom emojis');
      });
    });

    describe('get_game_listing tool executor', () => {
      const mockSteamService = vi.mocked({
        findGame: vi.fn(),
        getGameDetails: vi.fn(),
        syncAppList: vi.fn(),
        close: vi.fn(),
      } as any);

      let rooivalkWithSteam: Rooivalk;

      beforeEach(() => {
        vi.clearAllMocks();
        rooivalkWithSteam = new Rooivalk(
          MOCK_CONFIG,
          mockDiscordService,
          mockChatClient,
          mockOpenAIClient,
          undefined,
          undefined,
          undefined,
          undefined,
          mockSteamService,
        );
      });

      it('returns an error payload for unsupported stores', async () => {
        const message = createMockMessage({
          content: `<@${BOT_ID}> price of X`,
        } as Partial<Message<boolean>>);

        const executor = (rooivalkWithSteam as any).createToolExecutor(message);
        const result = await executor('get_game_listing', {
          query: 'X',
          store: 'psn',
        });

        const parsed = JSON.parse(result.output);
        expect(parsed.error).toContain('not yet supported');
      });

      it('returns an error payload when the game is not found', async () => {
        mockSteamService.findGame.mockReturnValue(null);

        const message = createMockMessage({
          content: `<@${BOT_ID}> price of Unknown Game`,
        } as Partial<Message<boolean>>);

        const executor = (rooivalkWithSteam as any).createToolExecutor(message);
        const result = await executor('get_game_listing', {
          query: 'Unknown Game',
          store: 'steam',
        });

        const parsed = JSON.parse(result.output);
        expect(parsed.error).toContain('Game not found');
      });

      it('returns an error payload when getGameDetails returns null', async () => {
        mockSteamService.findGame.mockReturnValue({
          appid: 1245620,
          name: 'Elden Ring',
        });
        mockSteamService.getGameDetails.mockResolvedValue(null);

        const message = createMockMessage({
          content: `<@${BOT_ID}> info on Elden Ring`,
        } as Partial<Message<boolean>>);

        const executor = (rooivalkWithSteam as any).createToolExecutor(message);
        const result = await executor('get_game_listing', {
          query: 'Elden Ring',
          store: 'steam',
        });

        const parsed = JSON.parse(result.output);
        expect(parsed.error).toContain('Could not retrieve game details');
      });

      it('returns serialised game details on success', async () => {
        const details = {
          appid: 1245620,
          name: 'Elden Ring',
          is_free: false,
          short_description: 'An open world action RPG.',
          developers: ['FromSoftware'],
          publishers: ['Bandai Namco'],
          price: {
            currency: 'ZAR',
            initial_formatted: 'R1,049',
            final_formatted: 'R999',
            discount_percent: 5,
          },
          genres: ['Action', 'RPG'],
          categories: ['Single-player'],
          release_date: '25 Feb, 2022',
          header_image: 'https://cdn.steam.com/header.jpg',
          platforms: { windows: true, mac: false, linux: false },
          achievements_total: 42,
          recommendations_total: 100000,
          supported_languages: 'English',
        };

        mockSteamService.findGame.mockReturnValue({
          appid: 1245620,
          name: 'Elden Ring',
        });
        mockSteamService.getGameDetails.mockResolvedValue(details);

        const message = createMockMessage({
          content: `<@${BOT_ID}> info on Elden Ring`,
        } as Partial<Message<boolean>>);

        const executor = (rooivalkWithSteam as any).createToolExecutor(message);
        const result = await executor('get_game_listing', {
          query: 'Elden Ring',
          store: 'steam',
        });

        const parsed = JSON.parse(result.output);
        expect(parsed.appid).toBe(1245620);
        expect(parsed.name).toBe('Elden Ring');
        expect(parsed.price.currency).toBe('ZAR');
        expect(parsed.genres).toEqual(['Action', 'RPG']);
        expect(mockSteamService.findGame).toHaveBeenCalledWith('Elden Ring');
        expect(mockSteamService.getGameDetails).toHaveBeenCalledWith(1245620);
      });

      it('returns an error payload when getGameDetails throws', async () => {
        mockSteamService.findGame.mockReturnValue({
          appid: 1,
          name: 'Elden Ring',
        });
        mockSteamService.getGameDetails.mockRejectedValue(
          new Error('Network error'),
        );

        const message = createMockMessage({
          content: `<@${BOT_ID}> price of Elden Ring`,
        } as Partial<Message<boolean>>);

        const executor = (rooivalkWithSteam as any).createToolExecutor(message);
        const result = await executor('get_game_listing', {
          query: 'Elden Ring',
          store: 'steam',
        });

        const parsed = JSON.parse(result.output);
        expect(parsed.error).toBe('Network error');
      });
    });
  });

  describe('when sending a message to the startup channel', () => {
    describe('and the channel is available and text-based', () => {
      it('should send OpenAI response to startup channel', async () => {
        mockChatClient.createResponse.mockResolvedValue('Startup response');
        const mockChannel = { isTextBased: () => true, send: vi.fn() };
        // Patch the client getter to return a channels.fetch mock for this test
        Object.defineProperty(mockDiscordService, 'client', {
          get: () => ({
            user: { id: BOT_ID, tag: 'TestBot#0000' },
            channels: { fetch: vi.fn().mockResolvedValue(mockChannel) },
          }),
          configurable: true,
        });
        // Ensure buildMessageReply returns a valid message object
        mockDiscordService.buildMessageReply.mockResolvedValue({
          content: 'test',
        });
        await rooivalk.sendMessageToChannel(
          'startup-channel-id',
          'Hello startup!',
        );
        expect(mockChannel.send).toHaveBeenCalled();
      });
    });

    describe('and the startup channel is not set', () => {
      it('should return null and log error if startup channel is not set', async () => {
        Object.defineProperty(mockDiscordService, 'startupChannelId', {
          get: () => undefined,
          configurable: true,
        });
        const result = await rooivalk.sendMessageToChannel(
          'startup-channel-id',
          'Hello startup!',
        );
        expect(result).toBeNull();
      });
    });

    describe('and the channel is not text-based', () => {
      it('should return null and log error if channel is not text-based', async () => {
        mockChatClient.createResponse.mockResolvedValue('Startup response');
        const mockChannel = { isTextBased: () => false, send: vi.fn() };
        Object.defineProperty(mockDiscordService, 'client', {
          get: () => ({
            user: { id: BOT_ID, tag: 'TestBot#0000' },
            channels: { fetch: vi.fn().mockResolvedValue(mockChannel) },
          }),
          configurable: true,
        });
        const result = await rooivalk.sendMessageToChannel(
          'startup-channel-id',
          'Hello startup!',
        );
        expect(result).toBeNull();
      });
    });
  });

  describe('when handling an image command', () => {
    it('should send image when OpenAI returns data', async () => {
      const interaction = {
        options: { getString: vi.fn().mockReturnValue('cat') },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction;

      mockOpenAIClient.createImage.mockResolvedValue('img');
      mockDiscordService.buildImageReply.mockReturnValue({
        embeds: ['e'],
        files: ['f'],
      });

      await (rooivalk as any).handleImageCommand(interaction);
      expect(interaction.editReply).toHaveBeenCalledWith({
        embeds: ['e'],
        files: ['f'],
      });
    });

    it('should reply with error details if OpenAI throws', async () => {
      const interaction = {
        options: { getString: vi.fn().mockReturnValue('dog') },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction;

      mockOpenAIClient.createImage.mockRejectedValue(new Error('blocked'));

      await (rooivalk as any).handleImageCommand(interaction);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('blocked'),
        }),
      );
    });

    it('should reply with error message if OpenAI returns null', async () => {
      const interaction = {
        options: { getString: vi.fn().mockReturnValue('bird') },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction;

      mockOpenAIClient.createImage.mockResolvedValue(null);

      await (rooivalk as any).handleImageCommand(interaction);
      expect(interaction.editReply).toHaveBeenCalledWith({ content: 'Error!' });
    });
  });

  describe('when handling a weather command', () => {
    it('should reply with weather data on success', async () => {
      const interaction = {
        options: { getString: vi.fn().mockReturnValue('Dubai') },
        user: { displayName: 'TestUser' },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction;

      const mockYrService = {
        getAllForecasts: vi.fn(),
        getForecastByLocation: vi
          .fn()
          .mockResolvedValue({ location: 'DUBAI', minTemp: 25 }),
      } as any;

      mockChatClient.createResponse.mockResolvedValue({
        type: 'text',
        content: 'Sunny in Dubai!',
        base64Images: [],
      });

      const weatherRooivalk = new Rooivalk(
        MOCK_CONFIG,
        mockDiscordService,
        mockChatClient,
        mockOpenAIClient,
        mockYrService,
        mockPeapixService,
      );

      await weatherRooivalk.handleWeatherCommand(interaction);
      expect(interaction.editReply).toHaveBeenCalledWith({
        content: 'Sunny in Dubai!',
      });
    });

    it('should reply with error when Yr returns null', async () => {
      const interaction = {
        options: { getString: vi.fn().mockReturnValue('Unknown') },
        user: { displayName: 'TestUser' },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction;

      const mockYrService = {
        getAllForecasts: vi.fn(),
        getForecastByLocation: vi.fn().mockResolvedValue(null),
      } as any;

      const weatherRooivalk = new Rooivalk(
        MOCK_CONFIG,
        mockDiscordService,
        mockChatClient,
        mockOpenAIClient,
        mockYrService,
        mockPeapixService,
      );

      await weatherRooivalk.handleWeatherCommand(interaction);
      expect(interaction.editReply).toHaveBeenCalledWith({
        content: 'Error!',
      });
    });

    it('should reply with error details when Yr throws', async () => {
      const interaction = {
        options: { getString: vi.fn().mockReturnValue('Dubai') },
        user: { displayName: 'TestUser' },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction;

      const mockYrService = {
        getAllForecasts: vi.fn(),
        getForecastByLocation: vi
          .fn()
          .mockRejectedValue(new Error('Yr API down')),
      } as any;

      const weatherRooivalk = new Rooivalk(
        MOCK_CONFIG,
        mockDiscordService,
        mockChatClient,
        mockOpenAIClient,
        mockYrService,
        mockPeapixService,
      );

      await weatherRooivalk.handleWeatherCommand(interaction);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Yr API down'),
        }),
      );
    });
  });

  describe('when handling a sync-steam command', () => {
    const mockSteamService = vi.mocked({
      findGame: vi.fn(),
      getGameDetails: vi.fn(),
      syncAppList: vi.fn(),
      close: vi.fn(),
    } as any);

    let rooivalkWithSteam: Rooivalk;

    beforeEach(() => {
      rooivalkWithSteam = new Rooivalk(
        MOCK_CONFIG,
        mockDiscordService,
        mockChatClient,
        mockOpenAIClient,
        undefined,
        undefined,
        undefined,
        undefined,
        mockSteamService,
      );
    });

    it('replies ephemerally without calling sync when STEAM_API_KEY is not set', async () => {
      const interaction = {
        reply: vi.fn(),
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction;

      await (rooivalkWithSteam as any).handleSyncSteamCommand(interaction);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('STEAM_API_KEY'),
        ephemeral: true,
      });
      expect(interaction.deferReply).not.toHaveBeenCalled();
      expect(mockSteamService.syncAppList).not.toHaveBeenCalled();
    });

    it('defers, calls syncAppList, and confirms completion when STEAM_API_KEY is set', async () => {
      vi.stubGlobal('process', {
        env: { ...MOCK_ENV, STEAM_API_KEY: 'test-steam-key' },
      });
      mockSteamService.syncAppList.mockResolvedValue(undefined);

      const interaction = {
        reply: vi.fn(),
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction;

      await (rooivalkWithSteam as any).handleSyncSteamCommand(interaction);

      expect(interaction.deferReply).toHaveBeenCalled();
      expect(mockSteamService.syncAppList).toHaveBeenCalled();
      expect(interaction.editReply).toHaveBeenCalledWith({
        content: 'Steam app list sync complete.',
      });
    });

    it('replies with the error message when syncAppList throws', async () => {
      vi.stubGlobal('process', {
        env: { ...MOCK_ENV, STEAM_API_KEY: 'test-steam-key' },
      });
      mockSteamService.syncAppList.mockRejectedValue(new Error('API timeout'));

      const interaction = {
        reply: vi.fn(),
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction;

      await (rooivalkWithSteam as any).handleSyncSteamCommand(interaction);

      expect(interaction.deferReply).toHaveBeenCalled();
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('API timeout'),
        }),
      );
    });
  });

  describe('when sending a MOTD with weather image', () => {
    const motdConfig = {
      ...MOCK_CONFIG,
      motd: 'Prompt {{WEATHER_FORECASTS_JSON}} {{EVENTS_JSON}}',
    };
    const motdContent = 'Good morning!';

    let mockChannel: {
      isTextBased: () => boolean;
      send: ReturnType<typeof vi.fn>;
    };
    let mockYrService: any;

    beforeEach(() => {
      mockChannel = { isTextBased: () => true, send: vi.fn() };

      Object.defineProperty(mockDiscordService, 'motdChannelId', {
        get: () => 'motd-channel-id',
        configurable: true,
      });
      Object.defineProperty(mockDiscordService, 'client', {
        get: () => ({
          user: { id: BOT_ID, tag: 'TestBot#0000' },
          channels: { fetch: vi.fn().mockResolvedValue(mockChannel) },
        }),
        configurable: true,
      });

      mockDiscordService.getGuildEventsBetween.mockResolvedValue([]);
      mockChatClient.createResponse.mockResolvedValue({
        type: 'text',
        content: motdContent,
        base64Images: [],
      });
      mockDiscordService.buildMessageReply.mockReturnValue({
        content: motdContent,
      });

      mockYrService = {
        getAllForecasts: vi.fn().mockResolvedValue([]),
      };
    });

    const buildRooivalk = () =>
      new Rooivalk(
        motdConfig,
        mockDiscordService,
        mockChatClient,
        mockOpenAIClient,
        mockYrService,
        mockPeapixService,
      );

    it('uses the AI-generated image when createImage succeeds', async () => {
      const fakeBase64 = Buffer.from('fake-image').toString('base64');
      mockOpenAIClient.createImage.mockResolvedValue(fakeBase64);

      await buildRooivalk().sendMotdToMotdChannel();

      expect(mockOpenAIClient.createImage).toHaveBeenCalledTimes(1);
      expect(mockPeapixService.getImage).not.toHaveBeenCalled();

      const sendPayload = mockChannel.send.mock.calls[0]?.[0];
      expect(sendPayload?.files).toHaveLength(1);
      expect(sendPayload?.embeds).toHaveLength(1);
    });

    it('falls back to Peapix when AI image generation returns null', async () => {
      mockOpenAIClient.createImage.mockResolvedValue(null);
      mockPeapixService.getImage.mockResolvedValue({
        title: 'Dune Patrol',
        copyright: '© Eric Yang/Getty Image',
        pageUrl: 'https://peapix.com/bing/123',
        buffer: Buffer.from([1, 2, 3]),
      });

      await buildRooivalk().sendMotdToMotdChannel();

      expect(mockOpenAIClient.createImage).toHaveBeenCalledTimes(1);
      expect(mockPeapixService.getImage).toHaveBeenCalledTimes(1);

      const sendPayload = mockChannel.send.mock.calls[0]?.[0];
      expect(sendPayload?.files).toHaveLength(1);
      expect(sendPayload?.embeds?.[0]?.data?.description).toBe('Dune Patrol');
      expect(sendPayload?.embeds?.[0]?.data?.footer?.text).toBe(
        '© Eric Yang/Getty Image',
      );
    });

    it('falls back to Peapix when AI image generation throws', async () => {
      mockOpenAIClient.createImage.mockRejectedValue(new Error('boom'));
      mockPeapixService.getImage.mockResolvedValue({
        title: 'Image of the day',
        copyright: '© Someone',
        pageUrl: 'https://peapix.com/bing/123',
        buffer: Buffer.from([1, 2, 3]),
      });

      await buildRooivalk().sendMotdToMotdChannel();

      expect(mockPeapixService.getImage).toHaveBeenCalledTimes(1);
      const sendPayload = mockChannel.send.mock.calls[0]?.[0];
      expect(sendPayload?.files).toHaveLength(1);
    });

    it("uses 'Image of the day' as heading when Peapix title is null", async () => {
      mockOpenAIClient.createImage.mockResolvedValue(null);
      mockPeapixService.getImage.mockResolvedValue({
        title: null,
        copyright: '© Someone',
        pageUrl: 'https://peapix.com/bing/123',
        buffer: Buffer.from([1, 2, 3]),
      } as any);

      await buildRooivalk().sendMotdToMotdChannel();

      const sendPayload = mockChannel.send.mock.calls[0]?.[0];
      expect(sendPayload?.embeds?.[0]?.data?.description).toBe(
        'Image of the day',
      );
    });

    it('sends MOTD without image when both AI and Peapix fail', async () => {
      mockOpenAIClient.createImage.mockResolvedValue(null);
      mockPeapixService.getImage.mockResolvedValue(null);

      await buildRooivalk().sendMotdToMotdChannel();

      const sendPayload = mockChannel.send.mock.calls[0]?.[0];
      expect(sendPayload?.files).toBeUndefined();
      expect(sendPayload?.embeds).toBeUndefined();
    });

    it('sends MOTD without image when AI returns null and Peapix throws', async () => {
      mockOpenAIClient.createImage.mockResolvedValue(null);
      mockPeapixService.getImage.mockRejectedValue(new Error('peapix down'));

      await buildRooivalk().sendMotdToMotdChannel();

      const sendPayload = mockChannel.send.mock.calls[0]?.[0];
      expect(sendPayload?.files).toBeUndefined();
      expect(sendPayload?.embeds).toBeUndefined();
    });
  });

  describe('sendLeaderboardToMotdChannel', () => {
    let mockChannel: {
      isTextBased: () => boolean;
      send: ReturnType<typeof vi.fn>;
    };

    const findField = (payload: any, name: string) =>
      payload?.embeds?.[0]?.data?.fields?.find((f: any) => f.name === name);

    beforeEach(() => {
      mockChannel = { isTextBased: () => true, send: vi.fn() };

      Object.defineProperty(mockDiscordService, 'motdChannelId', {
        get: () => 'motd-channel-id',
        configurable: true,
      });
      Object.defineProperty(mockDiscordService, 'client', {
        get: () => ({
          user: { id: BOT_ID, tag: 'TestBot#0000' },
          channels: { fetch: vi.fn().mockResolvedValue(mockChannel) },
        }),
        configurable: true,
      });

      mockEmojiService.getTopMessages.mockReturnValue([]);
      mockEmojiService.getTopGivers.mockReturnValue([]);
      mockEmojiService.getTopEmojis.mockReturnValue([]);
    });

    const buildRooivalk = () =>
      new Rooivalk(
        MOCK_CONFIG,
        mockDiscordService,
        mockChatClient,
        mockOpenAIClient,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        mockEmojiService,
      );

    it('renders an embed with all three sections and a message jump link', async () => {
      mockEmojiService.getTopMessages.mockReturnValue([
        {
          message_id: 'm1',
          channel_id: 'c1',
          message_author_id: 'author-1',
          count: 11,
        },
      ]);
      mockEmojiService.getTopGivers.mockReturnValue([
        {
          user_id: 'giver-1',
          count: 24,
          fav_emoji_id: null,
          fav_emoji_name: '🔥',
          fav_emoji_animated: 0,
        },
      ]);
      mockEmojiService.getTopEmojis.mockReturnValue([
        { emoji_id: null, emoji_name: '❤️', emoji_animated: 0, count: 23 },
      ]);

      await buildRooivalk().sendLeaderboardToMotdChannel();

      const payload = mockChannel.send.mock.calls[0]?.[0];
      expect(payload?.embeds).toHaveLength(1);
      expect(payload?.embeds?.[0]?.data?.title).toContain('Weekly Emoji Recap');

      const messages = findField(payload, 'Most-loved messages');
      expect(messages?.value).toContain('<@author-1>');
      expect(messages?.value).toContain(
        'https://discord.com/channels/test-guild-id/c1/m1',
      );

      const reactive = findField(payload, 'Most reactive');
      expect(reactive?.value).toContain('<@giver-1>');
      expect(reactive?.value).toContain('🔥');

      const emojis = findField(payload, 'Top emojis');
      expect(emojis?.value).toContain('❤️');
      expect(emojis?.value).toContain('23');
    });

    it('pings every featured user exactly once via content and allowedMentions', async () => {
      // A user who is both a top author and a top giver should appear once.
      mockEmojiService.getTopMessages.mockReturnValue([
        {
          message_id: 'm1',
          channel_id: 'c1',
          message_author_id: 'dup',
          count: 5,
        },
      ]);
      mockEmojiService.getTopGivers.mockReturnValue([
        {
          user_id: 'dup',
          count: 5,
          fav_emoji_id: null,
          fav_emoji_name: '🔥',
          fav_emoji_animated: 0,
        },
        {
          user_id: 'giver-2',
          count: 3,
          fav_emoji_id: null,
          fav_emoji_name: '😀',
          fav_emoji_animated: 0,
        },
      ]);

      await buildRooivalk().sendLeaderboardToMotdChannel();

      const payload = mockChannel.send.mock.calls[0]?.[0];
      expect(payload?.content).toContain('<@dup>');
      expect(payload?.content).toContain('<@giver-2>');
      expect(payload?.allowedMentions).toEqual({ users: ['dup', 'giver-2'] });
    });

    it('sends an empty-state message that pings no one when there is no data', async () => {
      await buildRooivalk().sendLeaderboardToMotdChannel();

      const payload = mockChannel.send.mock.calls[0]?.[0];
      expect(payload?.embeds).toBeUndefined();
      expect(MOCK_CONFIG.leaderboardEmptyMessages).toContain(payload?.content);
      expect(payload?.allowedMentions).toEqual({ users: [] });
    });
  });

  describe('when initialized', () => {
    it('should set up event handlers and call login', async () => {
      // Patch the once method to immediately call the callback for ClientReady
      mockDiscordService.once.mockImplementation(
        (event: string, cb: (client: unknown) => void) => {
          if (event === DiscordEvents.ClientReady) {
            cb(mockDiscordService.client as any);
          }
          return mockDiscordService;
        },
      );

      await rooivalk.init();

      expect(mockDiscordService.once).toHaveBeenCalled();
      expect(mockDiscordService.on).toHaveBeenCalled();
      expect(mockDiscordService.login).toHaveBeenCalled();
      expect(mockDiscordService.registerSlashCommands).toHaveBeenCalled();
      expect(mockDiscordService.sendReadyMessage).toHaveBeenCalled();
      expect(mockDiscordService.setupMentionRegex).toHaveBeenCalled();
    });
  });

  describe('thread handling', () => {
    describe('when message is sent in a thread', () => {
      it('looks up the previous response_id by thread id', async () => {
        const sentMessage = createMockMessage({ id: 'thread-bot-reply' });
        const threadMessage = createMockMessage({
          content: 'Hello in thread',
          channel: {
            id: 'thread-id-99',
            isThread: vi.fn().mockReturnValue(true),
            send: vi.fn().mockResolvedValue(sentMessage),
          } as any,
        } as Partial<Message<boolean>>);

        mockMemoryService.getConversationResponseId.mockReturnValueOnce(
          'thread-resp-id',
        );
        mockChatClient.createResponse.mockResolvedValue({
          type: 'text',
          content: 'Response',
          base64Images: [],
          responseId: 'resp-after',
        });
        mockDiscordService.buildMessageReply.mockReturnValue({
          content: 'Response',
        });

        await (rooivalk as any).processMessage(threadMessage);

        expect(
          mockMemoryService.getConversationResponseId,
        ).toHaveBeenCalledWith({
          type: 'thread',
          refId: 'thread-id-99',
        });
        const call = mockChatClient.createResponse.mock.calls.at(-1)!;
        expect(call[2]).toBe('thread-resp-id');
        expect(
          mockMemoryService.setConversationResponseId,
        ).toHaveBeenCalledWith(
          { type: 'thread', refId: 'thread-id-99' },
          'resp-after',
        );
      });

      it('should send response to thread channel', async () => {
        const threadMessage = createMockMessage({
          content: 'Hello in thread',
          channel: {
            isThread: vi.fn().mockReturnValue(true),
            send: vi.fn(),
          } as any,
        } as Partial<Message<boolean>>);

        mockDiscordService.buildMessageReply.mockReturnValue({
          content: 'Response',
        });

        await rooivalk.processMessage(threadMessage);

        expect((threadMessage.channel as any).send).toHaveBeenCalled();
        expect(threadMessage.reply).not.toHaveBeenCalled();
      });
    });

    describe('when message is not in a thread', () => {
      it('passes null previous_response_id for a non-thread standalone message', async () => {
        const regularMessage = createMockMessage({
          content: 'Hello outside thread',
          channel: {
            isThread: vi.fn().mockReturnValue(false),
          } as any,
        } as Partial<Message<boolean>>);
        mockChatClient.createResponse.mockResolvedValue({
          type: 'text',
          content: 'Response',
          base64Images: [],
          responseId: 'resp-1',
        });
        mockDiscordService.buildMessageReply.mockReturnValue({
          content: 'Response',
        });
        (regularMessage.reply as any).mockResolvedValue(
          createMockMessage({ id: 'reply-id' }),
        );

        await rooivalk.processMessage(regularMessage);

        const call = mockChatClient.createResponse.mock.calls.at(-1)!;
        expect(call[2]).toBeNull();
      });

      it('should send response as reply when not in thread', async () => {
        const regularMessage = createMockMessage({
          content: 'Hello outside thread',
          channel: {
            isThread: vi.fn().mockReturnValue(false),
            send: vi.fn(),
          } as any,
        } as Partial<Message<boolean>>);

        mockDiscordService.buildMessageReply.mockReturnValue({
          content: 'Response',
        });

        await (rooivalk as any).processMessage(regularMessage);

        expect(regularMessage.reply).toHaveBeenCalled();
        expect((regularMessage.channel as any).send).not.toHaveBeenCalled();
      });
    });

    describe('when response includes a created thread', () => {
      it('should send response to created thread instead of original channel', async () => {
        const mockThread = {
          send: vi.fn(),
          isThread: vi.fn().mockReturnValue(true),
        } as any as ThreadChannel;

        const replyMessage = createMockMessage({
          content: 'Reply to bot message',
          channel: {
            isThread: vi.fn().mockReturnValue(false),
            send: vi.fn(),
          } as any,
        } as Partial<Message<boolean>>);

        mockDiscordService.buildMessageReply.mockReturnValue({
          content: 'Thread response',
        });
        mockChatClient.createResponse.mockResolvedValue({
          type: 'text',
          content: 'Thread response',
          base64Images: [],
          createdThread: mockThread,
        });

        await (rooivalk as any).processMessage(replyMessage);

        // Should send to the created thread, not reply to original message
        expect(mockThread.send).toHaveBeenCalledWith({
          content: 'Thread response',
        });
        expect(replyMessage.reply).not.toHaveBeenCalled();
        expect((replyMessage.channel as any).send).not.toHaveBeenCalled();
      });
    });

    describe('when creating a thread from a reply', () => {
      it('generates a thread name from the current message content', async () => {
        const mockThread = {
          id: 'new-thread-123',
          members: { add: vi.fn() },
        } as any as ThreadChannel;

        const replyMessage = createMockMessage({
          content: '  Follow-up question  ',
          author: { id: 'user-123', displayName: 'TestUser' },
          startThread: vi.fn().mockResolvedValue(mockThread),
        } as unknown as Partial<Message<boolean>>);

        mockChatClient.generateThreadName.mockResolvedValue(
          'Discussion Thread',
        );

        const result = await rooivalk.createRooivalkThread(replyMessage);

        expect(result).toBe(mockThread);
        expect(mockChatClient.generateThreadName).toHaveBeenCalledWith(
          'Follow-up question',
        );
        expect(replyMessage.startThread).toHaveBeenCalledWith({
          name: 'Discussion Thread',
          autoArchiveDuration: 60,
        });
        expect(mockThread.members.add).toHaveBeenCalledWith('user-123');
      });

      it('should store current message as initial context when no history is available', async () => {
        const mockThread = {
          id: 'new-thread-456',
          members: { add: vi.fn() },
        } as any as ThreadChannel;

        const replyMessage = createMockMessage({
          content: 'First message',
          author: { id: 'user-456', displayName: 'TestUser' },
          startThread: vi.fn().mockResolvedValue(mockThread),
        } as unknown as Partial<Message<boolean>>);

        mockChatClient.generateThreadName.mockResolvedValue('New Discussion');

        const result = await rooivalk.createRooivalkThread(replyMessage);

        expect(result).toBe(mockThread);
        expect(mockChatClient.generateThreadName).toHaveBeenCalledWith(
          'First message',
        );
      });

      it('should handle thread creation failure gracefully', async () => {
        const replyMessage = createMockMessage({
          content: 'Message',
          author: { id: 'user-789' },
          startThread: vi
            .fn()
            .mockRejectedValue(new Error('Thread creation failed')),
        } as unknown as Partial<Message<boolean>>);

        mockChatClient.generateThreadName.mockResolvedValue('Thread Name');

        await expect(
          rooivalk.createRooivalkThread(replyMessage),
        ).rejects.toThrow('Thread creation failed');
      });

      it('should use message content for thread name when history is null', async () => {
        const mockThread = {
          id: 'new-thread-789',
          members: { add: vi.fn() },
        } as any as ThreadChannel;

        const replyMessage = createMockMessage({
          content: 'Question about something',
          author: { id: 'user-789' },
          startThread: vi.fn().mockResolvedValue(mockThread),
        } as unknown as Partial<Message<boolean>>);

        mockChatClient.generateThreadName.mockResolvedValue(
          'Generated Thread Name',
        );

        const result = await rooivalk.createRooivalkThread(replyMessage);

        expect(result).toBe(mockThread);
        expect(mockChatClient.generateThreadName).toHaveBeenCalledWith(
          'Question about something',
        );
      });
    });
  });

  describe('processMessageReaction', () => {
    const GUILD_ID = 'test-guild-id';

    function makeReaction(overrides: Record<string, unknown> = {}) {
      return {
        partial: false,
        message: {
          partial: false,
          id: 'msg-1',
          channelId: 'channel-1',
          guild: { id: GUILD_ID },
          author: { id: 'author-1', bot: false },
          fetch: vi.fn(),
        },
        emoji: { id: null, name: '🔥', animated: false },
        fetch: vi.fn(),
        ...overrides,
      };
    }

    function makeUser(overrides: Record<string, unknown> = {}) {
      return {
        partial: false,
        id: 'reactor-1',
        bot: false,
        fetch: vi.fn(),
        ...overrides,
      };
    }

    beforeEach(() => {
      vi.clearAllMocks();
      vi.stubEnv('DISCORD_GUILD_ID', GUILD_ID);
    });

    it('records a valid reaction', async () => {
      await (rooivalk as any).processMessageReaction(
        makeReaction(),
        makeUser(),
      );
      expect(mockEmojiService.recordReaction).toHaveBeenCalledOnce();
    });

    it('skips reactions from a different guild', async () => {
      const reaction = makeReaction({
        message: {
          partial: false,
          id: 'msg-1',
          channelId: 'channel-1',
          guild: { id: 'other-guild' },
          author: { id: 'author-1', bot: false },
          fetch: vi.fn(),
        },
      });
      await (rooivalk as any).processMessageReaction(reaction, makeUser());
      expect(mockEmojiService.recordReaction).not.toHaveBeenCalled();
    });

    it('skips reactions from a bot user', async () => {
      await (rooivalk as any).processMessageReaction(
        makeReaction(),
        makeUser({ bot: true }),
      );
      expect(mockEmojiService.recordReaction).not.toHaveBeenCalled();
    });

    it('skips reactions on messages authored by a bot', async () => {
      const reaction = makeReaction({
        message: {
          partial: false,
          id: 'msg-1',
          channelId: 'channel-1',
          guild: { id: GUILD_ID },
          author: { id: 'bot-author', bot: true },
          fetch: vi.fn(),
        },
      });
      await (rooivalk as any).processMessageReaction(reaction, makeUser());
      expect(mockEmojiService.recordReaction).not.toHaveBeenCalled();
    });

    it('skips self-reactions', async () => {
      const reaction = makeReaction({
        message: {
          partial: false,
          id: 'msg-1',
          channelId: 'channel-1',
          guild: { id: GUILD_ID },
          author: { id: 'same-user', bot: false },
          fetch: vi.fn(),
        },
      });
      await (rooivalk as any).processMessageReaction(
        reaction,
        makeUser({ id: 'same-user' }),
      );
      expect(mockEmojiService.recordReaction).not.toHaveBeenCalled();
    });

    it('skips and logs when a partial fetch throws', async () => {
      const reaction = makeReaction({
        partial: true,
        fetch: vi.fn().mockRejectedValue(new Error('fetch failed')),
      });
      await (rooivalk as any).processMessageReaction(reaction, makeUser());
      expect(mockEmojiService.recordReaction).not.toHaveBeenCalled();
    });

    it('resolves a partial reaction before applying filters', async () => {
      const resolved = makeReaction();
      const partial = makeReaction({
        partial: true,
        fetch: vi.fn().mockResolvedValue(resolved),
      });
      await (rooivalk as any).processMessageReaction(partial, makeUser());
      expect(mockEmojiService.recordReaction).toHaveBeenCalledOnce();
    });
  });
});
