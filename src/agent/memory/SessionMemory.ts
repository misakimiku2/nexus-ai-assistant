import { FetchedContent } from './FetchMemory';

interface SessionToolCache {
  toolName: string;
  params: Record<string, unknown>;
  result: unknown;
  timestamp: number;
}

interface SessionMemoryState {
  toolCache: Map<string, SessionToolCache>;
  fetchedContents: Map<string, FetchedContent>;
  conversationContext: string[];
}

const MAX_TOOL_CACHE_SIZE = 50;
const MAX_FETCHED_CONTENTS_SIZE = 10;
const MAX_CONTEXT_LENGTH = 10000;

class SessionMemoryManager {
  private state: SessionMemoryState;
  private sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.state = {
      toolCache: new Map(),
      fetchedContents: new Map(),
      conversationContext: [],
    };
  }

  getSessionId(): string {
    return this.sessionId;
  }

  addToolCache(toolName: string, params: Record<string, unknown>, result: unknown): void {
    const key = this.generateToolCacheKey(toolName, params);
    
    if (this.state.toolCache.size >= MAX_TOOL_CACHE_SIZE) {
      this.evictOldestToolCache();
    }

    this.state.toolCache.set(key, {
      toolName,
      params,
      result,
      timestamp: Date.now(),
    });

    console.log(`[SessionMemory] Added tool cache for: ${toolName}, total entries: ${this.state.toolCache.size}`);
  }

  getToolCache(toolName: string, params: Record<string, unknown>): SessionToolCache | undefined {
    const key = this.generateToolCacheKey(toolName, params);
    return this.state.toolCache.get(key);
  }

  hasToolCache(toolName: string, params: Record<string, unknown>): boolean {
    const key = this.generateToolCacheKey(toolName, params);
    return this.state.toolCache.has(key);
  }

  private generateToolCacheKey(toolName: string, params: Record<string, unknown>): string {
    const sortedParams = JSON.stringify(params, Object.keys(params).sort());
    return `${toolName}:${sortedParams}`;
  }

  private evictOldestToolCache(): void {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;

    for (const [key, cache] of this.state.toolCache) {
      if (cache.timestamp < oldestTime) {
        oldestTime = cache.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.state.toolCache.delete(oldestKey);
      console.log(`[SessionMemory] Evicted oldest tool cache: ${oldestKey}`);
    }
  }

  addFetchedContent(content: FetchedContent): void {
    if (this.state.fetchedContents.size >= MAX_FETCHED_CONTENTS_SIZE) {
      this.evictOldestFetchedContent();
    }

    this.state.fetchedContents.set(content.url, content);
    console.log(`[SessionMemory] Added fetched content for: ${content.url}, total entries: ${this.state.fetchedContents.size}`);
  }

  getFetchedContent(url: string): FetchedContent | undefined {
    return this.state.fetchedContents.get(url);
  }

  hasFetchedContent(url: string): boolean {
    return this.state.fetchedContents.has(url);
  }

  private evictOldestFetchedContent(): void {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;

    for (const [key, content] of this.state.fetchedContents) {
      if (content.fetchedAt < oldestTime) {
        oldestTime = content.fetchedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.state.fetchedContents.delete(oldestKey);
      console.log(`[SessionMemory] Evicted oldest fetched content: ${oldestKey}`);
    }
  }

  addToContext(content: string): void {
    this.state.conversationContext.push(content);
    this.trimContext();
  }

  getContext(): string[] {
    return [...this.state.conversationContext];
  }

  getCombinedContext(): string {
    return this.state.conversationContext.join('\n');
  }

  private trimContext(): void {
    let totalLength = this.state.conversationContext.reduce((sum, s) => sum + s.length, 0);
    
    while (totalLength > MAX_CONTEXT_LENGTH && this.state.conversationContext.length > 1) {
      const removed = this.state.conversationContext.shift();
      if (removed) {
        totalLength -= removed.length;
      }
    }
  }

  clear(): void {
    this.state.toolCache.clear();
    this.state.fetchedContents.clear();
    this.state.conversationContext = [];
    console.log(`[SessionMemory] Cleared session memory for: ${this.sessionId}`);
  }

  getStats(): {
    toolCacheSize: number;
    fetchedContentsSize: number;
    contextLength: number;
  } {
    return {
      toolCacheSize: this.state.toolCache.size,
      fetchedContentsSize: this.state.fetchedContents.size,
      contextLength: this.state.conversationContext.length,
    };
  }
}

class SessionMemoryRegistry {
  private sessions: Map<string, SessionMemoryManager> = new Map();

  get(sessionId: string): SessionMemoryManager {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, new SessionMemoryManager(sessionId));
    }
    return this.sessions.get(sessionId)!;
  }

  delete(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.clear();
      this.sessions.delete(sessionId);
      console.log(`[SessionMemoryRegistry] Deleted session: ${sessionId}`);
    }
  }

  clear(): void {
    for (const session of this.sessions.values()) {
      session.clear();
    }
    this.sessions.clear();
    console.log('[SessionMemoryRegistry] Cleared all sessions');
  }

  getActiveSessionCount(): number {
    return this.sessions.size;
  }
}

export const sessionMemoryRegistry = new SessionMemoryRegistry();
export { SessionMemoryManager };
