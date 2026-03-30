import { MemoryType } from '../../types';

export interface FilterInput {
  type: string;
  span: string;
  resolvedText?: string;
  sourceText: string;
  confidence: number;
}

export interface FilteredMemory {
  type: MemoryType;
  content: string;
  confidence: number;
}

const STRONG_SIGNALS = [
  "喜欢", "是", "有", "做", "用", "学", "看", "写",
  "想", "希望", "打算", "养", "住", "在", "去", "来",
  "爱", "会", "能", "要", "买", "玩", "吃", "听", "读",
  "姓", "叫", "名字", "专业", "毕业", "实习", "学历", "学校", "老家", "本地", "长居"
];


const GARBAGE_WORDS = ["很好", "不错", "可以", "还行", "一般"];

const INVALID_PATTERNS = [
  /^我(很好|还好|不错|可以)$/,
  /^(很好|不错|可以)$/,
  /^我(很|比较|特别).{0,2}$/
];

const IDENTITY_KEYWORDS = [
  "工程师", "程序员", "设计师", "学生", "老师",
  "产品经理", "医生", "律师", "会计", "销售",
  "经理", "总监", "主管", "CEO", "创始人",
  "作家", "博主", "摄影师", "架构师", "分析师",
  "研究生", "博士", "本科生", "高中生", "大学生",
  "护士", "自由职业"
];

const IDENTITY_ACTIONS = [
  "写代码", "开发", "做前端", "做后端", "做AI",
  "做产品", "做运营", "做设计", "做测试"
];

export function filterMemories(memories: FilterInput[]): FilteredMemory[] {
  return memories
    .filter(typeValidation)
    .filter(basicValidation)
    .filter(questionFilter)
    .filter(confidenceThreshold)
    .filter(evidenceValidation)
    .filter(sourceTextValidation)
    .filter(strictSpanValidation)
    .filter(identityStrictValidation)
    .filter(factStrictValidation)
    .filter(removeWorldKnowledge)
    .filter(removeInference)
    .filter(removeShortTermTask)
    .filter(emotionFilter)
    .filter(deduplicate)
    .map(m => ({
      type: m.type as MemoryType,
      content: m.resolvedText || m.span,
      confidence: m.confidence
    }));
}

function typeValidation(m: FilterInput): boolean {
  const VALID_TYPES: MemoryType[] = ['identity', 'preference', 'constraint', 'fact'];
  return VALID_TYPES.includes(m.type as MemoryType);
}

function basicValidation(m: FilterInput): boolean {
  if (!m.span || m.span.trim().length < 2) return false;
  if (m.span.length > 50) return false;
  
  if (INVALID_PATTERNS.some(p => p.test(m.span))) {
    // If it's a useless span but we have a well-formed resolvedText, we can perhaps let it pass
    if (!m.resolvedText || m.resolvedText.length < 4) {
      console.warn('[MemoryFilter] Rejected: low information density');
      return false;
    }
  }
  
  if (!hasSignalWord(m)) {
    console.warn('[MemoryFilter] Rejected: no valid signal');
    return false;
  }
  
  return true;
}

function questionFilter(m: FilterInput): boolean {
  if (m.span.includes('？') || m.span.includes('?')) {
    console.warn('[MemoryFilter] Rejected: contains question mark');
    return false;
  }
  
  const questionPatterns = [
    /你知道吗/, /你知道/, /有没有/, /是不是/, /能不能/,
    /怎么样/, /什么/, /怎么/, /哪里/, /哪个/, /多少/,
    /你觉得/, /你认为/, /你平时/, /你有/
  ];
  
  if (questionPatterns.some(p => p.test(m.span))) {
    console.warn('[MemoryFilter] Rejected: question pattern detected');
    return false;
  }
  
  return true;
}

function hasSignalWord(m: FilterInput): boolean {
  const span = m.span;

  if (STRONG_SIGNALS.some(w => span.includes(w))) return true;

  if (/^[a-zA-Z0-9+#.]+$/.test(span)) return true;

  if (m.type === 'preference' || m.type === 'fact') {
    if (/^[\u4e00-\u9fa5]{2,10}$/.test(span)) {
      if (!GARBAGE_WORDS.includes(span)) return true;
    }

    const placePatterns = [
      /去[\u4e00-\u9fa5]+/,  
      /在[\u4e00-\u9fa5]+/,  
      /来[\u4e00-\u9fa5]+/,  
      /回[\u4e00-\u9fa5]+/,  
      /住[\u4e00-\u9fa5]+/,  
    ];
    if (placePatterns.some(p => p.test(span))) return true;

    const timePatterns = [
      /明年/, /今年/, /去年/, /周末/, /每天/, /每周/,
      /早上/, /晚上/, /周末/, /假期/, /三个月/, /三年/
    ];
    if (timePatterns.some(p => p.test(span))) return true;

    const nounPatterns = [
      /猫/, /狗/, /宠物/, /公司/, /工作/, /家/, /朋友/,
      /吉他/, /咖啡/, /书/, /电影/, /音乐/, /摄影/,
      /闺蜜/, /室友/, /奶奶/, /爷爷/, /父母/
    ];
    if (nounPatterns.some(p => p.test(span))) return true;
  }

  if (m.type === 'identity') {
    if (IDENTITY_KEYWORDS.some(k => span.includes(k) || (m.resolvedText && m.resolvedText.includes(k)))) return true;
    if (IDENTITY_ACTIONS.some(k => span.includes(k) || (m.resolvedText && m.resolvedText.includes(k)))) return true;
  }

  return false;
}

function confidenceThreshold(m: FilterInput): boolean {
  return m.confidence >= 0.7;
}

function evidenceValidation(m: FilterInput): boolean {
  if (!m.sourceText) {
    console.warn('[MemoryFilter] Rejected: missing sourceText');
    return false;
  }
  if (m.sourceText.trim().length < 2) {
    console.warn('[MemoryFilter] Rejected: sourceText too short');
    return false;
  }
  return true;
}

function sourceTextValidation(m: FilterInput): boolean {
  const normalizedSource = m.sourceText.trim().toLowerCase();
  
  const aiPrefixes = ['助手:', 'ai:', 'assistant:'];
  if (aiPrefixes.some(prefix => normalizedSource.startsWith(prefix))) {
    console.warn('[MemoryFilter] Rejected: sourceText from AI response');
    return false;
  }
  
  return true;
}

function normalizeForMatch(text: string): string {
  return text
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/，/g, ",")
    .replace(/。/g, ".")
    .replace(/：/g, ":")
    .replace(/；/g, ";")
    .replace(/！/g, "!")
    .replace(/？/g, "?")
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[———]/g, "-")
    .replace(/、/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}

function includesWithBoundary(source: string, span: string): boolean {
  const lowerSource = source.toLowerCase();
  const lowerSpan = span.toLowerCase();

  const index = lowerSource.indexOf(lowerSpan);
  if (index === -1) return false;

  const after = lowerSource[index + lowerSpan.length];

  const isBoundary = (char?: string) =>
    !char || /[\s,.;:()（）]/.test(char);

  return isBoundary(after);
}

function lcs(s1: string, s2: string): string {
  const m = s1.length, n = s2.length;
  let dp = Array.from({length: m + 1}, () => new Array(n + 1).fill(0));
  let maxLength = 0, endIndex = 0;
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
        if (dp[i][j] > maxLength) {
          maxLength = dp[i][j];
          endIndex = i - 1;
        }
      } else {
        dp[i][j] = 0;
      }
    }
  }
  
  if (maxLength === 0) return "";
  return s1.substring(endIndex - maxLength + 1, endIndex + 1);
}

function fuzzyMatch(source: string, span: string): { matched: boolean; correctedSpan?: string } {
  const normalizedSource = normalizeForMatch(source);
  let normalizedSpan = normalizeForMatch(span);
  
  normalizedSpan = normalizedSpan.replace(/[.?!！？，,；;：:]+$/, '');
  
  if (normalizedSource.includes(normalizedSpan)) {
    return { matched: true, correctedSpan: normalizedSpan };
  }
  
  const prefixes = ['我', '我的', '用户', '我们', '其实', '就是', '虽然', '现在'];
  for (const prefix of prefixes) {
    if (normalizedSpan.startsWith(prefix)) {
      const spanWithoutPrefix = normalizedSpan.slice(prefix.length);
      if (spanWithoutPrefix.length >= 2 && normalizedSource.includes(spanWithoutPrefix)) {
        return { matched: true, correctedSpan: spanWithoutPrefix };
      }
    }
  }
  
  for (const prefix of prefixes) {
    const spanWithPrefix = prefix + normalizedSpan;
    if (normalizedSource.includes(spanWithPrefix)) {
      return { matched: true, correctedSpan: spanWithPrefix };
    }
  }
  
  const suffixes = ['的', '了', '着', '过'];
  for (const suffix of suffixes) {
    const spanWithSuffix = normalizedSpan + suffix;
    if (normalizedSource.includes(spanWithSuffix)) {
      return { matched: true, correctedSpan: spanWithSuffix };
    }
  }
  
  const corePatterns = [
    /住在([\u4e00-\u9fa5]+)/,
    /在([\u4e00-\u9fa5]+工作)/,
    /是([\u4e00-\u9fa5]+)/,
    /有([\u4e00-\u9fa5]+)/,
    /喜欢([\u4e00-\u9fa5]+)/,
  ];
  
  for (const pattern of corePatterns) {
    const match = normalizedSpan.match(pattern);
    if (match && match[1]) {
      const core = match[1];
      if (core.length >= 2 && normalizedSource.includes(core)) {
        return { matched: true, correctedSpan: core };
      }
    }
  }
  
  const words = normalizedSpan.split(/[，,。.！!？?；;：:]/).filter(w => w.trim().length >= 4);
  for (const word of words) {
    if (normalizedSource.includes(word.trim())) {
      return { matched: true, correctedSpan: word.trim() };
    }
  }

  const lcsStr = lcs(normalizedSource, normalizedSpan);
  if (lcsStr.length >= 2 && lcsStr.length / normalizedSpan.length >= 0.5) {
     return { matched: true, correctedSpan: lcsStr };
  }
  
  return { matched: false };
}

function strictSpanValidation(m: FilterInput): boolean {
  if (!m.sourceText) return false;

  const result = fuzzyMatch(m.sourceText, m.span);
  
  if (!result.matched) {
    console.warn('[MemoryFilter] Rejected: not exact span or boundary violation');
    console.warn('  span:', normalizeForMatch(m.span));
    console.warn('  source:', normalizeForMatch(m.sourceText));
    return false;
  }

  if (result.correctedSpan) {
    m.span = result.correctedSpan;
  }

  return true;
}

function identityStrictValidation(m: FilterInput): boolean {
  if (m.type !== 'identity') return true;
  
  if (!m.sourceText) return false;
  
  const result = fuzzyMatch(m.sourceText, m.span);
  
  if (!result.matched) {
    console.warn('[MemoryFilter] Rejected identity: not exact match');
    return false;
  }
  
  const hasKeyword = IDENTITY_KEYWORDS.some(k => m.span.includes(k));
  const hasAction = IDENTITY_ACTIONS.some(k => m.span.includes(k));
  
  if (!hasKeyword && !hasAction) {
    console.warn('[MemoryFilter] Rejected identity: no identity keyword or action');
    return false;
  }
  
  return true;
}

function factStrictValidation(m: FilterInput): boolean {
  if (m.type !== 'fact') return true;
  
  if (!m.sourceText) return false;
  
  const result = fuzzyMatch(m.sourceText, m.span);
  
  if (!result.matched) {
    console.warn('[MemoryFilter] Rejected fact: not exact match');
    return false;
  }
  
  return true;
}

function removeWorldKnowledge(m: FilterInput): boolean {
  const worldKnowledgeKeywords = [
    "杭州", "北京", "上海", "深圳", "广州", "成都", "武汉", "南京",
    "市场", "行业", "就业环境", "发展前景", "经济", "政策"
  ];

  const hasWorldKnowledge = worldKnowledgeKeywords.some(word => m.span.includes(word));

  if (!hasWorldKnowledge) return true;

  const userAnchors = ["我", "我的", "家", "在", "住", "工作", "生活", "用户"];

  const hasUserAnchor = userAnchors.some(word => m.span.includes(word));

  return hasUserAnchor;
}

function removeInference(m: FilterInput): boolean {
  const blacklist = [
    "擅长", "精通", "熟练", "专业", "专家", "经验丰富",
    "能力强", "水平高"
  ];
  return !blacklist.some(word => m.span.includes(word));
}

function removeShortTermTask(m: FilterInput): boolean {
  const shortTimeWords = [
    "下周", "下个月", "明天", "后天", "这周", "最近几天", "今晚", "早上"
  ];
  
  const eventWords = [
    "过生日", "开会", "面试", "考试", "约会", "聚餐", "出差", "放假"
  ];
  
  const hasShortTime = shortTimeWords.some(word => m.span.includes(word));
  const hasEvent = eventWords.some(word => m.span.includes(word));
  
  if (hasShortTime && hasEvent) {
    console.warn('[MemoryFilter] Rejected: short-term event detected');
    return false;
  }
  
  const taskKeywords = [
    "正在", "计划", "打算", "准备", "即将", "将要"
  ];
  
  return !taskKeywords.some(word => m.span.includes(word));
}

function emotionFilter(m: FilterInput): boolean {
  const emotionKeywords = [
    '焦虑', '害怕', '担心', '压力', '紧张', '不安', '恐惧', '忧虑',
    '烦躁', '郁闷', '沮丧', '失落', '伤心', '难过', '痛苦'
  ];
  
  const hasEmotion = emotionKeywords.some(word => m.span.includes(word));
  
  if (hasEmotion) {
    console.warn('[MemoryFilter] Rejected: emotion keyword detected');
    return false;
  }
  
  return true;
}

function deduplicate(
  m: FilterInput,
  index: number,
  arr: FilterInput[]
): boolean {
  const normalizedContent = semanticNormalize(m.resolvedText || m.span);
  
  if (normalizedContent.length < 4) return false;
  
  return (
    index ===
    arr.findIndex(
      x => {
        if (x.type !== m.type) return false;
        
        const xNormalized = semanticNormalize(x.resolvedText || x.span);
        
        if (xNormalized === normalizedContent) return true;
        
        if (xNormalized.includes(normalizedContent) || normalizedContent.includes(xNormalized)) {
          return true;
        }
        
        const similarity = calculateSimilarity(normalizedContent, xNormalized);
        return similarity > 0.8;
      }
    )
  );
}

function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  
  if (longer.includes(shorter)) {
    return shorter.length / longer.length;
  }
  
  let commonChars = 0;
  const shorterSet = new Set(shorter.split(''));
  for (const char of longer) {
    if (shorterSet.has(char)) commonChars++;
  }
  
  return commonChars / longer.length;
}

function semanticNormalize(content: string): string {
  return content
    .replace(/我(很|特别|比较|非常)?/g, "")
    .replace(/用户/g, "")
    .replace(/喜欢|热爱|爱好|感兴趣|钟爱|偏爱/g, "喜欢")
    .replace(/拍照|摄影|拍摄/g, "摄影")
    .replace(/看电影|观影/g, "看电影")
    .replace(/非常|特别|比较|相当|十分|很/g, "")
    .replace(/其实|就是|还有个奇怪的习惯——/g, "")
    .replace(/\s+/g, "")
    .trim();
}
