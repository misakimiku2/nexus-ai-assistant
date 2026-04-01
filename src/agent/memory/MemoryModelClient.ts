import { MemoryModelConfig, DEFAULT_MEMORY_MODEL_CONFIG, MemoryType } from '../../types';

export interface SmallModelConfig {
  enabled: boolean;
  strictThreshold: number;
  relaxedThreshold: number;
  maxRetries: number;
  preferRuleBased: boolean;
  useSimplifiedPrompt: boolean;
}

export const MODEL_CONFIGS: Record<string, SmallModelConfig> = {
  'qwen2.5-3b': {
    enabled: true,
    strictThreshold: 0.65,
    relaxedThreshold: 0.55,
    maxRetries: 2,
    preferRuleBased: true,
    useSimplifiedPrompt: true,
  },
  'qwen2.5-3b-instruct': {
    enabled: true,
    strictThreshold: 0.65,
    relaxedThreshold: 0.55,
    maxRetries: 2,
    preferRuleBased: true,
    useSimplifiedPrompt: true,
  },
  'qwen2.5-7b': {
    enabled: true,
    strictThreshold: 0.70,
    relaxedThreshold: 0.60,
    maxRetries: 1,
    preferRuleBased: false,
    useSimplifiedPrompt: false,
  },
  'qwen2.5-7b-instruct': {
    enabled: true,
    strictThreshold: 0.70,
    relaxedThreshold: 0.60,
    maxRetries: 1,
    preferRuleBased: false,
    useSimplifiedPrompt: false,
  },
  'default': {
    enabled: false,
    strictThreshold: 0.75,
    relaxedThreshold: 0.70,
    maxRetries: 1,
    preferRuleBased: false,
    useSimplifiedPrompt: false,
  }
};

export function getModelConfig(modelName: string): SmallModelConfig {
  const normalizedName = modelName.toLowerCase();
  for (const [key, config] of Object.entries(MODEL_CONFIGS)) {
    if (normalizedName.includes(key.toLowerCase())) {
      return config;
    }
  }
  return MODEL_CONFIGS['default'];
}

const SIMPLIFIED_EXTRACTION_PROMPT = `从用户消息中提取记忆。输出 JSON 数组。

规则:
1. 只提取明确的事实、偏好、身份、约束
2. span 必须是原话的连续子串
3. 不确定时输出空数组 []

类型: identity(身份), preference(偏好), constraint(约束), fact(事实)

格式: [{"type":"类型","span":"原话子串","confidence":0.8}]

示例:
用户: 我是 UI 设计师。
输出: [{"type":"identity","span":"我是 UI 设计师","confidence":0.9}]

用户: 我不吃香菜。
输出: [{"type":"preference","span":"我不吃香菜","confidence":0.9}]

用户: 你觉得我应该去旅行吗？
输出: []

SOURCE: `;
const MEMORY_EXTRACTION_PROMPT = `你是一个记忆抽取器。

任务：从「单条用户消息」中严格抽取高置信度的记忆候选，仅输出严格的 JSON 数组，且该 JSON 必须完整位于 <<<MEMORY>>> 与 <<<END>>> 之间。

格式与严格要求：
1) 输入：系统会以 SOURCE: <用户原话> 的形式传入单条消息。
2) 输出字段："type" (identity|preference|constraint|fact), "span", "resolvedText"（可选，不超过 30 字，字面化归一化），"sourceText"（必须与传入的 SOURCE 完全相同），"confidence"（0.7 - 1.0；严格模式下推荐 >= 0.75）。
3) "span" 必须是 SOURCE 文本的连续子串（证据锚点），不得改写或补充信息。
4) 若无可提取记忆，请仅返回空数组 []。
5) 禁止输出任何额外解释、分析或非 JSON 内容。
6) 严格避免基于常识的推断或语义扩写；仅提取字面上可证的事实/偏好/身份/约束。

正例（严格）：
SOURCE: 我是 UI 设计师，已经做了三年。
<<<MEMORY>>>
[{"type":"identity","span":"我是 UI 设计师","resolvedText":"是 UI 设计师","sourceText":"我是 UI 设计师，已经做了三年。","confidence":0.95}]
<<<END>>>

SOURCE: 我不吃香菜。
<<<MEMORY>>>
[{"type":"preference","span":"我不吃香菜","resolvedText":"不吃香菜","sourceText":"我不吃香菜。","confidence":0.90}]
<<<END>>>

SOURCE: 我的生日是 1990-06-15。
<<<MEMORY>>>
[{"type":"fact","span":"1990-06-15","resolvedText":"出生于 1990 年 6 月 15 日","sourceText":"我的生日是 1990-06-15。","confidence":0.92}]
<<<END>>>

SOURCE: 我每周只能在周末接单。
<<<MEMORY>>>
[{"type":"constraint","span":"每周只能在周末接单","resolvedText":"每周只在周末接单","sourceText":"我每周只能在周末接单。","confidence":0.88}]
<<<END>>>

负例（严格，不应抽取）:
SOURCE: 你觉得我应该去旅行吗？
<<<MEMORY>>>
[]
<<<END>>>

SOURCE: 你说得挺有道理的，我也这么觉得。
<<<MEMORY>>>
[]
<<<END>>>

SOURCE: 我可能想去理塘，但请不了假也买不起机票。
<<<MEMORY>>>
[]
<<<END>>>

说明：当用户表达疑问、请求、态度或不确定性时，严格模式应返回空数组，避免误将问句、建议或评论当成记忆。`;

const RELAXED_MEMORY_EXTRACTION_PROMPT = `你是一个记忆抽取器。

任务：从「单条用户消息」中提取可能的记忆候选，允许在不确定时也列出潜在事实，但务必在每个候选上给出 confidence（0.0 - 1.0）。

规则（relaxed）：
1) 只处理单条用户消息（系统会把该条消息作为 SOURCE: ... 传入）。
2) 推荐仍提供 "span" 字段（尽量为原话的连续子串），如需裁剪请尽量保留字面证据。
3) 输出字段："type" (identity|preference|constraint|fact), "span", "resolvedText" (可选), "sourceText" (必须等于传入的 SOURCE 文本), "confidence" (0.0~1.0)。
4) 如果没有任何可提取候选，请输出空数组 []。
5) 返回的 JSON 必须位于标记 <<<MEMORY>>> 与 <<<END>>> 之间，仅该范围内允许输出 JSON。

示例（relaxed）：
SOURCE: 我最近在肝《艾尔登法环》，死了快两百次了。
<<<MEMORY>>>
[{"type":"fact","span":"最近在肝《艾尔登法环》","resolvedText":"正在玩《艾尔登法环》","sourceText":"我最近在肝《艾尔登法环》，死了快两百次了。","confidence":0.7}]
<<<END>>>

低置信示例（relaxed 针对含有不确定/犹豫/问句的片段）：
SOURCE: 我可能想去理塘，但请不了假也买不起机票。
<<<MEMORY>>>
[{"type":"constraint","span":"去理塘？想是想，但请不了假，机票也贵，还是等年假吧。","resolvedText":"想去理塘，但受制于请假/机票","sourceText":"我可能想去理塘，但请不了假也买不起机票。","confidence":0.4}]
<<<END>>>

负例（relaxed 仍应避免）：
SOURCE: 你觉得我该怎么办？
<<<MEMORY>>>
[]
<<<END>>>

SOURCE: 那个人真聪明。
<<<MEMORY>>>
[]
<<<END>>>

说明：relaxed 用于提升召回，但请用置信度区分确定性。当文本包含词汇如“可能、想是想、要不要、请不了假、也许”等不确定性或询问语气时，请将对应候选的 "confidence" 设为较低值（例如 <= 0.5），以便后端或规则优先过滤不确定候选。`;

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
  subject?: string;
  predicate?: string;
  confidence?: number;
  duration?: 'permanent' | '7d' | '24h' | 'session';
  isUpdate?: boolean;
}

export class MultiPassParser {
  private readonly VALID_TYPES = ['identity', 'preference', 'constraint', 'fact', 'rule', 'experience', 'skill', 'error'];

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

    const xmlResult = this.xmlParse(text);
    if (xmlResult.length > 0) {
      console.log('[MemoryParser] XML parse matched:', xmlResult.length);
      return xmlResult;
    }

    const kvResult = this.kvParse(text);
    if (kvResult.length > 0) {
      console.log('[MemoryParser] KV parse matched:', kvResult.length);
      return kvResult;
    }

    const regexResult = this.regexParse(text);
    if (regexResult.length > 0) {
      console.log('[MemoryParser] Regex parse matched:', regexResult.length);
      return regexResult;
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
          ? Math.min(1.0, Math.max(0.0, item.confidence))
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
    const regex = /^\[(identity|preference|constraint|fact|rule|experience|skill|error)\]\s*(.+?)\s*\|\s*(0\.[0-9]+|1\.0)\s*$/;
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

  private xmlParse(text: string): ParsedMemory[] {
    const results: ParsedMemory[] = [];
    const regex = /<memory\s+type=["']?(identity|preference|constraint|fact|rule|experience|skill|error)["']?\s*(?:confidence=["']?(0\.[0-9]+|1\.0)["']?)?\s*>([^<]+)<\/memory>/gi;
    
    let match;
    while ((match = regex.exec(text)) !== null) {
      const type = match[1].toLowerCase();
      const confidence = match[2] ? parseFloat(match[2]) : 0.75;
      const span = match[3].trim();
      
      if (span && this.VALID_TYPES.includes(type)) {
        results.push({
          type: type as MemoryType,
          span: span,
          sourceText: span,
          importance: confidence,
        });
      }
    }

    return results;
  }

  private kvParse(text: string): ParsedMemory[] {
    const results: ParsedMemory[] = [];
    const lines = text.split('\n');
    
    let currentType: string | null = null;
    let currentSpan: string | null = null;
    let currentConfidence = 0.75;

    for (const line of lines) {
      const trimmed = line.trim();
      
      const typeMatch = trimmed.match(/^(?:type|类型)[:\s]+(identity|preference|constraint|fact|rule|experience|skill|error)/i);
      if (typeMatch) {
        currentType = typeMatch[1].toLowerCase();
        continue;
      }
      
      const spanMatch = trimmed.match(/^(?:span|内容|摘要)[:\s]+(.+)$/i);
      if (spanMatch) {
        currentSpan = spanMatch[1].trim();
        continue;
      }
      
      const confMatch = trimmed.match(/^(?:confidence|置信度)[:\s]+(0\.[0-9]+|1\.0)/i);
      if (confMatch) {
        currentConfidence = parseFloat(confMatch[1]);
        continue;
      }
      
      if (currentType && currentSpan && this.VALID_TYPES.includes(currentType)) {
        results.push({
          type: currentType as MemoryType,
          span: currentSpan,
          sourceText: currentSpan,
          importance: currentConfidence,
        });
        currentType = null;
        currentSpan = null;
        currentConfidence = 0.75;
      }
    }

    if (currentType && currentSpan && this.VALID_TYPES.includes(currentType)) {
      results.push({
        type: currentType as MemoryType,
        span: currentSpan,
        sourceText: currentSpan,
        importance: currentConfidence,
      });
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

  // regexParse: try to capture common factual patterns when model outputs are empty
  private regexParse(text: string): ParsedMemory[] {
    const results: ParsedMemory[] = [];
    const patterns: Array<{type: MemoryType; regex: RegExp}> = [
      { type: 'identity', regex: /我养了(?:一只|个)?[\u4e00-\u9fa5A-Za-z0-9"\'\s\-]{1,30}叫[\u4e00-\u9fa5A-Za-z0-9]+/ },
      { type: 'fact', regex: /我最近刚搬到[\s\S]{0,80}工作/ },
      { type: 'fact', regex: /我以前在[\s\S]{0,60}工作/ },
      { type: 'fact', regex: /我妈|我爸爸|我父亲|我母亲/ },
      { type: 'fact', regex: /我转行|现在做.*(文案|设计|开发)/ },
      { type: 'preference', regex: /我喜欢|我不喜欢|我偏好/ },
    ];

    for (const p of patterns) {
      const m = text.match(p.regex);
      if (m && m[0]) {
        const span = m[0].trim();
        results.push({
          type: p.type,
          span: span,
          sourceText: span,
          importance: 0.6,
        });
      }
    }

    return results.slice(0, 6);
  }
}

export class SafeExtractor {
  private readonly MAX_MEMORIES = 8;
  private readonly MIN_CONTENT_LENGTH = 2;
  private readonly MAX_CONTENT_LENGTH = 100;
  private readonly VALID_TYPES = new Set(['identity', 'preference', 'constraint', 'fact', 'rule', 'experience', 'skill', 'error']);

  private seenContents: Set<string> = new Set();
  private readonly SIMILARITY_THRESHOLD = 0.85;
  private readonly SPECIFIC_ENTITY_PATTERNS = [
    /叫[\u4e00-\u9fa5A-Za-z0-9]{1,10}$/, 
    /名为[\u4e00-\u9fa5A-Za-z0-9]{1,10}$/,
    /名字是[\u4e00-\u9fa5A-Za-z0-9]{1,10}$/,
  ];

  extract(memories: ParsedMemory[], options?: { minImportance?: number; rejectInterrogative?: boolean; sourceText?: string }): ParsedMemory[] {
    const validMemories: ParsedMemory[] = [];
    const minImportance = typeof options?.minImportance === 'number' ? options!.minImportance! : 0.6;
    const rejectInterrogative = options?.rejectInterrogative !== false;
    const sourceText = options?.sourceText;

    for (const memory of memories) {
      const validation = this.validate(memory, { minImportance, rejectInterrogative, sourceText });
      if (!validation.valid) {
        console.warn('[SafeExtract] Rejected:', validation.reason, memory);
        continue;
      }

      if (sourceText && this.detectHallucination(memory, sourceText)) {
        console.warn('[SafeExtract] Hallucination detected:', memory.span);
        continue;
      }

      const normalized = this.normalizeContent(memory.resolvedText || memory.span);

      let isDuplicate = false;
      for (const seen of this.seenContents) {
        if (this.isSimilar(normalized, seen)) {
          isDuplicate = true;
          break;
        }
      }
      if (isDuplicate) {
        console.warn('[SafeExtract] Duplicate (fuzzy) rejected:', memory.resolvedText || memory.span);
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

  private detectHallucination(memory: ParsedMemory, sourceText: string): boolean {
    if (!sourceText || !memory.span) return false;

    const span = memory.span.trim();
    const source = sourceText.trim();

    if (!source.includes(span)) {
      const normalizedSource = this.normalizeForMatch(source);
      const normalizedSpan = this.normalizeForMatch(span);
      
      if (!normalizedSource.includes(normalizedSpan)) {
        const sourceEntities = this.extractEntities(source);
        const spanEntities = this.extractEntities(span);
        
        for (const entity of spanEntities) {
          if (!sourceEntities.includes(entity) && this.isSpecificEntity(entity)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private extractEntities(text: string): string[] {
    const entities: string[] = [];
    
    const namePatterns = [
      /叫([^\s，。！？,\.!?]{1,10})/g,
      /名为([^\s，。！？,\.!?]{1,10})/g,
      /名字是([^\s，。！？,\.!?]{1,10})/g,
      /是([^\s，。！？,\.!?]{1,10})设计师/g,
      /在([^\s，。！？,\.!?]{1,20})工作/g,
    ];

    for (const pattern of namePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        if (match[1]) {
          entities.push(match[1].trim());
        }
      }
    }

    return entities;
  }

  private isSpecificEntity(text: string): boolean {
    if (text.length < 2 || text.length > 20) return false;
    
    for (const pattern of this.SPECIFIC_ENTITY_PATTERNS) {
      if (pattern.test(text)) return true;
    }
    
    if (/^[\u4e00-\u9fa5]{2,4}$/.test(text)) {
      return true;
    }
    
    return false;
  }

  private validate(memory: ParsedMemory, options?: { minImportance?: number; rejectInterrogative?: boolean; sourceText?: string }): { valid: boolean; reason?: string } {
    if (!this.VALID_TYPES.has(memory.type)) {
      return { valid: false, reason: `Invalid type: ${memory.type}` };
    }

    const minImportance = typeof options?.minImportance === 'number' ? options!.minImportance! : 0.6;
    const rejectInterrogative = options?.rejectInterrogative !== false;

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

    // Confidence-based filtering
    if (typeof memory.importance === 'number') {
      if (memory.importance < minImportance) {
        return { valid: false, reason: `Low importance: ${memory.importance}` };
      }
    }

    // Reject interrogative or second-person spans which are likely user questions/addresses
    if (rejectInterrogative) {
      const span = (memory.span || '').trim();
      if (/[？\?]/.test(span)) return { valid: false, reason: 'Interrogative span' };
      // if starts with second-person pronoun and does not mention self, reject
      if (/^\s*[你您你们]/.test(span) && !/我|我的/.test(span)) return { valid: false, reason: 'Second-person span' };
      // common conversational evaluation phrases are not memories (e.g. '你说得挺实在的')
      if (/你说得|你觉得|你平时|你有|你会/.test(span) && !/我|我(的|是)/.test(span)) return { valid: false, reason: 'Conversational comment' };
    }

    // Strict: span must be a continuous substring of sourceText (or at least fuzzy-match)
    if (memory.sourceText && memory.sourceText.length > 0) {
      if (!this.verifySpanInSource(memory.span, memory.sourceText)) {
        return { valid: false, reason: 'Span not found in sourceText' };
      }
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

  // Levenshtein distance for fuzzy duplicate detection
  private levenshteinDistance(a: string, b: string): number {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;

    const v0 = new Array(n + 1);
    const v1 = new Array(n + 1);
    for (let j = 0; j <= n; j++) v0[j] = j;

    for (let i = 0; i < m; i++) {
      v1[0] = i + 1;
      for (let j = 0; j < n; j++) {
        const cost = a.charAt(i) === b.charAt(j) ? 0 : 1;
        v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
      }
      for (let j = 0; j <= n; j++) v0[j] = v1[j];
    }

    return v1[n];
  }

  private similarityRatio(a: string, b: string): number {
    if (!a && !b) return 1;
    const lev = this.levenshteinDistance(a, b);
    const max = Math.max(a.length, b.length);
    if (max === 0) return 1;
    return 1 - lev / max;
  }

  private isSimilar(a: string, b: string): boolean {
    try {
      const ratio = this.similarityRatio(a, b);
      return ratio >= this.SIMILARITY_THRESHOLD;
    } catch (e) {
      return false;
    }
  }

  private normalizeForMatch(text: string): string {
    if (!text) return '';

    // remove zero-width and BOM
    let s = text.replace(/[\u200B-\u200D\uFEFF]/g, '');

    // remove various quote characters and corner brackets
    s = s.replace(/["'“”‘’«»‹›「」『』【】]/g, '');

    // normalize full/half width parentheses
    s = s.replace(/（/g, '(').replace(/）/g, ')');

    // remove common punctuation and symbols
    s = s.replace(/[，,。.!！？?；;：:、·•\-—–\/\\]+/g, '');

    // collapse whitespace
    s = s.replace(/\s+/g, ' ').trim().toLowerCase();

    return s;
  }

  private verifySpanInSource(span: string, source: string): boolean {
    if (!span || !source) return false;
    // fast exact match
    if (source.includes(span)) return true;

    const sNorm = this.normalizeForMatch(source);
    const spanNorm = this.normalizeForMatch(span);

    // direct normalized substring
    if (sNorm && spanNorm && sNorm.includes(spanNorm)) return true;

    // whitespace-agnostic match (collapse all spaces)
    const sNoSpace = sNorm.replace(/\s+/g, '');
    const spanNoSpace = spanNorm.replace(/\s+/g, '');
    if (sNoSpace && spanNoSpace && sNoSpace.includes(spanNoSpace)) return true;

    // try removing common leading particles from span and re-check
    const prefixes = ['我', '我的', '其实', '就是', '现在', '最近'];
    for (const p of prefixes) {
      if (spanNorm.startsWith(p) && spanNorm.length - p.length >= 2) {
        const cut = spanNorm.slice(p.length).trim();
        if (sNorm.includes(cut) || sNoSpace.includes(cut.replace(/\s+/g, ''))) return true;
      }
    }

    // split into clauses and check shorter parts (allow shorter matches for Chinese)
    const parts = spanNorm.split(/[，,。.！!？?；;：:()\-\n\r]+/).map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
      if (!part) continue;
      const isChinese = /[\u4e00-\u9fa5]/.test(part);
      const minLen = isChinese ? 2 : 4;
      if (part.length >= minLen) {
        if (sNorm.includes(part) || sNoSpace.includes(part.replace(/\s+/g, ''))) return true;
      }
    }

    // sliding window fallback: look for any contiguous substring of spanNoSpace in source
    const L = Math.min(6, Math.max(2, Math.floor(spanNoSpace.length)));
    for (let len = L; len >= 2; len--) {
      for (let i = 0; i + len <= spanNoSpace.length; i++) {
        const sub = spanNoSpace.slice(i, i + len);
        if (sub.length >= 2 && sNoSpace.includes(sub)) return true;
      }
    }

    return false;
  }

  reset(): void {
    this.seenContents.clear();
  }
}

export class MemoryModelClient {
  private config: MemoryModelConfig;
  private parser: MultiPassParser;
  private safeExtractor: SafeExtractor;
  private modelConfig: SmallModelConfig;

  constructor(config?: Partial<MemoryModelConfig>) {
    this.config = { ...DEFAULT_MEMORY_MODEL_CONFIG, ...config };
    this.parser = new MultiPassParser();
    this.safeExtractor = new SafeExtractor();
    this.modelConfig = getModelConfig(this.config.modelName);
  }

  updateConfig(config: Partial<MemoryModelConfig>): void {
    this.config = { ...this.config, ...config };
    this.modelConfig = getModelConfig(this.config.modelName);
  }

  getConfig(): MemoryModelConfig {
    return this.config;
  }

  getModelConfig(): SmallModelConfig {
    return this.modelConfig;
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

  async extractCandidates(conversation: string, sourceMessage?: string): Promise<ParsedMemory[]> {
    this.safeExtractor.reset();

    const strictPrompt = this.modelConfig.useSimplifiedPrompt ? SIMPLIFIED_EXTRACTION_PROMPT : MEMORY_EXTRACTION_PROMPT;
    const relaxedPrompt = this.modelConfig.useSimplifiedPrompt ? SIMPLIFIED_EXTRACTION_PROMPT : RELAXED_MEMORY_EXTRACTION_PROMPT;
    const strictThreshold = this.modelConfig.strictThreshold;
    const relaxedThreshold = this.modelConfig.relaxedThreshold;

    if (this.modelConfig.preferRuleBased && sourceMessage) {
      const ruleBased = this.parser.parse(sourceMessage);
      if (ruleBased.length > 0) {
        for (const p of ruleBased) {
          p.sourceText = sourceMessage.trim();
        }
        const safeRuleBased = this.safeExtractor.extract(ruleBased, { minImportance: strictThreshold, rejectInterrogative: true });
        if (safeRuleBased.length > 0) {
          console.log('[MemoryModelClient] Rule-based extraction matched:', safeRuleBased.length);
          return safeRuleBased;
        }
      }
    }

    const strictRes = await this.callModel(conversation, { temperature: 0.0, prompt: strictPrompt });
    if (!strictRes) {
      console.log('[MemoryModelClient] No output from strict model call');
      return [];
    }

    console.log('[MemoryModelClient] Raw model output (strict) length:', strictRes.raw ? strictRes.raw.length : 0);
    const parsedStrict = this.parser.parse(strictRes.extracted || strictRes.raw || '');

    for (const p of parsedStrict) {
      p.sourceText = sourceMessage?.trim() || (p.sourceText || p.span || '').trim();
    }

    const safeStrict = this.safeExtractor.extract(parsedStrict, { minImportance: strictThreshold, rejectInterrogative: true });
    if (safeStrict.length > 0) {
      console.log('[MemoryModelClient] Extraction complete (strict):', { parsed: parsedStrict.length, safe: safeStrict.length });
      return safeStrict;
    }

    console.log('[MemoryModelClient] Strict pass returned no safe candidates — running relaxed pass');
    const relaxedRes = await this.callModel(conversation, { temperature: 0.15, prompt: relaxedPrompt });
    if (!relaxedRes) {
      console.log('[MemoryModelClient] No output from relaxed model call');
      return [];
    }

    console.log('[MemoryModelClient] Raw model output (relaxed) length:', relaxedRes.raw ? relaxedRes.raw.length : 0);
    const parsedRelaxed = this.parser.parse(relaxedRes.extracted || relaxedRes.raw || '');

    for (const p of parsedRelaxed) {
      p.sourceText = sourceMessage?.trim() || (p.sourceText || p.span || '').trim();
    }

    const merged = [...parsedStrict, ...parsedRelaxed];
    const seen = new Set<string>();
    const mergedUnique: ParsedMemory[] = [];
    for (const m of merged) {
      const key = (m.span || '').trim().slice(0, 200);
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      mergedUnique.push(m);
    }

    if (mergedUnique.length === 0 && sourceMessage) {
      console.log('[MemoryModelClient] No merged candidates — running direct parse on sourceMessage');
      const fromSource = this.parser.parse(sourceMessage);
      for (const p of fromSource) {
        p.sourceText = sourceMessage.trim();
        mergedUnique.push(p);
      }
    }

    const safe = this.safeExtractor.extract(mergedUnique, { minImportance: relaxedThreshold, rejectInterrogative: true });
    console.log('[MemoryModelClient] Extraction complete (relaxed):', { parsed: mergedUnique.length, safe: safe.length });
    return safe;
  }

  // Debug helper: return raw model outputs (strict and relaxed) plus parsed candidates
  async debugExtract(conversation: string, sourceMessage?: string): Promise<any> {
    this.safeExtractor.reset();
    const result: any = {
      strict: null,
      relaxed: null,
      parsedStrict: [],
      parsedRelaxed: [],
      safeStrict: [],
      safeRelaxed: [],
      mergedUnique: [],
      finalSafe: [],
    };

    const strictRes = await this.callModel(conversation, { temperature: 0.0, prompt: MEMORY_EXTRACTION_PROMPT });
    result.strict = strictRes ? { raw: strictRes.raw, extracted: strictRes.extracted } : null;
    const parsedStrict = strictRes ? this.parser.parse(strictRes.extracted || strictRes.raw || '') : [];
    for (const p of parsedStrict) p.sourceText = sourceMessage?.trim() || (p.sourceText || p.span || '').trim();
    result.parsedStrict = parsedStrict;
    result.safeStrict = this.safeExtractor.extract(parsedStrict, { minImportance: 0.75, rejectInterrogative: true });

    if (result.safeStrict && result.safeStrict.length > 0) {
      result.finalSafe = result.safeStrict;
      return result;
    }

    // relaxed fallback
    const relaxedRes = await this.callModel(conversation, { temperature: 0.15, prompt: RELAXED_MEMORY_EXTRACTION_PROMPT });
    result.relaxed = relaxedRes ? { raw: relaxedRes.raw, extracted: relaxedRes.extracted } : null;
    const parsedRelaxed = relaxedRes ? this.parser.parse(relaxedRes.extracted || relaxedRes.raw || '') : [];
    for (const p of parsedRelaxed) p.sourceText = sourceMessage?.trim() || (p.sourceText || p.span || '').trim();
    result.parsedRelaxed = parsedRelaxed;
    // use a preview extractor for debug-safeRelaxed to avoid mutating main extractor seen state
    const previewExtractor = new SafeExtractor();
    result.safeRelaxed = previewExtractor.extract(parsedRelaxed, { minImportance: 0.7, rejectInterrogative: true });

    const merged = [...(parsedStrict || []), ...(parsedRelaxed || [])];
    const seen = new Set<string>();
    const mergedUnique: ParsedMemory[] = [];
    for (const m of merged) {
      const key = (m.span || '').trim().slice(0, 200);
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      mergedUnique.push(m);
    }

    if (mergedUnique.length === 0 && sourceMessage) {
      const fromSource = this.parser.parse(sourceMessage);
      for (const p of fromSource) {
        p.sourceText = sourceMessage.trim();
        mergedUnique.push(p);
      }
    }

    result.mergedUnique = mergedUnique;
    result.finalSafe = this.safeExtractor.extract(mergedUnique, { minImportance: 0.7, rejectInterrogative: true });
    return result;
  }

  private async callModel(conversation: string, opts?: { temperature?: number; prompt?: string; }): Promise<{ extracted: string; raw: string } | null> {
    try {
      const url = `${this.config.baseUrl}/chat/completions`;
      const promptToUse = opts?.prompt || MEMORY_EXTRACTION_PROMPT;
      const temperature = typeof opts?.temperature === 'number' ? opts!.temperature : 0.0;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.modelName,
          messages: [
            { role: 'system', content: promptToUse },
            { role: 'user', content: conversation }
          ],
          temperature: temperature,
          max_tokens: Math.min(this.config.maxTokens || 800, 800),
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      // If model wrapped JSON in markers, extract that region for parsing, but keep full content
      const startMarker = '<<<MEMORY>>>';
      const endMarker = '<<<END>>>';
      let extracted = content;
      const sIdx = content.indexOf(startMarker);
      const eIdx = content.lastIndexOf(endMarker);
      if (sIdx !== -1 && eIdx !== -1 && eIdx > sIdx) {
        extracted = content.slice(sIdx + startMarker.length, eIdx).trim();
      }

      console.log('[MemoryModelClient] Model raw output length:', content.length);

      return { extracted: extracted, raw: content };
    } catch (error) {
      console.error('[MemoryModelClient] Model call failed:', error);
      return null;
    }
  }
}

export const memoryModelClient = new MemoryModelClient();
