# URL 处理重构计划

## 问题背景

当前 `fetch_url` 工具存在以下问题：
1. LLM 会错误地修改 URL（尤其是包含编码字符如 `%E9%9C%B2%E5%B8%95`），导致访问错误页面
2. URL 预处理模块已创建但未启用
3. 后端未处理包含非 ASCII 字符（如中文）的 URL

## 目标

- URL 处理脱离 LLM，变成确定性逻辑
- 保证 URL 请求是 deterministic（确定性），而不是由模型猜测
- 支持包含中文字符的 URL 自动编码

---

## 实施步骤

### 第一阶段：增强 URL 预处理模块

#### 1.1 修改 `src/agent/preprocess/urlDetector.ts`

**改动内容**：
- 添加 `PreprocessedInput` 接口，包含原始消息和提取的 URL 列表
- 添加 `preprocessInput()` 函数，在 LLM 处理前提取所有 URL
- 确保 URL 保留原始编码（不解码）
- 为每个 URL 生成唯一标识符，用于后续匹配

**新增接口**：
```typescript
export interface PreprocessedInput {
  originalMessage: string;      // 原始用户输入
  cleanedMessage: string;       // 清理后的消息（URL 替换为占位符）
  detectedUrls: DetectedUrl[];  // 检测到的 URL 列表
  urlMap: Map<string, string>;  // 占位符 -> 原始 URL 的映射
}
```

**新增函数**：
- `preprocessInput(text: string): PreprocessedInput` - 预处理用户输入
- `replaceUrlPlaceholders(text: string, urlMap: Map<string, string>): string` - 替换占位符回原始 URL

---

### 第二阶段：修改 Agent 执行流程

#### 2.1 修改 `src/agent/runtime/AgentRuntime.ts`

**改动内容**：
- 在 `execute()` 方法中，调用预处理模块提取 URL
- 将 URL 映射传递给 ReActEngine
- 在工具调用时，使用预处理提取的 URL

#### 2.2 修改 `src/agent/types.ts`

**新增接口**：
```typescript
export interface AgentExecutionContext {
  // ... 现有字段
  preprocessedUrls?: Map<string, string>;  // 占位符 -> 原始 URL
}
```

#### 2.3 修改 `src/agent/runtime/ReActEngine.ts`

**改动内容**：
- 在构造函数中接收 URL 映射
- 在处理工具调用时，检查参数是否为 URL 占位符
- 如果是占位符，替换为原始 URL

---

### 第三阶段：修改 fetch_url 工具定义

#### 3.1 修改 `src/agent/tools/builtin.ts`

**改动内容**：
- 更新 `fetch_url` 工具的描述，明确说明：
  - URL 必须使用预处理提供的原始 URL
  - 禁止 LLM 对 URL 进行解码、修改路径、替换关键词等操作
- 添加 URL 验证逻辑，确保 URL 来自预处理模块

**更新工具描述**：
```typescript
description: `获取网页内容并提取正文。

**重要：URL 处理规则**
- URL 必须使用用户提供的原始 URL，不做任何修改
- 禁止对 URL 进行：解码、修改路径、替换关键词、重新拼接
- 如果用户消息中包含 URL，必须使用该原始 URL

用于：
- 获取网页的主要文本内容
- 阅读文章、博客、文档等
- 提取网页核心信息`
```

---

### 第四阶段：增强后端 URL 处理

#### 4.1 修改 `src-tauri/src/tools/fetch.rs`

**改动内容**：
- 添加 `encode_url_if_needed()` 函数，检测并编码非 ASCII 字符
- 使用 Rust 标准库 `url` crate 进行 URL 编码
- 在 `fetch_url` 函数开始时调用编码函数

**新增函数**：
```rust
fn encode_url_if_needed(url: &str) -> Result<String, String> {
    let parsed = Url::parse(url).map_err(|e| format!("Invalid URL: {}", e))?;
    
    // 检查路径和查询参数中是否有非 ASCII 字符
    let path = parsed.path();
    let query = parsed.query().unwrap_or("");
    
    let needs_encoding = path.chars().any(|c| !c.is_ascii()) 
        || query.chars().any(|c| !c.is_ascii());
    
    if needs_encoding {
        // 使用 url crate 进行编码
        // ...
    }
    
    Ok(url.to_string())
}
```

**依赖检查**：
- `url` crate 已在项目中（reqwest 依赖它）
- 使用 `url::form_urlencoded::byte_serialize` 或 `urlencoding` crate

---

### 第五阶段：更新系统提示词

#### 5.1 修改 `src/data/agents.ts`

**改动内容**：
- 更新 `DEFAULT_AGENT` 的 `systemPrompt`
- 添加明确的 URL 处理规则

**更新内容**：
```typescript
systemPrompt: `...

## fetch_url 工具规则（必须严格遵守）

**URL 处理规则**：
1. URL 必须作为"原始字符串"传递，不做任何修改
2. 禁止对 URL 进行：
   - 解码后重新拼接
   - 修改路径
   - 替换关键词
   - 任何语义处理
3. 必须使用用户提供的原始 URL，保证请求是确定性的

示例：
用户: "帮我看看 https://example.com/露帕 的内容"
正确: fetch_url("https://example.com/露帕")  // 保持原样
错误: fetch_url("https://example.com/%E9%9C%B2%E5%B8%95")  // 禁止自行编码
错误: fetch_url("https://example.com/lupa")  // 禁止翻译
`
```

---

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/agent/preprocess/urlDetector.ts` | 修改 | 添加预处理函数和接口 |
| `src/agent/preprocess/index.ts` | 修改 | 导出新函数和类型 |
| `src/agent/types.ts` | 修改 | 添加 preprocessedUrls 字段 |
| `src/agent/runtime/AgentRuntime.ts` | 修改 | 集成 URL 预处理 |
| `src/agent/runtime/ReActEngine.ts` | 修改 | 处理 URL 占位符替换 |
| `src/agent/tools/builtin.ts` | 修改 | 更新 fetch_url 工具描述 |
| `src/data/agents.ts` | 修改 | 更新系统提示词 |
| `src-tauri/src/tools/fetch.rs` | 修改 | 添加 URL 编码逻辑 |
| `src-tauri/Cargo.toml` | 检查 | 确认 urlencoding 依赖 |

---

## 测试计划

1. **URL 编码测试**：
   - 包含中文字符的 URL：`https://example.com/露帕`
   - 已编码的 URL：`https://example.com/%E9%9C%B2%E5%B8%95`
   - 混合 URL：`https://example.com/露帕?page=1`

2. **LLM 不修改 URL 测试**：
   - 验证 LLM 传递的 URL 与用户输入完全一致
   - 验证后端接收到的 URL 与前端发送的一致

3. **边界情况测试**：
   - URL 包含特殊字符
   - URL 包含 emoji
   - 多个 URL 的情况

---

## 风险评估

1. **低风险**：后端 URL 编码逻辑，使用标准库实现
2. **中风险**：URL 预处理与 Agent 执行流程的集成，需要仔细处理占位符替换
3. **需要注意**：确保预处理不会影响其他工具的正常使用

---

## 实施顺序

1. 先实现后端 URL 编码（第四阶段）- 独立模块，风险最低
2. 再实现前端预处理（第一、二、三阶段）- 核心逻辑
3. 最后更新系统提示词（第五阶段）- 配合前端逻辑
