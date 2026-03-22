# fetch_url 工具重构计划

## 问题分析

### 当前 `http_request` 工具的问题
1. **CORS 限制**：使用前端 `fetch` API，受浏览器同源策略限制，无法访问大多数外部网站
2. **无正文提取**：返回原始 HTML，包含导航、广告、脚本等噪音，LLM 难以有效理解
3. **无内容长度控制**：可能返回超长内容，超出 LLM 上下文窗口
4. **无 JS 渲染支持**：无法处理需要 JavaScript 渲染的 SPA 页面

## 重构目标

实现一个真正可用于 Agent 的网页浏览工具：
- 绕过 CORS 限制
- 提取网页正文（去除导航/广告/脚本）
- 内容长度控制 + 分块扩展能力
- 返回干净的纯文本格式
- **自动 URL 检测与触发**（类似 ChatGPT/Perplexity 体验）

## 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                      用户输入                                │
│            "帮我看看 https://xxx.com 讲了什么"               │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              消息解析层 (新增)                                │
│  src/agent/preprocess/urlDetector.ts                        │
│  - 自动检测文本中的 URL                                      │
│  - 自动触发 fetch_url 工具                                   │
│  - 实现 ChatGPT/Perplexity 类似体验                          │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                      Agent (LLM)                            │
│                    调用 fetch_url 工具                        │
│                                                              │
│  系统提示词规则：                                             │
│  - 用户输入包含 URL 时，必须调用 fetch_url                    │
│  - 不要凭空猜测网页内容                                       │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                 前端 (React/TypeScript)                      │
│  src/agent/tools/builtin.ts                                 │
│  - createFetchUrlTool()                                     │
│  - 调用 Tauri command: fetch_url                            │
│  - 只负责展示结果                                            │
└─────────────────────────┬───────────────────────────────────┘
                          │ invoke('fetch_url', { url })
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                 后端 (Rust/Tauri)                            │
│  src-tauri/src/tools/fetch.rs                               │
│  1. reqwest 发起 HTTP 请求（绕过 CORS）                       │
│  2. readability 提取正文（优先）                              │
│  3. Fallback 机制（scraper + 自定义算法）                     │
│  4. 内容截断/分块处理                                         │
│  5. 返回结构化结果                                            │
└─────────────────────────────────────────────────────────────┘
```

## 实现步骤

### 第一阶段：Rust 后端实现

#### 1.1 添加依赖 (Cargo.toml)
```toml
[dependencies]
# 现有依赖保留
reqwest = { version = "0.12", features = ["blocking", "gzip", "json"] }
scraper = "0.22"

# 新增：正文提取
readability = "0.3"

# 可选：更现代的正文提取库
# dom_content_extraction = "0.1"
```

#### 1.2 创建新模块 (src-tauri/src/tools/fetch.rs)

**返回结构设计（支持扩展）**：

```rust
use serde::{Deserialize, Serialize};
use tauri::command;

/// 内容块 - 支持分块返回
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentChunk {
    pub index: usize,           // 块索引
    pub content: String,        // 块内容
    pub is_last: bool,          // 是否最后一块
}

/// 提取元数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetchMetadata {
    pub length: usize,          // 内容总长度
    pub domain: String,         // 域名
    pub extraction_method: String,  // 提取方法: "readability" | "scraper" | "fallback"
    pub chunk_count: usize,     // 分块数量（当前为 1）
    pub truncated: bool,        // 是否被截断
}

/// 主返回结构
#[derive(Debug, Serialize, Deserialize)]
pub struct FetchResult {
    pub success: bool,
    pub title: String,
    pub content: String,            // 主内容（兼容当前使用方式）
    pub summary: Option<String>,    // 可选摘要（预留）
    pub content_chunks: Option<Vec<ContentChunk>>,  // 分块内容（预留扩展）
    pub metadata: FetchMetadata,
    pub error: Option<String>,
}

/// 请求选项
#[derive(Debug, Serialize, Deserialize)]
pub struct FetchOptions {
    pub max_length: Option<usize>,      // 默认 8000
    pub timeout: Option<u64>,           // 默认 30000ms
    pub user_agent: Option<String>,
    pub return_chunks: Option<bool>,    // 是否返回分块（预留）
}

#[command]
pub async fn fetch_url(
    url: String,
    options: Option<FetchOptions>,
) -> Result<FetchResult, String> {
    // 实现逻辑...
}
```

#### 1.3 正文提取 Fallback 机制

```rust
use readability::extractor;
use scraper::{Html, Selector};

const MIN_CONTENT_LENGTH: usize = 200;

/// 提取网页正文（带 fallback）
fn extract_content(html: &str, url: &str) -> (String, String, String) {
    // 方案 A: 优先使用 readability
    if let Ok(product) = extractor::extract(html, url) {
        let content = clean_html(&product.content);
        if content.len() >= MIN_CONTENT_LENGTH {
            return (product.title, content, "readability".to_string());
        }
    }
    
    // 方案 B: Fallback - scraper 提取 article/main
    let (title, content) = extract_with_scraper(html);
    if content.len() >= MIN_CONTENT_LENGTH {
        return (title, content, "scraper".to_string());
    }
    
    // 方案 C: 最终 fallback - 提取 body 文本
    let (title, content) = extract_body_text(html);
    (title, content, "fallback".to_string())
}

/// 使用 scraper 提取主要内容
fn extract_with_scraper(html: &str) -> (String, String) {
    let document = Html::parse_document(html);
    
    // 提取标题
    let title = document
        .select(&Selector::parse("title").unwrap())
        .next()
        .map(|el| el.text().collect::<String>())
        .unwrap_or_default();
    
    // 尝试多种选择器
    let selectors = [
        "article",
        "main",
        ".content",
        "#content",
        ".post-content",
        ".article-content",
        ".entry-content",
    ];
    
    for selector_str in &selectors {
        if let Ok(selector) = Selector::parse(selector_str) {
            if let Some(element) = document.select(&selector).next() {
                let content = element.text().collect::<String>();
                if content.len() >= MIN_CONTENT_LENGTH {
                    return (title, clean_text(&content));
                }
            }
        }
    }
    
    // 提取所有 p 标签内容
    let paragraphs: Vec<String> = document
        .select(&Selector::parse("p").unwrap())
        .map(|el| el.text().collect::<String>())
        .filter(|s| s.len() > 20)  // 过滤短段落
        .collect();
    
    (title, paragraphs.join("\n\n"))
}

/// 最终 fallback: 提取 body 文本
fn extract_body_text(html: &str) -> (String, String) {
    let document = Html::parse_document(html);
    
    let title = document
        .select(&Selector::parse("title").unwrap())
        .next()
        .map(|el| el.text().collect::<String>())
        .unwrap_or_default();
    
    let body_text = document
        .select(&Selector::parse("body").unwrap())
        .next()
        .map(|el| el.text().collect::<String>())
        .unwrap_or_default();
    
    (title, clean_text(&body_text))
}

/// 清理 HTML 标签
fn clean_html(html: &str) -> String {
    // 移除 HTML 标签，保留文本
    let re = regex::Regex::new(r"<[^>]+>").unwrap();
    let text = re.replace_all(html, " ");
    clean_text(&text)
}

/// 清理文本
fn clean_text(text: &str) -> String {
    text.lines()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}
```

#### 1.4 内容截断（支持分块扩展）

```rust
/// 截断内容（当前实现）
fn truncate_content(content: &str, max_length: usize) -> (String, bool) {
    if content.len() <= max_length {
        return (content.to_string(), false);
    }
    
    // 尝试在句子边界截断
    let truncated = &content[..max_length];
    if let Some(last_period) = truncated.rfind(['。', '.', '！', '!', '？', '?']) {
        (truncated[..=last_period].to_string(), true)
    } else {
        (format!("{}...", truncated), true)
    }
}

/// 分块内容（预留扩展）
#[allow(dead_code)]
fn chunk_content(content: &str, chunk_size: usize) -> Vec<ContentChunk> {
    let chars: Vec<char> = content.chars().collect();
    let total_chunks = (chars.len() + chunk_size - 1) / chunk_size;
    
    (0..total_chunks)
        .map(|i| {
            let start = i * chunk_size;
            let end = std::cmp::min(start + chunk_size, chars.len());
            ContentChunk {
                index: i,
                content: chars[start..end].iter().collect(),
                is_last: i == total_chunks - 1,
            }
        })
        .collect()
}
```

#### 1.5 注册 Command (src-tauri/src/lib.rs)
```rust
.invoke_handler(tauri::generate_handler![
    // ... 现有 commands
    tools::fetch::fetch_url,  // 新增
])
```

#### 1.6 更新模块导出 (src-tauri/src/tools/mod.rs)
```rust
pub mod filesystem;
pub mod shell;
pub mod fetch;  // 新增
```

### 第二阶段：前端工具重构

#### 2.1 类型定义 (src/agent/tools/types.ts)

```typescript
// 新增类型
export interface ContentChunk {
  index: number;
  content: string;
  is_last: boolean;
}

export interface FetchMetadata {
  length: number;
  domain: string;
  extraction_method: 'readability' | 'scraper' | 'fallback';
  chunk_count: number;
  truncated: boolean;
}

export interface FetchResult {
  success: boolean;
  title: string;
  content: string;
  summary?: string;
  content_chunks?: ContentChunk[];
  metadata: FetchMetadata;
  error?: string;
}
```

#### 2.2 删除旧的 http_request 工具
在 `src/agent/tools/builtin.ts` 中：
- 删除 `createHttpRequestTool()` 函数
- 从 `initializeBuiltinTools()` 中移除注册逻辑
- 从导出列表中移除

#### 2.3 创建新的 fetch_url 工具

```typescript
function createFetchUrlTool(): ToolDefinition {
  return createTool({
    name: 'fetch_url',
    description: `获取网页内容并提取正文。

用于：
- 获取网页的主要文本内容
- 阅读文章、博客、文档等
- 提取网页核心信息

返回干净的正文内容，自动去除广告、导航、脚本等噪音。
支持多种提取方式，确保获取有效内容。`,
    category: 'network',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: '要获取的网页 URL',
        },
        max_length: {
          type: 'integer',
          description: '返回内容的最大字符数（默认: 8000）',
          default: 8000,
        },
      },
      required: ['url'],
    },
    execute: async (params): Promise<ToolExecutionResult> => {
      try {
        const result = await invoke<FetchResult>('fetch_url', {
          url: params.url,
          options: {
            max_length: params.max_length || 8000,
          },
        });

        if (!result.success) {
          return {
            success: false,
            output: '',
            error: result.error || 'Failed to fetch URL',
          };
        }

        // 格式化输出，便于 LLM 理解
        let output = `## ${result.title}\n`;
        output += `来源: ${result.metadata.domain}\n`;
        output += `提取方式: ${result.metadata.extraction_method}\n`;
        if (result.metadata.truncated) {
          output += `⚠️ 内容已截断（原长度: ${result.metadata.length} 字符）\n`;
        }
        output += `\n---\n\n${result.content}`;

        return {
          success: true,
          output,
          metadata: {
            title: result.title,
            domain: result.metadata.domain,
            contentLength: result.content.length,
            extractionMethod: result.metadata.extraction_method,
            truncated: result.metadata.truncated,
          },
        };
      } catch (error) {
        return {
          success: false,
          output: '',
          error: `Fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
      }
    },
  });
}
```

#### 2.4 更新工具初始化
```typescript
export function initializeBuiltinTools(config: Partial<BuiltinToolConfig> = {}): void {
  // ... 其他工具
  
  if (finalConfig.networkEnabled) {
    ToolRegistry.register(createFetchUrlTool());  // 替换原来的 http_request
  }
  
  // ...
}
```

### 第三阶段：自动 URL 检测（ChatGPT/Perplexity 体验）

#### 3.1 创建 URL 检测模块 (src/agent/preprocess/urlDetector.ts)

```typescript
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;

export interface DetectedUrl {
  url: string;
  startIndex: number;
  endIndex: number;
}

/**
 * 检测文本中的 URL
 */
export function detectUrls(text: string): DetectedUrl[] {
  const urls: DetectedUrl[] = [];
  let match;
  
  while ((match = URL_REGEX.exec(text)) !== null) {
    urls.push({
      url: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }
  
  return urls;
}

/**
 * 检查是否需要自动获取网页内容
 */
export function shouldAutoFetch(text: string): boolean {
  const urls = detectUrls(text);
  return urls.length > 0;
}

/**
 * 获取需要预取的 URL 列表（限制数量）
 */
export function getUrlsToPrefetch(text: string, maxUrls: number = 3): string[] {
  const urls = detectUrls(text);
  return urls
    .slice(0, maxUrls)
    .map(u => u.url);
}
```

#### 3.2 集成到消息处理流程

在 Agent 处理用户消息前，自动检测并获取 URL 内容：

```typescript
// src/agent/runtime/AgentRuntime.ts 或类似位置

async function processUserMessage(message: string): Promise<ProcessedMessage> {
  // 1. 检测 URL
  const urls = detectUrls(message);
  
  // 2. 如果存在 URL，自动预取内容
  let urlContexts: UrlContext[] = [];
  if (urls.length > 0) {
    const prefetchPromises = urls.slice(0, 3).map(async ({ url }) => {
      try {
        const result = await invoke<FetchResult>('fetch_url', { url });
        return {
          url,
          title: result.title,
          content: result.content,
          success: result.success,
        };
      } catch {
        return { url, success: false };
      }
    });
    
    urlContexts = await Promise.all(prefetchPromises);
  }
  
  return {
    originalMessage: message,
    urlContexts,
    needsToolCall: urls.length > 0,
  };
}
```

### 第四阶段：系统提示词增强

#### 4.1 更新系统提示词

在 Agent 的系统提示词中添加工具使用规则：

```typescript
// src/data/agents.ts 或系统提示词配置位置

const TOOL_USAGE_RULES = `
## 工具使用规则

### fetch_url 工具（网页内容获取）

当用户输入包含 URL，或问题需要访问具体网页内容时：
- **必须**优先调用 fetch_url 工具获取网页内容
- **禁止**凭空猜测或编造网页内容
- 获取内容后，基于实际内容回答用户问题

示例场景：
1. 用户: "帮我看看这个网页讲了什么 https://example.com"
   → 必须调用 fetch_url("https://example.com")

2. 用户: "这篇文章的观点是什么？https://blog.com/article"
   → 必须调用 fetch_url 获取文章内容后再分析

3. 用户: "总结一下 https://docs.com/guide 的要点"
   → 必须调用 fetch_url 获取文档内容后再总结
`;

// 将此规则添加到 Agent 的 system prompt 中
```

### 第五阶段：错误处理与安全

#### 5.1 错误处理
- URL 格式验证
- 网络超时处理
- 非 HTML 内容处理（如 PDF、图片）
- 编码检测与转换
- 重定向处理

#### 5.2 安全考虑
```rust
/// SSRF 防护：禁止访问内网地址
fn is_safe_url(url: &str) -> Result<url::Url, String> {
    let parsed = url::Url::parse(url)
        .map_err(|e| format!("Invalid URL: {}", e))?;
    
    if let Some(host) = parsed.host_str() {
        // 禁止内网地址
        let blocked = [
            "localhost", "127.0.0.1", "0.0.0.0",
            "10.", "172.16.", "192.168.",
            "::1", "fe80::",
        ];
        
        for pattern in &blocked {
            if host.starts_with(pattern) || host == *pattern {
                return Err("Access to internal network is not allowed".to_string());
            }
        }
    }
    
    Ok(parsed)
}
```

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src-tauri/Cargo.toml` | 修改 | 添加 readability 依赖 |
| `src-tauri/src/tools/fetch.rs` | 新建 | fetch_url command 实现（含 fallback） |
| `src-tauri/src/tools/mod.rs` | 修改 | 导出 fetch 模块 |
| `src-tauri/src/lib.rs` | 修改 | 注册 fetch_url command |
| `src/agent/tools/types.ts` | 修改 | 添加 FetchResult 等类型 |
| `src/agent/tools/builtin.ts` | 修改 | 删除 http_request，添加 fetch_url |
| `src/agent/preprocess/urlDetector.ts` | 新建 | URL 自动检测模块 |
| `src/agent/runtime/AgentRuntime.ts` | 修改 | 集成自动 URL 预取 |
| `src/data/agents.ts` | 修改 | 更新系统提示词 |

## 测试计划

1. **单元测试**：
   - 正文提取函数（readability + fallback）
   - URL 检测函数
   - 内容截断函数

2. **集成测试**：
   - fetch_url command
   - 自动 URL 预取流程

3. **端到端测试**：
   - 访问普通新闻网站
   - 访问技术博客
   - 访问需要 JS 渲染的页面（预期：返回基础内容）
   - 超长内容截断
   - 错误 URL 处理
   - 内网地址防护

## 风险与限制

1. **JS 渲染**：当前方案无法处理需要 JavaScript 渲染的 SPA 页面。如需支持，需要引入 headless browser。
2. **反爬虫**：部分网站有反爬虫机制，可能需要添加 headers 模拟浏览器。
3. **编码问题**：部分网站使用非 UTF-8 编码，需要检测并转换。

## 后续增强

1. **分块返回**：实现完整的分块机制，支持长文档完整阅读
2. **缓存机制**：避免重复请求相同 URL
3. **PDF 解析**：支持 PDF 文档内容提取
4. **JS 渲染**（可选）：引入 headless browser 支持 SPA 页面
5. **摘要生成**：可选返回 AI 生成的摘要
