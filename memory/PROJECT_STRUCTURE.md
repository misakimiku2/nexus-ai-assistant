# Nexus AI Assistant - 项目结构

## 目录概览

```
nexus-ai-assistant/
├── src/                          # 前端源代码
│   ├── components/               # React 组件
│   │   ├── AddMcpModal.tsx       # MCP 服务器添加弹窗
│   │   ├── AgentClusterView.tsx  # Agent 集群视图
│   │   ├── AgentConfigModal.tsx  # Agent 配置弹窗
│   │   ├── AgentRadarChart.tsx   # Agent 能力雷达图
│   │   ├── CanvasWorkspace.tsx   # 命令模式画布工作区
│   │   ├── ChatInput.tsx         # 聊天输入组件
│   │   ├── ChatView.tsx          # 聊天消息视图
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
│   │   └── VoiceSettings.tsx     # 语音设置
│   ├── context/
│   │   └── GlobalStateContext.tsx # 全局状态管理
│   ├── data/
│   │   └── agents.ts             # 预置 Agent 数据
│   ├── hooks/
│   │   └── useTranslation.ts     # 国际化 Hook
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
│   │   ├── lib.rs                # Tauri 库入口
│   │   └── main.rs               # Rust 主入口
│   ├── icons/                    # 应用图标
│   ├── capabilities/
│   │   └── default.json          # Tauri 权限配置
│   ├── Cargo.toml                # Rust 依赖
│   ├── build.rs                  # 构建脚本
│   └── tauri.conf.json           # Tauri 配置
├── docs/
│   └── DEVELOPMENT_STATUS.md     # 开发状态文档
├── memory/
│   └── PROJECT_DOCUMENTATION.md  # 项目文档
├── server.ts                     # Express 后端服务器
├── vite.config.ts                # Vite 构建配置
├── tsconfig.json                 # TypeScript 配置
├── package.json                  # NPM 依赖配置
├── index.html                    # HTML 入口
├── .env.example                  # 环境变量示例
└── README.md                     # 项目说明
```

## 核心模块说明

### 1. 前端组件层 (`src/components/`)

| 组件 | 功能描述 |
|------|----------|
| `App.tsx` | 主应用容器，管理全局状态和路由 |
| `ChatView.tsx` | 聊天消息渲染，支持 Markdown、代码高亮 |
| `ChatInput.tsx` | 消息输入框，支持图片上传、模式切换 |
| `Sidebar.tsx` | 侧边栏导航，包含会话列表和文件夹管理 |
| `AgentClusterView.tsx` | Agent 集群展示和管理界面 |
| `SettingsView.tsx` | 全局设置面板，模型配置、用户设置 |
| `McpControlCenter.tsx` | MCP 服务器管理界面 |

### 2. 状态管理层 (`src/context/`)

- **GlobalStateContext.tsx**: 使用 React Context 管理全局状态
  - 会话管理 (Session Management)
  - 消息存储 (Message Storage)
  - Agent 配置 (Agent Configuration)
  - 用户设置 (User Settings)
  - MCP 服务器状态 (MCP Server Status)

### 3. 类型定义 (`src/types.ts`)

核心数据类型：
- `Message`: 聊天消息
- `Agent`: AI 代理配置
- `ChatSession`: 会话
- `McpServer`: MCP 服务器
- `TodoItem`: 待办事项
- `SearchResult`: 搜索结果

### 4. 后端服务 (`server.ts`)

Express 服务器提供：
- `/api/health` - 健康检查
- `/api/search` - DuckDuckGo 搜索代理
- Vite 开发服务器中间件

### 5. 桌面应用 (`src-tauri/`)

Tauri 桌面应用配置：
- Rust 后端
- 原生窗口管理
- 应用打包配置

## 数据流架构

```
用户输入 → ChatInput → App.tsx → requestAI()
                                    ↓
                            API 请求 (LM Studio/Ollama/Online)
                                    ↓
                            流式响应 → ChatView 渲染
                                    ↓
                            GlobalState 更新
```

## 构建产物

- `dist/` - Vite 构建的前端静态文件
- `src-tauri/target/` - Tauri 构建的桌面应用
