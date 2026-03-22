# fetch_url 工具增强功能开发记录

## 概述

本文档记录了 `fetch_url` 工具增强功能的开发过程，包括缓存机制、PDF 解析、JS 渲染、FetchMemory 内存管理等功能，以及在开发过程中遇到的问题和解决方案。

---

## 一、增强功能实现

### 1.1 缓存机制 ✅

**实现文件**：`src-tauri/src/tools/cache.rs`

**功能**：
- TTL（Time-To-Live）：默认 30 分钟
- LRU 淘汰策略：最大 100 条缓存
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

### 1.2 PDF 解析 ✅

**实现文件**：`src-tauri/src/tools/pdf.rs`

**依赖**：`pdf-extract = "0.7"`

**功能**：
- 自动检测 `application/pdf` Content-Type
- 提取文本内容并清理
- 估算页数

### 1.3 JS 渲染 ✅（可选功能）

**实现文件**：`src-tauri/src/tools/renderer.rs`

**依赖**：`headless_chrome = "1.0"`（可选）

**启用方式**：
```toml
# Cargo.toml
[features]
default = ["js-render"]
js-render = ["headless_chrome"]
```

### 1.4 FetchMemory 内存管理 ✅

**实现文件**：`src/agent/memory/FetchMemory.ts`

**功能**：
- 存储已获取的网页内容
- 避免重复请求相同 URL
- 在系统提示词中注入已获取内容

---

## 二、问题记录与解决方案

### 2.1 URL 占位符替换问题

**问题描述**：
AI 调用 `fetch_url` 时，URL 占位符 `__URL_PLACEHOLDER_1__` 没有被正确替换为原始 URL。

**原因分析**：
`executeToolCall` 函数使用的是原始的 `toolCall.function.arguments`，而不是修改后的 `params`。

**解决方案**：
修改 `ReActEngine.ts`，直接使用 `ToolRegistry.execute(toolName, params)` 来执行工具。

```typescript
// 修复前
const result = await executeToolCall({
  id: toolCall.id,
  type: 'function',
  function: toolCall.function,  // ← 使用原始参数
});

// 修复后
const result = await ToolRegistry.execute(toolName, params);  // ← 使用修改后的参数
```

### 2.2 AI 错误调用 web_search 问题

**问题描述**：
用户发送 URL 后，AI 错误地调用了 `web_search` 而不是 `fetch_url`。

**解决方案**：
1. 在 `web_search` 工具描述中添加提示
2. 在 `handleToolCall` 中添加拦截逻辑

```typescript
if (toolName === 'web_search' && params.query && isUrlPlaceholder(params.query)) {
  return { 
    output: '', 
    error: `检测到 URL 占位符，请使用 fetch_url 工具获取网页内容。` 
  };
}
```

### 2.3 FetchMemory 内容截断问题

**问题描述**：
`FetchMemory` 在存储时将内容截断到 2000 字符，导致第二次询问时 AI 只能看到截断后的内容。

**原因分析**：
```typescript
// 错误的设计
const truncatedContent = result.content.length > MAX_CONTENT_LENGTH
  ? result.content.slice(0, MAX_CONTENT_LENGTH) + '...(内容已截断)'
  : result.content;
```

**解决方案**：
存储完整内容，不截断。

```typescript
// 正确的设计
this.memory.contents.set(result.url, {
  ...
  content: result.content,  // 完整内容
});
```

### 2.4 上下文大小超出问题（待解决）

**问题描述**：
第二次询问时，LM STUDIO 报错：`Context size has been exceeded`

**原因分析**：
网页内容被重复注入了两次：
1. **对话历史**：第一次对话已经包含了网页内容
2. **系统提示词**：`FetchMemory` 又注入了一次网页内容

**已尝试的解决方案**：
在 `generateContextPrompt` 中添加检测逻辑，检查对话历史中是否已包含该内容：

```typescript
generateContextPrompt(conversationHistory?: Array<{ role: string; content: string }>): string {
  for (const item of contents) {
    if (conversationHistory && this.isContentInHistory(item, conversationHistory)) {
      console.log(`[FetchMemory] Content already in conversation history, skipping: ${item.url}`);
      continue;
    }
    contentsToInject.push(item);
  }
  // ...
}
```

**当前状态**：
问题仍未完全解决，需要进一步调试。

---

## 三、文件变更汇总

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
| `src/agent/memory/FetchMemory.ts` | 新建 | FetchMemory 内存管理 |
| `src/agent/memory/index.ts` | 新建 | 内存模块导出 |
| `src/agent/runtime/ReActEngine.ts` | 修改 | 集成 FetchMemory、URL 占位符替换 |
| `src/components/ChatView.tsx` | 修改 | 修复类型错误 |

---

## 四、待解决问题

### 4.1 上下文大小超出问题

**问题描述**：
第二次询问时，即使添加了检测逻辑，仍然报错 `Context size has been exceeded`。

**可能原因**：
1. `isContentInHistory` 检测逻辑不够准确
2. 对话历史中的内容格式与检测条件不匹配
3. 其他地方也在注入大量内容

**下一步调试方向**：
1. 添加更多日志，确认 `isContentInHistory` 是否正确检测
2. 检查 LM STUDIO 日志，确认系统提示词的实际内容
3. 考虑在对话历史中添加标记，而不是依赖内容匹配

### 4.2 摘要生成功能（未实现）

**计划方案**：前端调用 LLM 生成摘要

**实现思路**：
```typescript
async function generateSummary(content: string, maxLength: number = 500): Promise<string> {
  const inputContent = content.slice(0, 4000);
  // 调用 LLM 生成摘要
}
```

---

## 五、版本信息

- 文档创建日期: 2026-03-22
- 最后更新: 2026-03-22
- 开发状态: 进行中（上下文大小问题待解决）
