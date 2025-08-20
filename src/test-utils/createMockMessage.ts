import { vi } from 'vitest';
import { Collection } from 'discord.js';
import type { Message } from 'discord.js';

export function createMockMessage(
  overrides: Partial<Message<boolean>> = {},
): Message<boolean> {
  const users = {
    filter: (fn: any) => [],
    ...((overrides.mentions?.users as any) || {}),
  };
  return {
    content: '',
    author: { id: 'user-id', bot: false, displayName: 'TestUser' },
    mentions: { users },
    reply: vi.fn(),
    reference: null,
    guild: { id: 'guild-id' },
    channel: {
      id: 'test-channel-id',
      messages: { fetch: vi.fn() },
      send: vi.fn(),
      isThread: vi.fn().mockReturnValue(false),
      fetchStarterMessage: vi.fn(),
      ...overrides.channel,
    },
    thread: null,
    startThread: vi.fn(),
    delete: vi.fn(),
    attachments: new Collection<string, string>(),
    ...overrides,
  } as unknown as Message<boolean>;
}
