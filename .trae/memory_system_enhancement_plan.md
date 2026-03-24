# Memory System 增强实现计划（修订版）

## 核心目标

让 Memory System 成为"稳定产生 + 可用"的信息源，而不是构建复杂的行为控制系统。

***

## 阶段一：记忆提取集成（最关键）

### 目标

将 extraction.rs 接入对话流程，实现自动记忆提取，但**不直接写入 memory.db**。

### 关键设计：Candidate Memories（候选记忆）阶段

```
对话结束 → LLM 提取 → Candidate Memories（候选）→ 筛选 → 写入 memory.db
                                    ↓
                              用户可在 UI 查看
```

### 实现步骤

#### 1.1 后端：定义候选记忆数据结构

**文件**: `src-tauri/src/models/memory.rs`

```rust
pub struct CandidateMemory {
    pub id: String,
    pub content: String,
    pub memory_type: MemoryType,
    pub confidence: f32,           // 提取置信度
    pub source_session_id: String,
    pub source_message_ids: Vec<String>,  // 来源消息
    pub created_at: i64,
    pub status: CandidateStatus,
}

pub enum CandidateStatus {
    Pending,      // 待审核
    Accepted,     // 已接受（写入 memory.db）
    Rejected,     // 已拒绝
    Merged,       // 已合并到现有记忆
}

pub struct ExtractionResult {
    pub candidates: Vec<CandidateMemory>,
    pub extraction_time_ms: u64,
    pub model_used: String,
}
```

#### 1.2 后端：创建候选记忆存储

**文件**: `src-tauri/src/memory/candidate_storage.rs`（新建）

```rust
pub struct CandidateStorage {
    db: Connection,
}

impl CandidateStorage {
    // 候选记忆表（内存或临时 SQLite 表）
    // 不持久化到 memory.db，只在应用运行期间保留
    
    pub fn add_candidate(&self, candidate: CandidateMemory) -> Result<String, Error>;
    pub fn get_pending_candidates(&self) -> Result<Vec<CandidateMemory>, Error>;
    pub fn accept_candidate(&self, id: String) -> Result<MemoryItem, Error>;
    pub fn reject_candidate(&self, id: String) -> Result<(), Error>;
    pub fn clear_old_candidates(&self, max_age_hours: i64) -> Result<usize, Error>;
}
```

#### 1.3 后端：实现记忆提取 Tauri Command

**文件**: `src-tauri/src/commands/memory.rs`

```rust
#[tauri::command]
pub async fn extract_memories_from_conversation(
    app: AppHandle,
    messages: Vec<ConversationMessage>,
    session_id: String,
) -> Result<ExtractionResult, String> {
    // 1. 调用 extraction 模块格式化提示词
    // 2. 调用 LLM 进行提取（复用现有 LLM 配置）
    // 3. 解析返回结果，生成 CandidateMemory
    // 4. 存储到候选记忆表
    // 5. 返回提取结果（不直接写入 memory.db）
}

#[tauri::command]
pub fn get_pending_candidates() -> Result<Vec<CandidateMemory>, String>;

#[tauri::command]
pub fn accept_candidate(id: String) -> Result<MemoryItem, String> {
    // 1. 获取候选记忆
    // 2. 简单去重检查（当前阶段用规则）
    // 3. 写入 memory.db
    // 4. 更新候选状态为 Accepted
}

#[tauri::command]
pub fn reject_candidate(id: String) -> Result<(), String>;

#[tauri::command]
pub fn accept_all_candidates() -> Result<Vec<MemoryItem>, String>;
```

#### 1.4 后端：提取触发条件

**文件**: `src-tauri/src/memory/extraction.rs`

```rust
pub struct ExtractionConfig {
    pub min_message_count: usize,      // 最少消息数才触发（默认 4）
    pub min_conversation_length: usize, // 最少对话长度（默认 200 字符）
    pub skip_tool_call_messages: bool,  // 跳过工具调用消息
}

pub fn should_extract(messages: &[ConversationMessage], config: &ExtractionConfig) -> bool {
    // 简单规则判断是否应该提取
    if messages.len() < config.min_message_count {
        return false;
    }
    // ... 其他规则
    true
}
```

#### 1.5 后端：简单置信度计算（规则替代）

**文件**: `src-tauri/src/memory/extraction.rs`

```rust
pub fn calculate_confidence(candidate: &CandidateMemory, messages: &[ConversationMessage]) -> f32 {
    let mut confidence = 0.5;  // 基础置信度
    
    // 规则加分
    if candidate.content.len() > 20 { confidence += 0.1; }
    if candidate.source_message_ids.len() > 1 { confidence += 0.1; }
    if matches!(candidate.memory_type, MemoryType::Identity | MemoryType::Preference) { 
        confidence += 0.1; 
    }
    
    confidence.min(1.0)
}
```

#### 1.6 后端：简单去重检查（规则替代）

**文件**: `src-tauri/src/memory/extraction.rs`

```rust
pub fn check_duplicate_simple(
    candidate: &CandidateMemory,
    existing: &[MemoryItem],
) -> Option<String> {
    for memory in existing {
        // 1. 精确匹配
        if memory.content == candidate.content {
            return Some(memory.id.clone());
        }
        
        // 2. 包含匹配（候选内容被现有记忆包含）
        if memory.content.contains(&candidate.content) {
            return Some(memory.id.clone());
        }
        
        // 3. 关键词重叠（简单版）
        let overlap = calculate_keyword_overlap(&candidate.content, &memory.content);
        if overlap > 0.8 {
            return Some(memory.id.clone());
        }
    }
    None
}

fn calculate_keyword_overlap(a: &str, b: &str) -> f32 {
    let a_words: HashSet<&str> = a.split_whitespace().collect();
    let b_words: HashSet<&str> = b.split_whitespace().collect();
    if a_words.is_empty() || b_words.is_empty() { return 0.0; }
    let intersection = a_words.intersection(&b_words).count();
    (intersection as f32) / (a_words.len().min(b_words.len()) as f32)
}
```

#### 1.7 前端：记忆提取客户端

**文件**: `src/agent/memory/TauriMemoryClient.ts`

```typescript
static async extractMemories(
  messages: ConversationMessage[],
  sessionId: string
): Promise<ExtractionResult> {
  return invoke('extract_memories_from_conversation', { messages, sessionId });
}

static async getPendingCandidates(): Promise<CandidateMemory[]> {
  return invoke('get_pending_candidates');
}

static async acceptCandidate(id: string): Promise<MemoryItem> {
  return invoke('accept_candidate', { id });
}

static async rejectCandidate(id: string): Promise<void> {
  return invoke('reject_candidate', { id });
}

static async acceptAllCandidates(): Promise<MemoryItem[]> {
  return invoke('accept_all_candidates');
}
```

#### 1.8 前端：集成到对话流程

**文件**: `src/agent/runtime/ReActEngine.ts`

```typescript
// 对话结束后异步触发提取
private async triggerMemoryExtraction(sessionId: string): Promise<void> {
  // 异步执行，不阻塞用户
  setTimeout(async () => {
    try {
      const messages = this.getConversationMessages();
      const result = await TauriMemoryClient.extractMemories(messages, sessionId);
      
      // 通知 UI 显示候选记忆
      if (this.context.onCandidatesExtracted) {
        this.context.onCandidatesExtracted(result.candidates);
      }
    } catch (error) {
      console.error('[MemoryExtraction] Failed:', error);
    }
  }, 100);
}
```

#### 1.9 前端：候选记忆 UI

**文件**: `src/components/MemoryPanel/CandidateMemories.tsx`（新建）

* 显示待审核的候选记忆列表

* 支持单条接受/拒绝

* 支持批量接受

* 显示提取来源（哪条消息）

### 验收标准

* [ ] 对话结束后能自动提取记忆到候选列表

* [ ] 候选记忆不直接写入 memory.db

* [ ] 用户可以在 UI 查看、接受、拒绝候选记忆

* [ ] 提取过程异步，不影响对话体验

* [ ] 简单去重生效（不添加重复记忆）

***

## 阶段二：Embedding 替换

### 目标

将 dummy 实现替换为本地 embedding 模型，保留 dummy 作为 fallback。

### 技术选型

**优先**: 本地模型 `all-MiniLM-L6-v2` 或 `bge-small-zh`
**暂不**: OpenAI API（避免依赖外部服务影响调试）

### 实现步骤

#### 2.1 添加 Rust 依赖

**文件**: `src-tauri/Cargo.toml`

```toml
[dependencies]
# 本地 embedding 支持
candle-core = "0.4"
candle-nn = "0.4"
candle-transformers = "0.4"
tokenizers = "0.15"

# 或使用 hf-hub 下载模型
hf-hub = "0.3"
```

#### 2.2 定义 Embedding Provider

**文件**: `src-tauri/src/memory/embedding.rs`

```rust
pub enum EmbeddingProvider {
    Dummy,                              // Fallback
    Local { model_path: String },       // 本地模型
}

pub struct EmbeddingConfig {
    pub provider: EmbeddingProvider,
    pub embedding_dim: usize,           // 384 (MiniLM) 或 512 (bge-small)
}

impl EmbeddingService {
    pub fn new(config: EmbeddingConfig) -> Result<Self, EmbeddingError>;
    
    pub async fn embed(&self, text: &str) -> Result<Vec<f32>, EmbeddingError> {
        match &self.config.provider {
            EmbeddingProvider::Dummy => self.dummy_embed(text),
            EmbeddingProvider::Local { model_path } => self.local_embed(text, model_path).await,
        }
    }
    
    async fn local_embed(&self, text: &str, model_path: &str) -> Result<Vec<f32>, EmbeddingError> {
        // 1. 加载 tokenizer
        // 2. tokenize 文本
        // 3. 运行模型推理
        // 4. L2 归一化
        // 5. 返回向量
    }
}
```

#### 2.3 模型文件管理

**文件**: `src-tauri/src/memory/embedding.rs`

```rust
pub fn get_default_model_path() -> PathBuf {
    // 模型存储位置：
    // Windows: C:\Users\<用户名>\AppData\Local\nexus-ai-assistant\models\
    // macOS: ~/Library/Application Support/nexus-ai-assistant/models/
    // Linux: ~/.local/share/nexus-ai-assistant/models/
}

pub async fn download_model_if_needed() -> Result<PathBuf, EmbeddingError> {
    // 首次使用时下载模型
    // 使用 hf-hub 或手动下载
}
```

#### 2.4 配置支持

**文件**: `src-tauri/src/lib.rs`

```rust
fn initialize_embedding_service() -> EmbeddingService {
    let config_path = get_config_path();
    let config = load_config(&config_path);
    
    // 尝试加载本地模型，失败则 fallback 到 dummy
    match EmbeddingService::new(EmbeddingConfig {
        provider: EmbeddingProvider::Local { 
            model_path: get_default_model_path() 
        },
        embedding_dim: 384,
    }) {
        Ok(service) => {
            info!("[Embedding] 本地模型加载成功");
            service
        }
        Err(e) => {
            warn!("[Embedding] 本地模型加载失败，使用 dummy 模式: {}", e);
            EmbeddingService::new(EmbeddingConfig {
                provider: EmbeddingProvider::Dummy,
                embedding_dim: 384,
            }).unwrap()
        }
    }
}
```

#### 2.5 向量维度迁移

**文件**: `src-tauri/src/memory/storage.rs`

* 添加向量维度校验

* 提供 `recompute_all_embeddings` 命令（切换模型后重新计算）

### 验收标准

* [ ] 本地模型加载成功

* [ ] 语义相似的内容向量相似度高

* [ ] 模型加载失败时自动 fallback 到 dummy

* [ ] 日志显示使用的 provider

***

## 阶段三：Retrieval 稳定性（简化版）

### 目标

确保检索结果稳定可用，只实现必要功能。

### 实现内容

#### 3.1 添加检索选项

**文件**: `src-tauri/src/memory/retrieval.rs`

```rust
pub struct RetrievalOptions {
    pub top_k: usize,
    pub min_importance: f32,
    pub min_similarity: f32,     // 新增：最小相似度阈值
    pub only_active: bool,       // 新增：只返回活跃记忆
    pub model_type: Option<ModelType>,
}

impl Default for RetrievalOptions {
    fn default() -> Self {
        Self {
            top_k: 10,
            min_importance: 0.3,
            min_similarity: 0.3,   // 默认过滤低相似度
            only_active: true,     // 默认只返回活跃记忆
            model_type: None,
        }
    }
}
```

#### 3.2 实现过滤逻辑

**文件**: `src-tauri/src/memory/retrieval.rs`

```rust
impl MemoryRetriever {
    pub fn retrieve(&self, query: &str, options: &RetrievalOptions) -> Result<Vec<RetrievedMemory>, MemoryError> {
        // 1. 生成查询向量
        let query_embedding = self.embedding.embed(query)?;
        
        // 2. 获取候选记忆（考虑 only_active）
        let candidates = self.storage.get_candidates(options)?;
        
        // 3. 计算相似度并过滤
        let mut scored: Vec<_> = candidates
            .into_iter()
            .filter_map(|item| {
                let embedding = item.embedding.as_ref()?;
                let similarity = cosine_similarity(&query_embedding, embedding);
                
                // 过滤低相似度
                if similarity < options.min_similarity {
                    return None;
                }
                
                let final_score = similarity * 0.6 + item.score * 0.4;
                Some((item, similarity, final_score))
            })
            .collect();
        
        // 4. 排序并截断
        scored.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap());
        scored.truncate(options.top_k);
        
        // 5. 返回结果
        Ok(scored.into_iter().map(|(item, similarity, score)| {
            RetrievedMemory {
                item,
                components: ScoreComponents { similarity, memory_score: item.score },
            }
        }).collect())
    }
}
```

#### 3.3 更新前端调用

**文件**: `src/agent/memory/TauriMemoryClient.ts`

```typescript
static async retrieveMemories(
  query: string,
  options?: Partial<RetrievalOptions>
): Promise<RetrievedMemory[]> {
  const defaultOptions: RetrievalOptions = {
    topK: 10,
    minImportance: 0.3,
    minSimilarity: 0.3,
    onlyActive: true,
    modelType: undefined,
  };
  return invoke('retrieve_memories', { 
    query, 
    options: { ...defaultOptions, ...options } 
  });
}
```

### 暂不实现

* ❌ RetrievalCache

* ❌ QualityMetrics

* ❌ explanation 自动生成

* ❌ confidence 计算

### 验收标准

* [ ] min\_similarity 过滤生效

* [ ] only\_active 控制生效

* [ ] top\_k 稳定返回指定数量

* [ ] 低质量结果被过滤

***

## 阶段四：去重与合并（延后）

**必须在 Embedding 完成后再实现**

当前阶段使用简单规则去重（阶段一已包含），待 embedding 稳定后再实现向量相似度去重。

***

## 阶段五：弱行为控制（最简版）

### 目标

只做简单规则，不实现复杂策略系统。

### 实现步骤

#### 5.1 简单行为提示

**文件**: `src/agent/memory/DefaultAgentLayer.ts`

```typescript
getBehaviorPrompt(memories: RetrievedMemory[]): string {
  const parts: string[] = [];
  
  // Preference → 调整回答风格
  const preferences = memories.filter(m => m.item.memoryType === 'preference');
  if (preferences.length > 0) {
    parts.push(`【用户偏好】\n${preferences.map(p => `- ${p.item.content}`).join('\n')}`);
  }
  
  // Task → 优先回答任务相关
  const tasks = memories.filter(m => m.item.memoryType === 'task');
  if (tasks.length > 0) {
    parts.push(`【当前任务】\n${tasks.map(t => `- ${t.item.content}`).join('\n')}`);
  }
  
  // Constraint → 强制遵守
  const constraints = memories.filter(m => m.item.memoryType === 'constraint');
  if (constraints.length > 0) {
    parts.push(`【限制条件（必须遵守）】\n${constraints.map(c => `- ${c.item.content}`).join('\n')}`);
  }
  
  return parts.length > 0 ? parts.join('\n\n') : '';
}
```

#### 5.2 集成到 ReActEngine

**文件**: `src/agent/runtime/ReActEngine.ts`

```typescript
// 在现有 formatMemoriesForPrompt 之后添加
const behaviorPrompt = defaultAgentLayer.getBehaviorPrompt(memories);
if (behaviorPrompt) {
  systemPrompt = `${systemPrompt}\n\n${behaviorPrompt}`;
}
```

### 验收标准

* [ ] Preference 记忆影响回答风格

* [ ] Task 记忆优先回答任务相关

* [ ] Constraint 记忆强制遵守

* [ ] 不改变系统行为流程

***

## 文件修改清单

### 新增文件

| 文件                                          | 说明     |
| ------------------------------------------- | ------ |
| `src-tauri/src/memory/candidate_storage.rs` | 候选记忆存储 |

### 修改文件

| 文件                                      | 修改内容                            |
| --------------------------------------- | ------------------------------- |
| `src-tauri/src/models/memory.rs`        | 添加 CandidateMemory 等类型          |
| `src-tauri/src/memory/embedding.rs`     | 添加本地模型支持                        |
| `src-tauri/src/memory/extraction.rs`    | 添加 LLM 调用、置信度计算、简单去重            |
| `src-tauri/src/memory/retrieval.rs`     | 添加 min\_similarity、only\_active |
| `src-tauri/src/commands/memory.rs`      | 新增候选记忆相关 Commands               |
| `src-tauri/Cargo.toml`                  | 添加 candle 等依赖                   |
| `src/agent/memory/TauriMemoryClient.ts` | 新增候选记忆 API                      |
| `src/agent/memory/DefaultAgentLayer.ts` | 添加简单行为提示                        |
| `src/agent/runtime/ReActEngine.ts`      | 集成提取触发                          |
| `src/types.ts`                          | 新增类型定义                          |

***

## 实施顺序

```
阶段一：记忆提取（最关键）
├── 1.1 定义候选记忆数据结构
├── 1.2 实现候选记忆存储
├── 1.3 实现 Tauri Commands
├── 1.4-1.6 提取逻辑（触发条件、置信度、简单去重）
├── 1.7-1.8 前端集成
└── 1.9 候选记忆 UI
        │
        ▼
阶段二：Embedding
├── 2.1 添加依赖
├── 2.2-2.4 实现本地模型
└── 2.5 向量迁移
        │
        ▼
阶段三：Retrieval 稳定性
├── 3.1 添加检索选项
└── 3.2-3.3 实现过滤逻辑
        │
        ▼
阶段五：弱行为控制
├── 5.1 简单行为提示
└── 5.2 集成到 ReActEngine
```

**阶段四（去重与合并）延后，待 Embedding 稳定后再实现**

***

## 验收清单

### 阶段一验收

* [ ] 对话结束后自动提取记忆到候选列表

* [ ] 候选记忆不直接写入 memory.db

* [ ] 用户可以接受/拒绝候选记忆

* [ ] 简单去重生效

### 阶段二验收

* [ ] 本地模型加载成功

* [ ] 语义相似度计算正确

* [ ] Fallback 机制生效

### 阶段三验收

* [ ] min\_similarity 过滤生效

* [ ] only\_active 控制生效

### 阶段五验收

* [ ] 行为提示正确注入

* [ ] 不改变系统流程

