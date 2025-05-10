import MemoryClient from 'mem0ai';

const mem0ApiKey = process.env.MEM0_API_KEY!;

export const memoryClient = new MemoryClient({ apiKey: mem0ApiKey });

type MemoryItem = {
  memory: string;
  id?: string;
  user_id?: string;
  [key: string]: any;
}

export function storeLTUserMemory(userId: string, messages: { role: string, content: string }[], metadata?: Record<string, any>) {
  return memoryClient.add(messages, { user_id: userId, ...(metadata ? { metadata } : {}) });
}

export function storeSTUserMemory(userId: string, channelId: string, messages: { role: string, content: string }[], metadata?: Record<string, any>) {
  return memoryClient.add(messages, {
    user_id: userId,
    run_id: channelId, // Using channel ID as the run_id for conversation context
    ...(metadata ? { metadata } : {})
  });
}

export function retrieveLTUserMemory(userId: string, query: string) {
  return memoryClient.search(query, { user_id: userId, output_format: "v1.1" });
}

export function retrieveSTUserMemory(userId: string, channelId: string, query: string) {
  return memoryClient.search(query, {
    user_id: userId,
    run_id: channelId,
    output_format: "v1.1"
  });
}

export function getAllSTUserMemories(userId: string, channelId: string) {
  const filters = {
    "AND": [
      { "user_id": userId },
      { "run_id": channelId }
    ]
  };

  return memoryClient.getAll({
    version: "v2",
    filters,
    page: 1,
    page_size: 10 // for pagination
  });
}


export function getRecentSTUserMemories(userId: string, channelId: string, hoursAgo: number = 24) {
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - hoursAgo);
  const cutoffTimestamp = cutoffDate.toISOString();

  const filters = {
    "AND": [
      { "user_id": userId },
      { "run_id": channelId },
      { "created_at": { "gte": cutoffTimestamp } }
    ]
  };

  return memoryClient.getAll({
    version: "v2",
    filters,
    page: 1,
    page_size: 10
  });
}


export function processMemoryResults(memoryResults: any): string[] {
  if (!memoryResults || !memoryResults.results || !Array.isArray(memoryResults.results) || memoryResults.results.length === 0) {
    return [];
  }

  return memoryResults.results
    .map((item: MemoryItem) => item.memory)
    .filter(Boolean);
}