# AI Agent 转型计划

## 一、现状分析

### 1.1 当前架构
```
┌─────────────────────────────────────────────────────────────┐
│                    React 前端 (直连 LLM)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ ChatView    │  │ Agent UI    │  │ MCP Control Center  │  │
│  │ (消息渲染)   │  │ (静态配置)   │  │ (模拟状态)           │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│                           ↓                                  │
│              fetch() → LM Studio / Ollama API               │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                 Tauri/Rust 后端 (功能有限)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ 系统托盘     │  │ 窗口管理     │  │ DuckDuckGo 搜索     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 核心问题

| 问题 | 描述 |
|------|------|
| **无 Agent 运行时** | Agent 只是预设配置（systemPrompt/apiUrl），没有任务分解、规划、执行循环 |
| **无工具调用协议** | MCP 工具调用是硬编码的关键词匹配，没有实现 Function Calling 协议 |
| **无协作机制** | Agent 之间不会自动协作，主 Agent 不会分配任务给子 Agent |
| **无推理模式** | 没有 ReAct、Plan-and-Execute 等 Agent 推理模式 |
| **无状态管理** | Agent 没有"工作状态"、任务进度、执行历史等状态跟踪 |

### 1.3 现有可复用资源

- ✅ Agent 配置系统（[agents.ts](../src/data/agents.ts)）
- ✅ Agent UI 组件（[AgentClusterView.tsx](../src/components/AgentClusterView.tsx)）
- ✅ 消息处理流程（[App.tsx:255-823](../src/App.tsx#L255-L823)）
- ✅ 流式响应处理
- ✅ Rust 后端搜索功能

---

## 二、目标架构

### 2.1 Agent 运行时架构
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

### 2.2 核心执行流程（ReAct 模式）
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

---

## 三、实现方案

### 方案对比

| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| **A: 纯前端实现** | 快速迭代、无需修改 Rust | 复杂工具受限、安全性低 | ⭐⭐⭐ |
| **B: Rust 后端 Agent** | 性能好、安全性高、可扩展 | 开发周期长、调试复杂 | ⭐⭐⭐⭐ |
| **C: 混合架构** | 前端负责 UI/协调，Rust 负责工具执行 | 架构复杂度高 | ⭐⭐⭐⭐⭐ |

### ✅ 已确认方案：混合架构（方案 C）

**前端职责：**
- Agent 运行时核心逻辑
- 任务规划与协调
- LLM API 调用
- UI 状态管理

**Rust 后端职责：**
- 文件系统操作
- Shell 命令执行
- 系统信息获取
- MCP 协议实现

---

## 四、详细实现步骤

### Phase 1: 工具调用基础设施（预计 3-5 个任务）

#### 1.1 定义工具协议
**文件**: `src/agent/tools/types.ts`

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;  // OpenAI 兼容的参数 schema
  execute: (params: any) => Promise<ToolResult>;
  requiresAuth?: boolean;  // 是否需要用户授权
}

interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}
```

#### 1.2 实现内置工具集
**文件**: `src/agent/tools/builtin.ts`

| 工具名 | 功能 | 实现位置 |
|--------|------|----------|
| `web_search` | 网络搜索 | 复用现有 Rust search |
| `read_file` | 读取文件 | 新增 Rust command |
| `write_file` | 写入文件 | 新增 Rust command |
| `execute_shell` | 执行命令 | 新增 Rust command |
| `http_request` | HTTP 请求 | 前端 fetch |

#### 1.3 实现 Function Calling 协议
**文件**: `src/agent/llm/functionCalling.ts`

```typescript
// 构造 OpenAI 兼容的 tools 参数
function buildToolsParameter(tools: ToolDefinition[]): ChatCompletionTool[]

// 解析 LLM 返回的 tool_calls
function parseToolCalls(response: ChatCompletionResponse): ToolCall[]

// 执行工具调用
function executeToolCall(toolCall: ToolCall, tools: ToolDefinition[]): Promise<ToolResult>
```

---

### Phase 2: Agent 运行时核心（预计 4-6 个任务）

#### 2.1 Agent 状态管理
**文件**: `src/agent/runtime/AgentState.ts`

```typescript
interface AgentState {
  id: string;
  status: 'idle' | 'thinking' | 'acting' | 'waiting_auth' | 'completed' | 'failed';
  currentTask?: Task;
  taskHistory: Task[];
  toolCallHistory: ToolCallRecord[];
  memory: ConversationMemory;
}
```

#### 2.2 ReAct 推理引擎
**文件**: `src/agent/runtime/ReActEngine.ts`

```typescript
class ReActEngine {
  async run(input: string, agent: Agent): Promise<string> {
    // 1. 构造 ReAct prompt
    // 2. 循环执行 Thought → Action → Observation
    // 3. 直到得出最终答案或达到最大步数
  }
}
```

#### 2.3 任务规划器
**文件**: `src/agent/runtime/TaskPlanner.ts`

```typescript
class TaskPlanner {
  // 使用 LLM 分解复杂任务
  async decomposeTask(goal: string): Promise<SubTask[]>
  
  // 规划任务执行顺序
  async planExecution(tasks: SubTask[]): Promise<ExecutionPlan>
}
```

---

### Phase 3: Agent 协作系统（预计 3-4 个任务）

#### 3.1 Agent 协调器
**文件**: `src/agent/runtime/AgentCoordinator.ts`

```typescript
class AgentCoordinator {
  // 主 Agent 分配任务给子 Agent
  async delegateTask(task: SubTask, targetAgent: Agent): Promise<TaskResult>
  
  // 收集子 Agent 结果
  async collectResults(tasks: SubTask[]): Promise<AggregatedResult>
}
```

#### 3.2 Agent 间通信
**文件**: `src/agent/runtime/AgentCommunication.ts`

```typescript
interface AgentMessage {
  from: string;  // Agent ID
  to: string;    // Agent ID
  type: 'task' | 'result' | 'query' | 'notification';
  content: any;
  timestamp: number;
}
```

---

### Phase 4: Rust 后端工具扩展（预计 3-4 个任务）

#### 4.1 文件系统工具
**文件**: `src-tauri/src/tools/filesystem.rs`

```rust
#[tauri::command]
pub async fn read_file(path: String) -> Result<FileContent, String>

#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), String>

#[tauri::command]
pub async fn list_directory(path: String) -> Result<Vec<FileInfo>, String>
```

#### 4.2 Shell 执行工具
**文件**: `src-tauri/src/tools/shell.rs`

```rust
#[tauri::command]
pub async fn execute_command(
    command: String, 
    args: Vec<String>,
    requires_auth: bool
) -> Result<CommandResult, String>
```

#### 4.3 安全授权机制
**文件**: `src-tauri/src/tools/auth.rs`

```rust
// 敏感操作需要前端确认
pub struct PendingOperation {
    id: String,
    operation: String,
    risk_level: RiskLevel,
}
```

---

### Phase 5: UI 集成与优化（预计 3-4 个任务）

#### 5.1 Agent 执行可视化
- 显示 Agent 思考过程（Thought）
- 显示工具调用（Action）和结果（Observation）
- 显示任务进度和子任务状态

#### 5.2 工具授权 UI
- 敏感操作弹窗确认
- 批量授权管理
- 操作历史查看

#### 5.3 Agent 状态指示器
- 工作状态动画
- 任务进度条
- 错误提示和重试

---

## 五、技术选型

### 5.1 LLM Function Calling 支持

| 提供商 | 支持情况 | 备注 |
|--------|----------|------|
| LM Studio | ✅ 支持 | 需要使用支持 Function Calling 的模型 |
| Ollama | ✅ 支持 | 需要模型支持（如 llama3.1+） |
| OpenAI 兼容 API | ✅ 支持 | 标准 Function Calling 格式 |

### 5.2 推荐模型

| 模型 | 推荐度 | 原因 |
|------|--------|------|
| Qwen2.5-7B-Instruct | ⭐⭐⭐⭐⭐ | 支持 Function Calling，中文能力强 |
| Llama-3.1-8B-Instruct | ⭐⭐⭐⭐ | 支持 Function Calling，英文能力强 |
| GLM-4-9B-Chat | ⭐⭐⭐⭐ | 支持 Function Calling，中文能力强 |

---

## 六、文件结构规划

```
src/
├── agent/                          # Agent 运行时 (新增)
│   ├── runtime/
│   │   ├── AgentRuntime.ts         # Agent 运行时主类
│   │   ├── AgentState.ts           # 状态管理
│   │   ├── ReActEngine.ts          # ReAct 推理引擎
│   │   ├── TaskPlanner.ts          # 任务规划器
│   │   ├── AgentCoordinator.ts     # Agent 协调器
│   │   └── AgentCommunication.ts   # Agent 间通信
│   ├── tools/
│   │   ├── types.ts                # 工具类型定义
│   │   ├── ToolRegistry.ts         # 工具注册中心
│   │   ├── builtin.ts              # 内置工具
│   │   └── mcp/                    # MCP 协议实现
│   │       ├── McpClient.ts
│   │       └── McpProtocol.ts
│   ├── llm/
│   │   ├── functionCalling.ts      # Function Calling 协议
│   │   ├── contextBuilder.ts       # 上下文构建
│   │   └── promptTemplates.ts      # Prompt 模板
│   └── memory/
│       ├── ConversationMemory.ts   # 对话记忆
│       └── TaskMemory.ts           # 任务记忆
│
├── components/
│   ├── AgentExecutionView.tsx      # Agent 执行可视化 (新增)
│   ├── ToolCallView.tsx            # 工具调用展示 (新增)
│   └── ...
│
src-tauri/
├── src/
│   ├── tools/                      # 工具实现 (新增)
│   │   ├── mod.rs
│   │   ├── filesystem.rs           # 文件系统工具
│   │   ├── shell.rs                # Shell 执行
│   │   └── system.rs               # 系统信息
│   ├── lib.rs                      # 注册新 commands
│   └── ...
```

---

## 七、实施优先级

### 高优先级（核心功能）
1. ✅ Function Calling 协议实现
2. ✅ ReAct 推理引擎
3. ✅ 基础工具集（搜索、文件读写）
4. ✅ Agent 状态管理

### 中优先级（增强功能）
5. ⭕ 任务规划器
6. ⭕ Agent 协作系统
7. ⭕ MCP 协议实现

### 低优先级（优化功能）
8. ⭕ 高级记忆系统
9. ⭕ 工具市场
10. ⭕ Agent 工作流编辑器

---

## 八、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| LLM 不支持 Function Calling | 无法使用工具调用 | 提供 Prompt-based 工具调用作为备选 |
| 工具执行安全风险 | 系统损坏 | 实现严格的授权机制和沙箱隔离 |
| Agent 陷入死循环 | 资源浪费 | 设置最大步数限制和超时机制 |
| 复杂任务分解失败 | 任务无法完成 | 提供人工干预入口 |

---

## 九、预期成果

完成后的 AI Agent 将具备：

1. **自主规划能力** - 能够分解复杂任务，制定执行计划
2. **工具使用能力** - 能够调用搜索、文件操作、Shell 命令等工具
3. **自我反思能力** - 能够根据执行结果调整策略
4. **协作能力** - 多个 Agent 能够协同完成复杂任务
5. **安全可控** - 敏感操作需要用户授权

---

## 十、下一步行动

确认此计划后，将按照以下顺序开始实施：

1. 创建 `src/agent/` 目录结构
2. 实现工具类型定义和注册中心
3. 实现 Function Calling 协议
4. 实现 ReAct 推理引擎
5. 扩展 Rust 后端工具
6. 集成到现有 UI
