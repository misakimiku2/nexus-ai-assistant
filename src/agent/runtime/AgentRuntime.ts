import { Agent, RetrievedMemory } from '../../types';
import {
  AgentExecutionContext,
  AgentExecutionState,
  AgentStatus,
  ConversationMessage,
  AgentConfig,
  DEFAULT_AGENT_CONFIG,
  ToolCallRecord,
} from '../types';
import { ReActEngine } from './ReActEngine';
import { agentStateManager } from './AgentState';
import { initializeBuiltinTools } from '../tools/builtin';
import { ToolRegistry } from '../tools/ToolRegistry';
import { preprocessConversation, resetUrlPlaceholderCounter, PreprocessedConversation } from '../preprocess/urlDetector';

export interface AgentRuntimeOptions {
  agent: Agent;
  config?: Partial<AgentConfig>;
  onStatusChange?: (status: AgentStatus) => void;
  onToolCall?: (record: { id: string; toolName: string; parameters: Record<string, unknown>; status: string; result?: { success: boolean; output: string; error?: string } }) => void;
  onReasoningStep?: (step: { type: string; content: string }) => void;
  onReasoningStepUpdate?: (step: { id: string; type: string; content: string; isStreaming?: boolean }) => void;
  onRequestAuth?: (toolCall: { id: string; toolName: string; parameters: Record<string, unknown>; status: string }) => Promise<boolean>;
  onContentChunk?: (chunk: string) => void;
  onIterationCountChange?: (count: number) => void;
  onMemoryRetrieved?: (memories: RetrievedMemory[]) => void;
  sessionId?: string;
}

let toolsInitialized = false;

export class AgentRuntime {
  private agent: Agent;
  private config: AgentConfig;
  private engine: ReActEngine | null = null;
  private callbacks: AgentRuntimeOptions;

  constructor(options: AgentRuntimeOptions) {
    this.agent = options.agent;
    this.config = { ...DEFAULT_AGENT_CONFIG, ...options.config };
    this.callbacks = options;

    agentStateManager.initializeAgent(this.agent, this.config);
  }

  async initialize(): Promise<void> {
    if (!toolsInitialized) {
      ToolRegistry.clear();
      initializeBuiltinTools();
      toolsInitialized = true;
    } else {
      const allTools = ToolRegistry.getAllEntries();
      for (const entry of allTools) {
        if (!entry.enabled) {
          ToolRegistry.enable(entry.definition.name);
        }
      }
    }

    if (this.agent.tools) {
      const allTools = ToolRegistry.getAll();
      for (const tool of allTools) {
        if (!this.agent.tools.includes(tool.name)) {
          ToolRegistry.disable(tool.name);
        }
      }
    }
  }

  async execute(
    userInput: string,
    conversationHistory: ConversationMessage[] = [],
    sessionId?: string
  ): Promise<string> {
    resetUrlPlaceholderCounter();
    const preprocessed = preprocessConversation(userInput, conversationHistory);
    
    const hasUrls = preprocessed.urlMap.size > 0;
    
    console.log('[AgentRuntime] Preprocessed conversation:', {
      hasUrls,
      urlCount: preprocessed.urlMap.size,
      urls: Object.fromEntries(preprocessed.urlMap),
    });
    
    const context: AgentExecutionContext = {
      agent: this.agent,
      userInput: preprocessed.processedUserInput,
      originalUserInput: userInput,
      conversationHistory: preprocessed.messages as ConversationMessage[],
      availableTools: ToolRegistry.getEnabledToolNames(),
      preprocessedUrls: preprocessed.urlMap,
      sessionId: sessionId,
      onStatusChange: (status) => {
        agentStateManager.updateStatus(this.agent.id, status);
        this.callbacks.onStatusChange?.(status);
      },
      onToolCall: (record: ToolCallRecord) => {
        agentStateManager.addToolCallRecord(this.agent.id, record);
        this.callbacks.onToolCall?.({
          id: record.id,
          toolName: record.toolName,
          parameters: record.parameters,
          status: record.status,
          result: record.result,
        });
      },
      onReasoningStep: (step) => {
        agentStateManager.addReasoningStep(this.agent.id, step);
        this.callbacks.onReasoningStep?.(step);
      },
      onReasoningStepUpdate: (step) => {
        agentStateManager.updateReasoningStep(this.agent.id, step);
        this.callbacks.onReasoningStepUpdate?.(step);
      },
      onRequestAuth: async (toolCall: ToolCallRecord) => {
        if (this.callbacks.onRequestAuth) {
          return this.callbacks.onRequestAuth({
            id: toolCall.id,
            toolName: toolCall.toolName,
            parameters: toolCall.parameters,
            status: toolCall.status,
          });
        }
        return false;
      },
      onContentChunk: (chunk: string) => {
        this.callbacks.onContentChunk?.(chunk);
      },
      onIterationCountChange: (count: number) => {
        this.callbacks.onIterationCountChange?.(count);
      },
      onMemoryRetrieved: (memories: RetrievedMemory[]) => {
        this.callbacks.onMemoryRetrieved?.(memories);
      },
    };

    this.engine = new ReActEngine(context);
    return this.engine.run(preprocessed.processedUserInput);
  }

  abort(): void {
    this.engine?.abort();
    agentStateManager.updateStatus(this.agent.id, 'failed');
  }

  getState(): AgentExecutionState | undefined {
    return agentStateManager.getState(this.agent.id);
  }

  getStatus(): AgentStatus {
    return agentStateManager.getState(this.agent.id)?.status ?? 'idle';
  }

  reset(): void {
    this.abort();
    agentStateManager.resetAgent(this.agent.id);
    this.engine = null;
  }

  updateConfig(newConfig: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...newConfig };
    agentStateManager.initializeAgent(this.agent, this.config);
  }
}

let defaultRuntime: AgentRuntime | null = null;

export function initializeDefaultRuntime(
  agent: Agent,
  options?: Omit<AgentRuntimeOptions, 'agent'>
): AgentRuntime {
  defaultRuntime = new AgentRuntime({ agent, ...options });
  return defaultRuntime;
}

export function getDefaultRuntime(): AgentRuntime | null {
  return defaultRuntime;
}

export { agentStateManager };
