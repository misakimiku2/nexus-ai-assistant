# 修复 AI 搜索 Tool Call 参数缺失问题

## 问题分析

### 根本原因
LLM (qwen/qwen3.5-9b) 在生成 tool_calls 时，有时会生成参数不完整或空的调用：
- 第一个 tool_call 参数正确：`{"query":"杭州旅游景点 摄影打卡地","max_results":5}`
- 第二个 tool_call 参数为空：`"arguments": ""`

### 错误链
1. `parseToolCallArguments("")` 返回 `{}`（空对象）
2. `web_search` 工具的 `query` 参数是 `required`，但传入的是 `undefined`
3. `params.query as string` 变成字符串 `"undefined"`
4. 搜索引擎收到 `"undefined"` 作为查询词
5. 最终导致 `500 Internal Server Error`

### 相关代码位置
- [functionCalling.ts:106-112](src/agent/llm/functionCalling.ts#L106-L112) - `parseToolCallArguments` 函数
- [ReActEngine.ts:355-360](src/agent/runtime/ReActEngine.ts#L355-L360) - `handleToolCall` 方法
- [builtin.ts:117-119](src/agent/tools/builtin.ts#L117-L119) - `web_search` 工具执行入口

## 修复方案

### 步骤 1：增强参数验证
在 `parseToolCallArguments` 函数中添加更详细的日志和验证：

**文件**: `src/agent/llm/functionCalling.ts`

修改 `parseToolCallArguments` 函数：
- 当参数为空或无效时，记录警告日志
- 返回一个带有 `_invalid` 标记的对象，以便后续处理

### 步骤 2：在 handleToolCall 中添加必需参数检查
在执行工具前验证必需参数是否存在：

**文件**: `src/agent/runtime/ReActEngine.ts`

在 `handleToolCall` 方法中：
- 获取工具定义，检查 `required` 参数
- 如果必需参数缺失，返回明确的错误信息
- 不执行工具调用，直接返回错误

### 步骤 3：在工具执行入口添加防御性检查
在 `web_search` 工具的 `execute` 函数中：

**文件**: `src/agent/tools/builtin.ts`

- 检查 `query` 参数是否存在且有效
- 如果无效，立即返回错误，不执行搜索

## 实施步骤

1. 修改 `src/agent/llm/functionCalling.ts` 中的 `parseToolCallArguments` 函数
2. 修改 `src/agent/runtime/ReActEngine.ts` 中的 `handleToolCall` 方法，添加参数验证
3. 修改 `src/agent/tools/builtin.ts` 中的 `web_search` 工具，添加防御性检查

## 预期结果

修复后：
- 当 LLM 生成空的 tool_call 参数时，系统会返回明确的错误信息
- 不会将 `"undefined"` 作为查询词发送给搜索引擎
- 用户会看到有意义的错误提示，而不是 500 错误
