# 记忆系统类型精简与 Filter 集成计划

## 目标概述

将记忆系统从 6 种类型精简为 4 种，移除 `skill`（用户能力）和 `task`（进行中任务），并集成 Memory Filter 到提取流程中。

## 核心原则

> **模型可以犯错，但 Filter 不能放错。**

## 架构变更

### 新的数据流

```
对话
  ↓
Memory Extraction（Qwen 2.5）
  ↓
Memory Filter（🔥新增 - 规则版）
  ↓
Memory Storage
  ↓
Embedding（bge-large-zh）
  ↓
Retrieval
```

## 修改文件清单

### 1. 类型定义修改

#### 1.1 `src/types.ts`

* 移除 `skill` 和 `task` 从 `MemoryType`

* 更新 `ExtractedMemory` 接口，移除 `tasks` 和 `skills`

* 更新相关接口

```typescript
// 修改前
export type MemoryType = 'identity' | 'fact' | 'preference' | 'task' | 'constraint' | 'skill';

// 修改后
export type MemoryType = 'identity' | 'preference' | 'constraint' | 'fact';
```

#### 1.2 `src-tauri/src/models/memory.rs`

* 移除 `Skill` 和 `Task` 枚举值

* 更新 `get_default_decay` 函数

* 更新 `ExtractedMemory` 结构体

### 2. Prompt 更新

#### 2.1 `src/agent/memory/MemoryModelClient.ts`

替换为新的防污染版 Prompt：

```
你是一个"用户长期记忆提取器"。

你的任务：
从对话中提取【可以长期保存的用户信息】。

--------------------------------
【只允许提取以下4类】

1. identity（身份特征）
- 稳定身份信息
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

--------------------------------
【强约束规则】

1. 只提取"用户明确说过"的信息
2. 不要改写成带推断的表达
3. 每条信息必须可以追溯到原话
4. 宁可少，不要错

--------------------------------
【输出格式（严格JSON）】

[
  {
    "type": "identity | preference | constraint | fact",
    "content": "简洁中文描述（不超过30字）",
    "confidence": 0.0~1.0
  }
]
```

* 更新 `MultiPassParser` 的 `VALID_TYPES`

* 更新 `SafeExtractor` 的 `VALID_TYPES`

### 3. Memory Filter 集成

#### 3.1 移动并重命名 Filter 文件

将 `src-tauri/src/memory/Memory Filter.ts` 移动到 `src/agent/memory/MemoryFilter.ts`

#### 3.2 Filter 实现规范（修正版 v2）

##### 3.2.1 核心设计原则

**避免误杀（False Negative）是首要目标：**

* 宁可放过，不可错杀

* 过滤规则必须精确，不能过于激进

* 好记忆被过滤比坏记忆进入系统更严重

##### 3.2.2 类型与接口定义

```typescript
export type MemoryType =
  | "identity"
  | "preference"
  | "constraint"
  | "fact";

export interface FilterInput {
  type: string;  // 原始类型，可能是非法值
  content: string;
  confidence: number;
}

export interface FilteredMemory {
  type: MemoryType;
  content: string;
  confidence: number;
}
```

##### 3.2.3 主过滤函数

```typescript
export function filterMemories(memories: FilterInput[]): FilteredMemory[] {
  return memories
    .filter(typeValidation)        // 1. 类型校验（最先执行）
    .filter(basicValidation)       // 2. 基础校验
    .filter(removeWorldKnowledge)  // 3. 去世界知识污染（改进版）
    .filter(removeInference)       // 4. 去推断
    .filter(removeShortTermTask)   // 5. 去短期任务
    .filter(deduplicate);          // 6. 去重（语义压缩版）
}
```

**注意：移除了 confidenceCheck 过滤，原因见下文。**

##### 3.2.4 各过滤函数实现

###### 1. 类型校验

```typescript
function typeValidation(m: FilterInput): boolean {
  const VALID_TYPES: MemoryType[] = ['identity', 'preference', 'constraint', 'fact'];
  return VALID_TYPES.includes(m.type as MemoryType);
}
```

###### 2. 基础校验

```typescript
function basicValidation(m: FilterInput): boolean {
  if (!m.content || m.content.length < 5) return false;
  if (m.content.length > 50) return false;
  return true;
}
```

###### 3. 去世界知识污染（改进版 - 避免误杀）

```typescript
function removeWorldKnowledge(m: FilterInput): boolean {
  const worldKnowledgeKeywords = [
    "杭州", "北京", "上海", "深圳", "广州", "成都", "武汉", "南京",
    "市场", "行业", "就业环境", "发展前景", "经济", "政策"
  ];

  const hasWorldKnowledge = worldKnowledgeKeywords.some(word => m.content.includes(word));

  if (!hasWorldKnowledge) return true;

  // ✅ 关键改进：必须同时包含"用户锚点"
  // 本质：不是"有城市就错"，而是"脱离用户的城市才是错"
  const userAnchors = ["我", "我的", "家", "在", "住", "工作", "生活", "用户"];

  const hasUserAnchor = userAnchors.some(word => m.content.includes(word));

  return hasUserAnchor;
}
```

**示例分析：**

| 内容            | 结果   | 原因               |
| ------------- | ---- | ---------------- |
| "我平时喜欢在杭州拍街景" | ✅ 保留 | 包含"我"和"杭州"，有用户锚点 |
| "杭州夏天很热"      | ❌ 过滤 | 只有"杭州"，无用户锚点     |
| "用户在北京工作"     | ✅ 保留 | 包含"用户"和"北京"      |
| "杭州工作机会多"     | ❌ 过滤 | 只有"杭州"，无用户锚点     |

###### 4. 去推断（核心规则）

```typescript
function removeInference(m: FilterInput): boolean {
  const blacklist = [
    "擅长", "精通", "熟练", "专业", "专家", "经验丰富",
    "能力强", "水平高"
  ];
  return !blacklist.some(word => m.content.includes(word));
}
```

**注意：移除了"会"、"熟悉"、"应该"、"可能"、"可以"、"能力"等词，因为它们在正常表达中也很常见，容易误杀。**

###### 5. 去短期任务

```typescript
function removeShortTermTask(m: FilterInput): boolean {
  const taskKeywords = [
    "正在", "计划", "打算", "准备", "即将", "将要", "近期", "最近"
  ];
  return !taskKeywords.some(word => m.content.includes(word));
}
```

**注意：移除了"学习"、"考虑"、"想要"等词，因为它们可能表示长期偏好。**

###### 6. 去重（语义压缩版）

```typescript
function deduplicate(
  m: FilterInput,
  index: number,
  arr: FilterInput[]
): boolean {
  const normalizedContent = semanticNormalize(m.content);
  
  return (
    index ===
    arr.findIndex(
      x =>
        x.type === m.type &&
        semanticNormalize(x.content) === normalizedContent
    )
  );
}

/**
 * 语义压缩层（关键优化）
 * 目标：将不同表达方式的相同语义归一化
 */
function semanticNormalize(content: string): string {
  return content
    // 1. 去主语
    .replace(/我(很|特别|比较|非常)?/g, "")
    .replace(/用户/g, "")
    
    // 2. 统一表达（关键：将同义词映射到统一形式）
    .replace(/喜欢|热爱|爱好|感兴趣|钟爱|偏爱/g, "喜欢")
    .replace(/拍照|摄影|拍摄/g, "摄影")
    .replace(/写代码|编程|开发/g, "编程")
    .replace(/看电影|观影/g, "看电影")
    
    // 3. 去修饰词
    .replace(/非常|特别|比较|相当|十分|很/g, "")
    
    // 4. 去除多余空格
    .replace(/\s+/g, "")
    .trim();
}
```

**示例分析：**

| 原始内容       | 归一化后    | 结果  |
| ---------- | ------- | --- |
| "我很喜欢摄影"   | "喜欢摄影"  | 归一化 |
| "摄影是我的爱好"  | "是喜欢摄影" | 归一化 |
| "平时会拍照"    | "平时会摄影" | 归一化 |
| "热爱编程"     | "喜欢编程"  | 归一化 |
| "写代码是我的兴趣" | "编程是喜欢" | 归一化 |

##### 3.2.5 关于 Confidence 的处理

**问题：Qwen 2.5 3B 的 confidence 不可靠**

| 内容类型 | 典型 confidence |
| ---- | ------------- |
| 垃圾内容 | 0.9           |
| 真实信息 | 0.6           |

**解决方案：不在 Filter 中做 confidence 过滤**

```typescript
// ❌ 错误做法：直接过滤低 confidence
function confidenceCheck(m: FilterInput): boolean {
  return m.confidence >= 0.7;  // 会丢掉好记忆
}

// ✅ 正确做法：保留 confidence，用于后续排序/展示
// Filter 只做内容过滤，不做分数过滤
```

**confidence 的正确用途：**

1. 在 UI 中展示，让用户判断
2. 在存储时作为 `importance` 的参考值
3. 在检索时作为排序权重之一

##### 3.2.6 完整 Filter 流程图

```
输入: FilterInput[]
  │
  ▼
┌─────────────────────────────────┐
│ 1. typeValidation               │  过滤非法类型
│    只允许 4 种合法类型            │
└─────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────┐
│ 2. basicValidation              │  基础校验
│    内容长度 5-50 字符             │
└─────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────┐
│ 3. removeWorldKnowledge         │  去世界知识污染
│    必须同时包含"用户锚点"          │
│    （改进版，避免误杀）            │
└─────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────┐
│ 4. removeInference              │  去推断
│    过滤"擅长"、"精通"等推断词      │
│    （精简词表，避免误杀）          │
└─────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────┐
│ 5. removeShortTermTask          │  去短期任务
│    过滤"正在"、"计划"、"最近"等    │
│    （精简词表，避免误杀）          │
└─────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────┐
│ 6. deduplicate                  │  去重
│    语义压缩后精确匹配              │
│    （统一表达，有效去重）          │
└─────────────────────────────────┘
  │
  ▼
输出: FilteredMemory[]（保留 confidence 用于后续使用）
```

#### 3.3 在 MemoryExtractionService 中集成

在 `newExtractionPipeline` 方法中，在 `modelClient.extractCandidates` 之后调用 Filter：

```typescript
const candidates = await this.modelClient.extractCandidates(conversation);

// 新增：应用 Memory Filter
const filterInput: FilterInput[] = candidates.map(c => ({
  type: c.type,
  content: c.content,
  confidence: c.importance  // 注意：importance 映射到 confidence
}));

const filteredMemories = filterMemories(filterInput);

// 转换回 ParsedMemory 格式
const filteredCandidates: ParsedMemory[] = filteredMemories.map(f => ({
  type: f.type,
  content: f.content,
  importance: f.confidence  // confidence 映射回 importance
}));
```

#### 3.4 字段映射说明

| 阶段        | 字段名        | 说明                |
| --------- | ---------- | ----------------- |
| 模型输出      | importance | 模型输出的重要性分数        |
| Filter 输入 | confidence | 映射自 importance    |
| Filter 输出 | confidence | 保留原值，不做过滤         |
| 存储格式      | importance | 映射回 importance 存储 |

**注意：Filter 不做 confidence 过滤，保留原值用于后续排序/展示。**

#### 3.5 设计决策总结

| 问题             | 解决方案                   |
| -------------- | ---------------------- |
| 误杀风险           | 精简词表，使用用户锚点判断          |
| 语义去重           | 语义压缩层，统一表达方式           |
| confidence 不可靠 | 不在 Filter 中过滤，保留用于后续使用 |

**核心目标：确保"任何推断、世界知识、短期任务"都无法进入 memory storage，同时避免误杀有效记忆。**

#### 3.6 已知限制与后续迭代

##### 问题 1：semanticNormalize 不够稳定（硬编码语义映射）

**当前实现：**

```typescript
.replace(/拍照|摄影|拍摄/g, "摄影")
.replace(/写代码|编程|开发/g, "编程")
```

**问题：**

* 硬编码语义映射，不可扩展

* 很快会遇到：剪视频/做视频/vlog/拍短视频 → 需要不断添加规则

* 词表会爆炸

**后续迭代方向：Embedding 语义去重**

```typescript
// 当前：规则去重（局部最优）
semanticNormalize(a) === semanticNormalize(b)

// 下一步：语义去重（全局最优）
cosine_similarity(embedding(a), embedding(b)) > 0.85
```

| 对比维度  | 当前方案       | 下一步方案               |
| ----- | ---------- | ------------------- |
| 去重方式  | 规则去重       | 语义去重（embedding）     |
| 可扩展性  | 低（需手动添加词表） | 高（自动语义匹配）           |
| 准确性   | 局部最优       | 全局最优                |
| 实现复杂度 | 低          | 中（需调用 embedding 模型） |

**本迭代决策：** 先用规则去重，后续迭代升级为 embedding 去重。

##### 问题 2：没有记忆冲突处理机制

**当前问题：**

```
记忆 A: "喜欢摄影"
记忆 B: "不太喜欢拍照"
```

→ 两条都会留下 → Retrieval 时人格分裂

**后续迭代方向：冲突检测与解决**

```typescript
function detectConflict(memories: FilteredMemory[]): Conflict[] {
  // 检测同主题、不同极性的记忆
  // if (same_topic && polarity_conflict) {
  //   保留最新 or 覆盖旧记忆
  // }
}
```

**冲突类型：**

| 类型   | 示例                     | 处理策略 |
| ---- | ---------------------- | ---- |
| 偏好反转 | "喜欢摄影" vs "不喜欢拍照"      | 保留最新 |
| 事实更新 | "住在北京" vs "搬到杭州"       | 保留最新 |
| 约束变化 | "预算 5000" vs "预算 3000" | 保留最新 |

**本迭代决策：** 当前不实现冲突检测，依赖用户在候选记忆面板手动审核。后续迭代添加自动冲突检测。

##### 问题 3：没有记忆粒度控制（Memory Fragmentation）

**当前问题：**

```
记忆 A: "喜欢摄影"
记忆 B: "喜欢拍风景"
记忆 C: "喜欢拍街景"
记忆 D: "喜欢夜景摄影"
```

→ 全存 → 过度细化 → Memory Fragmentation

**后续迭代方向：Memory Hierarchy（层级记忆）**

```typescript
interface HierarchicalMemory {
  abstract: string;      // "喜欢摄影"
  concrete: string[];    // ["拍风景", "拍街景", "夜景摄影"]
}

function mergeSubTopics(memories: FilteredMemory[]): HierarchicalMemory[] {
  // if (多个子类命中同一主题) {
  //   合并成抽象记忆
  // }
}
```

**层级结构示例：**

```
preference: 摄影
├── 子类: 风景摄影
├── 子类: 街景摄影
└── 子类: 夜景摄影
```

**本迭代决策：** 当前不实现层级记忆，依赖 Prompt 中的"不要过度细化"规则。后续迭代添加 Memory Hierarchy。

##### 迭代规划总结

| 问题   | 当前方案      | 后续迭代             | 优先级 |
| ---- | --------- | ---------------- | --- |
| 语义去重 | 规则词表      | Embedding 相似度    | P1  |
| 冲突处理 | 用户手动审核    | 自动冲突检测           | P2  |
| 粒度控制 | Prompt 约束 | Memory Hierarchy | P3  |

**本迭代范围：** 类型精简 + Filter 集成（规则版）
**后续迭代：** Embedding 去重 → 冲突检测 → 层级记忆

### 4. UI 更新

#### 4.1 `src/components/MemoryPanel/types.ts`

```typescript
export const MEMORY_TYPE_LABELS: Record<MemoryType, string> = {
  identity: '身份特征',
  preference: '用户偏好',
  constraint: '限制条件',
  fact: '用户事实',
};

export const MEMORY_TYPE_COLORS: Record<MemoryType, string> = {
  identity: 'text-purple-400',
  preference: 'text-green-400',
  constraint: 'text-red-400',
  fact: 'text-blue-400',
};

export const MEMORY_TYPE_BG_COLORS: Record<MemoryType, string> = {
  identity: 'bg-purple-500/20',
  preference: 'bg-green-500/20',
  constraint: 'bg-red-500/20',
  fact: 'bg-blue-500/20',
};
```

### 5. 其他文件更新

#### 5.1 `src/agent/memory/MemoryExtractionService.ts`

* 移除 `balanceTypes` 中的 `task` 和 `skill`

* 集成 Memory Filter

* 更新 `legacyExtractionPipeline` 中的 Prompt

#### 5.2 `src-tauri/src/memory/storage.rs`

* 更新类型相关的 SQL 查询

* 移除 `skill` 和 `task` 相关的 decay 默认值

#### 5.3 `docs/记忆提取系统架构文档.md`

* 更新架构图

* 更新类型定义

* 添加 Memory Filter 层说明

* 更新更新日志

## 实施步骤

### 阶段一：类型定义更新

1. 更新 `src/types.ts`
2. 更新 `src-tauri/src/models/memory.rs`

### 阶段二：Prompt 更新

1. 更新 `src/agent/memory/MemoryModelClient.ts` 的 Prompt
2. 更新解析器和验证器

### 阶段三：Memory Filter 集成

1. 创建 `src/agent/memory/MemoryFilter.ts`
2. 在 `MemoryExtractionService.ts` 中集成 Filter

### 阶段四：UI 和文档更新

1. 更新 `src/components/MemoryPanel/types.ts`
2. 更新架构文档

### 阶段五：清理和验证

1. 移除旧的 `Memory Filter.ts` 文件
2. 运行类型检查和测试

## 风险评估

### 低风险

* 类型定义更新：影响范围明确

* UI 标签更新：纯展示层修改

### 中风险

* Prompt 更新：可能影响提取质量，需要测试

* Filter 集成：可能过滤掉有效记忆，需要调整阈值

### 需要注意

* 数据库中已存在的 `skill` 和 `task` 类型记忆需要迁移或保留

* 前端展示需要兼容旧数据

## 验证清单

* [ ] TypeScript 编译无错误

* [ ] Rust 编译无错误

* [ ] 记忆提取功能正常

* [ ] Filter 正确过滤无效记忆

* [ ] UI 正确显示 4 种类型

* [ ] 旧数据兼容性测试

