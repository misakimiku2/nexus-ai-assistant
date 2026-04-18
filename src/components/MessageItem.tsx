import React, { memo, useMemo, useState, useCallback, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import {
  CheckCircle, CheckCircle2, XCircle, Wrench, Bot, Database, Globe, Shield, Layout, Terminal, Brain, FileEdit, AlertTriangle, AlertCircle, ChevronDown, ChevronUp, User, Edit2,
  Copy, RotateCcw, ChevronLeft, ChevronRight, Check, FileText, ListTodo, Eye
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Message, TodoItem, AppMode, Attachment } from '../types';
import { ReasoningStep } from '../agent/types';
import { TodoContainer } from './TodoCard';

const SyntaxHighlighter = lazy(() => import('react-syntax-highlighter').then(mod => ({ default: mod.Prism })));
import { oneDark, ghcolors } from 'react-syntax-highlighter/dist/esm/styles/prism';

const githubLightTheme: Record<string, React.CSSProperties> = {
  ...ghcolors,
  '.language-markdown .token.title.important': { color: '#0550ae', fontWeight: 'bold' },
  '.language-markdown .token.title.important > .token.content': { color: '#0550ae' },
  '.language-markdown .token.title.important > .token.punctuation': { color: '#8b949e' },
  '.language-markdown .token.list.punctuation': { color: '#e16f24' },
  '.language-markdown .token.code-snippet': { color: '#cf222e' },
  '.language-markdown .token.bold .token.content': { color: '#24292f', fontWeight: 'bold' },
  '.language-markdown .token.italic .token.content': { color: '#24292f', fontStyle: 'italic' },
  '.language-markdown .token.url > .token.content': { color: '#0969da' },
  '.language-markdown .token.url > .token.url': { color: '#0969da' },
};

const githubDarkTheme: Record<string, React.CSSProperties> = {
  ...oneDark,
  '.language-markdown .token.title.important': { color: '#79c0ff', fontWeight: 'bold' },
  '.language-markdown .token.title.important > .token.content': { color: '#79c0ff' },
  '.language-markdown .token.title.important > .token.punctuation': { color: '#8b949e' },
  '.language-markdown .token.list.punctuation': { color: '#f0883e' },
  '.language-markdown .token.code-snippet': { color: '#ff7b72' },
  '.language-markdown .token.bold .token.content': { color: '#f0f6fc', fontWeight: 'bold' },
  '.language-markdown .token.italic .token.content': { color: '#f0f6fc', fontStyle: 'italic' },
  '.language-markdown .token.url > .token.content': { color: '#58a6ff' },
  '.language-markdown .token.url > .token.url': { color: '#58a6ff' },
};

const MAX_IMAGE_WIDTH = 330;
const FILE_PATH_REGEX = /[A-Za-z]:\\(?:[^\s<>|*?\]"'。，！？；：（）、\]]| (?=[^\s<>|*?\]"'。，！？；：（）、\]]))+|\/(?:home|Users|usr|tmp|var|etc|opt)\/(?:[^\s<>|*?\]"'。，！？；：（）、\]]| (?=[^\s<>|*?\]"'。，！？；：（）、\]]))+/g;

const openExternalLink = async (url: string) => {
  try {
    const { open } = await import('@tauri-apps/plugin-shell');
    await open(url);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
};

const linkifyFilePaths = (text: string, onFileClick: (path: string) => void): React.ReactNode[] => {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  FILE_PATH_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = FILE_PATH_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    let filePath = match[0];
    filePath = filePath.replace(/[\s]+$/, '');
    parts.push(
      <span
        key={`fp-${key++}`}
        onClick={(e) => { e.stopPropagation(); onFileClick(filePath); }}
        className="text-blue-500 hover:text-blue-600 hover:underline cursor-pointer break-all text-xs"
        title="点击在工作区查看"
      >
        {filePath}
      </span>
    );
    lastIndex = match.index + filePath.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
};

interface MessageImageProps {
  src: string;
  alt: string;
  isDarkMode: boolean;
  maxWidth?: number;
}

const MessageImage = memo<MessageImageProps>(({ src, alt, isDarkMode, maxWidth = MAX_IMAGE_WIDTH }) => {
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  useMemo(() => {
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
});

MessageImage.displayName = 'MessageImage';

const iconMap: Record<string, React.ElementType> = {
  Cpu: Bot,
  Database,
  Globe,
  Shield,
  Layout,
  Terminal,
  Bot
};

const THOUGHT_COLLAPSE_THRESHOLD = 200;

const ThoughtContent = memo<{ content: string; isDarkMode: boolean }>(({ content, isDarkMode }) => {
  const [expanded, setExpanded] = useState(false);
  const needsCollapse = content.length > THOUGHT_COLLAPSE_THRESHOLD;

  if (!needsCollapse) {
    return <p className="opacity-80 mt-0.5">{content}</p>;
  }

  return (
    <div className="mt-0.5">
      <p className="opacity-80">
        {expanded ? content : content.substring(0, THOUGHT_COLLAPSE_THRESHOLD) + '...'}
      </p>
      <button
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        className={cn(
          "text-[10px] mt-0.5 flex items-center gap-0.5 transition-colors",
          isDarkMode ? "text-blue-400 hover:text-blue-300" : "text-blue-500 hover:text-blue-600"
        )}
      >
        {expanded ? (
          <><ChevronUp size={10} /> 收起</>
        ) : (
          <><ChevronDown size={10} /> 展开全部 ({content.length} 字)</>
        )}
      </button>
    </div>
  );
});

ThoughtContent.displayName = 'ThoughtContent';

interface CollapsibleSectionProps {
  title: string | React.ReactNode;
  icon: React.ReactNode;
  children: React.ReactNode;
  isDarkMode: boolean;
  defaultOpen?: boolean;
  contentClassName?: string;
}

const CollapsibleSection = memo<CollapsibleSectionProps>(({ title, icon, children, isDarkMode, defaultOpen = false, contentClassName }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const toggleOpen = useCallback(() => setIsOpen(prev => !prev), []);

  return (
    <div className={cn("rounded-xl border overflow-hidden", isDarkMode ? "border-zinc-600 bg-zinc-700/30" : "border-zinc-200 bg-zinc-50")}>
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
});

CollapsibleSection.displayName = 'CollapsibleSection';

interface MessageItemProps {
  msg: Message;
  index: number;
  isLastMessage: boolean;
  isStreaming: boolean;
  isWaitingForResponse?: boolean;
  isSearching?: boolean;
  isDarkMode: boolean;
  appMode: AppMode;
  userName: string;
  aiName: string;
  userAvatar: string;
  aiAvatar: string;
  agents: Array<{ id: string; name: string; avatar: string; themeColor?: string }>;
  activeAgentId?: string;
  activeAgent?: { name: string; avatar: string; themeColor?: string } | null;
  fontFamily: string;
  commandChatWidth?: number;
  onFileClick: (path: string) => void;
  onCopy: (text: string, id: string) => void;
  copiedId: string | null;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onRegenerateMessage?: (messageId: string) => void;
  onSwitchVersion?: (messageId: string, index: number) => void;
}

const CodeBlock = memo<{
  match: RegExpMatchArray;
  codeContent: string;
  codeId: string;
  isDarkMode: boolean;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
}>(({ match, codeContent, codeId, isDarkMode, copiedId, onCopy }) => {
  return (
    <div className={cn(
      "relative group/code my-4 rounded-xl overflow-hidden border shadow-none",
      isDarkMode ? "border-zinc-600" : "border-zinc-200"
    )}>
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
          onClick={() => onCopy(codeContent, codeId)}
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
      <Suspense fallback={<div className="h-20 bg-zinc-100 dark:bg-zinc-800 animate-pulse" />}>
        <SyntaxHighlighter
          style={isDarkMode ? githubDarkTheme : githubLightTheme}
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
      </Suspense>
    </div>
  );
});

CodeBlock.displayName = 'CodeBlock';

const ReasoningStepItem = memo<{
  step: ReasoningStep;
  isDarkMode: boolean;
  onFileClick: (path: string) => void;
  hasTodos: boolean;
}>(({ step, isDarkMode, onFileClick, hasTodos }) => {
  const getStepIcon = (type: ReasoningStep['type']) => {
    switch (type) {
      case 'thought': return <Brain className="w-3.5 h-3.5 text-blue-500" />;
      case 'action': return <Wrench className="w-3.5 h-3.5 text-amber-500" />;
      case 'observation': return <Eye className="w-3.5 h-3.5 text-purple-500" />;
      case 'planning': return <ListTodo className="w-3.5 h-3.5 text-indigo-500" />;
      case 'tool_start': return <Wrench className="w-3.5 h-3.5 text-cyan-500" />;
      case 'tool_result': return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
      case 'error': return <AlertCircle className="w-3.5 h-3.5 text-red-500" />;
      case 'summary': return <FileText className="w-3.5 h-3.5 text-teal-500" />;
    }
  };

  const getStepLabel = (type: ReasoningStep['type']) => {
    switch (type) {
      case 'thought': return '思考';
      case 'action': return '行动';
      case 'observation': return '观察';
      case 'planning': return '规划';
      case 'tool_start': return '调用工具';
      case 'tool_result': return '工具结果';
      case 'error': return '错误';
      case 'summary': return '总结';
    }
  };

  const getStepColor = (type: ReasoningStep['type']) => {
    switch (type) {
      case 'thought': return 'text-blue-500';
      case 'action': return 'text-amber-500';
      case 'observation': return 'text-purple-500';
      case 'planning': return 'text-indigo-500';
      case 'tool_start': return 'text-cyan-500';
      case 'tool_result': return 'text-emerald-500';
      case 'error': return 'text-red-500';
      case 'summary': return 'text-teal-500';
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
    <div className="flex items-start gap-2 text-xs">
      <div className="mt-0.5 shrink-0">{getStepIcon(step.type)}</div>
      <div className="flex-1 min-w-0">
        <span className={cn("text-[10px] uppercase font-medium", getStepColor(step.type))}>
          {getStepLabel(step.type)}
        </span>
        {(step.type === 'action' || step.type === 'tool_start') && step.executionStatus && (
          <span className={cn(
            "ml-2 px-1.5 py-0.5 rounded text-[10px]",
            step.executionStatus === 'executing'
              ? "bg-amber-500/20 text-amber-500"
              : "bg-emerald-500/20 text-emerald-500"
          )}>
            {step.executionStatus === 'executing' ? '执行中' : '执行完成'}
          </span>
        )}
        {(step.type === 'action' || step.type === 'tool_start') && step.toolName && (
          <div className="mt-1 flex items-center gap-2">
            <span>
              使用<span className="text-blue-500 font-medium mx-1">{getToolDisplayName(step.toolName)}</span>：
              <span className="opacity-80">
                {step.toolParams?.query ? String(step.toolParams.query) :
                 step.toolParams?.url ? String(step.toolParams.url) :
                 step.toolParams?.path ? (
                  /^[A-Za-z]:\\|^\//.test(String(step.toolParams.path)) ? (
                    <span
                      onClick={(e) => { e.stopPropagation(); onFileClick(String(step.toolParams.path)); }}
                      className="text-blue-500 hover:text-blue-600 hover:underline cursor-pointer text-[11px]"
                      title="点击在工作区查看"
                    >
                      {String(step.toolParams.path)}
                    </span>
                  ) : String(step.toolParams.path)
                 ) :
                 step.toolParams?.command ? String(step.toolParams.command) :
                 step.toolParams?.content ? String(step.toolParams.content).substring(0, 80) + (String(step.toolParams.content).length > 80 ? '...' : '') :
                 ''}
              </span>
            </span>
          </div>
        )}
        {(step.type === 'observation' || step.type === 'tool_result') && step.observationData && step.observationData.length > 0 && !hasTodos && (
          <div className="mt-1 space-y-1">
            {step.observationData.map((item, idx) => (
              <div 
                key={idx}
                onClick={(e) => { e.stopPropagation(); openExternalLink(item.url); }}
                className="block text-blue-500 hover:underline truncate cursor-pointer"
              >
                {item.title}
              </div>
            ))}
          </div>
        )}
        {(step.type === 'observation' || step.type === 'tool_result') && step.observationData && step.observationData.length > 0 && hasTodos && (
          <p className="opacity-50 mt-0.5 text-[10px]">结果已记录到任务看板</p>
        )}
        {step.type === 'thought' && step.content && (
          <ThoughtContent content={step.content} isDarkMode={isDarkMode} />
        )}
        {(step.type === 'observation' || step.type === 'tool_result' || step.type === 'error' || step.type === 'summary' || step.type === 'planning') && step.content && !step.observationData && (
          <p className={cn("mt-0.5", step.type === 'error' ? "text-red-400 opacity-90" : "opacity-80")}>
            {hasTodos && (step.type === 'tool_result' || step.type === 'error') 
              ? (step.type === 'error' ? linkifyFilePaths(`错误: ${step.content.substring(0, 60)}${step.content.length > 60 ? '...' : ''}`, onFileClick) : '结果已记录到任务看板')
              : linkifyFilePaths(step.content, onFileClick)}
          </p>
        )}
      </div>
    </div>
  );
});

ReasoningStepItem.displayName = 'ReasoningStepItem';

export const MessageItem = memo<MessageItemProps>(({
  msg,
  index,
  isLastMessage,
  isStreaming,
  isWaitingForResponse,
  isSearching,
  isDarkMode,
  appMode,
  userName,
  aiName,
  userAvatar,
  aiAvatar,
  agents,
  activeAgentId,
  activeAgent,
  fontFamily,
  commandChatWidth,
  onFileClick,
  onCopy,
  copiedId,
  onEditMessage,
  onRegenerateMessage,
  onSwitchVersion,
}) => {
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const isUser = msg.role === 'user';
  let senderName = isUser ? userName : aiName;
  let AvatarIcon: React.ElementType = isUser ? User : Bot;
  let avatarUrl = isUser ? userAvatar : aiAvatar;
  
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
          AvatarIcon = Bot;
        } else {
          AvatarIcon = iconMap[agent.avatar] || Bot;
          avatarUrl = '';
        }
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
        AvatarIcon = iconMap[activeAgent.avatar] || Bot;
        avatarUrl = '';
      }
    }
  }

  const userImageMaxWidth = commandChatWidth 
    ? Math.min(MAX_IMAGE_WIDTH, Math.floor(commandChatWidth * 0.85 - 32))
    : MAX_IMAGE_WIDTH;

  const showThinkingSection = useMemo(() => {
    return (msg.thinking || (msg.agentExecution && msg.agentExecution.reasoningSteps.length > 0));
  }, [msg.thinking, msg.agentExecution]);

  const thinkingStepsCount = useMemo(() => {
    return (msg.thinking ? 1 : 0) + (msg.agentExecution?.reasoningSteps?.length || 0);
  }, [msg.thinking, msg.agentExecution]);

  const markdownComponents = useMemo(() => ({
    p({node, children, ...props}: any) {
      const processChildren = (childs: React.ReactNode): React.ReactNode => {
        if (typeof childs === 'string') {
          return linkifyFilePaths(childs, onFileClick);
        }
        if (Array.isArray(childs)) {
          return childs.map((child, i) => {
            if (typeof child === 'string') {
              return <React.Fragment key={`p-${i}`}>{linkifyFilePaths(child, onFileClick)}</React.Fragment>;
            }
            return child;
          });
        }
        return childs;
      };
      return <p {...props}>{processChildren(children)}</p>;
    },
    strong({node, children, ...props}: any) {
      const text = typeof children === 'string' ? children : 
        Array.isArray(children) ? children.join('') : '';
      if (FILE_PATH_REGEX.test(text)) {
        FILE_PATH_REGEX.lastIndex = 0;
        return <span {...props}>{linkifyFilePaths(text, onFileClick)}</span>;
      }
      FILE_PATH_REGEX.lastIndex = 0;
      return <strong {...props}>{children}</strong>;
    },
    code({node, inline, className, children, ...props}: any) {
      const match = /language-(\w+)/.exec(className || '');
      const codeContent = String(children).replace(/\n$/, '');
      const codeId = `code-${codeContent.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a }, 0)}`;
      
      return !inline && match ? (
        <CodeBlock 
          match={match} 
          codeContent={codeContent} 
          codeId={codeId} 
          isDarkMode={isDarkMode} 
          copiedId={copiedId} 
          onCopy={onCopy} 
        />
      ) : (
        <code {...props} className={cn(
          className,
          "px-1.5 py-0.5 rounded font-mono text-[0.9em]",
          isDarkMode ? "bg-zinc-700 text-zinc-200" : "bg-zinc-100 text-zinc-800"
        )}>
          {children}
        </code>
      );
    }
  }), [onFileClick, isDarkMode, copiedId, onCopy]);

  const handleStartEdit = useCallback(() => {
    setEditContent(msg.content);
    setEditingMessageId(msg.id);
  }, [msg.content, msg.id]);

  const handleSaveEdit = useCallback(() => {
    onEditMessage?.(msg.id, editContent);
    setEditingMessageId(null);
  }, [onEditMessage, msg.id, editContent]);

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
  }, []);

  return (
    <motion.div 
      key={msg.id}
      id={`msg-${msg.id}`}
      data-role={msg.role}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "flex flex-col gap-1 mx-auto w-full min-w-0 relative max-w-4xl transition-all duration-200",
        appMode === 'command' ? "items-stretch pb-3" : (isUser ? "items-end" : "items-start")
      )}
    >
      <div className={cn(
        "flex w-full min-w-0 transition-all duration-200",
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
            ? (isUser ? "max-w-[85%] self-end text-left" : "w-full text-left min-w-0") 
            : (isUser ? "max-w-[85%] items-start" : (msg.todos && msg.todos.length > 0 ? "max-w-[85%] w-full items-start" : "max-w-[85%] items-start"))
        )}>
          {appMode !== 'command' && (
            <span className="text-[13px] font-medium text-zinc-600 dark:text-zinc-300 leading-none pt-1 pb-1">
              {senderName}
            </span>
          )}
          <div className={cn(
            "space-y-2 w-full min-w-0",
            appMode === 'command' 
              ? (isUser ? "flex flex-col items-end" : "flex flex-col") 
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
            <div className="flex flex-col gap-1 min-w-0">
              {showThinkingSection && (
                <CollapsibleSection 
                  title={
                    <div className="flex items-center gap-2">
                      <span>思考过程</span>
                      {isStreaming && isLastMessage && (
                        <span className="flex gap-1 items-center">
                          <span className="w-1 h-1 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                          <span className="w-1 h-1 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                          <span className="w-1 h-1 bg-purple-500 rounded-full animate-bounce"></span>
                        </span>
                      )}
                      <span className="text-xs opacity-60 ml-2">
                        步骤 {thinkingStepsCount}
                      </span>
                    </div>
                  }
                  icon={<Brain size={16} className="text-purple-500" />} 
                  isDarkMode={isDarkMode}
                  contentClassName={isDarkMode ? "bg-zinc-700/50" : "bg-zinc-200/50"}
                  defaultOpen={!!(isStreaming && isLastMessage && showThinkingSection)}
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
                    
                    {msg.agentExecution && msg.agentExecution.reasoningSteps.map((step) => (
                      <ReasoningStepItem 
                        key={step.id} 
                        step={step} 
                        isDarkMode={isDarkMode} 
                        onFileClick={onFileClick}
                        hasTodos={!!msg.todos}
                      />
                    ))}
                  </div>
                </CollapsibleSection>
              )}

              {msg.fileEdits && msg.fileEdits.length > 0 && (
                <CollapsibleSection title={`文件修改 (${msg.fileEdits.length} 个文件)`} icon={<FileEdit size={16} className="text-emerald-500" />} isDarkMode={isDarkMode} defaultOpen={true}>
                  <div className="space-y-4">
                    {msg.fileEdits.map((edit, idx) => (
                      <div key={`${edit.file}-${idx}`} className="text-sm">
                        <div className="flex items-center gap-2 mb-2 text-xs">
                          <span
                            onClick={() => onFileClick(edit.file)}
                            className="text-blue-500 hover:text-blue-600 hover:underline cursor-pointer"
                            title="点击在工作区查看"
                          >{edit.file}</span>
                          {edit.status === 'success' ? (
                            <span className="text-emerald-500 flex items-center gap-1"><CheckCircle size={12} /> 成功</span>
                          ) : (
                            <span className="text-red-500 flex items-center gap-1"><XCircle size={12} /> 失败</span>
                          )}
                        </div>
                        <div className="rounded-lg overflow-hidden text-xs">
                          <Suspense fallback={<div className="h-20 bg-zinc-100 dark:bg-zinc-800 animate-pulse" />}>
                            <SyntaxHighlighter
                              language="diff"
                              style={isDarkMode ? githubDarkTheme : githubLightTheme}
                              wrapLongLines={true}
                              customStyle={{ margin: 0, padding: '12px', fontSize: '12px' }}
                            >
                              {edit.diff}
                            </SyntaxHighlighter>
                          </Suspense>
                        </div>
                      </div>
                    ))}
                  </div>
                </CollapsibleSection>
              )}

              {msg.todos && msg.todos.length > 0 && (
                <div className="w-full min-w-0 max-w-full overflow-hidden">
                  <TodoContainer todos={msg.todos} />
                </div>
              )}

              {(msg.content || (msg.role === 'assistant' && !msg.content && (isWaitingForResponse || isSearching) && isLastMessage)) && (
                <div className={cn(
                  "inline-block break-words min-w-0 max-w-full overflow-hidden",
                  msg.role === 'user' 
                    ? "bg-indigo-600 text-white rounded-tr-none px-4 py-3 rounded-2xl text-sm leading-relaxed" 
                    : (msg.content || (isWaitingForResponse || isSearching) ? (appMode === 'command' ? "w-full text-sm leading-relaxed" : "glass rounded-tl-none px-4 py-3 rounded-2xl text-sm leading-relaxed") : "")
                )}>
                  {msg.role === 'assistant' && !msg.content && !msg.agentExecution?.reasoningSteps?.length && (isWaitingForResponse || isSearching) && isLastMessage && (
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
                        "prose prose-sm max-w-none min-w-0 prose-pre:p-0 prose-pre:m-0 prose-pre:bg-transparent break-words overflow-hidden",
                        isDarkMode ? "prose-invert" : ""
                      )}>
                        <ReactMarkdown components={markdownComponents}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
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
                          onClick={handleCancelEdit}
                          className={cn(
                            "px-3 py-1.5 text-xs rounded-lg transition-colors",
                            isUser ? "bg-white/10 hover:bg-white/20 text-white" : "bg-zinc-500/10 hover:bg-zinc-500/20 text-zinc-500"
                          )}
                        >
                          取消
                        </button>
                        <button
                          onClick={handleSaveEdit}
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
              {msg.role === 'user' && !isStreaming && !editingMessageId && appMode !== 'command' && (
                <div className="flex items-center gap-1 opacity-100">
                  <button
                    onClick={() => onCopy(msg.content, `user-copy-${msg.id}`)}
                    className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-600 rounded-lg transition-colors"
                    title="复制消息"
                  >
                    {copiedId === `user-copy-${msg.id}` ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                  </button>
                  <button
                    onClick={handleStartEdit}
                    className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-600 rounded-lg transition-colors"
                    title="编辑消息"
                  >
                    <Edit2 size={14} />
                  </button>
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                {msg.mode === 'command' && <span>• 命令模式</span>}
                {msg.role === 'assistant' && msg.executionTime !== undefined && (
                  <>
                    <span>•</span>
                    <span>{(msg.executionTime / 1000).toFixed(1)}s</span>
                    <span>•</span>
                    <span>{msg.tokenCount} tokens</span>
                    <span>•</span>
                    <span>{msg.tokenSpeed} tok/s</span>
                  </>
                )}
              </div>

              {msg.role === 'user' && !isStreaming && !editingMessageId && appMode === 'command' && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onCopy(msg.content, `user-copy-${msg.id}`)}
                    className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-600 rounded-lg transition-colors"
                    title="复制消息"
                  >
                    {copiedId === `user-copy-${msg.id}` ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                  </button>
                  <button
                    onClick={handleStartEdit}
                    className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-600 rounded-lg transition-colors"
                    title="编辑消息"
                  >
                    <Edit2 size={14} />
                  </button>
                </div>
              )}

              {msg.role === 'assistant' && !isStreaming && appMode !== 'command' && (
                <div className="flex items-center gap-1 opacity-100">
                  <button
                    onClick={() => onCopy((msg.content || '').replace(/<think[\s\S]*?<\/think>/g, '').trim(), `text-${msg.id}`)}
                    className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-600 rounded-lg transition-colors"
                    title="复制文字"
                  >
                    {copiedId === `text-${msg.id}` ? <Check size={14} className="text-emerald-500" /> : <FileText size={14} />}
                  </button>
                  <button
                    onClick={() => onCopy(msg.content, `md-${msg.id}`)}
                    className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-600 rounded-lg transition-colors"
                    title="复制 Markdown"
                  >
                    {copiedId === `md-${msg.id}` ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                  </button>
                  <button
                    onClick={() => onRegenerateMessage?.(msg.id)}
                    className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-600 rounded-lg transition-colors"
                    title="重新回答"
                  >
                    <RotateCcw size={14} />
                  </button>
                  <button
                    onClick={handleStartEdit}
                    className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-600 rounded-lg transition-colors"
                    title="编辑回答"
                  >
                    <Edit2 size={14} />
                  </button>

                  {msg.versions && msg.versions.length > 1 && (
                    <div className={cn(
                      "flex items-center gap-1 ml-1 text-[11px] font-bold px-2 py-1 rounded-md border",
                      isDarkMode 
                        ? "bg-zinc-700 text-zinc-400 border-zinc-600" 
                        : "bg-zinc-100 text-zinc-500 border-zinc-200"
                    )}>
                      <button
                        disabled={(msg.currentVersionIndex || 0) === 0}
                        onClick={() => onSwitchVersion?.(msg.id, (msg.currentVersionIndex || 0) - 1)}
                        className="p-0.5 rounded hover:bg-zinc-500/10 disabled:opacity-20 transition-colors"
                      >
                        <ChevronLeft size={12} />
                      </button>
                      <span className="px-1">{(msg.currentVersionIndex || 0) + 1}/{msg.versions.length}</span>
                      <button
                        disabled={(msg.currentVersionIndex || 0) === msg.versions.length - 1}
                        onClick={() => onSwitchVersion?.(msg.id, (msg.currentVersionIndex || 0) + 1)}
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

          {appMode === 'command' && !isUser && (
            <div className="flex items-center gap-4 mt-4 pt-2 border-t border-zinc-500/10 text-zinc-500 dark:text-zinc-400">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onCopy((msg.content || '').replace(/<think[\s\S]*?<\/think>/g, '').trim(), `text-${msg.id}`)}
                  className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-600 rounded-lg transition-colors"
                  title="复制文字"
                >
                  {copiedId === `text-${msg.id}` ? <Check size={14} className="text-emerald-500" /> : <FileText size={14} />}
                </button>
                <button
                  onClick={() => onCopy(msg.content, `md-${msg.id}`)}
                  className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-600 rounded-lg transition-colors"
                  title="复制 Markdown"
                >
                  {copiedId === `md-${msg.id}` ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                </button>
                <button
                  onClick={() => onRegenerateMessage?.(msg.id)}
                  className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-600 rounded-lg transition-colors"
                  title="重新回答"
                >
                  <RotateCcw size={14} />
                </button>
                <button
                  onClick={handleStartEdit}
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
});

MessageItem.displayName = 'MessageItem';
