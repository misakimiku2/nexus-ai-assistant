# 阶段一：记忆提取集成 - 实现总结

## 实现日期

2026-03-23

## 核心目标

将记忆提取功能接入对话流程，实现**候选记忆（Candidate Memories）**机制，让用户可以审核、接受或拒绝提取的记忆，而不是直接写入 memory.db。

## 架构设计

```
对话结束 → LLM 提取 → Candidate Memories（候选）→ 用户审核 → 写入 memory.db
                                    ↓
                              用户可在 UI 查看
```

## 新增文件清单

### Rust 后端

| 文件路径 | 功能描述 |
|---------|---------|
| `src-tauri/src/memory/candidate_storage.rs` | 候选记忆存储（SQLite 表、CRUD 操作） |

### 前端 TypeScript

| 文件路径 | 功能描述 |
|---------|---------|
| `src/agent/memory/MemoryExtractionService.ts` | 记忆提取服务（异步触发、LLM 调用、候选转换） |
| `src/components/MemoryPanel/CandidateMemories.tsx` | 候选记忆 UI 组件（列表展示、接受/拒绝操作） |

## 修改文件清单

### Rust 后端

| 文件路径 | 修改内容 |
|---------|---------|
| `src-tauri/src/models/memory.rs` | 新增 `CandidateMemory`、`CandidateStatus`、`ExtractionResult`、`ExtractionConfig`、`ConversationMessage` 类型 |
| `src-tauri/src/memory/mod.rs` | 导出 `candidate_storage` 模块 |
| `src-tauri/src/memory/extraction.rs` | 新增 `should_extract()`、`calculate_confidence()`、`check_duplicate_simple()`、`convert_extracted_to_candidates()` 函数 |
| `src-tauri/src/memory/storage.rs` | 新增 `get_connection()` 方法，修复 UTF-8 字符串切片问题 |
| `src-tauri/src/memory/retrieval.rs` | 修复 UTF-8 字符串切片问题 |
| `src-tauri/src/commands/memory.rs` | 新增候选记忆相关 Commands，`MemoryState` 添加 `candidate_storage` |
| `src-tauri/src/lib.rs` | 注册新的 Tauri Commands |

### 前端 TypeScript

| 文件路径 | 修改内容 |
|---------|---------|
| `src/types.ts` | 新增 `CandidateMemory`、`CandidateStatus`、`ExtractionResult`、`ExtractionConfig`、`ConversationMessage` 类型 |
| `src/agent/memory/TauriMemoryClient.ts` | 新增候选记忆相关 API 方法 |
| `src/agent/memory/index.ts` | 导出 `MemoryExtractionService` |
| `src/agent/types.ts` | `AgentExecutionContext` 新增 `sessionId` 字段 |
| `src/agent/runtime/AgentRuntime.ts` | `execute()` 方法新增 `sessionId` 参数 |
| `src/agent/runtime/ReActEngine.ts` | 对话结束后触发记忆提取，传递 `sessionId` |
| `src/hooks/useAgentExecution.ts` | `execute()` 方法新增 `sessionId` 参数 |
| `src/App.tsx` | 传递 `currentSessionId` 到 `agentExecution.execute()` |
| `src/components/MemoryPanel/types.ts` | 新增 `candidates` 标签页类型 |
| `src/components/MemoryPanel/index.tsx` | 集成候选记忆标签页 |
| `src/components/MemoryPanel/MemoryHits.tsx` | 修复 `memoryScore` 字段安全检查 |
| `src/i18n/locales/zh.json` | 新增候选记忆中文翻译 |
| `src/i18n/locales/en.json` | 新增候选记忆英文翻译 |

## 新增 Tauri Commands

| Command | 功能 |
|---------|------|
| `should_extract_memories` | 判断是否满足提取条件 |
| `get_pending_candidates` | 获取待审核的候选记忆 |
| `accept_candidate` | 接受单条候选记忆 |
| `reject_candidate` | 拒绝单条候选记忆 |
| `accept_all_candidates` | 批量接受所有候选记忆（含去重） |
| `add_candidate_memory` | 添加候选记忆 |
| `clear_old_candidates` | 清理旧的候选记忆 |

## 核心功能实现

### 1. 提取触发条件

```rust
pub struct ExtractionConfig {
    pub min_message_count: usize,      // 最少消息数（默认 4）
    pub min_conversation_length: usize, // 最少对话长度（默认 200 字符）
    pub skip_tool_call_messages: bool,  // 跳过工具调用消息
}
```

**触发时机**：第 2 轮对话结束后（用户→AI→用户→AI = 4 条消息）

### 2. 置信度计算

```rust
pub fn calculate_confidence(
    content: &str,
    memory_type: &MemoryType,
    source_message_count: usize,
) -> f32 {
    let mut confidence: f32 = 0.5;  // 基础置信度

    // 内容长度加分
    if content.len() > 20 { confidence += 0.1; }
    if content.len() > 50 { confidence += 0.05; }

    // 来源消息数加分
    if source_message_count > 1 { confidence += 0.1; }
    if source_message_count > 3 { confidence += 0.05; }

    // 记忆类型加分
    match memory_type {
        MemoryType::Identity | MemoryType::Preference => confidence += 0.1,
        MemoryType::Constraint => confidence += 0.05,
        _ => {}
    }

    confidence.min(1.0_f32)
}
```

### 3. 简单去重检查

```rust
pub fn check_duplicate_simple(content: &str, existing: &[MemoryItem]) -> Option<String> {
    for memory in existing {
        // 1. 精确匹配
        if memory.content == content { return Some(memory.id.clone()); }

        // 2. 包含匹配（现有记忆包含候选内容）
        if memory.content.contains(content) { return Some(memory.id.clone()); }

        // 3. 反向包含匹配（候选内容包含现有记忆，且现有记忆 > 20 字符）
        if content.contains(&memory.content) && memory.content.len() > 20 {
            return Some(memory.id.clone());
        }

        // 4. 关键词重叠匹配（重叠率 > 80%）
        let overlap = calculate_keyword_overlap(content, &memory.content);
        if overlap > 0.8 { return Some(memory.id.clone()); }
    }
    None
}
```

### 4. 批量接受时的增量去重

```rust
// accept_all_candidates 中
let mut existing = storage.get_all_memories().await?;

for candidate in candidates {
    // 检查与已存储记忆 + 已接受记忆的重复
    if check_duplicate_simple(&candidate.content, &existing).is_some() {
        // 跳过重复
        continue;
    }
    
    // 接受并加入 existing 列表，供后续候选检查
    storage.add_memory(memory_item.clone()).await?;
    existing.push(memory_item.clone());
}
```

## 数据库表结构

### candidate_memories 表

```sql
CREATE TABLE candidate_memories (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    memory_type TEXT NOT NULL,
    confidence REAL NOT NULL,
    source_session_id TEXT NOT NULL,
    source_message_ids TEXT NOT NULL,  -- JSON 数组
    created_at INTEGER NOT NULL,
    status TEXT NOT NULL,              -- pending/accepted/rejected/merged
    importance REAL NOT NULL
);

CREATE INDEX idx_candidate_status ON candidate_memories(status);
CREATE INDEX idx_candidate_session ON candidate_memories(source_session_id);
```

## Bug 修复

### 1. UTF-8 字符串切片问题

**问题**：`&query[..50]` 按字节切割，在中文等多字节字符处会 panic

**修复**：
```rust
// 错误
&query[..50]

// 正确
query.chars().take(50).collect::<String>()
```

**影响文件**：
- `src-tauri/src/memory/retrieval.rs`
- `src-tauri/src/memory/storage.rs`

### 2. sessionId 未传递问题

**问题**：`ReActEngine` 中 `this.context.sessionId` 为 `undefined`，导致跳过记忆提取

**修复**：从 `App.tsx` → `useAgentExecution.ts` → `AgentRuntime.ts` → `ReActEngine.ts` 完整传递 `sessionId`

### 3. memoryScore 字段序列化问题

**问题**：后端返回 `memory_score` (snake_case)，前端期望 `memoryScore` (camelCase)

**修复**：
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoreComponents {
    pub similarity: f32,
    #[serde(rename = "memoryScore")]  // 添加 rename
    pub memory_score: f32,
}
```

### 4. MemoryHits 组件崩溃

**问题**：`hit.components` 可能为 `undefined`，调用 `.toFixed()` 时崩溃

**修复**：添加安全检查
```typescript
const similarity = hit.components?.similarity ?? 0;
const memoryScore = hit.components?.memoryScore ?? 0;
```

## 验收标准

- [x] 对话结束后能自动提取记忆到候选列表
- [x] 候选记忆不直接写入 memory.db
- [x] 用户可以在 UI 查看、接受、拒绝候选记忆
- [x] 提取过程异步，不影响对话体验
- [x] 简单去重生效（不添加重复记忆）
- [x] 第 2 轮对话后触发提取（而非第 3 轮）

## 已知限制

1. **LLM API 限制**：对话内容过长（如 8000+ 字符）可能导致 API 400 错误
2. **去重能力有限**：简单去重无法识别语义相似但表述不同的记忆（如 "用户是程序员" vs "用户从事软件开发"）
3. **提取质量依赖 LLM**：提取的记忆质量取决于 LLM 的理解能力

## 后续优化方向

1. **截断长对话**：在调用 LLM 提取前截断过长的对话内容
2. **向量相似度去重**（阶段四）：使用 embedding 计算语义相似度进行去重
3. **提取结果缓存**：避免重复提取相同内容
4. **用户反馈学习**：根据用户接受/拒绝的行为优化提取策略


# 阶段二：Embedding 模型集成 - 实现总结

## 实现日期

2026-03-24

## 核心目标

将 dummy embedding 实现替换为本地 embedding 模型，实现真正的语义相似度计算，同时保留 dummy 作为 fallback。

## 架构设计

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

## 新增依赖

### Rust (Cargo.toml)

```toml
candle-core = "0.9"
candle-nn = "0.9"
candle-transformers = "0.9"
tokenizers = "0.21"
hf-hub = "0.4"
ndarray = "0.16"
rand = "0.9"
```

## 修改文件清单

### Rust 后端

| 文件路径 | 修改内容 |
|---------|---------|
| `src-tauri/Cargo.toml` | 添加 candle、tokenizers、hf-hub 等依赖 |
| `src-tauri/src/memory/embedding.rs` | 完全重写，支持本地模型加载、ModelScope 下载、推理计算 |
| `src-tauri/src/memory/mod.rs` | 导出新的类型 |
| `src-tauri/src/commands/memory.rs` | 新增 embedding 相关 Commands |
| `src-tauri/src/memory/storage.rs` | 新增向量维度迁移方法 |
| `src-tauri/src/lib.rs` | 注册新的 Commands |

### 前端 TypeScript

| 文件路径 | 修改内容 |
|---------|---------|
| `src/agent/memory/TauriMemoryClient.ts` | 新增 embedding 相关 API |
| `src/components/SettingsView.tsx` | 新增 Embedding 模型设置 UI |
| `src/i18n/locales/zh.json` | 新增 Embedding 设置中文翻译 |
| `src/i18n/locales/en.json` | 新增 Embedding 设置英文翻译 |

## 新增 Tauri Commands

| Command | 功能 |
|---------|------|
| `get_embedding_provider` | 获取当前使用的 embedding provider |
| `initialize_embedding_with_model` | 初始化指定的 embedding 模型 |
| `recompute_all_embeddings` | 重新计算所有记忆的向量 |
| `get_stored_embedding_dimension` | 获取数据库中存储的向量维度 |
| `clear_all_embeddings` | 清除所有记忆的向量 |
| `get_available_embedding_models` | 获取可用的模型列表 |

## 核心功能实现

### 1. Embedding Provider 枚举

```rust
pub enum EmbeddingProvider {
    Dummy,                              // Fallback
    Local { model_id: String },         // 本地模型
}
```

### 2. EmbeddingConfig 配置

```rust
pub struct EmbeddingConfig {
    pub provider: EmbeddingProvider,
    pub embedding_dim: usize,           // 384/512/768/1024
    pub max_seq_length: usize,          // 最大序列长度
}
```

### 3. ModelScope 镜像下载

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

### 4. 本地模型推理

```rust
fn local_embed(&self, text: &str, local_model: &LocalModel) -> Result<Vec<f32>, EmbeddingError> {
    // 1. Tokenize 文本
    let encoded = tokenizer.encode(text, true)?;
    
    // 2. 创建输入张量
    let input_ids_tensor = Tensor::new(input_ids, device)?.unsqueeze(0)?;
    let attention_mask_tensor = Tensor::new(attention_mask, device)?.unsqueeze(0)?;
    let token_type_ids_tensor = Tensor::new(token_type_ids, device)?.unsqueeze(0)?;
    
    // 3. 模型前向传播
    let embeddings = model.forward(&input_ids_tensor, &token_type_ids_tensor, Some(&attention_mask_tensor))?;
    
    // 4. Mean Pooling（带 attention mask 加权）
    let weighted = &embeddings * &attention_mask_expanded;
    let mean_embedding = weighted.sum(1).broadcast_div(&mask_sum)?;
    
    // 5. L2 归一化
    let normalized = mean_embedding.broadcast_div(&norm)?;
    
    // 6. 返回向量
    Ok(normalized.squeeze(0)?.to_vec1::<f32>()?)
}
```

### 5. Fallback 机制

```rust
pub fn with_config(config: EmbeddingConfig) -> Result<Self, EmbeddingError> {
    if matches!(config.provider, EmbeddingProvider::Local { .. }) {
        match service.load_local_model(&config) {
            Ok(model) => {
                service.local_model = Some(Arc::new(model));
            }
            Err(e) => {
                log::warn!("本地模型加载失败，使用 dummy 模式: {}", e);
                service.provider = EmbeddingProvider::Dummy;
            }
        }
    }
    Ok(service)
}
```

### 6. 向量维度迁移

```rust
// Storage 新增方法
pub async fn get_memories_without_embedding() -> Result<Vec<MemoryItem>, Error>;
pub async fn update_embedding(id: &str, embedding: &[f32]) -> Result<(), Error>;
pub async fn clear_all_embeddings() -> Result<usize, Error>;
pub async fn get_embedding_dimension() -> Result<Option<usize>, Error>;
```

## 可用模型列表

| Model ID | 描述 | 维度 | 推荐 |
|----------|------|------|------|
| `BAAI/bge-small-zh-v1.5` | BGE-small-zh-v1.5 (中文, 快速) | 512 | ⭐ 推荐 |
| `BAAI/bge-base-zh-v1.5` | BGE-base-zh-v1.5 (中文, 平衡) | 768 | |
| `BAAI/bge-large-zh-v1.5` | BGE-large-zh-v1.5 (中文, 高质量) | 1024 | |
| `sentence-transformers/all-MiniLM-L6-v2` | MiniLM-L6-v2 (英文, 快速) | 384 | |
| `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` | 多语言 MiniLM | 384 | |

**推荐使用 BGE v1.5 版本**：修复了之前版本在相似度分布上的极端问题，检索效果更稳定。

## 模型缓存位置

| 平台 | 路径 |
|------|------|
| Windows | `C:\Users\<用户名>\AppData\Local\Cache\nexus-ai-assistant\embedding-models\` |
| macOS | `~/Library/Caches/nexus-ai-assistant/embedding-models/` |
| Linux | `~/.cache/nexus-ai-assistant/embedding-models/` |

## 前端 UI 集成

### 设置界面位置

**设置 → AI 模型设置 → Embedding 模型**

### UI 功能

1. **当前模型状态显示**
   - 绿色圆点：本地模型已加载
   - 橙色圆点：使用 Dummy 模式
   - 显示存储的向量维度

2. **模型选择**
   - 下拉框显示可用模型列表（名称 + 维度）
   - 加载模型按钮（首次会自动下载）

3. **操作按钮**
   - 重新计算向量：切换模型后更新所有记忆的向量
   - 清除向量：清除所有记忆的向量数据

### 翻译键

```json
{
  "settings.ai.embedding.title": "Embedding 模型",
  "settings.ai.embedding.subtitle": "用于记忆检索和语义相似度计算",
  "settings.ai.embedding.currentModel": "当前模型",
  "settings.ai.embedding.selectModel": "选择模型",
  "settings.ai.embedding.loadModel": "加载模型",
  "settings.ai.embedding.loading": "加载中...",
  "settings.ai.embedding.modelReady": "模型就绪",
  "settings.ai.embedding.usingDummy": "使用 Dummy 模式",
  "settings.ai.embedding.dimension": "向量维度",
  "settings.ai.embedding.recomputeEmbeddings": "重新计算向量",
  "settings.ai.embedding.clearEmbeddings": "清除向量",
  "settings.ai.embedding.downloadHint": "模型文件约 90MB，下载完成后将自动加载"
}
```

## Bug 修复

### 1. Tensor Shape Mismatch (mul)

**问题**：`Tensor error: shape mismatch in mul, lhs: [1, 29, 512], rhs: [1, 29, 1]`

**原因**：`attention_mask` 未扩展到 hidden_dim

**修复**：
```rust
let (_, seq_len, hidden_dim) = embeddings.dims3()?;
let attention_mask_expanded = attention_mask_float
    .unsqueeze(2)?
    .expand((1, seq_len, hidden_dim))?;  // 扩展到 [1, seq_len, hidden_dim]
```

### 2. Tensor Rank Error (to_vec1)

**问题**：`Tensor error: unexpected rank, expected: 1, got: 2 ([1, 512])`

**原因**：`normalized` 是 2 维张量，`to_vec1()` 期望 1 维

**修复**：
```rust
let normalized_1d = normalized.squeeze(0)?;  // [1, 512] -> [512]
let embedding_vec = normalized_1d.to_vec1::<f32>()?;
```

## 验收标准

- [x] 本地模型加载成功（首次运行会自动下载）
- [x] 语义相似度计算正确（使用真实的 BERT embedding）
- [x] Fallback 机制生效（模型加载失败时使用 dummy）
- [x] 日志显示使用的 provider
- [x] 模型从 ModelScope 下载（国内可直接访问）
- [x] 前端 UI 可查看和切换模型
- [x] 重新计算向量功能正常

## 已知限制

1. **首次下载时间**：模型文件约 90MB，首次加载需要下载
2. **内存占用**：本地模型加载后会占用一定内存
3. **GPU 加速**：支持 CUDA，但需要正确安装 CUDA 驱动

## 后续优化方向

1. **模型预热**：应用启动时预加载模型
2. **批量推理**：支持批量文本 embedding 计算
3. **模型切换 UI 优化**：显示下载进度
4. **自定义模型路径**：支持用户指定本地模型路径


# 阶段三：Retrieval 稳定性（简化版） - 实现总结

## 实现日期

2026-03-25

## 核心目标

确保检索结果稳定可用，实现 `min_similarity` 和 `only_active` 过滤机制，过滤低质量检索结果。

## 架构设计

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

## 修改文件清单

### Rust 后端

| 文件路径 | 修改内容 |
|---------|---------|
| `src-tauri/src/models/memory.rs` | `RetrievalOptions` 新增 `min_similarity`、`only_active` 字段 |
| `src-tauri/src/memory/retrieval.rs` | 实现相似度过滤逻辑，添加日志 |
| `src-tauri/src/memory/storage.rs` | `get_candidates()` 支持 `only_active` 动态过滤 |

### 前端 TypeScript

| 文件路径 | 修改内容 |
|---------|---------|
| `src/types.ts` | `RetrievalOptions` 新增 `minSimilarity`、`onlyActive` 字段 |
| `src/agent/memory/TauriMemoryClient.ts` | `retrieveMemories()` 支持默认值 |

## 核心功能实现

### 1. RetrievalOptions 新增字段

```rust
pub struct RetrievalOptions {
    pub top_k: usize,
    pub memory_types: Option<Vec<MemoryType>>,
    pub min_importance: Option<f32>,
    pub min_similarity: f32,     // 新增：最小相似度阈值
    pub only_active: bool,       // 新增：只返回活跃记忆
    pub session_id: Option<String>,
    pub model_type: Option<ModelType>,
}

impl Default for RetrievalOptions {
    fn default() -> Self {
        Self {
            top_k: 10,
            memory_types: None,
            min_importance: Some(0.3),
            min_similarity: 0.3,   // 默认过滤低相似度
            only_active: true,     // 默认只返回活跃记忆
            session_id: None,
            model_type: None,
        }
    }
}
```

### 2. 相似度过滤逻辑

```rust
pub async fn retrieve(
    &self,
    query: &str,
    options: RetrievalOptions,
) -> Result<Vec<RetrievedMemory>, Box<dyn std::error::Error>> {
    let query_embedding = self.embedding.embed(query).await?;
    let candidates = self.storage.get_candidates(&options).await?;
    
    let candidates_count = candidates.len();
    let min_similarity = options.min_similarity;
    
    let mut scored: Vec<RetrievedMemory> = candidates
        .into_iter()
        .filter_map(|item| {
            let embedding = item.embedding.as_ref()?;
            let similarity = cosine_similarity(&query_embedding, embedding);
            
            // 过滤低相似度
            if similarity < min_similarity {
                return None;
            }
            
            let memory_score = item.score;
            let final_score = similarity * 0.6 + memory_score * 0.4;

            Some(RetrievedMemory {
                item,
                score: final_score,
                components: ScoreComponents { similarity, memory_score },
            })
        })
        .collect();

    // 排序、截断...
    
    log::info!("[MemoryRetriever] 检索完成, 返回 {} 条记忆, 过滤 {} 条低相似度记忆", 
        scored.len(), candidates_count - scored.len());
    
    Ok(scored)
}
```

### 3. only_active 动态过滤

```rust
pub async fn get_candidates(&self, options: &RetrievalOptions) -> Result<Vec<MemoryItem>, Box<dyn std::error::Error>> {
    let mut query = String::from(
        "SELECT ... FROM memory_items WHERE 1=1"
    );
    
    // 根据 only_active 选项动态添加条件
    if options.only_active {
        query.push_str(" AND is_active = 1");
    }
    
    // 其他过滤条件...
}
```

### 4. 前端默认值支持

```typescript
static async retrieveMemories(query: string, options?: Partial<RetrievalOptions>): Promise<RetrievedMemory[]> {
  const defaultOptions: RetrievalOptions = {
    topK: 10,
    minImportance: 0.3,
    minSimilarity: 0.3,   // 默认过滤低相似度
    onlyActive: true,     // 默认只返回活跃记忆
    modelType: undefined,
    memoryTypes: undefined,
    sessionId: undefined,
  };
  const finalOptions = { ...defaultOptions, ...options };
  return invoke('retrieve_memories', { query, options: finalOptions });
}
```

## 日志输出

### 检索日志示例

```
[MemoryRetriever] 开始检索记忆, query="鸣潮的3.2版本剧情评价..."..., top_k=10, min_similarity=0.3, only_active=true
[MemoryRetriever] 获取到 28 个候选记忆
[MemoryRetriever] 检索完成, 返回 5 条记忆 (top_k=5), 过滤 23 条低相似度记忆
```

### 前端日志示例

```
[TauriMemoryClient] 开始检索记忆, query: xxx, options: {topK: 10, minImportance: 0.3, minSimilarity: 0.3, onlyActive: true, ...}
[TauriMemoryClient] 检索完成, 返回 5 条记忆
```

## 验收标准

- [x] `min_similarity` 过滤生效（默认 0.3）
- [x] `only_active` 控制生效（默认 true）
- [x] `top_k` 稳定返回指定数量
- [x] 低质量结果被过滤
- [x] Rust 编译通过
- [x] TypeScript 类型检查通过

## 测试验证

### 测试场景

1. **正常检索**：发送对话消息，观察日志输出
2. **相似度过滤**：确认日志显示"过滤 X 条低相似度记忆"
3. **活跃状态过滤**：将记忆标记为非活跃后，候选数量减少

### 实际测试结果

```
[MemoryRetriever] 开始检索记忆, query="鸣潮的3.2版本剧情评价..."..., top_k=10, min_similarity=0.3, only_active=true
[MemoryRetriever] 获取到 28 个候选记忆
[MemoryRetriever] 检索完成, 返回 5 条记忆 (top_k=5), 过滤 23 条低相似度记忆
```

**结论**：阶段三功能完全正常工作。

## 已知限制

1. **阈值固定**：当前 `min_similarity` 阈值固定为 0.3，未提供动态调整 UI
2. **Debug 日志级别**：低相似度过滤详情使用 `log::debug!`，需要开启 debug 级别才能看到

## 后续优化方向

1. **阈值可配置**：在设置中提供 `min_similarity` 调整选项
2. **检索缓存**：避免重复计算相同查询的向量
3. **批量检索**：支持一次检索多个查询
4. **检索解释**：返回每条记忆被检索到的详细原因


# 阶段四：向量相似度去重与记忆合并 - 实现总结

## 实现日期

2026-03-25

## 核心目标

实现**分层向量相似度去重**与**LLM 驱动的记忆合并**，解决阶段一简单去重无法识别语义相似但表述不同的问题。

## 架构设计

```
候选记忆 → 分层去重 Pipeline
              │
              ├── Candidate 阶段（只标记）
              │   └── 检索相似记忆，记录 maxSimilarity
              │
              └── Accept 阶段（执行决策）
                  │
                  ├── similarity >= 0.85 → Boost（权重提升）
                  │
                  ├── 0.75 <= similarity < 0.85
                  │   │
                  │   ├── 冲突检测（LLM）
                  │   │   ├── 有冲突 → 冲突解决 → 更新记忆
                  │   │   └── 无冲突 → 多源合并
                  │   │
                  │   └── 多源合并（LLM）
                  │       ├── 收敛检查
                  │       └── 创建合并记忆（parent_ids 追踪）
                  │
                  └── similarity < 0.75 → 直接接受
```

## 新增文件清单

### Rust 后端

| 文件路径 | 功能描述 |
|---------|---------|
| `src-tauri/src/memory/scoring.rs` | 时间维度计算（recency_weight、score、should_deactivate） |
| `src-tauri/src/memory/llm_client.rs` | LLM API 客户端（OpenAI 兼容） |
| `src-tauri/src/memory/conflict.rs` | 冲突检测与解决服务（LLM 驱动） |
| `src-tauri/src/memory/merge.rs` | 多源合并服务（LLM 驱动、收敛检查） |
| `src-tauri/src/memory/working_set.rs` | Working Set（内存态批量操作） |
| `src-tauri/src/memory/deduplication.rs` | 分层去重服务（Candidate/Accept 阶段） |

## 修改文件清单

### Rust 后端

| 文件路径 | 修改内容 |
|---------|---------|
| `src-tauri/src/models/memory.rs` | 新增 `DedupStage`、`ConflictType`、`BoostTarget`、`MergeTarget`、`ConflictTarget`、`SimilarMemory`、`DedupDecision`、`PipelineResult`、`EvolutionResult` 等类型；`MemoryItem` 新增 `version`、`parent_ids`、`updated_at` 字段 |
| `src-tauri/src/memory/mod.rs` | 导出新模块 |
| `src-tauri/src/memory/storage.rs` | 新增 `get_memories_by_ids()` 方法；数据库 schema 自动升级（version、parent_ids 字段） |
| `src-tauri/src/memory/retrieval.rs` | 添加 `#[derive(Clone)]` |
| `src-tauri/src/memory/lifecycle.rs` | 新增 `decay_with_recency()`、`deactivate_low_value_memories()`、`run_full_evolution()` 方法 |
| `src-tauri/src/commands/memory.rs` | 新增 `dedup_candidate`、`dedup_accept`、`execute_dedup_pipeline`、`run_memory_evolution` Commands |
| `src-tauri/src/lib.rs` | 注册新的 Commands |

### 前端 TypeScript

| 文件路径 | 修改内容 |
|---------|---------|
| `src/types.ts` | 新增 `DedupStage`、`ConflictType`、`BoostTarget`、`MergeTarget`、`ConflictTarget`、`SimilarMemory`、`DedupDecision`、`PipelineResult`、`EvolutionResult` 等类型；`MemoryItem` 新增 `version`、`parentIds`、`updatedAt` 字段 |
| `src/agent/memory/TauriMemoryClient.ts` | 新增 `dedupCandidate()`、`dedupAccept()`、`executeDedupPipeline()`、`runMemoryEvolution()` 方法 |

## 新增 Tauri Commands

| Command | 功能 |
|---------|------|
| `dedup_candidate` | Candidate 阶段去重（只标记，返回相似记忆列表） |
| `dedup_accept` | Accept 阶段去重（执行 boost/merge/conflict 分类） |
| `execute_dedup_pipeline` | 执行完整的去重 Pipeline |
| `run_memory_evolution` | 运行完整记忆演化周期（衰减 + 逻辑删除 + 淘汰） |

## 核心功能实现

### 1. 分层去重阈值

```rust
pub struct DeduplicationConfig {
    pub candidate_min_similarity: f32,    // 0.80 - Candidate 阶段最小相似度
    pub accept_exact_threshold: f32,      // 0.85 - 精确匹配阈值（boost）
    pub accept_partial_threshold: f32,    // 0.75 - 部分匹配阈值（merge）
    pub boost_amount: f32,                // 0.10 - 权重提升量
    pub retrieval_top_k: usize,           // 10 - 检索候选数量
}
```

### 2. 冲突类型

```rust
pub enum ConflictType {
    Preference,  // 偏好冲突：用户对同一事物的偏好发生变化
    Fact,        // 事实冲突：关于同一事实的矛盾陈述
    Status,      // 状态冲突：任务或状态的变化
}
```

### 3. 冲突检测 Prompt

```
你是一个记忆冲突检测专家。你的任务是判断两条记忆是否存在语义冲突。

【记忆 A】
{content_a}

【记忆 B】
{content_b}

【冲突类型】
1. 偏好冲突：用户对同一事物的偏好发生变化
2. 事实冲突：关于同一事实的矛盾陈述
3. 状态冲突：任务或状态的变化

【输出格式】
{
  "has_conflict": true/false,
  "conflict_type": "preference" | "fact" | "status" | null,
  "reason": "冲突原因说明"
}
```

### 4. 多源合并 Prompt

```
你是一个记忆合并专家。你的任务是将多条相似的记忆合并为一条更完整、更准确的记忆。

【合并原则】
1. 保留所有关键信息
2. 消除冗余表述
3. 保持语义完整性
4. 优先保留更具体的信息
5. 保持记忆类型一致

【待合并记忆】
{memories_text}

【候选记忆】
{candidate_text}

【输出格式】
{
  "merged_content": "合并后的记忆内容",
  "merged_importance": 0.0-1.0,
  "merge_reason": "简要说明合并理由"
}
```

### 5. Working Set（内存态操作）

```rust
pub struct WorkingSet {
    pub memories: HashMap<String, WorkingMemory>,  // ID → WorkingMemory
    embedding: EmbeddingService,
    boost_config: BoostConfig,
}

pub struct WorkingMemory {
    pub memory: MemoryItem,
    pub is_modified: bool,
    pub is_deleted: bool,
}

impl WorkingSet {
    // 从存储加载指定 ID 的记忆
    pub async fn load_from_storage(&mut self, storage: &MemoryStorage, memory_ids: &[String]);
    
    // 解决冲突（LLM 驱动）
    pub async fn resolve_conflicts(&mut self, candidate: &CandidateMemory, conflict_targets: &[ConflictTarget], conflict_detector: &ConflictDetector);
    
    // 提升权重（递减收益）
    pub fn boost_memories(&mut self, targets: &[BoostTarget]) -> Vec<MemoryItem>;
    
    // 提交到存储（原子操作）
    pub async fn commit_to_storage(&self, storage: &MemoryStorage) -> Result<CommitResult>;
}
```

### 6. 时间维度计算

```rust
pub fn calculate_recency_weight(last_accessed_at: i64, config: &RecencyConfig) -> f32 {
    let now = chrono::Utc::now().timestamp();
    let days_since_access = (now - last_accessed_at) as f32 / (24.0 * 3600.0);
    
    // 指数衰减：exp(-days / half_life)
    (-days_since_access / config.half_life_days).exp()
}

pub fn should_deactivate(memory: &MemoryItem, config: &DeletionConfig) -> bool {
    // 低重要性 + 长时间未访问 → 逻辑删除
    memory.importance < config.min_importance 
        && days_since_access > config.max_inactive_days
}
```

### 7. Pipeline 执行流程

```rust
pub async fn execute_pipeline(
    &self,
    candidate: &CandidateMemory,
    decision: DedupDecision,
) -> Result<PipelineResult, Box<dyn std::error::Error>> {
    // 1. 创建 Working Set，加载相关记忆
    let mut working_set = WorkingSet::new(...);
    working_set.load_from_storage(&self.storage, &all_memory_ids).await?;
    
    // 2. 解决冲突（如果有）
    if !decision.conflict_targets.is_empty() {
        let conflict_result = working_set.resolve_conflicts(...).await?;
        
        // 重新计算 merge_targets（冲突解决后相似度可能变化）
        let new_merge_targets = self.recalculate_merge_targets(...).await?;
        
        // 执行多源合并
        if !new_merge_targets.is_empty() {
            let merge_result = self.multi_source_merge_in_working_set(...).await?;
        }
    }
    
    // 3. 提升权重（递减收益）
    if !decision.boost_targets.is_empty() {
        let boosted = working_set.boost_memories(&decision.boost_targets);
    }
    
    // 4. 如果没有任何操作，直接接受
    if decision.boost_targets.is_empty() && decision.merge_targets.is_empty() && decision.conflict_targets.is_empty() {
        let memory = self.create_memory_with_parent_ids(...).await?;
        result.accepted = Some(memory);
    }
    
    // 5. 提交到存储
    working_set.commit_to_storage(&self.storage).await?;
    
    Ok(result)
}
```

### 8. 记忆版本追踪

```rust
pub struct MemoryItem {
    // ... 其他字段
    pub version: i32,           // 版本号，每次修改 +1
    pub parent_ids: Vec<String>, // 父记忆 ID（合并时记录来源）
    pub updated_at: i64,        // 最后更新时间
}
```

## 数据库 Schema 升级

```sql
-- 自动添加的字段
ALTER TABLE memory_items ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE memory_items ADD COLUMN parent_ids TEXT DEFAULT '[]';
```

## LLM 配置

### 环境变量

```bash
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=https://api.openai.com/v1  # 可选，默认 OpenAI
OPENAI_MODEL=gpt-4o-mini                     # 可选，默认 gpt-4o-mini
```

### LlmConfig

```rust
pub struct LlmConfig {
    pub api_key: String,
    pub base_url: String,
    pub model: String,
    pub timeout_secs: u64,
}
```

## 日志输出

### Candidate 阶段

```
[DedupService] Candidate 阶段去重（只标记）: 用户喜欢使用 Python 进行数据分析...
[DedupService] Candidate 阶段完成: 3 条相似记忆, 最高相似度 0.87
```

### Accept 阶段

```
[DedupService] Accept 阶段去重: 用户偏好 Python 编程语言...
[ConflictDetector] 冲突检测候选: 2 条 (从 3 条中筛选)
[DedupService] Accept 阶段完成: boost=1, merge=1, conflict=0
```

### Pipeline 执行

```
[DedupService] 开始执行 Pipeline（Working Set 模式）
[WorkingSet] 加载 3 条记忆到工作集（按 ID 加载）
[WorkingSet] 提升 1 条记忆权重（递减收益）
[WorkingSet] 提交完成: 创建 0 条, 更新 1 条, 删除 0 条
[DedupService] Pipeline 执行完成
```

### 记忆演化

```
[MemoryEvolution] 开始完整演化周期
[MemoryEvolution] 衰减完成: 处理 28 条, 更新 28 条
[MemoryEvolution] 逻辑删除完成: 2 条记忆
[MemoryEvolution] 演化周期完成: 衰减 28 条, 逻辑删除 2 条, 标记不活跃 0 条
```

## 验收标准

- [x] Candidate 阶段只标记相似记忆，不执行操作
- [x] Accept 阶段正确分类 boost/merge/conflict
- [x] 冲突检测使用 LLM 判断语义冲突
- [x] 多源合并使用 LLM 合并相似记忆
- [x] Working Set 支持批量内存态操作
- [x] 权重提升使用递减收益策略
- [x] 记忆版本追踪（version、parent_ids）
- [x] 时间维度衰减计算
- [x] 逻辑删除机制
- [x] Rust 编译通过
- [x] TypeScript 类型检查通过

## 测试方法

### 控制台测试

```javascript
// 1. 添加测试记忆
await window.__TAURI__.invoke('add_memory', {
  content: '用户喜欢使用 Python 进行数据分析',
  memoryType: 'preference',
  importance: 0.8
});

// 2. 添加相似记忆（触发去重）
await window.__TAURI__.invoke('add_memory', {
  content: '用户偏好 Python 编程语言',
  memoryType: 'preference',
  importance: 0.7
});

// 3. 测试去重 Pipeline
const candidates = await window.__TAURI__.invoke('get_candidates', { onlyPending: true });
if (candidates.length > 0) {
  const decision = await window.__TAURI__.invoke('dedup_accept', { id: candidates[0].id });
  console.log('Accept 阶段决策:', decision);
  
  const result = await window.__TAURI__.invoke('execute_dedup_pipeline', { 
    id: candidates[0].id, 
    decision: decision 
  });
  console.log('Pipeline 执行结果:', result);
}

// 4. 测试记忆演化
const evolutionResult = await window.__TAURI__.invoke('run_memory_evolution', {});
console.log('演化结果:', evolutionResult);
```

## 已知限制

1. **LLM API 依赖**：冲突检测和合并功能需要配置 LLM API Key
2. **网络延迟**：LLM 调用会增加处理时间
3. **成本考虑**：大量冲突检测/合并会产生 API 调用费用
4. **Fallback 策略**：LLM 调用失败时使用简单拼接作为 fallback

## 后续优化方向

1. **批量 LLM 调用**：合并多个冲突检测请求
2. **本地 LLM 支持**：支持本地部署的 LLM（如 Ollama）
3. **UI 集成**：在前端展示去重决策和合并结果
4. **用户反馈**：允许用户修改 LLM 的合并结果
5. **性能优化**：缓存 LLM 调用结果，避免重复请求

---

## ⚠️ 重要发现：阶段四未完全集成

### 问题描述

阶段四的向量相似度去重代码已完整实现，但**未集成到前端流程**。

### 当前状态

| 组件 | 状态 | 说明 |
|------|------|------|
| Rust 后端模块 | ✅ 完成 | `deduplication.rs`、`conflict.rs`、`merge.rs` 等 6 个模块 |
| Rust Commands | ✅ 完成 | `dedup_candidate`、`dedup_accept`、`execute_dedup_pipeline` |
| 前端类型定义 | ✅ 完成 | `src/types.ts` 已添加所有阶段四类型 |
| 前端 API 方法 | ✅ 完成 | `TauriMemoryClient` 已添加 API 方法 |
| **前端集成** | ❌ 未完成 | `accept_all_candidates` 仍使用 `check_duplicate_simple` |

### 具体问题

当前前端 `accept_all_candidates` 调用后端时，后端使用的是**简单字符串匹配**：

```rust
// src-tauri/src/commands/memory.rs - accept_all_candidates
// 当前实现使用 check_duplicate_simple（字符串匹配）
// 未调用 deduplication.rs 的向量相似度去重
```

### 需要的修复

1. 修改 `accept_all_candidates` 或创建新的批量接受方法
2. 调用 `dedup_candidate` → `dedup_accept` → `execute_dedup_pipeline` 流程
3. 或在候选记忆 UI 中提供"智能去重"按钮，单独调用去重 Pipeline

---

## LLM 稳定性修复记录（2026-03-25）

### 问题描述

记忆提取时 LLM 输出不稳定，导致 JSON 解析失败：

```
finish_reason: "length"
response: "" (空)
```

### 根本原因

1. **max_tokens 不足**：模型输出推理过程，超过 2000 tokens 被截断
2. **temperature 过高**：模型倾向于输出"思考过程"
3. **Prompt 不够严格**：模型可能输出解释性文字

### 解决方案

#### 1. 增加 max_tokens

```typescript
// src/agent/memory/MemoryExtractionService.ts
max_tokens: 5000  // 从 2000 增加到 5000
```

#### 2. 降低 temperature

```typescript
temperature: 0.0  // 从默认值降低到 0.0
```

#### 3. 重写 System Prompt（严格 JSON-only）

```typescript
const systemPrompt = `# 核心指令
[STRICT] 你是一个高效的数据提取函数，严禁进行任何推理、自检、解释或草拟过程。
[FORMAT] 你的输出必须以 "{" 开头，以 "}" 结尾。
[WARNING] 任何 JSON 以外的文字都会导致程序崩溃。跳过思考过程，直接生成 JSON。

# 任务
从对话中提取用户的认知记忆...

# 输出格式
{
  "extractedMemories": [...],
  "extractedTasks": [...]
}`;
```

#### 4. 添加 JSON 提取 Fallback

```typescript
// src/agent/memory/MemoryExtractionService.ts
function extract_json_string(text: string): string | null {
  // 尝试提取 JSON 对象
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }
  return null;
}
```

### 验证结果

```
finish_reason: "stop"
response: {"extractedMemories":[...],"extractedTasks":[...]}
```

### Schema 简化

为减少 LLM 输出复杂度，简化了 `ExtractedTask` 结构：

```typescript
// 之前（复杂）
interface ExtractedTask {
  content: string;
  status: 'pending' | 'in_progress';
  progress?: string;
  nextStep?: string;
  importance: number;
}

// 之后（简化）
interface ExtractedItem {
  content: string;
  importance: number;
}
type ExtractedTask = ExtractedItem;
```

---

## 下一步行动

### 优先级 1：集成阶段四去重

修改前端 `accept_all_candidates` 流程，使用向量相似度去重：

```typescript
// 建议的实现方式
async function acceptAllCandidatesWithDedup() {
  for (const candidate of candidates) {
    // 1. Candidate 阶段：获取相似记忆
    const similarMemories = await dedupCandidate(candidate.id);
    
    // 2. Accept 阶段：获取决策
    const decision = await dedupAccept(candidate.id);
    
    // 3. 执行 Pipeline
    const result = await executeDedupPipeline(candidate.id, decision);
  }
}
```

### 优先级 2：UI 改进

- 在候选记忆列表中显示相似记忆
- 提供合并/冲突预览
- 允许用户手动选择合并策略
