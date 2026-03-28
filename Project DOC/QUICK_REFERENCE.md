# Nexus AI Assistant - 快速参考

## 常用命令

### 开发命令

```bash
# 启动 Tauri 桌面应用开发模式
npm run tauri:dev

# 启动 Web 开发服务器 (仅前端)
npm run dev

# 构建前端
npm run build

# 构建 Tauri 应用
npm run tauri:build

# 类型检查
npm run lint

# 清理构建产物
npm run clean
```

### 安装依赖

```bash
# 安装项目依赖
npm install

# 安装 Tauri CLI (已包含在 devDependencies)
npm install -D @tauri-apps/cli

# 更新 Rust
rustup update
```

---

## 快速配置

### 1. 配置 AI 模型

#### LM Studio (推荐本地开发)

1. 下载并安装 [LM Studio](https://lmstudio.ai/)
2. 在 LM Studio 中加载模型
3. 启动本地服务器 (默认端口 1234)
4. 在应用设置中选择 "LM Studio"

#### Ollama

1. 下载并安装 [Ollama](https://ollama.ai/)
2. 拉取模型: `ollama pull llama3`
3. 在应用设置中选择 "Ollama"

#### 在线模型

在设置中选择 "在线模型"，然后：
1. 选择提供商 (OpenAI, DeepSeek, Gemini 等)
2. 输入 API Key
3. 选择模型

### 2. 配置记忆模型 (新增)

记忆系统需要一个 LLM 来提取记忆：

1. 打开设置面板
2. 找到 "记忆模型配置" 部分
3. 选择提供商 (LM Studio 或 Ollama)
4. 设置模型名称 (推荐小模型如 qwen2.5-3b-instruct)
5. 配置 API URL

### 3. 配置嵌入模型 (新增)

嵌入模型用于记忆的向量检索：

1. 首次使用时，应用会提示下载嵌入模型
2. 或在记忆面板中点击 "下载模型"
3. 模型会存储在本地，无需联网

---

## 核心文件速查

| 需求 | 文件 |
|------|------|
| 修改主应用逻辑 | `src/App.tsx` |
| 添加新组件 | `src/components/` |
| 修改全局状态 | `src/context/GlobalStateContext.tsx` |
| 修改记忆 UI 状态 | `src/context/MemoryUIContext.tsx` |
| 添加类型定义 | `src/types.ts` |
| 添加 Agent 类型 | `src/agent/types.ts` |
| 修改 Agent 运行时 | `src/agent/runtime/AgentRuntime.ts` |
| 添加 Agent 工具 | `src/agent/tools/builtin.ts` |
| 修改记忆系统前端 | `src/agent/memory/` |
| 修改 Tauri 配置 | `src-tauri/tauri.conf.json` |
| 添加 Tauri 命令 | `src-tauri/src/commands/` |
| 修改记忆系统后端 | `src-tauri/src/memory/` |
| 添加翻译 | `src/i18n/locales/zh.json` |
| 修改样式 | `src/index.css` 或组件内 Tailwind |

---

## 常用代码片段

### 使用全局状态

```typescript
import { useGlobalState } from './context/GlobalStateContext';

const MyComponent = () => {
  const { 
    messages, 
    addLog, 
    agents,
    userName,
    memoryModelConfig,
    lmStudioUrl,
    modelName
  } = useGlobalState();
  
  // ...
};
```

### 使用记忆 UI 状态 (新增)

```typescript
import { useMemoryUI } from './context/MemoryUIContext';

const MyComponent = () => {
  const { 
    debugMode, 
    toggleDebugMode,
    currentHits,
    debugLogs,
    addDebugLog,
    triggerRefresh
  } = useMemoryUI();
  
  // ...
};
```

### 使用记忆状态 Hook (新增)

```typescript
import { useMemoryState } from './hooks/useMemoryState';

const MyComponent = () => {
  const { 
    memories, 
    stats, 
    loading, 
    error,
    refresh,
    reinforce,
    deleteMemory,
    decay,
    prune,
    runEvolutionCycle
  } = useMemoryState();
  
  // ...
};
```

### 使用 Agent 执行 Hook (新增)

```typescript
import { useAgentExecution } from './hooks/useAgentExecution';

const MyComponent = () => {
  const {
    status,
    reasoningSteps,
    toolCalls,
    iterationCount,
    pendingAuthToolCall,
    isAgentMode,
    execute,
    approveToolCall,
    rejectToolCall,
    abort,
    reset,
    toggleAgentMode,
    setAgent,
    currentAgent
  } = useAgentExecution({
    apiUrl: 'http://localhost:1234/v1/chat/completions',
    modelId: 'qwen2.5-7b-instruct',
    temperature: 0.7
  });
  
  // 执行 Agent
  const handleExecute = async () => {
    const result = await execute(input, conversationHistory, sessionId);
  };
};
```

### 添加日志

```typescript
const { addLog } = useGlobalState();

addLog('操作成功', 'info');      // 信息日志
addLog('发生错误', 'error');     // 错误日志
addLog('执行命令', 'command');   // 命令日志
addLog('警告信息', 'warning');   // 警告日志
addLog('操作完成', 'success');   // 成功日志
```

### 调用 Tauri 命令 (新增)

```typescript
import { invoke } from '@tauri-apps/api/core';

// 搜索
const results = await invoke<{ results: SearchResult[] }>('search', { 
  query: 'React 19 新特性' 
});

// 记忆操作
const memories = await invoke<MemoryItem[]>('get_all_memories');
const stats = await invoke<MemoryStats>('get_memory_stats');
await invoke('add_memory', { memory: memoryItem });

// 文件操作
const content = await invoke<string>('read_file', { path: '/path/to/file' });
await invoke('write_file', { path: '/path/to/file', content: 'Hello' });

// Shell 命令
const output = await invoke<string>('execute_command', { command: 'npm test' });
```

### 合并 CSS 类名

```typescript
import { cn } from './lib/utils';

<div className={cn(
  'base-class',
  isActive && 'active-class',
  isDarkMode ? 'dark-class' : 'light-class'
)}>
```

### 国际化

```typescript
import { useTranslation } from '../hooks/useTranslation';

const { t } = useTranslation();

// 使用翻译
<h1>{t.common.title}</h1>
<button>{t.settings.save}</button>
```

---

## 预置 Agent

| Agent ID | 名称 | 角色 |
|----------|------|------|
| `nexus-architect` | Nexus 架构师 | 系统架构师 |
| `data-oracle` | 数据先知 | 数据科学家 |
| `web-scouter` | 网络侦察兵 | 研究专家 |
| `sec-guard` | 安全卫士 | 安全专家 |
| `ui-weaver` | 界面编织者 | 前端开发 |
| `ops-commander` | 运维指挥官 | DevOps 工程师 |

---

## Agent 工具列表 (新增)

| 工具名称 | 功能 | 需要授权 |
|----------|------|----------|
| `web_search` | 网络搜索 | 否 |
| `fetch_url` | 获取网页内容 | 否 |
| `read_file` | 读取文件 | 否 |
| `write_file` | 写入文件 | 是 |
| `delete_file` | 删除文件 | 是 |
| `list_directory` | 列出目录 | 否 |
| `execute_shell` | 执行 Shell 命令 | 是 |

---

## 记忆类型 (新增)

| 类型 | 说明 | 示例 |
|------|------|------|
| `identity` | 身份特征 | 用户名、职业、位置 |
| `fact` | 已知事实 | 项目名称、技术栈、API 端点 |
| `preference` | 用户偏好 | 编码风格、UI 主题、工具选择 |
| `task` | 进行中任务 | 当前开发的功能、待修复的 bug |
| `constraint` | 限制条件 | 时间限制、预算限制、技术约束 |
| `skill` | 用户能力 | 熟练技术、经验水平 |

---

## 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `Enter` | 发送消息 |
| `Shift + Enter` | 换行 |
| `Esc` | 关闭弹窗 |

---

## 故障排除

### 白屏问题

1. 检查控制台错误
2. 确认依赖已安装: `npm install`
3. 清理并重新构建: `npm run clean && npm run build`

### API 连接失败

1. 确认 LM Studio/Ollama 已启动
2. 检查端口是否正确
3. 检查防火墙设置

### Tauri 构建失败

1. 确认 Rust 已安装: `rustc --version`
2. 更新 Rust: `rustup update`
3. 清理构建: `cargo clean`

### 记忆系统不工作 (新增)

1. 检查记忆模型配置是否正确
2. 确认嵌入模型已下载
3. 检查数据库文件是否存在: `%LOCALAPPDATA%\nexus-ai-assistant\memory.db`

### Agent 执行失败 (新增)

1. 检查 Agent 配置的 API URL 是否正确
2. 确认模型支持函数调用
3. 查看调试日志了解详细错误

### 热更新不工作

1. 检查 `DISABLE_HMR` 环境变量
2. 重启开发服务器

---

## 项目结构速览

```
nexus-ai-assistant/
├── src/                    # 前端源码
│   ├── agent/              # Agent 系统
│   │   ├── llm/            # LLM 调用
│   │   ├── memory/         # 记忆系统前端
│   │   ├── runtime/        # Agent 运行时
│   │   ├── tools/          # 工具定义
│   │   └── preprocess/     # 预处理
│   ├── components/         # React 组件
│   │   └── MemoryPanel/    # 记忆面板
│   ├── context/            # 状态管理
│   ├── hooks/              # 自定义 Hooks
│   ├── i18n/               # 国际化
│   └── types.ts            # 类型定义
├── src-tauri/              # Tauri 后端
│   └── src/
│       ├── commands/       # Tauri 命令
│       ├── memory/         # 记忆系统后端
│       ├── models/         # 数据模型
│       ├── tools/          # 系统工具
│       └── search.rs       # 搜索代理
├── Project DOC/            # 项目文档
└── package.json            # 依赖配置
```

---

## 数据存储位置 (新增)

| 数据类型 | 位置 |
|----------|------|
| 记忆数据库 | `%LOCALAPPDATA%\nexus-ai-assistant\memory.db` |
| 嵌入模型 | 应用数据目录 |
| 用户设置 | localStorage |
| 会话数据 | SQLite 数据库 |

---

## 相关链接

- [React 文档](https://react.dev/)
- [Tailwind CSS 文档](https://tailwindcss.com/)
- [Tauri 文档](https://tauri.app/)
- [Vite 文档](https://vitejs.dev/)
- [LM Studio](https://lmstudio.ai/)
- [Ollama](https://ollama.ai/)
- [Rust 文档](https://www.rust-lang.org/)
