export interface FetchedContent {
  url: string;
  title: string;
  content: string;
  summary?: string;
  fetchedAt: number;
  contentType: string;
  pageCount?: number;
  contentChunks?: string[];
}

export interface FetchMemory {
  contents: Map<string, FetchedContent>;
}

const MAX_MEMORY_ENTRIES = 10;
const MAX_CONTEXT_CONTENT_LENGTH = 6000;

class FetchMemoryManager {
  private memory: FetchMemory = {
    contents: new Map(),
  };

  add(result: {
    url: string;
    title: string;
    content: string;
    summary?: string;
    contentType?: string;
    pageCount?: number;
    contentChunks?: string[];
  }): void {
    const existingUrl = this.findExistingUrl(result.url);
    if (existingUrl) {
      console.log(`[FetchMemory] URL already exists, skipping: ${result.url}`);
      return;
    }

    if (this.memory.contents.size >= MAX_MEMORY_ENTRIES) {
      this.evictOldest();
    }

    this.memory.contents.set(result.url, {
      url: result.url,
      title: result.title,
      content: result.content,
      summary: result.summary,
      fetchedAt: Date.now(),
      contentType: result.contentType || 'text/html',
      pageCount: result.pageCount,
      contentChunks: result.contentChunks,
    });

    console.log(`[FetchMemory] Added content for: ${result.url}, content length: ${result.content.length}, total entries: ${this.memory.contents.size}`);
  }

  get(url: string): FetchedContent | undefined {
    const existingUrl = this.findExistingUrl(url);
    if (existingUrl) {
      return this.memory.contents.get(existingUrl);
    }
    return undefined;
  }

  has(url: string): boolean {
    return this.findExistingUrl(url) !== undefined;
  }

  private findExistingUrl(url: string): string | undefined {
    const normalizedUrl = this.normalizeUrl(url);
    for (const [key] of this.memory.contents) {
      if (this.normalizeUrl(key) === normalizedUrl) {
        return key;
      }
    }
    return undefined;
  }

  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}://${parsed.host}${parsed.pathname}`.toLowerCase().replace(/\/$/, '');
    } catch {
      return url.toLowerCase();
    }
  }

  private evictOldest(): void {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;

    for (const [key, value] of this.memory.contents) {
      if (value.fetchedAt < oldestTime) {
        oldestTime = value.fetchedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.memory.contents.delete(oldestKey);
      console.log(`[FetchMemory] Evicted oldest entry: ${oldestKey}`);
    }
  }

  clear(): void {
    this.memory.contents.clear();
    console.log('[FetchMemory] Memory cleared');
  }

  getAll(): FetchedContent[] {
    return Array.from(this.memory.contents.values());
  }

  isEmpty(): boolean {
    return this.memory.contents.size === 0;
  }

  generateContextPrompt(conversationHistory?: Array<{ role: string; content: string }>): string {
    if (this.isEmpty()) {
      return '';
    }

    const contents = this.getAll();
    const contentsToInject: FetchedContent[] = [];

    for (const item of contents) {
      if (conversationHistory && this.isContentInHistory(item, conversationHistory)) {
        console.log(`[FetchMemory] Content already in conversation history, skipping: ${item.url}`);
        continue;
      }
      contentsToInject.push(item);
    }

    if (contentsToInject.length === 0) {
      return '';
    }

    const lines: string[] = [
      '## 已获取的网页内容（无需再次请求）',
      '',
      '以下网页内容已在上下文中提供，请直接使用这些内容回答问题，**不要再次调用 fetch_url 或 web_search**：',
      '',
    ];

    for (const item of contentsToInject) {
      lines.push(`### ${item.title}`);
      lines.push(`- **URL**: ${item.url}`);
      lines.push(`- **类型**: ${item.contentType}`);
      if (item.pageCount) {
        lines.push(`- **页数**: ${item.pageCount}`);
      }
      lines.push('');

      if (item.content.length > MAX_CONTEXT_CONTENT_LENGTH) {
        lines.push(`**完整内容** (共 ${item.content.length} 字符):`);
        lines.push('```');
        lines.push(item.content);
        lines.push('```');
      } else {
        lines.push('**内容**:');
        lines.push('```');
        lines.push(item.content);
        lines.push('```');
      }
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    return lines.join('\n');
  }

  private isContentInHistory(item: FetchedContent, history: Array<{ role: string; content: string }>): boolean {
    for (const msg of history) {
      if (msg.content.includes(item.url)) {
        return true;
      }
      if (msg.content.includes(item.title) && msg.content.length > 1000) {
        return true;
      }
      if (msg.role === 'tool' && msg.content.length > 5000 && msg.content.includes(item.title)) {
        return true;
      }
    }
    return false;
  }
}

export const fetchMemoryManager = new FetchMemoryManager();
