import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  History, 
  Search, 
  Globe, 
  ExternalLink, 
  Trash2, 
  ChevronDown, 
  ChevronRight, 
  CheckSquare, 
  Square,
  X
} from 'lucide-react';
import { useGlobalState } from '../context/GlobalStateContext';
import { useTranslation } from '../hooks/useTranslation';
import { SearchGroup } from '../types';
import { cn } from '../lib/utils';

interface SearchViewProps {
  isDarkMode: boolean;
}

export const SearchView: React.FC<SearchViewProps> = ({ isDarkMode }) => {
  const { t } = useTranslation();
  const { searchGroups, deleteSearchGroup, batchDeleteSearchGroups, sessions } = useGlobalState();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [colCount, setColCount] = useState(3);

  useEffect(() => {
    const updateCols = () => {
      if (window.innerWidth >= 1280) setColCount(3);
      else if (window.innerWidth >= 768) setColCount(2);
      else setColCount(1);
    };
    updateCols();
    window.addEventListener('resize', updateCols);
    return () => window.removeEventListener('resize', updateCols);
  }, []);

  // Group search groups by session
  const groupedBySession = useMemo(() => {
    const groups: Record<string, { title: string; searches: SearchGroup[] }> = {};
    
    searchGroups.forEach(group => {
      const sid = group.sessionId || 'unknown';
      if (!groups[sid]) {
        const session = sessions.find(s => s.id === sid);
        groups[sid] = {
          title: session?.title || t.search.unknownSession,
          searches: []
        };
      }
      groups[sid].searches.push(group);
    });

    // Sort sessions by their most recent search
    return Object.entries(groups).sort((a, b) => {
      const latestA = Math.max(...a[1].searches.map(s => s.timestamp));
      const latestB = Math.max(...b[1].searches.map(s => s.timestamp));
      return latestB - latestA;
    });
  }, [searchGroups, sessions]);

  const toggleCollapse = (id: string) => {
    const newCollapsed = new Set(collapsedGroups);
    if (newCollapsed.has(id)) {
      newCollapsed.delete(id);
    } else {
      newCollapsed.add(id);
    }
    setCollapsedGroups(newCollapsed);
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedGroups);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedGroups(newSelected);
  };

  const handleBatchDelete = () => {
    batchDeleteSearchGroups(Array.from(selectedGroups));
    setSelectedGroups(new Set());
    setIsMultiSelectMode(false);
  };

  const toggleAll = () => {
    if (selectedGroups.size === searchGroups.length) {
      setSelectedGroups(new Set());
    } else {
      setSelectedGroups(new Set(searchGroups.map(g => g.id)));
    }
  };

  return (
    <motion.div 
      key="search"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="h-full p-8 overflow-y-auto custom-scrollbar"
    >
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-semibold flex items-center gap-3">
              <History className="text-indigo-500" />
              {t.search.title}
            </h2>
            <div className="text-xs opacity-40 font-mono mt-1">
              {(t.search.total || '').replace('{count}', searchGroups.length.toString())}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isMultiSelectMode ? (
              <>
                <button
                  onClick={toggleAll}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-500/10 hover:bg-zinc-500/20 text-xs transition-colors"
                >
                  {selectedGroups.size === searchGroups.length ? t.search.deselectAll : t.search.selectAll}
                </button>
                <button
                  onClick={handleBatchDelete}
                  disabled={selectedGroups.size === 0}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all",
                    selectedGroups.size > 0 
                      ? "bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/20" 
                      : "bg-zinc-500/10 text-zinc-500 cursor-not-allowed"
                  )}
                >
                  <Trash2 size={14} />
                  <span>{(t.search.deleteSelected || '').replace('{count}', selectedGroups.size.toString())}</span>
                </button>
                <button
                  onClick={() => {
                    setIsMultiSelectMode(false);
                    setSelectedGroups(new Set());
                  }}
                  className="p-2 rounded-lg hover:bg-zinc-500/10 transition-colors"
                >
                  <X size={18} />
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsMultiSelectMode(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-500/10 hover:bg-zinc-500/20 text-xs transition-colors"
              >
                <CheckSquare size={14} />
                <span>{t.search.batchManage}</span>
              </button>
            )}
          </div>
        </div>

        {searchGroups.length === 0 ? (
          <div className="glass p-20 rounded-3xl text-center opacity-40 border-dashed">
            <Search size={64} className="mx-auto mb-6 stroke-1" />
            <p className="text-lg">{t.search.noHistory}</p>
            <p className="text-sm mt-2">{t.search.noHistoryDesc}</p>
          </div>
        ) : (
          <div className="space-y-12">
            {groupedBySession.map(([sessionId, sessionData]) => {
              const sortedSearches = [...sessionData.searches].sort((a, b) => b.timestamp - a.timestamp);
              
              // Dynamic Masonry: distribute items into columns based on estimated height
              const columns: typeof sortedSearches[] = Array.from({ length: colCount }, () => []);
              const columnHeights = Array.from({ length: colCount }, () => 0);
              
              sortedSearches.forEach(group => {
                const isCollapsed = collapsedGroups.has(group.id);
                // Estimate height: header is ~80px, each result is ~120px
                const estimatedHeight = isCollapsed ? 80 : 80 + (group.results.length * 120);
                
                let minIndex = 0;
                let minHeight = columnHeights[0];
                for (let i = 1; i < colCount; i++) {
                  if (columnHeights[i] < minHeight) {
                    minHeight = columnHeights[i];
                    minIndex = i;
                  }
                }
                
                columns[minIndex].push(group);
                columnHeights[minIndex] += estimatedHeight;
              });

              return (
                <div key={sessionId} className="space-y-6">
                  {/* Session Header */}
                  <div className="flex items-center gap-3 px-2">
                    <div className="h-px flex-1 bg-zinc-500/10" />
                    <h3 className="text-sm font-bold opacity-40 uppercase tracking-widest flex items-center gap-2">
                      <History size={14} />
                      {sessionData.title}
                    </h3>
                    <div className="h-px flex-1 bg-zinc-500/10" />
                  </div>

                  <div className="flex gap-6 items-start">
                    {columns.map((colSearches, colIndex) => (
                      <div key={colIndex} className="flex-1 flex flex-col gap-6 min-w-0">
                        {colSearches.map((group) => {
                          const isCollapsed = collapsedGroups.has(group.id);
                          const isSelected = selectedGroups.has(group.id);

                          return (
                            <motion.div 
                              key={group.id} 
                              layoutId={`card-${group.id}`}
                              layout
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ 
                                layout: { type: "spring", bounce: 0, duration: 0.4 },
                                opacity: { duration: 0.2 }
                              }}
                              className="flex flex-col"
                            >
                          <motion.div 
                            layout
                            className={cn(
                              "rounded-3xl border overflow-hidden flex flex-col transition-all group",
                              isDarkMode ? "bg-zinc-700/40 border-zinc-600" : "bg-white border-zinc-200 shadow-sm",
                              isSelected && "ring-2 ring-indigo-500/50 border-indigo-500/50"
                            )}
                          >
                            {/* Header */}
                            <motion.div 
                              layout="position"
                              className={cn(
                                "px-6 py-4 flex items-center justify-between border-b cursor-pointer",
                                isDarkMode ? "bg-zinc-700/30 border-zinc-700" : "bg-zinc-50/50 border-zinc-100"
                              )} 
                              onClick={() => isMultiSelectMode ? toggleSelect(group.id) : toggleCollapse(group.id)}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                {isMultiSelectMode ? (
                                  <div className={cn(
                                    "w-5 h-5 rounded-md border flex items-center justify-center transition-colors shrink-0",
                                    isSelected ? "bg-indigo-500 border-indigo-500 text-white" : "border-zinc-500"
                                  )}>
                                    {isSelected && <Square size={12} className="fill-current" />}
                                  </div>
                                ) : (
                                  <div className="w-5 h-5 rounded-md flex items-center justify-center text-zinc-500 shrink-0">
                                    {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                                  </div>
                                )}
                                <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center shrink-0">
                                  <Globe size={16} className="text-indigo-500" />
                                </div>
                                <h3 className="text-sm font-bold truncate pr-2">{group.query}</h3>
                              </div>
                              
                              <div className="flex items-center gap-4">
                                {!isMultiSelectMode && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteSearchGroup(group.id);
                                    }}
                                    className="p-1.5 rounded-lg text-zinc-500 hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            </motion.div>

                            {/* Results List */}
                            <AnimatePresence initial={false}>
                              {!isCollapsed && (
                                <motion.div 
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.3, ease: "easeInOut" }}
                                  className="overflow-hidden"
                                >
                                  <div className="p-6 space-y-3">
                                    {group.results.map((result) => (
                                      <div 
                                        key={result.url}
                                        className={cn(
                                          "p-4 rounded-2xl border transition-all hover:border-indigo-500/30",
                                          isDarkMode ? "bg-black/20 border-zinc-700" : "bg-zinc-50/50 border-zinc-100"
                                        )}
                                      >
                                        <div className="flex items-start justify-between gap-2 mb-2">
                                          <a 
                                            href={result.url} 
                                            target="_blank" 
                                            rel="noreferrer" 
                                            className="text-xs font-bold text-indigo-500 hover:underline line-clamp-1"
                                          >
                                            {result.title}
                                          </a>
                                          <ExternalLink size={12} className="opacity-20 shrink-0 mt-1" />
                                        </div>
                                        <p className="text-[11px] opacity-60 line-clamp-2 leading-relaxed mb-2">
                                          {result.snippet}
                                        </p>
                                        <div className="text-[9px] opacity-30 font-mono truncate">
                                          {result.url}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.div>
                          
                          {/* Date Label Below Card */}
                          <motion.div 
                            layout
                            className="mt-2 px-4 flex justify-end"
                          >
                            <span className="text-[10px] font-mono opacity-30 whitespace-nowrap">
                              {new Date(group.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </motion.div>
                        </motion.div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
};
