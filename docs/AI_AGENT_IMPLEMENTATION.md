# AI Agent 运行时实现文档

## 概述

本次更新将应用从一个简单的 LLM 聊天 UI 转变为一个真正的 AI Agent 系统。Agent 现在具备自主规划、工具调用、自我反思和协作能力。

## 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Agent Runtime                                 │
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐   │
│  │ Task Planner │ →  │ Task Executor│ →  │ Tool Orchestrator    │   │
│  │ (任务规划器)  │    │ (任务执行器)  │    │ (工具编排器)          │   │
│  └──────────────┘    └──────────────┘    └──────────────────────┘   │
│         ↓                   ↓                      ↓                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐   │
│  │ Reasoning    │    │ State Manager│    │ Agent Coordinator    │   │
│  │ (推理引擎)    │    │ (状态管理器)  │    │ (Agent 协调器)        │   │
│  └──────────────┘    └──────────────┘    └──────────────────────┘   │
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐   │
│  │ Preprocessor │    │ Memory Mgr   │    │ URL Handler          │   │
│  │ (预处理器)    │    │ (内存管理器)  │    │ (URL 处理器)          │   │
│  └──────────────┘    └──────────────┘    └──────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
         ↓                    ↓                      ↓
┌────────────────┐  ┌────────────────┐    ┌────────────────────────┐
│ Tool Registry  │  │ LLM Providers  │    │ MCP Server Manager     │
│ (工具注册中心)  │  │ (LM Studio等)  │    │ (MCP 服务器管理器)      │
└────────────────┘  └────────────────┘    └────────────────────────┘
```

### ReAct 执行流程

```
用户输入
    ↓
┌─────────────────────────────────────────────────────────────┐
│ 1. Preprocessing (预处理)                                    │
│    - URL 检测与占位符替换                                    │
│    - 图片附件处理                                            │
│    - 对话历史预处理                                          │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Perception (感知)                                         │
│    - 理解用户意图                                            │
│    - 提取任务目标                                            │
│    - 识别需要的工具/Agent                                    │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Planning (规划)                                           │
│    - 分解复杂任务为子任务                                    │
│    - 确定执行顺序                                            │
│    - 分配给合适的 Agent/工具                                 │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Execution Loop (执行循环)                                 │
│    ┌─────────────────────────────────────────────────────┐  │
│    │ Thought: 思考下一步该做什么                          │  │
│    │ Action: 选择工具并构造参数                           │  │
│    │ Observation: 执行工具，获取结果                      │  │
│    │ ↓ (循环直到任务完成或达到最大步数)                   │  │
│    └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. Response (响应)                                           │
│    - 综合所有执行结果                                        │
│    - 生成最终回答                                            │
│    - 更新 Agent 状态                                         │
│    - 缓存获取的内容到内存                                    │
└─────────────────────────────────────────────────────────────┘
```

## 新增文件清单

### 前端 Agent 运行时 (`src/agent/`)

| 文件路径                                  | 功能描述                                        |
| ------------------------------------- | ------------------------------------------- |
| `src/agent/types.ts`                  | Agent 核心类型定义，包括状态、任务、工具调用记录、推理步骤等           |
| `src/agent/index.ts`                  | Agent 模块导出入口                                |
| `src/agent/runtime/AgentRuntime.ts`   | Agent 运行时主类，管理执行生命周期                        |
| `src/agent/runtime/AgentState.ts`     | Agent 状态管理器，跟踪执行状态和历史                       |
| `src/agent/runtime/ReActEngine.ts`    | ReAct 推理引擎，实现 Thought→Action→Observation 循环 |
| `src/agent/runtime/index.ts`          | Runtime 模块导出入口                              |
| `src/agent/llm/functionCalling.ts`    | Function Calling 协议实现，支持 OpenAI 兼容格式        |
| `src/agent/llm/index.ts`              | LLM 模块导出入口                                  |
| `src/agent/tools/types.ts`            | 工具类型定义，包括 JSON Schema、工具定义、FetchResult 等    |
| `src/agent/tools/ToolRegistry.ts`     | 工具注册中心，管理工具的注册、启用、执行                        |
| `src/agent/tools/builtin.ts`          | 内置工具集实现，包含 Tavily API 集成                    |
| `src/agent/tools/index.ts`            | Tools 模块导出入口                                |
| `src/agent/memory/FetchMemory.ts`     | **新增** - 内存管理模块，缓存 fetch\_url 获取的网页内容       |
| `src/agent/memory/index.ts`           | 内存模块导出入口                                    |
| `src/agent/preprocess/urlDetector.ts` | **新增** - URL 预处理模块，处理 URL 占位符替换             |
| `src/agent/preprocess/index.ts`       | 预处理模块导出入口                                   |

### Rust 后端工具 (`src-tauri/src/tools/`)

| 文件路径                                | 功能描述                               |
| ----------------------------------- | ---------------------------------- |
| `src-tauri/src/tools/mod.rs`        | 工具模块导出入口                           |
| `src-tauri/src/tools/filesystem.rs` | 文件系统工具（读、写、列表、删除、创建目录）             |
| `src-tauri/src/tools/shell.rs`      | Shell 命令执行、PowerShell、系统信息获取       |
| `src-tauri/src/tools/fetch.rs`      | **新增** - 网页内容获取，支持 HTML 解析和 PDF 提取 |
| `src-tauri/src/tools/pdf.rs`        | **新增** - PDF 文档处理，提取文本内容           |
| `src-tauri/src/tools/cache.rs`      | **新增** - 缓存管理，支持网页内容缓存             |
| `src-tauri/src/tools/renderer.rs`   | **新增** - JS 渲染引擎，支持 SPA 页面渲染       |

### UI 组件和 Hooks

| 文件路径                                    | 功能描述                                            |
| --------------------------------------- | ----------------------------------------------- |
| `src/components/AgentExecutionView.tsx` | Agent 执行可视化组件，显示推理步骤和工具调用，集成到 ChatView 思考折叠面板中  |
| `src/hooks/useAgentExecution.ts`        | Agent 执行 React Hook，管理执行状态，支持流式输出、Token 统计和回调通知 |

## 核心类型定义

### AgentStatus

```typescript
export type AgentStatus = 'idle' | 'thinking' | 'acting' | 'responding' | 'waiting_auth' | 'completed' | 'failed';
```

### ToolCallRecord

```typescript
export interface ToolCallRecord {
  id: string;
  toolName: string;
  parameters: Record<string, unknown>;
  result?: ToolCallResult;
  status: 'pending' | 'executing' | 'success' | 'error' | 'waiting_auth';
  timestamp: number;
  requiresAuth: boolean;
  approvedByUser?: boolean;
}
```

### ReasoningStep

```typescript
export interface ReasoningStep {
  id: string;
  type: 'thought' | 'action' | 'observation';
  content: string;
  timestamp: number;
  toolCallId?: string;
  isStreaming?: boolean;           // 是否正在流式输出
  toolName?: string;               // 工具名称（action 类型）
  toolParams?: Record<string, unknown>;  // 工具参数（action 类型）
  observationData?: Array<{ title: string; url: string; snippet?: string }>;  // 观察数据（observation 类型）
  executionStatus?: 'executing' | 'completed';  // 执行状态（action 类型）
}
```

### AgentExecutionState

```typescript
export interface AgentExecutionState {
  agentId: string;
  status: AgentStatus;
  currentTask?: Task;
  taskQueue: Task[];
  completedTasks: Task[];
  reasoningSteps: ReasoningStep[];
  toolCallHistory: ToolCallRecord[];
  iterationCount: number;
  maxIterations: number;
  startTime: number;
  lastUpdateTime: number;
}
```

### AgentExecutionContext (更新)

```typescript
export interface AgentExecutionContext {
  agent: Agent;
  userInput: string;
  originalUserInput?: string;
  conversationHistory: ConversationMessage[];
  availableTools: string[];
  preprocessedUrls?: Map<string, string>;  // 新增：URL 占位符映射
  imageAttachments?: { data: string; name: string }[];  // 新增：图片附件
  onStatusChange?: (status: AgentStatus) => void;
  onTaskUpdate?: (task: Task) => void;
  onToolCall?: (record: ToolCallRecord) => void;
  onReasoningStep?: (step: ReasoningStep) => void;
  onReasoningStepUpdate?: (step: ReasoningStep) => void;  // 新增
  onRequestAuth?: (toolCall: ToolCallRecord) => Promise<boolean>;
  onContentChunk?: (chunk: string) => void;
  onIterationCountChange?: (count: number) => void;
  onTokenUsage?: (usage: { inputTokens: number; outputTokens: number }) => void;  // 新增
}
```

### AgentExecutionData

用于存储在消息中的 Agent 执行数据，支持在 ChatView 思考折叠面板中显示：

```typescript
export interface AgentExecutionData {
  reasoningSteps: ReasoningStep[];
  toolCalls: ToolCallRecord[];
  iterationCount: number;
  status: AgentStatus;
}
```

### Message 扩展

`Message` 接口新增 `agentExecution` 字段：

```typescript
export interface Message {
  // ... 现有字段
  agentExecution?: AgentExecutionData;
}
```

### FetchResult (新增)

用于 fetch\_url 工具的返回结果：

```typescript
export interface FetchResult {
  success: boolean;
  title: string;
  content: string;
  summary?: string;
  content_chunks?: ContentChunk[];
  metadata: FetchMetadata;
  error?: string;
}

export interface FetchMetadata {
  length: number;
  domain: string;
  extraction_method: 'readability' | 'scraper' | 'fallback' | 'pdf-extract';
  chunk_count: number;
  truncated: boolean;
  content_type: string;
  page_count?: number;
  cached: boolean;
}
```

## 内置工具列表

| 工具名                | 功能                   | 需要授权 | 实现位置         |
| ------------------ | -------------------- | ---- | ------------ |
| `web_search`       | 网络搜索（支持 Tavily API）  | 否    | 前端 + Rust 后端 |
| `fetch_url`        | **新增** 获取网页/PDF内容    | 否    | Rust 后端      |
| `web_extract`      | **新增** Tavily 网页内容提取 | 否    | Tavily API   |
| `web_crawl`        | **新增** Tavily 网站爬取   | 否    | Tavily API   |
| `web_map`          | **新增** Tavily 网站地图发现 | 否    | Tavily API   |
| `read_file`        | 读取文件                 | 否    | Rust 后端      |
| `write_file`       | 写入文件                 | 是    | Rust 后端      |
| `list_directory`   | 列出目录                 | 否    | Rust 后端      |
| `execute_shell`    | 执行命令                 | 是    | Rust 后端      |
| `calculate`        | 数学计算                 | 否    | 前端           |
| `get_current_time` | 获取时间                 | 否    | 前端           |

### web\_search 工具详情

`web_search` 工具支持多种搜索引擎，可在设置界面配置：

#### Tavily API（推荐）

Tavily 是专为 AI Agent 设计的搜索 API，提供高质量的搜索结果：

```typescript
// 配置项
localStorage.setItem('nexus_tavily_api_key', 'your-api-key');
localStorage.setItem('nexus_tavily_search_depth', 'basic'); // 'basic' 或 'advanced'
localStorage.setItem('nexus_tavily_include_answer', 'true'); // 是否包含 AI 总结
```

优势：

- 返回结构化 JSON 数据
- 支持 AI 生成的答案摘要
- 内置内容相关性评分
- 支持图片搜索结果

#### 传统搜索引擎

| 搜索引擎           | 国内可访问    | 特点                   |
| -------------- | -------- | -------------------- |
| **百度**         | ✅ 推荐     | JSON API，中文搜索优化，国内首选 |
| **Bing**       | ✅ 大部分可访问 | 国际搜索，HTML 解析         |
| **DuckDuckGo** | ❌ 可能被屏蔽  | 隐私保护，Lite 版本         |

#### 搜索模式

| 模式             | 搜索流程                                      |
| -------------- | ----------------------------------------- |
| **Auto (推荐)**  | Tavily（如已配置）→ 百度 → DuckDuckGo → Bing 自动切换 |
| **Tavily**     | 仅 Tavily API（需配置 API Key）                 |
| **百度**         | 百度 → DuckDuckGo fallback                  |
| **Bing**       | Bing → DuckDuckGo fallback                |
| **DuckDuckGo** | 仅 DuckDuckGo（需VPN）                        |

### fetch\_url 工具详情（新增）

获取网页或 PDF 文档内容并提取正文：

#### 功能特性

- **HTML 网页**：自动提取正文，去除广告、导航等噪音
- **PDF 文档**：提取文本内容，支持多页 PDF
- **自动分块**：当内容超过 8000 字符时，自动分块返回
- **缓存机制**：默认启用缓存，相同 URL 30 分钟内不会重复请求
- **JS 渲染**：支持启用 JS 渲染（用于 SPA 页面）

#### 参数说明

```typescript
{
  url: string;           // 要获取的网页或 PDF URL
  use_cache?: boolean;   // 是否使用缓存（默认 true）
  force_refresh?: boolean; // 是否强制刷新缓存（默认 false）
  render_js?: boolean;   // 是否启用 JS 渲染（默认 false）
}
```

#### URL 占位符机制

为确保 URL 传递的确定性，系统使用占位符机制：

1. 用户输入包含 URL 时，预处理模块自动替换为占位符（如 `__URL_PLACEHOLDER_1__`）
2. Agent 调用工具时使用占位符
3. ReActEngine 在执行前将占位符还原为原始 URL

### Tavily 网络工具套件（新增）

#### web\_extract

从多个 URL 提取网页内容：

```typescript
{
  urls: string[];        // URL 列表（最多 20 个）
  format?: 'markdown' | 'text';  // 输出格式
  include_images?: boolean;  // 是否包含图片
}
```

#### web\_crawl

爬取网站多个页面的内容：

```typescript
{
  url: string;           // 起始 URL
  max_depth?: number;    // 最大深度（默认 1，最大 5）
  max_breadth?: number;  // 每页最大链接数（默认 20）
  limit?: number;        // 总页面数限制（默认 50）
  instructions?: string; // 自然语言指导
}
```

#### web\_map

发现网站的所有 URL：

```typescript
{
  url: string;           // 起始 URL
  max_depth?: number;    // 最大深度（默认 1，最大 5）
  limit?: number;        // 最大 URL 数（默认 50）
  instructions?: string; // 自然语言指导
}
```

## 内存管理系统（新增）

### FetchMemoryManager

用于缓存已获取的网页内容，避免重复请求：

```typescript
class FetchMemoryManager {
  // 添加缓存
  add(item: {
    url: string;
    title: string;
    content: string;
    contentType?: string;
    pageCount?: number;
  }): void;

  // 检查是否存在
  has(url: string): boolean;

  // 获取缓存
  get(url: string): CachedItem | undefined;

  // 生成上下文提示
  generateContextPrompt(): string;
}
```

### 上下文注入

当用户询问已获取内容的相关问题时，系统会自动注入缓存的网页内容到上下文中，避免重复调用工具。

## URL 预处理系统（新增）

### urlDetector 模块

```typescript
// 预处理对话
function preprocessConversation(
  userInput: string,
  conversationHistory: ConversationMessage[]
): PreprocessedConversation;

// 检查是否为占位符
function isUrlPlaceholder(value: string): boolean;

// 获取原始 URL
function getOriginalUrl(
  placeholder: string,
  urlMap: Map<string, string>
): string | undefined;
```

### 工作流程

1. 检测用户输入中的 URL
2. 将 URL 替换为占位符 `__URL_PLACEHOLDER_N__`
3. 保存占位符与原始 URL 的映射
4. Agent 调用工具时使用占位符
5. 执行前还原为原始 URL

## 安全机制

### 授权流程

1. Agent 调用需要授权的工具时，状态变为 `waiting_auth`
2. 前端显示 `ToolAuthModal` 弹窗
3. 用户选择"授权执行"或"拒绝"
4. 根据用户选择继续执行或返回错误

### 危险命令拦截

以下命令模式被自动拦截：

- `rm -rf`
- `format`
- `del /s`
- `shutdown`
- `reboot`
- `mkfs`
- `dd if=`
- `> /dev/sd`
- `chmod -R 777 /`
- `chown -R`

## 默认助手

### 设计理念

默认助手是用户打开软件后接触的第一个 Agent，应该：

1. **全能但不专业** - 能处理大多数日常问题，但知道何时推荐专业 Agent
2. **友好热情** - 用自然、简洁的语言交流
3. **主动帮助** - 当问题超出能力范围时，主动推荐更专业的 Agent
4. **善用工具** - 当需要最新信息时，主动使用搜索工具

### 默认助手配置

```typescript
export const DEFAULT_AGENT: Agent = {
  id: 'default-assistant',
  name: 'I.R.I.S.',
  role: '智能通用助手',
  description: '你的全能 AI 伙伴，可以搜索网络、回答问题、进行计算，并在需要时推荐专业 Agent。',
  avatar: 'Bot',
  status: 'idle',
  capabilities: ['网络搜索', '问答', '计算', '信息检索'],
  themeColor: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20',
  goal: '作为用户的第一接触点，提供友好、智能、全面的服务，并在需要时引导用户使用专业 Agent。',
  backstory: 'Nexus 系统的智能管家，具备广泛的知识和工具能力，能够处理大多数日常问题，同时了解何时需要寻求专业帮助。',
  systemPrompt: `你是 I.R.I.S.（Intelligent Reactive Interface System），一个友好、智能的 AI 助手。

## 你的能力
- 🔍 网络搜索：可以搜索最新信息
- 🌐 网页阅读：可以获取并阅读网页内容
- 🧮 计算：可以进行数学计算
- 📅 时间：可以获取当前日期时间

## 工具使用规则

### fetch_url 工具（网页内容获取）

当用户输入包含 URL，或问题需要访问具体网页内容时：
- **必须**优先调用 fetch_url 工具获取网页内容
- **禁止**凭空猜测或编造网页内容
- 获取内容后，基于实际内容回答用户问题

**URL 处理规则（必须严格遵守）**：
1. URL 必须作为"原始字符串"传递，不做任何修改
2. 禁止对 URL 进行：解码后重新拼接、修改路径、替换关键词、任何语义处理
3. 如果用户消息中包含 URL 占位符（如 \`__URL_PLACEHOLDER_1__\`），必须原样使用该占位符
4. 必须使用用户提供的原始 URL，保证请求是确定性的

## 交互原则
1. **友好热情**：用简洁、自然的语言交流，避免过于机械
2. **主动帮助**：如果用户的问题超出你的能力范围，主动推荐更专业的 Agent
3. **善用工具**：当需要最新信息时，主动使用搜索工具
4. **诚实透明**：如果不确定，坦诚告知`,
  tools: ['web_search', 'fetch_url', 'calculate', 'get_current_time'],
  // 不包含敏感工具：write_file, execute_shell
};
```

### 专业 Agent 列表

| Agent ID          | 名称        | 角色         | 专长                        |
| ----------------- | --------- | ---------- | ------------------------- |
| `nexus-architect` | Nexus 架构师 | 系统架构师      | 架构设计、系统设计、代码审查            |
| `data-oracle`     | 数据先知      | 数据科学家      | 数据分析、Python、机器学习          |
| `web-scouter`     | 网络侦察兵     | 研究专家       | 网络搜索、信息综合、事实核查            |
| `sec-guard`       | 安全卫士      | 安全专家       | 安全审计、渗透测试、合规性             |
| `ui-weaver`       | 界面编织者     | 前端开发       | React、Tailwind CSS、用户体验设计 |
| `ops-commander`   | 运维指挥官     | DevOps 工程师 | Docker、CI/CD、Kubernetes   |

### 智能路由

默认助手会根据问题类型推荐专业 Agent：

| 问题类型    | 推荐 Agent  |
| ------- | --------- |
| 代码/架构问题 | Nexus 架构师 |
| 数据分析问题  | 数据先知      |
| 安全相关问题  | 安全卫士      |
| 前端/UI问题 | 界面编织者     |
| 运维/部署问题 | 运维指挥官     |

### 与专业 Agent 的区别

| 特性       | 默认助手 | 专业 Agent |
| -------- | ---- | -------- |
| 敏感工具     | ❌ 无  | ✅ 有（需授权） |
| 文件操作     | ❌ 只读 | ✅ 读写     |
| Shell 执行 | ❌ 无  | ✅ 有（需授权） |
| 专业领域     | 通用   | 专精       |
| 启动方式     | 自动   | 手动选择     |

## 使用方式

### 1. 选择 Agent

在 Agent 集群视图点击"发起对话"按钮，系统会：

- 初始化 Agent 运行时
- 启用 Agent 模式
- 创建新会话

### 2. 发送消息

Agent 模式下发送消息后：

1. 预处理用户输入（URL 检测、占位符替换）
2. Agent 进入 `thinking` 状态
3. LLM 分析任务并决定是否需要工具
4. 如需工具，进入 `acting` 状态执行
5. 如需授权，进入 `waiting_auth` 状态等待用户确认
6. 循环执行直到任务完成或达到最大迭代次数
7. 任务完成后进入 `responding` 状态，流式输出最终回复
8. 输出完成后进入 `completed` 状态
9. 缓存获取的网页内容到内存

### 3. 查看执行过程

Agent 执行过程已集成到 ChatView 的思考折叠面板中，实时显示：

- 当前状态和实际步骤数
- 推理步骤（思考/行动/观察）
- 工具调用记录和执行状态
- 流式输出内容

思考折叠面板支持：

- 流式输出时自动展开
- 实时更新推理步骤和工具调用状态
- 显示步骤类型图标和颜色区分
- 行动步骤显示执行状态（执行中/执行完成）
- 观察步骤显示可点击的搜索结果标题
- 点击内容区域可折叠/展开
- 用户向上滚动时停止自动滚动，回到底部时恢复

### 4. 联网搜索结果同步

当 Agent 使用 `web_search` 工具时：

- 搜索结果自动同步到右侧 ToolPanel 的"联网搜索结果"区域
- 与手动触发的搜索结果统一管理
- 按会话分组显示

## 配置选项

```typescript
export interface AgentConfig {
  maxIterations: number;      // 最大迭代次数，默认 10
  timeoutMs: number;          // 超时时间，默认 120000ms
  enableAutoAuth: boolean;    // 自动授权，默认 false
  authTools: string[];        // 需要授权的工具列表
  verboseLogging: boolean;    // 详细日志，默认 true
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  maxIterations: 10,
  timeoutMs: 120000,
  enableAutoAuth: false,
  authTools: ['write_file', 'execute_shell', 'delete_file'],
  verboseLogging: true,
};
```

## 推荐模型

为获得最佳 Function Calling 效果，推荐使用：

| 模型                    | 推荐度   | 说明                           |
| --------------------- | ----- | ---------------------------- |
| Qwen2.5-7B-Instruct   | ⭐⭐⭐⭐⭐ | 中文能力强，支持 Function Calling    |
| Llama-3.1-8B-Instruct | ⭐⭐⭐⭐  | 英文能力强，支持 Function Calling    |
| GLM-4-9B-Chat         | ⭐⭐⭐⭐  | 中文能力强，支持 Function Calling    |
| Gemini 系列             | ⭐⭐⭐⭐  | 支持 Function Calling，需特殊兼容性处理 |

## 后续优化方向

按优先级排序：

| 优先级    | 方向           | 说明                                                                         |
| ------ | ------------ | -------------------------------------------------------------------------- |
| **P0** | **MCP 协议**   | 完整实现 Model Context Protocol。投入产出比最高，UI 层已就绪，只需实现协议通信层即可解锁整个 MCP 生态工具       |
| **P1** | **任务规划器**    | 自动分解复杂任务。解决当前 ReAct 循环面对复杂任务时容易"迷失方向"的痛点，是 Agent 能力的质变提升er                 |
| **P2** | **Agent 协作** | 多 Agent 协同工作。依赖任务规划器，需先有子任务才能分派给不同 Agent 执行                                |
| **P3** | **记忆系统**     | 长期记忆和任务记忆。当前仅有 `FetchMemoryManager` 短期缓存（会话级，最多 10 条），需实现跨会话持久化、用户偏好、知识库集成 |
| **P4** | **工具市场**     | 可扩展的工具生态。依赖 MCP 协议，属于锦上添花的功能                                               |

## 修改的现有文件

| 文件路径                                | 修改内容                                                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/App.tsx`                       | 添加 Agent 模式集成、流式输出回调、web\_search 结果同步、工具授权弹窗、scrollResetKey 状态                                        |
| `src/types.ts`                      | 添加 `AgentExecutionData` 类型，扩展 `Message` 接口                                                            |
| `src/components/ChatView.tsx`       | 思考折叠面板集成 Agent 执行视图，支持流式输出显示，滚动优化，折叠交互优化，外部链接处理                                                       |
| `src/hooks/useAgentExecution.ts`    | 添加 `onExecutionUpdate`、`onContentChunk`、`onWebSearchResult`、`onReasoningStepUpdate`、`onTokenUsage` 回调 |
| `src/agent/runtime/ReActEngine.ts`  | 实现流式输出 (`streamLLMWithTools`)，添加 `onContentChunk` 回调，流式推理步骤，执行状态更新，URL 占位符处理，内存缓存集成                   |
| `src/agent/runtime/AgentRuntime.ts` | 添加 `onContentChunk`、`onReasoningStepUpdate`、`onTokenUsage` 回调支持，传递 result 字段，URL 预处理集成                |
| `src/agent/runtime/AgentState.ts`   | 添加 `updateReasoningStep` 方法                                                                           |
| `src/agent/types.ts`                | 添加 `ToolCall` 接口，扩展 `AgentExecutionContext`，添加 `responding` 状态，扩展 `ReasoningStep` 字段                  |
| `src/agent/tools/builtin.ts`        | 新增 Tavily API 集成，新增 fetch\_url、web\_extract、web\_crawl、web\_map 工具                                    |
| `src-tauri/src/lib.rs`              | 注册新的 Rust 工具命令                                                                                        |
| `src-tauri/Cargo.toml`              | 添加 base64、whoami、dirs 依赖                                                                              |

***

*文档更新时间: 2026-04-09*
