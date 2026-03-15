import React from 'react';
import { 
  MessageSquare, 
  Command, 
  Image as ImageIcon, 
  X, 
  Send,
  Square,
  Zap,
  Globe,
  Plus,
  FileText,
  Bot,
  ChevronDown,
  Check,
  Cpu,
  Database,
  Shield,
  Layout,
  Terminal,
  ChevronRight,
  Mic
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { AppMode } from '../types';
import { useGlobalState } from '../context/GlobalStateContext';

interface ChatInputProps {
  input: string;
  setInput: (input: string) => void;
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
  isDarkMode: boolean;
  attachedImage: string | null;
  setAttachedImage: (image: string | null) => void;
  handleSendMessage: () => void;
  handleStopAI?: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  maxContextLength: number;
  isWebSearchEnabled: boolean;
  setIsWebSearchEnabled: (enabled: boolean) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  input,
  setInput,
  appMode,
  setAppMode,
  isDarkMode,
  attachedImage,
  setAttachedImage,
  handleSendMessage,
  handleStopAI,
  fileInputRef,
  handleImageUpload,
  maxContextLength,
  isWebSearchEnabled,
  setIsWebSearchEnabled
}) => {
  const { isStreaming, simulateSmbCheck, sessions, currentSessionId, currentTokenCount, compressMessages, fontFamily, agents, updateSessionAgents } = useGlobalState();
  const [showTokenCount, setShowTokenCount] = React.useState(false);
  const [isHoveringStatus, setIsHoveringStatus] = React.useState(false);
  const [isAttachmentMenuOpen, setIsAttachmentMenuOpen] = React.useState(false);
  const [isAgentMenuOpen, setIsAgentMenuOpen] = React.useState(false);
  const [isRecording, setIsRecording] = React.useState(false);
  const [expandedAgents, setExpandedAgents] = React.useState<Set<string>>(new Set());
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const documentInputRef = React.useRef<HTMLInputElement>(null);
  const attachmentMenuRef = React.useRef<HTMLDivElement>(null);
  const agentMenuRef = React.useRef<HTMLDivElement>(null);
  const recognitionRef = React.useRef<any>(null);
  const originalInputRef = React.useRef(input);
  
  const currentSession = sessions.find(s => s.id === currentSessionId);
  const activeAgentId = currentSession?.activeAgents?.[0];
  const activeAgent = activeAgentId ? agents.find(a => a.id === activeAgentId) : null;

  const iconMap: Record<string, React.ElementType> = {
    Cpu,
    Database,
    Globe,
    Shield,
    Layout,
    Terminal,
    Bot
  };

  const toggleAgentExpand = (e: React.MouseEvent, agentId: string) => {
    e.stopPropagation();
    setExpandedAgents(prev => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  };

  const renderAgentAvatar = (agent: any, size: number = 14) => {
    if (agent.avatar?.startsWith('data:image')) {
      // For custom images, make them slightly larger to fill the visual space better
      const imgSize = size === 14 ? 20 : size + 4;
      return <img src={agent.avatar} alt={agent.name} className="object-cover rounded-md shrink-0" style={{ width: imgSize, height: imgSize }} />;
    }
    const Icon = iconMap[agent.avatar] || Bot;
    return <Icon size={size} className="opacity-70 shrink-0" />;
  };

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (attachmentMenuRef.current && !attachmentMenuRef.current.contains(event.target as Node)) {
        setIsAttachmentMenuOpen(false);
      }
      if (agentMenuRef.current && !agentMenuRef.current.contains(event.target as Node)) {
        setIsAgentMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-expand textarea height
  React.useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 250)}px`;
    }
  }, [input]);

  React.useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const onSend = () => {
    if (isRecording) {
      toggleRecording();
    }
    if (input.trim() === '/check-smb') {
      setInput('');
      simulateSmbCheck();
    } else {
      handleSendMessage();
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('您的浏览器不支持语音识别功能，请使用 Chrome 或 Edge 浏览器。');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;

    originalInputRef.current = input;

    recognition.onresult = (event: any) => {
      let newText = '';
      for (let i = 0; i < event.results.length; ++i) {
        newText += event.results[i][0].transcript;
      }
      setInput((originalInputRef.current ? originalInputRef.current + ' ' : '') + newText);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error', event.error);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsRecording(true);
  };

  return (
    <motion.div 
      layout
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className={cn("pt-0 relative z-20", appMode === 'command' ? "p-4" : "p-6")}
    >
      <div className="max-w-4xl mx-auto relative" style={{ fontFamily }}>
        {attachedImage && (
          <div className="absolute bottom-full left-0 mb-4 p-2 glass rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2">
            <img src={attachedImage} alt="Preview" className="w-12 h-12 rounded-lg object-cover" />
            <button 
              onClick={() => setAttachedImage(null)}
              className="p-1 rounded-full hover:bg-red-500/20 text-red-500 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        )}
        
          <div className="glass rounded-2xl p-2 flex flex-col transition-all">
            {/* Top Bar: Modes & Tools */}
            <div className="flex items-center gap-2 px-2 py-1 border-b border-zinc-500/5 mb-1">
              <div className="flex items-center bg-zinc-500/5 dark:bg-zinc-700/50 p-1 rounded-lg border border-zinc-500/10 dark:border-zinc-600/50">
                <button 
                  onClick={() => setAppMode('chat')}
                  className={cn(
                    "p-1.5 rounded-md transition-all flex items-center justify-center",
                    appMode === 'chat' 
                      ? cn("bg-white text-indigo-500 shadow-sm border border-transparent", isDarkMode ? "bg-zinc-700 text-indigo-400 border-zinc-600/50" : "") 
                      : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                  )}
                  title="对话模式"
                >
                  <MessageSquare size={14} />
                </button>
                <button 
                  onClick={() => setAppMode('command')}
                  className={cn(
                    "p-1.5 rounded-md transition-all flex items-center justify-center",
                    appMode === 'command' 
                      ? cn("bg-white text-amber-500 shadow-sm border border-transparent", isDarkMode ? "bg-zinc-700 text-amber-400 border-zinc-600/50" : "") 
                      : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                  )}
                  title="命令模式"
                >
                  <Command size={14} />
                </button>
              </div>
              <div className="h-4 w-[1px] bg-zinc-500/20 mx-1"></div>
              
              {/* Agent Selection Dropdown */}
              <div className="relative" ref={agentMenuRef}>
                <button
                  onClick={() => setIsAgentMenuOpen(!isAgentMenuOpen)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md transition-all text-xs font-medium border",
                    activeAgent?.avatar?.startsWith('data:image') ? "pl-1 pr-2 py-1" : "px-2 py-1.5",
                    activeAgent 
                      ? (isDarkMode ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" : "bg-indigo-50 text-indigo-600 border-indigo-200")
                      : (isDarkMode ? "bg-zinc-700/50 text-zinc-400 border-zinc-600/50 hover:bg-zinc-600" : "bg-zinc-100 text-zinc-600 border-zinc-200 hover:bg-zinc-200")
                  )}
                  title="选择 Agent"
                >
                  {activeAgent ? renderAgentAvatar(activeAgent, 14) : <Bot size={14} />}
                  <span className="max-w-[100px] truncate">{activeAgent ? activeAgent.name : "默认助手"}</span>
                  <ChevronDown size={12} className={cn("transition-transform opacity-70", isAgentMenuOpen && "rotate-180")} />
                </button>

                {isAgentMenuOpen && (
                  <div className="absolute bottom-full left-0 mb-1 w-56 bg-white dark:bg-zinc-700 rounded-lg shadow-xl border border-zinc-200 dark:border-zinc-600 overflow-hidden z-50 py-1">
                    <div className="px-3 py-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">选择对话角色</div>
                    <button
                      onClick={() => {
                        updateSessionAgents(currentSessionId, []);
                        setIsAgentMenuOpen(false);
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-600 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <MessageSquare size={14} className="opacity-70" />
                        <span>默认助手</span>
                      </div>
                      {!activeAgent && <Check size={14} className="text-indigo-500" />}
                    </button>
                    <div className="h-[1px] bg-zinc-200 dark:bg-zinc-600/50 my-1"></div>
                    <div className="max-h-64 overflow-y-auto scrollbar-hide">
                      {agents.filter(a => !a.parentId).map(agent => {
                        const children = agents.filter(a => a.parentId === agent.id);
                        const hasChildren = children.length > 0;
                        const isExpanded = expandedAgents.has(agent.id);
                        
                        return (
                          <div key={agent.id}>
                            <div className="flex items-center w-full hover:bg-zinc-100 dark:hover:bg-zinc-600 transition-colors">
                              {hasChildren ? (
                                <button 
                                  onClick={(e) => toggleAgentExpand(e, agent.id)}
                                  className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                                >
                                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </button>
                              ) : (
                                <div className="w-8"></div>
                              )}
                              <button
                                onClick={() => {
                                  updateSessionAgents(currentSessionId, [agent.id]);
                                  setIsAgentMenuOpen(false);
                                }}
                                className="flex-1 flex items-center justify-between py-2 pr-3 text-sm text-zinc-700 dark:text-zinc-300"
                              >
                                <div className="flex items-center gap-2 truncate pr-2">
                                  {renderAgentAvatar(agent, 14)}
                                  <span className="truncate">{agent.name}</span>
                                </div>
                                {activeAgentId === agent.id && <Check size={14} className="text-indigo-500 shrink-0" />}
                              </button>
                            </div>
                            
                            {hasChildren && isExpanded && (
                              <div className="bg-zinc-50/50 dark:bg-zinc-700/20 border-y border-zinc-100 dark:border-zinc-600/50">
                                {children.map(child => (
                                  <button
                                    key={child.id}
                                    onClick={() => {
                                      updateSessionAgents(currentSessionId, [child.id]);
                                      setIsAgentMenuOpen(false);
                                    }}
                                    className="w-full flex items-center justify-between py-2 pl-10 pr-3 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-600 transition-colors"
                                  >
                                    <div className="flex items-center gap-2 truncate pr-2">
                                      {renderAgentAvatar(child, 12)}
                                      <span className="truncate text-xs">{child.name}</span>
                                    </div>
                                    {activeAgentId === child.id && <Check size={14} className="text-indigo-500 shrink-0" />}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="h-4 w-[1px] bg-zinc-500/20 mx-1"></div>
              
              <button 
                onClick={() => setIsWebSearchEnabled(!isWebSearchEnabled)}
                className={cn(
                  "flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-100 shrink-0",
                  isWebSearchEnabled 
                    ? "text-emerald-500" 
                    : "text-zinc-500 opacity-60"
                )}
                title={isWebSearchEnabled ? "关闭联网搜索" : "开启联网搜索"}
              >
                <Globe size={16} />
              </button>
            </div>
            
            {/* Middle Bar: Full-width Textarea */}
            <div className="px-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.shiftKey) {
                    e.preventDefault();
                    onSend();
                  }
                }}
                placeholder={appMode === 'chat' ? (activeAgent ? `向 ${activeAgent.name} 提问...` : "输入您的问题...") : "输入系统命令..."}
                className="w-full bg-transparent border-none focus:outline-none focus:ring-0 resize-none py-2 text-sm max-h-[250px] min-h-[80px] placeholder-zinc-500 dark:placeholder-zinc-400 caret-zinc-800 dark:caret-zinc-200 scrollbar-hide"
                rows={1}
              />
            </div>
            
            {/* Bottom Bar: Actions */}
            <div className="flex items-center justify-between px-2 pb-1 mt-1">
              <div className="flex items-center gap-3">
                <div className="relative" ref={attachmentMenuRef}>
                  <button 
                    onClick={() => setIsAttachmentMenuOpen(!isAttachmentMenuOpen)}
                    className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-zinc-500/10 text-zinc-500 transition-colors shrink-0"
                    title="添加附件"
                  >
                    <Plus size={18} />
                  </button>
                  
                  {isAttachmentMenuOpen && (
                    <div className="absolute bottom-full left-0 mb-2 w-32 bg-white dark:bg-zinc-700 rounded-lg shadow-xl border border-zinc-200 dark:border-zinc-600 overflow-hidden z-50">
                      <button 
                        onClick={() => {
                          fileInputRef.current?.click();
                          setIsAttachmentMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-600 transition-colors"
                      >
                        <ImageIcon size={14} />
                        图片
                      </button>
                      <button 
                        onClick={() => {
                          documentInputRef.current?.click();
                          setIsAttachmentMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-600 transition-colors"
                      >
                        <FileText size={14} />
                        文件
                      </button>
                    </div>
                  )}
                </div>

                <span className={cn(
                  "text-[10px] text-zinc-400 font-medium opacity-60",
                  appMode === 'command' && "hidden"
                )}>
                  Shift + Enter 发送
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={toggleRecording}
                  className={cn(
                    "relative flex items-center justify-center w-8 h-8 rounded-full transition-all",
                    isRecording 
                      ? "bg-red-500/10 text-red-500 hover:bg-red-500/20 animate-pulse" 
                      : "hover:bg-zinc-500/10 text-zinc-500"
                  )}
                  title={isRecording ? "停止录音" : "语音输入"}
                >
                  <Mic size={16} />
                  {isRecording && (
                    <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-red-500"></span>
                  )}
                </button>

                <div 
                  className="relative"
                  onMouseEnter={() => setIsHoveringStatus(true)}
                  onMouseLeave={() => {
                    setTimeout(() => setIsHoveringStatus(false), 100);
                  }}
                >
                  <button 
                    onClick={() => setShowTokenCount(!showTokenCount)}
                    className={cn(
                      "relative flex items-center justify-center w-8 h-8 rounded-full transition-all hover:bg-zinc-500/10",
                      currentTokenCount > maxContextLength * 0.85 ? "text-amber-500" : "text-zinc-500"
                    )}
                  >
                    <svg className="w-full h-full -rotate-90">
                      <circle
                        cx="16"
                        cy="16"
                        r="12"
                        fill="transparent"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="opacity-10"
                      />
                      <motion.circle
                        cx="16"
                        cy="16"
                        r="12"
                        fill="transparent"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeDasharray={75.4}
                        initial={{ strokeDashoffset: 75.4 }}
                        animate={{ strokeDashoffset: 75.4 - (75.4 * Math.min(currentTokenCount / maxContextLength, 1)) }}
                        transition={{ duration: 1, ease: "easeOut" }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-[9px] font-mono font-bold">
                      {showTokenCount ? (
                        <span>{Math.round((currentTokenCount / 1000) * 10) / 10}k</span>
                      ) : (
                        <span>{Math.round((currentTokenCount / maxContextLength) * 100)}%</span>
                      )}
                    </div>
                  </button>

                  {isHoveringStatus && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      className="absolute bottom-full left-1/2 -translate-x-1/2 pb-3 z-50"
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          compressMessages();
                          setIsHoveringStatus(false);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-700 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-800 text-[10px] font-bold shadow-xl hover:scale-105 transition-transform whitespace-nowrap"
                      >
                        <Zap size={10} className="fill-current" />
                        立即压缩
                      </button>
                      <div className="w-2 h-2 bg-zinc-700 dark:bg-zinc-100 rotate-45 absolute bottom-2 left-1/2 -translate-x-1/2"></div>
                    </motion.div>
                  )}
                </div>

                {isStreaming ? (
                  <button 
                    onClick={handleStopAI}
                    className="p-2 rounded-xl bg-red-500 text-white shadow-lg shadow-red-500/20 transition-all hover:bg-red-600"
                  >
                    <Square size={16} fill="currentColor" />
                  </button>
                ) : (
                  <button 
                    onClick={onSend}
                    disabled={(!input.trim() && !attachedImage) || isStreaming}
                    className={cn(
                      "p-2 rounded-xl transition-all",
                      input.trim() || attachedImage
                        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" 
                        : "bg-zinc-500/10 text-zinc-500 opacity-50 cursor-not-allowed"
                    )}
                  >
                    <Send size={16} />
                  </button>
                )}
              </div>
            </div>

            {/* Hidden Inputs */}
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleImageUpload} 
              className="hidden" 
              accept="image/*" 
            />
            <input 
              type="file" 
              ref={documentInputRef} 
              onChange={handleImageUpload} 
              className="hidden" 
              accept=".pdf,.doc,.docx,.txt,.csv,.xlsx" 
            />
          </div>
      </div>
    </motion.div>
  );
};
