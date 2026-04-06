import React, { createContext, useContext, useState, ReactNode, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useTokenStorage } from '../hooks/useTokenStorage';
import { Message, LogEntry, ChatSession, ChatFolder, Agent, TodoItem, SearchGroup, SearchResult, McpServer, ModelConfig, TokenUsageRecord } from '../types';
import { AGENTS as INITIAL_AGENTS } from '../data/agents';
import { generateMockConversation, generateClusterMockConversation } from '../utils/mockData';
import { checkModelHealth, HealthCheckResult } from '../services/modelHealthCheck';

interface GlobalState {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  logs: LogEntry[];
  setLogs: React.Dispatch<React.SetStateAction<LogEntry[]>>;
  currentTokenCount: number;
  setCurrentTokenCount: React.Dispatch<React.SetStateAction<number>>;
  isStreaming: boolean;
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;
  addLog: (message: string, type?: 'info' | 'error' | 'command') => void;
  simulateSmbCheck: () => void;
  simulateTest: () => void;
  simulateClusterTest: () => void;
  clearHistory: () => void;
  compressMessages: () => void;
  
  // Session Management
  sessions: ChatSession[];
  currentSessionId: string;
  createNewSession: () => void;
  createNewSessionWithAgent: (agentId: string) => void;
  switchSession: (id: string) => void;
  updateSessionTitle: (id: string, title: string) => void;
  updateSessionAgents: (id: string, agentIds: string[]) => void;
  deleteSession: (id: string) => void;
  batchDeleteSessions: (ids: string[]) => void;
  
  // Folder Management
  folders: ChatFolder[];
  createFolder: (name: string) => void;
  updateFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  toggleFolder: (id: string) => void;
  moveSessionToFolder: (sessionId: string, folderId?: string) => void;

  // Agent Management
  agents: Agent[];
  addAgent: (agent: Agent) => void;
  updateAgent: (id: string, agent: Partial<Agent>) => void;
  deleteAgent: (id: string) => void;
  
  // Presets
  systemPromptPresets: { id: string; name: string; content: string }[];
  addPreset: (name: string, content: string, id?: string) => void;
  updatePreset: (id: string, name: string, content: string) => void;
  deletePreset: (id: string) => void;
  
  // Derived State
  todos: TodoItem[];

  // Search Management
  searchGroups: SearchGroup[];
  setSearchGroups: React.Dispatch<React.SetStateAction<SearchGroup[]>>;
  searchResults: SearchResult[];
  setSearchResults: React.Dispatch<React.SetStateAction<SearchResult[]>>;
  deleteSearchGroup: (id: string) => void;
  batchDeleteSearchGroups: (ids: string[]) => void;

  // MCP State
  mcpServers: McpServer[];
  setMcpServers: React.Dispatch<React.SetStateAction<McpServer[]>>;

  // User Settings
  userName: string;
  setUserName: (name: string) => void;
  aiName: string;
  setAiName: (name: string) => void;
  userAvatar: string;
  setUserAvatar: (avatar: string) => void;
  aiAvatar: string;
  setAiAvatar: (avatar: string) => void;
  language: string;
  setLanguage: (lang: string) => void;
  fontFamily: string;
  setFontFamily: (font: string) => void;
  
  // Close Window Settings
  closeWindowAskEveryTime: boolean;
  setCloseWindowAskEveryTime: (value: boolean) => void;
  closeWindowAction: 'minimize' | 'close';
  setCloseWindowAction: (action: 'minimize' | 'close') => void;
  
  // Search Engine Settings
  searchEngine: string;
  setSearchEngine: (engine: string) => void;
  
  // Tavily Settings
  tavilyApiKey: string;
  setTavilyApiKey: (key: string) => void;
  tavilyEnabled: boolean;
  setTavilyEnabled: (enabled: boolean) => void;
  tavilySearchDepth: 'basic' | 'advanced';
  setTavilySearchDepth: (depth: 'basic' | 'advanced') => void;
  tavilyIncludeAnswer: boolean;
  setTavilyIncludeAnswer: (include: boolean) => void;
  
  // Model Configs
  modelConfigs: ModelConfig[];
  activeModelId: string | null;
  activeModel: ModelConfig | null;
  modelName: string;
  maxContextLength: number;
  addModelConfig: (config: ModelConfig) => void;
  updateModelConfig: (id: string, config: Partial<ModelConfig>) => void;
  deleteModelConfig: (id: string) => void;
  setActiveModel: (id: string | null) => void;
  reorderModelConfigs: (id: string, direction: 'up' | 'down') => void;
  
  // Model Settings
  temperature: number;
  setTemperature: (temp: number) => void;
  systemPrompt: string;
  setSystemPrompt: (prompt: string) => void;
  
  // Token Usage Records
  tokenUsageRecords: TokenUsageRecord[];
  isTokenStorageLoading: boolean;
  addTokenUsageRecord: (record: Omit<TokenUsageRecord, 'id'>) => void;
  getTokenUsageStats: (modelId?: string, timeRange?: 'day' | 'week' | 'month' | 'year') => { totalInputTokens: number; totalOutputTokens: number; totalCost: number };
  clearTokenUsageRecords: () => void;
  deleteRecordsByModelId: (modelId: string) => Promise<number>;
  updateRecordsModelId: (oldModelId: string, newModelId: string) => Promise<number>;
  sessionTokenUsage: { input: number; output: number };
  
  // Cost Currency Setting
  costCurrency: 'USD' | 'CNY';
  setCostCurrency: (currency: 'USD' | 'CNY') => void;
  
  // Model Health Check
  checkModelConnection: (modelId: string) => Promise<void>;
  startModelHealthCheck: () => void;
}

export const GlobalStateContext = createContext<GlobalState | undefined>(undefined);

export const useGlobalState = () => {
  const context = useContext(GlobalStateContext);
  if (!context) {
    throw new Error('useGlobalState must be used within a GlobalStateProvider');
  }
  return context;
};

const estimateTokens = (text: string) => Math.ceil(text.length * 0.5);

export const GlobalStateProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { i18n, t } = useTranslation();
  
  const createInitialSession = (title?: string): ChatSession => ({
    id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
    title: title || t?.session?.newChat || '新对话',
    messages: [],
    updatedAt: Date.now(),
  });
  
  const [sessions, setSessions] = useState<ChatSession[]>([createInitialSession()]);
  const [currentSessionId, setCurrentSessionId] = useState<string>(sessions[0].id);
  const [messages, setMessages] = useState<Message[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [currentTokenCount, setCurrentTokenCount] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [folders, setFolders] = useState<ChatFolder[]>([]);
  const [agents, setAgents] = useState<Agent[]>(INITIAL_AGENTS);
  const [searchGroups, setSearchGroups] = useState<SearchGroup[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  
  // MCP State
  const [mcpServers, setMcpServers] = useState<McpServer[]>([
    {
      id: 'google-search',
      name: 'mcp-server-google-search',
      status: 'connected',
      tools: [{ name: 'web_search', description: 'Search the web for current information', requiresAuth: false }]
    },
    {
      id: 'system-ops',
      name: 'mcp-server-system-ops',
      status: 'connected',
      tools: [{ name: 'modify_smb_config', description: 'Modify system SMB configuration', requiresAuth: true }]
    }
  ]);

  // User Settings State
  const [userName, setUserName] = useState<string>(() => localStorage.getItem('nexus_user_name') || 'Nexus User');
  const [aiName, setAiName] = useState<string>(() => localStorage.getItem('nexus_ai_name') || 'Nexus AI');
  const [userAvatar, setUserAvatar] = useState<string>(() => localStorage.getItem('nexus_user_avatar') || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix');
  const [aiAvatar, setAiAvatar] = useState<string>(() => localStorage.getItem('nexus_ai_avatar') || 'https://api.dicebear.com/7.x/bottts/svg?seed=Aneka');
  const [language, setLanguage] = useState<string>(() => localStorage.getItem('nexus_language') || 'zh');
  const [fontFamily, setFontFamily] = useState<string>(() => localStorage.getItem('nexus_font_family') || 'Inter');

  // Close Window Settings
  const [closeWindowAskEveryTime, setCloseWindowAskEveryTime] = useState<boolean>(() => {
    const stored = localStorage.getItem('nexus_close_window_ask_every_time');
    return stored === null ? true : stored === 'true';
  });
  const [closeWindowAction, setCloseWindowAction] = useState<'minimize' | 'close'>(() => {
    const stored = localStorage.getItem('nexus_close_window_action');
    return (stored === 'minimize' || stored === 'close') ? stored : 'minimize';
  });

  // Search Engine Settings
  const [searchEngine, setSearchEngine] = useState<string>(() => {
    return localStorage.getItem('nexus_search_engine') || 'auto';
  });

  // Tavily Settings
  const [tavilyApiKey, setTavilyApiKey] = useState<string>(() => {
    return localStorage.getItem('nexus_tavily_api_key') || '';
  });
  const [tavilyEnabled, setTavilyEnabled] = useState<boolean>(() => {
    const stored = localStorage.getItem('nexus_tavily_enabled');
    return stored === 'true';
  });
  const [tavilySearchDepth, setTavilySearchDepth] = useState<'basic' | 'advanced'>(() => {
    const stored = localStorage.getItem('nexus_tavily_search_depth');
    return (stored === 'basic' || stored === 'advanced') ? stored : 'basic';
  });
  const [tavilyIncludeAnswer, setTavilyIncludeAnswer] = useState<boolean>(() => {
    const stored = localStorage.getItem('nexus_tavily_include_answer');
    return stored === 'true';
  });

  // Model Configs
  const [modelConfigs, setModelConfigs] = useState<ModelConfig[]>(() => {
    const stored = localStorage.getItem('nexus_model_configs');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return [];
      }
    }
    return [];
  });
  const [activeModelId, setActiveModelId] = useState<string | null>(() => {
    return localStorage.getItem('nexus_active_model_id') || null;
  });

  // Model Settings
  const [temperature, setTemperature] = useState<number>(() => {
    const stored = localStorage.getItem('nexus_temperature');
    return stored ? parseFloat(stored) : 0.7;
  });
  
  const [systemPrompt, setSystemPrompt] = useState<string>(() => {
    return localStorage.getItem('nexus_system_prompt') || '你是一个专业、简洁的 AI 助手。';
  });

  // Derived model state
  const activeModel = useMemo(() => {
    return modelConfigs.find(m => m.id === activeModelId) || null;
  }, [modelConfigs, activeModelId]);
  
  const modelName = activeModel?.name || '';
  const maxContextLength = activeModel?.maxContextLength || 4096;

  const {
    records: tokenUsageRecords,
    isLoading: isTokenStorageLoading,
    addRecord: addTokenUsageRecord,
    getStats: getTokenUsageStats,
    clearRecords: clearTokenUsageRecords,
    deleteRecordsByModelId,
    updateRecordsModelId,
  } = useTokenStorage(modelConfigs);

  const sessionTokenUsage = useMemo(() => {
    let input = 0;
    let output = 0;
    
    messages.forEach(msg => {
      if (msg.tokenCount) {
        if (msg.role === 'user') {
          input += msg.tokenCount;
        } else if (msg.role === 'assistant') {
          output += msg.tokenCount;
        }
      }
    });
    
    return { input, output };
  }, [messages]);

  // Cost Currency Setting
  const [costCurrency, setCostCurrency] = useState<'USD' | 'CNY'>(() => {
    const stored = localStorage.getItem('nexus_cost_currency');
    return (stored === 'USD' || stored === 'CNY') ? stored : 'USD';
  });

  const addModelConfig = (config: ModelConfig) => {
    setModelConfigs(prev => {
      const newConfigs = [...prev, { ...config, priority: prev.length + 1 }];
      return newConfigs;
    });
  };

  const updateModelConfig = (id: string, config: Partial<ModelConfig>) => {
    const oldConfig = modelConfigs.find(c => c.id === id);
    setModelConfigs(prev => prev.map(c => c.id === id ? { ...c, ...config } : c));
    
    if (oldConfig && config.id && config.id !== id) {
      updateRecordsModelId(id, config.id);
    }
  };

  const deleteModelConfig = (id: string) => {
    setModelConfigs(prev => {
      const filtered = prev.filter(c => c.id !== id);
      return filtered.map((c, index) => ({ ...c, priority: index + 1 }));
    });
    if (activeModelId === id) {
      setActiveModelId(null);
    }
    deleteRecordsByModelId(id);
  };

  const setActiveModel = (id: string | null) => {
    setActiveModelId(id);
  };

  const reorderModelConfigs = (id: string, direction: 'up' | 'down') => {
    setModelConfigs(prev => {
      const index = prev.findIndex(c => c.id === id);
      if (index === -1) return prev;
      if (direction === 'up' && index === 0) return prev;
      if (direction === 'down' && index === prev.length - 1) return prev;
      
      const newConfigs = [...prev];
      const swapIndex = direction === 'up' ? index - 1 : index + 1;
      [newConfigs[index], newConfigs[swapIndex]] = [newConfigs[swapIndex], newConfigs[index]];
      return newConfigs.map((c, i) => ({ ...c, priority: i + 1 }));
    });
  };

  // Model Health Check
  const [, setHealthCheckResults] = useState<Map<string, HealthCheckResult>>(new Map());
  const modelConfigsRef = useRef(modelConfigs);
  modelConfigsRef.current = modelConfigs;

  const checkModelConnection = useCallback(async (modelId: string) => {
    const config = modelConfigsRef.current.find(m => m.id === modelId);
    if (!config) return;
    
    const result = await checkModelHealth(config);
    
    updateModelConfig(modelId, {
      status: result.status,
      lastConnected: result.status === 'active' ? Date.now() : undefined,
    });
    
    setHealthCheckResults(prev => {
      const newResults = new Map(prev);
      newResults.set(modelId, result);
      return newResults;
    });
  }, [updateModelConfig]);

  const startModelHealthCheck = useCallback(() => {
    const runHealthCheck = async () => {
      for (const config of modelConfigsRef.current) {
        if (config.status !== 'inactive') {
          await checkModelConnection(config.id);
        }
      }
    };
    
    runHealthCheck();
  }, [checkModelConnection]);

  // Persist User Settings
  useEffect(() => { localStorage.setItem('nexus_user_name', userName); }, [userName]);
  useEffect(() => { localStorage.setItem('nexus_ai_name', aiName); }, [aiName]);
  useEffect(() => { localStorage.setItem('nexus_user_avatar', userAvatar); }, [userAvatar]);
  useEffect(() => { localStorage.setItem('nexus_ai_avatar', aiAvatar); }, [aiAvatar]);
  useEffect(() => { localStorage.setItem('nexus_language', language); }, [language]);
  useEffect(() => { localStorage.setItem('nexus_font_family', fontFamily); }, [fontFamily]);
  useEffect(() => { localStorage.setItem('nexus_close_window_ask_every_time', String(closeWindowAskEveryTime)); }, [closeWindowAskEveryTime]);
  useEffect(() => { localStorage.setItem('nexus_close_window_action', closeWindowAction); }, [closeWindowAction]);
  useEffect(() => { localStorage.setItem('nexus_search_engine', searchEngine); }, [searchEngine]);
  useEffect(() => { localStorage.setItem('nexus_tavily_api_key', tavilyApiKey); }, [tavilyApiKey]);
  useEffect(() => { localStorage.setItem('nexus_tavily_enabled', String(tavilyEnabled)); }, [tavilyEnabled]);
  useEffect(() => { localStorage.setItem('nexus_tavily_search_depth', tavilySearchDepth); }, [tavilySearchDepth]);
  useEffect(() => { localStorage.setItem('nexus_tavily_include_answer', String(tavilyIncludeAnswer)); }, [tavilyIncludeAnswer]);

  // Persist Model Configs
  useEffect(() => { localStorage.setItem('nexus_model_configs', JSON.stringify(modelConfigs)); }, [modelConfigs]);
  useEffect(() => { 
    if (activeModelId) {
      localStorage.setItem('nexus_active_model_id', activeModelId);
    } else {
      localStorage.removeItem('nexus_active_model_id');
    }
  }, [activeModelId]);

  // Persist Model Settings
  useEffect(() => { localStorage.setItem('nexus_temperature', temperature.toString()); }, [temperature]);
  useEffect(() => { localStorage.setItem('nexus_system_prompt', systemPrompt); }, [systemPrompt]);

  // Persist Cost Currency
  useEffect(() => { localStorage.setItem('nexus_cost_currency', costCurrency); }, [costCurrency]);

  // Sync i18next with global state language
  useEffect(() => {
    if (language) {
      i18n.changeLanguage(language);
    }
  }, [language, i18n]);

  const [systemPromptPresets, setSystemPromptPresets] = useState<{ id: string; name: string; content: string }[]>([
    { id: '1', name: t?.presets?.defaultAssistant || '默认助手', content: t?.systemPrompts?.defaultAssistant || '你是一个专业、简洁的 AI 助手。' },
    { id: '2', name: t?.presets?.codeExpert || '代码专家', content: t?.systemPrompts?.codeExpert || '你是一个精通全栈开发的专家。在回答时，请优先提供高质量、可运行的代码示例，并详细解释核心逻辑。' },
    { id: '3', name: t?.presets?.creativeWriter || '创意写作', content: t?.systemPrompts?.creativeWriter || '你是一个富有想象力的作家。请使用生动、优美的语言进行创作，注重情感表达和细节描写。' }
  ]);

  const todos = messages.flatMap(m => m.todos || []);

  useEffect(() => {
    setSessions(prev => prev.map(session => {
      if (session.id === currentSessionId) {
        let newTitle = session.title;
        if (session.title === (t?.session?.newChat || '新对话') && messages.length > 0 && messages[0].role === 'user') {
          newTitle = messages[0].content.slice(0, 15) + (messages[0].content.length > 15 ? '...' : '');
        }
        return { ...session, messages, updatedAt: Date.now(), title: newTitle };
      }
      return session;
    }));
  }, [messages, currentSessionId, t?.session?.newChat]);

  // Sync current session messages to state when switching sessions
  useEffect(() => {
    const currentSession = sessions.find(s => s.id === currentSessionId);
    if (currentSession) {
      setMessages(currentSession.messages);
    }
  }, [currentSessionId]);

  useEffect(() => {
    if (!isStreaming) {
      const count = messages.reduce((acc, msg) => acc + estimateTokens(msg.content), 0);
      setCurrentTokenCount(count);
    }
  }, [messages, isStreaming]);

  const addLog = (message: string, type: 'info' | 'error' | 'command' = 'info') => {
    setLogs(prev => [...prev, { 
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9), 
      timestamp: Date.now(), 
      message, 
      type 
    }]);
  };

  const clearHistory = () => {
    setMessages([]);
    setCurrentTokenCount(0);
    addLog(t?.context?.manuallyCleared || '上下文已手动清除', 'info');
  };

  const compressMessages = () => {
    if (messages.length === 0) return;
    
    const beforeTokens = messages.reduce((acc, msg) => acc + estimateTokens(msg.content), 0);
    addLog((t?.context?.compressing || '正在执行手动上下文压缩... (压缩前: {tokens} tokens)').replace('{tokens}', String(beforeTokens)), 'info');
    
    let compressedCount = 0;

    let newMessages = messages.map((msg, index) => {
      if (index === messages.length - 1) return msg;
      
      let newContent = msg.content;
      let isModified = false;

      if (newContent.includes('```')) {
        const originalLength = newContent.length;
        newContent = newContent.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
          const lines = code.split('\n').length;
          if (lines > 15) {
            return `\`\`\`${lang}\n/* [${(t?.context?.codeBlockCollapsedManual || '代码块已手动折叠: {lines}行代码').replace('{lines}', String(lines))}] */\n\`\`\``;
          }
          return match;
        });
        if (newContent.length < originalLength) isModified = true;
      }

      if (newContent.length > 1500) {
        newContent = newContent.substring(0, 500) + 
          `\n\n> ***${t?.context?.middleTruncated || '[...中间部分内容过长，已手动截断以释放上下文...]'}***\n\n` + 
          newContent.substring(newContent.length - 500);
        isModified = true;
      }

      if (isModified) compressedCount++;

      return {
        ...msg,
        content: newContent
      };
    });

    if (newMessages.length > 4) {
      const head = newMessages[0];
      const tail = newMessages.slice(-2);
      newMessages = [
        head,
        { 
          id: 'system-compressed-' + Date.now() + Math.random().toString(36).substring(2, 9), 
          role: 'assistant', 
          content: `> ***${t?.context?.historyCompressedManual || '[系统提示: 中间历史对话已手动压缩释放以节省显存]'}***`, 
          timestamp: Date.now() 
        },
        ...tail
      ];
      compressedCount++;
    }

    if (compressedCount > 0) {
      setMessages(newMessages);
      const afterTokens = newMessages.reduce((acc, msg) => acc + estimateTokens(msg.content), 0);
      addLog((t?.context?.compressionComplete || '上下文压缩完成 (处理了 {count} 处内容)，压缩后: {after} tokens，释放了 {released} tokens').replace('{count}', String(compressedCount)).replace('{after}', String(afterTokens)).replace('{released}', String(beforeTokens - afterTokens)), 'info');
    } else {
      addLog(t?.context?.noCompressionNeeded || '当前上下文已是最佳状态，无需压缩', 'info');
    }
  };

  const createNewSession = () => {
    const newSession = createInitialSession();
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setMessages([]);
  };

  const createNewSessionWithAgent = (agentId: string) => {
    let folderId = folders.find(f => f.name === (t?.session?.agentCluster || 'Agent 集群'))?.id;
    if (!folderId) {
      folderId = Date.now().toString() + Math.random().toString(36).substring(2, 9) + '-folder';
      setFolders(prev => [{ id: folderId!, name: t?.session?.agentCluster || 'Agent 集群', isExpanded: true }, ...prev]);
    }

    const agent = agents.find(a => a.id === agentId);
    const title = agent ? (t?.session?.chatWithAgent || '与 {name} 对话').replace('{name}', agent.name) : (t?.session?.chatWithAnyAgent || '与 Agent 对话');

    const newSession: ChatSession = {
      ...createInitialSession(),
      title,
      activeAgents: [agentId],
      folderId
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setMessages([]);
  };

  const switchSession = (id: string) => {
    if (id !== currentSessionId) {
      setCurrentSessionId(id);
    }
  };

  const updateSessionTitle = (id: string, title: string) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, title } : s));
  };

  const updateSessionAgents = (id: string, agentIds: string[]) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, activeAgents: agentIds } : s));
  };

  const deleteSession = (id: string) => {
    setSessions(prev => {
      const newSessions = prev.filter(s => s.id !== id);
      if (newSessions.length === 0) {
        const newSession = createInitialSession();
        setCurrentSessionId(newSession.id);
        return [newSession];
      }
      if (id === currentSessionId) {
        setCurrentSessionId(newSessions[0].id);
      }
      return newSessions;
    });
    // Clean up associated search groups
    setSearchGroups(prev => prev.filter(g => g.sessionId !== id));
  };

  const batchDeleteSessions = (ids: string[]) => {
    setSessions(prev => {
      const newSessions = prev.filter(s => !ids.includes(s.id));
      if (newSessions.length === 0) {
        const newSession = createInitialSession();
        setCurrentSessionId(newSession.id);
        return [newSession];
      }
      if (ids.includes(currentSessionId)) {
        setCurrentSessionId(newSessions[0].id);
      }
      return newSessions;
    });
    // Clean up associated search groups
    setSearchGroups(prev => prev.filter(g => !g.sessionId || !ids.includes(g.sessionId)));
  };

  const deleteSearchGroup = (id: string) => {
    setSearchGroups(prev => prev.filter(g => g.id !== id));
  };

  const batchDeleteSearchGroups = (ids: string[]) => {
    setSearchGroups(prev => prev.filter(g => !ids.includes(g.id)));
  };

  const createFolder = (name: string) => {
    setFolders(prev => [{ id: Date.now().toString() + Math.random().toString(36).substring(2, 9), name, isExpanded: true }, ...prev]);
  };

  const updateFolder = (id: string, name: string) => {
    setFolders(prev => prev.map(f => f.id === id ? { ...f, name } : f));
  };

  const deleteFolder = (id: string) => {
    setFolders(prev => prev.filter(f => f.id !== id));
    setSessions(prev => prev.map(s => s.folderId === id ? { ...s, folderId: undefined } : s));
  };

  const toggleFolder = (id: string) => {
    setFolders(prev => prev.map(f => f.id === id ? { ...f, isExpanded: !f.isExpanded } : f));
  };

  const moveSessionToFolder = (sessionId: string, folderId?: string) => {
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, folderId } : s));
  };

  const addAgent = (agent: Agent) => {
    setAgents(prev => [...prev, agent]);
  };

  const updateAgent = (id: string, agent: Partial<Agent>) => {
    setAgents(prev => prev.map(a => a.id === id ? { ...a, ...agent } : a));
  };

  const deleteAgent = (id: string) => {
    setAgents(prev => prev.filter(a => a.id !== id));
  };

  const addPreset = (name: string, content: string, id?: string) => {
    setSystemPromptPresets(prev => [...prev, { id: id || (Date.now().toString() + Math.random().toString(36).substring(2, 9)), name, content }]);
  };

  const updatePreset = (id: string, name: string, content: string) => {
    setSystemPromptPresets(prev => prev.map(p => p.id === id ? { ...p, name, content } : p));
  };

  const deletePreset = (id: string) => {
    setSystemPromptPresets(prev => prev.filter(p => p.id !== id));
  };

  const simulateSmbCheck = () => {
    const userMsg: Message = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      role: 'user',
      content: '/check-smb',
      timestamp: Date.now(),
      mode: 'command'
    };
    
    setMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);
    addLog((t?.logs?.commandExecuted || '执行命令: {command}').replace('{command}', '/check-smb'), 'command');

    setTimeout(() => {
      addLog(t?.logs?.callingSystemInterface || '正在调用系统接口...', 'info');
      setCurrentTokenCount(prev => prev + 15);
    }, 800);

    setTimeout(() => {
      addLog(t?.logs?.portNotResponding || '发现 445 端口未响应', 'error');
      setCurrentTokenCount(prev => prev + 20);
    }, 2000);

    setTimeout(() => {
      addLog(t?.logs?.generatingFixSuggestions || '正在生成修复建议...', 'info');
      setCurrentTokenCount(prev => prev + 35);
    }, 3500);

    setTimeout(() => {
      const aiMsg: Message = {
        id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
        role: 'assistant',
        content: 'SMB_REPAIR_CARD',
        timestamp: Date.now(),
        mode: 'command'
      };
      setMessages(prev => [...prev, aiMsg]);
      setIsStreaming(false);
      addLog(t?.logs?.fixSuggestionsGenerated || '修复建议已生成', 'info');
    }, 5000);
  };

  const simulateTest = () => {
    const now = Date.now();
    const mockMessages: Message[] = [
      {
        id: 'm1',
        role: 'user',
        content: t?.mockData?.analyzeDependencies || '帮我分析一下这个项目的依赖，并尝试升级过时的包。',
        timestamp: now - 60000,
        mode: 'chat'
      },
      {
        id: 'm2',
        role: 'assistant',
        content: t?.mockData?.scanningProject || '好的，我正在扫描项目目录并检查 package.json。我已经识别出几个可以升级的依赖项。',
        timestamp: now - 50000,
        mode: 'chat',
        thinking: t?.mockData?.thinkingUpgrade || '用户想要升级依赖。我需要：\n1. 读取 package.json\n2. 运行 npm outdated\n3. 逐个分析风险并升级',
        todos: [
          {
            id: 's-todo-1',
            title: t?.mockData?.dependencyScanTitle || '依赖项扫描与风险评估',
            status: 'completed',
            progress: 100,
            description: t?.mockData?.dependencyScanDesc || '已完成对 node_modules 的全量扫描，发现 5 个主要版本过时。',
            steps: [
              { label: t?.mockData?.readPackageJson || '读取 package.json', status: 'completed' },
              { label: t?.mockData?.runDependencyAudit || '运行依赖审计', status: 'completed' }
            ]
          },
          {
            id: 's-todo-2',
            title: t?.mockData?.versionUpgradeTitle || '执行版本升级',
            status: 'working',
            progress: 40,
            description: t?.mockData?.versionUpgradeDesc || '正在尝试将 vite 从 v4 升级到 v5，并处理潜在的配置冲突。',
            steps: [
              { label: t?.mockData?.backupConfig || '备份配置文件', status: 'completed' },
              { label: t?.mockData?.installVite || '执行 npm install vite@latest', status: 'working' },
              { label: t?.mockData?.verifyBuild || '验证构建流程', status: 'pending' }
            ]
          }
        ]
      }
    ];
    setMessages(mockMessages);
    addLog(t?.logs?.unitTestDataLoaded || '已加载单体测试模拟数据', 'info');
  };

  const simulateClusterTest = () => {
    const now = Date.now();
    const folderId = now.toString() + '-cluster-folder';
    const newFolder: ChatFolder = {
      id: folderId,
      name: (t?.session?.clusterTask || '集群任务：{name}').replace('{name}', t?.mockData?.systemRefactoring || '系统重构'),
      isExpanded: true,
      isClusterTask: true
    };
    
    setFolders(prev => [newFolder, ...prev]);

    const architectSessionId = Date.now().toString() + Math.random().toString(36).substring(2, 9) + '-arch';
    const uiSessionId = Date.now().toString() + Math.random().toString(36).substring(2, 9) + '-ui';
    const secSessionId = Date.now().toString() + Math.random().toString(36).substring(2, 9) + '-sec';

    const architectSession: ChatSession = {
      id: architectSessionId,
      title: (t?.session?.architectPlanning || '系统架构规划 ({name})').replace('{name}', 'Nexus Architect'),
      messages: [
        {
          id: 'c-msg-1',
          role: 'user',
          content: t?.mockData?.blogRequest || '我想开发一个带深色模式的个人博客前端页面，需要用到 React 和 Tailwind CSS。请帮我规划并实现。',
          timestamp: now - 120000,
          mode: 'chat'
        },
        {
          id: 'c-msg-2',
          role: 'assistant',
          agentId: 'nexus-architect',
          content: t?.mockData?.blogResponse || '我已经为你规划了个人博客的整体架构，并启动了子任务。我们将采用 React + Vite + Tailwind CSS 的技术栈。',
          timestamp: now - 110000,
          mode: 'chat',
          todos: [
            {
              id: 'todo-1',
              title: t?.mockData?.basicArchitectureTitle || '基础架构搭建与配置',
              status: 'completed',
              progress: 100,
              description: t?.mockData?.basicArchitectureDesc || '初始化 Vite 项目并配置 Tailwind CSS 环境变量。',
              steps: [
                { label: t?.mockData?.initVite || '初始化 Vite 项目', status: 'completed' },
                { label: t?.mockData?.installTailwind || '安装 Tailwind CSS', status: 'completed' },
                { label: t?.mockData?.configTailwind || '配置 tailwind.config.js', status: 'completed' }
              ]
            },
            {
              id: 'todo-2',
              title: t?.mockData?.uiDevelopmentTitle || '前端 UI 组件开发',
              status: 'working',
              progress: 65,
              description: t?.mockData?.uiDevelopmentDesc || '正在由 @ui-weaver 实现响应式布局和深色模式切换。',
              targetSessionId: uiSessionId,
              steps: [
                { label: t?.mockData?.designDarkMode || '设计深色模式配色方案', status: 'completed' },
                { label: t?.mockData?.implementHeader || '实现 Header 组件', status: 'completed' },
                { label: t?.mockData?.implementArticleList || '实现文章列表组件', status: 'working' },
                { label: t?.mockData?.responsiveAdaptation || '响应式适配', status: 'pending' }
              ]
            },
            {
              id: 'todo-3',
              title: t?.mockData?.securityReviewTitle || '安全合规性审查',
              status: 'pending',
              progress: 0,
              description: t?.mockData?.securityReviewDesc || '待 UI 开发完成后由 @sec-guard 进行代码审计。',
              targetSessionId: secSessionId
            }
          ]
        }
      ],
      updatedAt: Date.now(),
      folderId,
      activeAgents: ['nexus-architect', 'ui-weaver', 'sec-guard']
    };

    const uiSession: ChatSession = {
      id: uiSessionId,
      title: (t?.session?.uiImplementation || '前端组件实现 ({name})').replace('{name}', 'UI Weaver'),
      messages: generateClusterMockConversation('ui'),
      updatedAt: Date.now() - 1000,
      folderId,
      activeAgents: ['ui-weaver']
    };

    const secSession: ChatSession = {
      id: secSessionId,
      title: (t?.session?.securityReview || '安全合规审查 ({name})').replace('{name}', 'Security Guard'),
      messages: generateClusterMockConversation('security'),
      updatedAt: Date.now() - 2000,
      folderId,
      activeAgents: ['sec-guard']
    };

    setSessions(prev => [architectSession, uiSession, secSession, ...prev]);
    setCurrentSessionId(architectSession.id);
    setMessages(architectSession.messages);
    setIsStreaming(true);
    
    addLog(t?.logs?.clusterTestDataLoaded || '已加载集群测试模拟数据，并创建任务文件夹', 'info');
  };

  return (
    <GlobalStateContext.Provider value={{
      messages, setMessages,
      logs, setLogs,
      currentTokenCount, setCurrentTokenCount,
      isStreaming, setIsStreaming,
      addLog, simulateSmbCheck, simulateTest, simulateClusterTest, clearHistory, compressMessages,
      sessions, currentSessionId, createNewSession, createNewSessionWithAgent, switchSession, updateSessionTitle, updateSessionAgents, deleteSession, batchDeleteSessions,
      folders, createFolder, updateFolder, deleteFolder, toggleFolder, moveSessionToFolder,
      agents, addAgent, updateAgent, deleteAgent,
      systemPromptPresets, addPreset, updatePreset, deletePreset,
      todos,
      searchGroups, setSearchGroups,
      searchResults, setSearchResults,
      deleteSearchGroup, batchDeleteSearchGroups,
      mcpServers, setMcpServers,
      userName, setUserName,
      aiName, setAiName,
      userAvatar, setUserAvatar,
      aiAvatar, setAiAvatar,
      language, setLanguage,
      fontFamily, setFontFamily,
      closeWindowAskEveryTime, setCloseWindowAskEveryTime,
      closeWindowAction, setCloseWindowAction,
      searchEngine, setSearchEngine,
      tavilyApiKey, setTavilyApiKey,
      tavilyEnabled, setTavilyEnabled,
      tavilySearchDepth, setTavilySearchDepth,
      tavilyIncludeAnswer, setTavilyIncludeAnswer,
      modelConfigs,
      activeModelId,
      activeModel,
      modelName,
      maxContextLength,
      addModelConfig,
      updateModelConfig,
      deleteModelConfig,
      setActiveModel,
      reorderModelConfigs,
      temperature,
      setTemperature,
      systemPrompt,
      setSystemPrompt,
      tokenUsageRecords,
      isTokenStorageLoading,
      addTokenUsageRecord,
      getTokenUsageStats,
      clearTokenUsageRecords,
      deleteRecordsByModelId,
      updateRecordsModelId,
      sessionTokenUsage,
      costCurrency,
      setCostCurrency,
      checkModelConnection,
      startModelHealthCheck
    }}>
      {children}
    </GlobalStateContext.Provider>
  );
};
