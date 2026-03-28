# Nexus AI Assistant - API 参考

## Tauri 命令 API

### 基础信息

- **调用方式**: `invoke('command_name', { args })`
- **导入**: `import { invoke } from '@tauri-apps/api/core'`

---

## 搜索命令

### 网络搜索

执行 DuckDuckGo 搜索并返回结果。

```typescript
import { invoke } from '@tauri-apps/api/core';

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

const results = await invoke<{ results: SearchResult[] }>('search', { 
  query: 'React 19 新特性' 
});
```

---

## 记忆系统命令 (新增)

### 获取所有记忆

```typescript
interface MemoryItem {
  id: string;
  content: string;
  memoryType: MemoryType;
  importance: number;
  score: number;
  decay: number;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number;
  accessCount: number;
  version: number;
  parentIds: string[];
}

const memories = await invoke<MemoryItem[]>('get_all_memories');
```

### 按类型获取记忆

```typescript
type MemoryType = 'identity' | 'fact' | 'preference' | 'task' | 'constraint' | 'skill';

const memories = await invoke<MemoryItem[]>('get_memories_by_type', { 
  memoryType: 'fact' 
});
```

### 检索记忆

```typescript
interface RetrievalOptions {
  topK: number;
  memoryTypes?: MemoryType[];
  minImportance?: number;
  minSimilarity: number;
  onlyActive: boolean;
  sessionId?: string;
}

interface RetrievedMemory {
  item: MemoryItem;
  score: number;
  components: {
    similarity: number;
    memoryScore: number;
  };
}

const memories = await invoke<RetrievedMemory[]>('retrieve_memories', {
  query: '用户偏好',
  options: {
    topK: 10,
    minSimilarity: 0.5,
    onlyActive: true
  }
});
```

### 添加记忆

```typescript
interface AddMemoryInput {
  content: string;
  memoryType: MemoryType;
  importance: number;
  sourceSessionId?: string;
}

await invoke('add_memory', { 
  memory: {
    content: '用户喜欢使用 TypeScript',
    memoryType: 'preference',
    importance: 0.8
  }
});
```

### 更新记忆

```typescript
await invoke('update_memory', { 
  id: 'memory-id',
  updates: {
    content: '更新后的内容',
    importance: 0.9
  }
});
```

### 删除记忆

```typescript
await invoke('delete_memory', { id: 'memory-id' });
```

### 强化记忆

```typescript
const updatedCount = await invoke<number>('reinforce_memories', { 
  ids: ['id1', 'id2'] 
});
```

### 记忆衰减

```typescript
interface DecayResult {
  processed: number;
  updated: number;
}

const result = await invoke<DecayResult>('decay_memories');
```

### 记忆淘汰

```typescript
interface PruneResult {
  markedInactive: number;
  deleted: number;
}

const result = await invoke<PruneResult>('prune_memories_v2');
```

### 运行演化周期

```typescript
const [decayResult, pruneResult] = await invoke<[DecayResult, PruneResult]>('run_evolution_cycle');
```

### 获取记忆统计

```typescript
interface MemoryStats {
  totalCount: number;
  byType: Record<string, number>;
  avgImportance: number;
}

const stats = await invoke<MemoryStats>('get_memory_stats');
```

### 获取演化统计

```typescript
interface EvolutionStats {
  activeCount: number;
  inactiveCount: number;
  avgScore: number;
  avgDecay: number;
}

const stats = await invoke<EvolutionStats>('get_evolution_stats');
```

---

## 候选记忆命令 (新增)

### 获取待处理候选

```typescript
interface CandidateMemory {
  id: string;
  content: string;
  memoryType: MemoryType;
  confidence: number;
  sourceSessionId: string;
  sourceMessageIds: string[];
  createdAt: number;
  status: 'pending' | 'accepted' | 'rejected' | 'merged';
  importance: number;
}

const candidates = await invoke<CandidateMemory[]>('get_pending_candidates');
```

### 接受候选

```typescript
await invoke('accept_candidate', { id: 'candidate-id' });
```

### 拒绝候选

```typescript
await invoke('reject_candidate', { id: 'candidate-id' });
```

### 接受所有候选

```typescript
await invoke('accept_all_candidates');
```

### 添加候选记忆

```typescript
await invoke('add_candidate_memory', {
  candidate: {
    content: '候选内容',
    memoryType: 'fact',
    confidence: 0.9,
    sourceSessionId: 'session-id',
    sourceMessageIds: ['msg-id']
  }
});
```

### 去重候选

```typescript
interface DedupDecision {
  boostTargets: { memoryId: string; similarity: number; boostAmount: number }[];
  mergeTargets: { memoryId: string; similarity: number; memoryType: MemoryType }[];
  conflictTargets: { memoryId: string; similarity: number; conflictType: string }[];
}

const decision = await invoke<DedupDecision>('dedup_candidate', { 
  candidateId: 'candidate-id' 
});
```

---

## 嵌入模型命令 (新增)

### 初始化嵌入服务

```typescript
await invoke('initialize_embedding_service');
```

### 生成嵌入向量

```typescript
const embedding = await invoke<number[]>('generate_embedding', { 
  text: '要生成向量的文本' 
});
```

### 搜索相似记忆

```typescript
interface SimilaritySearchResult {
  memory: MemoryItem;
  similarity: number;
}

const results = await invoke<SimilaritySearchResult[]>('search_similar_memories', {
  embedding: [0.1, 0.2, ...],
  topK: 10
});
```

### 获取嵌入维度

```typescript
const dimension = await invoke<number>('get_embedding_dimension');
```

### 获取可用嵌入模型

```typescript
interface EmbeddingModel {
  id: string;
  name: string;
  dimension: number;
  downloaded: boolean;
}

const models = await invoke<EmbeddingModel[]>('get_available_embedding_models');
```

### 下载嵌入模型

```typescript
await invoke('download_embedding_model', { modelId: 'model-id' });
```

### 获取下载进度

```typescript
interface DownloadProgress {
  status: 'idle' | 'downloading' | 'completed' | 'error';
  progress: number;
  error?: string;
}

const progress = await invoke<DownloadProgress>('get_download_progress');
```

---

## 会话持久化命令 (新增)

### 保存会话

```typescript
await invoke('save_session', {
  session: {
    id: 'session-id',
    title: '会话标题',
    messages: [...],
    updatedAt: Date.now()
  }
});
```

### 加载会话列表

```typescript
interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
  folderId?: string;
  activeAgents?: string[];
}

const sessions = await invoke<ChatSession[]>('load_sessions');
```

### 删除会话

```typescript
await invoke('delete_session', { id: 'session-id' });
```

### 保存消息

```typescript
await invoke('save_messages', {
  sessionId: 'session-id',
  messages: [...]
});
```

### 加载消息

```typescript
const messages = await invoke<Message[]>('load_messages', { 
  sessionId: 'session-id' 
});
```

### 保存文件夹

```typescript
await invoke('save_folder', {
  folder: {
    id: 'folder-id',
    name: '文件夹名称',
    isExpanded: true
  }
});
```

### 加载文件夹列表

```typescript
interface ChatFolder {
  id: string;
  name: string;
  isExpanded: boolean;
  isClusterTask?: boolean;
}

const folders = await invoke<ChatFolder[]>('load_folders');
```

---

## 工具命令 (新增)

### 文件系统操作

```typescript
// 读取文件
const content = await invoke<string>('read_file', { 
  path: '/path/to/file' 
});

// 写入文件
await invoke('write_file', { 
  path: '/path/to/file', 
  content: '文件内容' 
});

// 删除文件
await invoke('delete_file', { path: '/path/to/file' });

// 列出目录
interface FileInfo {
  name: string;
  isDir: boolean;
  size: number;
  modified: number;
}

const files = await invoke<FileInfo[]>('list_directory', { 
  path: '/path/to/dir' 
});

// 创建目录
await invoke('create_directory', { path: '/path/to/new/dir' });

// 检查文件是否存在
const exists = await invoke<boolean>('file_exists', { 
  path: '/path/to/file' 
});

// 获取文件信息
const info = await invoke<FileInfo>('get_file_info', { 
  path: '/path/to/file' 
});
```

### Shell 命令

```typescript
// 执行命令
const output = await invoke<string>('execute_command', { 
  command: 'npm test' 
});

// 执行 PowerShell
const psOutput = await invoke<string>('execute_powershell', { 
  command: 'Get-Process' 
});

// 获取系统信息
interface SystemInfo {
  os: string;
  arch: string;
  hostname: string;
}

const sysInfo = await invoke<SystemInfo>('get_system_info');
```

### 网络请求

```typescript
// 获取 URL 内容
const content = await invoke<string>('fetch_url', { 
  url: 'https://example.com' 
});
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
  
  // 搜索引擎设置 (新增)
  searchEngine,
  setSearchEngine,
  tavilyApiKey,
  setTavilyApiKey,
  tavilyEnabled,
  setTavilyEnabled,
  tavilySearchDepth,
  setTavilySearchDepth,
  tavilyIncludeAnswer,
  setTavilyIncludeAnswer,
  
  // 记忆模型设置 (新增)
  memoryModelConfig,
  setMemoryModelConfig,
  
  // 聊天模型设置 (新增)
  lmStudioUrl,
  setLmStudioUrl,
  ollamaUrl,
  setOllamaUrl,
  modelName,
  setModelName,
  modelTemperature,
  setModelTemperature,
  maxContextLength,
  setMaxContextLength,
  modelProvider,
  setModelProvider,
  systemPrompt,
  setSystemPrompt,
  
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

### MemoryUIContext (新增)

记忆系统 UI 状态管理 Context。

```typescript
import { useMemoryUI } from './context/MemoryUIContext';

const {
  debugMode,
  setDebugMode,
  toggleDebugMode,
  currentHits,
  setCurrentHits,
  clearCurrentHits,
  debugLogs,
  addDebugLog,
  clearDebugLogs,
  refreshTrigger,
  triggerRefresh
} = useMemoryUI();
```

### useMemoryState Hook (新增)

记忆状态管理 Hook。

```typescript
import { useMemoryState } from './hooks/useMemoryState';

const {
  memories,
  stats,
  evolutionStats,
  loading,
  error,
  refresh,
  reinforce,
  deleteMemory,
  decay,
  prune,
  runEvolutionCycle
} = useMemoryState();
```

### useAgentExecution Hook (新增)

Agent 执行管理 Hook。

```typescript
import { useAgentExecution } from './hooks/useAgentExecution';

const {
  status,
  reasoningSteps,
  toolCalls,
  iterationCount,
  pendingAuthToolCall,
  isAgentMode,
  currentAgent,
  execute,
  approveToolCall,
  rejectToolCall,
  abort,
  reset,
  toggleAgentMode,
  setAgent
} = useAgentExecution(config, callbacks);
```

---

## 核心类型定义

### Message

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
  agentExecution?: AgentExecutionData;  // 新增
  attachments?: AttachmentFile[];       // 新增
}
```

### Agent

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

### AgentExecutionData (新增)

```typescript
interface AgentExecutionData {
  reasoningSteps: ReasoningStep[];
  toolCalls: ToolCallRecord[];
  iterationCount: number;
  status: AgentStatus;
}

type AgentStatus = 'idle' | 'thinking' | 'acting' | 'responding' | 'waiting_auth' | 'completed' | 'failed';

interface ReasoningStep {
  id: string;
  type: 'thought' | 'action' | 'observation';
  content: string;
  timestamp: number;
  toolCallId?: string;
  isStreaming?: boolean;
  toolName?: string;
  toolParams?: Record<string, unknown>;
  observationData?: Array<{ title: string; url: string; snippet?: string }>;
  executionStatus?: 'executing' | 'completed';
}

interface ToolCallRecord {
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

### MemoryItem (新增)

```typescript
interface MemoryItem {
  id: string;
  content: string;
  memoryType: MemoryType;
  importance: number;
  score: number;
  decay: number;
  isActive: boolean;
  markedInactiveAt?: number;
  embedding?: number[];
  sourceSessionId?: string;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number;
  accessCount: number;
  metadata?: TaskMetadata;
  version: number;
  parentIds: string[];
}

type MemoryType = 'identity' | 'fact' | 'preference' | 'task' | 'constraint' | 'skill';
```

### AttachmentFile (新增)

```typescript
interface AttachmentFile {
  id: string;
  name: string;
  type: 'image' | 'document';
  mimeType: string;
  data: string;  // base64 data URL
  size?: number;
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
  scrollResetKey: number;  // 新增
}
```

### SettingsView

```typescript
interface SettingsViewProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
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

### MemoryPanel (新增)

```typescript
interface MemoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
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
  
  // 2. 检查是否启用 Agent 模式
  if (agentExecution.isAgentMode && agentExecution.currentAgent) {
    await handleAgentExecution([...messages, userMessage], input);
  } else {
    await requestAI([...messages, userMessage], systemPrompt, input);
  }
};

// 3. Agent 执行
const handleAgentExecution = async (currentMsgs, originalInput) => {
  const conversationHistory = currentMsgs.map(m => ({
    role: m.role,
    content: m.content,
    attachments: m.attachments
  }));
  
  const result = await agentExecution.execute(
    originalInput, 
    conversationHistory, 
    sessionId
  );
};

// 4. 普通 AI 请求
const requestAI = async (currentMsgs, systemPrompt, originalInput) => {
  // 检查是否需要搜索
  if (isWebSearchEnabled) {
    const searchResults = await invoke('search', { query });
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
  
  // 如果是 Agent 模式
  if (agentExecution.status !== 'idle') {
    agentExecution.abort();
  }
};
```

### 工具授权处理 (新增)

```typescript
// 当 Agent 需要执行敏感工具时
const handleApproveToolCall = () => {
  agentExecution.approveToolCall();
};

const handleRejectToolCall = () => {
  agentExecution.rejectToolCall();
};
```

### 记忆操作 (新增)

```typescript
const { reinforce, deleteMemory, decay, prune, runEvolutionCycle } = useMemoryState();

// 强化记忆
await reinforce(['memory-id-1', 'memory-id-2']);

// 删除记忆
await deleteMemory('memory-id');

// 执行衰减
await decay();

// 执行淘汰
await prune();

// 运行完整演化周期
await runEvolutionCycle();
```
