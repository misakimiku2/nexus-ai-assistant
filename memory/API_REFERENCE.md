# Nexus AI Assistant - API 参考

## 后端 API

### 基础信息

- **Base URL**: `http://localhost:3000`
- **Content-Type**: `application/json`

---

### 健康检查

检查服务器运行状态。

```http
GET /api/health
```

**响应示例**:

```json
{
  "status": "ok"
}
```

---

### 网络搜索

执行 DuckDuckGo 搜索并返回结果。

```http
POST /api/search
```

**请求体**:

```json
{
  "query": "React 19 新特性"
}
```

**响应示例**:

```json
{
  "results": [
    {
      "title": "React 19 RC – React",
      "url": "https://react.dev/blog/2024/04/25/react-19",
      "snippet": "React 19 introduces Actions, new hooks..."
    },
    {
      "title": "What is new in React 19?",
      "url": "https://vercel.com/blog/react-19",
      "snippet": "React 19 brings Server Components..."
    }
  ]
}
```

**错误响应**:

```json
{
  "error": "Query is required"
}
```

---

## AI 模型 API

### 支持的提供商

| 提供商 | 默认 URL | 认证方式 |
|--------|----------|----------|
| LM Studio | `http://localhost:1234/v1/chat/completions` | 无 |
| Ollama | `http://localhost:11434/api/chat` | 无 |
| OpenAI | `https://api.openai.com/v1/chat/completions` | Bearer Token |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/models/` | API Key |
| Anthropic | `https://api.anthropic.com/v1/messages` | x-api-key Header |
| DeepSeek | `https://api.deepseek.com/v1/chat/completions` | Bearer Token |
| 阿里通义 | `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` | Bearer Token |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4/chat/completions` | Bearer Token |

### 聊天补全 API

OpenAI 兼容格式的聊天补全接口。

```http
POST {apiUrl}
Content-Type: application/json
Authorization: Bearer {apiKey}  # 可选

{
  "model": "gpt-4o",
  "messages": [
    { "role": "system", "content": "你是一个专业助手" },
    { "role": "user", "content": "你好" }
  ],
  "temperature": 0.7,
  "stream": true
}
```

**流式响应格式 (SSE)**:

```
data: {"choices":[{"delta":{"content":"你"}}]}

data: {"choices":[{"delta":{"content":"好"}}]}

data: [DONE]
```

---

## 前端组件 API

### GlobalStateContext

全局状态管理 Context。

```typescript
import { useGlobalState } from './context/GlobalStateContext';

const {
  // 消息管理
  messages,
  setMessages,
  
  // 会话管理
  sessions,
  currentSessionId,
  createNewSession,
  createNewSessionWithAgent,
  switchSession,
  updateSessionTitle,
  updateSessionAgents,
  deleteSession,
  batchDeleteSessions,
  
  // 文件夹管理
  folders,
  createFolder,
  updateFolder,
  deleteFolder,
  toggleFolder,
  moveSessionToFolder,
  
  // Agent 管理
  agents,
  addAgent,
  updateAgent,
  deleteAgent,
  
  // 系统提示词预设
  systemPromptPresets,
  addPreset,
  updatePreset,
  deletePreset,
  
  // 派生状态
  todos,
  
  // 用户设置
  userName,
  setUserName,
  aiName,
  setAiName,
  userAvatar,
  setUserAvatar,
  aiAvatar,
  setAiAvatar,
  language,
  setLanguage,
  fontFamily,
  setFontFamily,
  
  // 关闭窗口设置
  closeWindowAskEveryTime,
  setCloseWindowAskEveryTime,
  closeWindowAction,
  setCloseWindowAction,
  
  // MCP 服务器
  mcpServers,
  setMcpServers,
  
  // 搜索状态
  searchGroups,
  setSearchGroups,
  searchResults,
  setSearchResults,
  deleteSearchGroup,
  batchDeleteSearchGroups,
  
  // 日志
  logs,
  addLog,
  
  // 流式状态
  isStreaming,
  setIsStreaming,
  currentTokenCount,
  setCurrentTokenCount,
  
  // 工具方法
  clearHistory,
  compressMessages,
  simulateSmbCheck,
  simulateTest,
  simulateClusterTest
} = useGlobalState();
```

### 核心类型定义

#### Message

```typescript
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  mode?: 'chat' | 'command';
  agentId?: string;
  thinking?: string;
  searchResults?: SearchResult[];
  fileEdits?: FileEdit[];
  todos?: TodoItem[];
  tokenCount?: number;
  tokenSpeed?: number;
  executionTime?: number;
  versions?: MessageVersion[];
  currentVersionIndex?: number;
}
```

#### Agent

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
  modelProvider?: string;
  onlineProvider?: string;
  modelId?: string;
  apiUrl?: string;
  apiKey?: string;
  temperature?: number;
  tools?: string[];
  mcpServers?: string[];
  enableRag?: boolean;
  knowledgeFolders?: string[];
}
```

#### ChatSession

```typescript
interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
  folderId?: string;
  activeAgents?: string[];
}
```

#### McpServer

```typescript
interface McpServer {
  id: string;
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  tools: McpTool[];
}

interface McpTool {
  name: string;
  description: string;
  requiresAuth: boolean;
}
```

---

## 组件 Props

### ChatView

```typescript
interface ChatViewProps {
  pendingAction: PendingAction | null;
  handleApproveAction: () => void;
  handleRejectAction: () => void;
  scrollRef: React.RefObject<HTMLDivElement>;
  isDarkMode: boolean;
  handleEditMessage: (messageId: string, newContent: string) => void;
  handleRegenerateMessage: (messageId: string) => void;
  handleSwitchVersion: (messageId: string, index: number) => void;
  isWaitingForResponse: boolean;
  isSearching: boolean;
  appMode: 'chat' | 'command';
  modelName: string;
  isSidebarExpanded: boolean;
  setIsSidebarExpanded: (expanded: boolean) => void;
}
```

### SettingsView

```typescript
interface SettingsViewProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  lmStudioUrl: string;
  setLmStudioUrl: (url: string) => void;
  ollamaUrl: string;
  setOllamaUrl: (url: string) => void;
  modelName: string;
  setModelName: (name: string) => void;
  maxContextLength: number;
  setMaxContextLength: (length: number) => void;
  temperature: number;
  setTemperature: (temp: number) => void;
  systemPrompt: string;
  setSystemPrompt: (prompt: string) => void;
  modelProvider: 'lm-studio' | 'ollama' | 'online';
  setModelProvider: (provider: ModelProvider) => void;
  onReset: () => void;
}
```

### AgentConfigModal

```typescript
interface AgentConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentId: string | null;
  agents: Agent[];
  onSave: (agent: Agent) => void;
  isDarkMode: boolean;
}
```

---

## 工具函数

### cn (className 合并)

```typescript
import { cn } from './lib/utils';

// 合并 Tailwind 类名
cn('px-4 py-2', isActive && 'bg-blue-500', className);
```

### formatExecutionTime

```typescript
import { formatExecutionTime } from './utils/format';

formatExecutionTime(1234); // "1.23s"
```

### estimateTokens

```typescript
// 估算文本 Token 数量 (1 token ≈ 3 字符)
const estimateTokens = (text: string) => Math.ceil(text.length / 3);
```

---

## 事件处理

### 消息发送流程

```typescript
// 1. 用户输入
const handleSendMessage = async () => {
  const userMessage = { role: 'user', content: input };
  
  // 2. 调用 AI
  await requestAI([...messages, userMessage], systemPrompt, input);
};

// 3. AI 响应处理
const requestAI = async (currentMsgs, systemPrompt, originalInput) => {
  // 检查是否需要搜索
  if (isWebSearchEnabled) {
    const searchResults = await fetch('/api/search', { ... });
    systemPrompt += searchContext;
  }
  
  // 发送流式请求
  const response = await fetch(apiUrl, {
    method: 'POST',
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: 'system', content: systemPrompt }, ...currentMsgs],
      temperature,
      stream: true
    })
  });
  
  // 处理流式响应
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    // 更新 UI
    setMessages(prev => ...);
  }
};
```

### 停止生成

```typescript
const handleStopAI = () => {
  if (abortController.current) {
    abortController.current.abort();
    setIsStreaming(false);
  }
};
```
