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
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [reasoningSteps, setReasoningSteps] = useState<ReasoningStep[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCallRecord[]>([]);
  const [iterationCount, setIterationCount] = useState(0);
  const [pendingAuthToolCall, setPendingAuthToolCall] = useState<ToolCallRecord | null>(null);
  const [isAgentMode, setIsAgentMode] = useState(true);
  const [currentAgent, setCurrentAgent] = useState<Agent | null>(null);

  const runtimeRef = useRef<AgentRuntime | null>(null);
  const authResolveRef = useRef<((approved: boolean) => void) | null>(null);
  const isInitializedRef = useRef(false);
  const lastQueryRef = useRef<string>('');
  const callbacksRef = useRef(callbacks);
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
    });

    runtime.initialize();
    runtimeRef.current = runtime;
  }, []);

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

    setCurrentAgent(defaultAgentWithSettings);
    initializeRuntime(defaultAgentWithSettings);
  }, [initializeRuntime, defaultConfig]);

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
  };
}
