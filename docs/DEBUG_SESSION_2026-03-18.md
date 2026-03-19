# 调试会话记录 - 2026-03-19

## 问题描述

用户在使用默认助手进行网络搜索时遇到以下问题：

1. **web_search 工具调用失败** - 返回 "Search failed: Unknown error"
2. **流式输出失效** - 内容突然蹦出来而不是逐字显示
3. **React 无限循环** - "Maximum update depth exceeded" 错误
4. **React key 重复警告** - "Encountered two children with the same key"
5. **AI 使用旧年份搜索** - AI 模型不知道当前是 2026 年
6. **搜索阻塞 UI** - 程序未响应，无法滚动页面
7. **Bing 搜索返回不相关结果** - 搜索结果与查询无关
8. **Bing 搜索返回 0 结果** - HTML 解析失败，返回空数组
9. **搜索查询过于复杂** - AI 生成的搜索查询堆砌太多关键词
10. **硬编码停用词** - 相关性检查中硬编码了特定查询的关键词
11. **搜狗搜索不稳定** - 搜狗搜索结果极不稳定，频繁返回空结果

## 问题分析与修复

### 1. web_search 工具调用失败

**根本原因**：在流式处理 `streamLLMWithTools` 函数中，当处理 tool_calls 的增量更新时，LLM 返回的后续 chunks 中 `tc.id` 通常是 `undefined`。原代码尝试用 `undefined` 作为 key 来查找已存在的 toolCall，导致无法正确累积 `arguments` 字符串。

**修复文件**：`src/agent/llm/functionCalling.ts`

**修复内容**：当 `id` 为 undefined 时，如果只有一个 toolCall 在处理中，会自动使用那个来累积 arguments。

```typescript
if (id && !toolCallsMap.has(id)) {
  toolCallsMap.set(id, {
    id,
    type: 'function',
    function: { name: '', arguments: '' },
  });
}

let existing: ToolCallRequest | undefined;
if (id) {
  existing = toolCallsMap.get(id);
} else if (toolCallsMap.size === 1) {
  existing = Array.from(toolCallsMap.values())[0];
}
```

### 2. 流式输出失效

**根本原因**：React 18 的自动批量更新会将多个 `setMessages` 调用合并为一次渲染，导致流式内容不是逐字显示。

**修复文件**：`src/App.tsx`

**修复内容**：使用 `useRef` 和 `requestAnimationFrame` 来批量更新 UI，确保每帧只更新一次。

```typescript
const streamingContentRef = useRef<string>('');
const streamingUpdateScheduledRef = useRef<boolean>(false);

const handleContentChunk = useCallback((chunk: string) => {
  if (!currentExecutionMessageIdRef.current) return;
  
  streamingContentRef.current += chunk;
  
  if (!streamingUpdateScheduledRef.current) {
    streamingUpdateScheduledRef.current = true;
    requestAnimationFrame(() => {
      const content = streamingContentRef.current;
      streamingContentRef.current = '';
      streamingUpdateScheduledRef.current = false;
      
      setMessages(prev => prev.map(m => {
        if (m.id === currentExecutionMessageIdRef.current) {
          return { ...m, content: m.content + content };
        }
        return m;
      }));
    });
  }
}, [setMessages]);
```

### 3. React 无限循环问题

**根本原因**：
1. `handleScroll` 在每次调用时都会 `setActiveMessageId`，即使值没有变化
2. `messages` 作为 useEffect 的依赖项，当流式更新时会频繁变化
3. `callbacks` 对象每次渲染都会重新创建，导致依赖循环

**修复文件**：
- `src/components/ChatView.tsx`
- `src/hooks/useAgentExecution.ts`
- `src/App.tsx`

**修复内容**：

1. **ChatView.tsx**：使用 `useRef` 存储 `messages` 的最新引用，避免闭包问题
```typescript
const messagesRef = useRef(messages);
messagesRef.current = messages;

// 在 handleScroll 中使用 messagesRef.current
```

2. **useAgentExecution.ts**：使用 `useRef` 存储 `callbacks` 的最新引用
```typescript
const callbacksRef = useRef(callbacks);
callbacksRef.current = callbacks;

const notifyExecutionUpdate = useCallback(() => {
  if (callbacksRef.current?.onExecutionUpdate) {
    callbacksRef.current.onExecutionUpdate({...});
  }
}, [reasoningSteps, toolCalls, iterationCount, status]); // 移除 callbacks 依赖
```

3. **App.tsx**：使用 `useRef` 存储 `currentExecutionMessageId` 的最新引用
```typescript
const currentExecutionMessageIdRef = useRef<string | null>(null);
currentExecutionMessageIdRef.current = currentExecutionMessageId;
```

### 4. React key 重复问题

**根本原因**：在 `AgentRuntime.ts` 中，`onReasoningStep` 回调只传递了 `type` 和 `content`，没有传递完整的 `step` 对象（包含 `id`），导致 React 渲染时 key 为 undefined。

**修复文件**：`src/agent/runtime/AgentRuntime.ts`

**修复内容**：直接传递完整的 `step` 对象
```typescript
onReasoningStep: (step) => {
  agentStateManager.addReasoningStep(this.agent.id, step);
  this.callbacks.onReasoningStep?.(step); // 传递完整的 step 对象
},
```

### 5. AI 使用旧年份搜索

**根本原因**：AI 模型不知道当前日期，默认使用训练数据截止日期附近的年份。

**修复文件**：
- `src/agent/runtime/ReActEngine.ts`
- `src/agent/tools/builtin.ts`

**修复内容**：

1. **系统提示添加当前日期**：
```typescript
const REACT_SYSTEM_PROMPT = `You are an intelligent agent...

## Current Date
Today's date is: {{CURRENT_DATE}}
When searching for recent news or information, use the current year ({{CURRENT_YEAR}}) in your search queries.
...`;

// 在 buildInitialMessages 中替换占位符
const currentDate = new Date().toLocaleDateString('zh-CN', { 
  year: 'numeric', 
  month: 'long', 
  day: 'numeric',
  weekday: 'long'
});
systemPrompt = systemPrompt.replace(/\{\{CURRENT_DATE\}\}/g, currentDate);
```

### 6. 搜索阻塞 UI

**根本原因**：Rust 后端使用 `reqwest::blocking`（同步阻塞），会阻塞 Tauri 的主线程，导致 UI 无法响应。

**修复文件**：
- `src-tauri/Cargo.toml`
- `src-tauri/src/search.rs`

**修复内容**：

1. **添加异步运行时依赖**：
```toml
tokio = { version = "1", features = ["rt-multi-thread", "macros"] }
```

2. **重写搜索为异步实现**：
```rust
#[tauri::command]
pub async fn search(query: String) -> Result<SearchResponse, String> {
    search_async(query).await
}
```

### 7. 硬编码停用词问题

**根本原因**：在 `is_relevant_result` 函数中，硬编码了 `["2026", "2025", "2024", "2023", "原因", "最新", "消息", "新闻"]` 这些停用词，这些是从之前的测试查询中提取的特定关键词，不应该硬编码到代码中。

**修复文件**：`src-tauri/src/search.rs`

**修复内容**：使用动态关键词匹配进行相关性检查，而不是硬编码停用词。

```rust
fn is_result_relevant(query: &str, results: &[SearchResult]) -> bool {
    if results.is_empty() {
        return false;
    }
    
    let query_lower = query.to_lowercase();
    let query_keywords: Vec<&str> = query_lower
        .split_whitespace()
        .filter(|w| w.chars().count() >= 2)
        .collect();
    
    if query_keywords.is_empty() {
        return true;
    }
    
    let mut relevant_count = 0;
    for result in results {
        let title_lower = result.title.to_lowercase();
        let snippet_lower = result.snippet.to_lowercase();
        let combined = format!("{} {}", title_lower, snippet_lower);
        
        let mut keyword_matches = 0;
        for keyword in &query_keywords {
            if combined.contains(keyword) {
                keyword_matches += 1;
            }
        }
        
        if keyword_matches > 0 {
            relevant_count += 1;
        }
    }
    
    let relevance_ratio = relevant_count as f32 / results.len() as f32;
    relevance_ratio >= 0.3
}
```

### 8. DuckDuckGo 超时太长

**根本原因**：全局 HTTP 客户端超时设置为 15 秒，每次尝试 DuckDuckGo 都要等 15 秒才超时，导致搜索非常耗时。

**修复文件**：`src-tauri/src/search.rs`

**修复内容**：使用 `tokio::time::timeout` 设置 5 秒超时。

```rust
let response = match tokio::time::timeout(
    std::time::Duration::from_secs(5),
    client.get(&url).send()
).await {
    Ok(Ok(resp)) => resp,
    Ok(Err(e)) => { /* 请求错误 */ return None; }
    Err(_) => { /* 超时 */ return None; }
};
```

### 9. AI 搜索查询过于复杂

**根本原因**：工具描述没有指导 AI 如何生成好的搜索查询，AI 堆砌了太多关键词（如 `"2026年 AI美术 接单平台 价格 外包 市场价格"`），导致搜索引擎无法理解意图。

**修复文件**：`src/agent/tools/builtin.ts`

**修复内容**：优化 web_search 工具描述，指导 AI 生成简洁自然的搜索查询。

```typescript
description: `Search the web for current information. Returns a list of search results with titles, URLs, and snippets.

IMPORTANT: Write concise, natural search queries like a human would. 
- Use 2-4 keywords maximum, focusing on the core topic
- Do NOT include year numbers unless specifically asked about a specific year
- Do NOT stack multiple similar keywords (e.g., "价格 市场价格 价格表")
- Examples of good queries: "Python教程", "北京天气", "iPhone价格"
- Examples of bad queries: "2026年 北京 天气 预报 明天 后天"`
```

同时移除了自动添加年份的逻辑：
```typescript
// 移除了以下代码：
// const oldYearPattern = /\b(2020|2021|2022|2023|2024)\b/g;
// if (oldYearPattern.test(query)) { ... }
// if (!query.includes(String(currentYear))) { query = `${query} ${currentYear}`; }
```

### 10. Bing 返回乱码/0 结果

**根本原因**：请求头中包含 `Accept-Encoding: gzip, deflate, br`，Bing 返回了 gzip 压缩的响应，但 reqwest 没有正确解压，导致 HTML 内容是乱码，解析器无法匹配任何元素。

**修复文件**：`src-tauri/src/search.rs`

**修复内容**：移除 `Accept-Encoding` 头，让服务器返回未压缩的 HTML。

```rust
let response = client
    .get(&url)
    .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
    .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
    // 移除了这行：.header("Accept-Encoding", "gzip, deflate, br")
    .header("Connection", "keep-alive")
    .header("Upgrade-Insecure-Requests", "1")
    // ... 其他请求头
    .send()
    .await
    .ok()?;
```

### 11. 搜狗搜索不稳定

**根本原因**：搜狗搜索结果极不稳定，第一次搜索可能返回正确结果，但后续搜索频繁返回空结果。可能原因包括：
- 搜狗对短时间内多次请求进行了频率限制（Rate Limiting）
- 搜狗使用 React 渲染页面，HTML 结构复杂且可能动态变化
- 搜狗的反爬虫机制

**修复文件**：
- `src-tauri/src/search.rs`
- `src/components/SettingsView.tsx`
- `src/i18n/locales/zh.json`
- `src/i18n/locales/en.json`

**修复内容**：完全移除搜狗搜索引擎，简化为只支持 DuckDuckGo 和 Bing。

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SearchEngine {
    Auto,
    Bing,
    Duckduckgo,
}
```

## 搜索引擎配置

### 当前支持的搜索引擎

| 搜索引擎 | 国内可访问 | 特点 |
|---------|-----------|------|
| DuckDuckGo Lite | ❌ 可能被屏蔽 | 隐私保护，结果准确 |
| Bing | ✅ 大部分可访问 | 国际搜索，结果质量高 |

### 搜索模式

| 模式 | 搜索流程 |
|------|---------|
| **Auto (推荐)** | DuckDuckGo → Bing fallback |
| **Bing** | Bing → DuckDuckGo fallback |
| **DuckDuckGo** | 仅 DuckDuckGo（需VPN） |

### 搜索流程（Auto 模式）

```
用户搜索请求
     ↓
┌─────────────────────────────────────┐
│ 1. DuckDuckGo Lite (国际搜索)       │
│    - 优先尝试                       │
│    - 5 秒超时                       │
│    - 可能被国内网络屏蔽              │
│    - 结果相关性检查                  │
└─────────────────────────────────────┘
     ↓ (失败或结果不相关)
┌─────────────────────────────────────┐
│ 2. Bing (国际搜索，国内可访问)      │
│    - 微软搜索引擎                   │
│    - 使用 cc=US&setlang=en 强制国际版 │
│    - 结果相关性检查                  │
└─────────────────────────────────────┘
     ↓ (失败或结果不相关)
┌─────────────────────────────────────┐
│ 3. 返回 Bing 结果（最后手段）       │
│    - 即使相关性低也返回              │
└─────────────────────────────────────┘
```

## 修改的文件列表

| 文件路径 | 修改内容 |
|---------|---------|
| `src/agent/llm/functionCalling.ts` | 修复流式处理中 tool_calls id 为 undefined 时的处理 |
| `src/App.tsx` | 添加 useRef 存储 currentExecutionMessageId，使用 requestAnimationFrame 批量更新流式内容 |
| `src/components/ChatView.tsx` | 添加 useRef 存储 messages，移除 messages 作为 useEffect 依赖项 |
| `src/hooks/useAgentExecution.ts` | 添加 useRef 存储 callbacks，移除 callbacks 作为依赖项 |
| `src/agent/runtime/AgentRuntime.ts` | 修复 onReasoningStep 回调传递完整的 step 对象，添加工具初始化标志 |
| `src/agent/runtime/ReActEngine.ts` | 添加系统提示中的当前日期，修复用户消息重复发送问题 |
| `src/agent/tools/builtin.ts` | 优化 web_search 工具描述，移除自动添加年份的逻辑，添加调试日志 |
| `src/context/GlobalStateContext.tsx` | 添加搜索引擎选择状态，localStorage 持久化 |
| `src/components/SettingsView.tsx` | 添加网络搜索设置区域，搜索引擎下拉选择 |
| `src/i18n/locales/zh.json` | 添加搜索引擎相关翻译，移除搜狗选项 |
| `src/i18n/locales/en.json` | 添加搜索引擎相关翻译，移除搜狗选项 |
| `src-tauri/Cargo.toml` | 添加 tokio 异步运行时依赖，添加 reqwest gzip feature |
| `src-tauri/src/search.rs` | 改为异步实现，添加搜索引擎选择，移除搜狗，添加相关性检查，添加 fallback 机制 |

---

*文档更新时间: 2026-03-19*
