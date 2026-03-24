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

export type MemoryType = 'identity' | 'fact' | 'preference' | 'task' | 'constraint' | 'skill';

export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'cancelled';

export interface TaskMetadata {
  status: TaskStatus;
  progress?: string;
  next_step?: string;
}

export interface MemoryItem {
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
  lastAccessedAt: number;
  accessCount: number;
  metadata?: TaskMetadata;
}

export interface ExtractedItem {
  content: string;
  importance: number;
}

export interface ExtractedTask {
  content: string;
  status: TaskStatus;
  progress?: string;
  next_step?: string;
  importance: number;
}

export interface ExtractedMemory {
  identity: ExtractedItem[];
  facts: ExtractedItem[];
  preferences: ExtractedItem[];
  tasks: ExtractedTask[];
  constraints: ExtractedItem[];
  skills: ExtractedItem[];
}

export type ModelType = 'local' | 'online';

export interface RetrievalOptions {
  topK: number;
  memoryTypes?: MemoryType[];
  minImportance?: number;
  sessionId?: string;
  modelType?: ModelType;
}

export interface ScoreComponents {
  similarity: number;
  memoryScore: number;
}

export interface RetrievedMemory {
  item: MemoryItem;
  score: number;
  components: ScoreComponents;
}

export interface MemoryStats {
  totalCount: number;
  byType: Record<string, number>;
  avgImportance: number;
}

export interface DecayResult {
  processed: number;
  updated: number;
}

export interface PruneResult {
  markedInactive: number;
  deleted: number;
}

export interface EvolutionStats {
  activeCount: number;
  inactiveCount: number;
  avgScore: number;
  avgDecay: number;
}

export interface AgentConfig {
  autoMemory?: boolean;
  autoMemoryExtraction?: boolean;
  extractionInterval?: number;
  autoTaskTracking?: boolean;
  taskDetectionPatterns?: string[];
  autoRouting?: boolean;
  customRoutingRules?: RoutingRule[];
  maxMemoryInjection?: number;
  minImportanceThreshold?: number;
}

export interface RoutingRule {
  keywords: string[];
  memoryTypes: MemoryType[];
}

export type CandidateStatus = 'pending' | 'accepted' | 'rejected' | 'merged';

export interface CandidateMemory {
  id: string;
  content: string;
  memoryType: MemoryType;
  confidence: number;
  sourceSessionId: string;
  sourceMessageIds: string[];
  createdAt: number;
  status: CandidateStatus;
  importance: number;
}

export interface ExtractionResult {
  candidates: CandidateMemory[];
  extractionTimeMs: number;
  modelUsed: string;
}

export interface ExtractionConfig {
  minMessageCount: number;
  minConversationLength: number;
  skipToolCallMessages: boolean;
}

export interface ConversationMessage {
  id: string;
  role: string;
  content: string;
  isToolCall: boolean;
}

