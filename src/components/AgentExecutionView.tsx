import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Brain,
  Wrench,
  Eye,
  CheckCircle,
  XCircle,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Bot,
  Database,
  Globe,
  Terminal,
  FileEdit,
  X,
} from 'lucide-react';
import { cn } from '../lib/utils';
import {
  AgentStatus,
  ReasoningStep,
  ToolCallRecord,
} from '../agent/types';

interface AgentExecutionViewProps {
  status: AgentStatus;
  reasoningSteps: ReasoningStep[];
  toolCalls: ToolCallRecord[];
  iterationCount: number;
  maxIterations: number;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export const AgentExecutionView: React.FC<AgentExecutionViewProps> = ({
  status,
  reasoningSteps,
  toolCalls,
  iterationCount,
  maxIterations,
  isExpanded = true,
  onToggleExpand,
}) => {
  const getStatusColor = () => {
    switch (status) {
      case 'thinking':
        return 'text-blue-500';
      case 'acting':
        return 'text-amber-500';
      case 'waiting_auth':
        return 'text-orange-500';
      case 'completed':
        return 'text-green-500';
      case 'failed':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'thinking':
        return '思考中...';
      case 'acting':
        return '执行工具...';
      case 'waiting_auth':
        return '等待授权...';
      case 'completed':
        return '任务完成';
      case 'failed':
        return '任务失败';
      default:
        return '空闲';
    }
  };

  const getStepIcon = (type: ReasoningStep['type']) => {
    switch (type) {
      case 'thought':
        return <Brain className="w-4 h-4 text-blue-500" />;
      case 'action':
        return <Wrench className="w-4 h-4 text-amber-500" />;
      case 'observation':
        return <Eye className="w-4 h-4 text-purple-500" />;
    }
  };

  const getToolCallStatusIcon = (record: ToolCallRecord) => {
    switch (record.status) {
      case 'pending':
      case 'executing':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'waiting_auth':
        return <AlertTriangle className="w-4 h-4 text-orange-500" />;
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const isActive = status !== 'idle' && status !== 'completed' && status !== 'failed';

  return (
    <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-[var(--bg-tertiary)]"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-[var(--text-secondary)]" />
          ) : (
            <ChevronRight className="w-4 h-4 text-[var(--text-secondary)]" />
          )}
          <span className={cn('font-medium', getStatusColor())}>
            {getStatusText()}
          </span>
          {isActive && (
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
          )}
        </div>
        <div className="text-xs text-[var(--text-secondary)]">
          步骤 {iterationCount}/{maxIterations}
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (reasoningSteps.length > 0 || toolCalls.length > 0) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-[var(--border-color)]"
          >
            <div className="max-h-60 overflow-y-auto p-3 space-y-2">
              {reasoningSteps.map((step, index) => (
                <div
                  key={step.id}
                  className="flex items-start gap-2 text-sm"
                >
                  <div className="mt-0.5">{getStepIcon(step.type)}</div>
                  <div className="flex-1">
                    <span className="text-xs text-[var(--text-secondary)] uppercase">
                      {step.type === 'thought' ? '思考' : 
                       step.type === 'action' ? '行动' : '观察'}
                    </span>
                    <p className="text-[var(--text-primary)] whitespace-pre-wrap">
                      {step.content.length > 200 
                        ? step.content.substring(0, 200) + '...' 
                        : step.content}
                    </p>
                  </div>
                </div>
              ))}

              {toolCalls.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[var(--border-color)]">
                  <div className="text-xs text-[var(--text-secondary)] mb-2">
                    工具调用 ({toolCalls.length})
                  </div>
                  {toolCalls.map((tc) => (
                    <div
                      key={tc.id}
                      className="flex items-center gap-2 text-sm py-1"
                    >
                      {getToolCallStatusIcon(tc)}
                      <span className="font-mono text-xs bg-[var(--bg-tertiary)] px-2 py-0.5 rounded">
                        {tc.toolName}
                      </span>
                      <span className="text-[var(--text-secondary)] text-xs">
                        {tc.status === 'success' ? '成功' : 
                         tc.status === 'error' ? '失败' :
                         tc.status === 'waiting_auth' ? '待授权' : '执行中'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface ToolAuthModalProps {
  toolCall: ToolCallRecord | null;
  onApprove: () => void;
  onReject: () => void;
}

export const ToolAuthModal: React.FC<ToolAuthModalProps> = ({
  toolCall,
  onApprove,
  onReject,
}) => {
  if (!toolCall) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-xl shadow-2xl w-full max-w-md mx-4 animate-in fade-in zoom-in duration-200 overflow-hidden">
        <div className="flex justify-between items-center p-4 pb-3">
          <div className="flex items-center gap-2">
            <Wrench size={18} className="text-orange-500" />
            <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">工具授权请求</h3>
          </div>
          <button onClick={onReject} className="text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="px-4 pb-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-300 mb-3">
            Agent 请求执行以下工具，需要您的授权：
          </p>

          <div className="bg-zinc-50 dark:bg-zinc-800 rounded-lg p-3 mb-3">
            <div className="font-mono text-sm font-medium text-orange-500 mb-1.5 flex items-center gap-1.5">
              {toolCall.toolName.includes('search') || toolCall.toolName.includes('fetch') ? (
                <Globe size={14} />
              ) : toolCall.toolName.includes('write') || toolCall.toolName.includes('edit') ? (
                <FileEdit size={14} />
              ) : toolCall.toolName.includes('shell') || toolCall.toolName.includes('exec') ? (
                <Terminal size={14} />
              ) : (
                <Wrench size={14} />
              )}
              {toolCall.toolName}
            </div>
            <pre className="text-xs text-zinc-500 dark:text-zinc-400 overflow-x-auto whitespace-pre-wrap break-all max-h-32 overflow-y-auto leading-relaxed">
              {JSON.stringify(toolCall.parameters, null, 2)}
            </pre>
          </div>

          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            请确认是否允许执行此操作。此操作可能会修改您的文件系统或执行系统命令。
          </p>
        </div>

        <div className="flex justify-end gap-3 p-4 pt-0">
          <button
            onClick={onReject}
            className="px-4 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-600 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-500 transition-colors"
          >
            拒绝
          </button>
          <button
            onClick={() => {
              onApprove();
            }}
            className="px-4 py-2 rounded-lg bg-orange-500/10 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 hover:bg-orange-500/20 dark:hover:bg-orange-500/30 transition-colors font-medium"
          >
            授权执行
          </button>
        </div>
      </div>
    </div>
  );
};
