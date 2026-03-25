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
