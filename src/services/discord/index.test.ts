import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterAll,
} from 'vitest';
import type { MockInstance } from 'vitest';
import {
  Client as DiscordClient,
  TextChannel,
  Routes,
  InteractionContextType,
  ApplicationIntegrationType,
} from 'discord.js';

import { DISCORD_COMMANDS } from '../../constants.ts';
import { MOCK_CONFIG } from '../../test-utils/mock.ts';
import type { ResponseType } from '../../types.ts';
import { silenceConsole } from '../../test-utils/consoleMocks.ts';

import DiscordService from './index.ts';

const { restPut } = vi.hoisted(() => ({
  restPut: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('discord.js', async (importOriginal) => {
  const actual = await importOriginal();
  return Object.assign({}, actual, {
    REST: vi.fn().mockImplementation(function () {
      return {
        setToken: vi.fn().mockReturnThis(),
        put: (...args: unknown[]) => restPut(...args),
      };
    }),
  });
});

const BOT_ID = 'test-bot-id';

let restoreConsole: () => void;

beforeAll(() => {
  restoreConsole = silenceConsole({
    ignoreErrors: [
      'Error sending ready message',
      'Error fetching referenced message',
      'Error fetching original message',
    ],
    ignoreLogs: ['Successfully registered slash commands.', '🤖 Logged in as'],
  });
});

afterAll(() => {
  restoreConsole();
});

function createMockDiscordClient() {
  return {
    user: { id: BOT_ID, tag: 'TestBot#0000' },
    channels: { fetch: vi.fn() },
    on: vi.fn(),
    once: vi.fn(),
    login: vi.fn(),
  } as unknown as DiscordClient;
}

describe('DiscordService', () => {
  let discordClient: DiscordClient;
  let service: DiscordService;

  beforeEach(() => {
    discordClient = createMockDiscordClient();
    service = new DiscordService(MOCK_CONFIG, discordClient);
    vi.clearAllMocks();
    restPut.mockReset();
    restPut.mockResolvedValue(undefined);
    process.env.DISCORD_STARTUP_CHANNEL_ID = 'startup-channel';
    process.env.DISCORD_TOKEN = 'token';
    process.env.DISCORD_APP_ID = 'appid';
    process.env.DISCORD_GUILD_ID = 'guildid';
  });

  describe('when initialized', () => {
    describe('getRooivalkResponse', () => {
      it('should return a greeting, error, or discordLimit response', () => {
        expect(typeof service.getRooivalkResponse('greeting')).toBe('string');
        expect(typeof service.getRooivalkResponse('error')).toBe('string');
        expect(typeof service.getRooivalkResponse('discordLimit')).toBe(
          'string',
        );
        expect(() =>
          service.getRooivalkResponse('not-a-type' as ResponseType),
        ).toThrow();
      });
    });

    describe('sendReadyMessage', () => {
      describe('when the startup channel is available', () => {
        it('should send a ready message to the startup channel', async () => {
          const mockSend = vi.fn();
          const mockChannel = {
            isTextBased: () => true,
            send: mockSend,
          } as unknown as TextChannel;
          (
            discordClient.channels.fetch as unknown as MockInstance
          ).mockResolvedValue(mockChannel);
          await service.sendReadyMessage();
          expect(mockSend).toHaveBeenCalled();
        });
      });

      describe('when the startup channel fetch fails', () => {
        it('should handle error when sending ready message', async () => {
          (
            discordClient.channels.fetch as unknown as MockInstance
          ).mockRejectedValue(new Error('fail'));
          await service.sendReadyMessage(); // Should not throw
        });
      });
    });

    describe('buildMessageReply', () => {
      it('should build a message reply with attachments', () => {
        const longContent = 'a'.repeat(2100);
        const reply = service.buildMessageReply({
          type: 'text',
          content: longContent,
          base64Images: [],
        });
        expect(reply.files).toBeTruthy();
      });
    });

    describe('registerSlashCommands', () => {
      describe('when called with a valid token', () => {
        it('registers guild commands and global /clear with DM context', async () => {
          await service.registerSlashCommands();

          expect(restPut).toHaveBeenCalledTimes(2);

          const guildRoute = Routes.applicationGuildCommands(
            'appid',
            'guildid',
          );
          const globalRoute = Routes.applicationCommands('appid');

          const guildCall = restPut.mock.calls.find(
            ([route]) => route === guildRoute,
          );
          const globalCall = restPut.mock.calls.find(
            ([route]) => route === globalRoute,
          );

          expect(guildCall).toBeTruthy();
          expect(globalCall).toBeTruthy();

          const guildBody = (guildCall![1] as { body: { name: string }[] })
            .body;
          const globalBody = (globalCall![1] as { body: any[] }).body;

          expect(guildBody.map((c) => c.name).sort()).toEqual(
            [
              DISCORD_COMMANDS.IMAGE,
              DISCORD_COMMANDS.WEATHER,
              DISCORD_COMMANDS.SYNC_STEAM,
            ].sort(),
          );
          expect(
            guildBody.find((c) => c.name === DISCORD_COMMANDS.CLEAR),
          ).toBeUndefined();

          expect(globalBody).toHaveLength(1);
          expect(globalBody[0].name).toBe(DISCORD_COMMANDS.CLEAR);
          expect(globalBody[0].contexts).toEqual(
            expect.arrayContaining([
              InteractionContextType.Guild,
              InteractionContextType.BotDM,
            ]),
          );
          expect(globalBody[0].integration_types).toEqual(
            expect.arrayContaining([ApplicationIntegrationType.GuildInstall]),
          );
        });
      });

      describe('when registration fails', () => {
        it('should handle errors', async () => {
          vi.spyOn(console, 'error').mockImplementation(() => {});
          restPut.mockRejectedValueOnce(new Error('fail'));
          await service.registerSlashCommands();
          expect(console.error).toHaveBeenCalled();
          (console.error as any).mockRestore?.();
        });
      });
    });

    describe('setupMentionRegex', () => {
      it('should set up mention regex', () => {
        service.setupMentionRegex();
        expect(service.mentionRegex).toBeInstanceOf(RegExp);
      });
    });

    describe('login and event handlers', () => {
      it('should call on/once/login', async () => {
        service.on('ready', () => {});
        service.once('ready', () => {});
        await service.login();
        expect(discordClient.on).toHaveBeenCalled();
        expect(discordClient.once).toHaveBeenCalled();
        expect(discordClient.login).toHaveBeenCalled();
      });
    });
  });
});
