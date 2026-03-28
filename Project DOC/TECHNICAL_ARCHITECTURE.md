# Nexus AI Assistant - 技术架构

## 技术栈概览

### 前端技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 19.0.0 | UI 框架 |
| TypeScript | 5.8.2 | 类型安全 |
| Vite | 6.2.0 | 构建工具 |
| Tailwind CSS | 4.1.14 | 样式框架 |
| Motion | 12.23.24 | 动画库 |
| Lucide React | 0.546.0 | 图标库 |
| React Markdown | 10.1.0 | Markdown 渲染 |
| Recharts | 3.8.0 | 图表库 |
| i18next | 25.8.18 | 国际化 |

### Tauri 后端技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Tauri | 2.10.1 | 桌面应用框架 |
| Rust | 1.92.0 | 后端语言 |
| SQLite | - | 本地数据库 |
| fastembed | - | 向量嵌入 |

### 已移除

| 技术 | 原用途 | 说明 |
|------|--------|------|
| Express | Web 服务器 | 已迁移到 Tauri 后端 |
| better-sqlite3 | Node 数据库 | 已迁移到 Rust 实现 |

## 架构设计

### 1. 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     Tauri Desktop App                       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │              React Frontend (Vite)                   │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │   ChatView  │  │  AgentView  │  │MemoryPanel  │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  │  ┌─────────────────────────────────────────────────┐│   │
│  │  │           GlobalStateContext                    ││   │
│  │  │  (Sessions, Messages, Agents, Settings)         ││   │
│  │  └─────────────────────────────────────────────────┘│   │
│  │  ┌─────────────────────────────────────────────────┐│   │
│  │  │           MemoryUIContext                       ││   │
│  │  │  (Debug Mode, Current Hits, Debug Logs)         ││   │
│  │  └─────────────────────────────────────────────────┘│   │
│  │  ┌─────────────────────────────────────────────────┐│   │
│  │  │           Agent System                          ││   │
│  │  │  (Runtime, Tools, Memory, LLM)                  ││   │
│  │  └─────────────────────────────────────────────────┘│   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼ Tauri invoke()                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Rust Backend (Tauri)                    │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │ Memory Sys  │  │   Tools     │  │   Search    │  │   │
│  │  │ (SQLite)    │  │ (FS, Shell) │  │ (DuckDuckGo)│  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  │  ┌─────────────┐  ┌─────────────┐                   │   │
│  │  │ Embedding   │  │  Session    │                   │   │
│  │  │ Service     │  │  Persistence│                   │   │
│  │  └─────────────┘  └─────────────┘                   │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────────┐
        │         External AI Services        │
        │  ┌──────────┐  ┌──────────────────┐ │
        │  │ LM Studio│  │     Ollama       │ │
        │  │ :1234    │  │     :11434       │ │
        │  └──────────┘  └──────────────────┘ │
        │  ┌──────────────────────────────────┐│
        │  │  Online APIs (OpenAI, Gemini...) ││
        │  └──────────────────────────────────┘│
        └─────────────────────────────────────┘
```

### 2. 状态管理架构

```typescript
// GlobalStateContext 核心状态结构
interface GlobalState {
  // 消息与会话
  messages: Message[];
  sessions: ChatSession[];
  currentSessionId: string;
  
  // 文件夹管理
  folders: ChatFolder[];
  
  // Agent 管理
  agents: Agent[];
  
  // 系统提示词预设
  systemPromptPresets: { id: string; name: string; content: string }[];
  
  // 派生状态
  todos: TodoItem[];
  
  // 用户设置
  userName: string;
  aiName: string;
  userAvatar: string;
  aiAvatar: string;
  language: string;
  fontFamily: string;
  
  // 关闭窗口设置
  closeWindowAskEveryTime: boolean;
  closeWindowAction: 'minimize' | 'close';
  
  // MCP 服务器
  mcpServers: McpServer[];
  
  // 搜索状态
  searchGroups: SearchGroup[];
  searchResults: SearchResult[];
  
  // 日志
  logs: LogEntry[];
  
  // 流式状态
  isStreaming: boolean;
  currentTokenCount: number;
  
  // 搜索引擎设置 (新增)
  searchEngine: string;
  tavilyApiKey: string;
  tavilyEnabled: boolean;
  tavilySearchDepth: 'basic' | 'advanced';
  tavilyIncludeAnswer: boolean;
  
  // 记忆模型设置 (新增)
  memoryModelConfig: MemoryModelConfig;
  
  // 聊天模型设置 (新增)
  lmStudioUrl: string;
  ollamaUrl: string;
  modelName: string;
  modelTemperature: number;
  maxContextLength: number;
  modelProvider: ModelProvider;
  systemPrompt: string;
}

// MemoryUIContext 状态结构 (新增)
interface MemoryUIContextValue {
  debugMode: boolean;
  currentHits: RetrievedMemory[];
  debugLogs: MemoryDebugLogEntry[];
  refreshTrigger: number;
}
```

### 3. Agent 执行流程

```
用户发送消息
      │
      ▼
┌─────────────────┐
│handleSendMessage│
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│     检查是否启用 Agent 模式              │
│  isAgentMode && currentAgent?           │
└────────┬────────────────────┬───────────┘
         │ Yes                │ No
         ▼                    ▼
┌─────────────────┐   ┌─────────────────┐
│handleAgent      │   │   requestAI()   │
│Execution()      │   └────────┬────────┘
└────────┬────────┘            │
         │                     │
         ▼                     ▼
┌─────────────────────────────────────────┐
│          AgentRuntime.execute()          │
├─────────────────────────────────────────┤
│  ┌─────────────────────────────────┐    │
│  │      ReAct 推理循环              │    │
│  │  1. 思考 (Thought)               │    │
│  │  2. 行动 (Action)                │    │
│  │  3. 观察 (Observation)           │    │
│  │  4. 重复直到完成或达到最大迭代    │    │
│  └─────────────────────────────────┘    │
│                │                          │
│                ▼                          │
│  ┌─────────────────────────────────┐    │
│  │      工具执行                    │    │
│  │  - web_search (网络搜索)         │    │
│  │  - read_file (读取文件)          │    │
│  │  - write_file (写入文件)         │    │
│  │  - execute_shell (执行命令)      │    │
│  │  - fetch_url (获取网页)          │    │
│  └─────────────────────────────────┘    │
│                │                          │
│                ▼                          │
│  ┌─────────────────────────────────┐    │
│  │      记忆系统集成                │    │
│  │  - 检索相关记忆                  │    │
│  │  - 注入到上下文                  │    │
│  │  - 提取新记忆                    │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│         流式响应处理                     │
│  - SSE 解析                             │
│  - 思考链提取 (<think/>标签)            │
│  - 推理步骤实时更新                     │
│  - 工具调用可视化                       │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│         状态更新                         │
│  - 消息存储                             │
│  - Token 统计                           │
│  - 会话标题生成                         │
│  - 记忆提取触发                         │
└─────────────────────────────────────────┘
```

### 4. 记忆系统架构 (新增)

```
┌─────────────────────────────────────────────────────────────┐
│                    记忆系统架构                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   前端 (TypeScript)                   │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │MemoryUI     │  │useMemory    │  │TauriMemory  │  │   │
│  │  │Context      │  │State Hook   │  │Client       │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │Memory       │  │Similarity   │  │Memory       │  │   │
│  │  │Extraction   │  │Engine       │  │Store        │  │   │
│  │  │Service      │  │             │  │             │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼ Tauri invoke()                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   后端 (Rust)                         │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │Memory       │  │Embedding    │  │Memory       │  │   │
│  │  │Storage      │  │Service      │  │Retrieval    │  │   │
│  │  │(SQLite)     │  │(fastembed)  │  │             │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │Memory       │  │Memory       │  │Memory       │  │   │
│  │  │Scoring      │  │Lifecycle    │  │Evolution    │  │   │
│  │  │             │  │             │  │Manager      │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │Memory       │  │Memory       │  │Candidate    │  │   │
│  │  │Merge        │  │Conflict     │  │Storage      │  │   │
│  │  │             │  │Resolution   │  │             │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘

记忆类型:
├── identity    # 身份特征 (用户名、职业等)
├── fact        # 已知事实 (项目信息、技术栈等)
├── preference  # 用户偏好 (编码风格、工具选择等)
├── task        # 进行中任务 (当前工作项)
├── constraint  # 限制条件 (时间限制、预算等)
└── skill       # 用户能力 (熟练技术、经验等)

记忆生命周期:
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  候选    │───▶│  活跃    │───▶│  不活跃  │───▶│  删除    │
│ (Pending)│    │ (Active) │    │(Inactive)│    │(Deleted) │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
     │               │               │
     │               │               │
     ▼               ▼               ▼
  用户确认       定期衰减        自动清理
```

### 5. Agent 集群架构

```
┌─────────────────────────────────────────────────────────┐
│                    Agent Cluster                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │           Nexus Architect (主 Agent)             │   │
│  │  - 系统架构设计                                   │   │
│  │  - 任务协调分配                                   │   │
│  │  - 代码审查                                       │   │
│  └───────────────────────┬─────────────────────────┘   │
│                          │                              │
│          ┌───────────────┼───────────────┐             │
│          │               │               │             │
│          ▼               ▼               ▼             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐      │
│  │ Data Oracle │ │ Web Scouter │ │  Sec Guard  │      │
│  │  数据科学家  │ │  研究专家   │ │  安全专家   │      │
│  └─────────────┘ └─────────────┘ └─────────────┘      │
│          │               │               │             │
│          ▼               ▼               ▼             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐      │
│  │ UI Weaver   │ │Ops Commander│ │   ...       │      │
│  │  前端开发   │ │  运维专家   │ │             │      │
│  └─────────────┘ └─────────────┘ └─────────────┘      │
│                                                         │
└─────────────────────────────────────────────────────────┘

Agent 执行状态:
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│   idle   │───▶│ thinking │───▶│  acting  │───▶│responding│
│  (空闲)  │    │  (思考)  │    │  (行动)  │    │ (响应中) │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
              ┌──────────┐   ┌──────────┐   ┌──────────┐
              │waiting   │   │completed │   │  failed  │
              │_auth     │   │  (完成)  │   │  (失败)  │
              │(等待授权)│   └──────────┘   └──────────┘
              └──────────┘
```

### 6. MCP (Model Context Protocol) 集成

```
┌─────────────────────────────────────────────────────────┐
│                   MCP Control Center                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────┐    ┌─────────────────┐           │
│  │ Google Search   │    │  System Ops     │           │
│  │ MCP Server      │    │  MCP Server     │           │
│  │                 │    │                 │           │
│  │ - web_search    │    │ - modify_smb    │           │
│  │                 │    │   _config       │           │
│  └────────┬────────┘    └────────┬────────┘           │
│           │                      │                     │
│           ▼                      ▼                     │
│  ┌─────────────────────────────────────────────────┐   │
│  │              Pending Action Approval             │   │
│  │  用户确认后执行敏感操作                           │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## 关键技术实现

### 1. ReAct 推理引擎

```typescript
// ReAct 循环实现
class ReActEngine {
  async run(input: string, context: AgentExecutionContext): Promise<string> {
    let iteration = 0;
    let response = '';
    
    while (iteration < maxIterations) {
      // 1. 思考阶段
      const thought = await this.generateThought(input, context);
      context.onReasoningStep?.({ type: 'thought', content: thought });
      
      // 2. 决定是否需要行动
      const action = await this.decideAction(thought);
      
      if (!action) {
        // 不需要行动，生成最终响应
        response = await this.generateResponse(input, context);
        break;
      }
      
      // 3. 执行行动
      const observation = await this.executeAction(action, context);
      context.onReasoningStep?.({ type: 'observation', content: observation });
      
      iteration++;
    }
    
    return response;
  }
}
```

### 2. 记忆检索与注入

```typescript
// 记忆检索流程
async function retrieveMemories(query: string, sessionId: string): Promise<RetrievedMemory[]> {
  // 1. 生成查询向量
  const embedding = await TauriMemoryClient.generateEmbedding(query);
  
  // 2. 相似度搜索
  const candidates = await TauriMemoryClient.searchSimilarMemories(embedding, topK);
  
  // 3. 评分和过滤
  const scored = candidates.map(c => ({
    ...c,
    score: calculateMemoryScore(c, query)
  }));
  
  // 4. 返回高分记忆
  return scored.filter(m => m.score > threshold).slice(0, maxResults);
}

// 记忆注入到上下文
function injectMemories(systemPrompt: string, memories: RetrievedMemory[]): string {
  if (memories.length === 0) return systemPrompt;
  
  const memoryContext = memories.map(m => 
    `[${m.item.memoryType}] ${m.item.content}`
  ).join('\n');
  
  return `${systemPrompt}\n\n[相关记忆]\n${memoryContext}`;
}
```

### 3. 上下文压缩策略

针对 8GB VRAM 的优化：

```typescript
// 策略 1: 代码块骨架化
content.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
  const lines = code.split('\n').length;
  if (lines > 15) {
    return `\`\`\`${lang}\n/* [代码块已折叠: ${lines}行] */\n\`\`\``;
  }
  return match;
});

// 策略 2: Head + Tail 滑动窗口
if (totalTokens > maxContextLength * 0.85) {
  const head = messages[0];
  const tail = messages.slice(-2);
  messages = [head, { role: 'system', content: '[...已压缩...]' }, ...tail];
}
```

### 4. 超长文本分块处理

```typescript
// 智能分块，保持语义完整性
const chunkTextWithOverlap = (text: string, chunkSize: number, overlap: number) => {
  // 按句子/段落边界切分
  // 添加重叠区域保持上下文连贯
  // 串行处理，累积输出
};
```

### 5. 思考链提取

```typescript
const processThinking = (text: string) => {
  const thinkStartTag = '<<think?>>';
  const thinkEndTag = '<</think?>>';
  
  // 提取思考过程和正文内容
  // 支持多种模型的思考标签格式
};
```

## 性能优化

### 1. 前端优化

- **React 19**: 使用新的 Concurrent 特性
- **Motion**: 硬件加速动画
- **代码分割**: Vite 自动分块
- **虚拟列表**: 长消息列表优化
- **requestAnimationFrame**: 流式内容更新节流

### 2. 网络优化

- **流式响应**: SSE 实时渲染
- **请求取消**: AbortController 支持
- **连接复用**: HTTP Keep-Alive

### 3. 内存优化

- **上下文压缩**: 自动管理 Token 数量
- **消息版本**: 支持重新生成，保留历史版本
- **懒加载**: 组件按需加载
- **记忆演化**: 定期清理不活跃记忆

### 4. 数据库优化 (新增)

- **向量索引**: SQLite 向量扩展
- **批量操作**: 批量插入和更新
- **连接池**: 复用数据库连接
- **事务支持**: 保证数据一致性

## 安全考虑

1. **API Key 存储**: 仅存储在 localStorage，生产环境建议使用安全存储
2. **敏感操作确认**: MCP 工具执行前需用户确认
3. **CSP 配置**: Tauri 应用配置内容安全策略
4. **输入验证**: 用户输入经过清理后再发送到 API
5. **工具授权**: 敏感工具需要用户明确授权
6. **记忆隐私**: 敏感信息不存储在记忆系统中

## 数据持久化

### 存储位置

- **数据库**: `%LOCALAPPDATA%\nexus-ai-assistant\memory.db`
- **嵌入模型**: 本地下载存储
- **用户设置**: localStorage

### 数据备份

```bash
# 备份记忆数据库
copy %LOCALAPPDATA%\nexus-ai-assistant\memory.db backup\
```
