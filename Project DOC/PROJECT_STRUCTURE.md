# Nexus AI Assistant - 项目结构

## 目录概览

```
nexus-ai-assistant/
├── src/                          # 前端源代码
│   ├── agent/                    # Agent 系统 (新增)
│   │   ├── llm/                  # LLM 调用模块
│   │   │   ├── functionCalling.ts    # 函数调用客户端
│   │   │   └── index.ts              # 模块入口
│   │   ├── memory/               # 记忆系统前端
│   │   │   ├── TauriMemoryClient.ts   # Tauri 记忆客户端
│   │   │   ├── MemoryExtractionService.ts  # 记忆提取服务
│   │   │   ├── MemoryModelClient.ts   # 记忆模型客户端
│   │   │   ├── SimilarityEngine.ts    # 相似度引擎
│   │   │   ├── MemoryScoreCalculator.ts # 评分计算器
│   │   │   ├── MemoryStore.ts         # 存储服务
│   │   │   ├── SessionMemory.ts       # 会话记忆管理
│   │   │   ├── DefaultAgentLayer.ts   # 默认 Agent 记忆层
│   │   │   ├── PreFilterService.ts    # 预过滤服务
│   │   │   ├── FetchMemory.ts         # URL 内容获取
│   │   │   └── index.ts               # 模块入口
│   │   ├── preprocess/           # 预处理模块
│   │   │   ├── urlDetector.ts         # URL 检测器
│   │   │   └── index.ts               # 模块入口
│   │   ├── runtime/              # Agent 运行时
│   │   │   ├── AgentRuntime.ts        # Agent 运行时核心
│   │   │   ├── AgentState.ts          # 状态管理器
│   │   │   ├── ReActEngine.ts         # ReAct 推理引擎
│   │   │   └── index.ts               # 模块入口
│   │   ├── tools/                # 工具模块
│   │   │   ├── ToolRegistry.ts        # 工具注册中心
│   │   │   ├── builtin.ts             # 内置工具定义
│   │   │   ├── types.ts               # 工具类型
│   │   │   └── index.ts               # 模块入口
│   │   ├── types.ts              # Agent 类型定义
│   │   └── index.ts              # Agent 模块入口
│   ├── components/               # React 组件
│   │   ├── MemoryPanel/          # 记忆面板 (新增)
│   │   │   ├── index.tsx              # 记忆面板主容器
│   │   │   ├── MemoryList.tsx         # 记忆列表
│   │   │   ├── MemoryStats.tsx        # 记忆统计
│   │   │   ├── MemoryHits.tsx         # 命中记忆展示
│   │   │   ├── MemoryOperations.tsx   # 记忆操作面板
│   │   │   ├── MemoryDebugLog.tsx     # 调试日志
│   │   │   ├── CandidateMemories.tsx  # 候选记忆管理
│   │   │   └── types.ts               # 面板类型定义
│   │   ├── AddMcpModal.tsx       # MCP 服务器添加弹窗
│   │   ├── AgentClusterView.tsx  # Agent 集群视图
│   │   ├── AgentConfigModal.tsx  # Agent 配置弹窗
│   │   ├── AgentExecutionView.tsx # Agent 执行视图 (新增)
│   │   ├── AgentRadarChart.tsx   # Agent 能力雷达图
│   │   ├── CanvasWorkspace.tsx   # 命令模式画布工作区
│   │   ├── ChatInput.tsx         # 聊天输入组件
│   │   ├── ChatView.tsx          # 聊天消息视图
│   │   ├── CloseConfirmModal.tsx # 关闭确认弹窗
│   │   ├── ConfirmationModal.tsx # 确认弹窗
│   │   ├── Header.tsx            # 顶部导航栏
│   │   ├── ImageCropper.tsx      # 图片裁剪组件
│   │   ├── McpControlCenter.tsx  # MCP 控制中心
│   │   ├── NexusLogo.tsx         # Logo 组件
│   │   ├── SearchView.tsx        # 搜索结果视图
│   │   ├── SettingsView.tsx      # 设置面板
│   │   ├── Sidebar.tsx           # 侧边栏导航
│   │   ├── TerminalView.tsx      # 终端视图
│   │   ├── TodoCard.tsx          # 待办事项卡片
│   │   ├── ToolPanel.tsx         # 工具参数面板
│   │   ├── VoiceSettings.tsx     # 语音设置
│   │   └── WindowControls.tsx    # 窗口控制按钮
│   ├── context/
│   │   ├── GlobalStateContext.tsx # 全局状态管理
│   │   └── MemoryUIContext.tsx    # 记忆 UI 状态 (新增)
│   ├── data/
│   │   └── agents.ts             # 预置 Agent 数据
│   ├── hooks/
│   │   ├── useTranslation.ts     # 国际化 Hook
│   │   ├── useMemoryState.ts     # 记忆状态 Hook (新增)
│   │   └── useAgentExecution.ts  # Agent 执行 Hook (新增)
│   ├── i18n/
│   │   ├── index.ts              # i18n 配置
│   │   └── locales/
│   │       ├── en.json           # 英文翻译
│   │       └── zh.json           # 中文翻译
│   ├── lib/
│   │   └── utils.ts              # 工具函数
│   ├── utils/
│   │   ├── format.ts             # 格式化工具
│   │   └── mockData.ts           # 模拟数据生成
│   ├── App.tsx                   # 主应用组件
│   ├── index.css                 # 全局样式
│   ├── main.tsx                  # 应用入口
│   └── types.ts                  # TypeScript 类型定义
├── src-tauri/                    # Tauri 桌面应用配置
│   ├── src/
│   │   ├── commands/             # Tauri 命令模块 (新增)
│   │   │   ├── mod.rs                # 模块入口
│   │   │   ├── memory.rs             # 记忆命令
│   │   │   └── session.rs            # 会话命令
│   │   ├── memory/               # 记忆系统后端 (新增)
│   │   │   ├── mod.rs                # 模块入口
│   │   │   ├── storage.rs            # SQLite 存储
│   │   │   ├── embedding.rs          # 向量嵌入服务
│   │   │   ├── extraction.rs         # 记忆提取
│   │   │   ├── retrieval.rs          # 记忆检索
│   │   │   ├── scoring.rs            # 记忆评分
│   │   │   ├── lifecycle.rs          # 生命周期管理
│   │   │   ├── merge.rs              # 记忆合并
│   │   │   ├── conflict.rs           # 冲突解决
│   │   │   ├── deduplication.rs      # 去重服务
│   │   │   ├── working_set.rs        # 工作集管理
│   │   │   ├── candidate_storage.rs  # 候选存储
│   │   │   └── llm_client.rs         # LLM 客户端
│   │   ├── models/               # 数据模型 (新增)
│   │   │   ├── mod.rs                # 模块入口
│   │   │   ├── memory.rs             # 记忆模型
│   │   │   └── session.rs            # 会话模型
│   │   ├── tools/                # 工具模块 (新增)
│   │   │   ├── mod.rs                # 模块入口
│   │   │   ├── fetch.rs              # URL 获取
│   │   │   ├── filesystem.rs         # 文件系统
│   │   │   ├── shell.rs              # Shell 命令
│   │   │   ├── pdf.rs                # PDF 处理
│   │   │   ├── cache.rs              # 缓存管理
│   │   │   └── renderer.rs           # 内容渲染
│   │   ├── lib.rs                # Tauri 库入口
│   │   ├── main.rs               # Rust 主入口
│   │   └── search.rs             # 搜索代理
│   ├── icons/                    # 应用图标
│   ├── capabilities/
│   │   └── default.json          # Tauri 权限配置
│   ├── Cargo.toml                # Rust 依赖
│   ├── build.rs                  # 构建脚本
│   └── tauri.conf.json           # Tauri 配置
├── Project DOC/                  # 项目文档
│   ├── MODULE_DISTRIBUTION.md    # 模块分布文档
│   └── PROJECT_STRUCTURE.md      # 项目结构文档
├── vite.config.ts                # Vite 构建配置
├── tsconfig.json                 # TypeScript 配置
├── package.json                  # NPM 依赖配置
├── index.html                    # HTML 入口
├── .env.example                  # 环境变量示例
└── README.md                     # 项目说明
```

## 核心模块说明

### 1. Agent 系统 (`src/agent/`)

Agent 系统是本次更新的核心模块，提供完整的 AI Agent 执行能力。

| 子模块 | 功能描述 |
|--------|----------|
| `runtime/` | Agent 运行时，包含 ReAct 推理引擎和状态管理 |
| `tools/` | 工具注册中心和内置工具定义 |
| `llm/` | LLM 函数调用客户端 |
| `memory/` | 记忆系统集成，包含提取、存储、检索、评分等 |
| `preprocess/` | 消息预处理，如 URL 检测 |

### 2. 前端组件层 (`src/components/`)

| 组件 | 功能描述 |
|------|----------|
| `App.tsx` | 主应用容器，管理全局状态、Agent 执行协调 |
| `ChatView.tsx` | 聊天消息渲染，支持 Markdown、代码高亮、Agent 执行可视化 |
| `ChatInput.tsx` | 消息输入框，支持图片上传、附件管理、模式切换 |
| `Sidebar.tsx` | 侧边栏导航，包含会话列表和文件夹管理 |
| `AgentClusterView.tsx` | Agent 集群展示和管理界面 |
| `AgentExecutionView.tsx` | Agent 执行过程可视化、工具授权弹窗 |
| `SettingsView.tsx` | 全局设置面板，模型配置、记忆模型配置、用户设置 |
| `McpControlCenter.tsx` | MCP 服务器管理界面 |
| `MemoryPanel/` | 记忆面板，包含列表、统计、操作、调试等子组件 |

### 3. 状态管理层 (`src/context/`)

- **GlobalStateContext.tsx**: 使用 React Context 管理全局状态
  - 会话管理 (Session Management)
  - 消息存储 (Message Storage)
  - Agent 配置 (Agent Configuration)
  - 用户设置 (User Settings)
  - MCP 服务器状态 (MCP Server Status)
  - 搜索引擎设置 (Tavily API)
  - 记忆模型配置 (Memory Model Config)
  - 聊天模型设置 (LM Studio/Ollama)

- **MemoryUIContext.tsx**: 记忆系统 UI 状态管理
  - 调试模式 (Debug Mode)
  - 当前命中记忆 (Current Hits)
  - 调试日志 (Debug Logs)
  - 刷新触发器 (Refresh Trigger)

### 4. 类型定义 (`src/types.ts`)

核心数据类型：
- `Message`: 聊天消息 (含附件、Agent 执行数据)
- `Agent`: AI 代理配置
- `ChatSession`: 会话
- `McpServer`: MCP 服务器
- `TodoItem`: 待办事项
- `SearchResult`: 搜索结果
- `MemoryItem`: 记忆项
- `MemoryType`: 记忆类型枚举
- `RetrievedMemory`: 检索到的记忆
- `CandidateMemory`: 候选记忆
- `AttachmentFile`: 附件文件

Agent 类型 (`src/agent/types.ts`)：
- `AgentStatus`: Agent 状态
- `ReasoningStep`: 推理步骤
- `ToolCallRecord`: 工具调用记录
- `AgentExecutionState`: Agent 执行状态
- `ConversationMessage`: 对话消息

### 5. Tauri 后端 (`src-tauri/`)

Tauri 后端提供原生能力和高性能服务：

| 模块 | 功能描述 |
|------|----------|
| `memory/` | 记忆系统核心，包含存储、嵌入、检索、评分、生命周期等 |
| `commands/` | Tauri 命令定义，暴露给前端的 API |
| `models/` | 数据模型定义 |
| `tools/` | 系统工具实现 (文件系统、Shell、PDF 等) |
| `search.rs` | DuckDuckGo 搜索代理 |

### 6. Hooks (`src/hooks/`)

| Hook | 功能描述 |
|------|----------|
| `useTranslation` | 国际化 Hook |
| `useMemoryState` | 记忆状态管理 Hook |
| `useAgentExecution` | Agent 执行管理 Hook |

## 数据流架构

### 聊天流程

```
用户输入 → ChatInput → App.tsx → useAgentExecution / requestAI()
                                    ↓
                            Agent Runtime / API 请求
                                    ↓
                            流式响应 → ChatView 渲染
                                    ↓
                            GlobalState / MemoryUIContext 更新
```

### Agent 执行流程

```
用户输入 → useAgentExecution.execute()
                ↓
        AgentRuntime.run()
                ↓
        ReActEngine 推理循环
                ├── LLM 函数调用
                ├── 工具执行 (ToolRegistry)
                ├── 记忆检索 (TauriMemoryClient)
                └── 推理步骤更新
                ↓
        响应内容 → ChatView 渲染
```

### 记忆系统流程

```
对话消息 → MemoryExtractionService
                ↓
        MemoryModelClient (LLM 提取)
                ↓
        候选记忆 → Tauri 后端
                ↓
        去重/合并/冲突解决
                ↓
        存储到 SQLite + 向量嵌入
                ↓
        检索时: 相似度搜索 → 返回相关记忆
```

## 构建产物

- `dist/` - Vite 构建的前端静态文件
- `src-tauri/target/` - Tauri 构建的桌面应用

## 记忆系统存储位置

- **数据库**: `%LOCALAPPDATA%\nexus-ai-assistant\memory.db`
- **嵌入模型**: 本地下载存储

## 关键技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 18 + TypeScript |
| 状态管理 | React Context |
| 桌面框架 | Tauri 2.0 |
| 后端语言 | Rust |
| 数据库 | SQLite |
| 向量嵌入 | 本地嵌入模型 |
| UI 样式 | Tailwind CSS |
| 动画 | Motion (Framer Motion) |
| 国际化 | i18next |
