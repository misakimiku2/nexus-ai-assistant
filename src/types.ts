import { AgentStatus, ReasoningStep, ToolCallRecord } from './agent/types';

export type MessageRole = 'user' | 'assistant' | 'system';

export interface AgentExecutionData {
  reasoningSteps: ReasoningStep[];
  toolCalls: ToolCallRecord[];
  iterationCount: number;
  status: AgentStatus;
}

export interface TodoItem {
  id: string;
  title: string;
  status: 'pending' | 'working' | 'completed' | 'failed';
  progress: number;
  description?: string;
  subAgentId?: string;
  targetSessionId?: string;
  steps?: { label: string; status: 'pending' | 'working' | 'completed' }[];
}

export interface MessageVersion {
  content: string;
  thinking?: string;
  timestamp: number;
  tokenCount?: number;
  tokenSpeed?: number;
  executionTime?: number;
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  mode?: 'chat' | 'command';
  agentId?: string;
  thinking?: string;
  searchResults?: SearchResult[];
  fileEdits?: { file: string; diff: string; status: 'success' | 'error' }[];
  todos?: TodoItem[];
  error?: string;
  tokenCount?: number;
  tokenSpeed?: number;
  executionTime?: number;
  versions?: MessageVersion[];
  currentVersionIndex?: number;
  agentExecution?: AgentExecutionData;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchGroup {
  id: string;
  query: string;
  results: SearchResult[];
  timestamp: number;
  sessionId?: string;
}

export interface LogEntry {
  id: string;
  type: 'info' | 'error' | 'command' | 'warning' | 'success';
  message: string;
  timestamp: number;
  source?: string;
  duration?: number;
  metadata?: Record<string, any>;
}

export interface ChatFolder {
  id: string;
  name: string;
  isExpanded: boolean;
  isClusterTask?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
  folderId?: string;
  activeAgents?: string[]; // IDs of agents active in this session
}

export type AppMode = 'chat' | 'command';
export type TabType = 'chat' | 'search' | 'terminal' | 'mcp' | 'agents';
export type ModelProvider = 'lm-studio' | 'ollama' | 'online';

export interface McpTool {
  name: string;
  description: string;
  requiresAuth: boolean;
}

export interface McpServer {
  id: string;
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  tools: McpTool[];
}

export interface PendingAction {
  id: string;
  tool: string;
  serverName: string;
  description: string;
  originalInput: string;
}

export interface Agent {
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

