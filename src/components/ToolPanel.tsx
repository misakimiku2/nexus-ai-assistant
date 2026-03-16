import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Globe, 
  Terminal, 
  ListTodo, 
  SlidersHorizontal, 
  Activity, 
  FileText, 
  Plus, 
  Save, 
  Trash2, 
  ChevronRight,
  ArrowRight,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Circle
} from 'lucide-react';
import { cn } from '../lib/utils';
import { SearchResult, TodoItem, SearchGroup } from '../types';
import { useGlobalState } from '../context/GlobalStateContext';
import { Edit2, Check } from 'lucide-react';

const SearchGroupCard: React.FC<{ 
  group: SearchGroup; 
  isDarkMode: boolean; 
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onUpdateTitle: (title: string) => void;
}> = ({ group, isDarkMode, isExpanded, onToggle, onDelete, onUpdateTitle }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(group.query);

  const handleSave = () => {
    onUpdateTitle(editTitle);
    setIsEditing(false);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-2xl border overflow-hidden transition-all",
        isDarkMode ? "bg-zinc-700/50 border-zinc-600" : "bg-white border-zinc-200 shadow-sm"
      )}
    >
      <div className={cn(
        "px-4 py-3 flex items-center justify-between border-b",
        isDarkMode ? "border-zinc-700 bg-zinc-700/30" : "border-zinc-100 bg-zinc-50/50"
      )}>
        <div className="flex-1 min-w-0 mr-2">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <input 
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="flex-1 bg-transparent border-none focus:outline-none focus:ring-0 text-xs font-bold p-0"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              />
              <button onClick={handleSave} className="text-emerald-500 hover:text-emerald-400">
                <Check size={14} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group/title">
              <h3 
                className="text-xs font-bold truncate cursor-pointer" 
                onClick={onToggle}
              >
                {group.query}
              </h3>
              <button 
                onClick={() => setIsEditing(true)}
                className="opacity-0 group-hover/title:opacity-100 p-1 hover:bg-zinc-500/10 rounded transition-all"
              >
                <Edit2 size={10} className="text-zinc-500" />
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={onDelete}
            className="p-1.5 hover:bg-red-500/10 text-zinc-500 hover:text-red-500 rounded-lg transition-all"
          >
            <Trash2 size={14} />
          </button>
          <button 
            onClick={onToggle}
            className={cn("p-1.5 hover:bg-zinc-500/10 rounded-lg transition-transform", isExpanded ? "rotate-90" : "")}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-3 space-y-2">
              {group.results.map((result) => (
                <div 
                  key={result.url}
                  className={cn(
                    "p-2.5 rounded-xl border transition-all hover:scale-[1.02]",
                    isDarkMode ? "bg-black/20 border-zinc-700 hover:border-indigo-500/30" : "bg-zinc-50 border-zinc-100 hover:border-indigo-500/30"
                  )}
                >
                  <a 
                    href={result.url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-[11px] font-bold text-indigo-500 hover:underline block truncate mb-1"
                  >
                    {result.title}
                  </a>
                  <p className="text-[10px] opacity-60 line-clamp-2 leading-relaxed">{result.snippet}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

interface ToolPanelProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  temperature: number;
  setTemperature: (temp: number) => void;
  systemPrompt: string;
  setSystemPrompt: (prompt: string) => void;
}

type TabType = 'status' | 'params' | 'monitor';

export const ToolPanel: React.FC<ToolPanelProps> = ({
  isOpen,
  onClose,
  isDarkMode,
  temperature,
  setTemperature,
  systemPrompt,
  setSystemPrompt
}) => {
  const { 
    logs, 
    setLogs,
    todos, 
    switchSession, 
    systemPromptPresets, 
    addPreset, 
    updatePreset, 
    deletePreset,
    sessions,
    agents,
    currentTokenCount,
    searchGroups,
    setSearchGroups,
    deleteSearchGroup,
    currentSessionId
  } = useGlobalState();

  // Filter search groups by current session
  const sessionSearchGroups = useMemo(() => {
    return searchGroups.filter(g => g.sessionId === currentSessionId);
  }, [searchGroups, currentSessionId]);
  const [activeTab, setActiveTab] = useState<TabType>('status');
  const [isAddingPreset, setIsAddingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [storageUsage, setStorageUsage] = useState('0 KB');
  const [memoryUsage, setMemoryUsage] = useState('N/A');
  const [isStatsExpanded, setIsStatsExpanded] = useState(true);
  const [expandedSearchGroupId, setExpandedSearchGroupId] = useState<string | null>(null);

  // Auto-expand the latest search group when a new one is added
  React.useEffect(() => {
    if (sessionSearchGroups.length > 0) {
      const latest = sessionSearchGroups[sessionSearchGroups.length - 1];
      setExpandedSearchGroupId(latest.id);
    }
  }, [sessionSearchGroups.length]);

  React.useEffect(() => {
    if (activeTab === 'monitor') {
      const calculateStats = () => {
        // Storage
        try {
          let total = 0;
          for (let x in localStorage) {
            if (localStorage.hasOwnProperty(x)) {
              total += ((localStorage[x].length + x.length) * 2);
            }
          }
          setStorageUsage((total / 1024).toFixed(2) + ' KB');
        } catch (e) {
          setStorageUsage('N/A');
        }

        // Memory
        try {
          if (performance && (performance as any).memory) {
            const memory = (performance as any).memory;
            setMemoryUsage((memory.usedJSHeapSize / 1048576).toFixed(2) + ' MB');
          }
        } catch (e) {
          // Ignore
        }
      };
      
      calculateStats();
      const interval = setInterval(calculateStats, 2000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  // Group todos by title
  const groupedTasks = useMemo(() => {
    const groups: Record<string, TodoItem[]> = {};
    todos.forEach(todo => {
      if (!groups[todo.title]) {
        groups[todo.title] = [];
      }
      groups[todo.title].push(todo);
    });
    return Object.entries(groups).map(([title, items]) => {
      const avgProgress = Math.round(items.reduce((acc, curr) => acc + curr.progress, 0) / items.length);
      const status = items.every(i => i.status === 'completed') ? 'completed' :
                     items.some(i => i.status === 'failed') ? 'failed' :
                     items.some(i => i.status === 'working') ? 'working' : 'pending';
      return { title, items, avgProgress, status };
    });
  }, [todos]);

  const estimateTokens = (text: string) => Math.ceil((text || '').length * 0.5);

  const handleSaveAsPreset = () => {
    if (newPresetName.trim()) {
      const id = Date.now().toString() + Math.random().toString(36).substring(2, 9);
      addPreset(newPresetName, systemPrompt, id);
      setActivePresetId(id);
      setNewPresetName('');
      setIsAddingPreset(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside 
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 320, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          className="glass border-y-0 border-r-0 flex flex-col z-10 overflow-hidden"
        >
          <div 
            data-tauri-drag-region
            className={cn(
              "flex items-center justify-end px-4 h-12 border-b gap-2 shrink-0",
              isDarkMode ? "bg-zinc-700/30 border-zinc-700" : "bg-zinc-50/50 border-zinc-200"
            )}
          >
          </div>

          {/* Tabs Header */}
          <div className="flex border-b border-zinc-500/20">
            <button
              onClick={() => setActiveTab('status')}
              className={cn(
                "flex-1 py-3 text-xs font-medium flex items-center justify-center gap-2 transition-colors",
                activeTab === 'status' 
                  ? "text-indigo-500 border-b-2 border-indigo-500 bg-indigo-500/5" 
                  : "opacity-60 hover:opacity-100 hover:bg-zinc-500/5"
              )}
            >
              <Activity size={14} />
              状态
            </button>
            <button
              onClick={() => setActiveTab('params')}
              className={cn(
                "flex-1 py-3 text-xs font-medium flex items-center justify-center gap-2 transition-colors",
                activeTab === 'params' 
                  ? "text-indigo-500 border-b-2 border-indigo-500 bg-indigo-500/5" 
                  : "opacity-60 hover:opacity-100 hover:bg-zinc-500/5"
              )}
            >
              <SlidersHorizontal size={14} />
              模型参数
            </button>
            <button
              onClick={() => setActiveTab('monitor')}
              className={cn(
                "flex-1 py-3 text-xs font-medium flex items-center justify-center gap-2 transition-colors",
                activeTab === 'monitor' 
                  ? "text-indigo-500 border-b-2 border-indigo-500 bg-indigo-500/5" 
                  : "opacity-60 hover:opacity-100 hover:bg-zinc-500/5"
              )}
            >
              <Terminal size={14} />
              监视器
            </button>
          </div>

          <div className="p-4 flex flex-col h-full overflow-y-auto custom-scrollbar">
            {activeTab === 'status' && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-8"
              >
                {/* Task Progress Section */}
                <div>
                  <div className="flex items-center gap-2 mb-4 text-xs font-bold uppercase tracking-widest opacity-50">
                    <ListTodo size={14} />
                    <span>任务执行进度</span>
                  </div>
                  {groupedTasks.length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-zinc-500/20 text-center">
                      <p className="text-[10px] opacity-40">暂无活动任务</p>
                    </div>
                  ) : (
                    <div className={cn(
                      "rounded-2xl border overflow-hidden",
                      isDarkMode ? "bg-zinc-700/50 border-zinc-600" : "bg-white border-zinc-200 shadow-sm"
                    )}>
                      <>
                        {/* 总进度卡片头部 */}
                        <div className={cn(
                          "p-4 border-b",
                          isDarkMode ? "bg-zinc-700/30 border-zinc-700" : "bg-zinc-50 border-zinc-100"
                        )}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-zinc-700 dark:text-zinc-200">任务总进度</span>
                            <span className="text-xs font-mono font-bold text-indigo-500">
                              {Math.round(groupedTasks.reduce((acc, curr) => acc + curr.avgProgress, 0) / groupedTasks.length)}%
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-zinc-500/10 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-indigo-500 transition-all duration-500"
                              style={{ width: `${Math.round(groupedTasks.reduce((acc, curr) => acc + curr.avgProgress, 0) / groupedTasks.length)}%` }}
                            />
                          </div>
                        </div>

                        {/* 子任务列表 */}
                        {groupedTasks.map((task, index) => (
                          <div 
                            key={task.title}
                            className={cn(
                              "p-4 transition-colors group",
                              index !== groupedTasks.length - 1 ? "border-b border-zinc-500/10" : ""
                            )}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2 overflow-hidden">
                                <div className="shrink-0">
                                  {task.status === 'completed' ? <CheckCircle2 size={14} className="text-emerald-500" /> :
                                   task.status === 'working' ? <Loader2 size={14} className="text-indigo-500 animate-spin" /> :
                                   task.status === 'failed' ? <AlertCircle size={14} className="text-red-500" /> :
                                   <Circle size={14} className="text-zinc-500" />}
                                </div>
                                <span className={cn(
                                  "text-xs font-bold truncate",
                                  task.status === 'completed' ? "text-zinc-500" : "text-zinc-200"
                                )}>
                                  {task.title}
                                </span>
                              </div>
                              <span className="text-[10px] font-mono text-indigo-500 font-bold">{task.avgProgress}%</span>
                            </div>

                            <div className="h-1 w-full bg-zinc-500/10 rounded-full overflow-hidden mb-3">
                              <div 
                                className={cn(
                                  "h-full transition-all duration-500",
                                  task.status === 'completed' ? "bg-emerald-500" : "bg-indigo-500"
                                )}
                                style={{ width: `${task.avgProgress}%` }}
                              />
                            </div>

                            <div className="space-y-2">
                              {task.items.map((item) => (
                                <div key={item.id} className="flex flex-col gap-1">
                                  <div className="flex items-center justify-between text-[10px] opacity-60">
                                    <span className="truncate flex-1">{item.description || '执行中...'}</span>
                                    {item.targetSessionId && (
                                      <button 
                                        onClick={() => switchSession(item.targetSessionId!)}
                                        className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 font-medium flex items-center gap-0.5 shrink-0 ml-2 transition-colors"
                                      >
                                        查看子任务 <ArrowRight size={10} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </>
                    </div>
                  )}
                </div>

                {/* Search Results Section */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest opacity-50">
                      <Globe size={14} />
                      <span>联网搜索结果</span>
                    </div>
                    {sessionSearchGroups.length > 0 && (
                      <button 
                        onClick={() => setSearchGroups(prev => prev.filter(g => g.sessionId !== currentSessionId))}
                        className="text-[10px] text-red-500 hover:text-red-400 font-medium transition-colors"
                      >
                        清空当前
                      </button>
                    )}
                  </div>
                  <div className="space-y-4">
                    {sessionSearchGroups.length === 0 ? (
                      <div className="p-4 rounded-xl border border-dashed border-zinc-500/20 text-center">
                        <p className="text-[10px] opacity-40">暂无联网搜索数据</p>
                      </div>
                    ) : (
                      sessionSearchGroups.map((group) => (
                        <SearchGroupCard 
                          key={group.id} 
                          group={group} 
                          isDarkMode={isDarkMode}
                          isExpanded={expandedSearchGroupId === group.id}
                          onToggle={() => setExpandedSearchGroupId(expandedSearchGroupId === group.id ? null : group.id)}
                          onDelete={() => deleteSearchGroup(group.id)}
                          onUpdateTitle={(newTitle) => setSearchGroups(prev => prev.map(g => g.id === group.id ? { ...g, query: newTitle } : g))}
                        />
                      ))
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'params' && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                {/* System Prompt Section */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold uppercase tracking-widest opacity-50 flex items-center gap-2">
                      <FileText size={14} />
                      系统提示词
                    </label>
                    <div className="flex gap-1">
                      {activePresetId && systemPromptPresets.find(p => p.id === activePresetId)?.content !== systemPrompt && (
                        <button 
                          onClick={() => {
                            const preset = systemPromptPresets.find(p => p.id === activePresetId);
                            if (preset) updatePreset(preset.id, preset.name, systemPrompt);
                          }}
                          className="p-1 hover:bg-zinc-500/10 rounded-md text-emerald-400 transition-colors"
                          title="更新当前预设"
                        >
                          <Save size={14} />
                        </button>
                      )}
                      <button 
                        onClick={() => setIsAddingPreset(!isAddingPreset)}
                        className="p-1 hover:bg-zinc-500/10 rounded-md text-indigo-400 transition-colors"
                        title="另存为新预设"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Presets List */}
                  <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar no-scrollbar">
                    {systemPromptPresets.map(preset => (
                      <button
                        key={preset.id}
                        onClick={() => {
                          setSystemPrompt(preset.content);
                          setActivePresetId(preset.id);
                        }}
                        className={cn(
                          "px-2 py-1 rounded-md text-[10px] whitespace-nowrap border transition-all flex items-center gap-1 group",
                          activePresetId === preset.id 
                            ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400" 
                            : "bg-zinc-500/5 border-zinc-500/10 text-zinc-400 hover:border-zinc-500/30"
                        )}
                      >
                        {preset.name}
                        {activePresetId === preset.id && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              deletePreset(preset.id);
                              setActivePresetId(null);
                            }}
                            className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity"
                          >
                            <Trash2 size={10} />
                          </button>
                        )}
                      </button>
                    ))}
                  </div>

                  {isAddingPreset && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="flex gap-2"
                    >
                      <input 
                        type="text"
                        value={newPresetName}
                        onChange={(e) => setNewPresetName(e.target.value)}
                        placeholder="预设名称..."
                        className="flex-1 glass bg-transparent border-zinc-500/20 rounded-lg px-2 py-1 text-[10px] focus:ring-1 focus:ring-indigo-500/50"
                        autoFocus
                      />
                      <button 
                        onClick={handleSaveAsPreset}
                        className="p-1 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
                      >
                        <Save size={14} />
                      </button>
                    </motion.div>
                  )}

                  <div className="relative">
                    <textarea 
                      value={systemPrompt}
                      onChange={(e) => setSystemPrompt(e.target.value)}
                      className="w-full glass bg-transparent border-zinc-500/20 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-indigo-500/50 min-h-[200px] resize-y custom-scrollbar font-mono leading-relaxed"
                      placeholder="输入系统提示词..."
                    />
                    <div className={cn(
                      "absolute bottom-3 right-4 font-mono transition-colors pointer-events-none",
                      isDarkMode ? "text-indigo-400" : "text-indigo-600"
                    )}>
                      <span className="text-[11px] font-bold">{estimateTokens(systemPrompt)}</span>
                      <span className="text-[10px] opacity-60 ml-1">tokens</span>
                    </div>
                  </div>
                  <p className="text-[10px] opacity-40">
                    系统提示词用于设定 AI 助手的行为、角色和输出格式。
                  </p>
                </div>

                {/* Temperature Section */}
                <div className="space-y-3 pt-4 border-t border-zinc-500/10">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold uppercase tracking-widest opacity-50 flex items-center gap-2">
                      <SlidersHorizontal size={14} />
                      Temperature
                    </label>
                    <span className="text-xs font-mono text-indigo-500 font-bold">{temperature}</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="2" 
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-zinc-500/20 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                  <div className="flex justify-between text-[9px] opacity-30 font-mono">
                    <span>精确 (0.0)</span>
                    <span>平衡 (1.0)</span>
                    <span>创意 (2.0)</span>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'monitor' && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex-1 flex flex-col min-h-0 h-full space-y-4"
              >
                <div>
                  <button 
                    onClick={() => setIsStatsExpanded(!isStatsExpanded)}
                    className="flex items-center justify-between w-full text-xs font-bold uppercase tracking-widest opacity-50 hover:opacity-100 transition-opacity mb-2"
                  >
                    <div className="flex items-center gap-2">
                      <Activity size={14} />
                      <span>系统资源状态</span>
                    </div>
                    <ChevronRight size={14} className={cn("transition-transform", isStatsExpanded ? "rotate-90" : "")} />
                  </button>
                  
                  <AnimatePresence>
                    {isStatsExpanded && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="grid grid-cols-2 gap-2 pb-2">
                          <div className={cn(
                            "p-3 rounded-xl border flex flex-col gap-1",
                            isDarkMode ? "bg-black/20 border-zinc-500/20" : "bg-white/50 border-zinc-200"
                          )}>
                            <span className="text-xs opacity-50 font-medium">当前 Token 消耗</span>
                            <span className="text-base font-mono font-bold text-indigo-500">{currentTokenCount}</span>
                          </div>
                          <div className={cn(
                            "p-3 rounded-xl border flex flex-col gap-1",
                            isDarkMode ? "bg-black/20 border-zinc-500/20" : "bg-white/50 border-zinc-200"
                          )}>
                            <span className="text-xs opacity-50 font-medium">活跃会话数</span>
                            <span className="text-base font-mono font-bold text-emerald-500">{sessions.length}</span>
                          </div>
                          <div className={cn(
                            "p-3 rounded-xl border flex flex-col gap-1",
                            isDarkMode ? "bg-black/20 border-zinc-500/20" : "bg-white/50 border-zinc-200"
                          )}>
                            <span className="text-xs opacity-50 font-medium">可用 Agent 数量</span>
                            <span className="text-base font-mono font-bold text-blue-500">{agents.length}</span>
                          </div>
                          <div className={cn(
                            "p-3 rounded-xl border flex flex-col gap-1",
                            isDarkMode ? "bg-black/20 border-zinc-500/20" : "bg-white/50 border-zinc-200"
                          )}>
                            <span className="text-xs opacity-50 font-medium">内存占用 (JS Heap)</span>
                            <span className="text-base font-mono font-bold text-pink-500">{memoryUsage}</span>
                          </div>
                          <div className={cn(
                            "p-3 rounded-xl border flex flex-col gap-1",
                            isDarkMode ? "bg-black/20 border-zinc-500/20" : "bg-white/50 border-zinc-200"
                          )}>
                            <span className="text-xs opacity-50 font-medium">本地存储使用量</span>
                            <span className="text-base font-mono font-bold text-amber-500">{storageUsage}</span>
                          </div>
                          <div className={cn(
                            "p-3 rounded-xl border flex flex-col gap-1",
                            isDarkMode ? "bg-black/20 border-zinc-500/20" : "bg-white/50 border-zinc-200"
                          )}>
                            <span className="text-xs opacity-50 font-medium">网络状态</span>
                            <span className="text-base font-mono font-bold text-emerald-500 flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                              已连接
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="flex flex-col flex-1 min-h-0">
                  <div className="flex items-center justify-between pb-2">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest opacity-50">
                      <Terminal size={14} />
                      <span>系统运行日志</span>
                    </div>
                    <button 
                      onClick={() => setLogs([])}
                      className="text-xs px-2 py-1 rounded-md bg-zinc-500/10 hover:bg-zinc-500/20 transition-colors opacity-70 hover:opacity-100"
                    >
                      清空日志
                    </button>
                  </div>
                  <div className={cn(
                    "flex-1 overflow-y-auto font-mono text-xs space-y-2 p-3 rounded-xl border border-zinc-500/10",
                    isDarkMode ? "bg-black/40" : "bg-zinc-200/50"
                  )}>
                  {logs.length === 0 ? (
                    <div className="opacity-20 italic">等待系统事件...</div>
                  ) : (
                    logs.map((log) => (
                      <div key={log.id} className={cn(
                        "flex gap-2",
                        log.type === 'error' ? (isDarkMode ? "text-red-400" : "text-red-600") : 
                        log.type === 'command' ? (isDarkMode ? "text-indigo-400" : "text-indigo-600") : 
                        (isDarkMode ? "text-zinc-400" : "text-zinc-600")
                      )}>
                        <span className="opacity-30 shrink-0">[{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                        <span className="break-all text-xs">{log.message}</span>
                      </div>
                    ))
                  )}
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};
