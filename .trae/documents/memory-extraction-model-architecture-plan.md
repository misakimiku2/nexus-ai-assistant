# Memory Extraction Model 架构调整计划 (v5 - 生产就绪版)

## 背景

当前 `MemoryExtractionService` 存在以下问题：

1. **thinking 污染**：Qwen 3.5 等模型默认启用 thinking 模式
2. **token 不可控**：大模型输出不稳定
3. **JSON 输出不稳定**：LLM 输出稍有偏差即解析失败
4. **Embedding 未被实际使用**：已集成 bge-small-zh-v1.5 但未在流程中使用
5. **缺乏语义去重**：相似记忆不断重复写入
6. **缺乏决策层**：完全依赖 LLM 输出决定记忆写入

## 目标

将 Memory System 从"生成驱动"升级为"**规则 + 语义驱动**"，并确保：

* **长期稳定可控**

* **Embedding 高效复用**

* **Merge 策略保守且安全**

* **状态隔离无污染**

* **生产环境可靠**

***

## 🚨 生产环境关键问题修复

### 问题一：Merge 失败导致数据丢失

**问题描述**：

```typescript
// A: 用户使用 React
// B: 用户使用 Vue
// 相似度 0.78 → 进入 merge
// conservativeMerge 返回 existing（React）
// → Vue 信息直接丢失！
```

**解决方案**：Merge Fallback 机制

```typescript
case 'merge':
  const merged = await mergeMemories(existing, candidate)
  
  if (merged === existing.content) {
    // ❗合并失败，fallback 到 insert
    const memory = await insertMemory(candidate)
    result.accepted.push(memory)
  } else {
    result.merged.push(...)
  }
  break
```

**原则**：merge 失败 ≠ 可以丢数据

***

### 问题二：类型错杀问题

**问题描述**：

```typescript
// [preference] 用户喜欢猫
// [fact] 用户养了一只猫
// embedding 相似度 0.87+
// → 被误判为 duplicate
```

**解决方案**：Duplicate 判断加类型保护

```typescript
if (similarity > duplicateThreshold && type相同) {
  skip
}
```

***

### 问题三：伪批量 Embedding 生成

**问题描述**：

```typescript
// 串行 batch（假批量）
for (const candidate of candidates) {
  candidate.embedding = await generateEmbedding()  // 逐个等待
}
```

**解决方案**：真正的并行批量

```typescript
await Promise.all(
  candidates.map(async (c) => {
    if (!c.embedding) {
      c.embedding = await generateEmbedding(c.content)
    }
  })
)
```

***

### 问题四：Memory Score 未接入系统

**问题描述**：

* 定义了 Score

* 计算了 Score

* 但没有任何地方使用它

**解决方案**：

1. Insert 时使用 Score
2. 清理策略：`if (score < 0.3) delete`

***

### 问题五：topK 限制问题

**问题描述**：

* 当 memory 变成 1000+ 条

* topK=10 可能找不到真正最相似的

* merge/skip 全部失效

**解决方案**：动态 topK

```typescript
const topK = Math.max(10, Math.floor(totalMemories * 0.05))
```

***

## 系统架构

```
Conversation（原始对话）
    ↓
┌─────────────────────────────────┐
│  PreFilter 层                   │
│  - 过滤短消息 (< 20 字符)        │
│  - 过滤工具调用消息              │
│  - 截取最近 N 条消息             │
│  - 仅做完全字符串去重            │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│  Memory Extraction Model        │
│  - Qwen2.5-3B-Instruct          │
│  - temperature=0.2              │
│  - max_tokens=800               │
│  - 输出半结构化文本              │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│  Multi-Pass Parser              │
│  - Pass 1: 严格正则匹配          │
│  - Pass 2: 宽松模式匹配          │
│  - Pass 3: 关键词提取兜底        │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│  SafeExtract 防护层             │
│  - 每轮 reset 状态               │
│  - 内容长度校验 (10-200 字符)    │
│  - 类型白名单校验                │
│  - importance 范围校验           │
│  - 完全字符串去重                │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│  Embedding 层（并行批量计算）    │
│  - bge-small-zh-v1.5            │
│  - Promise.all 并行生成          │
│  - 向量缓存在 ParsedMemory 中    │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│  Similarity Engine（核心决策层） │
│  - 复用已计算的 embedding        │
│  - 动态 topK（基于总量）         │
│  - 先全局搜索，再类型过滤        │
│  - 类型保护：duplicate 必须同类型│
│  - cosine similarity 计算       │
│  - >0.85 && 同类型 → SKIP       │
│  - 0.75~0.85 → MERGE（带fallback）│
│  - <0.75 → INSERT               │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│  Memory Score 计算（接入系统）   │
│  - score = importance × decay   │
│  - insert 时写入 score          │
│  - 清理策略：score < 0.3 删除   │
└─────────────────────────────────┘
    ↓
Memory Store
```

***

## 实施步骤

### 阶段一：类型定义与配置存储

**文件**: `src/types.ts`

```typescript
export interface MemoryModelConfig {
  enabled: boolean;
  provider: 'lm-studio' | 'ollama';
  baseUrl: string;
  modelName: string;
  temperature: number;
  maxTokens: number;
}

export const DEFAULT_MEMORY_MODEL_CONFIG: MemoryModelConfig = {
  enabled: true,
  provider: 'lm-studio',
  baseUrl: 'http://localhost:1234/v1',
  modelName: 'qwen2.5-3b-instruct',
  temperature: 0.2,
  maxTokens: 800,
};

export interface PreFilterConfig {
  minMessageLength: number;
  maxMessages: number;
  skipToolCalls: boolean;
}

export const DEFAULT_PREFILTER_CONFIG: PreFilterConfig = {
  minMessageLength: 20,
  maxMessages: 6,
  skipToolCalls: true,
};

export interface SimilarityDecision {
  action: 'skip' | 'merge' | 'insert';
  targetMemory?: MemoryItem;
  similarity: number;
  reason: string;
}

export interface SimilarityThresholds {
  duplicate: number;
  merge: number;
  minSimilarity: number;
  minScoreForCleanup: number;  // 新增：清理阈值
}

export const DEFAULT_SIMILARITY_THRESHOLDS: SimilarityThresholds = {
  duplicate: 0.85,
  merge: 0.75,
  minSimilarity: 0.5,
  minScoreForCleanup: 0.3,
};

export interface MemoryScore {
  base: number;
  decay: number;
  access: number;
  final: number;
}
```

***

### 阶段二：PreFilter 层实现

**文件**: `src/agent/memory/PreFilterService.ts`

```typescript
import { ConversationMessage } from '../../types';

export class PreFilterService {
  private config: PreFilterConfig;

  constructor(config: PreFilterConfig = DEFAULT_PREFILTER_CONFIG) {
    this.config = config;
  }

  filter(messages: ConversationMessage[]): ConversationMessage[] {
    let filtered = messages;

    filtered = filtered.filter(m => m.content.length >= this.config.minMessageLength);
    
    if (this.config.skipToolCalls) {
      filtered = filtered.filter(m => !m.isToolCall);
    }

    filtered = filtered.filter(m => m.role === 'user' || m.role === 'assistant');

    filtered = this.exactDeduplicate(filtered);

    filtered = filtered.slice(-this.config.maxMessages);

    return filtered;
  }

  private exactDeduplicate(messages: ConversationMessage[]): ConversationMessage[] {
    const seen = new Set<string>();
    const result: ConversationMessage[] = [];
    
    for (const msg of messages) {
      const normalized = msg.content.trim().toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        result.push(msg);
      }
    }
    
    return result;
  }

  formatForExtraction(messages: ConversationMessage[]): string {
    return messages
      .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
      .join('\n\n');
  }
}

export const preFilterService = new PreFilterService();
```

***

### 阶段三：Memory Model Client 实现

**文件**: `src/agent/memory/MemoryModelClient.ts`

```typescript
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
      /[^\u4e00-\u9fa5a-zA-Z0-9\s，。！？、；：""''（）【】《》\-\+\*\/]/,
      /^(.)\1{5,}$/,
      /^\W+$/,
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
```

***

### 阶段四：Similarity Engine 实现（生产就绪版）

**文件**: `src/agent/memory/SimilarityEngine.ts`

**关键修复**：

1. 动态 topK
2. 类型保护：duplicate 必须同类型
3. Merge 返回结果标识

```typescript
import { MemoryItem, SimilarityDecision, SimilarityThresholds, DEFAULT_SIMILARITY_THRESHOLDS } from '../../types';
import { TauriMemoryClient } from './TauriMemoryClient';
import { ParsedMemory } from './MemoryModelClient';

export interface SimilarityResult {
  memory: MemoryItem;
  similarity: number;
}

export interface MergeResult {
  success: boolean;
  content: string;
  wasMerged: boolean;  // 新增：标识是否真正合并
}

export class SimilarityEngine {
  private thresholds: SimilarityThresholds;

  constructor(thresholds: SimilarityThresholds = DEFAULT_SIMILARITY_THRESHOLDS) {
    this.thresholds = thresholds;
  }

  async findSimilarMemories(
    embedding: number[],
    totalMemories: number = 100
  ): Promise<SimilarityResult[]> {
    try {
      // 🚨 关键修复：动态 topK
      const topK = this.calculateDynamicTopK(totalMemories);
      
      const searchResults = await TauriMemoryClient.searchSimilarMemories(
        embedding,
        topK
      );

      return searchResults.map(result => ({
        memory: result.item,
        similarity: result.score,
      }));
    } catch (error) {
      console.error('[SimilarityEngine] Search failed:', error);
      return [];
    }
  }

  private calculateDynamicTopK(totalMemories: number): number {
    // 动态 topK：至少 10，最多 50，按总量 5% 计算
    return Math.min(50, Math.max(10, Math.floor(totalMemories * 0.05)));
  }

  filterByType(
    results: SimilarityResult[],
    memoryType: string
  ): SimilarityResult[] {
    return results.filter(r => r.memory.memoryType === memoryType);
  }

  makeDecision(
    candidate: ParsedMemory,
    similarMemories: SimilarityResult[]
  ): SimilarityDecision {
    // 先按类型过滤
    const typeMatched = this.filterByType(similarMemories, candidate.type);

    if (typeMatched.length === 0) {
      // 即使有高相似度的不同类型记忆，也 insert
      return {
        action: 'insert',
        similarity: 0,
        reason: 'No similar memories found for this type',
      };
    }

    const topMatch = typeMatched[0];
    const similarity = topMatch.similarity;

    // 🚨 关键修复：duplicate 必须同类型（已通过 filterByType 保证）
    if (similarity > this.thresholds.duplicate) {
      return {
        action: 'skip',
        targetMemory: topMatch.memory,
        similarity,
        reason: `Duplicate detected (similarity: ${similarity.toFixed(3)} > ${this.thresholds.duplicate}, same type)`,
      };
    }

    if (similarity > this.thresholds.merge) {
      return {
        action: 'merge',
        targetMemory: topMatch.memory,
        similarity,
        reason: `Similar memory found (similarity: ${similarity.toFixed(3)} > ${this.thresholds.merge})`,
      };
    }

    return {
      action: 'insert',
      similarity,
      reason: `New memory (similarity: ${similarity.toFixed(3)} < ${this.thresholds.merge})`,
    };
  }

  async processCandidate(
    candidate: ParsedMemory,
    totalMemories: number = 100
  ): Promise<{
    decision: SimilarityDecision;
    similarMemories: SimilarityResult[];
  }> {
    let embedding = candidate.embedding;
    
    if (!embedding) {
      console.warn('[SimilarityEngine] No cached embedding, generating...');
      embedding = await TauriMemoryClient.generateEmbedding(candidate.content);
      candidate.embedding = embedding;
    }

    const similarMemories = await this.findSimilarMemories(embedding, totalMemories);
    const decision = this.makeDecision(candidate, similarMemories);

    console.log('[SimilarityEngine] Decision:', {
      content: candidate.content.substring(0, 50),
      type: candidate.type,
      action: decision.action,
      similarity: decision.similarity.toFixed(3),
      reason: decision.reason,
    });

    return { decision, similarMemories };
  }

  async boostMemory(memoryId: string, boostAmount: number = 0.05): Promise<void> {
    try {
      await TauriMemoryClient.boostMemory(memoryId, boostAmount);
      console.log('[SimilarityEngine] Boosted memory:', memoryId);
    } catch (error) {
      console.error('[SimilarityEngine] Boost failed:', error);
    }
  }

  async mergeMemories(
    existing: MemoryItem,
    candidate: ParsedMemory
  ): Promise<MergeResult> {
    const mergedContent = this.conservativeMerge(existing.content, candidate.content);
    const mergedImportance = Math.max(existing.importance, candidate.importance);

    // 🚨 关键修复：返回是否真正合并
    const wasMerged = mergedContent !== existing.content;

    if (!wasMerged) {
      // 合并失败，返回原内容
      console.log('[SimilarityEngine] Merge failed: no inclusion relationship');
      return {
        success: false,
        content: existing.content,
        wasMerged: false,
      };
    }

    try {
      const newEmbedding = await TauriMemoryClient.generateEmbedding(mergedContent);
      
      await TauriMemoryClient.updateMemory(existing.id, {
        content: mergedContent,
        importance: mergedImportance,
        embedding: newEmbedding,
      });

      console.log('[SimilarityEngine] Merged memory:', existing.id);
      return {
        success: true,
        content: mergedContent,
        wasMerged: true,
      };
    } catch (error) {
      console.error('[SimilarityEngine] Merge failed:', error);
      throw error;
    }
  }

  private conservativeMerge(existing: string, newContent: string): string {
    if (existing.includes(newContent)) {
      return existing;
    }
    
    if (newContent.includes(existing)) {
      return newContent;
    }

    // 保守策略：不合并
    return existing;
  }

  updateThresholds(thresholds: Partial<SimilarityThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  getThresholds(): SimilarityThresholds {
    return this.thresholds;
  }
}

export const similarityEngine = new SimilarityEngine();
```

***

### 阶段五：Memory Score 机制（接入系统）

**文件**: `src/agent/memory/MemoryScoreCalculator.ts`

```typescript
import { MemoryItem, MemoryScore } from '../../types';
import { TauriMemoryClient } from './TauriMemoryClient';

export class MemoryScoreCalculator {
  calculate(memory: MemoryItem): MemoryScore {
    const now = Date.now();
    const ageInDays = (now - memory.createdAt) / (1000 * 60 * 60 * 24);
    
    const halfLifeDays = 30;
    const decay = Math.pow(0.5, ageInDays / halfLifeDays);
    
    const accessBonus = Math.min(memory.accessCount * 0.01, 0.2);
    
    const final = memory.importance * decay + accessBonus;

    return {
      base: memory.importance,
      decay,
      access: accessBonus,
      final: Math.min(final, 1.0),
    };
  }

  calculateBatch(memories: MemoryItem[]): Map<string, MemoryScore> {
    const scores = new Map<string, MemoryScore>();
    
    for (const memory of memories) {
      scores.set(memory.id, this.calculate(memory));
    }
    
    return scores;
  }

  sortByScore(memories: MemoryItem[]): MemoryItem[] {
    return [...memories].sort((a, b) => {
      const scoreA = this.calculate(a);
      const scoreB = this.calculate(b);
      return scoreB.final - scoreA.final;
    });
  }

  filterByMinScore(memories: MemoryItem[], minScore: number): MemoryItem[] {
    return memories.filter(m => {
      const score = this.calculate(m);
      return score.final >= minScore;
    });
  }

  // 🚨 新增：清理低分记忆
  async cleanupLowScoreMemories(minScore: number = 0.3): Promise<number> {
    try {
      const memories = await TauriMemoryClient.getAllMemories();
      const lowScoreMemories = memories.filter(m => {
        const score = this.calculate(m);
        return score.final < minScore;
      });

      for (const memory of lowScoreMemories) {
        await TauriMemoryClient.deleteMemory(memory.id);
      }

      console.log(`[MemoryScore] Cleaned up ${lowScoreMemories.length} low-score memories`);
      return lowScoreMemories.length;
    } catch (error) {
      console.error('[MemoryScore] Cleanup failed:', error);
      return 0;
    }
  }
}

export const memoryScoreCalculator = new MemoryScoreCalculator();
```

***

### 阶段六：Memory Store 集成（生产就绪版）

**文件**: `src/agent/memory/MemoryStore.ts`

**关键修复**：

1. 并行批量生成 embedding
2. Merge fallback 到 insert
3. Memory Score 接入

```typescript
import { MemoryItem } from '../../types';
import { TauriMemoryClient } from './TauriMemoryClient';
import { SimilarityEngine, similarityEngine, MergeResult } from './SimilarityEngine';
import { ParsedMemory } from './MemoryModelClient';
import { memoryScoreCalculator } from './MemoryScoreCalculator';

export interface StoreResult {
  accepted: MemoryItem[];
  skipped: { content: string; reason: string }[];
  merged: { existing: MemoryItem; newContent: string }[];
}

export class MemoryStore {
  private similarityEngine: SimilarityEngine;

  constructor() {
    this.similarityEngine = similarityEngine;
  }

  async storeCandidates(
    candidates: ParsedMemory[],
    sessionId: string
  ): Promise<StoreResult> {
    const result: StoreResult = {
      accepted: [],
      skipped: [],
      merged: [],
    };

    // 🚨 关键修复：并行批量生成 embedding
    await this.generateEmbeddingsParallel(candidates);

    // 获取当前记忆总数（用于动态 topK）
    const totalMemories = await this.getTotalMemories();

    for (const candidate of candidates) {
      try {
        const { decision } = await this.similarityEngine.processCandidate(candidate, totalMemories);

        switch (decision.action) {
          case 'skip':
            await this.similarityEngine.boostMemory(decision.targetMemory!.id, 0.05);
            result.skipped.push({
              content: candidate.content,
              reason: decision.reason,
            });
            break;

          case 'merge':
            // 🚨 关键修复：Merge fallback 机制
            const mergeResult = await this.similarityEngine.mergeMemories(
              decision.targetMemory!,
              candidate
            );
            
            if (mergeResult.wasMerged) {
              // 合并成功
              result.merged.push({
                existing: decision.targetMemory!,
                newContent: candidate.content,
              });
            } else {
              // 🚨 合并失败，fallback 到 insert
              console.log('[MemoryStore] Merge failed, fallback to insert');
              const memory = await this.insertMemory(candidate, sessionId);
              if (memory) {
                result.accepted.push(memory);
              }
            }
            break;

          case 'insert':
            const memory = await this.insertMemory(candidate, sessionId);
            if (memory) {
              result.accepted.push(memory);
            }
            break;
        }
      } catch (error) {
        console.error('[MemoryStore] Failed to process candidate:', error);
      }
    }

    console.log('[MemoryStore] Store result:', {
      accepted: result.accepted.length,
      skipped: result.skipped.length,
      merged: result.merged.length,
    });

    return result;
  }

  // 🚨 关键修复：真正的并行批量生成
  private async generateEmbeddingsParallel(candidates: ParsedMemory[]): Promise<void> {
    await Promise.all(
      candidates.map(async (c) => {
        if (!c.embedding) {
          c.embedding = await TauriMemoryClient.generateEmbedding(c.content);
        }
      })
    );
  }

  private async getTotalMemories(): Promise<number> {
    try {
      const stats = await TauriMemoryClient.getMemoryStats();
      return stats.totalCount;
    } catch {
      return 100; // 默认值
    }
  }

  private async insertMemory(
    candidate: ParsedMemory,
    sessionId: string
  ): Promise<MemoryItem | null> {
    try {
      const embedding = candidate.embedding || 
        await TauriMemoryClient.generateEmbedding(candidate.content);
      
      const memory: MemoryItem = {
        id: crypto.randomUUID(),
        content: candidate.content,
        memoryType: candidate.type,
        importance: candidate.importance,
        score: candidate.importance,  // 初始 score = importance
        decay: 1.0,
        isActive: true,
        embedding,
        sourceSessionId: sessionId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 1,
        version: 1,
        parentIds: [],
      };

      // 🚨 关键修复：计算并写入 Memory Score
      const score = memoryScoreCalculator.calculate(memory);
      memory.score = score.final;

      await TauriMemoryClient.addMemory(memory);
      
      return memory;
    } catch (error) {
      console.error('[MemoryStore] Insert failed:', error);
      return null;
    }
  }
}

export const memoryStore = new MemoryStore();
```

***

### 阶段七：MemoryExtractionService 重构

**文件**: `src/agent/memory/MemoryExtractionService.ts`

```typescript
import { ConversationMessage, ExtractionConfig } from '../../types';
import { PreFilterService, preFilterService } from './PreFilterService';
import { MemoryModelClient, memoryModelClient, ParsedMemory } from './MemoryModelClient';
import { MemoryStore, memoryStore, StoreResult } from './MemoryStore';
import { memoryScoreCalculator } from './MemoryScoreCalculator';

const DEFAULT_EXTRACTION_CONFIG: ExtractionConfig = {
  minMessageCount: 4,
  minConversationLength: 200,
  skipToolCallMessages: true,
};

export interface MemoryExtractionCallbacks {
  onCandidatesExtracted?: (candidates: ParsedMemory[]) => void;
  onStoreResult?: (result: StoreResult) => void;
  onExtractionError?: (error: Error) => void;
}

class MemoryExtractionService {
  private callbacks: MemoryExtractionCallbacks = {};
  private isExtracting = false;
  private pendingExtraction: NodeJS.Timeout | null = null;
  private lastProcessedIndex: number = 0;
  private readonly MIN_NEW_MESSAGES = 4;
  private readonly MIN_CONTENT_LENGTH = 300;

  private preFilter: PreFilterService = preFilterService;
  private modelClient: MemoryModelClient = memoryModelClient;
  private store: MemoryStore = memoryStore;

  setCallbacks(callbacks: MemoryExtractionCallbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  resetCursor(): void {
    this.lastProcessedIndex = 0;
    console.log('[MemoryExtraction] 游标已重置');
  }

  async triggerExtraction(
    messages: ConversationMessage[],
    sessionId: string,
    config: Partial<ExtractionConfig> = {}
  ): Promise<StoreResult | null> {
    if (this.isExtracting) {
      console.log('[MemoryExtraction] 已有提取任务在进行中，跳过');
      return null;
    }

    const newMessages = messages.slice(this.lastProcessedIndex);
    const newContentLength = newMessages.reduce((sum, m) => sum + m.content.length, 0);

    console.log('[MemoryExtraction] 增量提取检查:', {
      总消息数: messages.length,
      已处理: this.lastProcessedIndex,
      新消息数: newMessages.length,
      新消息长度: newContentLength,
    });

    if (newMessages.length < this.MIN_NEW_MESSAGES && newContentLength < this.MIN_CONTENT_LENGTH) {
      console.log('[MemoryExtraction] 不满足触发条件');
      return null;
    }

    this.lastProcessedIndex = messages.length;

    try {
      this.isExtracting = true;
      console.log('[MemoryExtraction] 开始增量提取...');

      // 1. PreFilter
      const filteredMessages = this.preFilter.filter(newMessages);
      if (filteredMessages.length === 0) {
        console.log('[MemoryExtraction] PreFilter 后无有效消息');
        return null;
      }

      const conversation = this.preFilter.formatForExtraction(filteredMessages);

      // 2. Memory Model Extraction
      const modelConfig = this.modelClient.getConfig();
      let candidates: ParsedMemory[];

      if (modelConfig.enabled) {
        candidates = await this.modelClient.extractCandidates(conversation);
      } else {
        candidates = await this.legacyExtraction(conversation);
      }

      if (candidates.length === 0) {
        console.log('[MemoryExtraction] 没有提取到候选记忆');
        return null;
      }

      this.callbacks.onCandidatesExtracted?.(candidates);

      // 3. Similarity Engine + Memory Store
      const storeResult = await this.store.storeCandidates(candidates, sessionId);

      this.callbacks.onStoreResult?.(storeResult);

      console.log('[MemoryExtraction] 提取完成:', {
        candidates: candidates.length,
        accepted: storeResult.accepted.length,
        skipped: storeResult.skipped.length,
        merged: storeResult.merged.length,
      });

      return storeResult;
    } catch (error) {
      console.error('[MemoryExtraction] 提取失败:', error);
      this.callbacks.onExtractionError?.(error instanceof Error ? error : new Error(String(error)));
      return null;
    } finally {
      this.isExtracting = false;
    }
  }

  // 🚨 新增：清理低分记忆
  async cleanupLowScoreMemories(minScore: number = 0.3): Promise<number> {
    return memoryScoreCalculator.cleanupLowScoreMemories(minScore);
  }

  private async legacyExtraction(conversation: string): Promise<ParsedMemory[]> {
    return [];
  }

  triggerExtractionAsync(
    messages: ConversationMessage[],
    sessionId: string,
    delay: number = 500
  ): void {
    if (this.pendingExtraction) {
      clearTimeout(this.pendingExtraction);
    }

    this.pendingExtraction = setTimeout(() => {
      this.triggerExtraction(messages, sessionId);
      this.pendingExtraction = null;
    }, delay);
  }

  cancelPendingExtraction(): void {
    if (this.pendingExtraction) {
      clearTimeout(this.pendingExtraction);
      this.pendingExtraction = null;
    }
  }
}

export const memoryExtractionService = new MemoryExtractionService();
```

***

### 阶段八：TauriMemoryClient 扩展

**文件**: `src/agent/memory/TauriMemoryClient.ts`

需要新增以下方法：

```typescript
// 生成 Embedding
static async generateEmbedding(content: string): Promise<number[]>

// 搜索相似记忆（全局 topK）
static async searchSimilarMemories(
  embedding: number[],
  topK: number
): Promise<RetrievedMemory[]>

// Boost 记忆重要性
static async boostMemory(memoryId: string, amount: number): Promise<void>

// 更新记忆内容
static async updateMemory(memoryId: string, updates: Partial<MemoryItem>): Promise<void>

// 添加记忆
static async addMemory(memory: MemoryItem): Promise<void>

// 删除记忆
static async deleteMemory(memoryId: string): Promise<void>

// 获取所有记忆
static async getAllMemories(): Promise<MemoryItem[]>

// 获取记忆统计
static async getMemoryStats(): Promise<{ totalCount: number }>
```

***

### 阶段九：设置界面扩展

**文件**: `src/components/SettingsView.tsx`

新增 Memory Model 配置区块。

***

## 文件修改清单

| 文件                                            | 操作     | 说明                                         |
| --------------------------------------------- | ------ | ------------------------------------------ |
| `src/types.ts`                                | 修改     | 新增类型定义                                     |
| `src/context/GlobalStateContext.tsx`          | 修改     | 新增 `memoryModelConfig` 状态                  |
| `src/agent/memory/PreFilterService.ts`        | **新增** | PreFilter（仅完全去重）                           |
| `src/agent/memory/MemoryModelClient.ts`       | **新增** | Memory Model + Parser + SafeExtract        |
| `src/agent/memory/SimilarityEngine.ts`        | **新增** | 核心决策层（动态topK + 类型保护 + MergeResult）         |
| `src/agent/memory/MemoryScoreCalculator.ts`   | **新增** | Memory Score（接入系统 + 清理功能）                  |
| `src/agent/memory/MemoryStore.ts`             | **新增** | Memory Store（并行embedding + Merge fallback） |
| `src/agent/memory/MemoryExtractionService.ts` | 修改     | 整合所有组件 + 清理功能                              |
| `src/agent/memory/TauriMemoryClient.ts`       | 修改     | 新增方法                                       |
| `src/agent/memory/index.ts`                   | 修改     | 导出新模块                                      |
| `src/components/SettingsView.tsx`             | 修改     | 新增 Memory Model 设置区块                       |
| `src/i18n/locales/zh.json`                    | 修改     | 新增中文翻译                                     |
| `src/i18n/locales/en.json`                    | 修改     | 新增英文翻译                                     |

***

## 🚨 生产环境关键修复总结

| 问题               | 修复方案                                       |
| ---------------- | ------------------------------------------ |
| Merge 失败丢数据      | MergeResult.wasMerged + fallback to insert |
| 类型错杀             | duplicate 判断必须同类型                          |
| 伪批量 Embedding    | Promise.all 并行生成                           |
| Memory Score 未接入 | insert 时写入 score + 清理功能                    |
| topK 限制          | 动态 topK = max(10, min(50, total \* 0.05))  |

***

## 数据流总结

```
原始消息 → PreFilter → Memory Model → Parser → SafeExtract（reset）
    → Embedding（Promise.all 并行）
    → Similarity（动态topK + 类型保护）
    → Merge（带 fallback）
    → Memory Score（写入 + 清理）
    → Store
```

***

## 验收标准

* [ ] TypeScript 编译通过

* [ ] PreFilter 仅做完全字符串去重

* [ ] SafeExtract 每轮 reset 状态

* [ ] Embedding 并行生成（Promise.all）

* [ ] Similarity 动态 topK

* [ ] Duplicate 必须同类型

* [ ] Merge 失败 fallback 到 insert

* [ ] Memory Score 写入并用于清理

* [ ] 设置界面正确保存配置

* [ ] 端到端提取流程正常工作

