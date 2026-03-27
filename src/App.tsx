import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Plus, Command, Bot } from 'lucide-react';
import { cn } from './lib/utils';
import { Message, SearchResult, AppMode, McpServer, PendingAction, TabType, SearchGroup, ModelProvider, AttachmentFile } from './types';
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
import { MemoryPanel } from './components/MemoryPanel';
import { useGlobalState } from './context/GlobalStateContext';
import { MemoryUIProvider, useMemoryUI } from './context/MemoryUIContext';
import { useAgentExecution } from './hooks/useAgentExecution';
import { motion, AnimatePresence } from 'motion/react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from './hooks/useTranslation';
import { ConversationMessage, ReasoningStep, ToolCallRecord, AgentStatus } from './agent/types';
import { DEFAULT_AGENT } from './data/agents';
import { RetrievedMemory } from './types';
import { memoryExtractionService, TauriMemoryClient } from './agent/memory';

function AppContent() {
  const { setCurrentHits } = useMemoryUI();
  const { t, i18n } = useTranslation();
  const { 
    messages, setMessages, 
    logs, setLogs, 
    currentTokenCount, 
    isStreaming, setIsStreaming,
    addLog,
    createNewSessionWithAgent,
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
    memoryModelConfig,
    lmStudioUrl,
    setLmStudioUrl,
    ollamaUrl,
    setOllamaUrl,
    modelName,
    setModelName,
    modelTemperature,
    setModelTemperature,
    maxContextLength,
    setMaxContextLength,
    modelProvider,
    setModelProvider,
    systemPrompt,
    setSystemPrompt,
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
  const [isWebSearchEnabled, setIsWebSearchEnabled] = useState(false);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachmentFile[]>([]);

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

  // MCP State
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  // Add MCP Modal State
  const [isAddMcpModalOpen, setIsAddMcpModalOpen] = useState(false);
  const [newMcpName, setNewMcpName] = useState('');
  const [newMcpCommand, setNewMcpCommand] = useState('');
  const [newMcpArgs, setNewMcpArgs] = useState('');

  // Close Confirm Modal State
  const [isCloseConfirmModalOpen, setIsCloseConfirmModalOpen] = useState(false);

  // Memory Panel State
  const [isMemoryPanelOpen, setIsMemoryPanelOpen] = useState(false);

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

  const handleMemoryRetrieved = useCallback((memories: RetrievedMemory[]) => {
    console.log('[App] Memory retrieved:', memories.length, 'memories');
    setCurrentHits(memories);
  }, [setCurrentHits]);

  const agentExecution = useAgentExecution(
    useMemo(() => ({
      apiUrl: lmStudioUrl,
      modelId: modelName,
      temperature: modelTemperature,
    }), [lmStudioUrl, modelName, modelTemperature]),
    useMemo(() => ({
      onWebSearchResult: handleWebSearchResult,
      onExecutionUpdate: handleExecutionUpdate,
      onContentChunk: handleContentChunk,
      onMemoryRetrieved: handleMemoryRetrieved,
    }), [handleWebSearchResult, handleExecutionUpdate, handleContentChunk, handleMemoryRetrieved])
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
    memoryExtractionService.setMemoryModelConfig(memoryModelConfig);
    
    memoryExtractionService.setMemoryStoreConfig({
      generateEmbedding: (content: string) => TauriMemoryClient.generateEmbedding(content),
      searchSimilarMemories: (embedding: number[], topK: number) => 
        TauriMemoryClient.searchSimilarMemories(embedding, topK),
      addMemory: (memory: any) => TauriMemoryClient.addMemory(memory),
      updateMemory: (id: string, updates: any) => TauriMemoryClient.updateMemory(id, updates),
      boostMemory: (id: string, amount: number) => TauriMemoryClient.boostMemory(id, amount),
      getMemoryStats: () => TauriMemoryClient.getMemoryStats(),
    });
    
    console.log('[App] Memory extraction service initialized with config:', memoryModelConfig);
  }, [memoryModelConfig]);

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
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsStreaming(false);
      addLog(t.logs.userStoppedAI, 'info');
    }
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

  const handleAddMcpServer = () => {
    if (!newMcpName || !newMcpCommand) return;
    
    const newServer: McpServer = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      name: newMcpName,
      status: 'disconnected',
      tools: [] 
    };
    
    setMcpServers(prev => [...prev, newServer]);
    addLog(t.logs.mcpServerAdded.replace('{name}', newMcpName).replace('{command}', `${newMcpCommand} ${newMcpArgs}`), 'info');
    
    setIsAddMcpModalOpen(false);
    setNewMcpName('');
    setNewMcpCommand('');
    setNewMcpArgs('');
  };

  const requestAI = async (currentMsgs: Message[], systemPromptToUse: string, originalInput: string, existingAssistantId?: string) => {
    setIsStreaming(true);
    
    // Determine the API URL, Model Name, and API Key to use
    let currentApiUrl = lmStudioUrl;
    let currentModelName = modelName;
    let currentApiKey = '';
    
    const currentSession = sessions.find(s => s.id === currentSessionId);
    if (currentSession && currentSession.activeAgents && currentSession.activeAgents.length > 0) {
      const activeAgent = agents.find(a => a.id === currentSession.activeAgents![0]);
      if (activeAgent) {
        if (activeAgent.apiUrl) currentApiUrl = activeAgent.apiUrl;
        if (activeAgent.modelId) currentModelName = activeAgent.modelId;
        if (activeAgent.apiKey) currentApiKey = activeAgent.apiKey;
        if (activeAgent.systemPrompt) systemPromptToUse = activeAgent.systemPrompt;
      }
    } else {
      if (modelProvider === 'ollama') currentApiUrl = ollamaUrl;
      else if (modelProvider === 'lm-studio') currentApiUrl = lmStudioUrl;
    }

    const now = new Date();
    const currentLang = i18n.language || 'zh';
    const dateLocale = currentLang.startsWith('en') ? 'en-US' : 'zh-CN';
    const currentDate = now.toLocaleDateString(dateLocale, { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      weekday: 'long'
    });
    const datePrefix = currentLang.startsWith('en') ? 'Current Date:' : '当前日期：';
    systemPromptToUse = `${datePrefix}${currentDate}\n\n${systemPromptToUse}`;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (currentApiKey) {
      headers['Authorization'] = `Bearer ${currentApiKey}`;
    }

    if (!existingAssistantId) {
      setMessages(currentMsgs);
    }

    if (appMode === 'command') {
      addLog(t.logs.commandExecuted.replace('{command}', originalInput), 'command');
    }

    let searchContext = '';
    if (isWebSearchEnabled && (originalInput.toLowerCase().includes('搜索') || originalInput.toLowerCase().includes('查询') || originalInput.length > 5)) {
      addLog(t.logs.mcpToolCalled.replace('{server}', 'mcp-server-google-search').replace('{tool}', 'web_search'), 'info');
      setIsSearching(true);
      
      try {
        const queryMatch = originalInput.match(/(?:搜索|查询)\s*(.+)/i);
        const displayQuery = queryMatch ? queryMatch[1].trim() : originalInput;
        let searchQuery = displayQuery;
        
        const extractTopicFromMessage = (text: string): string | null => {
          const quoted = text.match(/["「」『』《》【】]([^"「」『』《》【】]+)["「」『』《》【】]/);
          if (quoted) {
            return quoted[1];
          }
          
          const firstPhrase = text.match(/^([\u4e00-\u9fa5]{2,8})/);
          if (firstPhrase) {
            return firstPhrase[1];
          }
          
          return null;
        };
        
        const currentTopic = extractTopicFromMessage(originalInput);
        
        if (!currentTopic && currentMsgs.length > 0) {
          const contextKeywords: string[] = [];
          
          const recentSearchGroups = searchGroups.filter(g => g.sessionId === currentSessionId).slice(0, 1);
          if (recentSearchGroups.length > 0 && recentSearchGroups[0].query) {
            contextKeywords.push(recentSearchGroups[0].query);
          } else {
            const recentUserMessages = currentMsgs
              .filter(m => m.role === 'user')
              .slice(-2)
              .map(m => m.content);
            
            for (const msg of recentUserMessages) {
              const topic = extractTopicFromMessage(msg);
              if (topic) {
                contextKeywords.push(topic);
              }
            }
          }
          
          const currentWords = new Set(searchQuery.split(/\s+/));
          const newKeywords = [...new Set(contextKeywords)]
            .filter(kw => !currentWords.has(kw))
            .slice(0, 2);
          
          if (newKeywords.length > 0) {
            searchQuery = `${newKeywords.join(' ')} ${searchQuery}`;
          }
        }
        
        const data = await invoke<{ results: SearchResult[] }>('search', { query: searchQuery });
        setSearchResults(data.results);
        
        const newGroup: SearchGroup = {
          id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
          query: displayQuery,
          results: data.results,
          timestamp: Date.now(),
          sessionId: currentSessionId
        };
        setSearchGroups(prev => [newGroup, ...prev]);
        
        searchContext = `\n\n[Web Search Results]\n${JSON.stringify(data.results)}`;
        addLog(t.logs.mcpSearchComplete.replace('{count}', String(data.results.length)), 'info');
      } catch (error) {
        addLog(t.logs.mcpSearchError.replace('{error}', error instanceof Error ? error.message : t.logs.unknownError), 'error');
      } finally {
        setIsSearching(false);
      }
    }

    if (searchContext) {
      systemPromptToUse += searchContext;
    }

    if (originalInput.toLowerCase().includes('修改') && (originalInput.toLowerCase().includes('smb') || originalInput.toLowerCase().includes('配置'))) {
      setPendingAction({
        id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
        tool: 'modify_smb_config',
        serverName: 'mcp-server-system-ops',
        description: t.mcpActions.modifySmbConfig,
        originalInput: originalInput
      });
      setIsStreaming(false);
      return; // Halt execution until authorized
    }

    try {
      const assistantMessageId = existingAssistantId || (Date.now().toString() + Math.random().toString(36).substring(2, 9));
      
      if (existingAssistantId) {
        // Regenerating: prepare the message for a new version
        setMessages(prev => prev.map(m => {
          if (m.id === existingAssistantId) {
            return {
              ...m,
              content: '',
              thinking: '',
              timestamp: Date.now(),
              tokenCount: 0,
              tokenSpeed: 0,
              executionTime: 0,
              agentId: currentSession?.activeAgents?.[0]
            };
          }
          return m;
        }));
      } else {
        setMessages([...currentMsgs, {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          agentId: currentSession?.activeAgents?.[0]
        }]);
      }

      const startTime = performance.now();
      abortControllerRef.current = new AbortController();

      const processThinking = (text: string) => {
        // Clean GLM specific tags and other potential model noise
        const cleanedText = text
          .replace(/<\|begin_of_box\|>/g, '')
          .replace(/<\|end_of_box\|>/g, '')
          .replace(/<\|assistant\|>/g, '')
          .replace(/<\|user\|>/g, '')
          .replace(/<\|system\|>/g, '');

        const thinkStartTag = '<think>';
        const thinkEndTag = '</think>';
        
        const startIndex = cleanedText.indexOf(thinkStartTag);
        const endIndex = cleanedText.indexOf(thinkEndTag);
        
        if (startIndex !== -1) {
          if (endIndex !== -1) {
            const thinking = cleanedText.substring(startIndex + thinkStartTag.length, endIndex).trim();
            const content = (cleanedText.substring(0, startIndex) + cleanedText.substring(endIndex + thinkEndTag.length)).trim();
            return { thinking, content };
          } else {
            const thinking = cleanedText.substring(startIndex + thinkStartTag.length).trim();
            const content = cleanedText.substring(0, startIndex).trim();
            return { thinking, content };
          }
        }
        return { thinking: '', content: cleanedText };
      };

      // --- 超长文本无感滑动窗口处理 ---
      const inputTokens = estimateTokens(originalInput);
      if (inputTokens > maxContextLength * 0.6) {
        addLog(t.logs.longTextDetected.replace('{tokens}', String(inputTokens)), 'info');
        
        const chunkSizeChars = Math.floor(maxContextLength * 1.5); // 大约占用一半的上下文
        const overlapChars = 200;
        
        const chunkTextWithOverlap = (text: string, chunkSize: number, overlap: number): string[] => {
          const result: string[] = [];
          let i = 0;
          while (i < text.length) {
            let end = Math.min(i + chunkSize, text.length);
            if (end < text.length) {
              const nextPeriod = text.lastIndexOf('。', end);
              const nextNewline = text.lastIndexOf('\n', end);
              const bestBreak = Math.max(nextPeriod, nextNewline);
              if (bestBreak > i + overlap) {
                end = bestBreak + 1;
              }
            }
            result.push(text.slice(i, end));
            i = end - overlap;
            if (i < 0) i = 0;
            if (end >= text.length) break;
          }
          return result;
        };

        const chunks = chunkTextWithOverlap(originalInput, chunkSizeChars, overlapChars);
        let accumulatedContent = '';

        addLog(t.logs.textChunked.replace('{count}', String(chunks.length)), 'command');

        for (let i = 0; i < chunks.length; i++) {
          if (abortControllerRef.current?.signal.aborted) {
            addLog(t.logs.processingInterrupted, 'error');
            break;
          }
          
          addLog(t.logs.processingChunk.replace('{current}', String(i + 1)).replace('{total}', String(chunks.length)).replace('{length}', String(chunks[i].length)), 'info');
          
          let chunkSystemPrompt = systemPromptToUse;
          if (i > 0) {
            const previousOutput = accumulatedContent.slice(-200);
            chunkSystemPrompt += `\n\n${t.chunkProcessing.continuationPrompt.replace('{current}', String(i + 1)).replace('{total}', String(chunks.length)).replace('{previous}', previousOutput)}`;
          } else {
            chunkSystemPrompt += `\n\n${t.chunkProcessing.firstChunkPrompt.replace('{total}', String(chunks.length))}`;
          }

          const apiMessages = [{ role: 'user', content: chunks[i] }];

          const response = await fetch(currentApiUrl, {
            method: 'POST',
            headers,
            signal: abortControllerRef.current.signal,
            body: JSON.stringify({
              model: currentModelName,
              messages: [
                { role: 'system', content: chunkSystemPrompt },
                ...apiMessages
              ],
              temperature: modelTemperature,
              stream: true
            })
          });

          if (!response.ok) throw new Error(t.logs.apiConnectError);
          
          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          
          let previousAccumulatedContent = accumulatedContent;
          let chunkOutput = '';
          let hasMarkdownWrapper = false;
          let wrapperLength = 0;
          
          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              const chunkData = decoder.decode(value, { stream: true });
              const lines = chunkData.split('\n');
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6);
                  if (data === '[DONE]') break;
                  try {
                    const json = JSON.parse(data);
                    const contentChunk = json.choices[0]?.delta?.content || '';
                    chunkOutput += contentChunk;
                    
                    if (!hasMarkdownWrapper) {
                      const match = chunkOutput.match(/^```(?:markdown|md|text)?\n/i);
                      if (match) {
                        hasMarkdownWrapper = true;
                        wrapperLength = match[0].length;
                      }
                    }

                    let displayChunkOutput = chunkOutput;
                    if (hasMarkdownWrapper) {
                      displayChunkOutput = chunkOutput.substring(wrapperLength);
                      if (displayChunkOutput.endsWith('\n```')) {
                        displayChunkOutput = displayChunkOutput.substring(0, displayChunkOutput.length - 4);
                      } else if (displayChunkOutput.endsWith('```')) {
                        displayChunkOutput = displayChunkOutput.substring(0, displayChunkOutput.length - 3);
                      }
                    }

                    accumulatedContent = previousAccumulatedContent + displayChunkOutput;
                    
                    const { thinking, content } = processThinking(accumulatedContent);
                    
                    setMessages(prev => prev.map(m => 
                      m.id === assistantMessageId ? { ...m, content: content || (thinking ? '' : ''), thinking } : m
                    ));
                  } catch (e) {}
                }
              }
            }
          }
          
          // 确保最终状态正确更新
          let finalDisplayChunkOutput = chunkOutput;
          if (hasMarkdownWrapper) {
            finalDisplayChunkOutput = chunkOutput.substring(wrapperLength);
            if (finalDisplayChunkOutput.endsWith('\n```')) {
              finalDisplayChunkOutput = finalDisplayChunkOutput.substring(0, finalDisplayChunkOutput.length - 4);
            } else if (finalDisplayChunkOutput.endsWith('```')) {
              finalDisplayChunkOutput = finalDisplayChunkOutput.substring(0, finalDisplayChunkOutput.length - 3);
            }
          }
          accumulatedContent = previousAccumulatedContent + finalDisplayChunkOutput;
          
          addLog(t.logs.chunkComplete.replace('{current}', String(i + 1)).replace('{total}', String(chunks.length)), 'info');
        }

        addLog(t.logs.allChunksComplete, 'command');

        const endTime = performance.now();
        const executionTime = Math.round(endTime - startTime);
        const { thinking, content } = processThinking(accumulatedContent);
        const tokenCount = estimateTokens(accumulatedContent);
        const tokenSpeed = Math.round((tokenCount / (executionTime / 1000)) * 10) / 10;

        setMessages(prev => prev.map(m => {
          if (m.id === assistantMessageId) {
            const newVersion = {
              content: content,
              thinking,
              timestamp: Date.now(),
              executionTime,
              tokenCount,
              tokenSpeed
            };
            const existingVersions = m.versions || [];
            let updatedVersions = [...existingVersions];
            if (existingAssistantId) {
              updatedVersions.push(newVersion);
            } else {
              updatedVersions = [newVersion];
            }

            return { 
              ...m, 
              content: content,
              thinking,
              executionTime,
              tokenCount,
              tokenSpeed,
              versions: updatedVersions,
              currentVersionIndex: updatedVersions.length - 1
            };
          }
          return m;
        }));

        setIsStreaming(false);
        abortControllerRef.current = null;
        return;
      }

      // --- 8GB VRAM 深度上下文压缩策略 ---
      const buildOpenAIMessage = (m: Message) => {
        const textContent = cleanContentForApi(m.content);
        
        console.log('[DEBUG] buildOpenAIMessage - message:', m);
        console.log('[DEBUG] buildOpenAIMessage - m.attachments:', m.attachments);
        
        if (m.attachments && m.attachments.length > 0) {
          const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
          
          if (textContent) {
            contentParts.push({ type: 'text', text: textContent });
          }
          
          for (const attachment of m.attachments) {
            if (attachment.type === 'image') {
              console.log('[DEBUG] Adding image to contentParts:', attachment.name, 'data length:', attachment.data.length);
              contentParts.push({
                type: 'image_url',
                image_url: { url: attachment.data }
              });
            } else {
              contentParts.push({
                type: 'text',
                text: `[附件: ${attachment.name}]`
              });
            }
          }
          
          console.log('[DEBUG] Returning multimodal content with', contentParts.length, 'parts');
          return { role: m.role, content: contentParts };
        }
        
        console.log('[DEBUG] Returning simple text content');
        return { role: m.role, content: textContent };
      };

      let apiMessages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }> = currentMsgs.map(m => buildOpenAIMessage(m));

      const estimateMessageTokens = (msg: { role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }) => {
        if (typeof msg.content === 'string') {
          return estimateTokens(msg.content);
        }
        return msg.content.reduce((acc, part) => {
          if (part.text) return acc + estimateTokens(part.text);
          if (part.image_url) return acc + 85;
          return acc;
        }, 0);
      };

      let totalTokens = estimateTokens(systemPromptToUse) + apiMessages.reduce((acc, m) => acc + estimateMessageTokens(m), 0);
      addLog(t.logs.aiRequestStart.replace('{tokens}', String(totalTokens)).replace('{max}', String(maxContextLength)), 'info');

      if (totalTokens > maxContextLength * 0.85) {
        addLog(t.logs.contextCompressionTriggered.replace('{current}', String(totalTokens)).replace('{threshold}', String(Math.floor(maxContextLength * 0.85))), 'info');

        // 策略 1: 历史代码块骨架化 (保留当前最新消息)
        apiMessages = apiMessages.map((msg, index) => {
          if (index === apiMessages.length - 1) return msg;
          if (typeof msg.content !== 'string') return msg;
          if (!msg.content.includes('```')) return msg;

          return {
            ...msg,
            content: msg.content.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
              const lines = code.split('\n').length;
              if (lines > 15) {
                return `\`\`\`${lang}\n/* [${t.context.codeBlockCollapsed.replace('{lines}', String(lines))}] */\n\`\`\``;
              }
              return match;
            })
          };
        });

        const compressedTokens1 = estimateTokens(systemPromptToUse) + apiMessages.reduce((acc, m) => acc + estimateMessageTokens(m), 0);
        if (compressedTokens1 < totalTokens) {
          addLog(t.logs.codeBlockSkeletonized.replace('{released}', String(totalTokens - compressedTokens1)), 'info');
        }
        totalTokens = compressedTokens1;

        if (totalTokens > maxContextLength * 0.85 && apiMessages.length > 3) {
          const head = apiMessages[0];
          const tail = apiMessages.slice(-2);
          apiMessages = [
            head,
            { role: 'system', content: t.context.historyReleased },
            ...tail
          ];
          const compressedTokens2 = estimateTokens(systemPromptToUse) + apiMessages.reduce((acc, m) => acc + estimateMessageTokens(m), 0);
          addLog(t.logs.headTailApplied.replace('{tokens}', String(compressedTokens2)), 'info');
          totalTokens = compressedTokens2;
        }
      }
      // -----------------------------------

      addLog(t.logs.aiRequesting.replace('{model}', currentModelName).replace('{temp}', String(modelTemperature)), 'info');
      setIsWaitingForResponse(true);
      setScrollResetKey(k => k + 1);
      const response = await fetch(currentApiUrl, {
        method: 'POST',
        headers,
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          model: currentModelName,
          messages: [
            { role: 'system', content: systemPromptToUse },
            ...apiMessages
          ],
          temperature: modelTemperature,
          stream: true
        })
      });

      if (!response.ok) {
        setIsWaitingForResponse(false);
        throw new Error(t.logs.apiConnectError);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = '';
      let isFirstChunk = true;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          if (isFirstChunk) {
            setIsWaitingForResponse(false);
            isFirstChunk = false;
          }

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') break;
              try {
                const json = JSON.parse(data);
                const contentChunk = json.choices[0]?.delta?.content || '';
                accumulatedContent += contentChunk;
                
                const { thinking, content } = processThinking(accumulatedContent);
                
                setMessages(prev => prev.map(m => 
                  m.id === assistantMessageId ? { ...m, content: content || (thinking ? '' : ''), thinking } : m
                ));
              } catch (e) {}
            }
          }
        }
      }

      const endTime = performance.now();
      const executionTime = Math.round(endTime - startTime);
      const { thinking, content } = processThinking(accumulatedContent);
      const tokenCount = estimateTokens(accumulatedContent);
      const tokenSpeed = Math.round((tokenCount / (executionTime / 1000)) * 10) / 10;

      addLog(t.logs.aiResponseComplete.replace('{time}', String(executionTime)).replace('{tokens}', String(tokenCount)).replace('{speed}', String(tokenSpeed)), 'info');

      setMessages(prev => prev.map(m => {
        if (m.id === assistantMessageId) {
          const newVersion = {
            content: content,
            thinking,
            timestamp: Date.now(),
            executionTime,
            tokenCount,
            tokenSpeed
          };
          
          const existingVersions = m.versions || [
            // If it's the first time we're adding versions, the current state is version 0
            // But wait, if we are regenerating, we should have captured the OLD state before clearing it
            // Let's simplify: always maintain versions
          ];

          // If it's a new message, versions will be empty.
          // If it's a regeneration, we already have versions.
          
          let updatedVersions = [...existingVersions];
          if (existingAssistantId) {
            // It was a regeneration, so we add a new version
            updatedVersions.push(newVersion);
          } else {
            // It was a new message, so this is the first version
            updatedVersions = [newVersion];
          }

          return { 
            ...m, 
            content: content,
            thinking,
            executionTime,
            tokenCount,
            tokenSpeed,
            versions: updatedVersions,
            currentVersionIndex: updatedVersions.length - 1
          };
        }
        return m;
      }));

      // 如果是第一轮对话，根据用户的提问和AI的回答生成标题
      const userMessages = currentMsgs.filter(m => m.role === 'user');
      if (userMessages.length === 1) {
        generateSessionTitle(originalInput, content, currentSessionId);
      }

    } catch (error) {
      console.error(error);
      setIsWaitingForResponse(false);
      setMessages(prev => prev.map(m => 
        m.role === 'assistant' && m.content === '' 
          ? { ...m, error: t.logs.apiConnectErrorDetail.replace('{url}', currentApiUrl) } 
          : m
      ));
      addLog(t.logs.apiUnavailable, 'error');
    } finally {
      setIsStreaming(false);
      setIsWaitingForResponse(false);
      abortControllerRef.current = null;
    }
  };

  const generateSessionTitle = async (firstUserMessage: string, firstAssistantMessage: string, sessionId: string) => {
    try {
      let currentApiUrl = lmStudioUrl;
      let currentModelName = modelName;
      let currentApiKey = '';
      
      const currentSession = sessions.find(s => s.id === sessionId);
      if (currentSession && currentSession.activeAgents && currentSession.activeAgents.length > 0) {
        const activeAgent = agents.find(a => a.id === currentSession.activeAgents![0]);
        if (activeAgent) {
          if (activeAgent.apiUrl) currentApiUrl = activeAgent.apiUrl;
          if (activeAgent.modelId) currentModelName = activeAgent.modelId;
          if (activeAgent.apiKey) currentApiKey = activeAgent.apiKey;
        }
      } else {
        if (modelProvider === 'ollama') currentApiUrl = ollamaUrl;
        else if (modelProvider === 'lm-studio') currentApiUrl = lmStudioUrl;
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
            { role: 'user', content: `用户提问：${firstUserMessage}\n\nAI回答：${firstAssistantMessage}` }
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
          if (title.length > 12) {
            title = title.substring(0, 12);
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
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() && attachedFiles.length === 0) return;

    console.log('[DEBUG] handleSendMessage - attachedFiles:', attachedFiles);
    console.log('[DEBUG] handleSendMessage - attachedFiles.length:', attachedFiles.length);

    const userMessage: Message = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      role: 'user',
      content: input.trim() || (attachedFiles.length > 0 ? t.image.placeholder : ''),
      timestamp: Date.now(),
      mode: appMode,
      attachments: attachedFiles.length > 0 ? attachedFiles : undefined
    };

    console.log('[DEBUG] userMessage created:', userMessage);
    console.log('[DEBUG] userMessage.attachments:', userMessage.attachments);

    addLog(t.logs.messageSent.replace('{length}', String(input.trim().length)), 'info');

    let currentMsgs = [...messages, userMessage];

    const originalInput = input;
    setInput('');
    setAttachedFiles([]);

    if (agentExecution.isAgentMode && agentExecution.currentAgent) {
      await handleAgentExecution(currentMsgs, originalInput);
    } else {
      const promptToUse = systemPrompt || t.systemPrompts.defaultAssistant;
      await requestAI(currentMsgs, promptToUse, originalInput);
    }
  };

  const handleAgentExecution = async (currentMsgs: Message[], originalInput: string) => {
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

    try {
      const conversationHistory: ConversationMessage[] = currentMsgs.map(m => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
        attachments: m.attachments,
      }));

      const result = await agentExecution.execute(originalInput, conversationHistory, currentSessionId || undefined);

      setMessages(prev => prev.map(m => {
        if (m.id === assistantMessageId) {
          return {
            ...m,
            content: result,
            timestamp: Date.now(),
            agentExecution: {
              ...m.agentExecution!,
              status: 'completed',
            }
          };
        }
        return m;
      }));

      const userMessages = currentMsgs.filter(m => m.role === 'user');
      if (userMessages.length === 1) {
        generateSessionTitle(originalInput, result, currentSessionId);
      }

      addLog(t.logs.aiResponseComplete.replace('{time}', '0').replace('{tokens}', '0').replace('{speed}', '0'), 'info');
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
      
      const promptToUse = systemPrompt || t.systemPrompts.defaultAssistant;
      await requestAI(currentMsgs, promptToUse, newContent);
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
    const promptToUse = systemPrompt || t.systemPrompts.defaultAssistant;
    await requestAI(historyBefore, promptToUse, lastUserMsg.content, messageId);
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const MAX_ATTACHMENTS = 10;
    const currentCount = attachedFiles.length;
    const availableSlots = MAX_ATTACHMENTS - currentCount;
    
    if (availableSlots <= 0) {
      addLog(t.logs.attachmentLimitReached || '附件数量已达上限', 'warning');
      return;
    }

    const filesToProcess = Array.from(files).slice(0, availableSlots);
    
    filesToProcess.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const mimeType = file.type;
        const isImage = mimeType.startsWith('image/');
        
        const attachment: AttachmentFile = {
          id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
          name: file.name,
          type: isImage ? 'image' : 'document',
          mimeType: mimeType,
          data: reader.result as string,
          size: file.size
        };
        
        setAttachedFiles(prev => [...prev, attachment]);
      };
      reader.readAsDataURL(file);
    });
    
    if (e.target) {
      e.target.value = '';
    }
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
        openMemoryPanel={() => setIsMemoryPanelOpen(true)}
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
                maxContextLength={maxContextLength}
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
                  "flex flex-col h-full shrink-0 relative",
                  appMode === 'command' && "border-r",
                  isDarkMode ? "border-zinc-700" : "border-zinc-200"
                )}
              >
                {appMode === 'command' && (
                  <div 
                    onMouseDown={startResizing}
                    className={cn(
                      "absolute top-0 right-0 w-1.5 h-full cursor-col-resize z-10 hover:bg-indigo-500/50 transition-colors",
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
                  modelName={modelName}
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
                  attachedFiles={attachedFiles}
                  setAttachedFiles={setAttachedFiles}
                  handleSendMessage={handleSendMessage}
                  handleStopAI={handleStopAI}
                  fileInputRef={fileInputRef}
                  handleFileUpload={handleFileUpload}
                  maxContextLength={maxContextLength}
                  isWebSearchEnabled={isWebSearchEnabled}
                  setIsWebSearchEnabled={setIsWebSearchEnabled}
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
                  setIsAddMcpModalOpen={setIsAddMcpModalOpen}
                  isDarkMode={isDarkMode}
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
        onReset={() => {
          setLmStudioUrl('http://localhost:1234/v1/chat/completions');
          setOllamaUrl('http://localhost:11434/api/chat');
          setModelName('');
          setSystemPrompt(t.systemPrompts.defaultAssistant);
          setModelTemperature(0.7);
          setMaxContextLength(4096);
          setModelProvider('lm-studio');
        }}
      />

      <ToolPanel 
        isOpen={isToolPanelOpen}
        onClose={() => setIsToolPanelOpen(false)}
        isDarkMode={isDarkMode}
      />

      <AddMcpModal 
        isOpen={isAddMcpModalOpen}
        onClose={() => setIsAddMcpModalOpen(false)}
        newMcpName={newMcpName}
        setNewMcpName={setNewMcpName}
        newMcpCommand={newMcpCommand}
        setNewMcpCommand={setNewMcpCommand}
        newMcpArgs={newMcpArgs}
        setNewMcpArgs={setNewMcpArgs}
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

      <MemoryPanel
        isOpen={isMemoryPanelOpen}
        onClose={() => setIsMemoryPanelOpen(false)}
        isDarkMode={isDarkMode}
      />
    </div>
  );
}

export default function App() {
  return (
    <MemoryUIProvider>
      <AppContent />
    </MemoryUIProvider>
  );
}

