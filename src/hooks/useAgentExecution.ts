import { useState, useCallback, useRef, useEffect } from 'react';
import { Agent, SearchResult, TodoItem, TodoStep } from '../types';
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
  TaskPlan,
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
  currentTaskPlan: TaskPlan | null;
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
  refreshTools: () => Promise<void>;
}

interface DefaultAgentConfig {
  apiUrl: string;
  modelId: string;
  apiModelName: string;
  temperature: number;
  modelProvider?: string;
  onlineProvider?: string;
  apiKey?: string;
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
  onTaskPlanUpdate?: (plan: TaskPlan) => void;
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

export function taskPlanToTodoItems(plan: TaskPlan): TodoItem[] {
  return plan.steps.map((step) => {
    const todoStatus: TodoItem['status'] =
      step.status === 'completed' ? 'completed' :
      step.status === 'in_progress' ? 'working' :
      step.status === 'failed' ? 'failed' : 'pending';

    const totalSteps = plan.steps.length;
    const stepIndex = plan.steps.indexOf(step);

    let progress = 0;
    if (step.status === 'completed') {
      progress = 100;
    } else if (step.status === 'in_progress') {
      progress = 50;
    } else {
      const completedBefore = plan.steps.slice(0, stepIndex).filter(s => s.status === 'completed').length;
      progress = Math.round((completedBefore / totalSteps) * 100);
    }

    const steps: TodoStep[] = [];

    if (step.toolCalls && step.toolCalls.length > 0) {
      for (const tc of step.toolCalls) {
        steps.push({
          label: tc.summary || tc.toolName,
          status: tc.status === 'executing' ? 'working' :
                  tc.status === 'completed' ? 'completed' :
                  tc.status === 'failed' ? 'failed' : 'pending',
          result: tc.result || undefined,
          error: tc.error || undefined,
          observationData: tc.observationData || undefined,
          filePath: tc.filePath || undefined,
        });
      }
    }

    return {
      id: step.id,
      title: step.title,
      status: todoStatus,
      progress,
      description: step.description,
      steps: steps.length > 0 ? steps : undefined,
    };
  });
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
  const [currentTaskPlan, setCurrentTaskPlan] = useState<TaskPlan | null>(null);

  const runtimeRef = useRef<AgentRuntime | null>(null);
  const authResolveRef = useRef<((approved: boolean) => void) | null>(null);
  const isInitializedRef = useRef(false);
  const lastQueryRef = useRef<string>('');
  const callbacksRef = useRef(callbacks);
  const currentAgentRef = useRef<Agent | null>(null);
  const tokenUsageRef = useRef<TokenUsage | null>(null);
  const reasoningStepsRef = useRef<ReasoningStep[]>([]);
  const reasoningUpdateTimerRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const reasoningUpdatePendingRef = useRef(false);
  callbacksRef.current = callbacks;
  
  const activeModelIdRef = useRef(activeModelId);
  const defaultConfigRef = useRef(defaultConfig);
  const modelConfigsRef = useRef(modelConfigs);
  const addTokenUsageRecordRef = useRef(addTokenUsageRecord);
  
  activeModelIdRef.current = activeModelId;
  defaultConfigRef.current = defaultConfig;
  modelConfigsRef.current = modelConfigs;
  addTokenUsageRecordRef.current = addTokenUsageRecord;

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

  const scheduleReasoningUpdate = useCallback(() => {
    if (reasoningUpdatePendingRef.current) return;
    reasoningUpdatePendingRef.current = true;

    reasoningUpdateTimerRef.current = requestAnimationFrame(() => {
      reasoningUpdatePendingRef.current = false;
      reasoningUpdateTimerRef.current = null;
      setReasoningSteps([...reasoningStepsRef.current]);
    });
  }, []);

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
        reasoningStepsRef.current = [...reasoningStepsRef.current, step as ReasoningStep];
        scheduleReasoningUpdate();
      },
      onReasoningStepUpdate: (step) => {
        reasoningStepsRef.current =
          reasoningStepsRef.current.map(s => s.id === step.id ? step as ReasoningStep : s);
        scheduleReasoningUpdate();
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
        
        const currentModelConfigs = modelConfigsRef.current;
        const currentActiveModelId = activeModelIdRef.current;
        const currentDefaultConfig = defaultConfigRef.current;
        
        const firstModelConfigId = currentModelConfigs.length > 0 ? currentModelConfigs[0].id : undefined;
        const modelIdToUse = currentActiveModelId || currentDefaultConfig?.modelId || firstModelConfigId;
        
        if (modelIdToUse) {
          const modelConfig = currentModelConfigs.find(m => m.id === modelIdToUse);
          const cost = calculateCost(usage.inputTokens, usage.outputTokens, modelConfig?.pricing);
          
          addTokenUsageRecordRef.current({
            modelId: modelIdToUse,
            timestamp: Date.now(),
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            cost,
          });
        }
      },
      onTaskPlanUpdate: (plan: TaskPlan) => {
        setCurrentTaskPlan(plan);
        callbacksRef.current?.onTaskPlanUpdate?.(plan);
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
      modelProvider: defaultConfig.modelProvider || 'lmstudio',
      onlineProvider: defaultConfig.onlineProvider,
      modelId: defaultConfig.apiModelName || defaultConfig.modelId,
      apiUrl: defaultConfig.apiUrl || 'http://localhost:1234/v1/chat/completions',
      apiKey: defaultConfig.apiKey,
      temperature: defaultConfig.temperature ?? 0.7,
    };

    setCurrentAgent(newAgent);
    currentAgentRef.current = newAgent;

    if (isInitializedRef.current) {
      initializeRuntime(newAgent);
    }
  }, [defaultConfig?.modelId, defaultConfig?.apiUrl, defaultConfig?.temperature, defaultConfig?.modelProvider, defaultConfig?.onlineProvider, defaultConfig?.apiKey, defaultConfig?.apiModelName, initializeRuntime]);

  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    const defaultAgentWithSettings: Agent = {
      ...DEFAULT_AGENT,
      modelProvider: defaultConfig?.modelProvider || 'lmstudio',
      onlineProvider: defaultConfig?.onlineProvider,
      modelId: defaultConfig?.apiModelName || defaultConfig?.modelId || '',
      apiUrl: defaultConfig?.apiUrl || 'http://localhost:1234/v1/chat/completions',
      apiKey: defaultConfig?.apiKey,
      temperature: defaultConfig?.temperature ?? 0.7,
    };

    setCurrentAgent(defaultAgentWithSettings);
    currentAgentRef.current = defaultAgentWithSettings;
    initializeRuntime(defaultAgentWithSettings);
  }, [initializeRuntime, defaultConfig?.modelId, defaultConfig?.apiUrl, defaultConfig?.temperature, defaultConfig?.modelProvider, defaultConfig?.onlineProvider, defaultConfig?.apiKey, defaultConfig?.apiModelName]);

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
    reasoningStepsRef.current = [];
    setToolCalls([]);
    setIterationCount(0);
    setCurrentTaskPlan(null);

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
    reasoningStepsRef.current = [];
    setToolCalls([]);
    setIterationCount(0);
    setPendingAuthToolCall(null);
    setCurrentTaskPlan(null);
  }, []);

  const toggleAgentMode = useCallback(() => {
    setIsAgentMode((prev) => !prev);
  }, []);

  const resetTokenUsage = useCallback(() => {
    tokenUsageRef.current = null;
    setLastTokenUsage(null);
  }, []);

  const refreshTools = useCallback(async () => {
    if (runtimeRef.current) {
      await runtimeRef.current.refreshTools();
    }
  }, []);

  return {
    status,
    reasoningSteps,
    toolCalls,
    iterationCount,
    pendingAuthToolCall,
    isAgentMode,
    currentTaskPlan,
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
    refreshTools,
  };
}
