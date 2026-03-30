import { MemoryModelConfig, DEFAULT_MEMORY_MODEL_CONFIG, MemoryType } from '../../types';

const MEMORY_EXTRACTION_PROMPT = `你是一个"用户长期记忆提取器"。

你的任务：
从对话中提取【可以长期保存的用户信息】。

--------------------------------
【只允许提取以下4类】

1. identity（身份特征）
- 稳定身份信息
- 【最高优先级】：用户的姓名、职业、长期居住地。必须优先提取！
- 如：职业、年龄、教育背景等

2. preference（用户偏好）
- 长期兴趣、喜好
- 如：喜欢摄影、喜欢科幻电影

3. constraint（限制条件）
- 会影响决策的条件
- 如：预算、健康问题、过敏、饮食限制

4. fact（用户事实）
- 与用户直接相关的客观事实
- 如：有一只猫、家人情况、居住地

--------------------------------
【严禁提取以下内容】

❌ 模型推断（非常重要）
- 如："擅长摄影"、"会使用招聘网站"

❌ 常识 / 世界知识
- 如："杭州夏天很热"、"杭州工作机会多"

❌ 对话任务 / 短期计划
- 如："正在找工作"、"准备买房"、"学习React"

❌ AI生成内容
- 只能基于用户原话

❌ 问题或疑问句
- 如："你喜欢什么？"、"你有什么爱好？"

--------------------------------
【示例解析 (Few-Shot)】

输入：
用户: 嘿！终于下班了，今天累死了。
用户: 对了，我养的那只金毛最近特别调皮，老是咬我的拖鞋 😂
用户: 你平时喜欢宠物吗？
用户: 说到妹妹，她学的是会计。

输出：
[
  {"type":"fact","span":"我养的那只金毛最近特别调皮","resolvedText":"用户养的橘猫最近特别调皮","sourceText":"对了，我养的那只金毛最近特别调皮，老是咬我的拖鞋 😂","confidence":0.95},
  {"type":"fact","span":"她学的是会计","resolvedText":"用户的妹妹学的是会计","sourceText":"说到妹妹，她学的是会计。","confidence":0.95}
]

【错误示范 (Anti-Pattern)】
❌ 错误输出1：将 span 改写成 "家里养了金毛" （违反规则1，span必须是原文连续子串）
❌ 错误输出2：包含无意义后缀源 "我这记性哈哈" （不需要保留无实际意义语气后缀）
❌ 错误输出3：提取 "今天累死了"（属于短期状态，违反规则）
❌ 错误输出4：resolvedText 指代不明，如 "她学的是会计"（必须在 resolvedText 中替换为具体对象，如"用户的妹妹"）

--------------------------------
【核心规则 - 必须遵守】

1. span 必须是用户原话的"连续子串"（原文复制，不能改写）
2. resolvedText 必须把 span 中的代词（他/她/它/这）替换为具体的实体对象（如"用户的妹妹"）。
3. sourceText 必须包含 span
4. 绝对不允许在此任务外推断、总结无关内容
5. 如果找不到合适的 span，不要输出该记忆
6. confidence 必须 >= 0.7
7. 只从"用户:"开头的消息中提取，不要从"助手:"消息中提取

--------------------------------
【输出格式（严格JSON）】

[
  {
    "type": "identity | preference | constraint | fact",
    "span": "必须是用户原话的连续子串（不能改写）",
    "resolvedText": "消除代词后的完整句意（如：用户的妹妹学的是会计）",
    "sourceText": "用户原话（必须包含 span）",
    "confidence": 0.7~1.0
  }
]

--------------------------------
如果不确定，直接忽略该信息。`;

const USER_PROMPT_SUFFIX = `

从以上对话中提取用户记忆。
【重要】span 必须是用户原话的连续子串，不能改写。
直接输出JSON数组：`;

export interface ParsedMemory {
  type: MemoryType;
  span: string;
  resolvedText?: string;
  sourceText: string;
  importance: number;
  embedding?: number[];
}

export class MultiPassParser {
  private readonly VALID_TYPES = ['identity', 'preference', 'constraint', 'fact'];

  parse(text: string): ParsedMemory[] {
    const jsonResult = this.jsonParse(text);
    if (jsonResult.length > 0) {
      console.log('[MemoryParser] JSON parse matched:', jsonResult.length);
      return jsonResult;
    }

    const lineResult = this.lineParse(text);
    if (lineResult.length > 0) {
      console.log('[MemoryParser] Line parse matched:', lineResult.length);
      return lineResult;
    }

    const fallbackResult = this.fallbackParse(text);
    console.log('[MemoryParser] Fallback parse matched:', fallbackResult.length);
    return fallbackResult;
  }

  private jsonParse(text: string): ParsedMemory[] {
    const results: ParsedMemory[] = [];
    
    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) return results;

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      
      if (!Array.isArray(parsed)) return results;

      for (const item of parsed) {
        if (!item.type) continue;
        
        const type = item.type.toLowerCase();
        if (!this.VALID_TYPES.includes(type)) continue;

        const span = (item.span || item.content || '').trim();
        if (!span) continue;

        const sourceText = (item.sourceText || span).trim();
        const resolvedText = (item.resolvedText || '').trim();

        const confidence = typeof item.confidence === 'number' 
          ? Math.max(0.7, Math.min(1.0, item.confidence))
          : 0.75;

        results.push({
          type: type as MemoryType,
          span: span,
          resolvedText: resolvedText || undefined,
          sourceText: sourceText,
          importance: confidence,
        });
      }
    } catch (e) {
      console.warn('[MemoryParser] JSON parse failed:', e);
    }

    return results;
  }

  private lineParse(text: string): ParsedMemory[] {
    const regex = /^\[(identity|preference|constraint|fact)\]\s*(.+?)\s*\|\s*(0\.[0-9]+|1\.0)\s*$/;
    const results: ParsedMemory[] = [];

    for (const line of text.split('\n')) {
      const match = line.trim().match(regex);
      if (match) {
        const span = match[2].trim();
        results.push({
          type: match[1] as MemoryType,
          span: span,
          sourceText: span,
          importance: parseFloat(match[3]),
        });
      }
    }

    return results;
  }

  private fallbackParse(text: string): ParsedMemory[] {
    const keywords = ['用户', '偏好', '喜欢', '使用', '项目', '约束'];
    const results: ParsedMemory[] = [];

    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.length < 10) continue;

      if (keywords.some(kw => trimmed.includes(kw))) {
        results.push({
          type: 'fact',
          span: trimmed,
          sourceText: trimmed,
          importance: 0.75,
        });
      }
    }

    return results.slice(0, 8);
  }
}

export class SafeExtractor {
  private readonly MAX_MEMORIES = 8;
  private readonly MIN_CONTENT_LENGTH = 2;
  private readonly MAX_CONTENT_LENGTH = 100;
  private readonly VALID_TYPES = new Set(['identity', 'preference', 'constraint', 'fact']);

  private seenContents: Set<string> = new Set();

  extract(memories: ParsedMemory[]): ParsedMemory[] {
    const validMemories: ParsedMemory[] = [];

    for (const memory of memories) {
      const validation = this.validate(memory);
      if (!validation.valid) {
        console.warn('[SafeExtract] Rejected:', validation.reason, memory);
        continue;
      }

      const normalized = this.normalizeContent(memory.resolvedText || memory.span);
      if (this.seenContents.has(normalized)) {
        console.warn('[SafeExtract] Duplicate rejected:', memory.resolvedText || memory.span);
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

    if (memory.span.length < this.MIN_CONTENT_LENGTH) {
      return { valid: false, reason: `Content too short: ${memory.span.length}` };
    }

    if (memory.span.length > this.MAX_CONTENT_LENGTH) {
      return { valid: false, reason: `Content too long: ${memory.span.length}` };
    }

    if (this.containsGarbage(memory.span)) {
      return { valid: false, reason: 'Content contains garbage characters' };
    }

    if (this.isAITask(memory.span)) {
      return { valid: false, reason: 'Content is AI task, not user memory' };
    }

    if (this.isVagueDescription(memory.span)) {
      return { valid: false, reason: 'Content is too vague' };
    }

    return { valid: true };
  }

  private isAITask(content: string): boolean {
    const aiTaskPatterns = [
      /^帮助/,
      /^为用户/,
      /^给用户/,
      /^推荐/,
      /^了解并/,
      /^制定/,
      /^提供/,
      /^建议/,
      /^整理/,
      /^规划/,
      /希望得到/,
      /希望获得/,
      /想要获取/,
      /需要.*方案/,
      /需要.*资源/,
    ];

    return aiTaskPatterns.some(pattern => pattern.test(content));
  }

  private isVagueDescription(content: string): boolean {
    const vaguePatterns = [
      /一些/,
      /某些/,
      /相关/,
      /等信息/,
      /等内容/,
      /^用户有/,
      /^用户需要/,
    ];

    return vaguePatterns.some(pattern => pattern.test(content));
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
