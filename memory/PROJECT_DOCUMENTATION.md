# Nexus AI 系统项目文档

本文件记录了 Nexus AI 助手开发系统的核心架构、模块分布及技术细节。

---

## 1. TECHNICAL_ARCHITECTURE (技术架构)

Nexus AI 采用 **Tauri (Rust) + React (TypeScript)** 的混合架构，旨在提供高性能、低延迟且高度隐私的本地 AI 协作环境。

- **前端层 (Frontend)**: 基于 React 18 和 Tailwind CSS 构建。使用 `motion` 处理复杂动画，`lucide-react` 提供图标支持。
- **后端层 (Backend)**: 基于 **Tauri (Rust)** 构建，负责处理系统级调用、本地文件系统操作、数据库持久化及与本地 AI 接口的通信。
- **状态管理 (State Management)**: 使用 React Context API (`GlobalStateContext`) 管理全局会话、消息流、Agent 状态及日志。
- **通信层 (Communication)**: 
  - 前端通过 Tauri 的 `invoke` 接口与 Rust 后端通信。
  - 后端通过 `reqwest` 等库与本地 LM Studio (localhost:1234) 通信。
- **任务调度 (Task Orchestration)**: 支持单 Agent 任务拆解与多 Agent 集群协作。任务进度通过 `TodoContainer` 组件进行可视化展示。

---

## 2. PROJECT_STRUCTURE (项目结构)

```text
/
├── docs/                   # 开发文档与状态记录
│   └── DEVELOPMENT_STATUS.md # 当前开发进度与后端对接指南
├── memory/                 # 项目持久化文档与记忆库
│   └── PROJECT_DOCUMENTATION.md # 核心：项目架构与技术细节文档
├── src/
│   ├── components/         # UI 组件库
│   │   ├── AddMcpModal.tsx      # 添加 MCP 服务的弹窗组件
│   │   ├── AgentClusterView.tsx # Agent 集群视图，展示和管理多个 Agent 的协作状态
│   │   ├── AgentStage.tsx       # 虚拟舞台组件，展示活跃 Agent 的浮动动画与连接线
│   │   ├── ChatInput.tsx        # 对话输入框组件，支持多行输入和快捷键提交
│   │   ├── ChatView.tsx         # 核心：对话流展示与 Markdown 渲染
│   │   ├── ConfirmationModal.tsx# 全局确认弹窗，用于敏感操作的二次确认
│   │   ├── Header.tsx           # 顶部导航栏组件，包含状态指示和全局操作
│   │   ├── McpControlCenter.tsx # MCP 控制中心，管理和配置本地工具调用能力
│   │   ├── SearchView.tsx       # 搜索视图组件，用于展示检索结果或知识库内容
│   │   ├── SettingsView.tsx     # 全局设置弹窗 (AI 模型配置与 RAG 设置，支持浅色/深色模式)
│   │   ├── Sidebar.tsx          # 侧边栏导航组件，用于在不同功能模块间切换
│   │   ├── TerminalView.tsx     # 终端视图组件，模拟命令行交互界面
│   │   ├── TodoCard.tsx         # 核心：任务看板与进度展示组件，将 AI 思考过程可视化
│   │   └── ToolPanel.tsx        # 工具面板组件，提供快捷工具和辅助功能的入口
│   ├── context/
│   │   └── GlobalStateContext.tsx # 全局状态机，处理消息分发、会话管理与模拟逻辑
│   ├── data/
│   │   └── agents.ts            # Agent 角色定义与元数据
│   ├── lib/
│   │   └── utils.ts             # 通用工具函数 (如 Tailwind 类名合并 cn)
│   ├── utils/
│   │   ├── format.ts            # 格式化工具函数 (如时间、文本格式化)
│   │   └── mockData.ts          # 模拟数据，用于开发和测试环境
│   ├── App.tsx                  # 应用主组件，负责整体布局和视图切换
│   ├── types.ts                 # 全局 TypeScript 类型定义
│   ├── main.tsx                 # 应用入口文件，挂载 React 根节点
│   └── index.css                # 全局样式与 Tailwind CSS 配置
├── src-tauri/              # Tauri Rust 后端代码
│   └── src/
│       └── main.rs          # Rust 后端入口与命令注册
├── package.json            # 依赖管理
├── tsconfig.json           # TypeScript 配置
└── vite.config.ts          # Vite 配置
```

---

## 3. MODULE_DISTRIBUTION (模块分布)

### 核心模块
- **Chat Engine**: 负责消息的接收、存储与流式展示。支持文本、Markdown 代码块、搜索结果及任务卡片的混合渲染。
- **Agent Cluster Manager**: 管理多个 Agent 的生命周期。支持从主会话跳转到子 Agent 会话的上下文切换。
- **Todo System**: 任务看板系统。将复杂的 AI 思考过程转化为可追踪的步骤（Steps）和进度条（Progress Bar）。
- **Settings & Configuration**: 全局设置弹窗，支持浅色/深色模式无缝切换。包含两大核心配置区：
  - **AI 模型设置**: 支持多提供商（LM Studio、Ollama、在线模型）切换，支持最大上下文长度的滑块可视化调节。
  - **本地知识库 (RAG)**: 提供完整的 RAG 管道配置，包括核心配置（嵌入模型）、知识库文件上传（支持拖拽与点击上传 TXT/PDF/MD/DOCX）、索引策略（切片大小与重叠度滑块，附带 Token 消耗预估）以及检索优化（Top K 与系统提示词）。

### 辅助模块
- **MCP (Model Context Protocol)**: 预留接口，用于扩展本地工具调用能力。
- **Log System**: 实时记录系统运行状态，便于排障。

---

## 4. API_REFERENCE (API 引用)

### 消息对象 (Message)
```typescript
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  todos?: TodoItem[];      // 可选：关联的任务看板数据
  thinking?: string;       // 可选：AI 思考过程 (Markdown)
  agentId?: string;        // 可选：指定发送消息的 Agent ID
  // ... 其他元数据
}
```

### 任务项 (TodoItem)
```typescript
interface TodoItem {
  id: string;
  title: string;
  status: 'pending' | 'working' | 'completed' | 'failed';
  progress: number;        // 0-100
  targetSessionId?: string; // 可选：点击跳转的目标会话 ID
  steps?: { label: string; status: string }[]; // 详细执行步骤
}
```

### Agent 定义 (Agent)
```typescript
interface Agent {
  id: string;
  name: string;
  role: string;
  description: string;
  avatar: string;
  status: 'idle' | 'working' | 'offline';
  capabilities: string[];
  themeColor: string;
  parentId?: string;
  goal?: string;
  backstory?: string;
  systemPrompt?: string;
  // ... 其他配置项
}
```

---

## 5. QUICK_REFERENCE (快速指南)

### 如何添加新的 Agent？
1. 在 `/src/data/agents.ts` 中定义新的 Agent 配置，包括 `id`, `name`, `role`, `description`, `avatar`, `status`, `capabilities`, `themeColor`, 以及新增的 `goal`, `backstory`, `systemPrompt`。
2. 在 `iconMap` (ChatView.tsx) 中映射对应的 Lucide 图标。

### 如何触发任务看板展示？
在发送消息时，为 `Message` 对象填充 `todos` 数组。看板会自动渲染在消息内容上方，并根据 `status` 自动处理动画。

### 如何实现会话跳转？
调用 `GlobalStateContext` 中的 `switchSession(sessionId)` 方法。在 `TodoItem` 中配置 `targetSessionId` 即可实现点击任务名称自动跳转。

### 本地开发对接指南
请参考 `/docs/DEVELOPMENT_STATUS.md` 获取当前开发进度、待对接的 Rust 后端功能清单以及后续开发路线图。
