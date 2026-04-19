import React, { useEffect, useState, useRef, useCallback, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { 
  Cpu, ShieldAlert, CheckCircle, XCircle, Wrench, Bot, Database, Globe, Shield, Layout, Terminal, Brain, FileEdit, AlertTriangle, AlertCircle, ChevronDown, ChevronUp, User, Edit2,
  Copy, RotateCcw, ChevronLeft, ChevronRight, Check, FileText, ListTodo, PanelLeftOpen, PanelLeftClose, ArrowUp, ArrowDown, Loader2, Eye
} from 'lucide-react';
import { cn } from '../lib/utils';
import { McpTool, PendingAction, Message, TodoItem, AppMode } from '../types';
import { AgentStatus, ReasoningStep, ToolCallRecord } from '../agent/types';
import { useGlobalState } from '../context/GlobalStateContext';
import { useFileViewer } from '../context/FileViewerContext';
import { MessageItem } from './MessageItem';

const iconMap: Record<string, React.ElementType> = {
  Cpu,
  Database,
  Globe,
  Shield,
  Layout,
  Terminal,
  Bot
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
  isResizingWidth?: boolean;
}

const StreamingIndicator = memo<{
  appMode: AppMode;
  isDarkMode: boolean;
  activeAgent?: { name: string; avatar: string; themeColor?: string } | null;
  AgentIcon: React.ElementType;
}>(({ appMode, isDarkMode, activeAgent, AgentIcon }) => (
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
));

StreamingIndicator.displayName = 'StreamingIndicator';

const PendingActionCard = memo<{
  pendingAction: PendingAction;
  isDarkMode: boolean;
  handleApproveAction: () => void;
  handleRejectAction: () => void;
}>(({ pendingAction, isDarkMode, handleApproveAction, handleRejectAction }) => (
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
));

PendingActionCard.displayName = 'PendingActionCard';

const IndexRailDot = memo<{
  msg: Message;
  isActive: boolean;
  isDarkMode: boolean;
  onClick: () => void;
}>(({ msg, isActive, isDarkMode, onClick }) => (
  <div className="relative group/dot">
    <button
      onClick={onClick}
      className={cn(
        "transition-all duration-300 ease-out",
        isActive 
          ? "w-4 h-2 rounded-full bg-indigo-500" 
          : "w-2 h-2 rounded-full bg-zinc-400/40 hover:bg-zinc-400/80 hover:scale-150"
      )}
    />
    <div className="absolute right-full mr-4 top-1/2 -translate-y-1/2 opacity-0 group-hover/dot:opacity-100 pointer-events-none transition-all duration-200 translate-x-2 group-hover/dot:translate-x-0 z-[60]">
      <div className={cn(
        "px-3 py-2 rounded-xl text-xs font-medium shadow-2xl whitespace-nowrap max-w-[240px] truncate border relative",
        isDarkMode 
          ? "bg-zinc-700 text-zinc-200 border-zinc-600" 
          : "bg-white text-zinc-800 border-zinc-200"
      )}>
        {msg.content}
        <div className={cn(
          "absolute top-1/2 -translate-y-1/2 -right-1 w-2 h-2 rotate-45 border-t border-r",
          isDarkMode ? "bg-zinc-700 border-zinc-600" : "bg-white border-zinc-200"
        )} />
      </div>
    </div>
  </div>
));

IndexRailDot.displayName = 'IndexRailDot';

export const ChatViewOptimized: React.FC<ChatViewProps> = ({
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
  commandChatWidth,
  isResizingWidth = false
}) => {
  const { messages, isStreaming, sessions, currentSessionId, userName, aiName, userAvatar, aiAvatar, fontFamily, agents, modelName } = useGlobalState();
  const { openFile } = useFileViewer();
  
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const handleCopy = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const currentSession = sessions.find(s => s.id === currentSessionId);
  const activeAgentId = currentSession?.activeAgents?.[0];
  const activeAgent = activeAgentId ? agents.find(a => a.id === activeAgentId) : null;
  const AgentIcon = activeAgent ? (iconMap[activeAgent.avatar] || Bot) : Cpu;

  const userScrolledRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const lastWidthRef = useRef(commandChatWidth);
  const scrollRatioRef = useRef(0);
  const isResizingWidthRef = useRef(false);

  useEffect(() => {
    isResizingWidthRef.current = isResizingWidth;
  }, [isResizingWidth]);

  useEffect(() => {
    userScrolledRef.current = false;
  }, [scrollResetKey]);

  const handleScroll = useCallback(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const currentScrollTop = scrollEl.scrollTop;
    const scrollDirection = currentScrollTop - lastScrollTopRef.current;
    lastScrollTopRef.current = currentScrollTop;
    
    const isAtBottom = currentScrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 30;
    
    if (scrollDirection < 0 && !isAtBottom) {
      userScrolledRef.current = true;
    } else if (isAtBottom) {
      userScrolledRef.current = false;
    }

    setCanScrollUp(currentScrollTop > 50);
    setCanScrollDown(currentScrollTop + scrollEl.clientHeight < scrollEl.scrollHeight - 50);
    
    const userMessages = messagesRef.current.filter(m => m.role === 'user');
    if (userMessages.length === 0) return;

    let currentActiveId = userMessages[0].id;
    const scrollPos = currentScrollTop + 100;

    for (const msg of userMessages) {
      const el = document.getElementById(`msg-${msg.id}`);
      if (el && el.offsetTop <= scrollPos) {
        currentActiveId = msg.id;
      } else {
        break;
      }
    }
    setActiveMessageId(prev => prev !== currentActiveId ? currentActiveId : prev);
  }, [scrollRef]);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    scrollEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollEl.removeEventListener('scroll', handleScroll);
  }, [handleScroll, scrollRef]);

  useEffect(() => {
    if (scrollRef.current && !userScrolledRef.current && !isResizingWidth) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages, isStreaming, scrollRef, isResizingWidth]);

  const scrollToPreviousMessage = useCallback(() => {
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
      return elRect.top - containerRect.top + container.scrollTop - 16;
    };
    
    if (targetMsg) {
      container.scrollTo({ top: getScrollPos(targetMsg as HTMLElement), behavior: 'smooth' });
    } else if (userMessageEls.length > 0) {
      container.scrollTo({ top: getScrollPos(userMessageEls[0] as HTMLElement), behavior: 'smooth' });
    }
  }, [scrollRef]);

  const scrollToNextMessage = useCallback(() => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const userMessageEls = Array.from(container.querySelectorAll('[data-role="user"]'));
    const currentScrollTop = container.scrollTop;
    
    let targetMsg = null;
    for (let i = 0; i < userMessageEls.length; i++) {
      const msg = userMessageEls[i] as HTMLElement;
      if (msg.offsetTop > currentScrollTop + 100) {
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
  }, [scrollRef]);

  const userMessages = useMemo(() => messages.filter(m => m.role === 'user'), [messages]);

  const estimateMessageHeight = useCallback((index: number) => {
    const msg = messages[index];
    if (!msg) return 100;
    
    const isUser = msg.role === 'user';
    const effectiveWidth = commandChatWidth || (appMode === 'command' ? 450 : 800);
    const charPerLine = Math.max(Math.floor((effectiveWidth - 60) / 7), 35);
    
    let height = isUser ? 90 : 120;
    
    if (!isUser) {
      height += 52;
    }
    
    if (msg.content) {
      const contentLines = Math.ceil(msg.content.length / charPerLine);
      height += Math.min(contentLines * 22, 600);
    }
    
    if (msg.thinking && msg.thinking.length > 0) {
      height += 180;
    }
    
    if (msg.agentExecution?.reasoningSteps?.length) {
      height += Math.min(msg.agentExecution.reasoningSteps.length * 55, 400);
    }
    
    if (msg.todos?.length) {
      height += 50;
      height += msg.todos.length * 95;
    }
    
    if (msg.fileEdits?.length) {
      height += 60 + msg.fileEdits.length * 130;
    }
    
    if (msg.attachments?.length) {
      height += msg.attachments.reduce((acc, att) => acc + (att.type === 'image' ? 220 : 55), 0);
    }
    
    if (msg.error) {
      height += 80;
    }

    if (msg.content === 'SMB_REPAIR_CARD') {
      height = 220;
    }
    
    if (!isUser && appMode === 'command') {
      height += 50;
    }
    
    return Math.max(height, isUser ? 90 : 150);
  }, [messages, commandChatWidth, appMode]);

  const measuredHeightsRef = useRef<Map<number, number>>(new Map());
  const prevMessagesContentRef = useRef<string>('');
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  
  const measureElement = useCallback((el: HTMLElement | null, virtualIndex: number) => {
    if (!el) return;
    if (resizeObserverRef.current) {
      resizeObserverRef.current.observe(el);
    }
    const rect = el.getBoundingClientRect();
    const height = rect.height;
    if (height > 0) {
      const oldHeight = measuredHeightsRef.current.get(virtualIndex);
      if (!oldHeight || Math.abs(oldHeight - height) > 2) {
        measuredHeightsRef.current.set(virtualIndex, height);
      }
    }
  }, []);

  const resizeRafRef = useRef(0);
  const pendingMeasureRef = useRef(false);

  const rowVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index: number) => {
      return measuredHeightsRef.current.get(index) ?? estimateMessageHeight(index);
    },
    overscan: 5,
  });

  useEffect(() => {
    if (appMode !== 'command') return;
    
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    
    if (lastWidthRef.current !== commandChatWidth && lastWidthRef.current !== undefined) {
      if (isResizingWidthRef.current) {
        if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = requestAnimationFrame(() => {
          rowVirtualizer.measure();
        });
      } else if (!isInitializingRef.current) {
        const scrollRatio = scrollEl.scrollTop / (scrollEl.scrollHeight - scrollEl.clientHeight || 1);
        scrollRatioRef.current = scrollRatio;
        console.log(`%c[commandChatWidth变化] 非拖拽`, 'background: #581c87; color: #fff; padding: 2px 6px; border-radius: 3px;', {
          oldWidth: lastWidthRef.current,
          newWidth: commandChatWidth,
          scrollRatio: Math.round(scrollRatio * 100) + '%',
        });
        measuredHeightsRef.current.clear();
        rowVirtualizer.measure();
      }
    }
    lastWidthRef.current = commandChatWidth;
  }, [commandChatWidth, appMode, scrollRef, rowVirtualizer]);

  useEffect(() => {
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }
    
    resizeObserverRef.current = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const target = entry.target as HTMLElement;
        const index = parseInt(target.getAttribute('data-index') || '-1', 10);
        if (index >= 0) {
          const height = entry.contentRect.height;
          if (height > 0) {
            const oldHeight = measuredHeightsRef.current.get(index);
            if (!oldHeight || Math.abs(oldHeight - height) > 2) {
              measuredHeightsRef.current.set(index, height);
              if (!isResizingWidthRef.current) {
                rowVirtualizer.measure();
              }
            }
          }
        }
      }
    });
    
    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
    };
  }, [rowVirtualizer]);

  useEffect(() => {
    if (isResizingWidth) return;
    const currentContentHash = messages.map(m => `${m.id}:${m.content?.length || 0}:${m.thinking?.length || 0}:${m.todos?.length || 0}:${m.fileEdits?.length || 0}`).join('|');
    
    if (prevMessagesContentRef.current && prevMessagesContentRef.current !== currentContentHash) {
      const prevParts = prevMessagesContentRef.current.split('|');
      const currentParts = currentContentHash.split('|');
      
      for (let i = 0; i < Math.max(prevParts.length, currentParts.length); i++) {
        if (prevParts[i] !== currentParts[i]) {
          measuredHeightsRef.current.delete(i);
        }
      }
      
      if (currentParts.length < prevParts.length) {
        for (let i = currentParts.length; i < prevParts.length; i++) {
          measuredHeightsRef.current.delete(i);
        }
      }
      
      rowVirtualizer.measure();
    }
    
    prevMessagesContentRef.current = currentContentHash;
  }, [messages, rowVirtualizer, isResizingWidth]);

  const prevIsResizingWidthRef = useRef(false);
  const forceMeasureRafRef = useRef(0);
  
  useEffect(() => {
    if (prevIsResizingWidthRef.current && !isResizingWidth && appMode === 'command') {
      if (resizeRafRef.current) {
        cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = 0;
      }
      if (forceMeasureRafRef.current) {
        cancelAnimationFrame(forceMeasureRafRef.current);
      }
      console.log(`%c[拖拽结束]`, 'background: #166534; color: #fff; padding: 2px 6px; border-radius: 3px;', {
        cacheSize: measuredHeightsRef.current.size,
        commandChatWidth,
      });
      
      measuredHeightsRef.current.clear();
      
      forceMeasureRafRef.current = requestAnimationFrame(() => {
        const scrollEl = scrollRef.current;
        if (!scrollEl) return;
        
        const items = scrollEl.querySelectorAll('[data-index]');
        items.forEach((item) => {
          const index = parseInt(item.getAttribute('data-index') || '-1', 10);
          if (index >= 0) {
            const height = (item as HTMLElement).getBoundingClientRect().height;
            if (height > 0) {
              measuredHeightsRef.current.set(index, height);
            }
          }
        });
        
        rowVirtualizer.measure();
        forceMeasureRafRef.current = 0;
      });
    }
    prevIsResizingWidthRef.current = isResizingWidth;
  }, [isResizingWidth, rowVirtualizer, appMode, commandChatWidth, scrollRef]);

  const containerWidthRef = useRef(0);
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = Math.round(entry.contentRect.width);
        if (containerWidthRef.current > 0 && containerWidthRef.current !== newWidth) {
          if (!isResizingWidthRef.current && !isInitializingRef.current) {
            console.log(`%c[容器宽度变化] 非拖拽`, 'background: #7c2d12; color: #fff; padding: 2px 6px; border-radius: 3px;', {
              oldWidth: containerWidthRef.current,
              newWidth,
            });
            measuredHeightsRef.current.clear();
            rowVirtualizer.measure();
          }
        }
        containerWidthRef.current = newWidth;
      }
    });

    observer.observe(scrollEl);
    return () => observer.disconnect();
  }, [rowVirtualizer, scrollRef]);

  const virtualItems = rowVirtualizer.getVirtualItems();
  const initialMeasureDoneRef = useRef(false);
  const isInitializingRef = useRef(true);

  useEffect(() => {
    if (appMode !== 'command') return;
    if (initialMeasureDoneRef.current) return;
    if (virtualItems.length === 0) return;
    
    initialMeasureDoneRef.current = true;
    
    const timer = setTimeout(() => {
      isInitializingRef.current = false;
    }, 2000);
    
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const scrollEl = scrollRef.current;
          if (!scrollEl) return;
          
          const items = scrollEl.querySelectorAll('[data-index]');
          
          items.forEach((item) => {
            const index = parseInt(item.getAttribute('data-index') || '-1', 10);
            if (index >= 0) {
              const height = (item as HTMLElement).getBoundingClientRect().height;
              if (height > 0) {
                measuredHeightsRef.current.set(index, height);
              }
            }
          });
          
          if (items.length > 0) {
            console.log(`%c[初始测量完成]`, 'background: #059669; color: #fff; padding: 2px 6px; border-radius: 3px;', {
              measuredCount: items.length,
              cacheSize: measuredHeightsRef.current.size,
            });
            rowVirtualizer.measure();
          }
          
          clearTimeout(timer);
          isInitializingRef.current = false;
        });
      });
    });
    
    return () => clearTimeout(timer);
  }, [virtualItems.length, appMode, rowVirtualizer, scrollRef]);

  useEffect(() => {
    if (appMode !== 'command') return;
    if (scrollRatioRef.current > 0 && scrollRef.current) {
      const scrollEl = scrollRef.current;
      const newTotalHeight = rowVirtualizer.getTotalSize();
      if (newTotalHeight > 0) {
        const newScrollTop = scrollRatioRef.current * (newTotalHeight - scrollEl.clientHeight);
        scrollEl.scrollTop = newScrollTop;
      }
      scrollRatioRef.current = 0;
    }
  }, [rowVirtualizer, appMode, scrollRef]);

  const messageItems = useMemo(() => {
    if (appMode === 'command' && virtualItems.length > 0) {
      const positions = virtualItems.map(v => ({
        idx: v.index,
        role: messages[v.index]?.role?.[0] || '?',
        start: Math.round(v.start),
        size: Math.round(v.size),
        measured: measuredHeightsRef.current.has(v.index),
      }));
      console.log(`%c[虚拟位置]`, 'background: #1e3a5f; color: #fff; padding: 2px 6px; border-radius: 3px;', {
        width: containerWidthRef.current,
        isResizing: isResizingWidthRef.current,
        positions,
      });
    }
    return virtualItems.map((virtualRow) => {
      const msg = messages[virtualRow.index];
      return (
        <div
          key={msg.id}
          data-index={virtualRow.index}
          ref={(el) => measureElement(el, virtualRow.index)}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${virtualRow.start}px)`,
            overflow: 'hidden',
          }}
        >
          <MessageItem
            msg={msg}
            index={virtualRow.index}
            isLastMessage={virtualRow.index === messages.length - 1}
            isStreaming={isStreaming}
            isWaitingForResponse={isWaitingForResponse}
            isSearching={isSearching}
            isDarkMode={isDarkMode}
            appMode={appMode}
            userName={userName}
            aiName={aiName}
            userAvatar={userAvatar}
            aiAvatar={aiAvatar}
            agents={agents}
            activeAgentId={activeAgentId}
            activeAgent={activeAgent}
            fontFamily={fontFamily}
            commandChatWidth={commandChatWidth}
            onFileClick={openFile}
            onCopy={handleCopy}
            copiedId={copiedId}
            onEditMessage={handleEditMessage}
            onRegenerateMessage={handleRegenerateMessage}
            onSwitchVersion={handleSwitchVersion}
          />
        </div>
      );
    });
  }, [virtualItems, messages, isStreaming, isWaitingForResponse, isSearching, isDarkMode, appMode, userName, aiName, userAvatar, aiAvatar, agents, activeAgentId, activeAgent, fontFamily, commandChatWidth, openFile, handleCopy, copiedId, handleEditMessage, handleRegenerateMessage, handleSwitchVersion]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      <AnimatePresence>
        {appMode === 'command' && (
          <motion.div 
            data-tauri-drag-region
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 48, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              duration: 0.25,
              ease: [0.4, 0, 0.2, 1],
              delay: 0.05,
            }}
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

      {appMode === 'command' && messages.length > 0 && canScrollUp && (
        <div className="absolute top-12 left-0 right-0 h-12 flex justify-center items-start pt-2 opacity-0 hover:opacity-100 transition-opacity duration-300 z-20 pointer-events-none">
          <button
            onClick={scrollToPreviousMessage}
            className={cn(
              "pointer-events-auto backdrop-blur border rounded-full p-2 shadow-sm transition-all",
              isDarkMode 
                ? "bg-zinc-700/90 border-zinc-600 text-zinc-400 hover:text-indigo-400 hover:bg-zinc-600" 
                : "bg-white/90 border-zinc-200 text-zinc-500 hover:text-indigo-600 hover:bg-zinc-50"
            )}
            title="跳转到上一条请求"
          >
            <ArrowUp size={18} />
          </button>
        </div>
      )}

      {appMode === 'command' && messages.length > 0 && canScrollDown && (
        <div className="absolute bottom-0 left-0 right-0 h-12 flex justify-center items-end pb-2 opacity-0 hover:opacity-100 transition-opacity duration-300 z-20 pointer-events-none">
          <button
            onClick={scrollToNextMessage}
            className={cn(
              "pointer-events-auto backdrop-blur border rounded-full p-2 shadow-sm transition-all",
              isDarkMode 
                ? "bg-zinc-700/90 border-zinc-600 text-zinc-400 hover:text-indigo-400 hover:bg-zinc-600" 
                : "bg-white/90 border-zinc-200 text-zinc-500 hover:text-indigo-600 hover:bg-zinc-50"
            )}
            title="跳转到下一条请求"
          >
            <ArrowDown size={18} />
          </button>
        </div>
      )}

      <div 
        ref={scrollRef}
        className={cn(
          "flex-1 overflow-y-auto overflow-x-hidden scroll-smooth z-10",
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
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {messageItems}
          </div>
        )}
        
        {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
          <StreamingIndicator 
            appMode={appMode} 
            isDarkMode={isDarkMode} 
            activeAgent={activeAgent}
            AgentIcon={AgentIcon}
          />
        )}
        
        {pendingAction && (
          <PendingActionCard 
            pendingAction={pendingAction}
            isDarkMode={isDarkMode}
            handleApproveAction={handleApproveAction}
            handleRejectAction={handleRejectAction}
          />
        )}
      </div>

      {appMode !== 'command' && userMessages.length > 0 && (
        <div className="absolute right-[20px] top-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 z-50 py-4">
          {userMessages.map((msg) => (
            <IndexRailDot
              key={msg.id}
              msg={msg}
              isActive={activeMessageId === msg.id}
              isDarkMode={isDarkMode}
              onClick={() => {
                const el = document.getElementById(`msg-${msg.id}`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};
