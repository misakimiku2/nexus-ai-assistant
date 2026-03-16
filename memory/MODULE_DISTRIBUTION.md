# Nexus AI Assistant - 模块分布

## 模块职责划分

### 1. 核心模块

#### 1.1 应用入口模块

| 文件 | 职责 | 依赖 |
|------|------|------|
| `main.tsx` | React 应用挂载点 | React, ReactDOM |
| `App.tsx` | 主应用容器，路由和状态协调 | 所有组件, GlobalStateContext |
| `index.css` | 全局样式和 Tailwind 入口 | Tailwind CSS |

#### 1.2 状态管理模块

| 文件 | 职责 | 导出 |
|------|------|------|
| `context/GlobalStateContext.tsx` | 全局状态管理 | `GlobalStateProvider`, `useGlobalState` |

**状态分类**:

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
├── 用户设置 (User Settings)
│   ├── userName, aiName
│   ├── userAvatar, aiAvatar
│   ├── language, fontFamily
│   └── systemPromptPresets
├── MCP 状态 (MCP State)
│   └── mcpServers: McpServer[]
├── 搜索状态 (Search State)
│   ├── searchGroups: SearchGroup[]
│   └── searchResults: SearchResult[]
└── 日志状态 (Log State)
    └── logs: LogEntry[]
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
| ChatView | `ChatView.tsx` | 消息列表渲染、Markdown 渲染、代码高亮 |
| ChatInput | `ChatInput.tsx` | 消息输入框、图片上传、模式切换 |
| ToolPanel | `ToolPanel.tsx` | 右侧工具面板、参数调整 |

#### 2.3 Agent 模块

| 组件 | 文件 | 职责 |
|------|------|------|
| AgentClusterView | `AgentClusterView.tsx` | Agent 集群展示、状态管理 |
| AgentConfigModal | `AgentConfigModal.tsx` | Agent 配置弹窗、AI 生成 Agent |
| AgentRadarChart | `AgentRadarChart.tsx` | Agent 能力雷达图可视化 |

#### 2.4 设置模块

| 组件 | 文件 | 职责 |
|------|------|------|
| SettingsView | `SettingsView.tsx` | 全局设置面板 |
| VoiceSettings | `VoiceSettings.tsx` | 语音设置子组件 |

#### 2.5 功能模块

| 组件 | 文件 | 职责 |
|------|------|------|
| SearchView | `SearchView.tsx` | 搜索结果展示、搜索历史管理 |
| TerminalView | `TerminalView.tsx` | 终端日志展示 |
| McpControlCenter | `McpControlCenter.tsx` | MCP 服务器管理 |
| CanvasWorkspace | `CanvasWorkspace.tsx` | 命令模式画布工作区 |

#### 2.6 通用组件

| 组件 | 文件 | 职责 |
|------|------|------|
| ConfirmationModal | `ConfirmationModal.tsx` | 确认弹窗 |
| AddMcpModal | `AddMcpModal.tsx` | 添加 MCP 服务器弹窗 |
| ImageCropper | `ImageCropper.tsx` | 图片裁剪组件 |
| TodoCard | `TodoCard.tsx` | 待办事项卡片 |

---

### 3. 数据模块

#### 3.1 类型定义

| 文件 | 导出类型 |
|------|----------|
| `types.ts` | `Message`, `Agent`, `ChatSession`, `McpServer`, `TodoItem`, `SearchResult`, `LogEntry`, `AppMode`, `TabType`, `ModelProvider` |

#### 3.2 静态数据

| 文件 | 内容 |
|------|------|
| `data/agents.ts` | 预置 Agent 配置 (Nexus Architect, Data Oracle, Web Scouter, Sec Guard, UI Weaver, Ops Commander) |

#### 3.3 模拟数据

| 文件 | 函数 |
|------|------|
| `utils/mockData.ts` | `generateMockConversation()`, `generateClusterMockConversation()` |

---

### 4. 工具模块

#### 4.1 工具函数

| 文件 | 导出 |
|------|------|
| `lib/utils.ts` | `cn()` - className 合并工具 |
| `utils/format.ts` | `formatExecutionTime()` - 时间格式化 |

#### 4.2 Hooks

| 文件 | 导出 |
|------|------|
| `hooks/useTranslation.ts` | `useTranslation()` - 国际化 Hook |

---

### 5. 国际化模块

#### 5.1 配置

| 文件 | 职责 |
|------|------|
| `i18n/index.ts` | i18next 配置、语言检测 |

#### 5.2 语言包

| 文件 | 语言 |
|------|------|
| `i18n/locales/zh.json` | 简体中文 |
| `i18n/locales/en.json` | English |

---

### 6. 后端模块

#### 6.1 服务器

| 文件 | 职责 |
|------|------|
| `server.ts` | Express 服务器、API 路由、Vite 中间件 |

**API 端点**:

```
server.ts
├── GET  /api/health     → 健康检查
├── POST /api/search     → DuckDuckGo 搜索代理
└── *    → Vite 开发服务器代理
```

---

### 7. 桌面应用模块

#### 7.1 Tauri 配置

| 文件 | 职责 |
|------|------|
| `src-tauri/tauri.conf.json` | Tauri 应用配置 |
| `src-tauri/Cargo.toml` | Rust 依赖配置 |
| `src-tauri/capabilities/default.json` | 权限配置 |

#### 7.2 Rust 后端

| 文件 | 职责 |
|------|------|
| `src-tauri/src/main.rs` | Rust 主入口 |
| `src-tauri/src/lib.rs` | Tauri 命令定义 |

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
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │  GlobalStateContext     │
              │  (全局状态管理)          │
              └─────────────┬───────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│    types.ts   │   │  i18n/locales │   │  data/agents  │
│  (类型定义)   │   │  (国际化)      │   │  (静态数据)   │
└───────────────┘   └───────────────┘   └───────────────┘
```

---

## 职责边界

### 前端职责

- UI 渲染和交互
- 状态管理
- API 调用
- 用户设置存储 (localStorage)

### 后端职责

- 搜索代理 (绕过 CORS)
- 静态文件服务
- 开发服务器代理

### Tauri 职责

- 原生窗口管理
- 系统集成
- 应用打包

---

## 扩展指南

### 添加新组件

1. 在 `src/components/` 创建组件文件
2. 在 `types.ts` 添加必要类型
3. 在 `App.tsx` 或父组件中引入
4. 如需全局状态，在 `GlobalStateContext.tsx` 添加

### 添加新 API

1. 在 `server.ts` 添加路由
2. 在 `API_REFERENCE.md` 文档化
3. 在前端组件中调用

### 添加新 Agent

1. 在 `src/data/agents.ts` 添加配置
2. 或通过 UI 创建 (AgentConfigModal)

### 添加新语言

1. 在 `src/i18n/locales/` 添加语言文件
2. 在 `src/i18n/index.ts` 注册
3. 在 `SettingsView.tsx` 添加选项
