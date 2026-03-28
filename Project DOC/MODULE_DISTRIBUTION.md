# Nexus AI Assistant - 模块分布

## 模块职责划分

### 1. 核心模块

#### 1.1 应用入口模块

| 文件 | 职责 | 依赖 |
|------|------|------|
| `main.tsx` | React 应用挂载点 | React, ReactDOM |
| `App.tsx` | 主应用容器，路由和状态协调，Agent 执行管理 | 所有组件, GlobalStateContext, MemoryUIContext |
| `index.css` | 全局样式和 Tailwind 入口 | Tailwind CSS |

#### 1.2 状态管理模块

| 文件 | 职责 | 导出 |
|------|------|------|
| `context/GlobalStateContext.tsx` | 全局状态管理 | `GlobalStateProvider`, `useGlobalState` |
| `context/MemoryUIContext.tsx` | 记忆系统 UI 状态管理 | `MemoryUIProvider`, `useMemoryUI` |

**GlobalStateContext 状态分类**:

```
GlobalStateContext
├── 会话状态 (Session State)
│   ├── sessions: ChatSession[]
│   ├── currentSessionId: string
│   └── folders: ChatFolder[]
├── 消息状态 (Message State)
│   ├── messages: Message[]
│   ├── isStreaming: boolean
│   └── currentTokenCount: number
├── Agent 状态 (Agent State)
│   └── agents: Agent[]
├── 系统提示词预设 (System Prompt Presets)
│   └── systemPromptPresets: { id, name, content }[]
├── 派生状态 (Derived State)
│   └── todos: TodoItem[]
├── 用户设置 (User Settings)
│   ├── userName, aiName
│   ├── userAvatar, aiAvatar
│   ├── language, fontFamily
│   ├── closeWindowAskEveryTime
│   └── closeWindowAction
├── MCP 状态 (MCP State)
│   └── mcpServers: McpServer[]
├── 搜索状态 (Search State)
│   ├── searchGroups: SearchGroup[]
│   └── searchResults: SearchResult[]
├── 日志状态 (Log State)
│   └── logs: LogEntry[]
├── 搜索引擎设置 (Search Engine Settings)
│   ├── searchEngine: string
│   ├── tavilyApiKey, tavilyEnabled
│   ├── tavilySearchDepth, tavilyIncludeAnswer
├── 记忆模型设置 (Memory Model Settings)
│   └── memoryModelConfig: MemoryModelConfig
└── 聊天模型设置 (Chat Model Settings)
    ├── lmStudioUrl, ollamaUrl
    ├── modelName, modelTemperature
    ├── maxContextLength, modelProvider
    └── systemPrompt
```

**MemoryUIContext 状态分类**:

```
MemoryUIContext
├── debugMode: boolean
├── currentHits: RetrievedMemory[]
├── debugLogs: MemoryDebugLogEntry[]
└── refreshTrigger: number
```

---

### 2. UI 组件模块

#### 2.1 布局组件

| 组件 | 文件 | 职责 |
|------|------|------|
| Sidebar | `Sidebar.tsx` | 侧边栏导航、会话列表、文件夹管理 |
| Header | `Header.tsx` | 顶部导航栏、Token 统计、工具面板切换 |
| NexusLogo | `NexusLogo.tsx` | 应用 Logo 组件 |

#### 2.2 聊天模块

| 组件 | 文件 | 职责 |
|------|------|------|
| ChatView | `ChatView.tsx` | 消息列表渲染、Markdown 渲染、代码高亮、Agent 执行可视化 |
| ChatInput | `ChatInput.tsx` | 消息输入框、图片上传、模式切换、附件管理 |
| ToolPanel | `ToolPanel.tsx` | 右侧工具面板、参数调整 |

#### 2.3 Agent 模块

| 组件 | 文件 | 职责 |
|------|------|------|
| AgentClusterView | `AgentClusterView.tsx` | Agent 集群展示、状态管理 |
| AgentConfigModal | `AgentConfigModal.tsx` | Agent 配置弹窗、AI 生成 Agent |
| AgentRadarChart | `AgentRadarChart.tsx` | Agent 能力雷达图可视化 |
| AgentExecutionView | `AgentExecutionView.tsx` | Agent 执行过程可视化、工具授权弹窗 |

#### 2.4 记忆面板模块 (新增)

| 组件 | 文件 | 职责 |
|------|------|------|
| MemoryPanel | `MemoryPanel/index.tsx` | 记忆面板主容器 |
| MemoryList | `MemoryPanel/MemoryList.tsx` | 记忆列表展示、过滤、排序 |
| MemoryStats | `MemoryPanel/MemoryStats.tsx` | 记忆统计信息展示 |
| MemoryHits | `MemoryPanel/MemoryHits.tsx` | 当前检索命中的记忆展示 |
| MemoryOperations | `MemoryPanel/MemoryOperations.tsx` | 记忆操作面板 (衰减、淘汰、演化) |
| MemoryDebugLog | `MemoryPanel/MemoryDebugLog.tsx` | 记忆系统调试日志 |
| CandidateMemories | `MemoryPanel/CandidateMemories.tsx` | 候选记忆管理面板 |
| types | `MemoryPanel/types.ts` | 记忆面板类型定义 |

#### 2.5 设置模块

| 组件 | 文件 | 职责 |
|------|------|------|
| SettingsView | `SettingsView.tsx` | 全局设置面板 (含记忆模型配置) |
| VoiceSettings | `VoiceSettings.tsx` | 语音设置子组件 |

#### 2.6 功能模块

| 组件 | 文件 | 职责 |
|------|------|------|
| SearchView | `SearchView.tsx` | 搜索结果展示、搜索历史管理 |
| TerminalView | `TerminalView.tsx` | 终端日志展示 |
| McpControlCenter | `McpControlCenter.tsx` | MCP 服务器管理 |
| CanvasWorkspace | `CanvasWorkspace.tsx` | 命令模式画布工作区 |

#### 2.7 通用组件

| 组件 | 文件 | 职责 |
|------|------|------|
| ConfirmationModal | `ConfirmationModal.tsx` | 确认弹窗 |
| CloseConfirmModal | `CloseConfirmModal.tsx` | 关闭窗口确认弹窗 |
| AddMcpModal | `AddMcpModal.tsx` | 添加 MCP 服务器弹窗 |
| ImageCropper | `ImageCropper.tsx` | 图片裁剪组件 |
| TodoCard | `TodoCard.tsx` | 待办事项卡片 |
| WindowControls | `WindowControls.tsx` | 窗口控制按钮 (最小化/最大化/关闭) |

---

### 3. Agent 模块 (新增)

#### 3.1 运行时模块

| 文件 | 导出 | 职责 |
|------|------|------|
| `runtime/AgentRuntime.ts` | `AgentRuntime`, `initializeDefaultRuntime`, `agentStateManager` | Agent 运行时核心，执行循环管理 |
| `runtime/AgentState.ts` | `AgentStateManager` | Agent 状态管理器 |
| `runtime/ReActEngine.ts` | `ReActEngine` | ReAct 推理引擎实现 |

#### 3.2 工具模块

| 文件 | 导出 | 职责 |
|------|------|------|
| `tools/ToolRegistry.ts` | `ToolRegistry` | 工具注册中心 |
| `tools/builtin.ts` | 内置工具定义 | 文件操作、Shell、网络搜索等工具 |
| `tools/types.ts` | 工具类型定义 | Tool 接口、ToolResult 等 |

#### 3.3 LLM 模块

| 文件 | 导出 | 职责 |
|------|------|------|
| `llm/functionCalling.ts` | `FunctionCallingClient` | LLM 函数调用客户端 |
| `llm/index.ts` | LLM 模块入口 | 统一导出 |

#### 3.4 预处理模块

| 文件 | 导出 | 职责 |
|------|------|------|
| `preprocess/urlDetector.ts` | URL 检测器 | 消息中的 URL 提取与预处理 |
| `preprocess/index.ts` | 预处理模块入口 | 统一导出 |

#### 3.5 记忆模块

| 文件 | 导出 | 职责 |
|------|------|------|
| `memory/TauriMemoryClient.ts` | `TauriMemoryClient`, `TauriSessionClient` | Tauri 记忆系统客户端 |
| `memory/MemoryExtractionService.ts` | `memoryExtractionService` | 记忆提取服务 |
| `memory/MemoryModelClient.ts` | `MemoryModelClient`, `MultiPassParser` | 记忆模型客户端，多轮解析 |
| `memory/SimilarityEngine.ts` | `SimilarityEngine` | 相似度计算引擎 |
| `memory/MemoryScoreCalculator.ts` | `MemoryScoreCalculator` | 记忆评分计算器 |
| `memory/MemoryStore.ts` | `MemoryStore` | 记忆存储服务 |
| `memory/SessionMemory.ts` | `SessionMemoryManager` | 会话记忆管理器 |
| `memory/DefaultAgentLayer.ts` | `DefaultAgentLayer` | 默认 Agent 记忆层 |
| `memory/PreFilterService.ts` | `PreFilterService` | 消息预过滤服务 |
| `memory/FetchMemory.ts` | `FetchMemory` | URL 内容获取与记忆 |
| `memory/index.ts` | 记忆模块入口 | 统一导出 |

#### 3.6 类型定义

| 文件 | 导出类型 |
|------|----------|
| `agent/types.ts` | `AgentStatus`, `ToolCall`, `Task`, `ToolCallRecord`, `ToolCallResult`, `ReasoningStep`, `AgentExecutionState`, `AgentExecutionContext`, `ConversationMessage`, `ToolCallRequest`, `LLMResponse`, `AgentConfig` |

---

### 4. 数据模块

#### 4.1 类型定义

| 文件 | 导出类型 |
|------|----------|
| `types.ts` | `Message`, `Agent`, `ChatSession`, `McpServer`, `TodoItem`, `SearchResult`, `LogEntry`, `AppMode`, `TabType`, `ModelProvider`, `MemoryItem`, `MemoryType`, `RetrievedMemory`, `CandidateMemory`, `MemoryStats`, `MemoryModelConfig`, `AttachmentFile`, `AgentExecutionData` 等 |

#### 4.2 静态数据

| 文件 | 内容 |
|------|------|
| `data/agents.ts` | 预置 Agent 配置 (Nexus Architect, Data Oracle, Web Scouter, Sec Guard, UI Weaver, Ops Commander) |

#### 4.3 模拟数据

| 文件 | 函数 |
|------|------|
| `utils/mockData.ts` | `generateMockConversation()`, `generateClusterMockConversation()` |

---

### 5. 工具模块

#### 5.1 工具函数

| 文件 | 导出 |
|------|------|
| `lib/utils.ts` | `cn()` - className 合并工具 |
| `utils/format.ts` | `formatExecutionTime()` - 时间格式化 |

#### 5.2 Hooks

| 文件 | 导出 | 职责 |
|------|------|------|
| `hooks/useTranslation.ts` | `useTranslation()` | 国际化 Hook |
| `hooks/useMemoryState.ts` | `useMemoryState()` | 记忆状态管理 Hook |
| `hooks/useAgentExecution.ts` | `useAgentExecution()` | Agent 执行管理 Hook |

---

### 6. 国际化模块

#### 6.1 配置

| 文件 | 职责 |
|------|------|
| `i18n/index.ts` | i18next 配置、语言检测 |

#### 6.2 语言包

| 文件 | 语言 |
|------|------|
| `i18n/locales/zh.json` | 简体中文 |
| `i18n/locales/en.json` | English |

---

### 7. Tauri 后端模块 (重大更新)

#### 7.1 主入口

| 文件 | 职责 |
|------|------|
| `src-tauri/src/lib.rs` | Tauri 应用配置、系统托盘、窗口事件、命令注册 |
| `src-tauri/src/main.rs` | Rust 主入口 |

#### 7.2 记忆系统模块 (新增)

| 文件 | 职责 |
|------|------|
| `memory/mod.rs` | 记忆模块入口 |
| `memory/storage.rs` | 记忆存储 (SQLite 数据库) |
| `memory/embedding.rs` | 向量嵌入服务 (支持本地模型) |
| `memory/extraction.rs` | 记忆提取逻辑 |
| `memory/retrieval.rs` | 记忆检索服务 |
| `memory/scoring.rs` | 记忆评分系统 |
| `memory/lifecycle.rs` | 记忆生命周期管理 |
| `memory/merge.rs` | 记忆合并逻辑 |
| `memory/conflict.rs` | 记忆冲突检测与解决 |
| `memory/deduplication.rs` | 记忆去重服务 |
| `memory/working_set.rs` | 工作集管理 |
| `memory/candidate_storage.rs` | 候选记忆存储 |
| `memory/llm_client.rs` | 记忆系统 LLM 客户端 |

#### 7.3 命令模块 (新增)

| 文件 | 职责 |
|------|------|
| `commands/mod.rs` | 命令模块入口 |
| `commands/memory.rs` | 记忆相关 Tauri 命令 |
| `commands/session.rs` | 会话持久化命令 |

#### 7.4 模型模块 (新增)

| 文件 | 职责 |
|------|------|
| `models/mod.rs` | 模型模块入口 |
| `models/memory.rs` | 记忆数据模型 |
| `models/session.rs` | 会话数据模型 |

#### 7.5 工具模块 (新增)

| 文件 | 职责 |
|------|------|
| `tools/mod.rs` | 工具模块入口 |
| `tools/fetch.rs` | URL 内容获取工具 |
| `tools/filesystem.rs` | 文件系统操作工具 |
| `tools/shell.rs` | Shell 命令执行工具 |
| `tools/pdf.rs` | PDF 处理工具 |
| `tools/cache.rs` | 缓存管理工具 |
| `tools/renderer.rs` | 内容渲染工具 |

#### 7.6 搜索模块

| 文件 | 职责 |
|------|------|
| `search.rs` | DuckDuckGo 搜索代理 |

**Tauri 命令端点**:

```
lib.rs invoke_handler
├── 搜索命令
│   └── search::search
├── 工具命令
│   ├── fetch_url, read_file, write_file
│   ├── list_directory, delete_file, create_directory
│   ├── file_exists, get_file_info
│   ├── execute_command, execute_powershell, get_system_info
├── 记忆命令
│   ├── retrieve_memories, add_memory
│   ├── get_all_memories, get_memories_by_type
│   ├── update_task_status, delete_memory
│   ├── prune_memories, get_memory_stats
│   ├── initialize_embedding_service, get_embedding_dimension
│   ├── reinforce_memories, decay_memories
│   ├── prune_memories_v2, run_evolution_cycle
│   ├── get_evolution_stats, should_extract_memories
│   ├── get_pending_candidates, accept_candidate
│   ├── reject_candidate, accept_all_candidates
│   ├── add_candidate_memory, clear_old_candidates
│   ├── get_embedding_provider, recompute_all_embeddings
│   ├── get_stored_embedding_dimension, clear_all_embeddings
│   ├── get_available_embedding_models
│   ├── initialize_embedding_with_model
│   ├── dedup_candidate, dedup_accept
│   ├── execute_dedup_pipeline, run_memory_evolution
│   ├── generate_embedding, search_similar_memories
│   ├── boost_memory, update_memory
│   ├── check_model_exists, download_embedding_model
│   ├── pause_embedding_download, resume_embedding_download
│   ├── cancel_embedding_download, get_download_progress
│   ├── open_model_folder, delete_embedding_model
│   ├── verify_model_integrity, get_model_folder_path
└── 会话命令
    ├── save_session, load_sessions, delete_session
    ├── save_messages, load_messages
    ├── save_folder, load_folders, delete_folder
```

#### 7.7 Tauri 配置

| 文件 | 职责 |
|------|------|
| `src-tauri/tauri.conf.json` | Tauri 应用配置 |
| `src-tauri/Cargo.toml` | Rust 依赖配置 |
| `src-tauri/capabilities/default.json` | 权限配置 |

---

## 模块依赖关系

```
┌─────────────────────────────────────────────────────────────┐
│                        App.tsx                              │
│  (主应用容器，协调所有模块)                                   │
└───────────────────────────┬─────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│   Sidebar     │   │   ChatView    │   │ SettingsView  │
│   Header      │   │   ChatInput   │   │ AgentConfig   │
│   ...         │   │   ToolPanel   │   │ McpControl    │
│   MemoryPanel │   │ AgentExecView │   │               │
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│GlobalState    │   │ MemoryUI      │   │ useAgent      │
│Context        │   │ Context       │   │ Execution     │
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│    types.ts   │   │  agent/       │   │  data/agents  │
│  (类型定义)   │   │  (Agent系统)  │   │  (静态数据)   │
│               │   │  ├── runtime/ │   │               │
│               │   │  ├── tools/   │   │               │
│               │   │  ├── llm/     │   │               │
│               │   │  ├── memory/  │   │               │
│               │   │  └── preprocess/│  │               │
└───────────────┘   └───────────────┘   └───────────────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │     Tauri Backend       │
              │  ├── memory/            │
              │  ├── commands/          │
              │  ├── models/            │
              │  ├── tools/             │
              │  └── search.rs          │
              └─────────────────────────┘
```

---

## 职责边界

### 前端职责

- UI 渲染和交互
- 状态管理 (GlobalStateContext, MemoryUIContext)
- Agent 执行协调 (useAgentExecution Hook)
- API 调用 (通过 Tauri invoke)
- 用户设置存储 (localStorage)

### Agent 系统职责 (前端)

- ReAct 推理循环执行
- 工具调用管理
- LLM 函数调用
- 记忆系统集成
- 推理步骤可视化

### Tauri 后端职责

- 记忆系统 (存储、检索、演化)
- 向量嵌入服务
- 会话持久化
- 文件系统操作
- Shell 命令执行
- 网络搜索代理
- 系统托盘管理
- 应用打包

---

## 扩展指南

### 添加新组件

1. 在 `src/components/` 创建组件文件
2. 在 `types.ts` 添加必要类型
3. 在 `App.tsx` 或父组件中引入
4. 如需全局状态，在 `GlobalStateContext.tsx` 添加
5. 如需记忆 UI 状态，在 `MemoryUIContext.tsx` 添加

### 添加新 Agent 工具

1. 在 `src/agent/tools/builtin.ts` 定义工具
2. 在 `src/agent/tools/ToolRegistry.ts` 注册工具
3. 在 `src-tauri/src/tools/` 添加 Rust 实现 (如需系统访问)
4. 在 `src-tauri/src/lib.rs` 注册 Tauri 命令

### 添加新记忆类型

1. 在 `src/types.ts` 添加 `MemoryType` 枚举值
2. 在 `src-tauri/src/models/memory.rs` 更新 Rust 模型
3. 在 `src/components/MemoryPanel/types.ts` 添加标签和颜色

### 添加新 API

1. 在 `src-tauri/src/` 添加命令实现
2. 在 `src-tauri/src/lib.rs` 的 `invoke_handler` 注册
3. 在前端通过 `invoke()` 调用

### 添加新 Agent

1. 在 `src/data/agents.ts` 添加配置
2. 或通过 UI 创建 (AgentConfigModal)

### 添加新语言

1. 在 `src/i18n/locales/` 添加语言文件
2. 在 `src/i18n/index.ts` 注册
3. 在 `SettingsView.tsx` 添加选项

---

## 记忆系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                    记忆系统架构                              │
└─────────────────────────────────────────────────────────────┘

前端 (TypeScript)
├── MemoryUIContext          # 记忆 UI 状态
├── useMemoryState           # 记忆状态 Hook
├── TauriMemoryClient        # Tauri 客户端
├── MemoryExtractionService  # 记忆提取服务
├── SimilarityEngine         # 相似度引擎
├── MemoryScoreCalculator    # 评分计算器
└── MemoryStore              # 存储服务

Tauri 后端 (Rust)
├── MemoryStorage            # SQLite 存储
├── EmbeddingService         # 向量嵌入 (本地模型)
├── MemoryRetrieval          # 检索服务
├── MemoryScoring            # 评分系统
├── MemoryLifecycle          # 生命周期管理
├── MemoryMerge              # 合并逻辑
├── MemoryConflict           # 冲突解决
├── MemoryDeduplication      # 去重服务
├── CandidateStorage         # 候选存储
└── MemoryEvolutionManager   # 演化管理器

记忆类型
├── identity    # 身份特征
├── fact        # 已知事实
├── preference  # 用户偏好
├── task        # 进行中任务
├── constraint  # 限制条件
└── skill       # 用户能力
```
