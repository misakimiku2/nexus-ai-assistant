# fetch_url 工具重构文档

## 概述

本文档记录了 `fetch_url` 工具的完整重构过程，解决了原有 `http_request` 工具的 CORS 限制、无正文提取、无内容长度控制等问题。

---

## 问题分析

### 原 `http_request` 工具的问题

1. **CORS 限制**：使用前端 `fetch` API，受浏览器同源策略限制，无法访问大多数外部网站
2. **无正文提取**：返回原始 HTML，包含导航、广告、脚本等噪音，LLM 难以有效理解
3. **无内容长度控制**：可能返回超长内容，超出 LLM 上下文窗口
4. **无 JS 渲染支持**：无法处理需要 JavaScript 渲染的 SPA 页面

---

## 解决方案

### 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                      Agent (LLM)                            │
│                    调用 fetch_url 工具                        │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                 前端 (React/TypeScript)                      │
│  src/agent/tools/builtin.ts                                 │
│  - createFetchUrlTool()                                     │
│  - 调用 Tauri command: fetch_url                            │
└─────────────────────────┬───────────────────────────────────┘
                          │ invoke('fetch_url', { url })
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                 后端 (Rust/Tauri)                            │
│  src-tauri/src/tools/fetch.rs                               │
│  1. reqwest 发起 HTTP 请求（绕过 CORS）                       │
│  2. readability 提取正文（优先）                              │
│  3. Fallback 机制（scraper + 自定义算法）                     │
│  4. 自动分块处理                                             │
│  5. 返回结构化结果                                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 核心功能

### 1. 正文提取 Fallback 机制

```
readability 提取
       ↓ 失败或内容 < 200 字符
scraper 提取（段落 + 列表 + 标题 + 表格）
       ↓ 失败
body 文本提取（最终 fallback）
```

### 2. 自动分块

- 当内容超过 8000 字符时，自动分块返回完整内容
- 每块约 4000 字符，在句子边界处切分
- 所有内容块用分隔线连接，一次性返回

### 3. SSRF 防护

禁止访问内网地址：
- `localhost`, `127.0.0.1`, `0.0.0.0`
- `10.x.x.x`, `172.16.x.x`, `192.168.x.x`
- `::1`, `fe80::`, `169.254.x.x`

---

## 文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `src-tauri/Cargo.toml` | 修改 | 添加 `readability = "0.3"` 依赖 |
| `src-tauri/src/tools/fetch.rs` | 新建 | fetch_url command 实现 |
| `src-tauri/src/tools/mod.rs` | 修改 | 导出 fetch 模块 |
| `src-tauri/src/lib.rs` | 修改 | 注册 fetch_url command |
| `src/agent/tools/types.ts` | 修改 | 添加 FetchResult、FetchMetadata、ContentChunk、FetchOptions 类型 |
| `src/agent/tools/builtin.ts` | 修改 | 删除 http_request，添加 fetch_url |
| `src/agent/preprocess/urlDetector.ts` | 新建 | URL 自动检测与预处理模块 |
| `src/agent/preprocess/index.ts` | 新建 | 预处理模块导出 |
| `src/agent/runtime/AgentRuntime.ts` | 修改 | 集成 URL 预处理（`preprocessConversation`） |
| `src/data/agents.ts` | 修改 | 更新系统提示词 |

---

## 返回结构

```typescript
interface FetchResult {
  success: boolean;
  title: string;
  content: string;              // 完整内容（分块时已连接）
  summary?: string;             // 预留
  content_chunks?: ContentChunk[];  // 分块数组
  metadata: FetchMetadata;
  error?: string;
}

interface FetchMetadata {
  length: number;               // 原文长度（字符数）
  domain: string;               // 域名
  extraction_method: string;    // 提取方法
  chunk_count: number;          // 分块数量
  truncated: boolean;           // 是否截断（始终为 false）
}

interface ContentChunk {
  index: number;                // 块索引
  content: string;              // 块内容
  is_last: boolean;             // 是否最后一块
}
```

---

## 关键实现细节

### 1. 内容提取 (extract_with_scraper)

优先查找主内容区域，排除导航和分类链接：

```rust
fn extract_with_scraper(html: &str) -> (String, String) {
    // 1. 优先选择器查找主内容区域
    let main_content_selectors = [
        ".mw-parser-output",  // MediaWiki
        "#mw-content-text",
        "article",
        "main",
        ".content",
        // ...
    ];

    // 2. 排除导航、分类、侧边栏等区域
    let exclude_class_or_id = &[
        "navbox", "navigation", "catlinks",
        "sidebar", "footer", // ...
    ];

    // 3. 提取标题、段落、列表、表格
    // 4. 过滤掉位于排除区域内的元素
}
```

### 2. 智能分块 (chunk_content_smart)

**重要**：必须使用字符索引而非字节索引：

```rust
fn chunk_content_smart(content: &str, chunk_size: usize) -> Vec<ContentChunk> {
    let chars: Vec<char> = content.chars().collect();  // 转换为字符数组

    // 在字符级别查找句子结束符
    let sentence_endings = ['。', '！', '？', '.', '!', '?', '\n'];

    for (i, &ch) in search_range.iter().enumerate() {
        if sentence_endings.contains(&ch) {
            last_ending_char_idx = Some(i);  // 使用字符索引
        }
    }
}
```

### 3. 字符索引 vs 字节索引

对于 UTF-8 编码的中文，必须使用字符索引：

```rust
// 错误：rfind 返回字节索引
let last_ending = search_str.rfind(&sentence_endings[..]);  // 字节索引！

// 正确：使用字符迭代器
for (i, &ch) in search_range.iter().enumerate() {
    if sentence_endings.contains(&ch) {
        last_ending_char_idx = Some(i);  // 字符索引
    }
}
```

---

## 工具定义

```typescript
{
  name: 'fetch_url',
  description: `获取网页内容并提取正文。

**重要：URL 处理规则**
- URL 必须使用用户提供的原始 URL，不做任何修改
- 禁止对 URL 进行：解码、修改路径、替换关键词、重新拼接
- 如果用户消息中包含 URL 占位符（如 __URL_PLACEHOLDER_1__），必须原样使用该占位符

用于：
- 获取网页的主要文本内容
- 阅读文章、博客、文档等
- 提取网页核心信息

返回干净的正文内容，自动去除广告、导航、脚本等噪音。

**自动分块**：
- 当内容超过 8000 字符时，自动分块返回完整内容
- 每块约 4000 字符，在句子边界处切分
- 所有内容块用分隔线连接，一次性返回`,
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: '要获取的网页 URL。必须是用户提供的原始 URL 或 URL 占位符，禁止任何修改。',
      },
    },
    required: ['url'],
  },
}
```

---

## 调试日志

运行时会输出以下日志信息：

```
[preprocessConversation] Total URLs in map: 1
[preprocessConversation] URL Map: {"__URL_PLACEHOLDER_1__": "https://example.com/露帕"}
[AgentRuntime] Preprocessed conversation: { hasUrls: true, urlCount: 1, urls: {...} }
[ReActEngine] Tool call: fetch_url params: { url: "__URL_PLACEHOLDER_1__" }
[ReActEngine] Replacing URL placeholder: __URL_PLACEHOLDER_1__ -> https://example.com/露帕
[fetch_url] URL: https://example.com/露帕
[fetch_url] URL contains non-ASCII characters, encoding...
[fetch_url] Encoded URL: https://example.com/%E9%9C%B2%E5%B8%95
[fetch_url] Title: 页面标题
[extract_with_scraper] Found main content with selector: .mw-parser-output
[extract_with_scraper] Main content length: 28358 chars
[fetch_url] Extraction method: scraper
[fetch_url] Original content length: 28358 chars
[fetch_url] Max length threshold: 8000 chars
[fetch_url] Chunk size: 4000 chars
[fetch_url] Content exceeds max_length, chunking enabled!
[fetch_url] Created 8 chunks
[fetch_url] Final content length: 28410 chars
```

---

## 已知限制

1. **反爬虫**：部分网站有反爬虫机制，可能需要添加更多 headers 模拟浏览器。
2. **编码问题**：部分网站使用非 UTF-8 编码，需要检测并转换。
3. **PDF 扫描件**：扫描版 PDF 无法提取文本，需要 OCR 支持。

---

## 增强功能实现（2026-03-22）

### 1. 缓存机制 ✅

**实现方式**：内存缓存 + LRU 淘汰

```rust
struct CacheEntry {
    result: FetchResult,
    cached_at: Instant,
    etag: Option<String>,
    last_modified: Option<String>,
    last_accessed: Instant,
}
```

**特性**：
- TTL（Time-To-Live）：默认 30 分钟
- LRU 淘汰：最大 100 条缓存
- 支持条件请求验证（ETag、Last-Modified）

**使用方式**：
```typescript
// 默认使用缓存
await invoke('fetch_url', { url: 'https://example.com' });

// 强制刷新
await invoke('fetch_url', { 
  url: 'https://example.com',
  options: { force_refresh: true }
});
```

### 2. PDF 解析 ✅

**实现方式**：使用 `pdf-extract` crate

```rust
pub fn extract_pdf_content(pdf_bytes: &[u8]) -> Result<PdfExtractionResult, String> {
    let content = pdf_extract::extract_text_from_mem(pdf_bytes)?;
    // 清理文本，去除页眉页脚
}
```

**特性**：
- 自动检测 `application/pdf` Content-Type
- 提取文本内容并清理
- 估算页数
- 支持缓存

**使用方式**：
```typescript
// 直接传入 PDF URL
await invoke('fetch_url', { url: 'https://example.com/document.pdf' });
```

### 3. JS 渲染 ✅（可选功能）

**实现方式**：使用 `headless_chrome` crate（可选依赖）

```rust
pub async fn render_js_page(url: &str, timeout_ms: Option<u64>) -> Result<JsRenderResult, String> {
    let browser = Browser::new(LaunchOptions { headless: true, ..Default::default() })?;
    let tab = browser.new_tab()?;
    tab.navigate_to(url)?;
    // 等待页面加载完成
    let html = tab.get_content()?;
    Ok(JsRenderResult { html, ... })
}
```

**启用方式**：
```toml
# Cargo.toml
[features]
js-render = ["headless_chrome"]
```

**使用方式**：
```typescript
await invoke('fetch_url', { 
  url: 'https://spa-example.com',
  options: { render_js: true }
});
```

### 4. 摘要生成（待实现）

**计划方案**：前端调用 LLM 生成摘要

---

## 新增文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `src-tauri/src/tools/cache.rs` | 新建 | 缓存模块实现 |
| `src-tauri/src/tools/pdf.rs` | 新建 | PDF 解析模块 |
| `src-tauri/src/tools/renderer.rs` | 新建 | JS 渲染模块 |
| `src-tauri/src/tools/mod.rs` | 修改 | 导出新模块 |
| `src-tauri/src/tools/fetch.rs` | 修改 | 集成缓存、PDF、JS 渲染 |
| `src-tauri/Cargo.toml` | 修改 | 添加依赖和 feature |
| `src/agent/tools/types.ts` | 修改 | 添加新类型定义 |
| `src/agent/tools/builtin.ts` | 修改 | 更新工具描述和参数 |

---

## 返回结构更新

```typescript
interface FetchMetadata {
  length: number;
  domain: string;
  extraction_method: 'readability' | 'scraper' | 'fallback' | 'pdf-extract';
  chunk_count: number;
  truncated: boolean;
  content_type: string;        // 新增：内容类型
  page_count?: number;         // 新增：PDF 页数
  cached: boolean;             // 新增：是否来自缓存
}

interface FetchOptions {
  max_length?: number;
  timeout?: number;
  user_agent?: string;
  chunk_size?: number;
  use_cache?: boolean;         // 新增：是否使用缓存
  force_refresh?: boolean;     // 新增：强制刷新
  render_js?: boolean;         // 新增：启用 JS 渲染
  js_render_timeout?: number;  // 新增：JS 渲染超时
}
```

---

## 后续增强计划

## URL 处理机制（2026-03-21 更新）

### 问题背景

LLM 会错误地修改 URL（尤其是包含编码字符如 `%E9%9C%B2%E5%B8%95`），导致访问错误页面。

### 解决方案

#### 1. URL 预处理（前端）

在用户输入阶段（LLM 之前），提取所有 URL 并替换为占位符：

```
用户输入: "帮我看看 https://example.com/露帕 的内容"
预处理后: "帮我看看 __URL_PLACEHOLDER_1__ 的内容"
URL 映射: { "__URL_PLACEHOLDER_1__": "https://example.com/露帕" }
```

**关键点**：
- URL 保留原始编码（不解码）
- LLM 只看到占位符，无法修改 URL
- 工具调用时，占位符被替换回原始 URL

#### 2. URL 自动编码（后端）

后端接收到 URL 后，检测并编码非 ASCII 字符：

```rust
fn encode_url_if_needed(url: &str) -> Result<String, String> {
    // 检查路径、查询参数、片段中是否有非 ASCII 字符
    // 如果有，使用 urlencoding crate 进行编码
    // 示例: "露帕" → "%E9%9C%B2%E5%B8%95"
}
```

**处理流程**：
```
用户输入 URL → 前端预处理（占位符）→ LLM 调用工具 → 占位符替换 → 后端编码 → HTTP 请求
```

### 新增文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/agent/preprocess/urlDetector.ts` | 修改 | 添加 `preprocessInput()`、`preprocessConversation()`、`replaceUrlPlaceholders()` 等函数 |
| `src/agent/preprocess/index.ts` | 修改 | 导出新函数和类型（包括 `preprocessConversation`、`PreprocessedConversation`） |
| `src/agent/types.ts` | 修改 | 添加 `preprocessedUrls`、`originalUserInput` 字段 |
| `src/agent/runtime/AgentRuntime.ts` | 修改 | 集成 `preprocessConversation()` 处理整个会话历史 |
| `src/agent/runtime/ReActEngine.ts` | 修改 | 处理 URL 占位符替换，使用 `ToolRegistry.execute()` |
| `src/agent/tools/builtin.ts` | 修改 | 更新 fetch_url 工具描述 |
| `src/data/agents.ts` | 修改 | 更新系统提示词 |
| `src-tauri/src/tools/fetch.rs` | 修改 | 添加 `encode_url_if_needed()` 函数 |

---

## Bug 修复记录（2026-03-21）

### 1. 分块逻辑数组越界

**问题**：`rfind` 返回字节索引，而内容数组使用字符索引，导致越界。

```
thread 'tokio-rt-worker' panicked at src\tools\fetch.rs:355:46:
range end index 32516 out of range for slice of length 28358
```

**修复**：使用字符迭代器代替 `rfind`：

```rust
// 错误
if let Some(last_ending) = search_str.rfind(&sentence_endings[..]) {
    let actual_end = start + last_ending + 1;  // 字节索引，越界！
}

// 正确
let mut last_ending_char_idx = None;
for (i, &ch) in search_range.iter().enumerate() {
    if sentence_endings.contains(&ch) {
        last_ending_char_idx = Some(i);  // 字符索引
    }
}
```

### 2. 重复用户消息

**问题**：`buildInitialMessages` 比较预处理后的消息与原始消息，导致重复添加。

**修复**：添加 `originalUserInput` 字段，正确比较原始输入。

### 3. URL 占位符替换无效

**问题**：`handleToolCall` 替换了 `params`，但调用 `executeToolCall` 时传入原始 `toolCall.function`。

**修复**：直接调用 `ToolRegistry.execute(toolName, params)` 使用修改后的参数。

### 4. 内容提取包含导航链接

**问题**：`extract_with_scraper` 提取了整个页面的 `li` 元素，包括导航栏链接。

**修复**：
1. 优先查找主内容区域（`.mw-parser-output` 等）
2. 过滤掉位于导航、分类、侧边栏等区域内的元素

```rust
fn has_excluded_class_or_id(el: ElementRef, exclude_list: &[&str]) -> bool {
    let mut current = Some(el);
    while let Some(node) = current {
        // 检查 id 和 class 是否在排除列表中
        if let Some(id) = node.value().id() {
            if exclude_list.contains(&&*id) { return true; }
        }
        for class in node.value().classes() {
            if exclude_list.contains(&&*class) { return true; }
        }
        current = node.parent().and_then(ElementRef::wrap);
    }
    false
}
```

### 5. 会话历史中 URL placeholder 冲突（2026-03-22）

**问题**：在同一个会话中发送多个不同的 URL 时，AI 只会解析第一个 URL。

**原因分析**：
1. 每次执行时 `resetUrlPlaceholderCounter()` 重置计数器，导致第一条消息的 URL 变成 `__URL_PLACEHOLDER_1__`，第二条消息的 URL 也变成 `__URL_PLACEHOLDER_1__`
2. `preprocessedUrls` 只包含当前消息的 URL 映射，不包含历史消息中的 URL
3. LLM 看到历史消息中的 `__URL_PLACEHOLDER_1__`，但当前 map 中这个 key 指向的是新 URL

**修复**：新增 `preprocessConversation()` 函数，对整个会话历史进行统一的 URL 预处理：

```typescript
export interface PreprocessedConversation {
  messages: Array<{ role: string; content: string }>;
  urlMap: Map<string, string>;
  processedUserInput: string;
}

export function preprocessConversation(
  currentUserInput: string,
  conversationHistory: Array<{ role: string; content: string }>
): PreprocessedConversation {
  const urlMap = new Map<string, string>();
  const processedMessages: Array<{ role: string; content: string }> = [];
  
  // 遍历整个会话历史，统一处理所有 URL
  for (const msg of conversationHistory) {
    const processed = processTextWithUrls(msg.content, urlMap);
    processedMessages.push({ role: msg.role, content: processed });
  }
  
  const processedUserInput = processTextWithUrls(currentUserInput, urlMap);
  
  return { messages: processedMessages, urlMap, processedUserInput };
}

function processTextWithUrls(text: string, urlMap: Map<string, string>): string {
  const detectedUrls = detectUrls(text);
  if (detectedUrls.length === 0) return text;
  
  let result = text;
  for (const detected of sortedUrls) {
    // 相同的 URL 复用相同的 placeholder
    const existingEntry = [...urlMap.entries()].find(([_, url]) => url === detected.url);
    
    let placeholder: string;
    if (existingEntry) {
      placeholder = existingEntry[0];  // 复用已有 placeholder
    } else {
      placeholder = generateUrlPlaceholder();  // 生成新 placeholder
      urlMap.set(placeholder, detected.url);
    }
    
    result = result.replace(detected.url, placeholder);
  }
  return result;
}
```

**关键改进**：
1. **统一处理**：对整个会话历史进行预处理，而非只处理当前消息
2. **共享映射**：使用全局 `urlMap` 存储所有消息中的 URL 映射
3. **URL 去重**：相同的 URL 复用相同的 placeholder，避免冲突
4. **简化流程**：`ReActEngine` 收到的会话历史已被预处理，无需额外判断

---

## 版本信息

- 文档创建日期: 2026-03-21
- 最后更新: 2026-03-22
- URL 处理机制更新: 2026-03-21
- Bug 修复记录更新: 2026-03-22
- 增强功能实现: 2026-03-22（缓存、PDF、JS 渲染）
