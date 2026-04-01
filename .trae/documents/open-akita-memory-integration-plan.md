# Open Akita 记忆系统整合计划

## 〇、Qwen 2.5 3B 模型适配方案

### 0.1 模型特性分析

| 特性             | Qwen 2.5 3B             | 影响                 |
| -------------- | ----------------------- | ------------------ |
| **参数量**        | 3B                      | 推理能力有限，复杂指令理解困难    |
| **上下文长度**      | 32K                     | 足够，但长 Prompt 会降低质量 |
| **推理速度**       | \~50-100 tokens/s (CPU) | 可接受，但需控制调用次数       |
| **内存占用**       | \~6GB (FP16)            | 需要量化或内存优化          |
| **JSON 输出稳定性** | 中等                      | 需要容错解析             |

### 0.2 当前系统在 3B 模型上的问题

根据测试日志分析：

```
问题 1: Strict 模式过于严格
- Strict 模式经常返回空数组 []
- 原因: 3B 模型对复杂 Prompt 理解有限

问题 2: JSON 格式不稳定
- JSON 解析失败: "Expected ',' or '}' after property value"
- 模型输出不完整或格式错误的 JSON

问题 3: Hallucination 问题
- 模型输出与源文本无关的内容
- 如: 在讨论童年时输出"我养了一只橘猫叫年糕"

问题 4: Span 对齐问题
- 输出的 span 不是 sourceText 的连续子串
- 需要更宽松的验证策略

问题 5: 内容长度控制
- 输出过长的 span（超过 100 字符限制）
- SafeExtractor 拒绝这些内容
```

### 0.3 针对 3B 模型的适配策略

#### 策略 1: Prompt 简化

**当前 Prompt 问题**:

* 太长（\~2000 字符）

* 规则太多

* 示例复杂

**优化方案**:

```typescript
// 简化版 Prompt（针对 3B 模型）
const SIMPLIFIED_EXTRACTION_PROMPT = `
从用户消息中提取记忆。输出 JSON 数组。

规则:
1. 只提取明确的事实、偏好、身份
2. span 必须是原话的连续子串
3. 不确定时输出空数组 []

格式: [{"type":"fact|preference|identity|constraint","span":"原话子串","confidence":0.8}]

用户消息: {message}
输出:`;
```

#### 策略 2: 输出格式简化

**方案 A: 行格式（推荐）**

```
[fact] 每天加班到九点多 | 0.8
[preference] 不吃香菜 | 0.9
```

**方案 B: XML 标签格式**

```xml
<memory type="fact" confidence="0.8">每天加班到九点多</memory>
<memory type="preference" confidence="0.9">不吃香菜</memory>
```

#### 策略 3: 三层提取架构（针对 3B 优化）

```
Layer 1: 规则快速提取（无 LLM）
    │   - 正则匹配明确模式
    │   - 提取规则信号词
    │   - ~0ms 延迟
    │   - 预期召回率: 30%
    │
Layer 2: 简化 LLM 提取
    │   - 使用简化 Prompt
    │   - 单条消息处理
    │   - 行格式输出
    │   - 预期召回率: 60%
    │
Layer 3: 会话总结（可选）
        - 批量处理
        - 使用更大模型（如有）
        - 预期召回率: 90%
```

#### 策略 4: 增强容错机制

**MultiPassParser 增强**:

```typescript
class RobustParser {
  parse(text: string): ParsedMemory[] {
    // 1. 尝试标准 JSON
    const json = this.tryJSON(text);
    if (json.length > 0) return json;
    
    // 2. 尝试行格式: [type] content | confidence
    const lines = this.tryLineFormat(text);
    if (lines.length > 0) return lines;
    
    // 3. 尝试 XML 标签
    const xml = this.tryXMLFormat(text);
    if (xml.length > 0) return xml;
    
    // 4. 尝试键值对: type: xxx, span: xxx
    const kv = this.tryKVFormat(text);
    if (kv.length > 0) return kv;
    
    // 5. 规则提取（最后兜底）
    return this.ruleBasedExtract(text);
  }
}
```

#### 策略 5: 置信度动态调整

```typescript
// 根据模型能力动态调整阈值
const MODEL_CONFIGS = {
  'qwen2.5-3b': {
    strictThreshold: 0.65,    // 降低严格阈值
    relaxedThreshold: 0.55,   // 降低宽松阈值
    maxRetries: 2,            // 增加重试次数
    preferRuleBased: true,    // 优先规则提取
  },
  'qwen2.5-7b': {
    strictThreshold: 0.70,
    relaxedThreshold: 0.60,
    maxRetries: 1,
    preferRuleBased: false,
  },
  'default': {
    strictThreshold: 0.75,
    relaxedThreshold: 0.70,
    maxRetries: 1,
    preferRuleBased: false,
  }
};
```

#### 策略 6: Hallucination 过滤增强

```typescript
class HallucinationFilter {
  // 检测幻觉特征
  detectHallucination(memory: ParsedMemory, sourceText: string): boolean {
    // 1. span 必须是 sourceText 的子串
    if (!sourceText.includes(memory.span)) {
      // 尝试模糊匹配
      if (!this.fuzzyMatch(memory.span, sourceText)) {
        return true; // 幻觉
      }
    }
    
    // 2. 检测无关实体注入
    const knownEntities = this.extractEntities(sourceText);
    const memoryEntities = this.extractEntities(memory.span);
    for (const e of memoryEntities) {
      if (!knownEntities.includes(e) && this.isSpecificEntity(e)) {
        return true; // 可能是幻觉
      }
    }
    
    return false;
  }
}
```

### 0.4 实施步骤

#### Phase 0: 3B 模型适配（优先级: 最高）

1. **简化 Prompt**

   * 创建 `SIMPLIFIED_EXTRACTION_PROMPT`

   * 减少示例数量（从 8 个减到 3 个）

   * 简化输出格式要求

2. **增强解析器**

   * 扩展 `MultiPassParser` 支持更多格式

   * 添加行格式解析

   * 添加 XML 标签解析

3. **调整阈值**

   * 降低 Strict 阈值到 0.65

   * 降低 Relaxed 阈值到 0.55

   * 增加规则提取优先级

4. **增强过滤**

   * 添加 Hallucination 检测

   * 放宽 span 验证（支持模糊匹配）

   * 增加实体一致性检查

5. **性能优化**

   * 减少单次调用的 token 数

   * 批量处理多条消息

   * 缓存常见模式

### 0.5 验证指标

| 指标              | 当前值   | 目标值    |
| --------------- | ----- | ------ |
| Strict 模式召回率    | \~10% | \~40%  |
| Relaxed 模式召回率   | \~50% | \~70%  |
| JSON 解析成功率      | \~85% | \~98%  |
| Hallucination 率 | \~15% | <5%    |
| 单次提取延迟          | \~2s  | <1.5s  |
| 总体 F1 分数        | \~0.4 | \~0.65 |

### 0.6 向后兼容性保障

**核心原则：所有改进都是增量式的，不删除或修改现有接口。**

#### 兼容性分析

| 改进项           | 兼容性保障                                | 影响范围    |
| ------------- | ------------------------------------ | ------- |
| **新增字段**      | `subject`, `predicate` 等字段为可选，现有字段保留 | 仅数据结构扩展 |
| **简化 Prompt** | 通过配置开关选择，默认使用现有 Prompt               | 可配置切换   |
| **解析器增强**     | MultiPassParser 增加新路径，现有解析路径保留       | 纯增量     |
| **阈值调整**      | 通过配置文件调整，默认值保持现有行为                   | 可配置     |
| **三层架构**      | Layer 1/2 已存在，Layer 3 为可选新增          | 纯增量     |

#### 实施策略：特性开关

```typescript
// 新增配置项（不影响现有配置）
interface MemoryExtractionOptions {
  // 现有配置保持不变
  useSimplifiedPrompt?: boolean;    // 默认 false，使用现有 Prompt
  enableSubjectPredicate?: boolean; // 默认 false，不启用新字段
  strictThreshold?: number;         // 默认 0.75，保持现有值
  relaxedThreshold?: number;        // 默认 0.70，保持现有值
  
  // 3B 模型专用配置（可选）
  smallModelConfig?: {
    enabled: boolean;               // 默认 false
    simplifiedPrompt: boolean;      // 使用简化 Prompt
    lowerThreshold: number;         // 降低阈值
  };
}
```

#### 渐进式迁移路径

```
阶段 1: 并行运行（无风险）
├── 现有系统继续运行
├── 新增解析路径（不影响现有路径）
└── 新增配置项（默认关闭）

阶段 2: A/B 测试（低风险）
├── 选择部分用户启用新功能
├── 对比新旧系统效果
└── 收集反馈数据

阶段 3: 可选启用（可控风险）
├── 用户可选择启用新功能
├── 提供回退机制
└── 监控性能指标

阶段 4: 默认启用（经过验证）
├── 新功能经过充分验证
├── 保留旧接口作为回退
└── 完成迁移
```

#### 代码层面保障

```typescript
// 示例：向后兼容的解析器增强
class MultiPassParser {
  parse(text: string): ParsedMemory[] {
    // 1. 现有 JSON 解析（保持不变）
    const jsonResult = this.jsonParse(text);
    if (jsonResult.length > 0) return jsonResult;

    // 2. 现有行解析（保持不变）
    const lineResult = this.lineParse(text);
    if (lineResult.length > 0) return lineResult;

    // 3. 现有正则解析（保持不变）
    const regexResult = this.regexParse(text);
    if (regexResult.length > 0) return regexResult;

    // 4. 现有 fallback（保持不变）
    const fallbackResult = this.fallbackParse(text);
    
    // 5. 新增：XML 标签解析（仅当以上都失败时尝试）
    // 这是纯增量，不影响现有流程
    if (fallbackResult.length === 0) {
      const xmlResult = this.tryXMLFormat(text);
      if (xmlResult.length > 0) return xmlResult;
    }
    
    return fallbackResult;
  }
}
```

#### 数据结构兼容

```typescript
// 现有接口（保持不变）
interface ParsedMemory {
  type: MemoryType;
  span: string;
  resolvedText?: string;
  sourceText: string;
  importance: number;
  embedding?: number[];
}

// 扩展接口（新增可选字段，不影响现有代码）
interface ParsedMemoryV2 extends ParsedMemory {
  subject?: string;      // 新增：实体主语
  predicate?: string;    // 新增：属性/关系
  confidence?: number;   // 新增：置信度
  duration?: string;     // 新增：有效期
}

// 现有代码继续使用 ParsedMemory，新代码可使用 ParsedMemoryV2
```

#### 风险评估

| 风险              | 可能性 | 影响 | 缓解措施       |
| --------------- | --- | -- | ---------- |
| 解析器变更导致解析失败     | 低   | 中  | 保留所有现有解析路径 |
| 新 Prompt 效果不如预期 | 中   | 低  | 配置开关，可快速回退 |
| 新字段导致存储问题       | 低   | 低  | 字段可选，数据库兼容 |
| 阈值调整导致误报        | 中   | 中  | 可配置，默认保持原值 |

**结论：本方案采用增量式改进，通过配置开关和可选字段确保向后兼容，不会破坏现有系统。**

***

## 一、系统对比分析

### 1.1 Open Akita 记忆系统核心特点

#### 数据结构

| 组件                  | 说明                                                    |
| ------------------- | ----------------------------------------------------- |
| **SemanticMemory**  | 实体-属性结构 (subject + predicate + content)，支持更新链、置信度、衰减率 |
| **Episode**         | 情节记忆，保留完整交互故事（目标、结果、使用的工具、关联实体）                       |
| **Scratchpad**      | 跨 session 工作记忆草稿本（当前任务、进展、未解决问题）                      |
| **Attachment**      | 文件/媒体记忆（图片、文档、音频的描述和转写）                               |
| **MemoryNode/Edge** | 关系型记忆图（时间、因果、实体、动作、上下文五维度）                            |

#### 提取策略

* **双轨提取**: 用户画像记忆 + 任务经验记忆分离

* **三层编码**:

  1. Quick (规则提取，\~10ms)
  2. Summary Backfill (从压缩摘要补充)
  3. Session End (批量 LLM 编码)

* **Citation Scoring**: 对检索到的记忆进行有用性评分

#### 记忆类型

```
FACT, PREFERENCE, SKILL, CONTEXT, RULE, ERROR, PERSONA_TRAIT, EXPERIENCE
```

### 1.2 当前系统特点

#### 数据结构

* `ParsedMemory`: type + span + resolvedText + sourceText + importance

* 两阶段提取: Strict (高精度) → Relaxed (高召回)

* MultiPassParser: JSON → 行解析 → 正则 → fallback

#### 记忆类型

```
identity, preference, constraint, fact
```

### 1.3 核心差异

| 维度       | 当前系统                | Open Akita                       |
| -------- | ------------------- | -------------------------------- |
| **记忆结构** | span + resolvedText | subject + predicate + content    |
| **情节记忆** | 无                   | Episode (完整交互故事)                 |
| **工作记忆** | 无                   | Scratchpad (当前任务状态)              |
| **关系图谱** | 无                   | MemoryNode/Edge (五维度关联)          |
| **提取策略** | 单轨 (用户画像)           | 双轨 (用户画像 + 任务经验)                 |
| **附件记忆** | 无                   | Attachment (文件/媒体)               |
| **编码层次** | LLM 直接提取            | 三层编码 (Quick → Summary → Session) |

***

## 二、整合目标

### 2.1 核心改进方向

1. **引入实体-属性结构**: 将记忆表示为 `subject + predicate + content`，提高结构化程度
2. **增加情节记忆**: 保存完整交互故事，支持任务复盘
3. **增加工作记忆草稿本**: 跨 session 追踪当前任务状态
4. **双轨提取**: 分离用户画像记忆和任务经验记忆
5. **扩展记忆类型**: 增加 RULE、EXPERIENCE、SKILL 等类型
6. **三层编码**: 规则快速提取 → LLM 深度提取 → 会话总结

### 2.2 预期收益

* **更精准的记忆表示**: 实体-属性结构便于更新和去重

* **更完整的上下文**: 情节记忆保留交互故事

* **更好的任务追踪**: 工作记忆草稿本支持多轮任务

* **更高的提取质量**: 双轨提取避免混淆

* **更灵活的检索**: 多维度关联支持复杂查询

***

## 三、实施计划

### Phase 1: 数据结构扩展 (优先级: 高)

#### 1.1 扩展 ParsedMemory 接口

```typescript
interface ParsedMemory {
  // 现有字段
  type: MemoryType;
  span: string;
  resolvedText?: string;
  sourceText: string;
  importance: number;
  
  // 新增字段
  subject?: string;      // 实体主语 (谁/什么)
  predicate?: string;    // 属性/关系 (偏好/版本/位于)
  confidence?: number;   // 置信度
  duration?: 'permanent' | '7d' | '24h' | 'session';
  isUpdate?: boolean;    // 是否为更新
}
```

#### 1.2 扩展记忆类型

```typescript
type MemoryType = 
  | 'identity'    // 身份
  | 'preference'  // 偏好
  | 'constraint'  // 约束
  | 'fact'        // 事实
  | 'rule'        // 行为规则
  | 'skill'       // 技能
  | 'error'       // 错误教训
  | 'experience'; // 任务经验
```

#### 1.3 新增 Episode 接口

```typescript
interface Episode {
  id: string;
  sessionId: string;
  summary: string;           // 情节摘要
  goal: string;              // 用户目标
  outcome: 'success' | 'partial' | 'failed' | 'ongoing';
  startedAt: Date;
  endedAt: Date;
  actionNodes: ActionNode[]; // 工具调用链
  entities: string[];        // 涉及实体
  toolsUsed: string[];       // 使用的工具
  linkedMemoryIds: string[]; // 关联记忆
}
```

#### 1.4 新增 Scratchpad 接口

```typescript
interface Scratchpad {
  userId: string;
  content: string;           // 草稿本内容
  activeProjects: string[];  // 活跃项目
  currentFocus: string;      // 当前焦点
  openQuestions: string[];   // 未解决问题
  nextSteps: string[];       // 下一步
  updatedAt: Date;
}
```

### Phase 2: 提取策略升级 (优先级: 高)

#### 2.1 双轨提取流程

```
用户消息
    │
    ├─→ Track 1: 用户画像提取
    │   ├─ 身份信息 (identity)
    │   ├─ 偏好习惯 (preference)
    │   ├─ 行为规则 (rule)
    │   └─ 事实信息 (fact)
    │
    └─→ Track 2: 任务经验提取
        ├─ 成功方法 (skill)
        ├─ 失败教训 (error)
        └─ 任务经验 (experience)
```

#### 2.2 三层编码策略

```
Layer 1: Quick (规则提取)
    │   - 正则匹配规则信号
    │   - 提取明确偏好/约束
    │   - ~10ms 延迟
    │
Layer 2: LLM 提取
    │   - Strict 模式 (高精度)
    │   - Relaxed 模式 (高召回)
    │
Layer 3: Session End
        - 生成 Episode
        - 双轨总结
        - 更新 Scratchpad
```

#### 2.3 更新 Prompt 模板

* 分离用户画像 Prompt 和任务经验 Prompt

* 增加 subject/predicate 字段要求

* 增加 duration 字段指导

### Phase 3: 存储层改进 (优先级: 中)

#### 3.1 数据库 Schema 扩展

```sql
-- 记忆表扩展
ALTER TABLE memories ADD COLUMN subject TEXT;
ALTER TABLE memories ADD COLUMN predicate TEXT;
ALTER TABLE memories ADD COLUMN confidence REAL;
ALTER TABLE memories ADD COLUMN expires_at TEXT;

-- 情节记忆表
CREATE TABLE episodes (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  summary TEXT,
  goal TEXT,
  outcome TEXT,
  started_at TEXT,
  ended_at TEXT,
  tools_used TEXT,  -- JSON
  entities TEXT,    -- JSON
  linked_memory_ids TEXT  -- JSON
);

-- 工作记忆草稿本表
CREATE TABLE scratchpads (
  user_id TEXT PRIMARY KEY,
  content TEXT,
  active_projects TEXT,  -- JSON
  current_focus TEXT,
  open_questions TEXT,   -- JSON
  next_steps TEXT,       -- JSON
  updated_at TEXT
);

-- 会话轮次表 (用于情节生成)
CREATE TABLE conversation_turns (
  id INTEGER PRIMARY KEY,
  session_id TEXT,
  turn_index INTEGER,
  role TEXT,
  content TEXT,
  tool_calls TEXT,   -- JSON
  tool_results TEXT, -- JSON
  created_at TEXT
);
```

#### 3.2 TauriMemoryClient 扩展

* 新增 Episode CRUD 方法

* 新增 Scratchpad CRUD 方法

* 新增会话轮次记录方法

### Phase 4: 检索增强 (优先级: 中)

#### 4.1 多路召回

```
查询 → LLM 关键词拆解
    │
    ├─→ 语义搜索 (向量)
    ├─→ 情节搜索 (实体/工具名)
    ├─→ 时间搜索 (最近 N 天)
    └─→ 附件搜索 (文件/媒体)
    │
    └─→ 综合排序
        - relevance × 0.4
        - recency × 0.2
        - importance × 0.2
        - access_freq × 0.2
```

#### 4.2 Citation Scoring

* 记录检索到的记忆

* 会话结束时让 LLM 评分

* 更新 access\_count 和 last\_accessed\_at

### Phase 5: 集成与测试 (优先级: 高)

#### 5.1 文件修改清单

| 文件                                            | 修改内容                           |
| --------------------------------------------- | ------------------------------ |
| `src/types/index.ts`                          | 扩展 MemoryType, ParsedMemory 接口 |
| `src/agent/memory/MemoryModelClient.ts`       | 更新 Prompt, 增加双轨提取              |
| `src/agent/memory/MemoryExtractionService.ts` | 增加三层编码流程                       |
| `src/agent/memory/TauriMemoryClient.ts`       | 增加 Episode/Scratchpad 方法       |
| `src/agent/memory/MemoryFilter.ts`            | 增加新类型过滤规则                      |
| `src-tauri/src/memory/mod.rs`                 | 扩展数据库 Schema                   |

#### 5.2 测试计划

1. 单元测试: 新增接口和类型
2. 集成测试: 双轨提取流程
3. 回归测试: 使用现有 `log/memory_model_raw_outputs.json`
4. A/B 测试: 对比新旧系统提取质量

***

## 四、实施优先级

### 第一阶段 (核心改进)

1. ✅ 扩展 ParsedMemory 接口 (增加 subject/predicate)
2. ✅ 扩展记忆类型 (增加 rule/experience/skill/error)
3. ✅ 更新提取 Prompt (支持实体-属性结构)
4. ✅ 实现双轨提取 (用户画像 + 任务经验)

### 第二阶段 (存储增强)

1. ⬜ 实现 Episode 数据结构和存储
2. ⬜ 实现 Scratchpad 数据结构和存储
3. ⬜ 扩展数据库 Schema
4. ⬜ 实现三层编码流程

### 第三阶段 (检索优化)

1. ⬜ 实现多路召回
2. ⬜ 实现 Citation Scoring
3. ⬜ 优化排序算法

***

## 五、风险与缓解

| 风险         | 缓解措施                    |
| ---------- | ----------------------- |
| 提取质量下降     | 保留 Strict/Relaxed 两阶段机制 |
| 存储性能影响     | 使用异步写入、批量操作             |
| 兼容性问题      | 保留向后兼容接口                |
| LLM 调用成本增加 | 使用三层编码减少 LLM 调用         |

***

## 六、参考代码位置

### Open Akita 源码

* 类型定义: `memory/types.py`

* 提取器: `memory/extractor.py`

* 管理器: `memory/manager.py`

* 存储层: `memory/unified_store.py`

* 检索引擎: `memory/retrieval.py`

* 关系型记忆: `memory/relational/`

### 当前系统

* 类型定义: `src/types/index.ts`

* 模型客户端: `src/agent/memory/MemoryModelClient.ts`

* 提取服务: `src/agent/memory/MemoryExtractionService.ts`

* 存储客户端: `src/agent/memory/TauriMemoryClient.ts`

