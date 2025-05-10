import MemoryClient from 'mem0ai';

const mem0ApiKey = process.env.MEM0_API_KEY!;

export const memoryClient = new MemoryClient({ apiKey: mem0ApiKey });

export function storeLTUserMemory(userId: string, messages: { role: string, content: string }[], metadata?: Record<string, any>) {
  return memoryClient.add(messages, { user_id: userId, ...(metadata ? { metadata } : {}) });
}

export function retrieveLTUserMemory(userId: string, query: string) {
  return memoryClient.search(query, { user_id: userId, output_format: "v1.1" });
}