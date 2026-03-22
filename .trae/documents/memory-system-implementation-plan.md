# 认知记忆系统实现计划（Rust 原生版）

## 问题背景

当前系统存在以下问题：

1. **会话数据不持久化**：每次启动软件都是空白状态，历史会话丢失
2. **FetchMemory 是全局单例**：所有会话共享同一个缓存，导致新会话被旧会话的网页内容污染
3. **缺乏会话级隔离**：不同会话的上下文没有正确隔离
4. **缺乏 AI 认知记忆**：系统无法记住用户偏好、重要事实、进行中的任务
5. **前端性能瓶颈**：IndexedDB 和 transformers.js 在前端运行，IO 延迟和 JS 线程阻塞严重拖慢 Agent 推理响应

## 重构目标

将记忆系统下沉至 **Tauri (Rust) 原生层**，实现：
- 高性能、异步、跨模型的"通用大脑"
- 支持本地模型与在线模型的深度记忆共享
- **用户认知建模**：从"信息记录"升级为"用户认知建模"

## 架构设计

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Frontend (TypeScript/React)                              │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  GlobalStateContext                                                      ││
│  │  - 会话状态管理                                                          ││
│  │  - 通过 Tauri Commands 与 Rust 后端通信                                  ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                                      ↓ Tauri IPC
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Tauri Backend (Rust)                                     │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                    Cognitive Memory Layer (认知记忆层)                    ││
│  │                                                                          ││
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────────────┐  ││
│  │  │ Memory Extraction│  │ Memory Storage   │  │ Memory Retrieval      │  ││
│  │  │ (认知建模提取)    │  │ (记忆存储)        │  │ (记忆检索)            │  ││
│  │  │                  │  │                  │  │                       │  ││
│  │  │ - identity       │  │ - SQLite         │  │ - fastembed-rs        │  ││
│  │  │ - facts          │  │ - 向量扩展       │  │ - 语义相似度          │  ││
│  │  │ - preferences    │  │ - 全文索引       │  │ - RAG 增强            │  ││
│  │  │ - tasks (状态机) │  │                  │  │                       │  ││
│  │  │ - constraints    │  │                  │  │                       │  ││
│  │  │ - skills         │  │                  │  │                       │  ││
│  │  └──────────────────┘  └──────────────────┘  └───────────────────────┘  ││
│  │           ↓                      ↓                      ↓               ││
│  │  ┌─────────────────────────────────────────────────────────────────────┐││
│  │  │                    Prompt Integration (提示集成)                     │││
│  │  │                                                                      │││
│  │  │  返回格式化的记忆提示，供 ReActEngine 注入系统提示                    │││
│  │  └─────────────────────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                      ↓                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                    Storage Layer (存储层)                                ││
│  │                                                                          ││
│  │  ┌────────────────────────────────────────────────────────────────────┐ ││
│  │  │  SQLite (Rust Backend)                                              │ ││
│  │  │  - sessions 表: 会话元数据                                          │ ││
│  │  │  - messages 表: 消息内容                                            │ ││
│  │  │  - memory_items 表: 认知记忆（含向量列）                            │ ││
│  │  │  - folders 表: 文件夹结构                                           │ ││
│  │  │  - sqlite-vec 扩展: 向量存储与检索                                  │ ││
│  │  └────────────────────────────────────────────────────────────────────┘ ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

## 核心技术选型

| 组件 | 技术选型 | 理由 |
|------|---------|------|
| **存储引擎** | SQLite + sqlite-vec | 高性能、ACID、支持向量扩展、单文件部署 |
| **向量计算** | fastembed-rs 或 candle | Rust 多线程处理向量化，性能优异 |
| **全文索引** | SQLite FTS5 | 内置全文搜索，支持中文分词 |
| **IPC 通信** | Tauri Commands | 类型安全、异步支持 |

## 认知记忆类型定义

### 6类记忆结构

| 类型 | 名称 | 说明 | 示例 |
|------|------|------|------|
| **identity** | 身份特征 | 长期稳定的用户背景、角色或定位 | 用户从事软件开发 |
| **facts** | 事实 | 用户提到的客观信息（项目、工具、环境） | 用户正在开发一个Web应用 |
| **preferences** | 偏好 | 用户的选择倾向或习惯 | 用户偏好简单直接的解决方案 |
| **tasks** | 任务 | 用户正在进行的任务（带状态机） | 开发一个AI助手 (in_progress) |
| **constraints** | 限制 | 用户的限制、资源约束或能力边界 | 用户计算资源有限 |
| **skills** | 能力 | 用户具备的能力或行为模式 | 用户具备基础编程能力 |

### Tasks 状态机

```
┌─────────┐     开始执行     ┌─────────────┐     完成     ┌──────────┐
│ pending │ ──────────────→ │ in_progress │ ───────────→ │   done   │
└─────────┘                 └─────────────┘              └──────────┘
                                  │
                                  │ 取消/失败
                                  ↓
                            ┌──────────┐
                            │ cancelled│
                            └──────────┘
```

## 数据库 Schema 设计

### SQLite 表结构

```sql
-- 会话表
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    folder_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    active_agents TEXT -- JSON array
);

-- 消息表
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    metadata TEXT, -- JSON: thinking, agentExecution, etc.
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_messages_session ON messages(session_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);

-- 文件夹表
CREATE TABLE folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    is_expanded INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL
);

-- 认知记忆表（核心）- 支持6类记忆
CREATE TABLE memory_items (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('identity', 'fact', 'preference', 'task', 'constraint', 'skill')),
    importance REAL NOT NULL DEFAULT 0.5, -- 0.0 ~ 1.0
    embedding BLOB, -- 向量数据（384维 float32）
    source_session_id TEXT,
    created_at INTEGER NOT NULL,
    last_accessed_at INTEGER NOT NULL,
    access_count INTEGER DEFAULT 0,
    metadata TEXT -- JSON 扩展字段（tasks 存储状态机信息）
);

-- 向量索引（使用 sqlite-vec）
CREATE VIRTUAL TABLE memory_vectors USING vec0(
    id TEXT PRIMARY KEY,
    embedding FLOAT[384] -- 384 维向量
);

-- 全文索引（用于关键词检索）
CREATE VIRTUAL TABLE memory_fts USING fts5(
    id,
    content,
    type,
    content='memory_items',
    content_rowid='rowid'
);

-- 触发器：自动同步全文索引
CREATE TRIGGER memory_fts_insert AFTER INSERT ON memory_items BEGIN
    INSERT INTO memory_fts(rowid, id, content, type) 
    VALUES (NEW.rowid, NEW.id, NEW.content, NEW.type);
END;

CREATE TRIGGER memory_fts_delete AFTER DELETE ON memory_items BEGIN
    INSERT INTO memory_fts(memory_fts, rowid, id, content, type) 
    VALUES ('delete', OLD.rowid, OLD.id, OLD.content, OLD.type);
END;

CREATE TRIGGER memory_fts_update AFTER UPDATE ON memory_items BEGIN
    INSERT INTO memory_fts(memory_fts, rowid, id, content, type) 
    VALUES ('delete', OLD.rowid, OLD.id, OLD.content, OLD.type);
    INSERT INTO memory_fts(rowid, id, content, type) 
    VALUES (NEW.rowid, NEW.id, NEW.content, NEW.type);
END;
```

## Rust 后端实现

### 1. 项目结构

```
src-tauri/
├── src/
│   ├── lib.rs                 # 主入口
│   ├── memory/                # 记忆系统模块
│   │   ├── mod.rs
│   │   ├── storage.rs         # SQLite 存储层
│   │   ├── embedding.rs       # 向量计算（fastembed-rs/candle）
│   │   ├── extraction.rs      # 认知建模提取
│   │   ├── retrieval.rs       # 记忆检索（RAG 增强）
│   │   └── lifecycle.rs       # 记忆生命周期管理
│   ├── commands/              # Tauri Commands
│   │   ├── mod.rs
│   │   ├── session.rs         # 会话相关命令
│   │   ├── memory.rs          # 记忆相关命令
│   │   └── embedding.rs       # 向量计算命令
│   └── models/                # 数据模型
│       ├── mod.rs
│       ├── session.rs
│       ├── message.rs
│       └── memory.rs
├── Cargo.toml
└── tauri.conf.json
```

### 2. Cargo.toml 依赖

```toml
[dependencies]
tauri = { version = "2", features = ["shell-open"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }

# SQLite
rusqlite = { version = "0.31", features = ["bundled"] }
rusqlite_migration = "1"

# 向量计算
fastembed = { version = "3", optional = true }
candle-core = { version = "0.4", optional = true }
candle-nn = { version = "0.4", optional = true }
candle-transformers = { version = "0.4", optional = true }

# 工具
uuid = { version = "1", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
thiserror = "1"
tracing = "0.1"

[features]
default = ["fastembed"]
fastembed = ["dep:fastembed"]
candle = ["dep:candle-core", "dep:candle-nn", "dep:candle-transformers"]
```

### 3. 核心数据结构

```rust
// src/models/memory.rs
use serde::{Deserialize, Serialize};

/// 6类记忆类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MemoryType {
    Identity,     // 身份特征
    Fact,         // 事实
    Preference,   // 偏好
    Task,         // 任务
    Constraint,   // 限制
    Skill,        // 能力
}

/// 任务状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Pending,
    InProgress,
    Done,
    Cancelled,
}

/// 任务元数据（存储在 memory_items.metadata 中）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskMetadata {
    pub status: TaskStatus,
    pub progress: Option<String>,
    pub next_step: Option<String>,
}

/// 记忆项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryItem {
    pub id: String,
    pub content: String,
    pub memory_type: MemoryType,
    pub importance: f32,  // 0.0 ~ 1.0
    pub embedding: Option<Vec<f32>>,
    pub source_session_id: Option<String>,
    pub created_at: i64,
    pub last_accessed_at: i64,
    pub access_count: i32,
    pub metadata: Option<TaskMetadata>,  // 仅 task 类型使用
}

/// 提取的记忆项（LLM 输出）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedItem {
    pub content: String,
    pub importance: f32,
}

/// 提取的任务项（LLM 输出）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedTask {
    pub content: String,
    pub status: TaskStatus,
    pub progress: Option<String>,
    pub next_step: Option<String>,
    pub importance: f32,
}

/// LLM 提取结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedMemory {
    pub identity: Vec<ExtractedItem>,
    pub facts: Vec<ExtractedItem>,
    pub preferences: Vec<ExtractedItem>,
    pub tasks: Vec<ExtractedTask>,
    pub constraints: Vec<ExtractedItem>,
    pub skills: Vec<ExtractedItem>,
}

/// 检索选项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetrievalOptions {
    pub top_k: usize,
    pub memory_types: Option<Vec<MemoryType>>,
    pub min_importance: Option<f32>,
    pub session_id: Option<String>,
    pub model_type: Option<ModelType>,  // 用于跨模型适配
}

/// 模型类型（用于跨模型适配）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ModelType {
    Local,   // 本地模型 (8B-14B)
    Online,  // 在线模型 (OpenAI/Claude)
}

/// 检索结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetrievedMemory {
    pub item: MemoryItem,
    pub score: f32,
    pub components: ScoreComponents,
}

/// 评分组件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoreComponents {
    pub similarity: f32,
    pub recency: f32,
    pub frequency: f32,
}
```

### 4. 认知记忆提取 Prompt

```rust
// src/memory/extraction.rs

/// 认知记忆提取系统提示
pub const COGNITIVE_MEMORY_EXTRACTION_PROMPT: &str = r#"
你是一个高级认知记忆提取系统（Cognitive Memory Extraction Engine）。

你的任务是从对话中提取"长期有价值的信息"，用于构建用户的长期记忆模型。

⚠️ 注意：
- 不要提取临时信息
- 不要依赖任何特定用户背景
- 所有示例仅用于说明结构，不代表当前用户

--------------------------------
【输入对话】
{conversation}
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

现在开始提取。
"#;
```

### 5. RAG 增强检索（跨模型适配）

```rust
// src/memory/retrieval.rs
use crate::models::{MemoryItem, MemoryType, RetrievalOptions, RetrievedMemory, ScoreComponents, ModelType};
use crate::memory::embedding::EmbeddingService;
use crate::memory::storage::MemoryStorage;

pub struct MemoryRetriever {
    storage: MemoryStorage,
    embedding: EmbeddingService,
}

// RAG 增强评分公式参数
const W_SIMILARITY: f32 = 0.5;   // 语义相似度权重
const W_RECENCY: f32 = 0.3;      // 时间衰减权重
const W_FREQUENCY: f32 = 0.2;    // 访问频率权重

impl MemoryRetriever {
    pub async fn retrieve(
        &self,
        query: &str,
        options: RetrievalOptions,
    ) -> Result<Vec<RetrievedMemory>, Box<dyn std::error::Error>> {
        // 1. 计算查询向量
        let query_embedding = self.embedding.embed(query).await?;

        // 2. 从数据库检索候选记忆
        let candidates = self.storage.get_candidates(&options).await?;

        // 3. 计算综合评分
        let mut scored: Vec<RetrievedMemory> = candidates
            .into_iter()
            .filter_map(|item| {
                let embedding = item.embedding.as_ref()?;
                let similarity = cosine_similarity(&query_embedding, embedding);
                let recency = calculate_recency(item.last_accessed_at);
                let frequency = calculate_frequency(item.access_count);

                // RAG 增强评分公式: Score = Sim × w1 + Recency × w2 + Frequency × w3
                let score = similarity * W_SIMILARITY 
                          + recency * W_RECENCY 
                          + frequency * W_FREQUENCY;

                Some(RetrievedMemory {
                    item,
                    score,
                    components: ScoreComponents {
                        similarity,
                        recency,
                        frequency,
                    },
                })
            })
            .collect();

        // 4. 按评分排序
        scored.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap());

        // 5. 跨模型适配：根据模型类型限制返回数量
        let top_k = match options.model_type {
            Some(ModelType::Local) => {
                // 本地模型 (8B-14B): Top-5，防止 Context Window 过载
                options.top_k.min(5)
            }
            Some(ModelType::Online) => {
                // 在线模型 (OpenAI/Claude): Top-10，利用长文本优势
                options.top_k.min(10)
            }
            None => options.top_k,
        };
        scored.truncate(top_k);

        // 6. 更新访问统计
        for retrieved in &scored {
            self.storage.increment_access_count(&retrieved.item.id).await?;
        }

        Ok(scored)
    }
}

/// 计算余弦相似度
fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm_a == 0.0 || norm_b == 0.0 { 0.0 } else { dot / (norm_a * norm_b) }
}

/// 计算时间衰减分数（30天半衰期）
fn calculate_recency(last_accessed: i64) -> f32 {
    let now = chrono::Utc::now().timestamp();
    let age_seconds = now - last_accessed;
    let age_days = age_seconds as f32 / (24.0 * 3600.0);
    (-age_days / 30.0).exp()
}

/// 计算访问频率分数（对数归一化）
fn calculate_frequency(access_count: i32) -> f32 {
    1.0 - 1.0 / (1.0 + (access_count as f32).ln())
}
```

### 6. Tauri Commands

```rust
// src/commands/memory.rs
use tauri::State;
use crate::memory::{MemoryRetriever, MemoryStorage, EmbeddingService};
use crate::models::{MemoryItem, MemoryType, RetrievalOptions, ExtractedMemory};

#[tauri::command]
pub async fn retrieve_memories(
    query: String,
    options: RetrievalOptions,
    retriever: State<'_, MemoryRetriever>,
) -> Result<Vec<RetrievedMemory>, String> {
    retriever.retrieve(&query, options).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_memory(
    item: MemoryItem,
    storage: State<'_, MemoryStorage>,
    embedding: State<'_, EmbeddingService>,
) -> Result<(), String> {
    // 计算向量
    let emb = embedding.embed(&item.content).await.map_err(|e| e.to_string())?;
    let mut item = item;
    item.embedding = Some(emb);
    
    storage.add(item).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn extract_and_store_memories(
    conversation: String,
    storage: State<'_, MemoryStorage>,
    embedding: State<'_, EmbeddingService>,
) -> Result<ExtractedMemory, String> {
    // 调用 LLM 提取记忆（通过前端传入或后端调用）
    // ...
}

#[tauri::command]
pub async fn get_all_memories(
    storage: State<'_, MemoryStorage>,
) -> Result<Vec<MemoryItem>, String> {
    storage.get_all().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_memories_by_type(
    memory_type: MemoryType,
    storage: State<'_, MemoryStorage>,
) -> Result<Vec<MemoryItem>, String> {
    storage.get_by_type(memory_type).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_task_status(
    id: String,
    status: TaskStatus,
    progress: Option<String>,
    next_step: Option<String>,
    storage: State<'_, MemoryStorage>,
) -> Result<(), String> {
    storage.update_task_status(&id, status, progress, next_step).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_memory(
    id: String,
    storage: State<'_, MemoryStorage>,
) -> Result<(), String> {
    storage.delete(&id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn prune_memories(
    storage: State<'_, MemoryStorage>,
) -> Result<usize, String> {
    storage.prune().await.map_err(|e| e.to_string())
}
```

### 7. 会话持久化 Commands

```rust
// src/commands/session.rs
use tauri::State;
use crate::memory::storage::SessionStorage;
use crate::models::{ChatSession, Message, ChatFolder};

#[tauri::command]
pub async fn save_session(
    session: ChatSession,
    storage: State<'_, SessionStorage>,
) -> Result<(), String> {
    storage.save_session(&session).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn load_sessions(
    storage: State<'_, SessionStorage>,
) -> Result<Vec<ChatSession>, String> {
    storage.load_sessions().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_messages(
    session_id: String,
    messages: Vec<Message>,
    storage: State<'_, SessionStorage>,
) -> Result<(), String> {
    storage.save_messages(&session_id, &messages).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn load_messages(
    session_id: String,
    storage: State<'_, SessionStorage>,
) -> Result<Vec<Message>, String> {
    storage.load_messages(&session_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_session(
    session_id: String,
    storage: State<'_, SessionStorage>,
) -> Result<(), String> {
    storage.delete_session(&session_id).await.map_err(|e| e.to_string())
}
```

## 前端集成

### TypeScript 类型定义

```typescript
// src/types.ts

/// 6类记忆类型
export type MemoryType = 'identity' | 'fact' | 'preference' | 'task' | 'constraint' | 'skill';

/// 任务状态
export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'cancelled';

/// 任务元数据
export interface TaskMetadata {
  status: TaskStatus;
  progress?: string;
  next_step?: string;
}

/// 记忆项
export interface MemoryItem {
  id: string;
  content: string;
  memoryType: MemoryType;
  importance: number;  // 0.0 ~ 1.0
  embedding?: number[];
  sourceSessionId?: string;
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
  metadata?: TaskMetadata;  // 仅 task 类型使用
}

/// 提取的记忆项
export interface ExtractedItem {
  content: string;
  importance: number;
}

/// 提取的任务项
export interface ExtractedTask {
  content: string;
  status: TaskStatus;
  progress?: string;
  next_step?: string;
  importance: number;
}

/// LLM 提取结果
export interface ExtractedMemory {
  identity: ExtractedItem[];
  facts: ExtractedItem[];
  preferences: ExtractedItem[];
  tasks: ExtractedTask[];
  constraints: ExtractedItem[];
  skills: ExtractedItem[];
}

/// 模型类型
export type ModelType = 'local' | 'online';

/// 检索选项
export interface RetrievalOptions {
  topK: number;
  memoryTypes?: MemoryType[];
  minImportance?: number;
  sessionId?: string;
  modelType?: ModelType;
}

/// 检索结果
export interface RetrievedMemory {
  item: MemoryItem;
  score: number;
  components: {
    similarity: number;
    recency: number;
    frequency: number;
  };
}
```

### Tauri Invoke 封装

```typescript
// src/agent/memory/TauriMemoryClient.ts
import { invoke } from '@tauri-apps/api/core';
import { 
  MemoryItem, 
  MemoryType, 
  RetrievalOptions, 
  RetrievedMemory, 
  TaskStatus,
  ExtractedMemory 
} from '../../types';

export class TauriMemoryClient {
  static async retrieveMemories(query: string, options: RetrievalOptions): Promise<RetrievedMemory[]> {
    return invoke('retrieve_memories', { query, options });
  }

  static async addMemory(item: Omit<MemoryItem, 'id' | 'createdAt' | 'lastAccessedAt' | 'accessCount'>): Promise<void> {
    return invoke('add_memory', { item });
  }

  static async getAllMemories(): Promise<MemoryItem[]> {
    return invoke('get_all_memories');
  }

  static async getMemoriesByType(memoryType: MemoryType): Promise<MemoryItem[]> {
    return invoke('get_memories_by_type', { memoryType });
  }

  static async updateTaskStatus(
    id: string, 
    status: TaskStatus, 
    progress?: string, 
    next_step?: string
  ): Promise<void> {
    return invoke('update_task_status', { id, status, progress, next_step });
  }

  static async deleteMemory(id: string): Promise<void> {
    return invoke('delete_memory', { id });
  }

  static async pruneMemories(): Promise<number> {
    return invoke('prune_memories');
  }
}
```

### ReActEngine 集成

```typescript
// src/agent/runtime/ReActEngine.ts
import { TauriMemoryClient } from '../memory/TauriMemoryClient';
import { RetrievedMemory, MemoryType } from '../../types';

private async buildInitialMessages(userInput: string): Promise<ConversationMessage[]> {
  // ... 现有代码 ...

  // 检索相关记忆（根据当前模型类型适配）
  const memories = await TauriMemoryClient.retrieveMemories(userInput, {
    topK: 10,
    minImportance: 0.3,
    modelType: this.getModelType()  // 'local' 或 'online'
  });

  // 格式化记忆提示
  const memoryPrompt = this.formatMemoriesForPrompt(memories);

  if (memoryPrompt) {
    systemPrompt = `${systemPrompt}\n\n${memoryPrompt}`;
  }

  // ... 继续构建消息 ...
}

private formatMemoriesForPrompt(memories: RetrievedMemory[]): string {
  if (memories.length === 0) return '';

  const lines: string[] = [
    '## 【Relevant Memories】',
    '',
    '以下是与你当前对话相关的记忆信息，请参考这些信息来更好地理解用户：',
    ''
  ];

  // 按6类记忆分组
  const identity = memories.filter(m => m.item.memoryType === 'identity');
  const facts = memories.filter(m => m.item.memoryType === 'fact');
  const preferences = memories.filter(m => m.item.memoryType === 'preference');
  const tasks = memories.filter(m => m.item.memoryType === 'task');
  const constraints = memories.filter(m => m.item.memoryType === 'constraint');
  const skills = memories.filter(m => m.item.memoryType === 'skill');

  if (identity.length > 0) {
    lines.push('### 身份特征');
    identity.forEach(i => lines.push(`- ${i.item.content}`));
    lines.push('');
  }

  if (facts.length > 0) {
    lines.push('### 已知事实');
    facts.forEach(f => lines.push(`- ${f.item.content}`));
    lines.push('');
  }

  if (preferences.length > 0) {
    lines.push('### 用户偏好');
    preferences.forEach(p => lines.push(`- ${p.item.content}`));
    lines.push('');
  }

  if (tasks.length > 0) {
    lines.push('### 进行中的任务');
    tasks.forEach(t => {
      const meta = t.item.metadata;
      if (meta) {
        lines.push(`- ${t.item.content} [${meta.status}]`);
        if (meta.progress) lines.push(`  进展: ${meta.progress}`);
        if (meta.next_step) lines.push(`  下一步: ${meta.next_step}`);
      } else {
        lines.push(`- ${t.item.content}`);
      }
    });
    lines.push('');
  }

  if (constraints.length > 0) {
    lines.push('### 限制条件');
    constraints.forEach(c => lines.push(`- ${c.item.content}`));
    lines.push('');
  }

  if (skills.length > 0) {
    lines.push('### 用户能力');
    skills.forEach(s => lines.push(`- ${s.item.content}`));
    lines.push('');
  }

  return lines.join('\n');
}
```

## 实现优先级

| 优先级 | 功能 | 预计工作量 | 依赖 |
|-------|------|-----------|------|
| P0 | SQLite 存储层（Rust） | 4小时 | 无 |
| P0 | 会话持久化 Commands | 2小时 | P0 |
| P0 | 会话级 FetchMemory 隔离（前端） | 2小时 | P0 |
| P1 | fastembed-rs 集成 | 3小时 | P0 |
| P1 | Memory Storage（6类记忆支持） | 3小时 | P0 |
| P1 | Memory Retrieval（RAG 增强 + 跨模型适配） | 4小时 | P1 |
| P1 | Memory Commands | 2小时 | P1 |
| P1 | 前端集成（TauriMemoryClient） | 2小时 | P1 |
| P2 | Memory Extraction（认知建模 LLM 调用） | 4小时 | P1 |
| P2 | Memory Lifecycle Management | 2小时 | P1 |
| P2 | Task 状态机管理 | 2小时 | P1 |
| P3 | 记忆合并与去重 | 2小时 | P2 |

**总计**：约 32 小时

## 文件清单

### Rust 后端新增文件

| 文件路径 | 功能描述 |
|---------|---------|
| `src-tauri/src/memory/mod.rs` | 记忆模块入口 |
| `src-tauri/src/memory/storage.rs` | SQLite 存储层 |
| `src-tauri/src/memory/embedding.rs` | 向量计算服务 |
| `src-tauri/src/memory/extraction.rs` | 认知建模提取 |
| `src-tauri/src/memory/retrieval.rs` | 记忆检索（RAG 增强） |
| `src-tauri/src/memory/lifecycle.rs` | 记忆生命周期管理 |
| `src-tauri/src/commands/memory.rs` | 记忆相关 Tauri Commands |
| `src-tauri/src/commands/session.rs` | 会话相关 Tauri Commands |
| `src-tauri/src/models/memory.rs` | 记忆数据模型 |
| `src-tauri/src/models/session.rs` | 会话数据模型 |

### 前端修改文件

| 文件路径 | 修改内容 |
|---------|---------|
| `src/agent/memory/TauriMemoryClient.ts` | Tauri Invoke 封装（新增） |
| `src/agent/memory/SessionMemory.ts` | 会话级 Tool Cache 管理器（新增） |
| `src/agent/memory/index.ts` | 导出新的记忆模块 |
| `src/agent/runtime/ReActEngine.ts` | 注入相关记忆到系统提示 |
| `src/context/GlobalStateContext.tsx` | 使用 Tauri Commands 进行持久化 |
| `src/types.ts` | 新增 MemoryItem 等6类记忆类型定义 |

## 7. Default Agent Layer（开箱即用模式）

这一层替用户做所有"他们不知道要做的决策"。

### 7.1 设计目标

为非技术用户提供无需配置的智能 Agent 行为，使系统具备：

- **自动记忆提取**：无需用户手动触发
- **自动记忆使用**：智能选择相关记忆
- **自动任务跟踪**：自动识别和更新任务状态
- **自动策略调整**：根据用户约束调整输出

用户无需理解 Memory System 即可获得完整体验。

### 7.2 默认行为策略（Default Policies）

#### 7.2.1 自动记忆提取（Auto Extraction）

```typescript
// 触发规则
onEveryNMessages(3) {
  runMemoryExtraction()
}

// 或当对话长度超过阈值时
if (conversationLength > THRESHOLD) {
  runMemoryExtraction()
}
```

**规则**：
- 每 3 轮对话自动触发记忆提取
- 或当对话长度 > 阈值时触发
- 使用闲置触发模式，检测 CPU 负载低或用户停止输入 30s 后执行

#### 7.2.2 自动记忆路由（Auto Routing）

引入 Memory Router（简化版），智能选择记忆类型：

```typescript
function defaultMemoryRouting(query: string): MemoryType[] {
  // 任务相关关键词
  if (containsTaskKeywords(query)) {
    return ['tasks'];
  }
  
  // 偏好/习惯相关
  if (containsPreferenceKeywords(query)) {
    return ['preferences'];
  }
  
  // 问题求解相关
  if (containsProblemSolvingKeywords(query)) {
    return ['constraints', 'skills'];
  }
  
  // 默认返回任务和约束
  return ['tasks', 'constraints'];
}

// 关键词检测
function containsTaskKeywords(query: string): boolean {
  const keywords = ['任务', '进度', '下一步', '完成', 'task', 'progress', 'todo'];
  return keywords.some(k => query.toLowerCase().includes(k));
}

function containsPreferenceKeywords(query: string): boolean {
  const keywords = ['偏好', '喜欢', '习惯', 'prefer', 'like', 'habit'];
  return keywords.some(k => query.toLowerCase().includes(k));
}

function containsProblemSolvingKeywords(query: string): boolean {
  const keywords = ['问题', '解决', '如何', '怎么', 'problem', 'solve', 'how'];
  return keywords.some(k => query.toLowerCase().includes(k));
}
```

#### 7.2.3 自动注入策略（Auto Injection）

自动格式化记忆并注入到系统提示：

```typescript
function formatMemoriesForAutoInjection(memories: RetrievedMemory[]): string {
  const sections: string[] = [];
  
  // 任务状态
  const tasks = memories.filter(m => m.item.memoryType === 'task');
  if (tasks.length > 0) {
    sections.push('## Relevant Task State');
    tasks.forEach(t => {
      const meta = t.item.metadata;
      sections.push(`- ${t.item.content} [${meta?.status || 'unknown'}]`);
      if (meta?.progress) sections.push(`  进展: ${meta.progress}`);
      if (meta?.next_step) sections.push(`  下一步: ${meta.next_step}`);
    });
  }
  
  // 约束条件
  const constraints = memories.filter(m => m.item.memoryType === 'constraint');
  if (constraints.length > 0) {
    sections.push('## Constraints');
    constraints.forEach(c => sections.push(`- ${c.item.content}`));
  }
  
  // 用户偏好
  const preferences = memories.filter(m => m.item.memoryType === 'preference');
  if (preferences.length > 0) {
    sections.push('## Preferences');
    preferences.forEach(p => sections.push(`- ${p.item.content}`));
  }
  
  return sections.join('\n');
}
```

**规则**：
- 最多注入 Top-K（默认 5 条）
- 按 importance 排序
- 优先注入任务和约束

#### 7.2.4 自动任务跟踪（Task Tracking）

当检测到用户行为时自动创建/更新任务：

```typescript
// 任务创建触发词
const TASK_START_PATTERNS = [
  /我要做/,
  /我正在/,
  /帮我/,
  /我需要/,
  /I want to/,
  /I'm working on/,
  /Help me/,
  /I need to/
];

// 任务完成触发词
const TASK_COMPLETE_PATTERNS = [
  /完成了/,
  /做好了/,
  /解决了/,
  /finished/,
  /done/,
  /completed/
];

function detectAndTrackTask(userInput: string, currentTasks: MemoryItem[]): void {
  // 检测新任务
  for (const pattern of TASK_START_PATTERNS) {
    if (pattern.test(userInput)) {
      // 自动创建任务
      createTask({
        content: extractTaskContent(userInput),
        status: 'in_progress',
        progress: '',
        next_step: inferNextStep(userInput)
      });
      return;
    }
  }
  
  // 检测任务更新
  for (const task of currentTasks) {
    if (isRelatedToTask(userInput, task)) {
      // 更新任务进度
      updateTaskProgress(task.id, {
        progress: extractProgress(userInput),
        next_step: inferNextStep(userInput)
      });
    }
    
    // 检测任务完成
    for (const pattern of TASK_COMPLETE_PATTERNS) {
      if (pattern.test(userInput) && isRelatedToTask(userInput, task)) {
        completeTask(task.id);
      }
    }
  }
}
```

**自动创建任务示例**：
```json
{
  "content": "开发一个AI助手",
  "status": "in_progress",
  "progress": "",
  "next_step": "自动推测下一步"
}
```

当用户继续相关内容时：
- 自动更新 `progress` / `next_step`
- 自动关联相关记忆

#### 7.2.5 自动约束应用（Constraint Awareness）

在主 Prompt 中增加约束感知指令：

```typescript
const CONSTRAINT_AWARENESS_PROMPT = `
## Constraint Awareness

请在回答时自动考虑用户的限制条件（constraints），并调整输出复杂度和方案。

例如：
- 如果用户计算资源有限，优先推荐轻量级方案
- 如果用户时间有限，优先提供快速解决方案
- 如果用户技术能力有限，避免过于复杂的实现

当前用户约束：
{constraints}
`;
```

### 7.3 用户无感知原则（Zero-Config Principle）

系统必须满足以下原则：

| 原则 | 说明 |
|------|------|
| **不要求用户设置记忆** | 所有记忆自动提取和管理 |
| **不要求用户管理记忆** | 记忆生命周期自动管理 |
| **自动优化行为** | 根据用户行为模式自动调整策略 |
| **透明但可忽略** | 用户可以查看记忆，但不需要管理 |

### 7.4 高级模式（可选）

允许开发者关闭默认行为：

```typescript
interface AgentConfig {
  // 记忆系统配置
  autoMemory?: boolean;           // 默认: true
  autoMemoryExtraction?: boolean; // 默认: true
  extractionInterval?: number;    // 默认: 3 (每3轮)
  
  // 任务跟踪配置
  autoTaskTracking?: boolean;     // 默认: true
  taskDetectionPatterns?: string[]; // 自定义任务检测模式
  
  // 记忆路由配置
  autoRouting?: boolean;          // 默认: true
  customRoutingRules?: RoutingRule[]; // 自定义路由规则
  
  // 注入配置
  maxMemoryInjection?: number;    // 默认: 5
  minImportanceThreshold?: number; // 默认: 0.3
}

// 使用示例
const agentConfig: AgentConfig = {
  autoMemory: true,
  autoTaskTracking: true,
  autoRouting: true,
  maxMemoryInjection: 5
};

// 关闭自动行为（高级用户）
const advancedConfig: AgentConfig = {
  autoMemory: false,
  autoTaskTracking: false,
  autoRouting: false
};
```

### 7.5 实现架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Default Agent Layer                                      │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Auto Extraction Trigger                                                 ││
│  │  - 每 N 轮对话触发                                                        ││
│  │  - 闲置触发模式（CPU 低负载 / 用户停止输入 30s）                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                      ↓                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Memory Router                                                           ││
│  │  - 关键词检测 → 选择记忆类型                                              ││
│  │  - 智能路由到最相关的记忆                                                 ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                      ↓                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Task Tracker                                                            ││
│  │  - 检测任务关键词 → 自动创建任务                                          ││
│  │  - 检测进度关键词 → 自动更新任务状态                                      ││
│  │  - 检测完成关键词 → 自动标记任务完成                                      ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                      ↓                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Auto Injector                                                           ││
│  │  - 格式化记忆 → 注入系统提示                                              ││
│  │  - 按 importance 排序                                                    ││
│  │  - 限制 Top-K 数量                                                       ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

## 目标能力

完成本系统后，AI 将具备：

1. **跨会话记忆**：记住用户在不同会话中提到的重要信息
2. **用户认知建模**：构建完整的用户画像（身份、偏好、能力、限制）
3. **任务持续性**：记住进行中的任务及其状态，在后续对话中继续推进
4. **高性能响应**：Rust 后端处理，无前端 IO 阻塞
5. **跨模型共享**：本地模型和在线模型共享同一套记忆系统
6. **智能适配**：根据模型类型自动调整记忆注入量
7. **开箱即用**：用户无需配置即可获得完整的智能记忆体验

---

*计划更新时间: 2026-03-22*
