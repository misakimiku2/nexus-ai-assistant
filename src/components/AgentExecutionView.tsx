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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-[var(--bg-primary)] rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden"
      >
        <div className="p-4 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            <span className="font-medium">工具授权请求</span>
          </div>
        </div>

        <div className="p-4">
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Agent 请求执行以下工具，需要您的授权：
          </p>

          <div className="bg-[var(--bg-secondary)] rounded-lg p-3 mb-4">
            <div className="font-mono text-sm font-medium text-orange-500 mb-2">
              {toolCall.toolName}
            </div>
            <pre className="text-xs text-[var(--text-secondary)] overflow-x-auto">
              {JSON.stringify(toolCall.parameters, null, 2)}
            </pre>
          </div>

          <p className="text-xs text-[var(--text-secondary)]">
            请确认是否允许执行此操作。此操作可能会修改您的文件系统或执行系统命令。
          </p>
        </div>

        <div className="flex gap-2 p-4 border-t border-[var(--border-color)]">
          <button
            onClick={onReject}
            className="flex-1 px-4 py-2 rounded-lg border border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
          >
            拒绝
          </button>
          <button
            onClick={onApprove}
            className="flex-1 px-4 py-2 rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors"
          >
            授权执行
          </button>
        </div>
      </motion.div>
    </div>
  );
};
