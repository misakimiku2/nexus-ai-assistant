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
