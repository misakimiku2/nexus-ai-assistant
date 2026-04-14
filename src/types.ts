import { AgentStatus, ReasoningStep, ToolCallRecord } from './agent/types';

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Attachment {
  id: string;
  type: 'image' | 'document';
  name: string;
  data: string;
  mimeType: string;
  size?: number;
}

export interface AttachmentReference {
  id: string;
  type: 'image' | 'document';
  name: string;
  mimeType: string;
  size?: number;
  storagePath?: string;
  storageKey?: string;
}

export interface StorageState {
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  lastSavedAt: number | null;
  storagePath?: string;
}

export interface AgentExecutionData {
  reasoningSteps: ReasoningStep[];
  toolCalls: ToolCallRecord[];
  iterationCount: number;
  status: AgentStatus;
}

export interface TodoStep {
  label: string;
  status: 'pending' | 'working' | 'completed' | 'failed';
  result?: string;
  error?: string;
  observationData?: Array<{ title: string; url: string; snippet?: string }>;
  filePath?: string;
}

export interface TodoItem {
  id: string;
  title: string;
  status: 'pending' | 'working' | 'completed' | 'failed';
  progress: number;
  description?: string;
  subAgentId?: string;
  targetSessionId?: string;
  steps?: TodoStep[];
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
  attachments?: Attachment[];
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
  activeAgents?: string[];
  searchGroups?: SearchGroup[];
}

export type AppMode = 'chat' | 'command';
export type TabType = 'chat' | 'search' | 'terminal' | 'mcp' | 'agents';
export type ModelProvider = 'lm-studio' | 'ollama' | 'online';

export interface McpTool {
  name: string;
  description: string;
  requiresAuth: boolean;
  inputSchema?: Record<string, unknown>;
}

export interface McpServer {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  tools: McpTool[];
  error?: string;
  enabled: boolean;
  toolTimeoutSecs?: number;
  connectTimeoutSecs?: number;
}

export interface McpServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  toolTimeoutSecs?: number;
  connectTimeoutSecs?: number;
}

export interface McpCallToolResult {
  content: string;
  isError: boolean;
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

export interface SingleCurrencyPricing {
  inputPrice: number;       // 输入价格（缓存未命中，每1M tokens）
  outputPrice: number;      // 输出价格（每1M tokens）
  cacheHitPrice?: number;   // 缓存命中价格（可选，每1M tokens）
  cacheWritePrice?: number; // 缓存写入价格（可选，Anthropic专用）
}

export interface ModelPricing extends SingleCurrencyPricing {
  currency: 'USD' | 'CNY';  // 默认货币类型
  usdPricing?: SingleCurrencyPricing;  // 美元定价（可选，用于双货币支持）
  cnyPricing?: SingleCurrencyPricing;  // 人民币定价（可选，用于双货币支持）
}

export interface AggregatorProvider {
  id: string;
  name: string;
  logo: string;
  apiUrl: string;
  apiKeyUrl: string;
  pricingUrl?: string;
  supportsModelList: boolean;
  supportsPricingApi: boolean;
  currency: 'USD' | 'CNY';
}

export interface ModelConfig {
  id: string;
  name: string;
  modelId: string;
  provider: 'lm-studio' | 'ollama' | 'online';
  onlineProvider?: string;
  apiUrl?: string;
  apiKey?: string;
  maxContextLength: number;
  timeout: number;        // 请求超时时间（秒）
  rpm: number;            // RPM限流次数
  pricing?: ModelPricing; // 定价配置（仅在线模型）
  status: 'active' | 'inactive' | 'error';
  priority: number;
  lastConnected?: number;
  createdAt: number;
}

export interface TokenUsageRecord {
  id: string;
  modelId: string;
  timestamp: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export interface TokenUsageStats {
  records: TokenUsageRecord[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
}

