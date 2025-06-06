import { vi } from 'vitest';
import type { DiscordMessage } from '../services/discord';

export function createMockMessage(
  overrides: Partial<DiscordMessage> = {}
): DiscordMessage {
  const users = {
    filter: (fn: any) => [],
    ...((overrides.mentions?.users as any) || {}),
  };
  return {
    content: '',
    author: { id: 'user-id', bot: false },
    mentions: { users },
    reply: vi.fn(),
    reference: null,
    guild: { id: 'guild-id' },
    channel: {
      id: 'test-channel-id',
      messages: { fetch: vi.fn() },
      send: vi.fn(),
      ...overrides.channel,
    },
    delete: vi.fn(),
    ...overrides,
  } as unknown as DiscordMessage;
}
