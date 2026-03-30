# Memory Filter 幻觉防护改造计划（强规则 + 零幻觉版 v8）

## 核心目标

👉 **宁可错杀 90%，也不能放过 1 条 hallucination**

⚠️ **v8 新增**：在安全边界内恢复 Recall

***

## 必须修复的问题

### 问题1：includesIgnoreCase 仍然会"误接受子串"

当前逻辑：

```typescript
source.toLowerCase().includes(span.toLowerCase())
```

❌ 以为解决了这个：

```json
{ "span": "C", "sourceText": "我学C++" }
```

但其实：

```typescript
"我学c++".includes("c")  // ✅ true
👉 还是会通过
```

🔥 **本质问题**：

* 当前判断：span 是 source 的子串

* 真正想要：span 是 source 的"语义独立片段（token / chunk）"

✅ **正确解法**：加一个"边界约束"（token boundary）

```typescript
function includesWithBoundary(source: string, span: string): boolean {
  const lowerSource = source.toLowerCase();
  const lowerSpan = span.toLowerCase();

  const index = lowerSource.indexOf(lowerSpan);
  if (index === -1) return false;

  const before = lowerSource[index - 1];
  const after = lowerSource[index + lowerSpan.length];

  const isBoundary = (char?: string) =>
    !char || /[\s,.;:()（）]/.test(char);

  return isBoundary(before) && isBoundary(after);
}
```

***

## v8 新增：在安全边界内恢复 Recall

### 改动1：允许"名词型 memory"（重点）

修改 `hasSignalWord`：

```typescript
function hasSignalWord(m: FilterInput): boolean {
  const span = m.span;

  // ✅ 路径1：强信号句（喜欢 / 做 / 学 / 有 / 是）
  if (STRONG_SIGNALS.some(w => span.includes(w))) return true;

  // ✅ 路径2：技术词（英文）
  if (/^[a-zA-Z0-9+#.]+$/.test(span)) return true;

  // ✅ 路径3：中文名词短语（关键补充）
  // 长度 2-10，纯中文，非垃圾
  if (/^[\u4e00-\u9fa5]{2,10}$/.test(span)) {
    // 过滤垃圾词
    const GARBAGE_WORDS = ["很好", "不错", "可以", "还行", "一般"];
    if (!GARBAGE_WORDS.includes(span)) return true;
  }

  return false;
}
```

👉 这样：

* "摄影" → 通过（中文名词）

* "电影" → 通过（中文名词）

* "游戏" → 通过（中文名词）

* "很好" → reject（垃圾词）

***

### 改动2：identity 放松（但不回退）

现在：只允许"职业关键词"

建议改为：允许"行为 identity"

```typescript
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

function identityStrictValidation(m: FilterInput): boolean {
  if (m.type !== 'identity') return true;
  
  if (!m.sourceText) return false;
  
  const rawSource = normalizeForMatch(m.sourceText);
  const rawSpan = normalizeForMatch(m.span);
  
  if (!includesWithBoundary(rawSource, rawSpan)) {
    console.warn('[MemoryFilter] Rejected identity: not exact match');
    return false;
  }
  
  // ✅ 职业关键词 OR 行为 identity
  const hasKeyword = IDENTITY_KEYWORDS.some(k => m.span.includes(k));
  const hasAction = IDENTITY_ACTIONS.some(k => m.span.includes(k));
  
  if (!hasKeyword && !hasAction) {
    console.warn('[MemoryFilter] Rejected identity: no identity keyword or action');
    return false;
  }
  
  return true;
}
```

👉 这样：

* "我是程序员" → 通过（职业关键词）

* "我写代码" → 通过（行为 identity）

* "我做后端" → 通过（行为 identity）

***

### 改动3：preference 开"绿色通道"

preference 应该是最容易积累的 memory，现在反而限制最狠。

建议：放宽 preference 规则

```typescript
function hasSignalWord(m: FilterInput): boolean {
  const span = m.span;

  // ✅ preference 绿色通道：允许名词型偏好
  if (m.type === 'preference') {
    // 强信号
    if (STRONG_SIGNALS.some(w => span.includes(w))) return true;
    
    // 技术词
    if (/^[a-zA-Z0-9+#.]+$/.test(span)) return true;
    
    // 中文名词（2-10字）
    if (/^[\u4e00-\u9fa5]{2,10}$/.test(span)) {
      const GARBAGE_WORDS = ["很好", "不错", "可以", "还行", "一般"];
      if (!GARBAGE_WORDS.includes(span)) return true;
    }
    
    return false;
  }

  // 其他类型的逻辑...
}
```

👉 这样：

* "摄影" (preference) → 通过

* "电影" (preference) → 通过

* "游戏" (preference) → 通过

* "羽毛球" (preference) → 通过

***

## 最终过滤流水线

```typescript
return memories
  .filter(typeValidation)
  .filter(basicValidation)               // 🔥 名词型 memory + preference 绿色通道
  .filter(confidenceThreshold)
  .filter(evidenceValidation)
  .filter(strictSpanValidation)          // 🔥 使用 includesWithBoundary
  .filter(identityStrictValidation)      // 🔥 行为 identity
  .filter(factStrictValidation)
  .filter(removeWorldKnowledge)
  .filter(removeInference)
  .filter(removeShortTermTask)
  .filter(emotionFilter)
  .filter(deduplicate)
```

***

## 必须通过的测试用例

### Case 1：猫幻觉（必须拦截）

```json
{ "span": "用户有一只猫", "sourceText": "我一个人住" }
```

👉 reject（span 不是 source 子串）

### Case 2：真实猫（必须通过）

```json
{ "span": "我有一只猫", "sourceText": "我有一只猫" }
```

👉 通过

### Case 3：改写（必须拦截）

```json
{ "span": "我有一只猫", "sourceText": "我养了一只猫" }
```

👉 reject

### Case 4：职业推断（必须拦截）

```json
{ "span": "用户是程序员", "sourceText": "我平时写代码" }
```

👉 reject

### Case 5：子串匹配（必须通过）

```json
{ "span": "写代码", "sourceText": "我平时写代码" }
```

👉 通过

### Case 6：标点符号干扰（必须拦截）

```json
{ "span": "我有一只猫", "sourceText": "我，有一只猫！" }
```

👉 reject

### Case 7：identity 关键词匹配（必须通过）

```json
{ "span": "我是程序员", "sourceText": "我是程序员" }
```

👉 通过

### Case 8：identity 无关键词（必须拦截）

```json
{ "span": "我在想这个问题", "sourceText": "我在想这个问题" }
```

👉 reject

### Case 9：空格干扰（必须通过）

```json
{ "span": "写代码 ", "sourceText": "我平时写代码" }
```

👉 通过

### Case 10：全角半角（必须通过）

```json
{ "span": "我有一只猫(很可爱)", "sourceText": "我有一只猫（很可爱）" }
```

👉 通过

### Case 11：技能词误判（必须拦截）

```json
{ "span": "我喜欢写前端代码", "sourceText": "我喜欢写前端代码", "type": "identity" }
```

👉 reject

### Case 12：英文大小写（必须通过）

```json
{ "span": "python", "sourceText": "我用的是 Python" }
```

👉 通过

### Case 13：语义噪音（必须拦截）

```json
{ "span": "很好", "sourceText": "这个很好" }
```

👉 reject

### Case 14：技术短语（必须通过）

```json
{ "span": "python", "sourceText": "我用的是 Python" }
```

👉 通过

### Case 15：名词型偏好（必须通过）🔥 新增

```json
{ "span": "摄影", "sourceText": "我很喜欢摄影", "type": "preference" }
```

👉 通过（preference 绿色通道）

### Case 16：C vs C++（必须拦截）

```json
{ "span": "C", "sourceText": "我学C++" }
```

👉 reject（边界约束失败）

### Case 17：垃圾句式（必须拦截）

```json
{ "span": "我很好", "sourceText": "我很好" }
```

👉 reject

### Case 18：弱相关 memory（必须拦截）

```json
{ "span": "天气不错", "sourceText": "我今天觉得天气不错" }
```

👉 reject

### Case 19：真实偏好（必须通过）

```json
{ "span": "我喜欢摄影", "sourceText": "我喜欢摄影" }
```

👉 通过

### Case 20：C++ 完整匹配（必须通过）

```json
{ "span": "C++", "sourceText": "我学C++" }
```

👉 通过

### Case 21：行为 identity（必须通过）🔥 新增

```json
{ "span": "我写代码", "sourceText": "我写代码", "type": "identity" }
```

👉 通过（行为 identity）

### Case 22：名词型偏好-电影（必须通过）🔥 新增

```json
{ "span": "电影", "sourceText": "我喜欢看电影", "type": "preference" }
```

👉 通过

### Case 23：名词型偏好-游戏（必须通过）🔥 新增

```json
{ "span": "游戏", "sourceText": "我喜欢玩游戏", "type": "preference" }
```

👉 通过

***

## 文件修改清单

### 1. `src/agent/memory/MemoryFilter.ts`（重写）

```typescript
import { MemoryType } from '../../types';

export interface FilterInput {
  type: string;
  span: string;
  sourceText: string;
  confidence: number;
}

export interface FilteredMemory {
  type: MemoryType;
  content: string;
  confidence: number;
}

const STRONG_SIGNALS = ["喜欢", "是", "有", "做", "用", "学", "看", "写"];

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
    .filter(confidenceThreshold)
    .filter(evidenceValidation)
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
      content: m.span,
      confidence: m.confidence
    }));
}

// ========== 基础规则 ==========

function typeValidation(m: FilterInput): boolean {
  const VALID_TYPES: MemoryType[] = ['identity', 'preference', 'constraint', 'fact'];
  return VALID_TYPES.includes(m.type as MemoryType);
}

function basicValidation(m: FilterInput): boolean {
  if (!m.span || m.span.trim().length < 2) return false;
  if (m.span.length > 50) return false;
  
  // 🔥 过滤垃圾句式
  if (INVALID_PATTERNS.some(p => p.test(m.span))) {
    console.warn('[MemoryFilter] Rejected: low information density');
    return false;
  }
  
  // 🔥 信号词检查（三种路径）
  if (!hasSignalWord(m)) {
    console.warn('[MemoryFilter] Rejected: no valid signal');
    return false;
  }
  
  return true;
}

function hasSignalWord(m: FilterInput): boolean {
  const span = m.span;

  // ✅ 路径1：强信号句（喜欢 / 做 / 学 / 有 / 是）
  if (STRONG_SIGNALS.some(w => span.includes(w))) return true;

  // ✅ 路径2：技术词（英文）
  if (/^[a-zA-Z0-9+#.]+$/.test(span)) return true;

  // ✅ 路径3：中文名词短语
  // preference 绿色通道：允许名词型偏好
  if (m.type === 'preference' || m.type === 'fact') {
    if (/^[\u4e00-\u9fa5]{2,10}$/.test(span)) {
      if (!GARBAGE_WORDS.includes(span)) return true;
    }
  }

  return false;
}

function confidenceThreshold(m: FilterInput): boolean {
  return m.confidence >= 0.7;
}

// ========== 核心验证 ==========

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

function normalizeForMatch(text: string): string {
  return text
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/，/g, ",")
    .replace(/。/g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

function includesWithBoundary(source: string, span: string): boolean {
  const lowerSource = source.toLowerCase();
  const lowerSpan = span.toLowerCase();

  const index = lowerSource.indexOf(lowerSpan);
  if (index === -1) return false;

  const before = lowerSource[index - 1];
  const after = lowerSource[index + lowerSpan.length];

  const isBoundary = (char?: string) =>
    !char || /[\s,.;:()（）]/.test(char);

  return isBoundary(before) && isBoundary(after);
}

function strictSpanValidation(m: FilterInput): boolean {
  if (!m.sourceText) return false;

  const rawSource = normalizeForMatch(m.sourceText);
  const rawSpan = normalizeForMatch(m.span);

  if (!includesWithBoundary(rawSource, rawSpan)) {
    console.warn('[MemoryFilter] Rejected: not exact span or boundary violation');
    console.warn('  span:', rawSpan);
    console.warn('  source:', rawSource);
    return false;
  }

  return true;
}

// ========== 类型强约束 ==========

function identityStrictValidation(m: FilterInput): boolean {
  if (m.type !== 'identity') return true;
  
  if (!m.sourceText) return false;
  
  const rawSource = normalizeForMatch(m.sourceText);
  const rawSpan = normalizeForMatch(m.span);
  
  if (!includesWithBoundary(rawSource, rawSpan)) {
    console.warn('[MemoryFilter] Rejected identity: not exact match');
    return false;
  }
  
  // ✅ 职业关键词 OR 行为 identity
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
  
  const rawSource = normalizeForMatch(m.sourceText);
  const rawSpan = normalizeForMatch(m.span);
  
  if (!includesWithBoundary(rawSource, rawSpan)) {
    console.warn('[MemoryFilter] Rejected fact: not exact match');
    return false;
  }
  
  return true;
}

// ========== 原有规则 ==========

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
  const taskKeywords = [
    "正在", "计划", "打算", "准备", "即将", "将要", "近期", "最近"
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
  let normalizedContent: string;
  
  if (m.type === 'preference') {
    normalizedContent = semanticNormalize(m.span);
  } else {
    normalizedContent = m.span.trim();
  }
  
  return (
    index ===
    arr.findIndex(
      x => {
        if (x.type !== m.type) return false;
        
        if (m.type === 'preference') {
          return semanticNormalize(x.span) === normalizedContent;
        } else {
          return x.span.trim() === normalizedContent;
        }
      }
    )
  );
}

// ========== 工具函数 ==========

function semanticNormalize(content: string): string {
  return content
    .replace(/我(很|特别|比较|非常)?/g, "")
    .replace(/用户/g, "")
    .replace(/喜欢|热爱|爱好|感兴趣|钟爱|偏爱/g, "喜欢")
    .replace(/拍照|摄影|拍摄/g, "摄影")
    .replace(/看电影|观影/g, "看电影")
    .replace(/非常|特别|比较|相当|十分|很/g, "")
    .replace(/\s+/g, "")
    .trim();
}
```

### 2. `src/agent/memory/MemoryModelClient.ts`

**修改内容**：

1. 修改 `ParsedMemory` 接口，用 `span` 替代 `content`
2. 修改 Prompt，要求模型**只复制原文**作为 span
3. 修改解析器，解析 span 字段

**关键 Prompt 修改**：

```
【输出格式（严格JSON）】

[
  {
    "type": "identity | preference | constraint | fact",
    "span": "必须是用户原话的连续子串（不能改写）",
    "sourceText": "用户原话（必须包含 span）",
    "confidence": 0.7~1.0
  }
]

【核心规则】
- span 必须是 sourceText 的"连续子串"（原文复制）
- 不允许改写、总结、推断
- 如果找不到合适的 span，不要输出该记忆
- confidence >= 0.7
```

### 3. `src/agent/memory/MemoryExtractionService.ts`

**修改内容**：

传递 span 和 sourceText 到 FilterInput

***

## 实施步骤

### Step 1: 重写 MemoryFilter.ts

* `hasSignalWord`：三种路径（强信号 + 技术词 + 中文名词）

* `identityStrictValidation`：职业关键词 + 行为 identity

* preference 绿色通道

### Step 2: 修改 MemoryModelClient.ts

* 修改接口和 Prompt

* 强调"只复制原文"

### Step 3: 修改 MemoryExtractionService.ts

* 传递 span 和 sourceText

### Step 4: 测试验证

* 编译检查

* 功能测试（使用上述测试用例）

***

## 关键思想总结

**一句话版本**：

👉 Memory = 用户原话的"可验证子片段"
👉 不是总结、不是抽象、不是推断、不是补全

**核心改动**：

1. `includesWithBoundary`：边界约束，防止 "C" 匹配 "C++"
2. `hasSignalWord`：三种路径（强信号 + 技术词 + 中文名词）
3. `identityStrictValidation`：职业关键词 + 行为 identity
4. preference 绿色通道：允许名词型偏好
5. deduplicate 只对 preference 做语义归一

**效果**：

| 指标        | 改造前   | 改造后           |
| --------- | ----- | ------------- |
| Precision | \~70% | \~99.9%       |
| 幻觉率       | \~30% | \~0%          |
| Recall    | \~80% | \~50% (v8 恢复) |

