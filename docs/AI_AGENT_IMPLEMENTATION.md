# AI Agent 运行时实现文档

## 概述

本次更新将应用从一个简单的 LLM 聊天 UI 转变为一个真正的 AI Agent 系统。Agent 现在具备自主规划、工具调用、自我反思和协作能力。

## 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Agent Runtime (新增)                          │
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
│ 1. Perception (感知)                                         │
│    - 理解用户意图                                            │
│    - 提取任务目标                                            │
│    - 识别需要的工具/Agent                                    │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Planning (规划)                                           │
│    - 分解复杂任务为子任务                                    │
│    - 确定执行顺序                                            │
│    - 分配给合适的 Agent/工具                                 │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Execution Loop (执行循环)                                 │
│    ┌─────────────────────────────────────────────────────┐  │
│    │ Thought: 思考下一步该做什么                          │  │
│    │ Action: 选择工具并构造参数                           │  │
│    │ Observation: 执行工具，获取结果                      │  │
│    │ ↓ (循环直到任务完成或达到最大步数)                   │  │
│    └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Response (响应)                                           │
│    - 综合所有执行结果                                        │
│    - 生成最终回答                                            │
│    - 更新 Agent 状态                                         │
└─────────────────────────────────────────────────────────────┘
```

## 新增文件清单

### 前端 Agent 运行时 (`src/agent/`)

| 文件路径 | 功能描述 |
|---------|---------|
| `src/agent/types.ts` | Agent 核心类型定义，包括状态、任务、工具调用记录、推理步骤等 |
| `src/agent/index.ts` | Agent 模块导出入口 |
| `src/agent/runtime/AgentRuntime.ts` | Agent 运行时主类，管理执行生命周期 |
| `src/agent/runtime/AgentState.ts` | Agent 状态管理器，跟踪执行状态和历史 |
| `src/agent/runtime/ReActEngine.ts` | ReAct 推理引擎，实现 Thought→Action→Observation 循环 |
| `src/agent/runtime/index.ts` | Runtime 模块导出入口 |
| `src/agent/llm/functionCalling.ts` | Function Calling 协议实现，支持 OpenAI 兼容格式 |
| `src/agent/llm/index.ts` | LLM 模块导出入口 |
| `src/agent/tools/types.ts` | 工具类型定义，包括 JSON Schema、工具定义等 |
| `src/agent/tools/ToolRegistry.ts` | 工具注册中心，管理工具的注册、启用、执行 |
| `src/agent/tools/builtin.ts` | 内置工具集实现 |
| `src/agent/tools/index.ts` | Tools 模块导出入口 |

### Rust 后端工具 (`src-tauri/src/tools/`)

| 文件路径 | 功能描述 |
|---------|---------|
| `src-tauri/src/tools/mod.rs` | 工具模块导出入口 |
| `src-tauri/src/tools/filesystem.rs` | 文件系统工具（读、写、列表、删除、创建目录） |
| `src-tauri/src/tools/shell.rs` | Shell 命令执行、系统信息获取 |

### UI 组件和 Hooks

| 文件路径 | 功能描述 |
|---------|---------|
| `src/components/AgentExecutionView.tsx` | Agent 执行可视化组件，显示推理步骤和工具调用，集成到 ChatView 思考折叠面板中 |
| `src/hooks/useAgentExecution.ts` | Agent 执行 React Hook，管理执行状态，支持流式输出和回调通知 |

## 核心类型定义

### AgentStatus

```typescript
export type AgentStatus = 'idle' | 'thinking' | 'acting' | 'waiting_auth' | 'completed' | 'failed';
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

### AgentExecutionData (新增)

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

## 内置工具列表

| 工具名 | 功能 | 需要授权 | 实现位置 |
|--------|------|----------|----------|
| `web_search` | 网络搜索 | 否 | Rust 后端 |
| `read_file` | 读取文件 | 否 | Rust 后端 |
| `write_file` | 写入文件 | 是 | Rust 后端 |
| `list_directory` | 列出目录 | 否 | Rust 后端 |
| `delete_file` | 删除文件 | 是 | Rust 后端 |
| `create_directory` | 创建目录 | 否 | Rust 后端 |
| `execute_shell` | 执行命令 | 是 | Rust 后端 |
| `execute_powershell` | PowerShell 命令 | 是 | Rust 后端 |
| `http_request` | HTTP 请求 | 否 | 前端 fetch |
| `calculate` | 数学计算 | 否 | 前端 |
| `get_current_time` | 获取时间 | 否 | 前端 |

### web_search 工具详情

`web_search` 工具支持多种搜索引擎，可在设置界面配置：

| 搜索引擎 | 国内可访问 | 特点 |
|---------|-----------|------|
| **百度** | ✅ 推荐 | JSON API，中文搜索优化，国内首选 |
| **Bing** | ✅ 大部分可访问 | 国际搜索，HTML 解析 |
| **DuckDuckGo** | ❌ 可能被屏蔽 | 隐私保护，Lite 版本 |

#### 搜索模式

| 模式 | 搜索流程 |
|------|---------|
| **Auto (推荐)** | 百度 → DuckDuckGo → Bing 自动切换 |
| **百度** | 百度 → DuckDuckGo fallback |
| **Bing** | Bing → DuckDuckGo fallback |
| **DuckDuckGo** | 仅 DuckDuckGo（需VPN） |

#### 百度搜索实现

使用百度 JSON API (`tn=json`)，直接返回结构化数据：

```rust
// API 端点
https://www.baidu.com/s?wd={query}&tn=json&rn=10

// 响应格式
{
  "feed": {
    "entry": [
      { "title": "...", "url": "...", "abs": "..." }
    ]
  }
}
```

优势：
- 无需 HTML 解析，直接获取 JSON 数据
- 中文搜索结果更准确
- 国内访问稳定可靠

#### Bing 搜索实现

使用 HTML 解析，选择器基于 page-assist 项目：

```rust
// 主要选择器
容器: #b_content #b_results .b_algo
标题: h2 a
摘要: .b_caption p
新闻: #b_content #b_results .b_nwsAns
```

#### 结果相关性检测

搜索结果会进行关键词匹配检测，确保返回相关结果：

```rust
fn is_result_relevant(query: &str, results: &[SearchResult]) -> bool {
    // 计算关键词匹配率，阈值 0.3 (30%)
    let relevance_ratio = relevant_count as f32 / results.len() as f32;
    relevance_ratio >= 0.3
}
```

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
  name: 'Nexus 助手',
  role: '智能通用助手',
  description: '你的全能 AI 伙伴，可以搜索网络、回答问题、进行计算，并在需要时推荐专业 Agent。',
  capabilities: ['网络搜索', '问答', '计算', '信息检索'],
  tools: ['web_search', 'calculate', 'get_current_time', 'http_request'],
  // 不包含敏感工具：write_file, execute_shell
};
```

### 智能路由

默认助手会根据问题类型推荐专业 Agent：

| 问题类型 | 推荐 Agent |
|----------|-----------|
| 代码/架构问题 | Nexus 架构师 |
| 数据分析问题 | 数据先知 |
| 安全相关问题 | 安全卫士 |
| 前端/UI问题 | 界面编织者 |
| 运维/部署问题 | 运维指挥官 |

### 与专业 Agent 的区别

| 特性 | 默认助手 | 专业 Agent |
|------|----------|-----------|
| 敏感工具 | ❌ 无 | ✅ 有（需授权） |
| 文件操作 | ❌ 只读 | ✅ 读写 |
| Shell 执行 | ❌ 无 | ✅ 有（需授权） |
| 专业领域 | 通用 | 专精 |
| 启动方式 | 自动 | 手动选择 |

## 使用方式

### 1. 选择 Agent

在 Agent 集群视图点击"发起对话"按钮，系统会：
- 初始化 Agent 运行时
- 启用 Agent 模式
- 创建新会话

### 2. 发送消息

Agent 模式下发送消息后：
1. Agent 进入 `thinking` 状态
2. LLM 分析任务并决定是否需要工具
3. 如需工具，进入 `acting` 状态执行
4. 如需授权，进入 `waiting_auth` 状态等待用户确认
5. 循环执行直到任务完成或达到最大迭代次数

### 3. 查看执行过程

Agent 执行过程已集成到 ChatView 的思考折叠面板中，实时显示：
- 当前状态和迭代次数
- 推理步骤（Thought/Action/Observation）
- 工具调用记录和状态
- 流式输出内容

思考折叠面板支持：
- 流式输出时自动展开
- 实时更新推理步骤和工具调用状态
- 显示步骤类型图标和颜色区分

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
```

## 推荐模型

为获得最佳 Function Calling 效果，推荐使用：

| 模型 | 推荐度 | 说明 |
|------|--------|------|
| Qwen2.5-7B-Instruct | ⭐⭐⭐⭐⭐ | 中文能力强，支持 Function Calling |
| Llama-3.1-8B-Instruct | ⭐⭐⭐⭐ | 英文能力强，支持 Function Calling |
| GLM-4-9B-Chat | ⭐⭐⭐⭐ | 中文能力强，支持 Function Calling |

## 后续优化方向

1. **任务规划器** - 自动分解复杂任务
2. **Agent 协作** - 多 Agent 协同工作
3. **MCP 协议** - 完整实现 Model Context Protocol
4. **记忆系统** - 长期记忆和任务记忆
5. **工具市场** - 可扩展的工具生态

## 修改的现有文件

| 文件路径 | 修改内容 |
|---------|---------|
| `src/App.tsx` | 添加 Agent 模式集成、流式输出回调、web_search 结果同步、工具授权弹窗 |
| `src/types.ts` | 添加 `AgentExecutionData` 类型，扩展 `Message` 接口 |
| `src/components/ChatView.tsx` | 思考折叠面板集成 Agent 执行视图，支持流式输出显示 |
| `src/hooks/useAgentExecution.ts` | 添加 `onExecutionUpdate`、`onContentChunk`、`onWebSearchResult` 回调 |
| `src/agent/runtime/ReActEngine.ts` | 实现流式输出 (`streamLLMWithTools`)，添加 `onContentChunk` 回调 |
| `src/agent/runtime/AgentRuntime.ts` | 添加 `onContentChunk` 回调支持 |
| `src/agent/types.ts` | 添加 `ToolCall` 接口，扩展 `AgentExecutionContext` |
| `src-tauri/src/lib.rs` | 注册新的 Rust 工具命令 |
| `src-tauri/Cargo.toml` | 添加 base64、whoami、dirs 依赖 |

---

*文档生成时间: 2026-03-18*
