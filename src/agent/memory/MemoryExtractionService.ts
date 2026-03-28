import { TauriMemoryClient } from './TauriMemoryClient';
import { CandidateMemory, CandidateStatus, ConversationMessage, ExtractionConfig, MemoryModelConfig, DEFAULT_MEMORY_MODEL_CONFIG, RetrievedMemory, MemoryItem, MemoryStats } from '../../types';
import { PreFilterService, preFilterService } from './PreFilterService';
import { MemoryModelClient, memoryModelClient, ParsedMemory } from './MemoryModelClient';
import { MemoryStore, memoryStore, StoreResult } from './MemoryStore';
import { similarityEngine } from './SimilarityEngine';

const DEFAULT_EXTRACTION_CONFIG: ExtractionConfig = {
  minMessageCount: 4,
  minConversationLength: 200,
  skipToolCallMessages: true,
};

const MAX_MESSAGES_PER_EXTRACTION = 6;
const MIN_NEW_MESSAGES = 2;

export interface MemoryExtractionCallbacks {
  onCandidatesExtracted?: (candidates: CandidateMemory[] | ParsedMemory[]) => void;
  onStoreResult?: (result: StoreResult) => void;
  onExtractionError?: (error: Error) => void;
}

class MemoryExtractionService {
  private callbacks: MemoryExtractionCallbacks = {};
  private isExtracting = false;
  private pendingExtraction: NodeJS.Timeout | null = null;
  private lastProcessedIndex: number = 0;
  private processedContentHashes: Set<string> = new Set();
  private readonly MIN_NEW_MESSAGES = 4;
  private readonly MIN_CONTENT_LENGTH = 300;
  private readonly MAX_INPUT_MESSAGES = 6;

  private preFilter: PreFilterService = preFilterService;
  private modelClient: MemoryModelClient = memoryModelClient;
  private store: MemoryStore = memoryStore;
  private memoryModelConfig: MemoryModelConfig = DEFAULT_MEMORY_MODEL_CONFIG;
  private useMainModel: boolean = false;

  setCallbacks(callbacks: MemoryExtractionCallbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  setMemoryModelConfig(config: MemoryModelConfig): void {
    this.memoryModelConfig = config;
    
    if (config.enabled) {
      this.useMainModel = false;
      this.modelClient.updateConfig(config);
    } else {
      this.useMainModel = true;
      const mainModelConfig = this.getMainModelConfig();
      this.modelClient.updateConfig(mainModelConfig);
      console.log('[MemoryExtraction] 专用模型已禁用，切换到主模型:', mainModelConfig.modelName);
    }
  }

  private getMainModelConfig(): MemoryModelConfig {
    const apiUrl = localStorage.getItem('nexus_lm_studio_url') || 'http://localhost:1234/v1';
    const modelName = localStorage.getItem('nexus_model_name') || 'local-model';
    
    return {
      enabled: false,
      provider: 'lm-studio',
      baseUrl: apiUrl.replace('/chat/completions', '').replace('/v1/chat/completions', '/v1'),
      modelName: modelName,
      temperature: 0.2,
      maxTokens: 800,
    };
  }

  setMemoryStoreConfig(config: {
    generateEmbedding: (content: string) => Promise<number[]>;
    searchSimilarMemories: (embedding: number[], topK: number) => Promise<RetrievedMemory[]>;
    addMemory: (memory: MemoryItem) => Promise<void>;
    updateMemory: (memoryId: string, updates: Partial<MemoryItem>) => Promise<void>;
    boostMemory: (memoryId: string, amount: number) => Promise<void>;
    getMemoryStats: () => Promise<MemoryStats>;
  }): void {
    this.store.setConfig(config);
  }

  resetCursor(): void {
    this.lastProcessedIndex = 0;
    this.processedContentHashes.clear();
    console.log('[MemoryExtraction] 游标已重置');
  }

  async triggerExtraction(
    messages: ConversationMessage[],
    sessionId: string,
    config: Partial<ExtractionConfig> = {}
  ): Promise<CandidateMemory[] | null> {
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
      console.log('[MemoryExtraction] 不满足触发条件， 消息数:', newMessages.length, '<', this.MIN_NEW_MESSAGES, ', 长度:', newContentLength, '<', this.MIN_CONTENT_LENGTH);
      return null;
    }

    this.lastProcessedIndex = messages.length;

    try {
      this.isExtracting = true;
      
      if (this.useMainModel) {
        console.log('[MemoryExtraction] 使用主模型进行记忆提取 (兜底模式)');
      } else {
        console.log('[MemoryExtraction] 使用专用模型进行记忆提取');
      }
      
      return await this.newExtractionPipeline(newMessages, sessionId);
    } catch (error) {
      console.error('[MemoryExtraction] 提取失败:', error);
      this.callbacks.onExtractionError?.(error instanceof Error ? error : new Error(String(error)));
      return null;
    } finally {
      this.isExtracting = false;
    }
  }

  private async newExtractionPipeline(
    messages: ConversationMessage[],
    sessionId: string
  ): Promise<CandidateMemory[] | null> {
    const filteredMessages = this.preFilter.filter(messages);
    if (filteredMessages.length === 0) {
      console.log('[MemoryExtraction] PreFilter 后无有效消息');
      return null;
    }

    const conversation = this.preFilter.formatForExtraction(filteredMessages);

    const candidates = await this.modelClient.extractCandidates(conversation);

    if (candidates.length === 0) {
      console.log('[MemoryExtraction] 没有提取到候选记忆');
      return null;
    }

    const dedupedCandidates = await this.deduplicateCandidates(candidates);

    if (dedupedCandidates.length === 0) {
      console.log('[MemoryExtraction] 去重后无新候选记忆');
      return null;
    }

    const candidateMemories: CandidateMemory[] = dedupedCandidates.map(c => ({
      id: crypto.randomUUID(),
      content: c.content,
      memoryType: c.type,
      confidence: c.importance,
      sourceSessionId: sessionId,
      sourceMessageIds: filteredMessages.map(m => m.id || crypto.randomUUID()),
      createdAt: Date.now(),
      status: 'pending' as CandidateStatus,
      importance: c.importance,
    }));

    for (const candidate of candidateMemories) {
      await TauriMemoryClient.addCandidateMemory(candidate);
    }

    this.callbacks.onCandidatesExtracted?.(candidateMemories);

    console.log('[MemoryExtraction] 提取完成，添加了', candidateMemories.length, '条候选记忆 (原始:', candidates.length, ', 去重后:', dedupedCandidates.length, ')');

    return candidateMemories;
  }

  private async deduplicateCandidates(candidates: ParsedMemory[]): Promise<ParsedMemory[]> {
    const DUPLICATE_THRESHOLD = 0.85;
    const SIMILAR_THRESHOLD = 0.75;

    const result: ParsedMemory[] = [];
    const stats = {
      total: candidates.length,
      skipped: 0,
      merged: 0,
    };

    try {
      const existingCandidates = await TauriMemoryClient.getPendingCandidates();
      const existingMemories = await TauriMemoryClient.getAllMemories();

      const candidateEmbeddings = new Map<string, number[]>();
      for (const candidate of candidates) {
        if (!candidate.embedding) {
          try {
            candidate.embedding = await TauriMemoryClient.generateEmbedding(candidate.content);
          } catch (e) {
            console.warn('[MemoryExtraction] 生成 embedding 失败，跳过去重检查:', candidate.content.substring(0, 30));
            result.push(candidate);
            continue;
          }
        }
        candidateEmbeddings.set(candidate.content, candidate.embedding);
      }

      const existingCandidateEmbeddings = new Map<string, number[]>();
      const embeddingPromises = existingCandidates.map(async (ec) => {
        try {
          const embedding = await TauriMemoryClient.generateEmbedding(ec.content);
          existingCandidateEmbeddings.set(ec.id, embedding);
        } catch (e) {
          console.warn('[MemoryExtraction] 生成已有候选 embedding 失败:', ec.content.substring(0, 30));
        }
      });
      await Promise.all(embeddingPromises);

      const memoryEmbeddings = new Map<string, number[]>();
      for (const memory of existingMemories) {
        if (memory.embedding && memory.embedding.length > 0) {
          memoryEmbeddings.set(memory.id, memory.embedding);
        } else {
          try {
            const embedding = await TauriMemoryClient.generateEmbedding(memory.content);
            memoryEmbeddings.set(memory.id, embedding);
          } catch (e) {
            console.warn('[MemoryExtraction] 生成已有记忆 embedding 失败:', memory.content.substring(0, 30));
          }
        }
      }

      for (const candidate of candidates) {
        const candidateEmbedding = candidateEmbeddings.get(candidate.content);
        if (!candidateEmbedding) continue;

        let shouldSkip = false;
        let hasMerged = false;

        for (const existing of existingCandidates) {
          if (existing.memoryType !== candidate.type) continue;

          const existingEmbedding = existingCandidateEmbeddings.get(existing.id);
          if (!existingEmbedding) continue;

          const similarity = this.cosineSimilarity(candidateEmbedding, existingEmbedding);

          if (similarity > DUPLICATE_THRESHOLD) {
            console.log('[MemoryExtraction] 与已有候选记忆重复，跳过:', candidate.content.substring(0, 30), '相似度:', similarity.toFixed(3));
            shouldSkip = true;
            stats.skipped++;
            break;
          }

          if (similarity > SIMILAR_THRESHOLD && !hasMerged) {
            const merged = this.tryMergeContent(existing.content, candidate.content);
            if (merged) {
              console.log('[MemoryExtraction] 与已有候选记忆相似，合并:', candidate.content.substring(0, 30), '→', merged.substring(0, 30));
              candidate.content = merged;
              hasMerged = true;
              stats.merged++;
            }
          }
        }

        if (shouldSkip) continue;

        for (const memory of existingMemories) {
          if (memory.memoryType !== candidate.type) continue;

          const memoryEmbedding = memoryEmbeddings.get(memory.id);
          if (!memoryEmbedding) continue;

          const similarity = this.cosineSimilarity(candidateEmbedding, memoryEmbedding);

          if (similarity > DUPLICATE_THRESHOLD) {
            console.log('[MemoryExtraction] 与已有正式记忆重复，跳过:', candidate.content.substring(0, 30), '相似度:', similarity.toFixed(3));
            shouldSkip = true;
            stats.skipped++;
            await TauriMemoryClient.boostMemory(memory.id, 0.05);
            break;
          }

          if (similarity > SIMILAR_THRESHOLD && !hasMerged) {
            const merged = this.tryMergeContent(memory.content, candidate.content);
            if (merged) {
              console.log('[MemoryExtraction] 与已有正式记忆相似，合并:', candidate.content.substring(0, 30), '→', merged.substring(0, 30));
              candidate.content = merged;
              hasMerged = true;
              stats.merged++;
            }
          }
        }

        if (!shouldSkip) {
          result.push(candidate);
        }
      }
    } catch (error) {
      console.error('[MemoryExtraction] 去重过程出错，返回原始候选:', error);
      return candidates;
    }

    console.log('[MemoryExtraction] 去重统计:', stats);
    return result;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private tryMergeContent(existing: string, newContent: string): string | null {
    if (existing.includes(newContent)) {
      return existing;
    }
    if (newContent.includes(existing)) {
      return newContent;
    }
    return null;
  }

  private async legacyExtractionPipeline(
    messages: ConversationMessage[],
    sessionId: string,
    config: Partial<ExtractionConfig>
  ): Promise<CandidateMemory[] | null> {
    const recentMessages = messages.slice(-this.MAX_INPUT_MESSAGES);

    console.log('[MemoryExtraction] 提取窗口:', {
      新消息数: messages.length,
      提取窗口: recentMessages.length,
    });

    const fullConfig = { ...DEFAULT_EXTRACTION_CONFIG, ...config };

    const conversationText = this.formatConversationForExtraction(recentMessages);
    
    const extracted = await this.callLLMForExtraction(conversationText);
    
    if (!extracted) {
      console.log('[MemoryExtraction] LLM 未返回有效结果');
      return null;
    }

    const candidates = this.convertToCandidates(extracted, sessionId, recentMessages);
    
    if (candidates.length === 0) {
      console.log('[MemoryExtraction] 没有提取到有效记忆');
      return null;
    }

    for (const candidate of candidates) {
      await TauriMemoryClient.addCandidateMemory(candidate);
    }

    console.log('[MemoryExtraction] 增量提取完成，添加了', candidates.length, '条候选记忆');
    
    this.callbacks.onCandidatesExtracted?.(candidates);
    
    return candidates;
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

  private formatConversationForExtraction(messages: ConversationMessage[]): string {
    return messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
      .join('\n\n');
  }

  private async callLLMForExtraction(conversation: string): Promise<any> {
    try {
      const apiUrl = localStorage.getItem('nexus_lm_studio_url') || 'http://localhost:1234/v1/chat/completions';
      const modelName = localStorage.getItem('nexus_model_name') || 'local-model';
      
      const systemPrompt = `# 核心指令
[STRICT] 你是一个 JSON 生成器，不是聊天助手。
[FORMAT] 你的输出必须以 "{" 开头，以 "}" 结尾。
[CRITICAL] 禁止输出任何思考、推理、解释、注释、markdown。
[CRITICAL] 直接输出 JSON，不要想，不要解释，直接输出。

【上下文说明】
以下仅为"新增对话片段"，请只提取其中新增的信息：
- 不要重复已有知识
- 不要总结历史内容
- 只关注这段对话中的新信息

【提取原则】
只提取"最重要、最稳定、可复用"的信息。

【忽略内容】
- 临时讨论内容
- 重复表达
- 细节举例
- 枚举类信息（如一堆角色名、物品列表）

【优先提取】
- 用户长期偏好
- 稳定事实
- 关键能力/约束

【数量限制】
- identity: ≤2 条
- facts: ≤3 条
- preferences: ≤3 条
- tasks: ≤2 条
- constraints: ≤2 条
- skills: ≤2 条
- 总计 ≤8 条

【强制要求】
如果提取结果超过 8 条，请只保留最重要的 8 条，其余丢弃。

【合并规则】
禁止拆分细粒度事实，应合并为一条：
错误："今汐有叠层机制"、"守岸人能回血"、"维里奈能闪避"
正确："游戏包含多种角色机制（叠层爆发、护盾、闪避等）"

Output this exact structure:
{"identity":[],"facts":[],"preferences":[],"tasks":[],"constraints":[],"skills":[]}

Each array contains objects with: {"content":"中文内容","importance":0.7}

Rules:
- importance: number 0.7 to 1.0 (minimum 0.7)
- content: Chinese text only, minimum 10 characters
- Empty categories: []
- NO other fields
- NO thinking tags
- NO markdown
- Start with { end with }`;

      const userPrompt = `Extract from this conversation. Output JSON now.

${conversation}

JSON:`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.0,
          max_tokens: 4000,
          stream: false,
          chat_template_kwargs: { enable_thinking: false },
        }),
      });

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status}`);
      }

      const data = await response.json();
      const message = data.choices?.[0]?.message;
      let content = message?.content || '';
      
      if (!content && message?.reasoning_content) {
        console.log('[MemoryExtraction] 检测到 reasoning_content，尝试从中提取 JSON');
        content = this.extractJsonFromReasoning(message.reasoning_content);
      }
      
      console.log('[MemoryExtraction] LLM 原始响应长度:', content.length);
      console.log('[MemoryExtraction] finish_reason:', data.choices?.[0]?.finish_reason);
      
      if (data.choices?.[0]?.finish_reason === 'length') {
        console.warn('[MemoryExtraction] 警告: 输出被 max_tokens 截断');
      }
      
      return this.parseExtractionResponse(content);
    } catch (error) {
      console.error('[MemoryExtraction] LLM 调用失败:', error);
      return null;
    }
  }

  private parseExtractionResponse(response: string): any {
    const trimmed = response.trim();
    
    console.log('[MemoryExtraction] 尝试解析响应, 前100字符:', trimmed.substring(0, 100));
    
    let jsonStr = this.extractJsonString(trimmed);
    
    if (!jsonStr || jsonStr.length < 2) {
      console.error('[MemoryExtraction] 无法提取 JSON 字符串');
      return null;
    }
    
    try {
      const parsed = JSON.parse(jsonStr);
      
      if (!parsed.identity) parsed.identity = [];
      if (!parsed.facts) parsed.facts = [];
      if (!parsed.preferences) parsed.preferences = [];
      if (!parsed.tasks) parsed.tasks = [];
      if (!parsed.constraints) parsed.constraints = [];
      if (!parsed.skills) parsed.skills = [];
      
      return parsed;
    } catch (e) {
      console.error('[MemoryExtraction] JSON 解析失败:', e);
      console.error('[MemoryExtraction] 提取的 JSON 字符串:', jsonStr.substring(0, 500));
      return null;
    }
  }

  private extractJsonFromReasoning(reasoningContent: string): string {
    const jsonMarkers = ['"identity":', '"facts":', '"preferences":', '"tasks":', '"constraints":', '"skills":'];
    
    for (const marker of jsonMarkers) {
      const markerIndex = reasoningContent.indexOf(marker);
      if (markerIndex !== -1) {
        let startIndex = markerIndex;
        while (startIndex > 0 && reasoningContent[startIndex] !== '{') {
          startIndex--;
        }
        
        if (startIndex >= 0 && reasoningContent[startIndex] === '{') {
          const endBrace = reasoningContent.lastIndexOf('}');
          if (endBrace > startIndex) {
            const result = reasoningContent.substring(startIndex, endBrace + 1);
            console.log('[MemoryExtraction] 从 reasoning_content 提取的 JSON 长度:', result.length);
            return result;
          }
        }
      }
    }
    
    const lastBrace = reasoningContent.lastIndexOf('}');
    if (lastBrace !== -1) {
      let braceCount = 1;
      let startIndex = lastBrace - 1;
      while (startIndex >= 0 && braceCount > 0) {
        if (reasoningContent[startIndex] === '}') braceCount++;
        if (reasoningContent[startIndex] === '{') braceCount--;
        startIndex--;
      }
      
      if (braceCount === 0) {
        const result = reasoningContent.substring(startIndex + 1, lastBrace + 1);
        console.log('[MemoryExtraction] 从 reasoning_content 提取的 JSON 长度:', result.length);
        return result;
      }
    }
    
    console.log('[MemoryExtraction] 无法从 reasoning_content 提取 JSON');
    return '';
  }

  private extractJsonString(text: string): string {
    let trimmed = text.trim();
    
    const thinkEnd = trimmed.indexOf('</think');
    if (thinkEnd !== -1) {
      const afterThink = trimmed.indexOf('>', thinkEnd);
      if (afterThink !== -1) {
        trimmed = trimmed.substring(afterThink + 1).trim();
      }
    }
    
    const startBrace = trimmed.indexOf('{');
    if (startBrace !== -1) {
      let braceCount = 0;
      let endBrace = -1;
      
      for (let i = startBrace; i < trimmed.length; i++) {
        if (trimmed[i] === '{') braceCount++;
        if (trimmed[i] === '}') braceCount--;
        
        if (braceCount === 0) {
          endBrace = i;
          break;
        }
      }
      
      if (endBrace > startBrace) {
        return trimmed.substring(startBrace, endBrace + 1);
      }
    }
    
    const startBracket = trimmed.indexOf('[');
    if (startBracket !== -1) {
      let bracketCount = 0;
      let endBracket = -1;
      
      for (let i = startBracket; i < trimmed.length; i++) {
        if (trimmed[i] === '[') bracketCount++;
        if (trimmed[i] === ']') bracketCount--;
        
        if (bracketCount === 0) {
          endBracket = i;
          break;
        }
      }
      
      if (endBracket > startBracket) {
        return trimmed.substring(startBracket, endBracket + 1);
      }
    }
    
    if (trimmed.startsWith('```json')) {
      const content = trimmed.substring(7);
      const end = content.indexOf('```');
      return (end > 0 ? content.substring(0, end) : content).trim();
    }
    
    if (trimmed.startsWith('```')) {
      const content = trimmed.substring(3);
      const end = content.indexOf('```');
      return (end > 0 ? content.substring(0, end) : content).trim();
    }
    
    return trimmed;
  }

  private convertToCandidates(
    extracted: any,
    sessionId: string,
    messages: ConversationMessage[]
  ): CandidateMemory[] {
    const messageIds = messages.map(m => m.id || crypto.randomUUID());

    const stats = {
      原始数量: 0,
      importance过滤: 0,
      长度过滤: 0,
      字符去重前: 0,
      字符去重后: 0,
      语义去重后: 0,
      类型均衡后: 0,
      最终数量: 0,
    };

    const rawCandidates: CandidateMemory[] = [];

    const processItems = (items: any[], memoryType: string) => {
      for (const item of items) {
        stats.原始数量++;
        
        const contentHash = this.normalizeContent(item.content);
        if (this.processedContentHashes.has(contentHash)) {
          continue;
        }
        
        this.processedContentHashes.add(contentHash);
        
        rawCandidates.push({
          id: crypto.randomUUID(),
          content: item.content?.trim() || '',
          memoryType: memoryType as any,
          confidence: 0.5,
          sourceSessionId: sessionId,
          sourceMessageIds: messageIds,
          createdAt: Date.now(),
          status: 'pending',
          importance: typeof item.importance === 'number' ? item.importance : 0.5,
        });
      }
    };

    if (Array.isArray(extracted.identity)) processItems(extracted.identity, 'identity');
    if (Array.isArray(extracted.facts)) processItems(extracted.facts, 'fact');
    if (Array.isArray(extracted.preferences)) processItems(extracted.preferences, 'preference');
    if (Array.isArray(extracted.tasks)) processItems(extracted.tasks, 'task');
    if (Array.isArray(extracted.constraints)) processItems(extracted.constraints, 'constraint');
    if (Array.isArray(extracted.skills)) processItems(extracted.skills, 'skill');

    let candidates = rawCandidates.filter(c => {
      if (c.importance < 0.7) {
        stats.importance过滤++;
        return false;
      }
      return true;
    });

    candidates = candidates.filter(c => {
      if (c.content.length < 10) {
        stats.长度过滤++;
        return false;
      }
      return true;
    });

    stats.字符去重前 = candidates.length;
    const charUnique = new Map<string, CandidateMemory>();
    for (const c of candidates) {
      const key = this.normalizeContent(c.content);
      if (!charUnique.has(key)) {
        charUnique.set(key, c);
      }
    }
    candidates = Array.from(charUnique.values());
    stats.字符去重后 = candidates.length;

    candidates = this.semanticDedup(candidates);
    stats.语义去重后 = candidates.length;

    candidates.sort((a, b) => this.calculateScore(b) - this.calculateScore(a));

    candidates = this.balanceTypes(candidates);
    stats.类型均衡后 = candidates.length;

    const finalCandidates = candidates.slice(0, 8);
    stats.最终数量 = finalCandidates.length;

    const avgImportance = finalCandidates.length > 0
      ? (finalCandidates.reduce((sum, c) => sum + c.importance, 0) / finalCandidates.length).toFixed(2)
      : '0.00';

    console.log('[MemoryExtraction] 质量统计:', {
      ...stats,
      平均importance: avgImportance,
    });

    return finalCandidates;
  }

  private normalizeContent(content: string): string {
    return content
      .toLowerCase()
      .replace(/[^\u4e00-\u9fa5a-z0-9]/g, '')
      .trim();
  }

  private semanticDedup(candidates: CandidateMemory[]): CandidateMemory[] {
    const result: CandidateMemory[] = [];

    for (const c of candidates) {
      const isDuplicate = result.some(existing =>
        this.calculateSimilarity(existing.content, c.content) > 0.75
      );

      if (!isDuplicate) {
        result.push(c);
      }
    }

    return result;
  }

  private calculateSimilarity(a: string, b: string): number {
    const getNgrams = (text: string, n = 2): Set<string> => {
      const grams = new Set<string>();
      const cleaned = text.toLowerCase().replace(/\s+/g, '');
      for (let i = 0; i < cleaned.length - n + 1; i++) {
        grams.add(cleaned.slice(i, i + n));
      }
      return grams;
    };

    const gramsA = getNgrams(a);
    const gramsB = getNgrams(b);

    if (gramsA.size === 0 || gramsB.size === 0) return 0;

    const intersection = new Set([...gramsA].filter(x => gramsB.has(x)));
    const union = new Set([...gramsA, ...gramsB]);

    return intersection.size / union.size;
  }

  private calculateScore(c: CandidateMemory): number {
    const lengthScore = Math.min(c.content.length / 50, 1);
    return c.importance * 0.7 + lengthScore * 0.3;
  }

  private balanceTypes(candidates: CandidateMemory[]): CandidateMemory[] {
    const limits: Record<string, number> = {
      identity: 2,
      fact: 3,
      preference: 3,
      task: 2,
      constraint: 2,
      skill: 2,
    };

    const result: CandidateMemory[] = [];
    const counts: Record<string, number> = {};

    for (const c of candidates) {
      const type = c.memoryType;
      counts[type] = counts[type] || 0;

      if (counts[type] < (limits[type] || 2)) {
        result.push(c);
        counts[type]++;
      }

      if (result.length >= 8) break;
    }

    return result;
  }

  cancelPendingExtraction(): void {
    if (this.pendingExtraction) {
      clearTimeout(this.pendingExtraction);
      this.pendingExtraction = null;
    }
  }
}

export const memoryExtractionService = new MemoryExtractionService();
