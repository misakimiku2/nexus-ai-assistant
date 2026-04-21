import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Plus, Command, Bot } from 'lucide-react';
import { cn } from './lib/utils';
import { Message, SearchResult, AppMode, McpServer, McpServerConfig, PendingAction, TabType, SearchGroup, ModelProvider, Attachment, MessageRole } from './types';
import { McpService } from './agent/mcp/McpService';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { ChatViewOptimized } from './components/ChatViewOptimized';
import { ChatInput } from './components/ChatInput';
import { SearchView } from './components/SearchView';
import { TerminalView } from './components/TerminalView';
import { SettingsView } from './components/SettingsView';
import { McpControlCenter } from './components/McpControlCenter';
import { AgentClusterView } from './components/AgentClusterView';
import { ToolPanel } from './components/ToolPanel';
import { AddMcpModal } from './components/AddMcpModal';
import { CanvasWorkspace } from './components/CanvasWorkspace';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CloseConfirmModal } from './components/CloseConfirmModal';
import { WindowControls } from './components/WindowControls';
import { ToolAuthModal } from './components/AgentExecutionView';
import { useGlobalState } from './context/GlobalStateContext';
import { FileViewerProvider, useFileViewer } from './context/FileViewerContext';
import { TerminalProvider, useTerminal } from './context/TerminalContext';
import { useAgentExecution, taskPlanToTodoItems } from './hooks/useAgentExecution';
import { motion, AnimatePresence, useMotionValue, animate as motionAnimate } from 'motion/react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from './hooks/useTranslation';
import { ConversationMessage, ReasoningStep, ToolCallRecord, AgentStatus, ContentPart, TaskPlan } from './agent/types';
import { DEFAULT_AGENT } from './data/agents';
import { ONLINE_PROVIDERS } from './config/aggregatorProviders';
import { supportsVision, getVisionUnsupportedMessage } from './config/visionModels';

interface CanvasBridgeInnerProps {
  diffOpenRef: React.MutableRefObject<((path: string, original: string, newContent: string) => void) | null>;
  shellOutputRef: React.MutableRefObject<((command: string, stdout: string, stderr: string, exitCode: number) => void) | null>;
}

const CanvasBridgeInner: React.FC<CanvasBridgeInnerProps> = ({ diffOpenRef, shellOutputRef }) => {
  const { openDiffView } = useFileViewer();
  const { addEntry, setIsOpen } = useTerminal();
  useEffect(() => {
    diffOpenRef.current = openDiffView;
    shellOutputRef.current = (cmd: string, out: string, err: string, code: number) => {
      addEntry({ command: cmd, stdout: out, stderr: err, exitCode: code, timestamp: Date.now() });
      setIsOpen(true);
    };
    return () => {
      diffOpenRef.current = null;
      shellOutputRef.current = null;
    };
  }, [openDiffView, addEntry, setIsOpen, diffOpenRef, shellOutputRef]);
  return null;
};

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
    taskRounds,
    setTaskRounds,
    currentRoundId,
    startNewRound,
    completeCurrentRound,
    addSearchToRound,
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

  const debugLogLayout = React.useCallback((action: string) => {
    console.log(`%c[布局调试] ${action}`, 'background: #222; color: #bada55; padding: 2px 6px; border-radius: 3px;');
    console.log('  - isSidebarExpanded:', isSidebarExpanded);
    console.log('  - isToolPanelOpen:', isToolPanelOpen);
    console.log('  - window.innerWidth:', window.innerWidth);
    console.log('  - timestamp:', new Date().toISOString());
  }, [isSidebarExpanded, isToolPanelOpen]);

  const handleSetSidebarExpanded = React.useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setIsSidebarExpanded(prev => {
      const newValue = typeof value === 'function' ? value(prev) : value;
      debugLogLayout(`Sidebar ${newValue ? '展开' : '收起'}`);
      return newValue;
    });
  }, [debugLogLayout]);

  const handleSetToolPanelOpen = React.useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setIsToolPanelOpen(prev => {
      const newValue = typeof value === 'function' ? value(prev) : value;
      debugLogLayout(`ToolPanel ${newValue ? '打开' : '关闭'}`);
      return newValue;
    });
  }, [debugLogLayout]);
  const [appMode, setAppModeState] = useState<AppMode>(() => {
    const stored = localStorage.getItem('nexus_app_mode');
    return (stored === 'chat' || stored === 'command') ? stored : 'chat';
  });
  const setAppMode = React.useCallback((mode: AppMode | ((prev: AppMode) => AppMode)) => {
    setAppModeState(prev => {
      const newMode = typeof mode === 'function' ? mode(prev) : mode;
      localStorage.setItem('nexus_app_mode', newMode);
      return newMode;
    });
  }, []);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const isResizingRef = useRef(false);
  const commandChatWidthRef = useRef(350);
  const [commandChatWidth, setCommandChatWidth] = useState(() => {
    const stored = localStorage.getItem('nexus_command_chat_width');
    const width = stored ? parseInt(stored, 10) : 350;
    commandChatWidthRef.current = width;
    return width;
  });
  const [isResizing, setIsResizing] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const prevAppModeRef = useRef(appMode);
  const isInitializedRef = useRef(false);
  const modeSwitchTimeRef = useRef(0);
  const sidebarEffectHasRunRef = useRef(false);
  const MODE_SWITCH_LOCK_DURATION = 1200;
  const currentAnimationRef = useRef<(() => void) | null>(null);

  const widthMotionValue = useMotionValue(typeof window !== 'undefined' ? window.innerWidth : 800);

  useEffect(() => {
    commandChatWidthRef.current = commandChatWidth;
  }, [commandChatWidth]);

  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    requestAnimationFrame(() => {
      const parentEl = chatContainerRef.current?.parentElement;
      const parentWidth = parentEl ? parentEl.getBoundingClientRect().width : window.innerWidth;

      if (appMode === 'chat') {
        widthMotionValue.set(parentWidth);
      } else if (appMode === 'command') {
        modeSwitchTimeRef.current = Date.now();
        const storedWidth = localStorage.getItem('nexus_command_chat_width');
        if (storedWidth) {
          const parsedWidth = parseInt(storedWidth, 10);
          if (!isNaN(parsedWidth) && parsedWidth >= 350 && parsedWidth <= 580) {
            setCommandChatWidth(parsedWidth);
            widthMotionValue.set(parsedWidth);
            return;
          }
        }
        const targetWidth = Math.min(Math.max(parentWidth * 0.45, 350), 580);
        widthMotionValue.set(targetWidth);
        setCommandChatWidth(Math.round(targetWidth));
        localStorage.setItem('nexus_command_chat_width', String(Math.round(targetWidth)));
      }
    });
  }, []);

  useEffect(() => {
    if (isResizingRef.current) return;
    if (prevAppModeRef.current === appMode) return;

    console.log('[Mode Switch Debug] === MODE SWITCH STARTED ===');
    console.log('[Mode Switch Debug] Switching from:', prevAppModeRef.current, 'to:', appMode);
    console.log('[Mode Switch Debug] Timestamp:', new Date().toISOString());

    // Capture DOM state before switch
    if (chatContainerRef.current) {
      const container = chatContainerRef.current;
      console.log('[Mode Switch Debug] Container BEFORE switch:', {
        scrollHeight: container.scrollHeight,
        clientHeight: container.clientHeight,
        offsetWidth: container.offsetWidth,
        offsetHeight: container.offsetHeight,
        computedWidth: window.getComputedStyle(container).width,
        computedHeight: window.getComputedStyle(container).height
      });

      // Capture last 2 message positions before switch
      const messages = container.querySelectorAll('[data-role]');
      if (messages.length >= 2) {
        const lastTwo = Array.from(messages).slice(-2);
        lastTwo.forEach((msg, idx) => {
          const el = msg as HTMLElement;
          console.log(`[Mode Switch Debug] Message ${messages.length - 2 + idx} BEFORE switch:`, {
            id: el.id,
            role: el.getAttribute('data-role'),
            offsetTop: el.offsetTop,
            offsetHeight: el.offsetHeight,
            boundingRect: el.getBoundingClientRect()
          });
        });
      }
    }

    if (appMode === 'command' && prevAppModeRef.current !== 'command') {
      modeSwitchTimeRef.current = Date.now();
      sidebarEffectHasRunRef.current = false;

      const storedWidth = localStorage.getItem('nexus_command_chat_width');
      let targetWidth: number;
      if (storedWidth) {
        const parsedWidth = parseInt(storedWidth, 10);
        targetWidth = (!isNaN(parsedWidth) && parsedWidth >= 350 && parsedWidth <= 580) ? parsedWidth : 450;
      } else {
        targetWidth = 450;
      }

      if (currentAnimationRef.current) {
        currentAnimationRef.current();
        currentAnimationRef.current = null;
      }

      const animation = motionAnimate(widthMotionValue, targetWidth, {
        duration: 0.35,
        ease: [0.4, 0, 0.2, 1],
      });
      currentAnimationRef.current = () => animation.stop();
      animation.then(() => { currentAnimationRef.current = null; }).catch(() => { currentAnimationRef.current = null; });

      setCommandChatWidth(targetWidth);
    } else if (appMode === 'chat' && prevAppModeRef.current !== 'chat') {
      console.log('[Mode Switch Debug] Switching to CHAT mode - starting animation');
      const parentEl = chatContainerRef.current?.parentElement;
      if (parentEl) {
        const targetWidth = parentEl.getBoundingClientRect().width;
        console.log('[Mode Switch Debug] Chat mode target width:', targetWidth);

        if (currentAnimationRef.current) {
          currentAnimationRef.current();
          currentAnimationRef.current = null;
        }

        const animation = motionAnimate(widthMotionValue, targetWidth, {
          duration: 0.35,
          ease: [0.4, 0, 0.2, 1],
        });
        currentAnimationRef.current = () => animation.stop();

        // Log during animation
        let frameCount = 0;
        const logInterval = setInterval(() => {
          if (frameCount < 10 && chatContainerRef.current) { // Log for ~500ms (10 frames * 50ms)
            console.log(`[Mode Switch Debug] Animation frame ${frameCount}:`, {
              currentWidth: widthMotionValue.get(),
              containerWidth: chatContainerRef.current.offsetWidth,
              timestamp: Date.now()
            });
            frameCount++;
          } else {
            clearInterval(logInterval);
          }
        }, 50);

        animation.then(() => {
          console.log('[Mode Switch Debug] Animation COMPLETED');
          console.log('[Mode Switch Debug] Final width:', widthMotionValue.get());

          // Capture DOM state after animation completes
          setTimeout(() => {
            if (chatContainerRef.current) {
              const container = chatContainerRef.current;

              console.log('[Mode Switch Debug] === FORCING REFLOW ===');

              // Force a complete reflow by temporarily changing the container's style
              const originalDisplay = container.style.display;
              const originalOverflow = container.style.overflow;

              // Step 1: Force browser to acknowledge the new layout
              container.style.display = 'none';
              void container.offsetHeight; // Trigger reflow
              container.style.display = originalDisplay || '';
              void container.offsetHeight; // Trigger reflow again

              // Step 2: Scroll to top to reset scroll position, then to bottom
              const originalScrollTop = container.scrollTop;
              container.scrollTop = 0;
              void container.offsetHeight; // Trigger reflow
              container.scrollTop = originalScrollTop;

              // Step 3: Force all child elements to recalculate their positions
              const messages = container.querySelectorAll('[data-role]');
              messages.forEach((msg) => {
                const el = msg as HTMLElement;
                void el.offsetTop; // Force reflow for each message
              });

              // Final forced reflow
              void container.scrollHeight;
              void container.getBoundingClientRect();

              console.log('[Mode Switch Debug] Reflow completed');
              console.log('[Mode Switch Debug] Container AFTER reflow:', {
                scrollHeight: container.scrollHeight,
                clientHeight: container.clientHeight,
                offsetWidth: container.offsetWidth,
                offsetHeight: container.offsetHeight
              });

              // Capture last 2 message positions after switch (reuse existing 'messages' variable)
              if (messages.length >= 2) {
                const lastTwo = Array.from(messages).slice(-2);
                lastTwo.forEach((msg, idx) => {
                  const el = msg as HTMLElement;
                  const rect = el.getBoundingClientRect();
                  console.log(`[Mode Switch Debug] Message ${messages.length - 2 + idx} AFTER switch:`, {
                    id: el.id,
                    role: el.getAttribute('data-role'),
                    offsetTop: el.offsetTop,  // In virtual scroll this is always 0
                    offsetHeight: el.offsetHeight,
                    boundingRect: {
                      top: rect.top,
                      bottom: rect.bottom,
                      left: rect.left,
                      right: rect.right
                    }
                  });
                });

                // Check for overlap using getBoundingClientRect (works correctly with virtual scroll)
                if (lastTwo.length === 2) {
                  const first = lastTwo[0] as HTMLElement;
                  const second = lastTwo[1] as HTMLElement;
                  const firstRect = first.getBoundingClientRect();
                  const secondRect = second.getBoundingClientRect();

                  const firstBottom = firstRect.bottom;
                  const secondTop = secondRect.top;
                  const overlap = firstBottom > secondTop;

                  console.log('[Mode Switch Debug] Overlap check (using boundingRect):', {
                    firstBottom: Math.round(firstBottom),
                    secondTop: Math.round(secondTop),
                    overlap,
                    gap: Math.round(secondTop - firstBottom),
                    note: 'In virtual scroll, use boundingRect instead of offsetTop'
                  });

                  if (overlap) {
                    console.warn('[Mode Switch Debug] ⚠️ OVERLAP DETECTED! Messages are visually overlapping!');
                  } else {
                    console.log('[Mode Switch Debug] ✅ No overlap detected');
                  }
                }
              }
            }
            console.log('[Mode Switch Debug] === MODE SWITCH END ===');
          }, 100); // Wait 100ms for DOM to stabilize
        }).catch((err) => {
          console.error('[Mode Switch Debug] Animation error:', err);
        });
      }
    }

    prevAppModeRef.current = appMode;
  }, [appMode, widthMotionValue]);

  useEffect(() => {
    if (appMode !== 'chat') return;

    const parentEl = chatContainerRef.current?.parentElement;
    if (!parentEl) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (isResizingRef.current) return;
        if (currentAnimationRef.current) return;
        const newWidth = entry.contentRect.width;
        if (newWidth > 0) {
          widthMotionValue.set(newWidth);
        }
      }
    });

    observer.observe(parentEl);
    return () => observer.disconnect();
  }, [appMode, widthMotionValue]);

  useEffect(() => {
    if (appMode !== 'command') return;
    if (isResizingRef.current) return;

    const timeSinceSwitch = Date.now() - modeSwitchTimeRef.current;
    if (timeSinceSwitch < MODE_SWITCH_LOCK_DURATION) return;

    const parentEl = chatContainerRef.current?.parentElement;
    if (!parentEl) return;

    const parentWidth = parentEl.getBoundingClientRect().width;
    const currentWidth = commandChatWidthRef.current;
    const maxAllowedWidth = Math.min(Math.max(parentWidth - 200, 350), 580);

    if (currentWidth > maxAllowedWidth) {
      const finalWidth = Math.max(Math.min(currentWidth, maxAllowedWidth), 350);
      setCommandChatWidth(finalWidth);
      widthMotionValue.set(finalWidth);
    }
  }, [isSidebarExpanded, isToolPanelOpen, appMode, widthMotionValue]);

  const handleMouseMove = React.useCallback((e: MouseEvent) => {
    if (!isResizingRef.current || !chatContainerRef.current) return;
    const rect = chatContainerRef.current.getBoundingClientRect();
    const newWidth = Math.min(Math.max(e.clientX - rect.left, 350), 580);
    widthMotionValue.set(newWidth);
    setCommandChatWidth(Math.round(newWidth));
  }, [widthMotionValue]);

  const handleMouseUp = React.useCallback(() => {
    if (!isResizingRef.current) return;
    isResizingRef.current = false;

    if (chatContainerRef.current) {
      const computedWidth = chatContainerRef.current.getBoundingClientRect().width;
      const finalWidth = Math.min(Math.max(Math.round(computedWidth), 350), 580);
      widthMotionValue.set(finalWidth);
      setIsResizing(false);
      setCommandChatWidth(finalWidth);
      localStorage.setItem('nexus_command_chat_width', String(finalWidth));
    } else {
      setIsResizing(false);
    }

    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = '';
  }, [widthMotionValue, handleMouseMove]);

  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    isResizingRef.current = true;
    setIsResizing(true);
    document.addEventListener('mousemove', handleMouseMove, { passive: true });
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

    if (currentRoundId) {
      addSearchToRound(currentRoundId, newGroup);
    } else {
      setSearchGroups(prev => [newGroup, ...prev]);
    }
    addLog(`Agent 网络搜索完成: ${results.length} 个结果`, 'info');
  }, [currentSessionId, currentRoundId, setSearchGroups, addSearchToRound, addLog]);

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

    if (plan.steps.length > 1 && plan.status === 'planning') {
      setAppMode('command');
    }

    const todoItems = taskPlanToTodoItems(plan);
    const timestamp = Date.now();

    setMessages(prev => prev.map(m => {
      if (m.id === messageId) {
        return {
          ...m,
          todos: todoItems,
          updatedAt: timestamp,
        };
      }
      return m;
    }));

    if (currentRoundId) {
      setTaskRounds(prev => prev.map(round =>
        round.id === currentRoundId
          ? { ...round, todos: todoItems, updatedAt: timestamp }
          : round
      ));
    }
  }, [setMessages, currentRoundId, setTaskRounds]);

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

  const diffOpenRef = useRef<((path: string, original: string, newContent: string) => void) | null>(null);
  const shellOutputRef = useRef<((command: string, stdout: string, stderr: string, exitCode: number) => void) | null>(null);

  const handleDiffOpen = useCallback((filePath: string, originalContent: string, newContent: string) => {
    setAppMode('command');
    diffOpenRef.current?.(filePath, originalContent, newContent);
  }, [setAppMode]);

  const handleFilesWritten = useCallback((files: Array<{ path: string; isNew: boolean }>) => {
    const messageId = currentExecutionMessageIdRef.current;
    if (!messageId) return;

    const fileLines = files.map(f => {
      const label = f.isNew ? '📄 新建' : '✏️ 修改';
      return `${label}: ${f.path}`;
    }).join('\n');

    setMessages(prev => prev.map(m => {
      if (m.id === messageId) {
        const separator = m.content ? '\n\n---\n' : '';
        return {
          ...m,
          content: m.content + separator + fileLines,
        };
      }
      return m;
    }));
  }, [setMessages]);

  const handleShellOutput = useCallback((command: string, stdout: string, stderr: string, exitCode: number) => {
    shellOutputRef.current?.(command, stdout, stderr, exitCode);
  }, []);

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
      onDiffOpen: handleDiffOpen,
      onShellOutput: handleShellOutput,
      onFilesWritten: handleFilesWritten,
    }), [handleWebSearchResult, handleExecutionUpdate, handleContentChunk, handleTaskPlanUpdate, handleDiffOpen, handleShellOutput, handleFilesWritten])
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const estimateTokens = (text: string) => {
    if (!text) return 0;
    const cjkCount = (text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g) || []).length;
    const nonCjkLength = text.length - cjkCount;
    return Math.ceil(cjkCount / 1.5 + nonCjkLength / 4);
  };

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

    const roundId = startNewRound(messageContent, sessionId);

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
      completeCurrentRound();
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
    
    if (currentRoundId) {
      setSearchGroups(prev => prev.filter(g => g.roundId !== currentRoundId));
      setTaskRounds(prev => prev.map(r =>
        r.id === currentRoundId ? { ...r, searchGroups: [], todos: [], status: 'failed' as const } : r
      ));
    }
    const newRoundId = startNewRound(lastUserMsg.content, currentSessionId || '');
    
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

  const handleFileOpenSwitchMode = useCallback(() => {
    setAppMode('command');
  }, [setAppMode]);

  return (
    <ErrorBoundary>
    <FileViewerProvider onFileOpen={handleFileOpenSwitchMode}>
    <TerminalProvider>
    <CanvasBridgeInner diffOpenRef={diffOpenRef} shellOutputRef={shellOutputRef} />
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

      <main ref={mainContentRef} className="flex-1 flex flex-col min-w-0 relative overflow-hidden">
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
                setIsToolPanelOpen={handleSetToolPanelOpen}
                isSidebarExpanded={isSidebarExpanded}
                setIsSidebarExpanded={handleSetSidebarExpanded}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div className={cn("flex-1 flex flex-col overflow-hidden relative", isDarkMode ? "bg-zinc-800" : "bg-zinc-50")}>
          {activeTab === 'chat' && (
            <div className="h-full flex flex-row w-full overflow-hidden relative">
              <motion.div 
                ref={chatContainerRef}
                className={cn(
                  "flex flex-col h-full relative overflow-hidden shrink-0",
                  appMode === 'command' ? "border-r" : "",
                  isDarkMode ? "border-zinc-700" : "border-zinc-200"
                )}
                initial={false}
                style={{
                  width: widthMotionValue,
                }}
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
                <ChatViewOptimized 
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
                  commandChatWidth={commandChatWidth}
                  isResizingWidth={isResizing}
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
                  <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{
                      duration: 0.25,
                      delay: 0.1,
                      ease: [0.4, 0, 0.2, 1],
                    }}
                    className="flex-1 min-w-0 overflow-hidden"
                  >
                    <CanvasWorkspace 
                      isDarkMode={isDarkMode} 
                      isToolPanelOpen={isToolPanelOpen}
                      setIsToolPanelOpen={setIsToolPanelOpen}
                    />
                  </motion.div>
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
    </TerminalProvider>
    </FileViewerProvider>
    </ErrorBoundary>
  );
}

