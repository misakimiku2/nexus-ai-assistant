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
      
      const extractionPrompt = this.buildExtractionPrompt(conversationText);
      
      const extracted = await this.callLLMForExtraction(extractionPrompt);
      
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

  private buildExtractionPrompt(conversation: string): string {
    return `你是一个高级认知记忆提取系统（Cognitive Memory Extraction Engine）。

你的任务是从对话中提取"长期有价值的信息"，用于构建用户的长期记忆模型。

⚠️ 注意：
- 不要提取临时信息
- 不要依赖任何特定用户背景
- 所有示例仅用于说明结构，不代表当前用户

--------------------------------
【输入对话】
${conversation}
--------------------------------

请提取以下6类记忆，并以 JSON 输出：

{
  "identity": [],
  "facts": [],
  "preferences": [],
  "tasks": [],
  "constraints": [],
  "skills": []
}

--------------------------------
【定义】

1️⃣ identity（身份特征）
长期稳定的用户背景、角色或定位

示例：
- "用户从事软件开发"
- "用户是内容创作者"

--------------------------------

2️⃣ facts（事实）
用户提到的客观信息（项目、工具、环境）

示例：
- "用户正在开发一个Web应用"
- "用户使用本地模型进行AI开发"

--------------------------------

3️⃣ preferences（偏好）
用户的选择倾向或习惯

示例：
- "用户偏好简单直接的解决方案"
- "用户倾向使用本地部署而非云服务"

--------------------------------

4️⃣ tasks（任务）
用户正在进行的任务，必须使用结构化格式：

{
  "content": "任务描述",
  "status": "pending | in_progress | done",
  "progress": "当前进展（可选）",
  "next_step": "下一步（尽量推测）"
}

示例：
{
  "content": "开发一个AI助手",
  "status": "in_progress",
  "progress": "已完成基础对话功能",
  "next_step": "实现记忆模块"
}

--------------------------------

5️⃣ constraints（限制）
用户的限制、资源约束或能力边界

示例：
- "用户计算资源有限"
- "用户时间有限"

--------------------------------

6️⃣ skills（能力）
用户具备的能力或行为模式

示例：
- "用户具备基础编程能力"
- "用户能够使用AI工具辅助开发"

--------------------------------

【评分规则】

每条记忆必须包含：

{
  "content": "...",
  "importance": 0.0 - 1.0
}

--------------------------------

【去重与抽象】

- 避免重复
- 优先抽象而不是复述
- 提取"长期有价值"的信息

--------------------------------

【输出要求】

- 必须是合法 JSON
- 无解释文本
- 空类别返回 []

--------------------------------

现在开始提取。`;
  }

  private async callLLMForExtraction(prompt: string): Promise<any> {
    try {
      const apiUrl = localStorage.getItem('lmStudioUrl') || 'http://localhost:1234/v1/chat/completions';
      const modelName = localStorage.getItem('modelName') || 'local-model';
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      
      return this.parseExtractionResponse(content);
    } catch (error) {
      console.error('[MemoryExtraction] LLM 调用失败:', error);
      return null;
    }
  }

  private parseExtractionResponse(response: string): any {
    const trimmed = response.trim();
    
    let jsonStr = trimmed;
    if (trimmed.startsWith('```json')) {
      const end = trimmed.indexOf('```', 7);
      jsonStr = trimmed.substring(7, end > 0 ? end : trimmed.length).trim();
    } else if (trimmed.startsWith('```')) {
      const end = trimmed.indexOf('```', 3);
      jsonStr = trimmed.substring(3, end > 0 ? end : trimmed.length).trim();
    }

    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error('[MemoryExtraction] JSON 解析失败:', e);
      return null;
    }
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
        if (!item.content || item.content.trim().length < 5) continue;
        
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
          importance: item.importance || 0.5,
        });
      }
    };

    if (extracted.identity) processItems(extracted.identity, 'identity');
    if (extracted.facts) processItems(extracted.facts, 'fact');
    if (extracted.preferences) processItems(extracted.preferences, 'preference');
    if (extracted.tasks) {
      for (const task of extracted.tasks) {
        if (!task.content || task.content.trim().length < 5) continue;
        
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
          importance: task.importance || 0.6,
        });
      }
    }
    if (extracted.constraints) processItems(extracted.constraints, 'constraint');
    if (extracted.skills) processItems(extracted.skills, 'skill');

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
