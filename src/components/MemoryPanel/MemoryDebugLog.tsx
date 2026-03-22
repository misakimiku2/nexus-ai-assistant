import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Trash2, Download, Clock } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useMemoryUI } from '../../context/MemoryUIContext';
import { 
  MemoryDebugLogType,
  MemoryDebugLogEntry
} from './types';

interface MemoryDebugLogProps {
  isDarkMode: boolean;
}

export const MemoryDebugLog: React.FC<MemoryDebugLogProps> = ({ isDarkMode }) => {
  const { t } = useTranslation();
  const { debugLogs, clearDebugLogs } = useMemoryUI();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const exportLogs = () => {
    const data = JSON.stringify(debugLogs, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `memory-debug-logs-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatTimestamp = (ts: number) => {
    return new Date(ts).toLocaleString();
  };

  const formatRelativeTime = (ts: number) => {
    const diff = Date.now() - ts;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 60) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ago`;
    return `${hours}h ago`;
  };

  if (debugLogs.length === 0) {
    return (
      <div className={cn(
        "flex flex-col items-center justify-center py-12 text-center",
        isDarkMode ? "text-zinc-500" : "text-zinc-400"
      )}>
        <Clock size={48} className="mb-4 opacity-30" />
        <p className="text-lg font-medium mb-2">{t('memory.logs.noLogs')}</p>
        <p className="text-sm">
          {t('memory.logs.noLogsDesc')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className={cn(
          "text-sm",
          isDarkMode ? "text-zinc-400" : "text-zinc-500"
        )}>
          {debugLogs.length} {t('memory.logs.logEntries')}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={exportLogs}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
              isDarkMode
                ? "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200"
            )}
          >
            <Download size={12} />
            {t('memory.logs.export')}
          </button>
          <button
            onClick={clearDebugLogs}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
              isDarkMode
                ? "text-red-400 hover:bg-red-500/10"
                : "text-red-500 hover:bg-red-50"
            )}
          >
            <Trash2 size={12} />
            {t('memory.logs.clear')}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {debugLogs.map((log) => (
          <LogEntryCard
            key={log.id}
            log={log}
            isDarkMode={isDarkMode}
            isExpanded={expandedIds.has(log.id)}
            onToggle={() => toggleExpand(log.id)}
            formatTimestamp={formatTimestamp}
            formatRelativeTime={formatRelativeTime}
          />
        ))}
      </div>
    </div>
  );
};

interface LogEntryCardProps {
  log: MemoryDebugLogEntry;
  isDarkMode: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  formatTimestamp: (ts: number) => string;
  formatRelativeTime: (ts: number) => string;
}

const LogEntryCard: React.FC<LogEntryCardProps> = ({
  log,
  isDarkMode,
  isExpanded,
  onToggle,
  formatTimestamp,
  formatRelativeTime,
}) => {
  const { t } = useTranslation();
  const hasDetails = Object.keys(log.data).length > 0;

  return (
    <div
      className={cn(
        "rounded-lg border overflow-hidden",
        isDarkMode
          ? "bg-zinc-800/30 border-zinc-700"
          : "bg-zinc-50 border-zinc-200"
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 cursor-pointer",
          hasDetails && (isDarkMode ? "hover:bg-zinc-700/50" : "hover:bg-zinc-100")
        )}
        onClick={hasDetails ? onToggle : undefined}
      >
        {hasDetails ? (
          isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
        ) : (
          <div className="w-3.5" />
        )}

        <span className={cn(
          "text-xs",
          isDarkMode ? "text-zinc-500" : "text-zinc-400"
        )}>
          {formatTimestamp(log.timestamp)}
        </span>

        <span className={cn(
          "text-xs",
          isDarkMode ? "text-zinc-400" : "text-zinc-500"
        )}>
          {formatRelativeTime(log.timestamp)}
        </span>

        <span className={cn(
          "text-sm font-medium",
          getLogTypeColor(log.type)
        )}>
          {t(`memory.logs.types.${log.type}`)}
        </span>

        <div className="flex-1" />

        <LogTypeBadge type={log.type} isDarkMode={isDarkMode} />
      </div>

      {isExpanded && hasDetails && (
        <div className={cn(
          "px-3 pb-3 pt-0",
          isDarkMode ? "bg-zinc-900/30" : "bg-zinc-100/50"
        )}>
          <div className={cn(
            "ml-5 p-2 rounded text-xs font-mono",
            isDarkMode ? "bg-zinc-900 text-zinc-300" : "bg-zinc-100 text-zinc-600"
          )}>
            {renderLogData(log.type, log.data, isDarkMode)}
          </div>
        </div>
      )}
    </div>
  );
};

const getLogTypeColor = (type: MemoryDebugLogType): string => {
  const colors: Record<MemoryDebugLogType, string> = {
    retrieval_start: 'text-blue-400',
    retrieval_candidates: 'text-blue-300',
    retrieval_filtered: 'text-orange-400',
    retrieval_complete: 'text-green-400',
    reinforce: 'text-yellow-400',
    reinforce_complete: 'text-green-400',
    decay: 'text-orange-400',
    decay_complete: 'text-green-400',
    prune: 'text-red-400',
    prune_complete: 'text-red-300',
    add_memory: 'text-cyan-400',
    delete_memory: 'text-red-400',
  };
  return colors[type] || 'text-zinc-400';
};

const LogTypeBadge: React.FC<{ type: MemoryDebugLogType; isDarkMode: boolean }> = ({ type, isDarkMode }) => {
  const categoryColors: Record<string, string> = {
    retrieval: isDarkMode ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-600",
    reinforce: isDarkMode ? "bg-yellow-500/20 text-yellow-400" : "bg-yellow-100 text-yellow-600",
    decay: isDarkMode ? "bg-orange-500/20 text-orange-400" : "bg-orange-100 text-orange-600",
    prune: isDarkMode ? "bg-red-500/20 text-red-400" : "bg-red-100 text-red-600",
    memory: isDarkMode ? "bg-cyan-500/20 text-cyan-400" : "bg-cyan-100 text-cyan-600",
  };

  const getCategory = (t: MemoryDebugLogType): string => {
    if (t.startsWith('retrieval')) return 'retrieval';
    if (t.startsWith('reinforce')) return 'reinforce';
    if (t.startsWith('decay')) return 'decay';
    if (t.startsWith('prune')) return 'prune';
    return 'memory';
  };

  return (
    <span className={cn(
      "px-1.5 py-0.5 rounded text-[10px] uppercase font-medium",
      categoryColors[getCategory(type)]
    )}>
      {getCategory(type)}
    </span>
  );
};

const renderLogData = (type: MemoryDebugLogType, data: Record<string, unknown>, isDarkMode: boolean) => {
  const renderValue = (value: unknown): React.ReactNode => {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return value.toString();
    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';
      if (value.length <= 3) return `[${value.map(v => typeof v === 'string' ? v : JSON.stringify(v)).join(', ')}]`;
      return `[${value.slice(0, 3).map(v => typeof v === 'string' ? v : JSON.stringify(v)).join(', ')}, ...${value.length - 3} more]`;
    }
    return JSON.stringify(value);
  };

  switch (type) {
    case 'retrieval_start':
      return (
        <div className="space-y-1">
          <div>Query: "{data.query as string}"</div>
          {data.options && <div>Options: {JSON.stringify(data.options)}</div>}
        </div>
      );

    case 'retrieval_candidates':
      return (
        <div className="space-y-1">
          <div>Candidates Found: {data.count as number}</div>
          {data.memoryTypes && <div>Types: {renderValue(data.memoryTypes)}</div>}
        </div>
      );

    case 'retrieval_filtered':
      return (
        <div className="space-y-1">
          <div>Before: {data.before as number} → After: {data.after as number}</div>
          {data.reason && <div>Reason: {data.reason as string}</div>}
        </div>
      );

    case 'retrieval_complete':
      return (
        <div className="space-y-1">
          <div>Returned: {data.count as number} memories</div>
          {data.topScores && (
            <div>Top Scores: {renderValue(data.topScores)}</div>
          )}
        </div>
      );

    case 'reinforce':
      return (
        <div className="space-y-1">
          <div>Memory IDs: {renderValue(data.memoryIds)}</div>
          <div>Count: {data.count as number}</div>
        </div>
      );

    case 'reinforce_complete':
      return (
        <div className="space-y-1">
          <div>Updated: {data.updatedCount as number} memories</div>
          <div>Score Change: +0.05 each</div>
        </div>
      );

    case 'decay':
      return (
        <div className="space-y-1">
          <div>Starting decay process...</div>
        </div>
      );

    case 'decay_complete':
      return (
        <div className="space-y-1">
          <div>Processed: {data.processed as number} memories</div>
          <div>Updated: {data.updated as number} memories</div>
        </div>
      );

    case 'prune':
      return (
        <div className="space-y-1">
          <div>Starting prune process...</div>
        </div>
      );

    case 'prune_complete':
      return (
        <div className="space-y-1">
          <div>Marked Inactive: {data.markedInactive as number}</div>
          <div>Deleted: {data.deleted as number}</div>
        </div>
      );

    case 'add_memory':
      return (
        <div className="space-y-1">
          <div>ID: {data.id as string}</div>
          <div>Type: {data.type as string}</div>
          <div>Content: "{(data.content as string)?.slice(0, 50)}..."</div>
        </div>
      );

    case 'delete_memory':
      return (
        <div className="space-y-1">
          <div>ID: {data.memoryId as string}</div>
        </div>
      );

    default:
      return <pre>{JSON.stringify(data, null, 2)}</pre>;
  }
};
