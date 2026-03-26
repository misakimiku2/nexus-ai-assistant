import { MemoryModelConfig, DEFAULT_MEMORY_MODEL_CONFIG, MemoryType } from '../../types';

const MEMORY_EXTRACTION_PROMPT = `你是记忆提取器。严格按照格式输出。

【输出格式 - 必须严格遵守】
每行一条记忆，格式：
[类型] 内容 | 重要性

类型只能是以下之一：
- identity（身份）
- fact（事实）
- preference（偏好）
- task（任务）
- constraint（约束）
- skill（技能）

重要性是 0.7 到 1.0 之间的数字。

【输出示例】
[identity] 用户是一名软件工程师 | 0.9
[preference] 用户喜欢使用深色主题 | 0.8
[fact] 项目使用 React + TypeScript 技术栈 | 0.85

【严格规则】
1. 每行必须以 [类型] 开头
2. 内容和重要性之间用 | 分隔
3. 不要输出任何其他内容
4. 不要输出思考过程
5. 不要输出解释
6. 总共不超过 8 行
7. 如果没有重要信息，输出空行`;

const USER_PROMPT_SUFFIX = `

直接输出记忆，不要解释：`;

export interface ParsedMemory {
  type: MemoryType;
  content: string;
  importance: number;
  embedding?: number[];
}

export class MultiPassParser {
  private readonly VALID_TYPES = ['identity', 'fact', 'preference', 'task', 'constraint', 'skill'];

  parse(text: string): ParsedMemory[] {
    const strictResult = this.strictParse(text);
    if (strictResult.length > 0) {
      console.log('[MemoryParser] Pass 1 (strict) matched:', strictResult.length);
      return strictResult;
    }

    const looseResult = this.looseParse(text);
    if (looseResult.length > 0) {
      console.log('[MemoryParser] Pass 2 (loose) matched:', looseResult.length);
      return looseResult;
    }

    const fallbackResult = this.fallbackParse(text);
    console.log('[MemoryParser] Pass 3 (fallback) matched:', fallbackResult.length);
    return fallbackResult;
  }

  private strictParse(text: string): ParsedMemory[] {
    const regex = /^\[(identity|fact|preference|task|constraint|skill)\]\s*(.+?)\s*\|\s*(0\.[7-9]\d*|1\.0)\s*$/;
    const results: ParsedMemory[] = [];

    for (const line of text.split('\n')) {
      const match = line.trim().match(regex);
      if (match) {
        results.push({
          type: match[1] as MemoryType,
          content: match[2].trim(),
          importance: parseFloat(match[3]),
        });
      }
    }

    return results;
  }

  private looseParse(text: string): ParsedMemory[] {
    const results: ParsedMemory[] = [];

    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      
      const typeMatch = trimmed.match(/\[(\w+)\]/);
      if (!typeMatch) continue;

      const type = typeMatch[1].toLowerCase();
      if (!this.VALID_TYPES.includes(type)) continue;

      const contentMatch = trimmed.match(/\]\s*(.+?)(?:\s*\||$)/);
      if (!contentMatch) continue;

      const content = contentMatch[1].trim();

      const importanceMatch = trimmed.match(/\|\s*([\d.]+)/);
      const importance = importanceMatch ? parseFloat(importanceMatch[1]) : 0.75;

      const validImportance = Math.max(0.7, Math.min(1.0, importance));

      results.push({
        type: type as MemoryType,
        content,
        importance: validImportance,
      });
    }

    return results;
  }

  private fallbackParse(text: string): ParsedMemory[] {
    const keywords = ['用户', '偏好', '喜欢', '使用', '项目', '任务', '约束'];
    const results: ParsedMemory[] = [];

    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.length < 10) continue;

      if (keywords.some(kw => trimmed.includes(kw))) {
        results.push({
          type: 'fact',
          content: trimmed,
          importance: 0.75,
        });
      }
    }

    return results.slice(0, 8);
  }
}

export class SafeExtractor {
  private readonly MAX_MEMORIES = 8;
  private readonly MIN_CONTENT_LENGTH = 10;
  private readonly MAX_CONTENT_LENGTH = 200;
  private readonly MIN_IMPORTANCE = 0.7;
  private readonly MAX_IMPORTANCE = 1.0;
  private readonly VALID_TYPES = new Set(['identity', 'fact', 'preference', 'task', 'constraint', 'skill']);

  private seenContents: Set<string> = new Set();

  extract(memories: ParsedMemory[]): ParsedMemory[] {
    const validMemories: ParsedMemory[] = [];

    for (const memory of memories) {
      const validation = this.validate(memory);
      if (!validation.valid) {
        console.warn('[SafeExtract] Rejected:', validation.reason, memory);
        continue;
      }

      const normalized = this.normalizeContent(memory.content);
      if (this.seenContents.has(normalized)) {
        console.warn('[SafeExtract] Duplicate rejected:', memory.content);
        continue;
      }

      this.seenContents.add(normalized);
      validMemories.push(memory);

      if (validMemories.length >= this.MAX_MEMORIES) {
        break;
      }
    }

    return validMemories;
  }

  private validate(memory: ParsedMemory): { valid: boolean; reason?: string } {
    if (!this.VALID_TYPES.has(memory.type)) {
      return { valid: false, reason: `Invalid type: ${memory.type}` };
    }

    if (memory.content.length < this.MIN_CONTENT_LENGTH) {
      return { valid: false, reason: `Content too short: ${memory.content.length}` };
    }

    if (memory.content.length > this.MAX_CONTENT_LENGTH) {
      return { valid: false, reason: `Content too long: ${memory.content.length}` };
    }

    if (memory.importance < this.MIN_IMPORTANCE || memory.importance > this.MAX_IMPORTANCE) {
      return { valid: false, reason: `Importance out of range: ${memory.importance}` };
    }

    if (this.containsGarbage(memory.content)) {
      return { valid: false, reason: 'Content contains garbage characters' };
    }

    return { valid: true };
  }

  private normalizeContent(content: string): string {
    return content
      .toLowerCase()
      .replace(/[^\u4e00-\u9fa5a-z0-9]/g, '')
      .trim();
  }

  private containsGarbage(content: string): boolean {
    const garbagePatterns = [
      /^(.)\1{5,}$/,
      /^[^\u4e00-\u9fa5a-zA-Z0-9]+$/,
    ];

    return garbagePatterns.some(pattern => pattern.test(content));
  }

  reset(): void {
    this.seenContents.clear();
  }
}

export class MemoryModelClient {
  private config: MemoryModelConfig;
  private parser: MultiPassParser;
  private safeExtractor: SafeExtractor;

  constructor(config?: Partial<MemoryModelConfig>) {
    this.config = { ...DEFAULT_MEMORY_MODEL_CONFIG, ...config };
    this.parser = new MultiPassParser();
    this.safeExtractor = new SafeExtractor();
  }

  updateConfig(config: Partial<MemoryModelConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): MemoryModelConfig {
    return this.config;
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const url = `${this.config.baseUrl}/models`;
      const response = await fetch(url, { method: 'GET' });
      
      if (response.ok) {
        return { success: true };
      }
      return { success: false, error: `HTTP ${response.status}` };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async extractCandidates(conversation: string): Promise<ParsedMemory[]> {
    this.safeExtractor.reset();

    const rawOutput = await this.callModel(conversation);
    if (!rawOutput) {
      console.log('[MemoryModelClient] No output from model');
      return [];
    }

    const parsed = this.parser.parse(rawOutput);
    const safe = this.safeExtractor.extract(parsed);

    console.log('[MemoryModelClient] Extraction complete:', {
      parsed: parsed.length,
      safe: safe.length,
    });

    return safe;
  }

  private async callModel(conversation: string): Promise<string | null> {
    try {
      const url = `${this.config.baseUrl}/chat/completions`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.modelName,
          messages: [
            { role: 'system', content: MEMORY_EXTRACTION_PROMPT },
            { role: 'user', content: conversation + USER_PROMPT_SUFFIX }
          ],
          temperature: this.config.temperature,
          max_tokens: this.config.maxTokens,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      
      console.log('[MemoryModelClient] Model output length:', content.length);
      
      return content;
    } catch (error) {
      console.error('[MemoryModelClient] Model call failed:', error);
      return null;
    }
  }
}

export const memoryModelClient = new MemoryModelClient();
