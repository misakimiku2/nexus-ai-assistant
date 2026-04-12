import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Plus, Command, Bot } from 'lucide-react';
import { cn } from './lib/utils';
import { Message, SearchResult, AppMode, McpServer, McpServerConfig, PendingAction, TabType, SearchGroup, ModelProvider, Attachment, MessageRole } from './types';
import { McpService } from './agent/mcp/McpService';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { ChatView } from './components/ChatView';
import { ChatInput } from './components/ChatInput';
import { SearchView } from './components/SearchView';
import { TerminalView } from './components/TerminalView';
import { SettingsView } from './components/SettingsView';
import { McpControlCenter } from './components/McpControlCenter';
import { AgentClusterView } from './components/AgentClusterView';
import { ToolPanel } from './components/ToolPanel';
import { AddMcpModal } from './components/AddMcpModal';
import { CanvasWorkspace } from './components/CanvasWorkspace';
import { CloseConfirmModal } from './components/CloseConfirmModal';
import { WindowControls } from './components/WindowControls';
import { ToolAuthModal } from './components/AgentExecutionView';
import { useGlobalState } from './context/GlobalStateContext';
import { useAgentExecution, taskPlanToTodoItems } from './hooks/useAgentExecution';
import { motion, AnimatePresence } from 'motion/react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from './hooks/useTranslation';
import { ConversationMessage, ReasoningStep, ToolCallRecord, AgentStatus, ContentPart, TaskPlan } from './agent/types';
import { DEFAULT_AGENT } from './data/agents';
import { ONLINE_PROVIDERS } from './config/aggregatorProviders';
import { supportsVision, getVisionUnsupportedMessage } from './config/visionModels';

export default function App() {
  const { t, i18n } = useTranslation();
  const { 
    messages, setMessages, 
    logs, setLogs, 
    currentTokenCount, 
    isStreaming, setIsStreaming,
    addLog,
    createNewSessionWithAgent,
    ensureCurrentSession,
    currentSessionId,
    sessions,
    agents,
    searchGroups,
    setSearchGroups,
    setSearchResults,
    updateSessionTitle,
    fontFamily,
    mcpServers,
    setMcpServers,
    closeWindowAskEveryTime,
    setCloseWindowAskEveryTime,
    closeWindowAction,
    setCloseWindowAction,
    activeModel,
    activeModelId,
    modelConfigs,
    startModelHealthCheck,
    generatingTitleSessionId,
    setGeneratingTitleSessionId,
  } = useGlobalState();

  const [isDarkMode, setIsDarkMode] = useState(() => 
    typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)').matches : true
  );
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [input, setInput] = useState('');
  const [isToolPanelOpen, setIsToolPanelOpen] = useState(true);
  const [appMode, setAppMode] = useState<AppMode>('chat');
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  // Resizing State
  const [commandChatWidth, setCommandChatWidth] = useState(350);
  const [isResizing, setIsResizing] = useState(false);
  const isResizingRef = useRef(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = React.useCallback((e: MouseEvent) => {
    if (!isResizingRef.current || !chatContainerRef.current) return;
    const rect = chatContainerRef.current.getBoundingClientRect();
    const newWidth = e.clientX - rect.left;
    setCommandChatWidth(Math.min(Math.max(newWidth, 350), 580));
  }, []);

  const handleMouseUp = React.useCallback(() => {
    isResizingRef.current = false;
    setIsResizing(false);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = '';
  }, [handleMouseMove]);

  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    setIsResizing(true);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
  };

  // Settings State
  const [lmStudioUrl, setLmStudioUrl] = useState('http://localhost:1234/v1/chat/completions');
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434/api/chat');
  const [modelName, setModelName] = useState('local-model');
  const [systemPrompt, setSystemPrompt] = useState(t?.systemPrompts?.defaultAssistant || '你是一个专业、简洁的 AI 助手。');
  const [temperature, setTemperature] = useState(0.7);
  const [maxContextLength, setMaxContextLength] = useState(4096);
  const [modelProvider, setModelProvider] = useState<ModelProvider>('lm-studio');

  // MCP State
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  // Add MCP Modal State
  const [isAddMcpModalOpen, setIsAddMcpModalOpen] = useState(false);
  const [isMcpConnecting, setIsMcpConnecting] = useState(false);
  const [newMcpName, setNewMcpName] = useState('');
  const [newMcpCommand, setNewMcpCommand] = useState('');
  const [newMcpArgs, setNewMcpArgs] = useState('');
  const [envVars, setEnvVars] = useState<{ key: string; value: string }[]>([]);
  const [toolTimeout, setToolTimeout] = useState(60);
  const [connectTimeout, setConnectTimeout] = useState(30);
  const [editingServerId, setEditingServerId] = useState<string | null>(null);
  const [mcpAddError, setMcpAddError] = useState<string | null>(null);

  // Close Confirm Modal State
  const [isCloseConfirmModalOpen, setIsCloseConfirmModalOpen] = useState(false);

  // Agent Execution State
  const [currentExecutionMessageId, setCurrentExecutionMessageId] = useState<string | null>(null);
  const [scrollResetKey, setScrollResetKey] = useState(0);
  
  // Use ref to store currentExecutionMessageId to avoid callback recreation
  const currentExecutionMessageIdRef = useRef<string | null>(null);
  currentExecutionMessageIdRef.current = currentExecutionMessageId;
  
  // Streaming content buffer for smooth updates
  const streamingContentRef = useRef<string>('');
  const streamingUpdateScheduledRef = useRef<boolean>(false);
  
  const handleWebSearchResult = useCallback((query: string, results: SearchResult[]) => {
    const newGroup: SearchGroup = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      query: query,
      results: results,
      timestamp: Date.now(),
      sessionId: currentSessionId
    };
    setSearchGroups(prev => [newGroup, ...prev]);
    addLog(`Agent 网络搜索完成: ${results.length} 个结果`, 'info');
  }, [currentSessionId, setSearchGroups, addLog]);

  const handleExecutionUpdate = useCallback((data: {
    reasoningSteps: ReasoningStep[];
    toolCalls: ToolCallRecord[];
    iterationCount: number;
    status: AgentStatus;
  }) => {
    const messageId = currentExecutionMessageIdRef.current;
    if (messageId) {
      if (data.reasoningSteps.length > 0 || data.status === 'responding') {
        setIsWaitingForResponse(false);
      }
      setMessages(prev => prev.map(m => {
        if (m.id === messageId) {
          const existingSteps = m.agentExecution?.reasoningSteps || [];
          return {
            ...m,
            agentExecution: {
              reasoningSteps: data.reasoningSteps.length > existingSteps.length 
                ? data.reasoningSteps 
                : existingSteps,
              toolCalls: data.toolCalls,
              iterationCount: data.iterationCount,
              status: data.status,
            }
          };
        }
        return m;
      }));
    }
  }, [setMessages]);

  const handleTaskPlanUpdate = useCallback((plan: TaskPlan) => {
    const messageId = currentExecutionMessageIdRef.current;
    if (!messageId) return;

    const todoItems = taskPlanToTodoItems(plan);

    setMessages(prev => prev.map(m => {
      if (m.id === messageId) {
        return {
          ...m,
          todos: todoItems,
        };
      }
      return m;
    }));
  }, [setMessages]);

  const handleContentChunk = useCallback((chunk: string) => {
    const messageId = currentExecutionMessageIdRef.current;
    if (!messageId) return;
    
    streamingContentRef.current += chunk;
    
    if (!streamingUpdateScheduledRef.current) {
      streamingUpdateScheduledRef.current = true;
      requestAnimationFrame(() => {
        const content = streamingContentRef.current;
        const msgId = currentExecutionMessageIdRef.current;
        streamingContentRef.current = '';
        streamingUpdateScheduledRef.current = false;
        
        if (!msgId) return;
        
        setMessages(prev => prev.map(m => {
          if (m.id === msgId) {
            return {
              ...m,
              content: m.content + content,
            };
          }
          return m;
        }));
      });
    }
  }, [setMessages]);

  const agentExecution = useAgentExecution(
    useMemo(() => {
      // 优先使用用户选择的活跃模型配置 ID
      // 其次使用第一个模型配置的 ID
      // 最后才使用默认值
      const firstModelConfigId = modelConfigs.length > 0 ? modelConfigs[0].id : undefined;
      const effectiveModelId = activeModelId || firstModelConfigId;

      // 根据模型类型确定 apiUrl 和 provider
      // 关键修复：使用 effectiveModelId 查找模型配置，而不是仅依赖 activeModel
      // 因为 activeModelId 可能为 null（用户未手动激活），但 modelConfigs 中有配置
      const modelToUse = modelConfigs.find(m => m.id === effectiveModelId) || null;

      let apiUrl: string;
      let modelProvider: string;
      let onlineProviderName: string | undefined;
      let apiKey: string | undefined;
      let apiModelName: string;  // 实际发送给 API 的模型名称

      if (modelToUse) {
        if (modelToUse.provider === 'online') {
          // 在线模型：获取正确的 API URL
          // 优先使用 ModelConfig 中保存的 apiUrl（自定义平台会有值）
          // 如果为空（标准在线模型如 Google），从 ONLINE_PROVIDERS 配置中获取
          if (modelToUse.apiUrl) {
            apiUrl = modelToUse.apiUrl;
          } else if (modelToUse.onlineProvider && ONLINE_PROVIDERS[modelToUse.onlineProvider]) {
            // 标准在线模型：从预配置中获取基础URL，并拼接正确的路径
            const providerConfig = ONLINE_PROVIDERS[modelToUse.onlineProvider];
            const baseUrl = providerConfig.apiUrl;
            // Google Gemini 使用 OpenAI 兼容端点
            if (modelToUse.onlineProvider === 'google') {
              apiUrl = `${baseUrl}/openai/chat/completions`;
            } else {
              // 其他 OpenAI 兼容提供商
              apiUrl = `${baseUrl}/chat/completions`;
            }
          } else {
            apiUrl = lmStudioUrl;
          }
          modelProvider = 'openai-compatible';
          onlineProviderName = modelToUse.onlineProvider;
          apiKey = modelToUse.apiKey;
          apiModelName = modelToUse.modelId;  // ModelConfig.modelId 是实际的 API 模型名
        } else {
          // 本地模型（LM Studio / Ollama）
          apiUrl = modelToUse.apiUrl || lmStudioUrl;
          modelProvider = modelToUse.provider === 'ollama' ? 'ollama' : 'lmstudio';
          onlineProviderName = undefined;
          apiKey = undefined;
          apiModelName = modelToUse.modelId;  // 使用配置的实际模型名
        }
      } else {
        // 没有任何模型配置时，回退到默认 LM Studio 配置
        apiUrl = lmStudioUrl;
        modelProvider = 'lmstudio';
        onlineProviderName = undefined;
        apiKey = undefined;
        apiModelName = 'local-model';
      }

      return {
        apiUrl,
        modelId: effectiveModelId,       // 配置ID（用于Token统计）
        apiModelName,                     // API模型名（用于API调用）
        temperature,
        modelProvider,
        onlineProvider: onlineProviderName,
        apiKey,
      };
    }, [activeModel, activeModelId, modelConfigs, lmStudioUrl, temperature]),
    useMemo(() => ({
      onWebSearchResult: handleWebSearchResult,
      onExecutionUpdate: handleExecutionUpdate,
      onContentChunk: handleContentChunk,
      onTaskPlanUpdate: handleTaskPlanUpdate,
    }), [handleWebSearchResult, handleExecutionUpdate, handleContentChunk, handleTaskPlanUpdate])
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Token estimation (1 token ≈ 3 characters)
  const estimateTokens = (text: string) => Math.ceil((text || '').length / 3);

  // Clean content by removing <think> tags for API payload
  const cleanContentForApi = (text: string) => {
    if (!text) return '';
    return text
      .replace(/<think>[\s\S]*?<\/think>/g, '') // Remove closed think blocks
      .replace(/<think>[\s\S]*/g, '')           // Remove unclosed think blocks at the end
      .trim();
  };

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setIsDarkMode(e.matches);
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (modelConfigs.length > 0) {
      startModelHealthCheck();
    }
  }, []);

  useEffect(() => {
    const loadMcpConfigs = async () => {
      try {
        const servers = await McpService.loadConfigs();

        if (servers.length === 0) {
          setMcpServers([]);
          return;
        }

        const connectingServers = servers.map(s =>
          s.enabled && s.status !== 'connected' ? { ...s, status: 'connecting' as const } : s
        );
        setMcpServers(connectingServers);

        const enabledServerIds = servers.filter(s => s.enabled && s.status !== 'connected').map(s => s.id);

        if (enabledServerIds.length > 0) {
          const connectPromises = enabledServerIds.map(async (id) => {
            try {
              const connected = await McpService.connectServer(id);
              return { id, server: connected, error: null };
            } catch (error) {
              return { 
                id, 
                server: { 
                  ...servers.find(s => s.id === id)!, 
                  status: 'error' as const, 
                  error: error instanceof Error ? error.message : 'Connection failed' 
                }, 
                error 
              };
            }
          });

          const results = await Promise.all(connectPromises);

          setMcpServers(prev => prev.map(s => {
            const result = results.find(r => r.id === s.id);
            return result ? result.server : s;
          }));

          if (results.some(r => r.server.status === 'connected')) {
            await agentExecution.refreshTools();
          }
        } else if (servers.some(s => s.status === 'connected')) {
          await agentExecution.refreshTools();
        }
      } catch (error) {
        console.log('MCP config load skipped:', error);
      }
    };
    loadMcpConfigs();
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setupCloseListener = async () => {
      try {
        unlisten = await listen('close-requested', () => {
          if (closeWindowAskEveryTime) {
            setIsCloseConfirmModalOpen(true);
          } else {
            if (closeWindowAction === 'minimize') {
              handleMinimizeToTray();
            } else {
              handleCloseApp();
            }
          }
        });
      } catch (error) {
        console.log('Not running in Tauri environment or listener setup failed');
      }
    };

    setupCloseListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [closeWindowAskEveryTime, closeWindowAction]);

  const handleMinimizeToTray = async () => {
    try {
      const { emit } = await import('@tauri-apps/api/event');
      await emit('hide-window');
      addLog(t.logs.windowMinimized, 'info');
    } catch (error) {
      console.log('Not running in Tauri environment', error);
    }
    setIsCloseConfirmModalOpen(false);
  };

  const handleCloseApp = async () => {
    try {
      const { emit } = await import('@tauri-apps/api/event');
      await emit('exit-app');
    } catch (error) {
      console.log('Not running in Tauri environment', error);
    }
  };

  const handleCloseConfirmMinimize = () => {
    setCloseWindowAction('minimize');
    handleMinimizeToTray();
  };

  const handleCloseConfirmClose = () => {
    setCloseWindowAction('close');
    handleCloseApp();
  };

  const toggleDarkMode = () => setIsDarkMode(!isDarkMode);

  const handleStopAI = () => {
    agentExecution.abort();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    const stoppedMsgId = currentExecutionMessageIdRef.current;
    if (stoppedMsgId) {
      setMessages(prev => prev.map(m => {
        if (m.id === stoppedMsgId) {
          const updatedTodos = m.todos?.map(todo => {
            if (todo.status === 'working') {
              return {
                ...todo,
                status: 'failed' as const,
                steps: todo.steps?.map(s =>
                  s.status === 'working' ? { ...s, status: 'completed' as const } : s
                ),
              };
            }
            return todo;
          });
          return {
            ...m,
            todos: updatedTodos,
            agentExecution: m.agentExecution ? {
              ...m.agentExecution,
              status: 'failed' as const,
            } : undefined,
          };
        }
        return m;
      }));
    }

    setIsStreaming(false);
    setIsWaitingForResponse(false);
    setCurrentExecutionMessageId(null);
    streamingContentRef.current = '';
    addLog(t.logs.userStoppedAI, 'info');
  };

  const handleApproveAction = () => {
    if (!pendingAction) return;
    addLog(t.logs.mcpUserApproved.replace('{tool}', pendingAction.tool), 'command');
    setMessages(prev => [...prev, {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      role: 'assistant',
      content: t.logs.toolExecuted.replace('{tool}', pendingAction.tool),
      timestamp: Date.now()
    }]);
    setPendingAction(null);
  };

  const handleRejectAction = () => {
    if (!pendingAction) return;
    addLog(t.logs.mcpUserRejected.replace('{tool}', pendingAction.tool), 'error');
    setMessages(prev => [...prev, {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      role: 'assistant',
      content: t.logs.toolCancelled.replace('{tool}', pendingAction.tool),
      timestamp: Date.now()
    }]);
    setPendingAction(null);
  };

  const handleAddMcpServer = async () => {
    if (!newMcpName || !newMcpCommand || isMcpConnecting) return;
    setIsMcpConnecting(true);
    setMcpAddError(null);
    
    const parsedArgs = newMcpArgs
      ? newMcpArgs.match(/(?:[^\s"]+|"[^"]*")+/g)?.map(arg => arg.replace(/^"|"$/g, '')) || []
      : [];

    if (editingServerId) {
      try {
        await McpService.removeServer(editingServerId);
        setMcpServers(prev => prev.filter(s => s.id !== editingServerId));
      } catch {}
    }

    const config: McpServerConfig = {
      id: editingServerId || Date.now().toString() + Math.random().toString(36).substring(2, 9),
      name: newMcpName,
      command: newMcpCommand,
      args: parsedArgs,
      env: envVars.reduce((acc, v) => { if (v.key) acc[v.key] = v.value; return acc; }, {} as Record<string, string>),
      enabled: true,
      toolTimeoutSecs: toolTimeout,
      connectTimeoutSecs: connectTimeout,
    };

    try {
      const dupError = await McpService.checkDuplicate(config);
      if (dupError) {
        setMcpAddError(dupError);
        addLog(dupError, 'error');
        setIsMcpConnecting(false);
        return;
      }

      const server = await McpService.addServer(config);
      setMcpServers(prev => {
        const existing = prev.findIndex(s => s.id === server.id);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = server;
          return updated;
        }
        return [...prev, server];
      });
      addLog(t.logs.mcpServerAdded.replace('{name}', newMcpName).replace('{command}', `${newMcpCommand} ${newMcpArgs}`), 'info');
      await agentExecution.refreshTools();
      await McpService.saveConfigs();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setMcpAddError(`添加失败: ${errorMsg}`);
      addLog(`MCP server add failed: ${errorMsg}`, 'error');
    }
    
    setIsMcpConnecting(false);
    setIsAddMcpModalOpen(false);
    setNewMcpName('');
    setNewMcpCommand('');
    setNewMcpArgs('');
    setEnvVars([]);
    setToolTimeout(60);
    setConnectTimeout(30);
    setEditingServerId(null);
  };

  const handleEditMcpServer = (server: McpServer) => {
    setEditingServerId(server.id);
    setNewMcpName(server.name);
    setNewMcpCommand(server.command);
    setNewMcpArgs(server.args?.join(' ') || '');
    setEnvVars(server.env ? Object.entries(server.env).map(([key, value]) => ({ key, value })) : []);
    setToolTimeout(server.toolTimeoutSecs || 60);
    setConnectTimeout(server.connectTimeoutSecs || 30);
    setIsAddMcpModalOpen(true);
  };


  const generateSessionTitle = async (firstUserMessage: string, sessionId: string) => {
    try {
      setGeneratingTitleSessionId(sessionId);

      let currentApiUrl = '';
      let currentModelName = '';
      let currentApiKey = '';
      
      const currentSession = sessions.find(s => s.id === sessionId);
      if (currentSession && currentSession.activeAgents && currentSession.activeAgents.length > 0) {
        const activeAgent = agents.find(a => a.id === currentSession.activeAgents![0]);
        if (activeAgent) {
          if (activeAgent.modelId) currentModelName = activeAgent.modelId;
          if (activeAgent.apiKey) currentApiKey = activeAgent.apiKey;
          if (activeAgent.apiUrl) {
            currentApiUrl = activeAgent.apiUrl;
          } else if (activeAgent.onlineProvider && ONLINE_PROVIDERS[activeAgent.onlineProvider]) {
            const providerConfig = ONLINE_PROVIDERS[activeAgent.onlineProvider];
            const baseUrl = providerConfig.apiUrl;
            currentApiUrl = activeAgent.onlineProvider === 'google'
              ? `${baseUrl}/openai/chat/completions`
              : `${baseUrl}/chat/completions`;
          }
        }
      }

      if (!currentApiUrl && activeModel) {
        currentModelName = activeModel.modelId || '';
        currentApiKey = activeModel.apiKey || '';
        if (activeModel.apiUrl) {
          currentApiUrl = activeModel.apiUrl;
        } else if (activeModel.onlineProvider && ONLINE_PROVIDERS[activeModel.onlineProvider]) {
          const providerConfig = ONLINE_PROVIDERS[activeModel.onlineProvider];
          const baseUrl = providerConfig.apiUrl;
          currentApiUrl = activeModel.onlineProvider === 'google'
            ? `${baseUrl}/openai/chat/completions`
            : `${baseUrl}/chat/completions`;
        }
      }

      if (!currentApiUrl) {
        setGeneratingTitleSessionId(null);
        return;
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (currentApiKey) {
        headers['Authorization'] = `Bearer ${currentApiKey}`;
      }

      const response = await fetch(currentApiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: currentModelName,
          messages: [
            { role: 'system', content: t.systemPrompts.titleGenerator },
            { role: 'user', content: firstUserMessage }
          ],
          temperature: 0.3,
          stream: false
        })
      });

      if (response.ok) {
        const data = await response.json();
        let title = data.choices[0]?.message?.content?.trim();
        if (title) {
          // 移除思考模型可能输出的 <think>...</think> 标签及其内容
          title = title.replace(/<think>[\s\S]*?(<\/think>|$)/gi, '').trim();
          
          // 移除 GLM 等模型可能输出的特殊 token，例如 <|begin_of_box|> 和 <|end_of_box|>
          title = title.replace(/<\|.*?\|>/g, '').trim();
          
          // 移除可能带有的引号、Markdown加粗符号以及“标题：”前缀
          title = title.replace(/^["']|["']$/g, '').replace(/\*\*/g, '').trim();
          title = title.replace(/^(标题：|标题:|Title:\s*)/i, '').trim();
          
          // 兜底截断，防止模型不听话输出过长
          if (title.length > 14) {
            title = title.substring(0, 14);
          }
          
          if (title) {
            updateSessionTitle(sessionId, title);
            addLog(t.logs.titleGenerated.replace('{title}', title), 'info');
          }
        }
      }
    } catch (error) {
      console.error('Failed to generate title:', error);
      addLog(t.logs.titleGenerateFailed, 'error');
    } finally {
      setGeneratingTitleSessionId(null);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() && attachments.length === 0) return;

    const imageAttachments = attachments.filter(a => a.type === 'image');
    if (imageAttachments.length > 0 && agentExecution.currentAgent) {
      const modelId = agentExecution.currentAgent.modelId || '';
      const provider = agentExecution.currentAgent.onlineProvider;
      
      if (!supportsVision(modelId, provider)) {
        const errorMsg = getVisionUnsupportedMessage(modelId, provider);
        addLog(errorMsg, 'error');
        setMessages(prev => [...prev, {
          id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
          role: 'assistant',
          content: errorMsg,
          timestamp: Date.now(),
          error: errorMsg,
        }]);
        return;
      }
    }

    const sessionId = await ensureCurrentSession();

    const messageContent = input.trim() || (attachments.length > 0 ? t.image.placeholder : '');
    const userMessage: Message = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      role: 'user',
      content: messageContent,
      timestamp: Date.now(),
      mode: appMode,
      attachments: attachments.length > 0 ? [...attachments] : undefined
    };

    addLog(t.logs.messageSent.replace('{length}', String(input.trim().length)), 'info');

    let currentMsgs = [...messages, userMessage];

    const originalInput = messageContent;
    const currentAttachments = [...attachments];
    setInput('');
    setAttachments([]);

    const userMessageCount = messages.filter(m => m.role === 'user').length;
    if (userMessageCount === 0 && sessionId) {
      generateSessionTitle(messageContent, sessionId);
    }

    // Always use Agent mode
    await handleAgentExecution(currentMsgs, originalInput, currentAttachments);
  };

  const handleAgentExecution = async (currentMsgs: Message[], originalInput: string, attachments?: Attachment[]) => {
    if (!agentExecution.currentAgent) return;

    const assistantMessageId = Date.now().toString() + Math.random().toString(36).substring(2, 9);
    setCurrentExecutionMessageId(assistantMessageId);
    setMessages([...currentMsgs, {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      agentId: agentExecution.currentAgent.id,
      agentExecution: {
        reasoningSteps: [],
        toolCalls: [],
        iterationCount: 0,
        status: 'thinking',
      }
    }]);

    setIsStreaming(true);
    setIsWaitingForResponse(true);
    setScrollResetKey(k => k + 1);
    
    agentExecution.resetTokenUsage();
    const startTime = Date.now();

    try {
      let enhancedInput = originalInput;
      const imageAttachments = attachments?.filter(a => a.type === 'image') || [];
      const documentAttachments = attachments?.filter(a => a.type === 'document') || [];
      
      if (documentAttachments.length > 0) {
        enhancedInput += '\n\n[附件文件]\n';
        for (const doc of documentAttachments) {
          enhancedInput += `\n--- ${doc.name} ---\n`;
          try {
            const base64Data = doc.data.split(',')[1];
            const decodedContent = atob(base64Data);
            const utf8Content = new TextDecoder('utf-8').decode(new Uint8Array([...decodedContent].map(c => c.charCodeAt(0))));
            enhancedInput += utf8Content.substring(0, 10000);
            if (utf8Content.length > 10000) {
              enhancedInput += '\n... [文件内容过长，已截断]';
            }
          } catch {
            enhancedInput += '[无法解析文件内容]';
          }
          enhancedInput += '\n--- 文件结束 ---\n';
        }
      }
      
      const conversationHistory: ConversationMessage[] = currentMsgs.map(m => {
        if (m.attachments && m.attachments.length > 0) {
          const imgs = m.attachments.filter(a => a.type === 'image');
          const docs = m.attachments.filter(a => a.type === 'document');
          
          let textContent = m.content;
          if (docs.length > 0) {
            textContent += '\n\n[附件文件]\n';
            for (const doc of docs) {
              textContent += `\n--- ${doc.name} ---\n`;
              try {
                const base64Data = doc.data.split(',')[1];
                const decodedContent = atob(base64Data);
                const utf8Content = new TextDecoder('utf-8').decode(new Uint8Array([...decodedContent].map(c => c.charCodeAt(0))));
                textContent += utf8Content.substring(0, 10000);
                if (utf8Content.length > 10000) {
                  textContent += '\n... [文件内容过长，已截断]';
                }
              } catch {
                textContent += '[无法解析文件内容]';
              }
              textContent += '\n--- 文件结束 ---\n';
            }
          }
          
          if (imgs.length > 0) {
            const content: ContentPart[] = [{ type: 'text', text: textContent }];
            for (const img of imgs) {
              content.push({
                type: 'image_url',
                image_url: { url: img.data }
              });
            }
            return { role: m.role as 'system' | 'user' | 'assistant', content };
          }
          
          return { role: m.role as 'system' | 'user' | 'assistant', content: textContent };
        }
        return { role: m.role as 'system' | 'user' | 'assistant', content: m.content };
      });

      const result = await agentExecution.execute(enhancedInput, conversationHistory);
      
      const executionTime = Date.now() - startTime;
      const tokenUsage = agentExecution.getTokenUsage();
      const tokenCount = tokenUsage ? tokenUsage.inputTokens + tokenUsage.outputTokens : 0;
      const tokenSpeed = executionTime > 0 ? Math.round(tokenCount / (executionTime / 1000)) : 0;

      setMessages(prev => prev.map(m => {
        if (m.id === assistantMessageId) {
          const streamedContent = m.content || '';
          const finalContent = streamedContent.length >= result.length
            ? streamedContent
            : result;
          return {
            ...m,
            content: finalContent,
            timestamp: Date.now(),
            tokenCount,
            tokenSpeed,
            executionTime,
            agentExecution: {
              ...m.agentExecution!,
              status: 'completed',
            }
          };
        }
        return m;
      }));

      addLog(t.logs.aiResponseComplete.replace('{time}', String(executionTime)).replace('{tokens}', String(tokenCount)).replace('{speed}', String(tokenSpeed)), 'info');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setMessages(prev => prev.map(m => {
        if (m.id === assistantMessageId) {
          return { 
            ...m, 
            error: errorMessage,
            agentExecution: {
              ...m.agentExecution!,
              status: 'failed',
            }
          };
        }
        return m;
      }));
      addLog(`Agent execution failed: ${errorMessage}`, 'error');
    } finally {
      if (streamingContentRef.current) {
        const remaining = streamingContentRef.current;
        const msgId = currentExecutionMessageIdRef.current;
        streamingContentRef.current = '';
        streamingUpdateScheduledRef.current = false;
        if (msgId && remaining) {
          setMessages(prev => prev.map(m => {
            if (m.id === msgId) {
              return { ...m, content: m.content + remaining };
            }
            return m;
          }));
        }
      }
      setCurrentExecutionMessageId(null);
      setIsStreaming(false);
      setIsWaitingForResponse(false);
    }
  };

  const handleEditMessage = async (messageId: string, newContent: string) => {
    const msgIndex = messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;

    const msg = messages[msgIndex];

    if (msg.role === 'user') {
      addLog(t.logs.messageEdited, 'info');
      const updatedUserMessage = { ...msg, content: newContent };
      let currentMsgs = [...messages.slice(0, msgIndex), updatedUserMessage];
      
      // Always use Agent mode for user message edits
      if (agentExecution.currentAgent) {
        const assistantMessageId = Date.now().toString() + Math.random().toString(36).substring(2, 9);
        setCurrentExecutionMessageId(assistantMessageId);
        setMessages([...currentMsgs, {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          agentId: agentExecution.currentAgent.id,
          agentExecution: {
            reasoningSteps: [],
            toolCalls: [],
            iterationCount: 0,
            status: 'thinking',
          }
        }]);
        
        setIsStreaming(true);
        setIsWaitingForResponse(true);
        
        try {
          const result = await agentExecution.execute(newContent, currentMsgs.map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content
          })));
          
          setMessages(prev => prev.map(m => {
            if (m.id === assistantMessageId) {
              return { ...m, content: result, agentExecution: { ...m.agentExecution!, status: 'completed' } };
            }
            return m;
          }));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          setMessages(prev => prev.map(m => {
            if (m.id === assistantMessageId) {
              return { ...m, error: errorMessage, agentExecution: { ...m.agentExecution!, status: 'failed' } };
            }
            return m;
          }));
        } finally {
          setCurrentExecutionMessageId(null);
          setIsStreaming(false);
          setIsWaitingForResponse(false);
        }
      }
    } else {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: newContent } : m));
      addLog(t.logs.aiReplyEdited, 'info');
    }
  };

  const handleRegenerateMessage = async (messageId: string) => {
    const msgIndex = messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;

    const historyBefore = messages.slice(0, msgIndex);
    const lastUserMsg = [...historyBefore].reverse().find(m => m.role === 'user');
    
    if (!lastUserMsg) return;

    addLog(t.logs.regenerating, 'info');
    
    if (agentExecution.currentAgent) {
      const assistantMessageId = Date.now().toString() + Math.random().toString(36).substring(2, 9);
      setCurrentExecutionMessageId(assistantMessageId);
      setMessages([...historyBefore, {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        agentId: agentExecution.currentAgent.id,
        agentExecution: {
          reasoningSteps: [],
          toolCalls: [],
          iterationCount: 0,
          status: 'thinking',
        }
      }]);
      
      setIsStreaming(true);
      setIsWaitingForResponse(true);
      
      try {
        const result = await agentExecution.execute(lastUserMsg.content, historyBefore.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content
        })));
        
        setMessages(prev => prev.map(m => {
          if (m.id === assistantMessageId) {
            return { ...m, content: result, agentExecution: { ...m.agentExecution!, status: 'completed' } };
          }
          return m;
        }));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        setMessages(prev => prev.map(m => {
          if (m.id === assistantMessageId) {
            return { ...m, error: errorMessage, agentExecution: { ...m.agentExecution!, status: 'failed' } };
          }
          return m;
        }));
      } finally {
        setCurrentExecutionMessageId(null);
        setIsStreaming(false);
        setIsWaitingForResponse(false);
      }
    }
  };

  const handleSwitchVersion = (messageId: string, index: number) => {
    setMessages(prev => prev.map(m => {
      if (m.id === messageId && m.versions && m.versions[index]) {
        const version = m.versions[index];
        return {
          ...m,
          content: version.content,
          thinking: version.thinking,
          timestamp: version.timestamp,
          tokenCount: version.tokenCount,
          tokenSpeed: version.tokenSpeed,
          executionTime: version.executionTime,
          currentVersionIndex: index
        };
      }
      return m;
    }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'document') => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const currentCount = attachments.length;
    const maxFiles = 10;
    const availableSlots = maxFiles - currentCount;
    
    if (availableSlots <= 0) {
      return;
    }

    const filesToProcess = Array.from(files).slice(0, availableSlots);

    filesToProcess.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const mimeType = file.type || 'application/octet-stream';
        const isImage = mimeType.startsWith('image/');
        
        const attachment: Attachment = {
          id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
          type: isImage ? 'image' : 'document',
          name: file.name,
          data: reader.result as string,
          mimeType: mimeType,
          size: file.size
        };
        
        setAttachments(prev => [...prev, attachment]);
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  return (
    <div className={cn(
      "flex h-screen w-full overflow-hidden transition-colors duration-300",
      isDarkMode ? "dark bg-zinc-900 text-zinc-200" : "bg-[#f5f5f5] text-zinc-800"
    )} style={{ fontFamily }}>
      <div 
        data-tauri-drag-region
        className={cn(
          "absolute top-0 right-0 z-50 flex items-center justify-end px-4 h-12 gap-2 shrink-0 pointer-events-none min-w-[90px]",
          !isToolPanelOpen && "border-l",
          isDarkMode ? "bg-zinc-700/30" : "bg-zinc-50/50",
          !isToolPanelOpen && (isDarkMode ? "border-zinc-700" : "border-zinc-200")
        )}
      >
        <div className="pointer-events-auto">
          <WindowControls />
        </div>
      </div>
      
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        isDarkMode={isDarkMode} 
        toggleDarkMode={toggleDarkMode} 
        isExpanded={isSidebarExpanded}
        openSettings={() => setIsSettingsOpen(true)}
      />

      <main className="flex-1 flex flex-col min-w-0 relative overflow-hidden">
        <AnimatePresence>
          {!(activeTab === 'chat' && appMode === 'command') && (
            <motion.div
              key="global-header"
              layout
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="overflow-hidden shrink-0"
            >
              <Header
                isToolPanelOpen={isToolPanelOpen}
                setIsToolPanelOpen={setIsToolPanelOpen}
                isSidebarExpanded={isSidebarExpanded}
                setIsSidebarExpanded={setIsSidebarExpanded}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div className={cn("flex-1 flex flex-col overflow-hidden relative", isDarkMode ? "bg-zinc-800" : "bg-zinc-50")}>
          {activeTab === 'chat' && (
            <div className="h-full flex flex-row w-full overflow-hidden relative">
              <motion.div 
                ref={chatContainerRef}
                layout
                initial={false}
                animate={{ 
                  width: appMode === 'command' ? commandChatWidth : '100%'
                }}
                transition={isResizing ? { duration: 0 } : { duration: 0.3, ease: "easeInOut" }}
                className={cn(
                  "flex flex-col h-full shrink-0 relative overflow-hidden",
                  appMode === 'command' && "border-r",
                  isDarkMode ? "border-zinc-700" : "border-zinc-200"
                )}
              >
                {appMode === 'command' && (
                  <div 
                    onMouseDown={startResizing}
                    className={cn(
                      "absolute top-0 right-0 w-1.5 h-full cursor-col-resize z-30 hover:bg-indigo-500/50 transition-colors",
                      isResizing && "bg-indigo-500/50"
                    )}
                    style={{ transform: 'translateX(50%)' }}
                  />
                )}
                <ChatView 
                  pendingAction={pendingAction}
                  handleApproveAction={handleApproveAction}
                  handleRejectAction={handleRejectAction}
                  scrollRef={scrollRef}
                  isDarkMode={isDarkMode}
                  handleEditMessage={handleEditMessage}
                  handleRegenerateMessage={handleRegenerateMessage}
                  handleSwitchVersion={handleSwitchVersion}
                  isWaitingForResponse={isWaitingForResponse}
                  isSearching={isSearching}
                  appMode={appMode}
                  isSidebarExpanded={isSidebarExpanded}
                  setIsSidebarExpanded={setIsSidebarExpanded}
                  scrollResetKey={scrollResetKey}
                />
                <ChatInput 
                  input={input}
                  setInput={setInput}
                  appMode={appMode}
                  setAppMode={setAppMode}
                  isDarkMode={isDarkMode}
                  attachments={attachments}
                  setAttachments={setAttachments}
                  handleSendMessage={handleSendMessage}
                  handleStopAI={handleStopAI}
                  fileInputRef={fileInputRef}
                  handleFileUpload={handleFileUpload}
                  removeAttachment={removeAttachment}
                />
              </motion.div>

              <AnimatePresence>
                {appMode === 'command' && (
                  <CanvasWorkspace 
                    isDarkMode={isDarkMode} 
                    isToolPanelOpen={isToolPanelOpen}
                    setIsToolPanelOpen={setIsToolPanelOpen}
                  />
                )}
              </AnimatePresence>
            </div>
          )}

          <AnimatePresence mode="wait">
            {activeTab === 'search' && (
              <motion.div
                key="search-view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="flex-1 overflow-hidden"
              >
                <SearchView isDarkMode={isDarkMode} />
              </motion.div>
            )}
            {activeTab === 'terminal' && (
              <motion.div
                key="terminal-view"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className="flex-1 overflow-hidden"
              >
                <TerminalView isDarkMode={isDarkMode} />
              </motion.div>
            )}
            {activeTab === 'mcp' && (
              <motion.div
                key="mcp-view"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="flex-1 overflow-hidden"
              >
                <McpControlCenter 
                  mcpServers={mcpServers}
                  setMcpServers={setMcpServers}
                  setIsAddMcpModalOpen={setIsAddMcpModalOpen}
                  isDarkMode={isDarkMode}
                  onDisconnect={async (id) => {
                    try {
                      const server = await McpService.disconnectServer(id);
                      setMcpServers(prev => prev.map(s => s.id === id ? server : s));
                      await agentExecution.refreshTools();
                    } catch (error) {
                      addLog(`Disconnect failed: ${error instanceof Error ? error.message : 'Unknown'}`, 'error');
                    }
                  }}
                  onReconnect={async (id) => {
                    try {
                      const server = await McpService.connectServer(id);
                      setMcpServers(prev => prev.map(s => s.id === id ? server : s));
                      await agentExecution.refreshTools();
                    } catch (error) {
                      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                      addLog(`Reconnect failed: ${errorMsg}`, 'error');
                      setMcpServers(prev => prev.map(s => 
                        s.id === id ? { ...s, status: 'error' as const, error: errorMsg } : s
                      ));
                    }
                  }}
                  onRemove={async (id) => {
                    try {
                      await McpService.removeServer(id);
                      setMcpServers(prev => prev.filter(s => s.id !== id));
                      await agentExecution.refreshTools();
                      await McpService.saveConfigs();
                    } catch (error) {
                      addLog(`Remove failed: ${error instanceof Error ? error.message : 'Unknown'}`, 'error');
                    }
                  }}
                  onRefreshTools={async () => {
                    await agentExecution.refreshTools();
                  }}
                  onEditServer={handleEditMcpServer}
                />
              </motion.div>
            )}
            {activeTab === 'agents' && (
              <motion.div
                key="agents-view"
                initial={{ opacity: 0, scale: 1.02 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02 }}
                transition={{ duration: 0.2 }}
                className="flex-1 flex flex-col min-h-0"
              >
                <AgentClusterView 
                  isDarkMode={isDarkMode}
                  onStartChatWithAgent={(agentId) => {
                    const selectedAgent = agents.find(a => a.id === agentId);
                    if (selectedAgent) {
                      agentExecution.setAgent(selectedAgent);
                      agentExecution.toggleAgentMode();
                    }
                    createNewSessionWithAgent(agentId);
                    setActiveTab('chat');
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <SettingsView 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        isDarkMode={isDarkMode}
      />

      <ToolPanel 
        isOpen={isToolPanelOpen}
        onClose={() => setIsToolPanelOpen(false)}
        isDarkMode={isDarkMode}
      />

      <AddMcpModal 
        isOpen={isAddMcpModalOpen}
        onClose={() => { setIsAddMcpModalOpen(false); setEditingServerId(null); setMcpAddError(null); }}
        newMcpName={newMcpName}
        setNewMcpName={setNewMcpName}
        newMcpCommand={newMcpCommand}
        setNewMcpCommand={setNewMcpCommand}
        newMcpArgs={newMcpArgs}
        setNewMcpArgs={setNewMcpArgs}
        envVars={envVars}
        setEnvVars={setEnvVars}
        toolTimeout={toolTimeout}
        setToolTimeout={setToolTimeout}
        connectTimeout={connectTimeout}
        setConnectTimeout={setConnectTimeout}
        isConnecting={isMcpConnecting}
        isEditing={!!editingServerId}
        error={mcpAddError}
        onAdd={handleAddMcpServer}
        isDarkMode={isDarkMode}
      />

      <CloseConfirmModal
        isOpen={isCloseConfirmModalOpen}
        isDarkMode={isDarkMode}
        askEveryTime={closeWindowAskEveryTime}
        onAskEveryTimeChange={setCloseWindowAskEveryTime}
        onMinimize={handleCloseConfirmMinimize}
        onCloseApp={handleCloseConfirmClose}
        onCancel={() => setIsCloseConfirmModalOpen(false)}
      />

      <ToolAuthModal
        toolCall={agentExecution.pendingAuthToolCall}
        onApprove={agentExecution.approveToolCall}
        onReject={agentExecution.rejectToolCall}
      />
    </div>
  );
}

