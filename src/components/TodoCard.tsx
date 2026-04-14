import React, { useState } from 'react';
import { 
  CheckCircle2, 
  Circle, 
  Loader2, 
  AlertCircle, 
  ChevronDown, 
  ChevronUp, 
  ExternalLink,
  ArrowRight,
  ListTodo,
  Search,
  FileText,
  Globe,
  Wrench,
  XCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { TodoItem, TodoStep } from '../types';
import { useGlobalState } from '../context/GlobalStateContext';
import { useFileViewer } from '../context/FileViewerContext';

const FILE_PATH_REGEX = /[A-Za-z]:\\(?:[^\s<>|*?\]"'。，！？；：（）、\]]| (?=[^\s<>|*?\]"'。，！？；：（）、\]]))+|\/(?:home|Users|usr|tmp|var|etc|opt)\/(?:[^\s<>|*?\]"'。，！？；：（）、\]]| (?=[^\s<>|*?\]"'。，！？；：（）、\]]))+/g;

function linkifyFilePaths(text: string, onFileClick: (path: string) => void): React.ReactNode[] {
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
        className="text-blue-500 hover:text-blue-600 hover:underline cursor-pointer break-all"
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
}

const openExternalLink = async (url: string) => {
  try {
    const { open } = await import('@tauri-apps/plugin-shell');
    await open(url);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
};

interface TodoContainerProps {
  todos: TodoItem[];
}

const StepDetail: React.FC<{ step: TodoStep; stepIdx: number; todoId: string }> = ({ step, stepIdx, todoId }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { openFile } = useFileViewer();
  const hasDetail = (step.result && step.result.length > 0) || 
                    (step.observationData && step.observationData.length > 0) || 
                    (step.error && step.error.length > 0) ||
                    !!step.filePath;

  return (
    <div className="flex flex-col">
      <div 
        className={cn(
          "flex items-center gap-2 text-[11px]",
          hasDetail && "cursor-pointer hover:bg-zinc-500/10 dark:hover:bg-white/5 rounded px-1 -mx-1"
        )}
        onClick={() => hasDetail && setIsExpanded(!isExpanded)}
      >
        <div className={cn(
          "w-1.5 h-1.5 rounded-full shrink-0",
          step.status === 'completed' ? "bg-emerald-500" :
          step.status === 'working' ? "bg-blue-500 animate-pulse" :
          step.status === 'failed' ? "bg-red-500" : "bg-zinc-300 dark:bg-zinc-600"
        )} />
        <span className={cn(
          "flex-1 truncate",
          step.status === 'completed' ? "text-zinc-400" :
          step.status === 'failed' ? "text-red-400" : "text-zinc-600 dark:text-zinc-300"
        )}>
          {linkifyFilePaths(step.label, openFile)}
        </span>
        {step.status === 'working' && (
          <span className="text-[9px] text-blue-500 font-medium shrink-0">进行中</span>
        )}
        {step.status === 'failed' && (
          <XCircle size={10} className="text-red-500 shrink-0" />
        )}
        {hasDetail && (
          <span className="shrink-0 text-zinc-400">
            {isExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </span>
        )}
      </div>

      <AnimatePresence>
        {isExpanded && hasDetail && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden ml-2"
          >
            <div className="pl-2 border-l border-zinc-500/20 dark:border-white/10 py-1.5 space-y-1.5 min-w-0 overflow-x-hidden">
              {step.filePath && (
                <div className="flex items-start gap-1.5 text-[10px]">
                  <FileText size={9} className="shrink-0 mt-0.5 text-blue-400" />
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      openFile(step.filePath!);
                    }}
                    className="text-blue-500 hover:text-blue-600 hover:underline cursor-pointer break-all"
                    title="点击在工作区查看"
                  >
                    {step.filePath}
                  </span>
                </div>
              )}
              {step.error && (
                <div className="flex items-start gap-1.5 text-[10px] text-red-400">
                  <AlertCircle size={10} className="shrink-0 mt-0.5" />
                  <span className="break-all">{linkifyFilePaths(step.error, openFile)}</span>
                </div>
              )}
              {step.observationData && step.observationData.length > 0 && (
                <div className="space-y-1">
                  {step.observationData.map((item, idx) => (
                    <div 
                      key={idx}
                      className="flex items-start gap-1.5 text-[10px]"
                    >
                      <Globe size={9} className="shrink-0 mt-0.5 text-blue-400" />
                      <div className="min-w-0">
                        {item.url ? (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              openExternalLink(item.url);
                            }}
                            className="truncate text-blue-500 hover:underline cursor-pointer"
                          >
                            {item.title}
                          </div>
                        ) : (
                          <div className="truncate text-zinc-500 dark:text-zinc-400">{item.title}</div>
                        )}
                        {item.snippet && (
                          <div className="text-[9px] opacity-60 line-clamp-2 mt-0.5 text-zinc-500 dark:text-zinc-400">{item.snippet}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {step.result && !step.observationData && (
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400 max-h-32 overflow-y-auto whitespace-pre-wrap break-all">
                  {linkifyFilePaths(step.result.length > 300 ? step.result.substring(0, 300) + '...' : step.result, openFile)}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const TodoCard: React.FC<TodoItem & { onNavigateToSubAgent?: (id: string) => void }> = ({ 
  title, 
  status, 
  progress, 
  description, 
  targetSessionId,
  onNavigateToSubAgent 
}) => {
  return (
    <div className="p-3 rounded-xl bg-zinc-500/5 border border-zinc-500/10 hover:border-blue-500/30 transition-colors group">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="shrink-0">
            {status === 'completed' ? <CheckCircle2 size={14} className="text-emerald-500" /> :
             status === 'working' ? <Loader2 size={14} className="text-blue-500 animate-spin" /> :
             status === 'failed' ? <AlertCircle size={14} className="text-red-500" /> :
             <Circle size={14} className="text-zinc-500" />}
          </div>
          <span className={cn(
            "text-xs font-medium truncate",
            status === 'completed' ? "text-zinc-500 line-through" : "text-zinc-200"
          )}>
            {title}
          </span>
        </div>
        <span className="text-[10px] font-mono text-blue-500 font-bold">{progress}%</span>
      </div>
      
      {description && <p className="text-[10px] opacity-50 line-clamp-1 mb-2">{description}</p>}
      
      <div className="h-1 w-full bg-zinc-500/10 rounded-full overflow-hidden mb-2">
        <div 
          className={cn(
            "h-full transition-all duration-500",
            status === 'completed' ? "bg-emerald-500" : "bg-blue-500"
          )}
          style={{ width: `${progress}%` }}
        />
      </div>

      {targetSessionId && (
        <button 
          onClick={() => onNavigateToSubAgent?.(targetSessionId)}
          className="text-[9px] text-blue-500 hover:text-blue-400 font-medium flex items-center gap-1"
        >
          查看子任务 <ArrowRight size={10} />
        </button>
      )}
    </div>
  );
};

export const TodoContainer: React.FC<TodoContainerProps> = ({ todos }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { switchSession } = useGlobalState();

  const totalProgress = Math.round(
    todos.reduce((acc, curr) => acc + curr.progress, 0) / todos.length
  );

  const getStatusIcon = (status: TodoItem['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="text-emerald-500" size={16} />;
      case 'working':
        return <Loader2 className="text-blue-500 animate-spin" size={16} />;
      case 'failed':
        return <AlertCircle className="text-red-500" size={16} />;
      default:
        return <Circle className="text-zinc-400" size={16} />;
    }
  };

  const hasStepErrors = (steps?: TodoStep[]) => {
    if (!steps) return false;
    return steps.some(s => s.status === 'failed' || s.error);
  };

  return (
    <div className="glass rounded-2xl overflow-hidden shadow-sm my-2 min-w-0 max-w-full">
      <div className="p-4 border-b border-zinc-200/50 dark:border-white/5 bg-zinc-500/5 dark:bg-white/5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
              <ListTodo size={18} />
            </div>
            <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">任务执行看板</h3>
          </div>
          <span className="text-xs font-mono font-bold text-blue-500">{totalProgress}%</span>
        </div>
        <div className="h-1.5 w-full bg-zinc-200 dark:bg-zinc-600/50 rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${totalProgress}%` }}
            className="h-full bg-blue-500"
          />
        </div>
      </div>

      <div className="divide-y divide-zinc-200/50 dark:divide-white/5 min-w-0">
        {todos.map((todo) => (
          <div key={todo.id} className="group min-w-0">
            <div 
              className={cn(
                "p-4 flex items-center gap-3 cursor-pointer transition-colors",
                expandedId === todo.id ? "bg-blue-500/10 dark:bg-blue-500/20" : "hover:bg-zinc-500/5 dark:hover:bg-white/5"
              )}
              onClick={() => setExpandedId(expandedId === todo.id ? null : todo.id)}
            >
              <div className="shrink-0">
                {getStatusIcon(todo.status)}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-sm font-medium truncate",
                    todo.status === 'completed' ? "text-zinc-400 line-through" : "text-zinc-900 dark:text-zinc-100"
                  )}>
                    {todo.title}
                  </span>
                  {todo.targetSessionId && (
                    <ExternalLink size={12} className="text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>
                {todo.status === 'working' && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className="flex gap-0.5">
                      {[0, 1, 2].map(i => (
                        <motion.div 
                          key={`dot-${i}`}
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                          className="w-1 h-1 rounded-full bg-blue-500"
                        />
                      ))}
                    </div>
                    <span className="text-[10px] text-blue-500 font-medium uppercase tracking-tighter">
                      {todo.steps?.some(s => s.status === 'working') 
                        ? todo.steps.find(s => s.status === 'working')?.label || 'Processing...'
                        : 'Processing...'}
                    </span>
                  </div>
                )}
                {todo.status === 'failed' && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[10px] text-red-500 font-medium uppercase tracking-tighter">已停止</span>
                  </div>
                )}
                {todo.status === 'completed' && hasStepErrors(todo.steps) && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <AlertCircle size={10} className="text-amber-500" />
                    <span className="text-[10px] text-amber-500 font-medium">部分工具调用失败</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="text-[10px] font-mono text-zinc-400">{todo.progress}%</span>
                {expandedId === todo.id ? <ChevronUp size={14} className="text-zinc-400" /> : <ChevronDown size={14} className="text-zinc-400" />}
              </div>
            </div>

            <AnimatePresence>
              {expandedId === todo.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden bg-zinc-500/5 dark:bg-white/5"
                >
                  <div className="px-4 pb-4 space-y-3 min-w-0 overflow-x-hidden">
                    {todo.description && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                        {todo.description}
                      </p>
                    )}

                    {todo.steps && todo.steps.length > 0 && (
                      <div className="space-y-1.5 py-1">
                        {todo.steps.map((step, stepIdx) => (
                          <StepDetail 
                            key={`${todo.id}-step-${stepIdx}`}
                            step={step}
                            stepIdx={stepIdx}
                            todoId={todo.id}
                          />
                        ))}
                      </div>
                    )}

                    {todo.targetSessionId && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          switchSession(todo.targetSessionId!);
                        }}
                        className="flex items-center gap-2 text-[11px] font-semibold text-blue-500 hover:text-blue-600 transition-colors group/link"
                      >
                        <span>跳转到子 Agent 对话</span>
                        <ArrowRight size={12} className="group-hover/link:translate-x-1 transition-transform" />
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
};
