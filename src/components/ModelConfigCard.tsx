import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Power, Pencil, Trash2, ChevronUp, ChevronDown, Server, Cpu, Globe, RefreshCw, Clock, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { ModelConfig } from '../types';
import { ModelLogo, ProviderLogo } from './ModelLogo';

interface ModelConfigCardProps {
  config: ModelConfig;
  isActive: boolean;
  isDarkMode: boolean;
  onToggleActive: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReorder: (direction: 'up' | 'down') => void;
  onCheckConnection?: () => void;
  isCheckingConnection?: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

const providerLabels = {
  'lm-studio': 'LM Studio',
  'ollama': 'Ollama',
  'online': '在线',
};

export const ModelConfigCard: React.FC<ModelConfigCardProps> = ({
  config,
  isActive,
  isDarkMode,
  onToggleActive,
  onEdit,
  onDelete,
  onReorder,
  onCheckConnection,
  isCheckingConnection = false,
  canMoveUp,
  canMoveDown,
}) => {
  const [showDetails, setShowDetails] = useState(false);
  
  const statusColors = {
    active: 'bg-emerald-500',
    inactive: 'bg-zinc-400',
    error: 'bg-red-500',
  };

  const statusLabels = {
    active: '可用',
    inactive: '未验证',
    error: '连接错误',
  };

  const formatLastConnected = (timestamp?: number) => {
    if (!timestamp) return '从未连接';
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    return `${Math.floor(diff / 86400000)} 天前`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className={cn(
        "group relative rounded-xl border transition-all",
        isActive
          ? isDarkMode
            ? "bg-indigo-500/10 border-indigo-500/50"
            : "bg-indigo-50 border-indigo-200"
          : isDarkMode
            ? "bg-zinc-800/50 border-zinc-700 hover:border-zinc-600"
            : "bg-white border-zinc-200 hover:border-zinc-300"
      )}
    >
      <div 
        className="p-4 cursor-pointer"
        onClick={() => setShowDetails(!showDetails)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={cn(
              "w-2 h-2 rounded-full flex-shrink-0",
              statusColors[config.status]
            )} />
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <ModelLogo 
                  provider={config.provider === 'online' ? config.onlineProvider : config.provider}
                  modelId={config.modelId}
                  size={14}
                />
                <span className={cn(
                  "font-medium truncate",
                  isDarkMode ? "text-zinc-200" : "text-zinc-900"
                )}>
                  {config.name}
                </span>
              </div>
              <div className={cn(
                "flex items-center gap-2 mt-1 text-xs",
                isDarkMode ? "text-zinc-400" : "text-zinc-500"
              )}>
                <span>{providerLabels[config.provider]}</span>
                <span>·</span>
                <span>{config.modelId}</span>
                <span>·</span>
                <span className={cn(
                  config.status === 'active'
                    ? isDarkMode ? "text-emerald-400" : "text-emerald-600"
                    : config.status === 'error'
                      ? isDarkMode ? "text-red-400" : "text-red-600"
                      : isDarkMode ? "text-zinc-500" : "text-zinc-400"
                )}>
                  {statusLabels[config.status]}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <span className={cn(
              "text-xs font-bold px-2 py-0.5 rounded",
              isDarkMode ? "bg-zinc-700 text-zinc-300" : "bg-zinc-100 text-zinc-600"
            )}>
              {config.priority}
            </span>
            
            <div className="flex items-center gap-0.5 ml-2">
              <button
                onClick={(e) => { e.stopPropagation(); onReorder('up'); }}
                disabled={!canMoveUp}
                className={cn(
                  "p-1 rounded transition-colors",
                  canMoveUp
                    ? isDarkMode
                      ? "hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200"
                      : "hover:bg-zinc-100 text-zinc-500 hover:text-zinc-700"
                    : "opacity-30 cursor-not-allowed"
                )}
                title="上移"
              >
                <ChevronUp size={14} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onReorder('down'); }}
                disabled={!canMoveDown}
                className={cn(
                  "p-1 rounded transition-colors",
                  canMoveDown
                    ? isDarkMode
                      ? "hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200"
                      : "hover:bg-zinc-100 text-zinc-500 hover:text-zinc-700"
                    : "opacity-30 cursor-not-allowed"
                )}
                title="下移"
              >
                <ChevronDown size={14} />
              </button>
            </div>

            <div className="flex items-center gap-1 ml-2">
              <button
                onClick={(e) => { e.stopPropagation(); onToggleActive(); }}
                className={cn(
                  "p-1.5 rounded-lg transition-colors",
                  isActive
                    ? "bg-emerald-500/20 text-emerald-500"
                    : isDarkMode
                      ? "hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200"
                      : "hover:bg-zinc-100 text-zinc-500 hover:text-zinc-700"
                )}
                title={isActive ? '取消选择' : '选择'}
              >
                <Power size={16} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className={cn(
                  "p-1.5 rounded-lg transition-colors",
                  isDarkMode
                    ? "hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200"
                    : "hover:bg-zinc-100 text-zinc-500 hover:text-zinc-700"
                )}
                title="编辑"
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className={cn(
                  "p-1.5 rounded-lg transition-colors",
                  isDarkMode
                    ? "hover:bg-red-500/20 text-zinc-400 hover:text-red-400"
                    : "hover:bg-red-50 text-zinc-500 hover:text-red-500"
                )}
                title="删除"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showDetails && (
          <motion.div
            initial={{ maxHeight: 0, opacity: 0 }}
            animate={{ maxHeight: 300, opacity: 1 }}
            exit={{ maxHeight: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className={cn(
              "px-4 pb-4 pt-0 border-t",
              isDarkMode ? "border-zinc-700" : "border-zinc-200"
            )}>
              <div className="pt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className={cn(
                    "text-xs font-medium",
                    isDarkMode ? "text-zinc-400" : "text-zinc-500"
                  )}>
                    连接状态
                  </span>
                  <div className="flex items-center gap-2">
                    {config.status === 'active' && (
                      <div className="flex items-center gap-1 text-emerald-500">
                        <CheckCircle2 size={14} />
                        <span className="text-xs">已连接</span>
                      </div>
                    )}
                    {config.status === 'error' && (
                      <div className="flex items-center gap-1 text-red-500">
                        <XCircle size={14} />
                        <span className="text-xs">连接失败</span>
                      </div>
                    )}
                    {config.status === 'inactive' && (
                      <div className="flex items-center gap-1 text-zinc-400">
                        <AlertCircle size={14} />
                        <span className="text-xs">未验证</span>
                      </div>
                    )}
                    {onCheckConnection && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onCheckConnection(); }}
                        disabled={isCheckingConnection}
                        className={cn(
                          "p-1 rounded transition-colors",
                          isDarkMode
                            ? "hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200"
                            : "hover:bg-zinc-100 text-zinc-500 hover:text-zinc-700",
                          isCheckingConnection && "opacity-50 cursor-not-allowed"
                        )}
                        title="检测连接"
                      >
                        <RefreshCw size={14} className={isCheckingConnection ? "animate-spin" : ""} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className={cn(
                    "text-xs font-medium",
                    isDarkMode ? "text-zinc-400" : "text-zinc-500"
                  )}>
                    最后连接
                  </span>
                  <div className="flex items-center gap-1">
                    <Clock size={12} className={isDarkMode ? "text-zinc-500" : "text-zinc-400"} />
                    <span className={cn(
                      "text-xs",
                      isDarkMode ? "text-zinc-300" : "text-zinc-600"
                    )}>
                      {formatLastConnected(config.lastConnected)}
                    </span>
                  </div>
                </div>

                {config.pricing && (config.pricing.inputPrice > 0 || config.pricing.outputPrice > 0) && (
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      "text-xs font-medium",
                      isDarkMode ? "text-zinc-400" : "text-zinc-500"
                    )}>
                      定价
                    </span>
                    <span className={cn(
                      "text-xs",
                      isDarkMode ? "text-zinc-300" : "text-zinc-600"
                    )}>
                      ${config.pricing.inputPrice.toFixed(2)} / ${config.pricing.outputPrice.toFixed(2)} 每1M tokens
                    </span>
                  </div>
                )}

                {config.timeout && (
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      "text-xs font-medium",
                      isDarkMode ? "text-zinc-400" : "text-zinc-500"
                    )}>
                      超时时间
                    </span>
                    <span className={cn(
                      "text-xs",
                      isDarkMode ? "text-zinc-300" : "text-zinc-600"
                    )}>
                      {config.timeout} 秒
                    </span>
                  </div>
                )}

                {config.rpm > 0 && (
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      "text-xs font-medium",
                      isDarkMode ? "text-zinc-400" : "text-zinc-500"
                    )}>
                      RPM 限制
                    </span>
                    <span className={cn(
                      "text-xs",
                      isDarkMode ? "text-zinc-300" : "text-zinc-600"
                    )}>
                      {config.rpm} 次/分钟
                    </span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
