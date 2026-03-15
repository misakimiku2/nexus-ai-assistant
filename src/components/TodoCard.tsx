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
  ListTodo
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { TodoItem } from '../types';
import { useGlobalState } from '../context/GlobalStateContext';

interface TodoContainerProps {
  todos: TodoItem[];
}

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

  return (
    <div className="glass rounded-2xl overflow-hidden shadow-sm my-2">
      {/* Header with Overall Progress */}
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

      {/* Todo List */}
      <div className="divide-y divide-zinc-200/50 dark:divide-white/5">
        {todos.map((todo) => (
          <div key={todo.id} className="group">
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
                    <span className="text-[10px] text-blue-500 font-medium uppercase tracking-tighter">Processing...</span>
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
                  <div className="px-11 pb-4 space-y-3">
                    {todo.description && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                        {todo.description}
                      </p>
                    )}

                    {todo.steps && todo.steps.length > 0 && (
                      <div className="space-y-2 py-2">
                        {todo.steps.map((step) => (
                          <div key={step.label} className="flex items-center gap-2 text-[11px]">
                            <div className={cn(
                              "w-1 h-1 rounded-full",
                              step.status === 'completed' ? "bg-emerald-500" :
                              step.status === 'working' ? "bg-blue-500 animate-pulse" : "bg-zinc-300 dark:bg-zinc-600"
                            )} />
                            <span className={cn(
                              "flex-1",
                              step.status === 'completed' ? "text-zinc-400 line-through" : "text-zinc-600 dark:text-zinc-300"
                            )}>
                              {step.label}
                            </span>
                          </div>
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
