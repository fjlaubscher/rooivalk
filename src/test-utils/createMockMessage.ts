import { vi } from 'vitest';
import { Collection } from 'discord.js';
import type { Message } from 'discord.js';

export function createMockMessage(overrides: any = {}): Message<boolean> {
  const users = {
    filter: (fn: any) => [],
    ...((overrides.mentions?.users as any) || {}),
  };

  return {
    content: '',
    author: {
      id: 'user-id',
      bot: false,
      displayName: 'TestUser',
      ...overrides.author,
    } as any,
    mentions: { users },
    reply: vi.fn(),
    reference: null,
    guild: { id: 'guild-id' },
    channel: {
      id: 'test-channel-id',
      messages: { fetch: vi.fn() } as any,
      send: vi.fn(),
      isThread: vi.fn().mockReturnValue(false),
      fetchStarterMessage: vi.fn(),
      ...overrides.channel,
    } as any,
    thread: null,
    startThread: vi.fn(),
    delete: vi.fn(),
    attachments: new Collection<string, string>(),
    ...overrides,
  } as Message<boolean>;
}
