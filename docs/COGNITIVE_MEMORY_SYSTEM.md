# 认知记忆系统实现文档

## 概述

本文档记录了认知记忆系统（Cognitive Memory System）的实现细节，该系统为 AI 助手提供长期记忆能力，支持6类认知记忆类型的存储、检索和生命周期管理。

**最新更新**：2026-03-25 阶段三：Retrieval 稳定性

## 实现日期

- 2026-03-23：认知记忆系统核心实现
- 2026-03-23：记忆演化能力（Memory Evolution）
- 2026-03-23：Memory UI 可视化面板
- 2026-03-23：阶段一 - 记忆提取集成（候选记忆机制）
- 2026-03-24：阶段二 - Embedding 模型集成（本地模型推理）
- 2026-03-25：阶段三 - Retrieval 稳定性（min_similarity、only_active 过滤）

## 文件存储位置

| 平台      | 路径                                                           |
| ------- | ------------------------------------------------------------ |
| Windows | `C:\Users\<用户名>\AppData\Local\nexus-ai-assistant\memory.db`  |
| macOS   | `~/Library/Application Support/nexus-ai-assistant/memory.db` |
| Linux   | `~/.local/share/nexus-ai-assistant/memory.db`                |

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (TypeScript)                   │
├─────────────────────────────────────────────────────────────┤
│  ReActEngine ──► DefaultAgentLayer ──► TauriMemoryClient    │
│        │              │                                      │
│        │              └──► SessionMemory (会话级缓存)        │
│        │                                                     │
│        └──► reinforceMemories() 回答后强化记忆               │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Tauri Invoke
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Backend (Rust)                          │
├─────────────────────────────────────────────────────────────┤
│  Commands                                                    │
│  ├── memory.rs (记忆相关命令)                                │
│  └── session.rs (会话相关命令)                               │
│                                                              │
│  Memory Modules                                              │
│  ├── storage.rs (SQLite 持久化)                              │
│  ├── embedding.rs (向量计算)                                 │
│  ├── retrieval.rs (RAG 检索)                                 │
│  ├── extraction.rs (认知提取 Prompt)                         │
│  └── lifecycle.rs (生命周期管理 + 记忆演化)                  │
│           └── MemoryEvolutionManager (新增)                 │
│                                                              │
│  Models                                                      │
│  ├── memory.rs (记忆数据模型 + 演化相关类型)                 │
│  └── session.rs (会话数据模型)                               │
└─────────────────────────────────────────────────────────────┘
```

## 新增文件清单

### Rust 后端

| 文件路径                                 | 功能描述                    |
| ------------------------------------ | ----------------------- |
| `src-tauri/src/models/mod.rs`        | 模型模块入口                  |
| `src-tauri/src/models/memory.rs`     | 记忆数据模型（6类记忆类型、任务状态机、演化相关类型等）   |
| `src-tauri/src/models/session.rs`    | 会话数据模型                  |
| `src-tauri/src/memory/mod.rs`        | 记忆模块入口                  |
| `src-tauri/src/memory/storage.rs`    | SQLite 存储层（会话、消息、记忆持久化、演化方法） |
| `src-tauri/src/memory/embedding.rs`  | 向量计算服务                  |
| `src-tauri/src/memory/extraction.rs` | 认知建模提取 Prompt           |
| `src-tauri/src/memory/retrieval.rs`  | RAG 增强检索（跨模型适配）         |
| `src-tauri/src/memory/lifecycle.rs`  | 记忆生命周期管理 + MemoryEvolutionManager |
| `src-tauri/src/commands/mod.rs`      | Commands 模块入口           |
| `src-tauri/src/commands/memory.rs`   | 记忆相关 Tauri Commands     |
| `src-tauri/src/commands/session.rs`  | 会话相关 Tauri Commands     |

### 前端 TypeScript

| 文件路径                                    | 功能描述                    |
| --------------------------------------- | ----------------------- |
| `src/types.ts`                          | 新增 MemoryItem 等6类记忆类型定义、演化相关类型 |
| `src/agent/memory/TauriMemoryClient.ts` | Tauri Invoke 封装（含演化 API） |
| `src/agent/memory/SessionMemory.ts`     | 会话级 Tool Cache 管理器      |
| `src/agent/memory/DefaultAgentLayer.ts` | 开箱即用模式自动行为              |
| `src/agent/memory/index.ts`             | 导出新的记忆模块                |

### Memory UI 可视化面板（新增）

| 文件路径                                    | 功能描述                    |
| --------------------------------------- | ----------------------- |
| `src/context/MemoryUIContext.tsx`       | Memory UI 全局状态管理（Debug模式、命中记录、日志） |
| `src/hooks/useMemoryState.ts`           | Memory 状态管理 Hook |
| `src/components/MemoryPanel/index.tsx`  | Memory Panel 主入口组件 |
| `src/components/MemoryPanel/types.ts`   | Memory Panel 类型定义 |
| `src/components/MemoryPanel/MemoryList.tsx` | Memory List 模块（列表展示、排序、筛选、搜索） |
| `src/components/MemoryPanel/MemoryStats.tsx` | 统计概览展示 |
| `src/components/MemoryPanel/MemoryHits.tsx` | 本轮命中 Memory 展示 |
| `src/components/MemoryPanel/MemoryDebugLog.tsx` | Debug Log 结构化日志 |
| `src/components/MemoryPanel/MemoryOperations.tsx` | 操作面板（强化、删除、演化控制） |

### 修改的文件

| 文件路径                               | 修改内容                                    |
| ---------------------------------- | --------------------------------------- |
| `src-tauri/Cargo.toml`             | 添加 rusqlite, uuid, chrono, thiserror 依赖 |
| `src-tauri/src/lib.rs`             | 初始化记忆系统、注册 Commands、启动时执行演化周期 |
| `src/agent/runtime/ReActEngine.ts` | 注入相关记忆到系统提示、回答后强化被使用的记忆 |
| `src/components/Sidebar.tsx`       | 添加 Memory Panel 入口按钮 |
| `src/App.tsx`                      | 集成 Memory Panel、添加 onMemoryRetrieved 回调 |
| `src/agent/types.ts`               | 添加 onMemoryRetrieved 回调类型 |
| `src/agent/runtime/AgentRuntime.ts` | 传递 onMemoryRetrieved 回调 |
| `src/hooks/useAgentExecution.ts`   | 添加 onMemoryRetrieved 支持 |
| `src/i18n/locales/zh.json`         | 添加 Memory Panel 中文翻译 |
| `src/i18n/locales/en.json`         | 添加 Memory Panel 英文翻译 |

## 核心功能

### 1. 六类认知记忆类型

```typescript
type MemoryType = 
  | 'identity'    // 身份特征
  | 'fact'        // 已知事实
  | 'preference'  // 用户偏好
  | 'task'        // 进行中的任务
  | 'constraint'  // 限制条件
  | 'skill';      // 用户能力
```

### 2. 任务状态机

```
pending ──► in_progress ──► done
                │
                └──► cancelled
```

### 3. RAG 增强检索

检索评分公式：

```
final_score = similarity × 0.6 + memory_score × 0.4
```

其中：

- `similarity`: 语义相似度（余弦相似度）- 当前问题优先
- `memory_score`: 记忆动态权重 - 作为修正项

**设计原则**：当前问题优先匹配，记忆权重作为修正项，避免强记忆被错误优先返回。

#### 检索过滤机制（阶段三新增）

| 过滤条件 | 默认值 | 说明 |
|---------|--------|------|
| `min_similarity` | 0.3 | 过滤相似度低于阈值的记忆 |
| `only_active` | true | 只返回活跃记忆（is_active=1） |
| `min_importance` | 0.3 | 过滤重要性低于阈值的记忆 |

**过滤流程**：
1. SQL 层面：`only_active` 和 `min_importance` 在查询时过滤
2. 计算层面：`min_similarity` 在相似度计算后过滤

### 4. 跨模型适配

| 模型类型   | Top-K | 说明           |
| ------ | ----- | ------------ |
| Local  | 5     | 本地模型上下文有限    |
| Online | 10    | 在线模型可处理更多上下文 |

### 5. 记忆演化能力（新增）

#### 5.1 核心行为

| 行为 | 触发时机 | 执行逻辑 |
|------|----------|----------|
| **reinforce（强化）** | ReActEngine 生成回答后 | `score += 0.05`（上限 1.0），恢复 is_active |
| **decay（衰减）** | 应用启动时 | `score = score × exp(-decay × days)` |
| **prune（淘汰）** | 应用启动时 | 两阶段淘汰：先标记不活跃，7天后删除 |

#### 5.2 Memory Type 差异化衰减速率

不同类型记忆有不同的遗忘速率：

| MemoryType | decay 默认值 | 说明 |
|------------|-------------|------|
| `identity` | 0.001 | 几乎不忘（身份特征） |
| `skill` | 0.002 | 很难忘记（用户能力） |
| `constraint` | 0.003 | 较难忘记（限制条件） |
| `preference` | 0.005 | 中等偏慢（用户偏好） |
| `fact` | 0.01 | 标准速率（已知事实） |
| `task` | 0.02 | 较快遗忘（进行中任务，可能已完成） |

#### 5.3 两阶段淘汰机制

```
阶段一：标记不活跃
if score < 0.3 && is_active {
    is_active = false;
    marked_inactive_at = now;
}

阶段二：真正删除
if score < 0.1 && !is_active && days_since_marked >= 7 {
    delete memory;
}
```

## Tauri Commands API

### 记忆相关

```typescript
// 检索记忆（阶段三更新：支持 minSimilarity、onlyActive）
retrieve_memories(query: string, options?: Partial<RetrievalOptions>): Promise<RetrievedMemory[]>
// 默认值: { topK: 10, minImportance: 0.3, minSimilarity: 0.3, onlyActive: true }

// 添加记忆
add_memory(item: MemoryItem): Promise<void>

// 获取所有记忆
get_all_memories(): Promise<MemoryItem[]>

// 按类型获取记忆
get_memories_by_type(memoryType: MemoryType): Promise<MemoryItem[]>

// 更新任务状态
update_task_status(id: string, status: TaskStatus, progress?: string, nextStep?: string): Promise<void>

// 删除记忆
delete_memory(id: string): Promise<void>

// 清理低价值记忆
prune_memories(): Promise<number>

// 获取记忆统计
get_memory_stats(): Promise<MemoryStats>
```

### 记忆演化相关（新增）

```typescript
// 强化记忆（回答后调用）
reinforce_memories(ids: string[]): Promise<number>

// 执行记忆衰减
decay_memories(): Promise<DecayResult>

// 执行记忆淘汰
prune_memories_v2(): Promise<PruneResult>

// 执行完整演化周期（衰减 + 淘汰）
run_evolution_cycle(): Promise<[DecayResult, PruneResult]>

// 获取演化统计
get_evolution_stats(): Promise<EvolutionStats>
```

### 会话相关

```typescript
// 保存会话
save_session(session: ChatSession): Promise<void>

// 加载所有会话
load_sessions(): Promise<ChatSession[]>

// 删除会话
delete_session(sessionId: string): Promise<void>

// 保存消息
save_messages(sessionId: string, messages: Message[]): Promise<void>

// 加载消息
load_messages(sessionId: string): Promise<Message[]>

// 文件夹管理
save_folder(folder: ChatFolder): Promise<void>
load_folders(): Promise<ChatFolder[]>
delete_folder(folderId: string): Promise<void>
```

## 日志系统

### 启动日志

```
========================================
[MemorySystem] 正在初始化认知记忆系统...
[MemorySystem] 数据存储位置: C:\Users\...\AppData\Local\nexus-ai-assistant
[MemorySystem] 数据库文件: ...\memory.db
[MemoryStorage] 创建存储实例, 路径: ...
[MemoryStorage] 数据库表初始化完成
[MemoryStorage] 检测到旧表结构，正在迁移...  ← 如果有旧数据
[MemoryStorage] 数据迁移完成                   ← 迁移成功
[EmbeddingService] 创建向量服务实例 (dummy模式)
[MemoryState] 记忆状态实例创建完成
[MemorySystem] 认知记忆系统初始化完成
[MemoryEvolution] 启动时执行演化周期...
[MemoryEvolution] 演化周期完成: 衰减处理 X 条, 标记不活跃 X 条, 删除 X 条
========================================
```

### 运行时日志

```
[ReActEngine] 开始检索认知记忆, 模型类型: local
[TauriMemoryClient] 开始检索记忆, query: ...
[MemoryRetriever] 开始检索记忆, query=..., top_k=10, min_similarity=0.3, only_active=true
[MemoryRetriever] 获取到 X 个候选记忆
[MemoryRetriever] 检索完成, 返回 X 条记忆 (top_k=X), 过滤 Y 条低相似度记忆
[ReActEngine] 检索到 X 条认知记忆
[ReActEngine] 注入记忆提示, 长度: XXX
[ReActEngine] 强化被使用的记忆: X 条          ← 回答后强化
[MemoryEvolution] 强化 X 条记忆
```

### 添加记忆日志

```
[MemoryStorage] 添加记忆: type=preference, importance=0.70, score=0.70, decay=0.005, content=...
[TauriMemoryClient] 添加记忆: preference ...
```

## 数据库表结构

### sessions 表

```sql
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    folder_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    active_agents TEXT
);
```

### messages 表

```sql
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    metadata TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
```

### memory_items 表

```sql
CREATE TABLE memory_items (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('identity', 'fact', 'preference', 'task', 'constraint', 'skill')),
    importance REAL NOT NULL DEFAULT 0.5,
    score REAL NOT NULL DEFAULT 0.5,           -- 动态权重（新增）
    decay REAL NOT NULL DEFAULT 0.01,          -- 衰减速率（新增）
    is_active INTEGER NOT NULL DEFAULT 1,      -- 是否活跃（新增）
    marked_inactive_at INTEGER,                -- 标记不活跃时间（新增）
    embedding BLOB,
    source_session_id TEXT,
    created_at INTEGER NOT NULL,
    last_accessed_at INTEGER NOT NULL,
    access_count INTEGER DEFAULT 0,
    metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_memory_type ON memory_items(type);
CREATE INDEX IF NOT EXISTS idx_memory_importance ON memory_items(importance);
CREATE INDEX IF NOT EXISTS idx_memory_score ON memory_items(score);
CREATE INDEX IF NOT EXISTS idx_memory_active ON memory_items(is_active);
CREATE INDEX IF NOT EXISTS idx_memory_created ON memory_items(created_at);
```

## 数据模型

### MemoryItem

```typescript
interface MemoryItem {
  id: string;
  content: string;
  memoryType: MemoryType;
  importance: number;          // 基础权重
  score: number;               // 动态权重（新增）
  decay: number;               // 衰减速率（新增）
  isActive: boolean;           // 是否活跃（新增）
  markedInactiveAt?: number;   // 标记不活跃时间（新增）
  embedding?: number[];
  sourceSessionId?: string;
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
  metadata?: TaskMetadata;
}
```

### RetrievalOptions（阶段三更新）

```typescript
interface RetrievalOptions {
  topK: number;                    // 返回数量（默认 10）
  memoryTypes?: MemoryType[];      // 记忆类型过滤
  minImportance?: number;          // 最小重要性（默认 0.3）
  minSimilarity: number;           // 最小相似度（默认 0.3，阶段三新增）
  onlyActive: boolean;             // 只返回活跃记忆（默认 true，阶段三新增）
  sessionId?: string;              // 会话 ID
  modelType?: ModelType;           // 模型类型（local/online）
}
```

### 演化相关类型（新增）

```typescript
interface DecayResult {
  processed: number;   // 处理的记忆数
  updated: number;     // 更新的记忆数
}

interface PruneResult {
  markedInactive: number;  // 标记为不活跃的记忆数
  deleted: number;         // 删除的记忆数
}

interface EvolutionStats {
  activeCount: number;    // 活跃记忆数
  inactiveCount: number;  // 不活跃记忆数
  avgScore: number;       // 平均分数
  avgDecay: number;       // 平均衰减速率
}

interface ScoreComponents {
  similarity: number;     // 语义相似度
  memoryScore: number;    // 记忆动态权重
}
```

## 依赖项

### Rust (Cargo.toml)

```toml
rusqlite = { version = "0.31", features = ["bundled"] }
uuid = { version = "1", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
thiserror = "1"
```

## 已知限制

1. ~~**向量计算**：当前使用 dummy 实现（基于字符的简单哈希），后续可替换为真实 embedding 模型~~ ✅ 已在阶段二解决
2. ~~**记忆提取**：认知提取 Prompt 已定义，但尚未集成到对话流程中~~ ✅ 已在阶段一解决
3. **全文搜索**：SQLite FTS5 支持已规划但未实现
4. **阈值固定**：当前 `min_similarity` 阈值固定为 0.3，未提供动态调整 UI

## 后续计划

1. ~~集成真实 embedding 模型（如 all-MiniLM-L6-v2）~~ ✅ 已完成（阶段二）
2. ~~实现自动记忆提取流程~~ ✅ 已完成（阶段一）
3. 添加全文搜索支持（FTS5）
4. 实现记忆去重和合并（阶段四 - 向量相似度去重）
5. 添加记忆导入/导出功能
6. 定期后台演化（而非仅启动时）
7. 阈值可配置（在设置中提供 `min_similarity` 调整选项）
8. 检索缓存（避免重复计算相同查询的向量）

## Memory UI 可视化面板

### 设计原则

1. UI 必须服务于"理解系统行为"，不是展示效果
2. 不允许 UI 反向影响 Memory 数据结构（禁止为了 UI 修改核心逻辑）
3. 所有数据必须直接来自现有 Memory System（不新增冗余状态）
4. UI 设计必须可扩展（未来字段变化不需要大改 UI）
5. 必须支持 Debug 模式切换

### 核心模块

#### 1. Memory List（记忆列表）

展示所有 MemoryItem，支持：
- 按 score 排序（默认）
- 按 type 筛选（identity / task / preference / fact 等）
- 搜索（基于 content）
- 多选批量删除

每条 Memory 显示字段：

| 字段 | Simple Mode | Debug Mode |
|------|-------------|------------|
| content (摘要) | ✅ | ✅ |
| type | ✅ (图标+文字) | ✅ |
| score | ✅ | ✅ |
| decay | ❌ | ✅ |
| access_count | ✅ | ✅ |
| last_accessed_at | ✅ (相对时间) | ✅ (完整时间戳) |
| is_active | ✅ (状态指示器) | ✅ |
| importance | ❌ | ✅ |
| embedding | ❌ | ✅ (前5维预览) |
| created_at | ❌ | ✅ |
| source_session_id | ❌ | ✅ |
| metadata | ❌ | ✅ (任务详情) |

#### 2. Memory Hits（本轮命中）⭐

展示"当前这次对话中被检索并使用的 memory"：

| 字段 | 说明 |
|------|------|
| rank | 排名（1, 2, 3...） |
| content | 记忆内容 |
| similarity | 语义相似度 |
| memory.score | 记忆动态权重 |
| final_score | 检索排序分数 (similarity × 0.6 + score × 0.4) |
| type | 记忆类型 |

**数据来源**：从 ReActEngine 的 `retrievedMemories` 获取，通过 `onMemoryRetrieved` 回调传递到 MemoryUIContext。

#### 3. Memory Debug Log（调试日志）

结构化展示 Memory 系统行为日志：

| 日志类型 | 说明 |
|----------|------|
| retrieval_start | 检索开始 |
| retrieval_candidates | 获取候选 memory |
| retrieval_filtered | 过滤结果 |
| retrieval_complete | 检索完成 |
| reinforce | 强化触发 |
| reinforce_complete | 强化完成 |
| decay | 衰减执行 |
| decay_complete | 衰减完成 |
| prune | 淘汰执行 |
| prune_complete | 淘汰完成 |
| add_memory | 添加记忆 |
| delete_memory | 删除记忆 |

功能：
- 按时间排序
- 可折叠展开详情
- 支持导出 JSON
- 支持清空

#### 4. Memory Operations（操作面板）

手动控制功能：

| 操作 | 说明 |
|------|------|
| Reinforce Selected | 强化选中的记忆（+0.05 score） |
| Reduce Score | 降低分数（尚未实现） |
| Delete Selected | 删除选中的记忆 |
| Run Decay | 执行记忆衰减 |
| Run Prune | 执行记忆淘汰 |
| Full Evolution Cycle | 执行完整演化周期（衰减 + 淘汰） |
| Clear Low Score (<0.3) | 清除低分数记忆 |
| Clear Inactive | 清除不活跃记忆 |
| Lock/Unlock | 锁定/解锁记忆（尚未实现） |

### 双模式 UI

通过顶部 Debug 开关控制：

**Debug Mode（调试模式）**：
- 显示全部字段（score / similarity / decay / embedding 等）
- 显示计算公式和详细过程
- 面向开发调试

**Simple Mode（简洁模式）**：
- 只显示核心信息（content + 简化状态）
- 面向普通用户

### 数据流

```
┌─────────────────────────────────────────────────────────────┐
│                    MemoryUIContext                           │
│  - debugMode: boolean                                        │
│  - currentHits: RetrievedMemory[]                            │
│  - debugLogs: MemoryDebugLogEntry[]                          │
│  - refreshTrigger: number                                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   useMemoryState Hook                        │
│  - memories: MemoryItem[]                                    │
│  - stats: MemoryStats                                        │
│  - evolutionStats: EvolutionStats                            │
│                                                              │
│  Methods:                                                    │
│  - refresh(), reinforce(), deleteMemory()                    │
│  - decay(), prune(), runEvolutionCycle()                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  TauriMemoryClient (现有)                    │
│  - getAllMemories(), getMemoryStats()                        │
│  - reinforceMemories(), deleteMemory()                       │
│  - decayMemories(), pruneMemoriesV2()                        │
└─────────────────────────────────────────────────────────────┘
```

### 验收标准

完成后，UI 必须能够回答以下问题：

| 问题 | 对应模块 | 数据来源 |
|------|----------|----------|
| 哪些 memory 被用于当前回答 | MemoryHits | ReActEngine.retrievedMemories |
| 每条 memory 的检索依据 | MemoryHits | RetrievedMemory.components |
| 哪些 memory 被过滤及原因 | MemoryDebugLog | retrieval 过程日志 |
| 是否发生了 reinforce/decay/prune | MemoryDebugLog | evolution 日志 |
| memory 的 score 变化趋势 | MemoryList + Debug Mode | MemoryItem.score |

### 国际化

支持中英文切换，翻译键位于：
- `src/i18n/locales/zh.json` - `memory.*`
- `src/i18n/locales/en.json` - `memory.*`

## 阶段一：记忆提取集成（2026-03-23）

### 核心功能

将记忆提取功能接入对话流程，实现**候选记忆（Candidate Memories）**机制，让用户可以审核、接受或拒绝提取的记忆。

### 架构流程

```
对话结束 → LLM 提取 → Candidate Memories（候选）→ 用户审核 → 写入 memory.db
                                    ↓
                              用户可在 UI 查看
```

### 新增文件

| 文件 | 功能 |
|------|------|
| `src-tauri/src/memory/candidate_storage.rs` | 候选记忆存储（SQLite 表、CRUD 操作） |
| `src/agent/memory/MemoryExtractionService.ts` | 记忆提取服务（异步触发、LLM 调用） |
| `src/components/MemoryPanel/CandidateMemories.tsx` | 候选记忆 UI 组件 |

### 新增 Tauri Commands

| Command | 功能 |
|---------|------|
| `should_extract_memories` | 判断是否满足提取条件 |
| `get_pending_candidates` | 获取待审核的候选记忆 |
| `accept_candidate` | 接受单条候选记忆 |
| `reject_candidate` | 拒绝单条候选记忆 |
| `accept_all_candidates` | 批量接受所有候选记忆（含去重） |
| `add_candidate_memory` | 添加候选记忆 |
| `clear_old_candidates` | 清理旧的候选记忆 |

### 提取触发条件

```rust
pub struct ExtractionConfig {
    pub min_message_count: usize,      // 最少消息数（默认 4）
    pub min_conversation_length: usize, // 最少对话长度（默认 200 字符）
    pub skip_tool_call_messages: bool,  // 跳过工具调用消息
}
```

**触发时机**：第 2 轮对话结束后（用户→AI→用户→AI = 4 条消息）

### 简单去重机制

```rust
pub fn check_duplicate_simple(content: &str, existing: &[MemoryItem]) -> Option<String> {
    // 1. 精确匹配
    // 2. 包含匹配（现有记忆包含候选内容）
    // 3. 反向包含匹配（候选内容包含现有记忆，且 > 20 字符）
    // 4. 关键词重叠匹配（重叠率 > 80%）
}
```

### 数据库表

```sql
CREATE TABLE candidate_memories (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    memory_type TEXT NOT NULL,
    confidence REAL NOT NULL,
    source_session_id TEXT NOT NULL,
    source_message_ids TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    status TEXT NOT NULL,  -- pending/accepted/rejected/merged
    importance REAL NOT NULL
);
```

### 验收标准

- [x] 对话结束后能自动提取记忆到候选列表
- [x] 候选记忆不直接写入 memory.db
- [x] 用户可以在 UI 查看、接受、拒绝候选记忆
- [x] 提取过程异步，不影响对话体验
- [x] 简单去重生效（不添加重复记忆）
- [x] 第 2 轮对话后触发提取

### 详细文档

参见 [PHASE1_MEMORY_EXTRACTION.md](./PHASE1_MEMORY_EXTRACTION.md)

## 阶段二：Embedding 模型集成（2026-03-24）

### 核心目标

将 dummy embedding 实现替换为本地 embedding 模型，实现真正的语义相似度计算，同时保留 dummy 作为 fallback。

### 架构设计

```
用户请求 → EmbeddingService
              │
              ├── Local Model (优先)
              │   ├── ModelScope 下载
              │   ├── Candle 推理
              │   └── Mean Pooling + L2 归一化
              │
              └── Dummy (Fallback)
                  └── 字符哈希模拟
```

### 新增依赖

```toml
candle-core = "0.9"
candle-nn = "0.9"
candle-transformers = "0.9"
tokenizers = "0.21"
hf-hub = "0.4"
ndarray = "0.16"
rand = "0.9"
```

### 修改文件清单

#### Rust 后端

| 文件路径 | 修改内容 |
|---------|---------|
| `src-tauri/Cargo.toml` | 添加 candle、tokenizers、hf-hub 等依赖 |
| `src-tauri/src/memory/embedding.rs` | 完全重写，支持本地模型加载、ModelScope 下载、推理计算 |
| `src-tauri/src/memory/mod.rs` | 导出新的类型 |
| `src-tauri/src/commands/memory.rs` | 新增 embedding 相关 Commands |
| `src-tauri/src/memory/storage.rs` | 新增向量维度迁移方法 |
| `src-tauri/src/lib.rs` | 注册新的 Commands |

#### 前端 TypeScript

| 文件路径 | 修改内容 |
|---------|---------|
| `src/agent/memory/TauriMemoryClient.ts` | 新增 embedding 相关 API |
| `src/components/SettingsView.tsx` | 新增 Embedding 模型设置 UI |
| `src/i18n/locales/zh.json` | 新增 Embedding 设置中文翻译 |
| `src/i18n/locales/en.json` | 新增 Embedding 设置英文翻译 |

### 新增 Tauri Commands

| Command | 功能 |
|---------|------|
| `get_embedding_provider` | 获取当前使用的 embedding provider |
| `initialize_embedding_with_model` | 初始化指定的 embedding 模型 |
| `recompute_all_embeddings` | 重新计算所有记忆的向量 |
| `get_stored_embedding_dimension` | 获取数据库中存储的向量维度 |
| `clear_all_embeddings` | 清除所有记忆的向量 |
| `get_available_embedding_models` | 获取可用的模型列表 |

### 核心功能实现

#### 1. Embedding Provider 枚举

```rust
pub enum EmbeddingProvider {
    Dummy,                              // Fallback
    Local { model_id: String },         // 本地模型
}
```

#### 2. ModelScope 镜像下载

```rust
fn download_from_modelscope(model_id: &str, filename: &str) -> Result<PathBuf, EmbeddingError> {
    let url = format!(
        "https://modelscope.cn/models/{}/resolve/master/{}",
        model_id, filename
    );
    // 使用 reqwest 下载文件
    // 缓存到本地目录
}
```

**下载文件**：
- `model.safetensors` 或 `pytorch_model.bin` - 模型权重
- `config.json` - 模型配置
- `tokenizer.json` - 分词器

#### 3. 本地模型推理流程

```rust
fn local_embed(&self, text: &str, local_model: &LocalModel) -> Result<Vec<f32>, EmbeddingError> {
    // 1. Tokenize 文本
    let encoded = tokenizer.encode(text, true)?;
    
    // 2. 创建输入张量
    let input_ids_tensor = Tensor::new(input_ids, device)?.unsqueeze(0)?;
    let attention_mask_tensor = Tensor::new(attention_mask, device)?.unsqueeze(0)?;
    
    // 3. 模型前向传播
    let embeddings = model.forward(&input_ids_tensor, &token_type_ids_tensor, Some(&attention_mask_tensor))?;
    
    // 4. Mean Pooling（带 attention mask 加权）
    let attention_mask_expanded = attention_mask_float.unsqueeze(2)?.expand((1, seq_len, hidden_dim))?;
    let weighted = &embeddings * &attention_mask_expanded;
    let mean_embedding = weighted.sum(1).broadcast_div(&mask_sum)?;
    
    // 5. L2 归一化
    let normalized = mean_embedding.broadcast_div(&norm)?;
    
    // 6. 返回向量
    Ok(normalized.squeeze(0)?.to_vec1::<f32>()?)
}
```

#### 4. Fallback 机制

模型加载失败时自动回退到 dummy 模式，日志会显示使用的 provider。

### 可用模型列表

| Model ID | 描述 | 维度 | 推荐 |
|----------|------|------|------|
| `BAAI/bge-small-zh-v1.5` | BGE-small-zh-v1.5 (中文, 快速) | 512 | ⭐ 推荐 |
| `BAAI/bge-base-zh-v1.5` | BGE-base-zh-v1.5 (中文, 平衡) | 768 | |
| `BAAI/bge-large-zh-v1.5` | BGE-large-zh-v1.5 (中文, 高质量) | 1024 | |
| `sentence-transformers/all-MiniLM-L6-v2` | MiniLM-L6-v2 (英文, 快速) | 384 | |
| `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` | 多语言 MiniLM | 384 | |

**推荐使用 BGE v1.5 版本**：修复了之前版本在相似度分布上的极端问题，检索效果更稳定。

### 模型缓存位置

| 平台 | 路径 |
|------|------|
| Windows | `C:\Users\<用户名>\AppData\Local\Cache\nexus-ai-assistant\embedding-models\` |
| macOS | `~/Library/Caches/nexus-ai-assistant/embedding-models/` |
| Linux | `~/.cache/nexus-ai-assistant/embedding-models/` |

### 前端 UI 集成

**设置界面位置**：设置 → AI 模型设置 → Embedding 模型

**UI 功能**：
1. 当前模型状态显示（绿色=已加载，橙色=Dummy 模式）
2. 模型选择下拉框（名称 + 维度）
3. 加载模型按钮（首次会自动下载）
4. 重新计算向量按钮
5. 清除向量按钮

### Bug 修复

#### 1. Tensor Shape Mismatch (mul)

**问题**：`Tensor error: shape mismatch in mul, lhs: [1, 29, 512], rhs: [1, 29, 1]`

**原因**：`attention_mask` 未扩展到 hidden_dim

**修复**：使用 `expand((1, seq_len, hidden_dim))` 扩展 attention mask

#### 2. Tensor Rank Error (to_vec1)

**问题**：`Tensor error: unexpected rank, expected: 1, got: 2 ([1, 512])`

**原因**：`normalized` 是 2 维张量，`to_vec1()` 期望 1 维

**修复**：使用 `squeeze(0)` 去掉 batch 维度

### 验收标准

- [x] 本地模型加载成功（首次运行会自动下载）
- [x] 语义相似度计算正确（使用真实的 BERT embedding）
- [x] Fallback 机制生效（模型加载失败时使用 dummy）
- [x] 日志显示使用的 provider
- [x] 模型从 ModelScope 下载（国内可直接访问）
- [x] 前端 UI 可查看和切换模型
- [x] 重新计算向量功能正常

### 详细文档

参见 [PHASE2_EMBEDDING_INTEGRATION.md](./PHASE2_EMBEDDING_INTEGRATION.md)

## 阶段三：Retrieval 稳定性（2026-03-25）

### 核心目标

确保检索结果稳定可用，实现 `min_similarity` 和 `only_active` 过滤机制，过滤低质量检索结果。

### 架构设计

```
用户查询 → EmbeddingService (向量计算)
              │
              ▼
         MemoryStorage (获取候选)
              │
              ├── only_active=true → 只返回活跃记忆
              │
              ▼
         MemoryRetriever (相似度计算)
              │
              ├── min_similarity 过滤 → 过滤低相似度记忆
              │
              ▼
         返回高质量结果
```

### 修改文件清单

#### Rust 后端

| 文件路径 | 修改内容 |
|---------|---------|
| `src-tauri/src/models/memory.rs` | `RetrievalOptions` 新增 `min_similarity`、`only_active` 字段 |
| `src-tauri/src/memory/retrieval.rs` | 实现相似度过滤逻辑，添加日志 |
| `src-tauri/src/memory/storage.rs` | `get_candidates()` 支持 `only_active` 动态过滤 |

#### 前端 TypeScript

| 文件路径 | 修改内容 |
|---------|---------|
| `src/types.ts` | `RetrievalOptions` 新增 `minSimilarity`、`onlyActive` 字段 |
| `src/agent/memory/TauriMemoryClient.ts` | `retrieveMemories()` 支持默认值 |

### RetrievalOptions 新增字段

```rust
pub struct RetrievalOptions {
    pub top_k: usize,
    pub memory_types: Option<Vec<MemoryType>>,
    pub min_importance: Option<f32>,
    pub min_similarity: f32,     // 新增：最小相似度阈值（默认 0.3）
    pub only_active: bool,       // 新增：只返回活跃记忆（默认 true）
    pub session_id: Option<String>,
    pub model_type: Option<ModelType>,
}
```

### 核心功能

#### 1. min_similarity 过滤

在计算相似度后，过滤掉低于阈值的记忆：

```rust
if similarity < min_similarity {
    return None;  // 过滤低相似度记忆
}
```

#### 2. only_active 过滤

在 SQL 查询阶段过滤非活跃记忆：

```rust
if options.only_active {
    query.push_str(" AND is_active = 1");
}
```

### 日志输出示例

```
[MemoryRetriever] 开始检索记忆, query="...", top_k=10, min_similarity=0.3, only_active=true
[MemoryRetriever] 获取到 28 个候选记忆
[MemoryRetriever] 检索完成, 返回 5 条记忆 (top_k=5), 过滤 23 条低相似度记忆
```

### 验收标准

- [x] `min_similarity` 过滤生效（默认 0.3）
- [x] `only_active` 控制生效（默认 true）
- [x] `top_k` 稳定返回指定数量
- [x] 低质量结果被过滤
- [x] Rust 编译通过
- [x] TypeScript 类型检查通过

### 详细文档

参见 [PHASE3_RETRIEVAL_STABILITY.md](./PHASE3_RETRIEVAL_STABILITY.md)
