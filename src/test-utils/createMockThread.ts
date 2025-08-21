import { vi } from 'vitest';
import { Collection } from 'discord.js';

interface MockThreadOptions {
  id?: string;
  starterMessage?: {
    author?: { id: string; displayName: string };
    content?: string;
    attachments?: Collection<string, any>;
  } | null;
  messages?: Map<string, any>;
  fetchError?: boolean;
}

export function createMockThread(options: MockThreadOptions = {}) {
  const {
    id = 'mock-thread-123',
    starterMessage = {
      author: { id: 'user-id', displayName: 'User' },
      content: 'Thread starter message',
      attachments: new Collection(),
    },
    messages = new Map(),
    fetchError = false,
  } = options;

  return {
    id,
    fetchStarterMessage: vi.fn().mockResolvedValue(starterMessage),
    messages: {
      fetch: fetchError
        ? vi.fn().mockRejectedValue(new Error('Fetch failed'))
        : vi.fn().mockResolvedValue(messages),
    },
  };
}
