import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Filter, ArrowUpDown, Clock, Hash, Activity, Star, Trash2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useMemoryState } from '../../hooks/useMemoryState';
import { MemoryItem, MemoryType } from '../../types';
import { 
  MemorySortField, 
  MemorySortOrder, 
  MemoryFilterOptions,
} from './types';

interface MemoryListProps {
  isDarkMode: boolean;
  debugMode: boolean;
}

export const MemoryList: React.FC<MemoryListProps> = ({ isDarkMode, debugMode }) => {
  const { t } = useTranslation();
  const { memories, loading, deleteMemory } = useMemoryState();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOptions, setFilterOptions] = useState<MemoryFilterOptions>({});
  const [sortField, setSortField] = useState<MemorySortField>('score');
  const [sortOrder, setSortOrder] = useState<MemorySortOrder>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filteredAndSortedMemories = useMemo(() => {
    let result = [...memories];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(m => m.content.toLowerCase().includes(query));
    }

    if (filterOptions.types && filterOptions.types.length > 0) {
      result = result.filter(m => filterOptions.types!.includes(m.memoryType));
    }

    if (filterOptions.isActive !== undefined) {
      result = result.filter(m => m.isActive === filterOptions.isActive);
    }

    if (filterOptions.minScore !== undefined) {
      result = result.filter(m => m.score >= filterOptions.minScore!);
    }

    if (filterOptions.maxScore !== undefined) {
      result = result.filter(m => m.score <= filterOptions.maxScore!);
    }

    result.sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'score':
          comparison = a.score - b.score;
          break;
        case 'type':
          comparison = a.memoryType.localeCompare(b.memoryType);
          break;
        case 'createdAt':
          comparison = a.createdAt - b.createdAt;
          break;
        case 'lastAccessedAt':
          comparison = a.lastAccessedAt - b.lastAccessedAt;
          break;
        case 'accessCount':
          comparison = a.accessCount - b.accessCount;
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [memories, searchQuery, filterOptions, sortField, sortOrder]);

  const toggleSort = (field: MemorySortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const toggleTypeFilter = (type: MemoryType) => {
    setFilterOptions(prev => {
      const currentTypes = prev.types || [];
      const newTypes = currentTypes.includes(type)
        ? currentTypes.filter(t => t !== type)
        : [...currentTypes, type];
      return { ...prev, types: newTypes.length > 0 ? newTypes : undefined };
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    for (const id of selectedIds) {
      await deleteMemory(id);
    }
    setSelectedIds(new Set());
  };

  const formatRelativeTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const memoryTypes: MemoryType[] = ['identity', 'fact', 'preference', 'task', 'constraint', 'skill'];

  if (loading && memories.length === 0) {
    return (
      <div className={cn(
        "flex items-center justify-center py-12",
        isDarkMode ? "text-zinc-400" : "text-zinc-500"
      )}>
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className={cn(
          "relative flex-1 min-w-[200px]",
        )}>
          <Search size={16} className={cn(
            "absolute left-3 top-1/2 -translate-y-1/2",
            isDarkMode ? "text-zinc-500" : "text-zinc-400"
          )} />
          <input
            type="text"
            placeholder={t('memory.list.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              "w-full pl-9 pr-3 py-2 rounded-lg text-sm",
              isDarkMode
                ? "bg-zinc-800 text-zinc-200 placeholder:text-zinc-500 border border-zinc-700"
                : "bg-zinc-100 text-zinc-800 placeholder:text-zinc-400 border border-zinc-200"
            )}
          />
        </div>

        <div className="flex items-center gap-1">
          <Filter size={14} className={isDarkMode ? "text-zinc-400" : "text-zinc-500"} />
          {memoryTypes.map((type) => (
            <button
              key={type}
              onClick={() => toggleTypeFilter(type)}
              className={cn(
                "px-2 py-1 rounded text-xs font-medium transition-colors",
                filterOptions.types?.includes(type)
                  ? "bg-blue-500/20 text-blue-400"
                  : isDarkMode
                    ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                    : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
              )}
            >
              {t(`memory.types.${type}`)}
            </button>
          ))}
        </div>
      </div>

      <div className={cn(
        "flex items-center gap-2 text-xs",
        isDarkMode ? "text-zinc-400" : "text-zinc-500"
      )}>
        <span>{t('memory.list.sort')}:</span>
        {[
          { field: 'score' as MemorySortField, label: t('memory.list.sortScore'), icon: Star },
          { field: 'type' as MemorySortField, label: t('memory.list.sortType'), icon: Filter },
          { field: 'createdAt' as MemorySortField, label: t('memory.list.sortCreated'), icon: Clock },
          { field: 'lastAccessedAt' as MemorySortField, label: t('memory.list.sortAccessed'), icon: Activity },
          { field: 'accessCount' as MemorySortField, label: t('memory.list.sortCount'), icon: Hash },
        ].map(({ field, label, icon: Icon }) => (
          <button
            key={field}
            onClick={() => toggleSort(field)}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded transition-colors",
              sortField === field
                ? isDarkMode
                  ? "bg-blue-500/20 text-blue-400"
                  : "bg-blue-100 text-blue-600"
                : isDarkMode
                  ? "hover:bg-zinc-800"
                  : "hover:bg-zinc-200"
            )}
          >
            <Icon size={12} />
            {label}
            {sortField === field && (
              <ArrowUpDown size={10} className={sortOrder === 'asc' ? 'rotate-180' : ''} />
            )}
          </button>
        ))}

        <div className="flex-1" />

        <span>{filteredAndSortedMemories.length} {t('memory.list.memories')}</span>
      </div>

      {selectedIds.size > 0 && (
        <div className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg",
          isDarkMode ? "bg-red-500/10 border border-red-500/20" : "bg-red-50 border border-red-200"
        )}>
          <span className={cn("text-sm", isDarkMode ? "text-red-400" : "text-red-600")}>
            {selectedIds.size} {t('memory.list.selected')}
          </span>
          <button
            onClick={handleDeleteSelected}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium",
              isDarkMode
                ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                : "bg-red-100 text-red-600 hover:bg-red-200"
            )}
          >
            <Trash2 size={12} />
            {t('memory.list.deleteSelected')}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className={cn(
              "px-2 py-1 rounded text-xs",
              isDarkMode ? "text-zinc-400 hover:text-zinc-200" : "text-zinc-500 hover:text-zinc-700"
            )}
          >
            {t('memory.list.clear')}
          </button>
        </div>
      )}

      <div className="space-y-2">
        {filteredAndSortedMemories.length === 0 ? (
          <div className={cn(
            "text-center py-8",
            isDarkMode ? "text-zinc-500" : "text-zinc-400"
          )}>
            {t('memory.list.noMemories')}
          </div>
        ) : (
          filteredAndSortedMemories.map((memory) => (
            <MemoryItemCard
              key={memory.id}
              memory={memory}
              isDarkMode={isDarkMode}
              debugMode={debugMode}
              isSelected={selectedIds.has(memory.id)}
              onSelect={() => toggleSelect(memory.id)}
              onDelete={() => deleteMemory(memory.id)}
              formatRelativeTime={formatRelativeTime}
              formatTimestamp={formatTimestamp}
            />
          ))
        )}
      </div>
    </div>
  );
};

interface MemoryItemCardProps {
  memory: MemoryItem;
  isDarkMode: boolean;
  debugMode: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  formatRelativeTime: (ts: number) => string;
  formatTimestamp: (ts: number) => string;
}

const MemoryItemCard: React.FC<MemoryItemCardProps> = ({
  memory,
  isDarkMode,
  debugMode,
  isSelected,
  onSelect,
  onDelete,
  formatRelativeTime,
  formatTimestamp,
}) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className={cn(
        "rounded-lg border transition-colors",
        isDarkMode
          ? "bg-zinc-800/50 border-zinc-700 hover:border-zinc-600"
          : "bg-zinc-50 border-zinc-200 hover:border-zinc-300",
        isSelected && (isDarkMode ? "border-blue-500/50 bg-blue-500/5" : "border-blue-300 bg-blue-50")
      )}
    >
      <div className="flex items-start gap-3 p-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onSelect}
          className={cn(
            "mt-1 w-4 h-4 rounded cursor-pointer",
            isDarkMode ? "accent-blue-500" : "accent-blue-600"
          )}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              "px-2 py-0.5 rounded text-xs font-medium",
              "bg-blue-500/20 text-blue-400"
            )}>
              {t(`memory.types.${memory.memoryType}`)}
            </span>

            <div className="flex items-center gap-1">
              <Star size={12} className="text-yellow-400" />
              <span className={cn(
                "text-xs font-mono",
                isDarkMode ? "text-zinc-300" : "text-zinc-700"
              )}>
                {memory.score?.toFixed(2) ?? 'N/A'}
              </span>
            </div>

            {debugMode && (
              <>
                <div className={cn("text-xs", isDarkMode ? "text-zinc-500" : "text-zinc-400")}>
                  decay: {memory.decay?.toFixed(4) ?? 'N/A'}
                </div>
                <div className={cn("text-xs", isDarkMode ? "text-zinc-500" : "text-zinc-400")}>
                  importance: {memory.importance?.toFixed(2) ?? 'N/A'}
                </div>
              </>
            )}

            <div className={cn(
              "flex items-center gap-1 text-xs",
              memory.isActive ? "text-green-400" : "text-zinc-500"
            )}>
              <div className={cn(
                "w-2 h-2 rounded-full",
                memory.isActive ? "bg-green-400" : "bg-zinc-500"
              )} />
              {memory.isActive ? t('memory.list.active') : t('memory.list.inactive')}
            </div>
          </div>

          <div
            className={cn(
              "mt-2 text-sm cursor-pointer",
              isDarkMode ? "text-zinc-200" : "text-zinc-700"
            )}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded || memory.content.length <= 100
              ? memory.content
              : `${memory.content.slice(0, 100)}...`}
          </div>

          <div className={cn(
            "flex items-center gap-4 mt-2 text-xs",
            isDarkMode ? "text-zinc-500" : "text-zinc-400"
          )}>
            <div className="flex items-center gap-1">
              <Hash size={12} />
              <span>{memory.accessCount} {t('memory.list.accesses')}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock size={12} />
              <span title={formatTimestamp(memory.lastAccessedAt)}>
                {formatRelativeTime(memory.lastAccessedAt)}
              </span>
            </div>
          </div>

          {debugMode && (
            <div className={cn(
              "mt-2 p-2 rounded text-xs font-mono space-y-1",
              isDarkMode ? "bg-zinc-900/50 text-zinc-400" : "bg-zinc-100 text-zinc-500"
            )}>
              <div>ID: {memory.id}</div>
              <div>Created: {formatTimestamp(memory.createdAt)}</div>
              {memory.sourceSessionId && (
                <div>Source Session: {memory.sourceSessionId}</div>
              )}
              {memory.embedding && (
                <div>
                  Embedding: [{memory.embedding.slice(0, 5).map(v => v.toFixed(3)).join(', ')}, ...]
                  ({memory.embedding.length} dims)
                </div>
              )}
              {memory.metadata && (
                <div>
                  Metadata: {JSON.stringify(memory.metadata)}
                </div>
              )}
              {memory.markedInactiveAt && (
                <div>Marked Inactive: {formatTimestamp(memory.markedInactiveAt)}</div>
              )}
            </div>
          )}
        </div>

        <button
          onClick={onDelete}
          className={cn(
            "p-1.5 rounded transition-colors shrink-0",
            isDarkMode
              ? "text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
              : "text-zinc-400 hover:text-red-500 hover:bg-red-50"
          )}
          title="Delete memory"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
};
