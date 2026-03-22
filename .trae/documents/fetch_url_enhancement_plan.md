# fetch_url 工具增强计划

## 概述

基于 `FETCH_URL_TOOL_REFACTOR.md` 中提出的后续增强计划，本文档详细规划四个增强功能的实现方案。

---

## 增强功能概览

| 优先级 | 功能 | 复杂度 | 预计工作量 |
|--------|------|--------|------------|
| P0 | 缓存机制 | 低 | 小 |
| P0 | PDF 解析 | 中 | 中 |
| P1 | 摘要生成 | 中 | 中 |
| P2 | JS 渲染 | 高 | 大 |

---

## 1. 缓存机制

### 目标

避免重复请求相同 URL，减少网络请求，提升响应速度。

### 设计方案

#### 1.1 缓存结构

```rust
use std::collections::HashMap;
use std::time::{Duration, Instant};

struct CacheEntry {
    result: FetchResult,
    cached_at: Instant,
    etag: Option<String>,           // 用于验证缓存有效性
    last_modified: Option<String>,  // 用于验证缓存有效性
}

struct FetchCache {
    entries: HashMap<String, CacheEntry>,
    max_entries: usize,             // 最大缓存条目数
    ttl: Duration,                  // 缓存过期时间
}
```

#### 1.2 缓存策略

- **TTL（Time-To-Live）**：默认 30 分钟
- **LRU 淘汰**：当缓存条目超过上限时，淘汰最久未使用的条目
- **条件请求**：使用 `If-None-Match` (ETag) 和 `If-Modified-Since` 验证缓存

#### 1.3 实现步骤

1. **创建缓存模块** `src-tauri/src/tools/cache.rs`
   - 实现 `FetchCache` 结构体
   - 实现 `get`、`set`、`invalidate` 方法
   - 实现持久化存储（可选，使用 `serde` 序列化到文件）

2. **修改 `fetch.rs`**
   - 在请求前检查缓存
   - 添加条件请求头（如果缓存存在）
   - 处理 304 Not Modified 响应
   - 成功响应后更新缓存

3. **添加配置选项**
   ```rust
   pub struct FetchOptions {
       // 现有选项...
       pub use_cache: Option<bool>,      // 是否使用缓存
       pub cache_ttl: Option<u64>,       // 缓存 TTL（秒）
       pub force_refresh: Option<bool>,  // 强制刷新
   }
   ```

4. **更新前端类型定义** `src/agent/tools/types.ts`

#### 1.4 文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `src-tauri/src/tools/cache.rs` | 新建 | 缓存模块实现 |
| `src-tauri/src/tools/mod.rs` | 修改 | 导出 cache 模块 |
| `src-tauri/src/tools/fetch.rs` | 修改 | 集成缓存逻辑 |
| `src/agent/tools/types.ts` | 修改 | 添加缓存相关选项 |
| `src/agent/tools/builtin.ts` | 修改 | 更新工具描述 |

---

## 2. PDF 解析

### 目标

支持 PDF 文档内容提取，扩展 `fetch_url` 工具的内容类型支持。

### 设计方案

#### 2.1 依赖选择

推荐使用 `pdf-extract` crate：

```toml
# Cargo.toml
pdf-extract = "0.7"
```

备选方案：
- `lopdf`：更底层，需要更多手动处理
- `pdf` crate：功能较少

#### 2.2 PDF 处理流程

```
检测 Content-Type: application/pdf
        ↓
下载 PDF 二进制内容
        ↓
使用 pdf-extract 提取文本
        ↓
清理和格式化文本
        ↓
返回结构化结果
```

#### 2.3 实现步骤

1. **添加依赖**
   ```toml
   pdf-extract = "0.7"
   ```

2. **创建 PDF 解析模块** `src-tauri/src/tools/pdf.rs`
   ```rust
   pub fn extract_pdf_content(pdf_bytes: &[u8]) -> Result<PdfExtractionResult, String> {
       // 使用 pdf-extract 提取文本
       // 处理分页信息
       // 提取元数据（标题、作者等）
   }
   
   pub struct PdfExtractionResult {
       pub title: Option<String>,
       pub author: Option<String>,
       pub page_count: usize,
       pub content: String,
       pub pages: Vec<String>,  // 按页分割的内容
   }
   ```

3. **修改 `fetch.rs`**
   - 检测 `application/pdf` Content-Type
   - 调用 PDF 解析模块
   - 处理 PDF 特有的分块逻辑

4. **更新返回结构**
   ```rust
   pub struct FetchMetadata {
       // 现有字段...
       pub content_type: String,        // "html" | "pdf"
       pub page_count: Option<usize>,   // PDF 页数
   }
   ```

5. **更新前端类型定义**

#### 2.4 文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `src-tauri/Cargo.toml` | 修改 | 添加 pdf-extract 依赖 |
| `src-tauri/src/tools/pdf.rs` | 新建 | PDF 解析模块 |
| `src-tauri/src/tools/mod.rs` | 修改 | 导出 pdf 模块 |
| `src-tauri/src/tools/fetch.rs` | 修改 | 集成 PDF 解析 |
| `src/agent/tools/types.ts` | 修改 | 添加 PDF 相关类型 |
| `src/agent/tools/builtin.ts` | 修改 | 更新工具描述 |

---

## 3. 摘要生成

### 目标

可选返回 AI 生成的摘要，帮助用户快速了解长文档内容。

### 设计方案

#### 3.1 摘要生成策略

有两种实现方式：

**方案 A：前端调用 LLM 生成摘要**
- 优点：实现简单，利用现有 LLM 能力
- 缺点：增加 Token 消耗，延迟较高

**方案 B：后端本地模型生成摘要**
- 优点：无额外 Token 消耗，响应更快
- 缺点：需要集成本地模型，增加二进制大小

**推荐方案 A**，原因：
1. 实现简单，无需额外依赖
2. 利用现有 LLM 的强大摘要能力
3. 用户可选择是否启用

#### 3.2 实现方案（方案 A）

1. **添加摘要选项**
   ```typescript
   // FetchOptions
   interface FetchOptions {
       // 现有选项...
       generate_summary?: boolean;      // 是否生成摘要
       summary_max_length?: number;     // 摘要最大长度
   }
   ```

2. **前端处理流程**
   ```typescript
   // builtin.ts
   async function execute(params: Record<string, unknown>): Promise<ToolExecutionResult> {
       const result = await invoke<FetchResult>('fetch_url', { url, options });
       
       if (options.generate_summary && result.success) {
           // 调用 LLM 生成摘要
           const summary = await generateSummary(result.content);
           result.summary = summary;
       }
       
       return { success: true, output: formatResult(result) };
   }
   ```

3. **摘要生成函数**
   ```typescript
   async function generateSummary(content: string, maxLength: number = 500): Promise<string> {
       // 截取前 N 字符作为摘要输入
       const inputContent = content.slice(0, 4000);
       
       // 使用轻量级 LLM 调用生成摘要
       // ...
   }
   ```

#### 3.3 实现步骤

1. **更新类型定义**
   - 添加 `generate_summary` 和 `summary_max_length` 选项

2. **修改 `builtin.ts`**
   - 添加摘要生成逻辑
   - 集成 LLM 调用

3. **更新工具描述**
   - 说明摘要生成功能

#### 3.4 文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/agent/tools/types.ts` | 修改 | 添加摘要相关选项 |
| `src/agent/tools/builtin.ts` | 修改 | 添加摘要生成逻辑 |
| `src/agent/tools/builtin.ts` | 修改 | 更新工具描述 |

---

## 4. JS 渲染（可选）

### 目标

支持需要 JavaScript 渲染的 SPA 页面。

### 设计方案

#### 4.1 技术选型

**方案 A：使用 headless-chrome (chromium)**
- 优点：完整支持所有 JS 特性
- 缺点：需要安装 Chromium，二进制体积大（~200MB）

**方案 B：使用 headless_shell**
- 优点：比完整 Chromium 小
- 缺点：仍需要额外安装

**方案 C：使用 fantoccini (WebDriver)**
- 优点：可以连接远程浏览器
- 缺点：需要额外配置

**推荐方案 A**，但作为可选功能，用户可选择是否启用。

#### 4.2 实现方案

1. **添加依赖**
   ```toml
   # Cargo.toml (可选依赖)
   [target.'cfg(not(any(target_os = "android", target_os = "ios")))'.dependencies]
   headless_chrome = "1.0"
   ```

2. **创建 JS 渲染模块** `src-tauri/src/tools/renderer.rs`
   ```rust
   pub async fn render_js_page(url: &str, timeout: u64) -> Result<String, String> {
       // 启动 headless Chrome
       // 导航到 URL
       // 等待页面加载完成
       // 提取渲染后的 HTML
   }
   ```

3. **修改 `fetch.rs`**
   - 添加 `render_js` 选项
   - 当启用时，使用 headless 浏览器获取页面
   - 作为 fallback：先尝试普通请求，如果内容太少则尝试 JS 渲染

4. **配置选项**
   ```rust
   pub struct FetchOptions {
       // 现有选项...
       pub render_js: Option<bool>,         // 是否启用 JS 渲染
       pub js_render_timeout: Option<u64>,  // JS 渲染超时
   }
   ```

#### 4.3 实现步骤

1. **添加依赖**（可选）
2. **创建渲染模块**
3. **集成到 fetch 流程**
4. **添加配置和开关**

#### 4.4 文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `src-tauri/Cargo.toml` | 修改 | 添加 headless_chrome 依赖（可选） |
| `src-tauri/src/tools/renderer.rs` | 新建 | JS 渲染模块 |
| `src-tauri/src/tools/mod.rs` | 修改 | 导出 renderer 模块 |
| `src-tauri/src/tools/fetch.rs` | 修改 | 集成 JS 渲染 |
| `src/agent/tools/types.ts` | 修改 | 添加 JS 渲染相关选项 |
| `src/agent/tools/builtin.ts` | 修改 | 更新工具描述 |

---

## 实施顺序建议

### 阶段一：基础增强（P0）

1. **缓存机制**
   - 实现简单，收益明显
   - 减少重复请求，提升响应速度

2. **PDF 解析**
   - 扩展内容类型支持
   - 常见需求

### 阶段二：智能增强（P1）

3. **摘要生成**
   - 提升用户体验
   - 帮助快速了解长文档

### 阶段三：高级功能（P2）

4. **JS 渲染**
   - 复杂度高
   - 增加二进制体积
   - 可作为可选功能

---

## 风险与注意事项

### 缓存机制
- 需要处理缓存一致性问题
- 内存占用需要控制
- 考虑持久化存储的必要性

### PDF 解析
- 部分 PDF 可能无法正确提取文本（扫描件、图片 PDF）
- 需要处理大文件下载
- 考虑添加 OCR 支持（未来）

### 摘要生成
- 增加 Token 消耗
- 需要处理超长内容的截断
- 摘要质量取决于 LLM 能力

### JS 渲染
- 显著增加二进制体积
- 资源消耗较高
- 需要处理超时和错误情况
- 可能需要处理反爬虫机制

---

## 版本规划

| 版本 | 功能 | 状态 |
|------|------|------|
| v1.1 | 缓存机制 + PDF 解析 | 待开发 |
| v1.2 | 摘要生成 | 待开发 |
| v1.3 | JS 渲染（可选） | 待开发 |
