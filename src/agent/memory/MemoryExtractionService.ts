import { TauriMemoryClient } from './TauriMemoryClient';
import { CandidateMemory, ConversationMessage, ExtractionConfig } from '../../types';

const DEFAULT_EXTRACTION_CONFIG: ExtractionConfig = {
  minMessageCount: 4,
  minConversationLength: 200,
  skipToolCallMessages: true,
};

export interface MemoryExtractionCallbacks {
  onCandidatesExtracted?: (candidates: CandidateMemory[]) => void;
  onExtractionError?: (error: Error) => void;
}

class MemoryExtractionService {
  private callbacks: MemoryExtractionCallbacks = {};
  private isExtracting = false;
  private pendingExtraction: NodeJS.Timeout | null = null;

  setCallbacks(callbacks: MemoryExtractionCallbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
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

    const fullConfig = { ...DEFAULT_EXTRACTION_CONFIG, ...config };

    console.log('[MemoryExtraction] 检查提取条件:', {
      messageCount: messages.length,
      minMessageCount: fullConfig.minMessageCount,
      totalLength: messages.reduce((sum, m) => sum + m.content.length, 0),
      minLength: fullConfig.minConversationLength,
    });

    try {
      const shouldExtract = await TauriMemoryClient.shouldExtractMemories(messages, fullConfig);
      
      if (!shouldExtract) {
        console.log('[MemoryExtraction] 不满足提取条件，跳过');
        return null;
      }

      this.isExtracting = true;
      console.log('[MemoryExtraction] 开始提取记忆...');

      const conversationText = this.formatConversationForExtraction(messages);
      
      const extracted = await this.callLLMForExtraction(conversationText);
      
      if (!extracted) {
        console.log('[MemoryExtraction] LLM 未返回有效结果');
        return null;
      }

      const candidates = this.convertToCandidates(extracted, sessionId, messages);
      
      if (candidates.length === 0) {
        console.log('[MemoryExtraction] 没有提取到有效记忆');
        return null;
      }

      for (const candidate of candidates) {
        await TauriMemoryClient.addCandidateMemory(candidate);
      }

      console.log('[MemoryExtraction] 提取完成，添加了', candidates.length, '条候选记忆');
      
      this.callbacks.onCandidatesExtracted?.(candidates);
      
      return candidates;
    } catch (error) {
      console.error('[MemoryExtraction] 提取失败:', error);
      this.callbacks.onExtractionError?.(error instanceof Error ? error : new Error(String(error)));
      return null;
    } finally {
      this.isExtracting = false;
    }
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
      const apiUrl = localStorage.getItem('lmStudioUrl') || 'http://localhost:1234/v1/chat/completions';
      const modelName = localStorage.getItem('modelName') || 'local-model';
      
      const systemPrompt = `# 核心指令
[STRICT] 你是一个高效的数据提取函数，严禁进行任何推理、自检、解释或草拟过程。
[FORMAT] 你的输出必须以 "{" 开头，以 "}" 结尾。
[WARNING] 任何 JSON 以外的文字都会导致程序崩溃。跳过思考过程，直接生成 JSON。

OUTPUT JSON ONLY. NO THINKING. NO EXPLANATIONS. NO MARKDOWN. NO REASONING.

Output this exact structure:
{"identity":[],"facts":[],"preferences":[],"tasks":[],"constraints":[],"skills":[]}

Each array contains objects with: {"content":"中文内容","importance":0.5}

Rules:
- importance: number 0.0 to 1.0
- content: Chinese text only
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
          max_tokens: 5000,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      
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
    const endBrace = trimmed.lastIndexOf('}');
    if (startBrace !== -1 && endBrace !== -1 && endBrace > startBrace) {
      return trimmed.substring(startBrace, endBrace + 1);
    }
    
    const startBracket = trimmed.indexOf('[');
    const endBracket = trimmed.lastIndexOf(']');
    if (startBracket !== -1 && endBracket !== -1 && endBracket > startBracket) {
      return trimmed.substring(startBracket, endBracket + 1);
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
    const candidates: CandidateMemory[] = [];
    const messageIds = messages.map(m => m.id || crypto.randomUUID());

    const processItems = (items: any[], memoryType: string) => {
      for (const item of items) {
        if (!item.content || typeof item.content !== 'string' || item.content.trim().length < 5) continue;
        
        const confidence = this.calculateConfidence(item.content, memoryType, messages.length);
        
        candidates.push({
          id: crypto.randomUUID(),
          content: item.content.trim(),
          memoryType: memoryType as any,
          confidence,
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
    if (Array.isArray(extracted.tasks)) {
      for (const task of extracted.tasks) {
        if (!task.content || typeof task.content !== 'string' || task.content.trim().length < 5) continue;
        
        const confidence = this.calculateConfidence(task.content, 'task', messages.length);
        
        candidates.push({
          id: crypto.randomUUID(),
          content: task.content.trim(),
          memoryType: 'task',
          confidence,
          sourceSessionId: sessionId,
          sourceMessageIds: messageIds,
          createdAt: Date.now(),
          status: 'pending',
          importance: typeof task.importance === 'number' ? task.importance : 0.6,
        });
      }
    }
    if (Array.isArray(extracted.constraints)) processItems(extracted.constraints, 'constraint');
    if (Array.isArray(extracted.skills)) processItems(extracted.skills, 'skill');

    return candidates;
  }

  private calculateConfidence(content: string, memoryType: string, messageCount: number): number {
    let confidence = 0.5;

    if (content.length > 20) confidence += 0.1;
    if (content.length > 50) confidence += 0.05;
    if (messageCount > 1) confidence += 0.1;
    if (messageCount > 3) confidence += 0.05;
    if (memoryType === 'identity' || memoryType === 'preference') confidence += 0.1;
    if (memoryType === 'constraint') confidence += 0.05;

    return Math.min(confidence, 1.0);
  }

  cancelPendingExtraction(): void {
    if (this.pendingExtraction) {
      clearTimeout(this.pendingExtraction);
      this.pendingExtraction = null;
    }
  }
}

export const memoryExtractionService = new MemoryExtractionService();
