import { useState, useCallback, useRef, useEffect } from 'react';
import { Agent, SearchResult, Attachment } from '../types';
import {
  AgentRuntime,
  initializeDefaultRuntime,
  agentStateManager,
} from '../agent/runtime/AgentRuntime';
import {
  AgentStatus,
  ReasoningStep,
  ToolCallRecord,
  ConversationMessage,
  ContentPart,
} from '../agent/types';
import { DEFAULT_AGENT } from '../data/agents';
import { useGlobalState } from '../context/GlobalStateContext';
import { calculateCost } from '../utils/pricing';

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

interface UseAgentExecutionResult {
  status: AgentStatus;
  reasoningSteps: ReasoningStep[];
  toolCalls: ToolCallRecord[];
  iterationCount: number;
  pendingAuthToolCall: ToolCallRecord | null;
  isAgentMode: boolean;
  execute: (input: string, conversationHistory: ConversationMessage[], imageAttachments?: { data: string; name: string }[]) => Promise<string>;
  approveToolCall: () => void;
  rejectToolCall: () => void;
  abort: () => void;
  reset: () => void;
  toggleAgentMode: () => void;
  setAgent: (agent: Agent) => void;
  currentAgent: Agent | null;
  lastTokenUsage: TokenUsage | null;
  resetTokenUsage: () => void;
  getTokenUsage: () => TokenUsage | null;
}

interface DefaultAgentConfig {
  apiUrl: string;
  modelId: string;
  temperature: number;
}

interface AgentExecutionCallbacks {
  onWebSearchResult?: (query: string, results: SearchResult[]) => void;
  onExecutionUpdate?: (data: {
    reasoningSteps: ReasoningStep[];
    toolCalls: ToolCallRecord[];
    iterationCount: number;
    status: AgentStatus;
  }) => void;
  onContentChunk?: (chunk: string) => void;
}

function parseWebSearchResults(output: string): SearchResult[] {
  try {
    let jsonStr = output;
    
    if (output.includes('AI Answer:') && output.includes('Search Results:')) {
      const searchResultsIndex = output.indexOf('Search Results:');
      if (searchResultsIndex !== -1) {
        jsonStr = output.substring(searchResultsIndex + 'Search Results:'.length).trim();
      }
    }
    
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) {
      return parsed.map((item: any) => ({
        title: item.title || item.name || 'Unknown',
        url: item.url || item.link || '',
        snippet: item.snippet || item.description || item.content || '',
      }));
    }
    if (parsed.results && Array.isArray(parsed.results)) {
      return parsed.results.map((item: any) => ({
        title: item.title || item.name || 'Unknown',
        url: item.url || item.link || '',
        snippet: item.snippet || item.description || item.content || '',
      }));
    }
  } catch (e) {
    console.error('Failed to parse web_search results:', e);
  }
  return [];
}

export function useAgentExecution(
  defaultConfig?: DefaultAgentConfig,
  callbacks?: AgentExecutionCallbacks
): UseAgentExecutionResult {
  const { addTokenUsageRecord, activeModelId, modelConfigs } = useGlobalState();
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [reasoningSteps, setReasoningSteps] = useState<ReasoningStep[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCallRecord[]>([]);
  const [iterationCount, setIterationCount] = useState(0);
  const [pendingAuthToolCall, setPendingAuthToolCall] = useState<ToolCallRecord | null>(null);
  const [isAgentMode, setIsAgentMode] = useState(true);
  const [currentAgent, setCurrentAgent] = useState<Agent | null>(null);
  const [lastTokenUsage, setLastTokenUsage] = useState<TokenUsage | null>(null);

  const runtimeRef = useRef<AgentRuntime | null>(null);
  const authResolveRef = useRef<((approved: boolean) => void) | null>(null);
  const isInitializedRef = useRef(false);
  const lastQueryRef = useRef<string>('');
  const callbacksRef = useRef(callbacks);
  const currentAgentRef = useRef<Agent | null>(null);
  const tokenUsageRef = useRef<TokenUsage | null>(null);
  callbacksRef.current = callbacks;

  const notifyExecutionUpdate = useCallback(() => {
    if (callbacksRef.current?.onExecutionUpdate) {
      callbacksRef.current.onExecutionUpdate({
        reasoningSteps,
        toolCalls,
        iterationCount,
        status,
      });
    }
  }, [reasoningSteps, toolCalls, iterationCount, status]);

  useEffect(() => {
    notifyExecutionUpdate();
  }, [reasoningSteps, toolCalls, iterationCount, status, notifyExecutionUpdate]);

  const initializeRuntime = useCallback((agent: Agent) => {
    const runtime = initializeDefaultRuntime(agent, {
      onStatusChange: (newStatus) => {
        setStatus(newStatus);
      },
      onToolCall: (record) => {
        const toolRecord = record as ToolCallRecord;
        setToolCalls((prev) => [...prev, toolRecord]);
        
        if (toolRecord.toolName === 'web_search' && toolRecord.status === 'success' && toolRecord.result?.output) {
          const results = parseWebSearchResults(toolRecord.result.output);
          if (results.length > 0 && callbacksRef.current?.onWebSearchResult) {
            const query = (toolRecord.parameters?.query as string) || lastQueryRef.current || '搜索';
            callbacksRef.current.onWebSearchResult(query, results);
          }
        }
      },
      onReasoningStep: (step) => {
        setReasoningSteps((prev) => [...prev, step as ReasoningStep]);
      },
      onReasoningStepUpdate: (step) => {
        setReasoningSteps((prev) =>
          prev.map(s => s.id === step.id ? step as ReasoningStep : s)
        );
      },
      onRequestAuth: async (toolCall) => {
        return new Promise((resolve) => {
          setPendingAuthToolCall(toolCall as ToolCallRecord);
          authResolveRef.current = resolve;
        });
      },
      onContentChunk: (chunk: string) => {
        callbacksRef.current?.onContentChunk?.(chunk);
      },
      onIterationCountChange: (count: number) => {
        setIterationCount(count);
      },
      onTokenUsage: (usage) => {
        if (tokenUsageRef.current) {
          tokenUsageRef.current = {
            inputTokens: tokenUsageRef.current.inputTokens + usage.inputTokens,
            outputTokens: tokenUsageRef.current.outputTokens + usage.outputTokens,
          };
        } else {
          tokenUsageRef.current = {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
          };
        }
        setLastTokenUsage({
          inputTokens: tokenUsageRef.current.inputTokens,
          outputTokens: tokenUsageRef.current.outputTokens,
        });
        
        const firstModelConfigId = modelConfigs.length > 0 ? modelConfigs[0].id : undefined;
        const modelIdToUse = activeModelId || defaultConfig?.modelId || firstModelConfigId;
        
        console.log('[useAgentExecution] onTokenUsage called:', { 
          activeModelId, 
          defaultConfigModelId: defaultConfig?.modelId,
          firstModelConfigId,
          modelIdToUse,
          usage,
          cumulative: tokenUsageRef.current,
        });
        if (modelIdToUse) {
          const modelConfig = modelConfigs.find(m => m.id === modelIdToUse);
          const cost = calculateCost(usage.inputTokens, usage.outputTokens, modelConfig?.pricing);
          
          console.log('[useAgentExecution] Calling addTokenUsageRecord with modelId:', modelIdToUse, 'cost:', cost);
          addTokenUsageRecord({
            modelId: modelIdToUse,
            timestamp: Date.now(),
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            cost,
          });
          console.log('[useAgentExecution] addTokenUsageRecord called successfully');
        } else {
          console.warn('[useAgentExecution] No modelId available, skipping token usage record');
        }
      },
    });

    runtime.initialize();
    runtimeRef.current = runtime;
  }, []);

  useEffect(() => {
    if (!defaultConfig?.modelId) return;
    
    const newAgent: Agent = {
      ...DEFAULT_AGENT,
      id: currentAgentRef.current?.id || DEFAULT_AGENT.id,
      modelProvider: 'lmstudio',
      modelId: defaultConfig.modelId,
      apiUrl: defaultConfig.apiUrl || 'http://localhost:1234/v1/chat/completions',
      temperature: defaultConfig.temperature ?? 0.7,
    };
    
    console.log('[useAgentExecution] Updating agent with new config:', {
      modelId: defaultConfig.modelId,
      apiUrl: defaultConfig.apiUrl,
    });
    
    setCurrentAgent(newAgent);
    currentAgentRef.current = newAgent;
    
    if (isInitializedRef.current) {
      initializeRuntime(newAgent);
    }
  }, [defaultConfig?.modelId, defaultConfig?.apiUrl, defaultConfig?.temperature, initializeRuntime]);

  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    const defaultAgentWithSettings: Agent = {
      ...DEFAULT_AGENT,
      modelProvider: 'lmstudio',
      modelId: defaultConfig?.modelId || '',
      apiUrl: defaultConfig?.apiUrl || 'http://localhost:1234/v1/chat/completions',
      temperature: defaultConfig?.temperature ?? 0.7,
    };

    console.log('[useAgentExecution] Initializing with config:', {
      modelId: defaultConfig?.modelId,
      apiUrl: defaultConfig?.apiUrl,
    });

    setCurrentAgent(defaultAgentWithSettings);
    currentAgentRef.current = defaultAgentWithSettings;
    initializeRuntime(defaultAgentWithSettings);
  }, [initializeRuntime, defaultConfig?.modelId, defaultConfig?.apiUrl, defaultConfig?.temperature]);

  useEffect(() => {
    if (!currentAgent) return;
    
    const interval = setInterval(() => {
      const state = agentStateManager.getState(currentAgent.id);
      if (state) {
        setIterationCount(state.iterationCount);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [currentAgent]);

  const setAgent = useCallback((agent: Agent) => {
    setCurrentAgent(agent);
    currentAgentRef.current = agent;
    initializeRuntime(agent);
  }, [initializeRuntime]);

  const execute = useCallback(async (
    input: string,
    conversationHistory: ConversationMessage[],
    imageAttachments?: { data: string; name: string }[]
  ): Promise<string> => {
    if (!runtimeRef.current) {
      if (currentAgent) {
        initializeRuntime(currentAgent);
      } else {
        throw new Error('Agent not initialized.');
      }
    }

    lastQueryRef.current = input;
    setReasoningSteps([]);
    setToolCalls([]);
    setIterationCount(0);

    try {
      const result = await runtimeRef.current!.execute(input, conversationHistory, imageAttachments);
      return result;
    } catch (error) {
      setStatus('failed');
      throw error;
    }
  }, [currentAgent, initializeRuntime]);

  const approveToolCall = useCallback(() => {
    if (authResolveRef.current) {
      authResolveRef.current(true);
      authResolveRef.current = null;
    }
    setPendingAuthToolCall(null);
  }, []);

  const rejectToolCall = useCallback(() => {
    if (authResolveRef.current) {
      authResolveRef.current(false);
      authResolveRef.current = null;
    }
    setPendingAuthToolCall(null);
  }, []);

  const abort = useCallback(() => {
    runtimeRef.current?.abort();
    setStatus('failed');
  }, []);

  const reset = useCallback(() => {
    runtimeRef.current?.reset();
    setStatus('idle');
    setReasoningSteps([]);
    setToolCalls([]);
    setIterationCount(0);
    setPendingAuthToolCall(null);
  }, []);

  const toggleAgentMode = useCallback(() => {
    setIsAgentMode((prev) => !prev);
  }, []);

  const resetTokenUsage = useCallback(() => {
    tokenUsageRef.current = null;
    setLastTokenUsage(null);
  }, []);

  return {
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
    currentAgent,
    lastTokenUsage,
    resetTokenUsage,
    getTokenUsage: () => tokenUsageRef.current,
  };
}
