import { Agent } from '../types';

export type AgentStatus = 'idle' | 'thinking' | 'acting' | 'waiting_auth' | 'completed' | 'failed';

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface Task {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  priority: 'high' | 'medium' | 'low';
  assignedAgentId?: string;
  parentTaskId?: string;
  subTaskIds?: string[];
  result?: string;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

export interface ToolCallRecord {
  id: string;
  toolName: string;
  parameters: Record<string, unknown>;
  result?: ToolCallResult;
  status: 'pending' | 'executing' | 'success' | 'error' | 'waiting_auth';
  timestamp: number;
  requiresAuth: boolean;
  approvedByUser?: boolean;
}

export interface ToolCallResult {
  success: boolean;
  output: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ReasoningStep {
  id: string;
  type: 'thought' | 'action' | 'observation';
  content: string;
  timestamp: number;
  toolCallId?: string;
}

export interface AgentExecutionState {
  agentId: string;
  status: AgentStatus;
  currentTask?: Task;
  taskQueue: Task[];
  completedTasks: Task[];
  reasoningSteps: ReasoningStep[];
  toolCallHistory: ToolCallRecord[];
  iterationCount: number;
  maxIterations: number;
  startTime: number;
  lastUpdateTime: number;
}

export interface AgentExecutionContext {
  agent: Agent;
  userInput: string;
  conversationHistory: ConversationMessage[];
  availableTools: string[];
  onStatusChange?: (status: AgentStatus) => void;
  onTaskUpdate?: (task: Task) => void;
  onToolCall?: (record: ToolCallRecord) => void;
  onReasoningStep?: (step: ReasoningStep) => void;
  onRequestAuth?: (toolCall: ToolCallRecord) => Promise<boolean>;
  onContentChunk?: (chunk: string) => void;
  onIterationCountChange?: (count: number) => void;
}

export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCallRequest[];
}

export interface ToolCallRequest {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface LLMResponse {
  content?: string;
  reasoningContent?: string;
  toolCalls?: ToolCallRequest[];
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
}

export interface AgentConfig {
  maxIterations: number;
  timeoutMs: number;
  enableAutoAuth: boolean;
  authTools: string[];
  verboseLogging: boolean;
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  maxIterations: 10,
  timeoutMs: 120000,
  enableAutoAuth: false,
  authTools: ['write_file', 'execute_shell', 'delete_file'],
  verboseLogging: true,
};
