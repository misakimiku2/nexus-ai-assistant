import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { 
  Cpu, ShieldAlert, CheckCircle, XCircle, Wrench, Bot, Database, Globe, Shield, Layout, Terminal, Brain, FileEdit, AlertTriangle, ChevronDown, ChevronUp, User, Edit2,
  Copy, RotateCcw, ChevronLeft, ChevronRight, Check, FileText, PanelLeftOpen, PanelLeftClose, ArrowUp, ArrowDown, Loader2, Eye
} from 'lucide-react';
import { cn } from '../lib/utils';
import { McpTool, PendingAction, Message, TodoItem, AppMode } from '../types';
import { AgentStatus, ReasoningStep, ToolCallRecord } from '../agent/types';
import { useGlobalState } from '../context/GlobalStateContext';
import { TodoContainer } from './TodoCard';

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

import { formatExecutionTime } from '../utils/format';

const openExternalLink = async (url: string) => {
  try {
    const { open } = await import('@tauri-apps/plugin-shell');
    await open(url);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
};

const MAX_IMAGE_WIDTH = 330;

interface MessageImageProps {
  src: string;
  alt: string;
  isDarkMode: boolean;
  maxWidth?: number;
}

const MessageImage: React.FC<MessageImageProps> = ({ src, alt, isDarkMode, maxWidth = MAX_IMAGE_WIDTH }) => {
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = src;
  }, [src]);

  const displayWidth = dimensions 
    ? Math.min(dimensions.width, maxWidth) 
    : maxWidth;
  
  const displayHeight = dimensions && dimensions.width > maxWidth
    ? Math.round((maxWidth / dimensions.width) * dimensions.height)
    : dimensions?.height || 0;

  return (
    <div 
      className={cn(
        "rounded-lg overflow-hidden border inline-block max-w-full",
        isDarkMode ? "border-zinc-600" : "border-zinc-200"
      )}
      style={{ 
        maxWidth: `${displayWidth}px`,
        width: dimensions ? `${displayWidth}px` : 'auto'
      }}
    >
      <img 
        src={src} 
        alt={alt}
        className="block"
        style={{ 
          imageRendering: 'auto',
          width: dimensions ? '100%' : 'auto',
          height: 'auto'
        }}
      />
    </div>
  );
};

interface ChatViewProps {
  pendingAction: PendingAction | null;
  handleApproveAction: () => void;
  handleRejectAction: () => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  isDarkMode: boolean;
  handleEditMessage?: (messageId: string, newContent: string) => void;
  handleRegenerateMessage?: (messageId: string) => void;
  handleSwitchVersion?: (messageId: string, index: number) => void;
  isWaitingForResponse?: boolean;
  isSearching?: boolean;
  appMode?: AppMode;
  isSidebarExpanded?: boolean;
  setIsSidebarExpanded?: (expanded: boolean) => void;
  scrollResetKey?: number;
  commandChatWidth?: number;
}

const iconMap: Record<string, React.ElementType> = {
  Cpu,
  Database,
  Globe,
  Shield,
  Layout,
  Terminal,
  Bot
};

const CollapsibleSection: React.FC<{ title: string | React.ReactNode; icon: React.ReactNode; children: React.ReactNode; isDarkMode: boolean; defaultOpen?: boolean; contentClassName?: string }> = ({ title, icon, children, isDarkMode, defaultOpen = false, contentClassName }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  useEffect(() => {
    if (defaultOpen) {
      setIsOpen(true);
    }
  }, [defaultOpen]);

  const toggleOpen = () => setIsOpen(!isOpen);

  return (
    <div className={cn("mt-2 mb-3 rounded-xl border overflow-hidden", isDarkMode ? "border-zinc-600 bg-zinc-700/30" : "border-zinc-200 bg-zinc-50")}>
      <button 
        onClick={toggleOpen}
        className={cn("w-full flex items-center justify-between px-4 py-2 text-sm font-medium transition-colors", isDarkMode ? "hover:bg-zinc-700/50 text-zinc-300" : "hover:bg-zinc-200/50 text-zinc-700")}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span>{title}</span>
        </div>
        {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div 
              onClick={toggleOpen}
              className={cn("p-4 border-t cursor-pointer", isDarkMode ? "border-zinc-600" : "border-zinc-200", contentClassName)}
            >
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const ChatView: React.FC<ChatViewProps> = ({
  pendingAction,
  handleApproveAction,
  handleRejectAction,
  scrollRef,
  isDarkMode,
  handleEditMessage,
  handleRegenerateMessage,
  handleSwitchVersion,
  isWaitingForResponse,
  isSearching,
  appMode = 'chat',
  isSidebarExpanded = false,
  setIsSidebarExpanded = () => {},
  scrollResetKey = 0,
  commandChatWidth
}) => {
  const { messages, isStreaming, sessions, currentSessionId, userName, aiName, userAvatar, aiAvatar, fontFamily, agents, modelName } = useGlobalState();
  
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const userImageMaxWidth = commandChatWidth 
    ? Math.min(MAX_IMAGE_WIDTH, Math.floor(commandChatWidth * 0.85 - 32))
    : MAX_IMAGE_WIDTH;

  // Use ref to store latest messages to avoid re-creating scroll handler
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const currentSession = sessions.find(s => s.id === currentSessionId);
  const activeAgentId = currentSession?.activeAgents?.[0];
  const activeAgent = activeAgentId ? agents.find(a => a.id === activeAgentId) : null;
  const AgentIcon = activeAgent ? (iconMap[activeAgent.avatar] || Bot) : Cpu;

  const userScrolledRef = useRef(false);
  const lastScrollTopRef = useRef(0);

  useEffect(() => {
    userScrolledRef.current = false;
  }, [scrollResetKey]);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const handleScroll = () => {
      const currentScrollTop = scrollEl.scrollTop;
      const scrollDirection = currentScrollTop - lastScrollTopRef.current;
      lastScrollTopRef.current = currentScrollTop;
      
      const isAtBottom = currentScrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 30;
      
      if (scrollDirection < 0 && !isAtBottom) {
        userScrolledRef.current = true;
      } else if (isAtBottom) {
        userScrolledRef.current = false;
      }
    };

    scrollEl.addEventListener('scroll', handleScroll);
    return () => scrollEl.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (scrollRef.current && !userScrolledRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages, isStreaming]);

  // Scroll tracking for active message
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const handleScroll = () => {
      setCanScrollUp(scrollEl.scrollTop > 50);
      setCanScrollDown(scrollEl.scrollTop + scrollEl.clientHeight < scrollEl.scrollHeight - 50);
      
      const userMessages = messagesRef.current.filter(m => m.role === 'user');
      if (userMessages.length === 0) return;

      let currentActiveId = userMessages[0].id;
      const scrollPos = scrollEl.scrollTop + 100; // Offset for better detection

      for (const msg of userMessages) {
        const el = document.getElementById(`msg-${msg.id}`);
        if (el && el.offsetTop <= scrollPos) {
          currentActiveId = msg.id;
        } else {
          break;
        }
      }
      setActiveMessageId(prev => prev !== currentActiveId ? currentActiveId : prev);
    };

    scrollEl.addEventListener('scroll', handleScroll);
    // Initial check - use requestAnimationFrame to avoid sync setState
    requestAnimationFrame(handleScroll);
    return () => scrollEl.removeEventListener('scroll', handleScroll);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrollToPreviousMessage = () => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const userMessageEls = Array.from(container.querySelectorAll('[data-role="user"]'));
    const currentScrollTop = container.scrollTop;
    
    let targetMsg = null;
    for (let i = userMessageEls.length - 1; i >= 0; i--) {
      const msg = userMessageEls[i] as HTMLElement;
      if (msg.offsetTop < currentScrollTop - 50) {
        targetMsg = msg;
        break;
      }
    }
    
    const getScrollPos = (el: HTMLElement) => {
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      return elRect.top - containerRect.top + container.scrollTop - 16; // 16px buffer
    };
    
    if (targetMsg) {
      container.scrollTo({ top: getScrollPos(targetMsg as HTMLElement), behavior: 'smooth' });
    } else if (userMessageEls.length > 0) {
      container.scrollTo({ top: getScrollPos(userMessageEls[0] as HTMLElement), behavior: 'smooth' });
    }
  };

  const scrollToNextMessage = () => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const userMessageEls = Array.from(container.querySelectorAll('[data-role="user"]'));
    const currentScrollTop = container.scrollTop;
    
    let targetMsg = null;
    for (let i = 0; i < userMessageEls.length; i++) {
      const msg = userMessageEls[i] as HTMLElement;
      if (msg.offsetTop > currentScrollTop + 100) { // Increased threshold to avoid jumping to current
        targetMsg = msg;
        break;
      }
    }
    
    if (targetMsg) {
      const containerRect = container.getBoundingClientRect();
      const elRect = targetMsg.getBoundingClientRect();
      const targetPos = elRect.top - containerRect.top + container.scrollTop - 16;
      container.scrollTo({ top: targetPos, behavior: 'smooth' });
    }
  };

  const userMessages = messages.filter(m => m.role === 'user');

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      <AnimatePresence>
        {appMode === 'command' && (
          <motion.div 
            data-tauri-drag-region
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 48, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className={cn(
              "border-b flex items-center px-3 gap-2 shrink-0 overflow-hidden",
              isDarkMode ? "border-zinc-600 bg-zinc-700/50" : "border-zinc-200 bg-white"
            )}
          >
            <button 
              onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                isDarkMode ? "hover:bg-zinc-700 text-zinc-400" : "hover:bg-zinc-100 text-zinc-500"
              )}
              title={isSidebarExpanded ? "收起侧边栏" : "展开侧边栏"}
            >
              {isSidebarExpanded ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            </button>
            <div className="flex items-center gap-2 ml-1">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                {modelName}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scroll Up Button Hover Area */}
      {appMode === 'command' && messages.length > 0 && canScrollUp && (
        <div className="absolute top-12 left-0 right-0 h-24 flex justify-center items-start pt-4 opacity-0 hover:opacity-100 transition-opacity duration-300 z-20 pointer-events-none">
          <button
            onClick={scrollToPreviousMessage}
            className={cn(
              "pointer-events-auto backdrop-blur border rounded-full p-2.5 shadow-sm transition-all",
              isDarkMode 
                ? "bg-zinc-700/90 border-zinc-600 text-zinc-400 hover:text-indigo-400 hover:bg-zinc-600" 
                : "bg-white/90 border-zinc-200 text-zinc-500 hover:text-indigo-600 hover:bg-zinc-50"
            )}
            title="跳转到上一条请求"
          >
            <ArrowUp size={20} />
          </button>
        </div>
      )}

      {/* Scroll Down Button Hover Area */}
      {appMode === 'command' && messages.length > 0 && canScrollDown && (
        <div className="absolute bottom-0 left-0 right-0 h-24 flex justify-center items-end pb-4 opacity-0 hover:opacity-100 transition-opacity duration-300 z-20 pointer-events-none">
          <button
            onClick={scrollToNextMessage}
            className={cn(
              "pointer-events-auto backdrop-blur border rounded-full p-2.5 shadow-sm transition-all",
              isDarkMode 
                ? "bg-zinc-700/90 border-zinc-600 text-zinc-400 hover:text-indigo-400 hover:bg-zinc-600" 
                : "bg-white/90 border-zinc-200 text-zinc-500 hover:text-indigo-600 hover:bg-zinc-50"
            )}
            title="跳转到下一条请求"
          >
            <ArrowDown size={20} />
          </button>
        </div>
      )}

      <div 
        ref={scrollRef}
        className={cn(
          "flex-1 overflow-y-auto space-y-8 scroll-smooth z-10",
          appMode === 'command' ? "py-4 px-0 no-scrollbar" : "p-6"
        )}
        style={{ fontFamily }}
      >
        {messages.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto opacity-40">
          <div className="p-4 rounded-full bg-zinc-500/5 mb-4 flex items-center justify-center overflow-hidden">
            {activeAgent?.avatar?.startsWith('data:image') ? (
              <img src={activeAgent.avatar} alt="" className="w-16 h-16 object-cover rounded-full" />
            ) : (
              <AgentIcon size={48} strokeWidth={1} />
            )}
          </div>
          <h2 className="text-xl font-medium mb-2">
            {activeAgent ? `我是 ${activeAgent.name}，今天我能帮您什么？` : '今天我能帮您什么？'}
          </h2>
          <p className="text-sm">
            {activeAgent ? activeAgent.description : '连接到本地 LM Studio 即可开始对话。您的数据将始终保存在本地。'}
          </p>
        </div>
      ) : (
        <>
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
          let senderName = isUser ? userName : aiName;
          let AvatarIcon: React.ElementType = isUser ? User : Cpu;
          let avatarUrl = isUser ? userAvatar : aiAvatar;
          
          // Fix AI avatar color for light mode
          let avatarColor = isUser 
            ? "bg-indigo-600 text-white shadow-sm" 
            : cn("text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-600 shadow-sm", isDarkMode ? "bg-zinc-700" : "bg-white");

          if (!isUser) {
            if (msg.agentId) {
              const agent = agents.find(a => a.id === msg.agentId);
              if (agent) {
                senderName = agent.name;
                if (agent.avatar?.startsWith('data:image')) {
                  avatarUrl = agent.avatar;
                  AvatarIcon = Bot; // Fallback icon, won't be used if avatarUrl is present
                } else {
                  AvatarIcon = iconMap[agent.avatar] || Bot;
                  avatarUrl = ''; // Agents use icons for now
                }
                // Use agent's theme color if available, otherwise default
                if (agent.themeColor) {
                  avatarColor = `${agent.themeColor} border`;
                }
              }
            } else if (activeAgent) {
              senderName = activeAgent.name;
              if (activeAgent.avatar?.startsWith('data:image')) {
                avatarUrl = activeAgent.avatar;
                AvatarIcon = Bot;
              } else {
                AvatarIcon = AgentIcon;
                avatarUrl = ''; // Active agent uses icon
              }
            }
          }

          return (
            <motion.div 
              key={msg.id}
              id={`msg-${msg.id}`}
              data-role={msg.role}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "flex flex-col gap-1 mx-auto w-full",
                appMode === 'command' ? "max-w-4xl items-stretch" : (isUser ? "max-w-4xl items-end" : "max-w-4xl items-start")
              )}
            >
              <div className={cn(
                "flex w-full",
                appMode === 'command' 
                  ? "flex-col group relative px-[20px]" 
                  : (isUser ? "flex-row-reverse gap-4 items-start" : "flex-row gap-4 items-start")
              )}>
                {appMode === 'command' ? (
                  <div className={cn(
                    "flex items-center gap-3 mb-2",
                    isUser ? "justify-end" : "justify-start"
                  )}>
                    {isUser ? (
                      <>
                        <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">{senderName}</span>
                        <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0 overflow-hidden", avatarColor)}>
                          {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover rounded-xl" /> : <AvatarIcon size={24} />}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0 overflow-hidden", avatarColor)}>
                          {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover rounded-xl" /> : <AvatarIcon size={24} />}
                        </div>
                        <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">{senderName}</span>
                      </>
                    )}
                  </div>
                ) : (
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 overflow-hidden",
                    avatarColor
                  )}>
                    {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover rounded-xl" /> : <AvatarIcon size={24} />}
                  </div>
                )}
                <div className={cn(
                  "flex flex-col gap-1",
                  appMode === 'command' 
                    ? (isUser ? "max-w-[85%] self-end text-left" : "w-full text-left") 
                    : (isUser ? "max-w-[85%] items-start" : "max-w-[85%] items-start")
                )}>
                  {appMode !== 'command' && (
                    <span className="text-[13px] font-medium text-zinc-600 dark:text-zinc-300 leading-none pt-1 pb-1">
                      {senderName}
                    </span>
                  )}
                  <div className={cn(
                    "space-y-2 w-full",
                    appMode === 'command' 
                      ? (isUser ? "flex flex-col items-end" : "flex flex-col items-start") 
                      : "text-left"
                  )}>
                  {msg.content === 'SMB_REPAIR_CARD' ? (
                <div className={cn(
                  "inline-block p-4 rounded-2xl text-sm leading-relaxed border border-indigo-500/30",
                  isDarkMode ? "bg-indigo-500/10" : "bg-indigo-50"
                )}>
                  <div className="flex items-center gap-2 text-indigo-500 font-medium mb-2">
                    <Wrench size={18} />
                    <span>SMB 修复建议</span>
                  </div>
                  <p className="mb-3 opacity-80">检测到 445 端口未响应，这通常是因为 SMB 服务未启动或被防火墙拦截。建议执行以下操作：</p>
                  <ul className="list-disc list-inside space-y-1 opacity-80 mb-4">
                    <li>检查 Windows 服务中的 "Server" 服务是否正在运行。</li>
                    <li>检查防火墙入站规则，确保允许端口 445 (TCP) 的流量。</li>
                    <li>确认网络发现和文件共享已开启。</li>
                  </ul>
                  <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-medium transition-colors">
                    一键应用修复
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {(msg.thinking || (msg.agentExecution && msg.agentExecution.reasoningSteps.length > 0)) && (
                    <CollapsibleSection 
                      title={
                        <div className="flex items-center gap-2">
                          <span>思考过程</span>
                          {isStreaming && msg.id === messages[messages.length - 1]?.id && (
                            <span className="flex gap-1 items-center">
                              <span className="w-1 h-1 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                              <span className="w-1 h-1 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                              <span className="w-1 h-1 bg-purple-500 rounded-full animate-bounce"></span>
                            </span>
                          )}
                          {(msg.thinking || (msg.agentExecution && msg.agentExecution.reasoningSteps.length > 0)) && (
                            <span className="text-xs opacity-60 ml-2">
                              步骤 {(msg.thinking ? 1 : 0) + (msg.agentExecution?.reasoningSteps?.length || 0)}
                            </span>
                          )}
                        </div>
                      }
                      icon={<Brain size={16} className="text-purple-500" />} 
                      isDarkMode={isDarkMode}
                      contentClassName={isDarkMode ? "bg-zinc-700/50" : "bg-zinc-200/50"}
                      defaultOpen={!!(isStreaming && msg.id === messages[messages.length - 1]?.id && (msg.thinking || (msg.agentExecution && msg.agentExecution.reasoningSteps.length > 0)))}
                    >
                      <div className="space-y-2">
                        {msg.thinking && (
                          <div className="flex items-start gap-2 text-xs">
                            <div className="mt-0.5 shrink-0">
                              <Brain className="w-3.5 h-3.5 text-blue-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-[10px] uppercase font-medium text-blue-500">思考</span>
                              <div className={cn(
                                "prose prose-sm max-w-none opacity-80 text-xs mt-0.5",
                                isDarkMode ? "prose-invert" : ""
                              )}>
                                <ReactMarkdown>{msg.thinking}</ReactMarkdown>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {msg.agentExecution && msg.agentExecution.reasoningSteps.map((step) => {
                          const getStepIcon = (type: ReasoningStep['type']) => {
                            switch (type) {
                              case 'thought':
                                return <Brain className="w-3.5 h-3.5 text-blue-500" />;
                              case 'action':
                                return <Wrench className="w-3.5 h-3.5 text-amber-500" />;
                              case 'observation':
                                return <Eye className="w-3.5 h-3.5 text-purple-500" />;
                            }
                          };

                          const getToolDisplayName = (toolName: string): string => {
                            const toolNames: Record<string, string> = {
                              'web_search': '网络搜索',
                              'http_request': 'HTTP请求',
                              'calculate': '计算',
                              'get_current_time': '获取时间',
                            };
                            return toolNames[toolName] || toolName;
                          };
                          
                          return (
                            <div key={step.id} className="flex items-start gap-2 text-xs">
                              <div className="mt-0.5 shrink-0">{getStepIcon(step.type)}</div>
                              <div className="flex-1 min-w-0">
                                <span className={cn(
                                  "text-[10px] uppercase font-medium",
                                  step.type === 'thought' ? 'text-blue-500' :
                                  step.type === 'action' ? 'text-amber-500' : 'text-purple-500'
                                )}>
                                  {step.type === 'thought' ? '思考' : 
                                   step.type === 'action' ? '行动' : '观察'}
                                </span>
                                {step.type === 'action' && step.toolName && (
                                  <div className="mt-1 flex items-center gap-2">
                                    <span>
                                      使用<span className="text-blue-500 font-medium mx-1">{getToolDisplayName(step.toolName)}</span>：
                                      <span className="opacity-80">{(step.toolParams?.query || step.toolParams?.url || JSON.stringify(step.toolParams)) as string}</span>
                                    </span>
                                    {step.executionStatus && (
                                      <span className={cn(
                                        "px-1.5 py-0.5 rounded text-[10px]",
                                        step.executionStatus === 'executing' 
                                          ? "bg-amber-500/20 text-amber-500" 
                                          : "bg-emerald-500/20 text-emerald-500"
                                      )}>
                                        {step.executionStatus === 'executing' ? '执行中...' : '执行完成'}
                                      </span>
                                    )}
                                  </div>
                                )}
                                {step.type === 'observation' && step.observationData && step.observationData.length > 0 && (
                                  <div className="mt-1 space-y-1">
                                    {step.observationData.map((item, idx) => (
                                      <div 
                                        key={idx}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openExternalLink(item.url);
                                        }}
                                        className="block text-blue-500 hover:underline truncate cursor-pointer"
                                      >
                                        {item.title}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {step.type === 'thought' && step.content && (
                                  <p className="opacity-80 mt-0.5">{step.content}</p>
                                )}
                                {step.type === 'observation' && step.content && !step.observationData && (
                                  <p className="opacity-80 mt-0.5">{step.content}</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CollapsibleSection>
                  )}

                  {msg.fileEdits && msg.fileEdits.length > 0 && (
                    <CollapsibleSection title={`文件修改 (${msg.fileEdits.length} 个文件)`} icon={<FileEdit size={16} className="text-emerald-500" />} isDarkMode={isDarkMode} defaultOpen={true}>
                      <div className="space-y-4">
                        {msg.fileEdits.map((edit, idx) => (
                          <div key={`${edit.file}-${idx}`} className="text-sm">
                            <div className="flex items-center gap-2 mb-2 font-mono text-xs">
                              <span className="opacity-70">{edit.file}</span>
                              {edit.status === 'success' ? (
                                <span className="text-emerald-500 flex items-center gap-1"><CheckCircle size={12} /> 成功</span>
                              ) : (
                                <span className="text-red-500 flex items-center gap-1"><XCircle size={12} /> 失败</span>
                              )}
                            </div>
                            <div className="rounded-lg overflow-hidden text-xs">
                              <SyntaxHighlighter
                                language="diff"
                                style={isDarkMode ? vscDarkPlus : vs}
                                wrapLongLines={true}
                                customStyle={{ margin: 0, padding: '12px', fontSize: '12px' }}
                              >
                                {edit.diff}
                              </SyntaxHighlighter>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CollapsibleSection>
                  )}

                  {msg.todos && msg.todos.length > 0 && (
                    <TodoContainer todos={msg.todos} />
                  )}

                  {((msg.content && (msg.agentExecution?.status === 'responding' || msg.agentExecution?.status === 'completed')) || (msg.content && !msg.agentExecution) || (msg.role === 'assistant' && !msg.content && (isWaitingForResponse || isSearching) && msg.id === messages[messages.length - 1]?.id)) && (
                    <div className={cn(
                      "inline-block break-words",
                      msg.role === 'user' 
                        ? "bg-indigo-600 text-white rounded-tr-none px-4 py-3 rounded-2xl text-sm leading-relaxed" 
                        : (msg.content || (isWaitingForResponse || isSearching) ? (appMode === 'command' ? "w-full text-sm leading-relaxed" : "glass rounded-tl-none px-4 py-3 rounded-2xl text-sm leading-relaxed") : "")
                    )}>
                      {msg.role === 'assistant' && !msg.content && !msg.agentExecution?.reasoningSteps?.length && (isWaitingForResponse || isSearching) && msg.id === messages[messages.length - 1]?.id && (
                        <div className="flex flex-col gap-2 min-w-[120px] py-2">
                          {isSearching && (
                            <div className="flex items-center gap-2 text-emerald-500 animate-pulse">
                              <Globe size={14} className="animate-spin-slow" />
                              <span className="text-xs font-bold uppercase tracking-wider">正在联网搜索相关信息...</span>
                            </div>
                          )}
                          {isWaitingForResponse && (
                            <div className="flex items-center gap-2 animate-pulse">
                              <div className="flex gap-1">
                                <motion.div 
                                  animate={{ scale: [1, 1.2, 1] }}
                                  transition={{ repeat: Infinity, duration: 1 }}
                                  className="w-1.5 h-1.5 bg-indigo-500 rounded-full"
                                />
                                <motion.div 
                                  animate={{ scale: [1, 1.2, 1] }}
                                  transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
                                  className="w-1.5 h-1.5 bg-indigo-500 rounded-full"
                                />
                                <motion.div 
                                  animate={{ scale: [1, 1.2, 1] }}
                                  transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
                                  className="w-1.5 h-1.5 bg-indigo-500 rounded-full"
                                />
                              </div>
                              <span className="text-xs opacity-60 font-medium">模型正在处理 Prompt...</span>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {msg.role === 'assistant' ? (
                        <div className="flex flex-col gap-2">
                          <div className={cn(
                            "prose prose-sm max-w-none prose-pre:p-0 prose-pre:m-0 prose-pre:bg-transparent break-words overflow-hidden",
                            isDarkMode ? "prose-invert" : ""
                          )}>
                            <ReactMarkdown
                              components={{
                                code({node, inline, className, children, ...props}: any) {
                                  const match = /language-(\w+)/.exec(className || '')
                                  const codeContent = String(children).replace(/\n$/, '');
                                  // Stable ID based on content to prevent regeneration on re-render
                                  const codeId = `code-${codeContent.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a }, 0)}`;
                                  
                                  return !inline && match ? (
                                    <div className={cn(
                                      "relative group/code my-4 rounded-xl overflow-hidden border shadow-none",
                                      isDarkMode ? "border-zinc-600" : "border-zinc-200"
                                    )}>
                                      {/* Code Header */}
                                      <div className={cn(
                                        "flex items-center justify-between px-4 py-2 border-b",
                                        isDarkMode ? "bg-zinc-700/50 border-zinc-600" : "bg-[#f5f5f5] border-zinc-200"
                                      )}>
                                        <span className={cn(
                                          "text-[10px] font-bold uppercase tracking-widest",
                                          isDarkMode ? "text-zinc-400" : "text-zinc-500"
                                        )}>
                                          {match[1]}
                                        </span>
                                        <button
                                          onClick={() => handleCopy(codeContent, codeId)}
                                          className={cn(
                                            "p-1 rounded transition-all",
                                            copiedId === codeId 
                                              ? "text-emerald-500" 
                                              : isDarkMode ? "text-zinc-400 hover:text-zinc-200" : "text-zinc-500 hover:text-zinc-700"
                                          )}
                                          title="复制代码"
                                        >
                                          {copiedId === codeId ? <Check size={14} /> : <Copy size={14} />}
                                        </button>
                                      </div>

                                      <SyntaxHighlighter
                                        {...props}
                                        style={isDarkMode ? vscDarkPlus : oneLight}
                                        language={match[1]}
                                        PreTag="div"
                                        wrapLongLines={true}
                                        customStyle={{ 
                                          margin: 0, 
                                          borderRadius: '0', 
                                          fontSize: '12px', 
                                          padding: '1.25rem',
                                          background: isDarkMode ? '#1e1e1e' : '#FBFBFB',
                                          lineHeight: '1.5'
                                        }}
                                        codeTagProps={{
                                          style: {
                                            fontFamily: 'var(--font-mono)',
                                            fontSize: 'inherit'
                                          }
                                        }}
                                      >
                                        {codeContent}
                                      </SyntaxHighlighter>
                                    </div>
                                  ) : (
                                    <code {...props} className={cn(
                                      className,
                                      "px-1.5 py-0.5 rounded font-mono text-[0.9em]",
                                      isDarkMode ? "bg-zinc-700 text-zinc-200" : "bg-zinc-100 text-zinc-800"
                                    )}>
                                      {children}
                                    </code>
                                  )
                                }
                              }}
                            >
                              {msg.content}
                            </ReactMarkdown>
                          </div>

                          {/* Assistant Message Actions - Moved to footer */}
                        </div>
                      ) : editingMessageId === msg.id ? (
                        <div className="flex flex-col gap-2 min-w-[200px]">
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className={cn(
                              "w-full p-3 rounded-xl text-sm resize-none focus:outline-none",
                              isUser 
                                ? "bg-white/15 text-white placeholder:text-white/50" 
                                : "bg-zinc-500/10 text-zinc-800 dark:text-zinc-200"
                            )}
                            rows={5}
                            autoFocus
                          />
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="flex flex-col gap-2">
                              {msg.attachments.map(attachment => (
                                <div key={attachment.id}>
                                  {attachment.type === 'image' ? (
                                    <MessageImage 
                                      src={attachment.data} 
                                      alt={attachment.name}
                                      isDarkMode={isDarkMode}
                                      maxWidth={appMode === 'command' && isUser ? userImageMaxWidth : MAX_IMAGE_WIDTH}
                                    />
                                  ) : (
                                    <div className={cn(
                                      "flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs",
                                      isDarkMode 
                                        ? "bg-zinc-700 border-zinc-600 text-zinc-300" 
                                        : "bg-zinc-100 border-zinc-200 text-zinc-600"
                                    )}>
                                      <FileText size={12} />
                                      <span className="max-w-[100px] truncate">{attachment.name}</span>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setEditingMessageId(null)}
                              className={cn(
                                "px-3 py-1.5 text-xs rounded-lg transition-colors",
                                isUser ? "bg-white/10 hover:bg-white/20 text-white" : "bg-zinc-500/10 hover:bg-zinc-500/20 text-zinc-500"
                              )}
                            >
                              取消
                            </button>
                            <button
                              onClick={() => {
                                handleEditMessage?.(msg.id, editContent);
                                setEditingMessageId(null);
                              }}
                              className={cn(
                                "px-3 py-1.5 text-xs rounded-lg transition-colors font-medium shadow-sm",
                                isUser ? "bg-white text-indigo-600 hover:bg-zinc-100" : "bg-indigo-600 text-white hover:bg-indigo-700"
                              )}
                            >
                              保存{isUser ? "并重新发送" : ""}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <div className="whitespace-pre-wrap break-words break-all">{msg.content}</div>
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="flex flex-col gap-2 mt-1">
                              {msg.attachments.map(attachment => (
                                <div key={attachment.id}>
                                  {attachment.type === 'image' ? (
                                    <MessageImage 
                                      src={attachment.data} 
                                      alt={attachment.name}
                                      isDarkMode={isDarkMode}
                                      maxWidth={appMode === 'command' && isUser ? userImageMaxWidth : MAX_IMAGE_WIDTH}
                                    />
                                  ) : (
                                    <div className={cn(
                                      "flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs",
                                      isDarkMode 
                                        ? "bg-zinc-700 border-zinc-600 text-zinc-300" 
                                        : "bg-zinc-100 border-zinc-200 text-zinc-600"
                                    )}>
                                      <FileText size={12} />
                                      <span className="max-w-[100px] truncate">{attachment.name}</span>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {msg.error && (
                    <div className={cn(
                      "mt-2 p-3 rounded-xl border text-sm flex items-start gap-2",
                      isDarkMode ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-red-50 border-red-200 text-red-600"
                    )}>
                      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                      <div>
                        <div className="font-medium mb-1">执行出错</div>
                        <div className="opacity-80">{msg.error}</div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {!(appMode === 'command' && !isUser) && (
                <div className={cn(
                  "text-[10px] opacity-40 font-mono flex flex-wrap items-center gap-x-3 gap-y-1 group/footer",
                  isUser ? "justify-end" : "justify-start"
                )}>
                  {/* User Message Actions - 在对话模式下放在时间左边 */}
                  {msg.role === 'user' && !isStreaming && !editingMessageId && appMode !== 'command' && (
                    <div className="flex items-center gap-1.5 opacity-100">
                      <button
                        onClick={() => handleCopy(msg.content, `user-copy-${msg.id}`)}
                        className={cn(
                          "px-2 py-1 rounded-md transition-colors flex items-center gap-1.5 border",
                          isDarkMode 
                            ? "bg-zinc-700 hover:bg-zinc-600 text-zinc-300 border-zinc-600" 
                            : "bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-200"
                        )}
                        title="复制消息"
                      >
                        {copiedId === `user-copy-${msg.id}` ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                        <span className="text-[11px] font-medium">复制</span>
                      </button>
                      <button
                        onClick={() => {
                          setEditContent(msg.content);
                          setEditingMessageId(msg.id);
                        }}
                        className={cn(
                          "px-2 py-1 rounded-md transition-colors flex items-center gap-1.5 border",
                          isDarkMode 
                            ? "bg-zinc-700 hover:bg-zinc-600 text-zinc-300 border-zinc-600" 
                            : "bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-200"
                        )}
                        title="编辑消息"
                      >
                        <Edit2 size={12} />
                        <span className="text-[11px] font-medium">编辑</span>
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5">
                    <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {msg.mode === 'command' && <span>• 命令模式</span>}
                    {msg.role === 'assistant' && msg.executionTime !== undefined && (
                      <>
                        <span>•</span>
                        <span>{formatExecutionTime(msg.executionTime)}</span>
                        <span>•</span>
                        <span>{msg.tokenCount} tokens</span>
                        <span>•</span>
                        <span>{msg.tokenSpeed} tok/s</span>
                      </>
                    )}
                  </div>

                  {/* User Message Actions - 命令模式下纯图标按钮 */}
                  {msg.role === 'user' && !isStreaming && !editingMessageId && appMode === 'command' && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleCopy(msg.content, `user-copy-${msg.id}`)}
                        className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-600 rounded-lg transition-colors"
                        title="复制消息"
                      >
                        {copiedId === `user-copy-${msg.id}` ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                      </button>
                      <button
                        onClick={() => {
                          setEditContent(msg.content);
                          setEditingMessageId(msg.id);
                        }}
                        className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-600 rounded-lg transition-colors"
                        title="编辑消息"
                      >
                        <Edit2 size={14} />
                      </button>
                    </div>
                  )}

                  {/* Assistant Message Actions - Relocated here */}
                  {msg.role === 'assistant' && !isStreaming && (
                    <div className="flex items-center gap-1.5 opacity-100">
                      <button
                        onClick={() => handleCopy((msg.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim(), `text-${msg.id}`)}
                        className={cn(
                          "px-2 py-1 rounded-md transition-colors flex items-center gap-1.5 border",
                          isDarkMode 
                            ? "bg-zinc-700 hover:bg-zinc-600 text-zinc-300 border-zinc-600" 
                            : "bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-200"
                        )}
                        title="复制文字"
                      >
                        {copiedId === `text-${msg.id}` ? <Check size={12} className="text-emerald-500" /> : <FileText size={12} />}
                        <span className="text-[11px] font-medium">文字</span>
                      </button>
                      <button
                        onClick={() => handleCopy(msg.content, `md-${msg.id}`)}
                        className={cn(
                          "px-2 py-1 rounded-md transition-colors flex items-center gap-1.5 border",
                          isDarkMode 
                            ? "bg-zinc-700 hover:bg-zinc-600 text-zinc-300 border-zinc-600" 
                            : "bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-200"
                        )}
                        title="复制 Markdown"
                      >
                        {copiedId === `md-${msg.id}` ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                        <span className="text-[11px] font-medium">MD</span>
                      </button>
                      <button
                        onClick={() => handleRegenerateMessage?.(msg.id)}
                        className={cn(
                          "px-2 py-1 rounded-md transition-colors flex items-center gap-1.5 border",
                          isDarkMode 
                            ? "bg-zinc-700 hover:bg-zinc-600 text-zinc-300 border-zinc-600" 
                            : "bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-200"
                        )}
                        title="重新回答"
                      >
                        <RotateCcw size={12} />
                        <span className="text-[11px] font-medium">重试</span>
                      </button>
                      <button
                        onClick={() => {
                          setEditContent(msg.content);
                          setEditingMessageId(msg.id);
                        }}
                        className={cn(
                          "px-2 py-1 rounded-md transition-colors flex items-center gap-1.5 border",
                          isDarkMode 
                            ? "bg-zinc-700 hover:bg-zinc-600 text-zinc-300 border-zinc-600" 
                            : "bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-200"
                        )}
                        title="编辑回答"
                      >
                        <Edit2 size={12} />
                        <span className="text-[11px] font-medium">编辑</span>
                      </button>

                      {/* Pagination */}
                      {msg.versions && msg.versions.length > 1 && (
                        <div className={cn(
                          "flex items-center gap-1 ml-1 text-[11px] font-bold px-2 py-1 rounded-md border",
                          isDarkMode 
                            ? "bg-zinc-700 text-zinc-400 border-zinc-600" 
                            : "bg-zinc-100 text-zinc-500 border-zinc-200"
                        )}>
                          <button
                            disabled={(msg.currentVersionIndex || 0) === 0}
                            onClick={() => handleSwitchVersion?.(msg.id, (msg.currentVersionIndex || 0) - 1)}
                            className="p-0.5 rounded hover:bg-zinc-500/10 disabled:opacity-20 transition-colors"
                          >
                            <ChevronLeft size={12} />
                          </button>
                          <span className="px-1">{(msg.currentVersionIndex || 0) + 1}/{msg.versions.length}</span>
                          <button
                            disabled={(msg.currentVersionIndex || 0) === msg.versions.length - 1}
                            onClick={() => handleSwitchVersion?.(msg.id, (msg.currentVersionIndex || 0) + 1)}
                            className="p-0.5 rounded hover:bg-zinc-500/10 disabled:opacity-20 transition-colors"
                          >
                            <ChevronRight size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Actions for Command Mode AI Messages */}
              {appMode === 'command' && !isUser && (
                <div className="flex items-center gap-4 mt-4 pt-2 border-t border-zinc-500/10 text-zinc-500 dark:text-zinc-400">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleCopy((msg.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim(), `text-${msg.id}`)}
                      className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-600 rounded-lg transition-colors"
                      title="复制文字"
                    >
                      {copiedId === `text-${msg.id}` ? <Check size={14} className="text-emerald-500" /> : <FileText size={14} />}
                    </button>
                    <button
                      onClick={() => handleCopy(msg.content, `md-${msg.id}`)}
                      className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-600 rounded-lg transition-colors"
                      title="复制 Markdown"
                    >
                      {copiedId === `md-${msg.id}` ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    </button>
                    <button
                      onClick={() => handleRegenerateMessage?.(msg.id)}
                      className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-600 rounded-lg transition-colors"
                      title="重新回答"
                    >
                      <RotateCcw size={14} />
                    </button>
                    <button
                      onClick={() => {
                        setEditContent(msg.content);
                        setEditingMessageId(msg.id);
                      }}
                      className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-600 rounded-lg transition-colors"
                      title="编辑回答"
                    >
                      <Edit2 size={14} />
                    </button>
                  </div>

                  <div className="flex items-center gap-3 ml-auto text-[10px] font-mono opacity-60">
                    {msg.timestamp && <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                    {msg.tokenCount !== undefined && msg.tokenCount > 0 && <span>{msg.tokenCount}t</span>}
                    {msg.tokenSpeed !== undefined && msg.tokenSpeed > 0 && <span>{msg.tokenSpeed}t/s</span>}
                  </div>
                </div>
              )}
              </div>
            </div>

            </div>
          </motion.div>
          );
        })}
        </>
      )}
      {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
        <div className={cn(
          "flex flex-col gap-1 mx-auto w-full items-start",
          appMode === 'command' ? "max-w-4xl" : "max-w-3xl"
        )}>
          <div className={cn(
            "flex w-full",
            appMode === 'command' ? "flex-row items-stretch group relative px-[20px]" : "flex-row gap-4 items-start"
          )}>
            {appMode !== 'command' && (
              <div className="w-12 h-12 rounded-xl bg-white dark:bg-zinc-700 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-600 shadow-sm flex items-center justify-center shrink-0 animate-pulse">
                {activeAgent?.avatar?.startsWith('data:image') ? (
                  <img src={activeAgent.avatar} alt="" className="w-full h-full object-cover rounded-xl" />
                ) : (
                  <AgentIcon size={24} />
                )}
              </div>
            )}
            <div className={cn(
              "flex flex-col gap-1",
              appMode === 'command' ? "flex-1 min-w-0 text-left" : "max-w-[85%] text-left"
            )}>
              {appMode !== 'command' && (
                <span className="text-[13px] font-medium text-zinc-600 dark:text-zinc-300 leading-none pt-1 pb-1">
                  {activeAgent ? activeAgent.name : 'Nexus-Pro (Local)'}
                </span>
              )}
              <div className={cn(
                "space-y-2 w-full",
                appMode === 'command' ? "flex flex-col items-start" : "text-left"
              )}>
                {appMode === 'command' && (
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-12 h-12 rounded-xl bg-white dark:bg-zinc-700 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-600 shadow-sm flex items-center justify-center shrink-0 animate-pulse">
                      {activeAgent?.avatar?.startsWith('data:image') ? (
                        <img src={activeAgent.avatar} alt="" className="w-full h-full object-cover rounded-xl" />
                      ) : (
                        <AgentIcon size={24} />
                      )}
                    </div>
                    <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">{activeAgent ? activeAgent.name : 'Nexus-Pro (Local)'}</span>
                  </div>
                )}
              <div className={cn(
                "flex items-center gap-3 animate-pulse",
                appMode === 'command' ? "w-full py-2" : "px-4 py-3 rounded-2xl glass rounded-tl-none"
              )}>
                <div className="flex gap-1.5">
                  <motion.div 
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 1 }}
                    className="w-1.5 h-1.5 bg-indigo-500 rounded-full"
                  />
                  <motion.div 
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
                    className="w-1.5 h-1.5 bg-indigo-500 rounded-full"
                  />
                  <motion.div 
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
                    className="w-1.5 h-1.5 bg-indigo-500 rounded-full"
                  />
                </div>
                <span className="text-xs opacity-60 font-medium">准备中...</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      )}
      {pendingAction && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-3xl mx-auto w-full p-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 flex flex-col gap-3"
        >
          <div className="flex items-center gap-2 text-amber-500 font-medium">
            <ShieldAlert size={18} />
            <span>等待授权 (MCP 工具调用)</span>
          </div>
          <div className="text-sm opacity-80">
            <p>服务器 <strong>{pendingAction.serverName}</strong> 请求执行高权限操作：</p>
            <div className={cn(
              "font-mono text-xs p-2 rounded-lg mt-2 border border-zinc-500/20",
              isDarkMode ? "bg-black/20" : "bg-zinc-100/80"
            )}>
              {pendingAction.tool} - {pendingAction.description}
            </div>
          </div>
          <div className="flex gap-3 mt-2">
            <button 
              onClick={handleApproveAction}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30 transition-colors text-sm font-medium"
            >
              <CheckCircle size={16} />
              允许执行
            </button>
            <button 
              onClick={handleRejectAction}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-red-500/20 text-red-500 hover:bg-red-500/30 transition-colors text-sm font-medium"
            >
              <XCircle size={16} />
              拒绝
            </button>
          </div>
        </motion.div>
      )}
      </div>

      {/* Index Rail - Floating Dots */}
      {appMode !== 'command' && userMessages.length > 0 && (
        <div className="absolute right-[20px] top-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 z-50 py-4">
          {userMessages.map((msg) => {
            const isActive = activeMessageId === msg.id;
            return (
              <div key={msg.id} className="relative group/dot">
                <button
                  onClick={() => {
                    const el = document.getElementById(`msg-${msg.id}`);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className={cn(
                    "transition-all duration-300 ease-out",
                    isActive 
                      ? "w-4 h-2 rounded-full bg-indigo-500" 
                      : "w-2 h-2 rounded-full bg-zinc-400/40 hover:bg-zinc-400/80 hover:scale-150"
                  )}
                />
                
                {/* Tooltip */}
                <div className="absolute right-full mr-4 top-1/2 -translate-y-1/2 opacity-0 group-hover/dot:opacity-100 pointer-events-none transition-all duration-200 translate-x-2 group-hover/dot:translate-x-0 z-[60]">
                  <div className={cn(
                    "px-3 py-2 rounded-xl text-xs font-medium shadow-2xl whitespace-nowrap max-w-[240px] truncate border relative",
                    isDarkMode 
                      ? "bg-zinc-700 text-zinc-200 border-zinc-600" 
                      : "bg-white text-zinc-800 border-zinc-200"
                  )}>
                    {msg.content}
                    {/* Arrow */}
                    <div className={cn(
                      "absolute top-1/2 -translate-y-1/2 -right-1 w-2 h-2 rotate-45 border-t border-r",
                      isDarkMode ? "bg-zinc-700 border-zinc-600" : "bg-white border-zinc-200"
                    )} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
