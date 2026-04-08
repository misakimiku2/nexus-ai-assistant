import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  MessageSquare, 
  Terminal, 
  Search, 
  Settings, 
  Sun, 
  Moon, 
  Blocks,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  FolderPlus,
  Folder,
  FolderOpen,
  CheckSquare,
  Square,
  Bot,
  Cpu,
  Database,
  Globe,
  Shield,
  Layout,
  ChevronRight,
  ChevronDown,
  FileText,
  Download,
  Upload,
  Filter
} from 'lucide-react';
import { NexusLogo } from './NexusLogo';
import { cn } from '../lib/utils';
import { useGlobalState } from '../context/GlobalStateContext';
import { ConfirmationModal } from './ConfirmationModal';
import { ChatSession } from '../types';
import { ExportFormat } from '../services/sessionExport';

type TabType = 'chat' | 'search' | 'terminal' | 'mcp' | 'agents';

interface SidebarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  isExpanded: boolean;
  openSettings: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  activeTab, 
  setActiveTab, 
  isDarkMode, 
  toggleDarkMode,
  isExpanded,
  openSettings
}) => {
  const { t } = useTranslation();
  const { 
    sessions, 
    currentSessionId, 
    switchSession, 
    createNewSession, 
    deleteSession, 
    batchDeleteSessions,
    updateSessionTitle,
    folders,
    createFolder,
    updateFolder,
    deleteFolder,
    toggleFolder,
    moveSessionToFolder,
    agents,
    exportSessionToFile,
    importSessionFromFile,
    batchExportSessionsToFile
  } = useGlobalState();

  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set(agents.filter(a => !a.parentId).map(a => a.id)));

  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'title' | 'content'>('title');
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; targetId: string; targetType: 'session' | 'folder' } | null>(null);

  const [dragState, setDragState] = useState<{
    isDragging: boolean;
    sessionId: string | null;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    overFolderId: string | null;
  }>({ isDragging: false, sessionId: null, startX: 0, startY: 0, currentX: 0, currentY: 0, overFolderId: null });

  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setContextMenu(null); };
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!dragState.isDragging) return;
    const handleMove = (e: PointerEvent) => {
      setDragState(prev => ({ ...prev, currentX: e.clientX, currentY: e.clientY }));
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const folderEl = el?.closest('[data-folder-id]');
      const overFolderId = folderEl ? folderEl.getAttribute('data-folder-id') : null;
      setDragState(prev => prev.overFolderId !== overFolderId ? { ...prev, overFolderId } : prev);
    };
    const handleUp = () => {
      setDragState(prev => {
        if (prev.isDragging && prev.sessionId && prev.overFolderId) {
          moveSessionToFolder(prev.sessionId, prev.overFolderId);
        } else if (prev.isDragging && prev.sessionId && !prev.overFolderId) {
          moveSessionToFolder(prev.sessionId, undefined);
        }
        return { isDragging: false, sessionId: null, startX: 0, startY: 0, currentX: 0, currentY: 0, overFolderId: null };
      });
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDragState({ isDragging: false, sessionId: null, startX: 0, startY: 0, currentX: 0, currentY: 0, overFolderId: null });
      }
    };
    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [dragState.isDragging, moveSessionToFolder]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedQuery(value.toLowerCase().trim());
    }, 300);
  }, []);

  const filteredSessions = useMemo(() => {
    if (!debouncedQuery) return sessions;
    return sessions.filter(session => {
      if (searchMode === 'title') {
        return session.title.toLowerCase().includes(debouncedQuery);
      }
      const contentMatch = session.messages.some(msg =>
        msg.content.toLowerCase().includes(debouncedQuery) ||
        (msg.thinking && msg.thinking.toLowerCase().includes(debouncedQuery))
      );
      const titleMatch = session.title.toLowerCase().includes(debouncedQuery);
      return contentMatch || titleMatch;
    });
  }, [sessions, debouncedQuery, searchMode]);

  const filteredSessionIds = useMemo(() => new Set(filteredSessions.map(s => s.id)), [filteredSessions]);

  const highlightText = (text: string) => {
    if (!debouncedQuery) return text;
    const regex = new RegExp(`(${debouncedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? <mark key={i} className="bg-yellow-300/50 dark:bg-yellow-500/30 rounded px-0.5">{part}</mark> : part
    );
  };

  const handleExport = useCallback(async (sessionId: string, format: ExportFormat) => {
    setIsExporting(true);
    setContextMenu(null);
    try {
      await exportSessionToFile(sessionId, format);
    } catch (err) {
      console.error('[Sidebar] 导出失败:', err);
    } finally {
      setIsExporting(false);
    }
  }, [exportSessionToFile]);

  const handleBatchExport = useCallback(async (format: ExportFormat) => {
    if (selectedSessions.size === 0) return;
    setIsExporting(true);
    try {
      await batchExportSessionsToFile(Array.from(selectedSessions), format);
    } catch (err) {
      console.error('[Sidebar] 批量导出失败:', err);
    } finally {
      setIsExporting(false);
    }
  }, [selectedSessions, batchExportSessionsToFile]);

  const handleImport = useCallback(async () => {
    setIsImporting(true);
    try {
      await importSessionFromFile();
    } catch (err) {
      console.error('[Sidebar] 导入失败:', err);
    } finally {
      setIsImporting(false);
    }
  }, [importSessionFromFile]);

  const handleSessionPointerDown = (e: React.PointerEvent, sessionId: string) => {
    if (e.button !== 0 || editingSessionId || isMultiSelectMode || contextMenu) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragState(prev => ({
      ...prev,
      sessionId,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
    }));
  };

  const handleSessionPointerMove = (e: React.PointerEvent) => {
    if (!dragState.sessionId || dragState.isDragging || editingSessionId || contextMenu) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      setDragState(prev => ({ ...prev, isDragging: true }));
    }
  };

  const handleSessionPointerUp = () => {
    if (!dragState.isDragging && dragState.sessionId) {
      setDragState({ isDragging: false, sessionId: null, startX: 0, startY: 0, currentX: 0, currentY: 0, overFolderId: null });
    }
  };

  const handleEditStart = (id: string, currentTitle: string, isFolder: boolean = false) => {
    setDragState({ isDragging: false, sessionId: null, startX: 0, startY: 0, currentX: 0, currentY: 0, overFolderId: null });
    if (isFolder) {
      setEditingFolderId(id);
    } else {
      setEditingSessionId(id);
    }
    setEditTitle(currentTitle);
  };

  const handleEditSave = (id: string, isFolder: boolean = false) => {
    if (editTitle.trim()) {
      if (isFolder) {
        updateFolder(id, editTitle.trim());
      } else {
        updateSessionTitle(id, editTitle.trim());
      }
    }
    setEditingSessionId(null);
    setEditingFolderId(null);
  };

  const handleEditCancel = () => {
    setEditingSessionId(null);
    setEditingFolderId(null);
    setEditTitle('');
  };

  const toggleSessionSelection = (id: string) => {
    const newSelection = new Set(selectedSessions);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedSessions(newSelection);
  };

  const toggleFolderSelection = (id: string) => {
    const newSelection = new Set(selectedFolders);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedFolders(newSelection);
  };

  const confirmDelete = (id: string | null, isFolder: boolean = false) => {
    if (isFolder) {
      setFolderToDelete(id);
    } else {
      setSessionToDelete(id);
    }
    setIsDeleteModalOpen(true);
  };

  const handleDelete = () => {
    if (folderToDelete) {
      const folderSessions = sessions.filter(s => s.folderId === folderToDelete);
      folderSessions.forEach(s => deleteSession(s.id));
      deleteFolder(folderToDelete);
    } else if (sessionToDelete) {
      deleteSession(sessionToDelete);
    } else if (selectedSessions.size > 0 || selectedFolders.size > 0) {
      selectedFolders.forEach(fid => {
        const folderSessions = sessions.filter(s => s.folderId === fid);
        folderSessions.forEach(s => deleteSession(s.id));
        deleteFolder(fid);
      });
      batchDeleteSessions(Array.from(selectedSessions));
      setSelectedSessions(new Set());
      setSelectedFolders(new Set());
      setIsMultiSelectMode(false);
    }
    setIsDeleteModalOpen(false);
    setSessionToDelete(null);
    setFolderToDelete(null);
  };

  const deleteModalMessage = useMemo(() => {
    if (folderToDelete) return undefined;
    if (sessionToDelete) return t('sidebar.deleteSessionMsg');
    return t('sidebar.batchDeleteMsg', { count: selectedSessions.size + selectedFolders.size });
  }, [folderToDelete, sessionToDelete, selectedSessions, selectedFolders, t]);

  const folderDeleteSessions = useMemo(() => {
    if (!folderToDelete) return [];
    return sessions.filter(s => s.folderId === folderToDelete);
  }, [folderToDelete, sessions]);

  const handleCreateFolder = () => {
    createFolder(t('sidebar.newFolder'));
  };

  const toggleAgentExpanded = (agentId: string) => {
    const newExpanded = new Set(expandedAgents);
    if (newExpanded.has(agentId)) {
      newExpanded.delete(agentId);
    } else {
      newExpanded.add(agentId);
    }
    setExpandedAgents(newExpanded);
  };

  const navItems = [
    { id: 'chat', icon: MessageSquare, label: t('sidebar.chat') },
    { id: 'agents', icon: Bot, label: t('sidebar.agents') },
    { id: 'search', icon: Search, label: t('sidebar.search') },
    { id: 'terminal', icon: Terminal, label: t('sidebar.terminal') },
    { id: 'mcp', icon: Blocks, label: t('sidebar.mcp') },
  ] as const;

  const iconMap: Record<string, React.ElementType> = {
    Cpu,
    Database,
    Globe,
    Shield,
    Layout,
    Terminal,
    Bot
  };

  const renderSession = (session: ChatSession, level: number = 0, isClusterChild: boolean = false, isLastChild: boolean = false, index: number = 0) => {
    const agent = session.activeAgents?.[0] ? agents.find(a => a.id === session.activeAgents![0]) : null;
    const AgentIcon = agent ? (iconMap[agent.avatar] || Bot) : null;

    const stripAgentName = (title: string) => {
      return title.replace(/\s*\([^)]*\)$/, '');
    };

    const isDragTarget = dragState.isDragging && dragState.sessionId === session.id;

    return (
      <div 
        key={`${session.id}-${index}`}
        className={cn(
          "relative group flex items-center justify-between p-2 rounded-md text-sm transition-all cursor-pointer select-none",
          currentSessionId === session.id 
            ? "border-2 border-dashed border-blue-500 bg-blue-500/5 text-blue-700 dark:text-blue-300 font-medium" 
            : "border border-transparent text-zinc-600 dark:text-zinc-400 hover:bg-zinc-500/10 dark:hover:bg-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-300",
          level > 0 && !isClusterChild && "ml-4 pl-4",
          isClusterChild && "ml-8 pl-4 py-1.5",
          isDragTarget && "opacity-40"
        )}
        onClick={() => {
          if (dragState.isDragging) return;
          switchSession(session.id);
        }}
        onPointerDown={(e) => handleSessionPointerDown(e, session.id)}
        onPointerMove={handleSessionPointerMove}
        onPointerUp={handleSessionPointerUp}
        onDoubleClick={(e) => {
          e.stopPropagation();
          handleEditStart(session.id, session.title);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setContextMenu({ x: e.clientX, y: e.clientY, targetId: session.id, targetType: 'session' });
        }}
      >
        {level > 0 && !isClusterChild && (
          <div className="absolute left-0 top-0 bottom-0 w-4 pointer-events-none">
            <div className={cn(
              "absolute left-0 w-[2px] bg-zinc-300 dark:bg-zinc-600",
              isLastChild ? "top-0 h-1/2" : "top-0 h-full"
            )} />
            <div className="absolute left-0 top-0 w-3 h-1/2 border-l-2 border-b-2 border-zinc-300 dark:border-zinc-600 rounded-bl-lg" />
          </div>
        )}

        {isClusterChild && (
          <div className="absolute left-0 top-0 bottom-0 w-5 pointer-events-none">
            <div className={cn(
              "absolute left-0 w-[2px] bg-zinc-300 dark:bg-zinc-600",
              isLastChild ? "top-0 h-1/2" : "top-0 h-full"
            )} />
            <div className="absolute left-0 top-0 w-4 h-1/2 border-l-2 border-b-2 border-zinc-300 dark:border-zinc-600 rounded-bl-xl" />
          </div>
        )}

        <div className="flex items-center gap-2 overflow-hidden flex-1">
          {isMultiSelectMode && (
            <div 
              onClick={(e) => {
                e.stopPropagation();
                toggleSessionSelection(session.id);
              }}
              className={cn(
                "w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                selectedSessions.has(session.id) ? "bg-blue-500 border-blue-500 text-white" : "border-zinc-600 hover:border-zinc-400"
              )}
            >
              {selectedSessions.has(session.id) && <div className="w-2 h-2 bg-blue-500 rounded-full" />}
            </div>
          )}
          
          {agent ? (
            <div 
              className={cn(
                "p-1 shrink-0 relative group/agent", 
                currentSessionId === session.id ? "text-blue-600" : (agent.themeColor || '').split(' ')[0].replace('bg-', 'text-')
              )}
              title={agent.name}
            >
              {agent.avatar?.startsWith('data:image') ? (
                <img src={agent.avatar} alt={agent.name} className="w-3.5 h-3.5 object-cover rounded-sm" />
              ) : (
                AgentIcon ? <AgentIcon size={14} /> : <Bot size={14} />
              )}
              <div className="absolute left-full ml-2 px-2 py-1 bg-zinc-700 text-white text-[10px] rounded opacity-0 group-hover/agent:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                {agent.name}
              </div>
            </div>
          ) : (
            <div className={cn("p-1 shrink-0", currentSessionId === session.id ? "text-blue-500" : "text-zinc-400")}>
              <MessageSquare size={14} />
            </div>
          )}

          {editingSessionId === session.id ? (
            <div className="flex items-center gap-1 flex-1" onClick={e => e.stopPropagation()}>
              <input
                type="text"
                value={editTitle}
                draggable={false}
                onDragStart={e => e.stopPropagation()}
                onChange={e => setEditTitle(e.target.value)}
                onBlur={() => handleEditSave(session.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleEditSave(session.id);
                  if (e.key === 'Escape') handleEditCancel();
                }}
                className={cn(
                  "w-full bg-transparent border-none rounded px-1 py-0.5 text-xs focus:outline-none",
                  currentSessionId === session.id ? "text-blue-700 dark:text-blue-300 placeholder:text-blue-400" : "text-zinc-800 dark:text-zinc-200"
                )}
                autoFocus
              />
              <button onClick={() => handleEditSave(session.id)} className="text-emerald-500 hover:text-emerald-400">
                <Check size={14} />
              </button>
              <button onClick={handleEditCancel} className="text-zinc-500 hover:text-zinc-400">
                <X size={14} />
              </button>
            </div>
          ) : (
            <span className={cn("truncate flex-1", currentSessionId === session.id ? "text-blue-700 dark:text-blue-300 font-medium" : "")}>
              {debouncedQuery ? highlightText(stripAgentName(session.title)) : stripAgentName(session.title)}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <aside 
        ref={sidebarRef}
        onClick={() => setContextMenu(null)}
        className={cn(
        "flex flex-col py-4 glass z-20 transition-all duration-300 border-r border-zinc-700/50",
        isExpanded ? "w-72 items-stretch px-3" : "w-16 items-center"
      )}>
        {isExpanded && (
          <div className="flex items-center gap-3 px-3 mb-8">
            <NexusLogo size={32} />
            <div className="flex flex-col">
              <span className="font-bold text-sm tracking-tight bg-gradient-to-r from-blue-500 to-indigo-600 bg-clip-text text-transparent">NEXUS AI</span>
              <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-widest opacity-60">Local Intelligence</span>
            </div>
          </div>
        )}
        <nav className="flex flex-col gap-2 flex-1 overflow-y-auto overflow-x-hidden no-scrollbar">
          {navItems.map((item) => (
            <div key={item.id} className="flex flex-col gap-1">
              {item.id === 'chat' && isExpanded && activeTab === 'chat' ? (
                <>
                  <button 
                    onClick={() => setIsChatCollapsed(!isChatCollapsed)}
                    className={cn(
                      "w-full p-2.5 rounded-xl transition-all flex items-center gap-3",
                      activeTab === item.id 
                        ? "bg-blue-600 text-white shadow-md shadow-blue-900/20" 
                        : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                    )}
                  >
                    <MessageSquare size={20} className="shrink-0" />
                    <span className="text-sm font-medium whitespace-nowrap">{t('sidebar.chat')}</span>
                    <div className={cn(
                      "flex items-center gap-0.5 shrink-0 ml-auto transition-all duration-300 overflow-hidden",
                      isChatCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
                    )}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsMultiSelectMode(!isMultiSelectMode);
                          }}
                          className={cn(
                            "p-1.5 rounded-md transition-colors",
                            isMultiSelectMode ? "text-blue-300 bg-white/10" : "text-inherit opacity-70 hover:opacity-100"
                          )}
                          title={t('sidebar.multiSelect')}
                        >
                          {isMultiSelectMode ? <CheckSquare size={14} /> : <Square size={14} />}
                        </button>
                        {isMultiSelectMode && (selectedSessions.size > 0 || selectedFolders.size > 0) && (
                          <>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleBatchExport('json'); }}
                              className="p-1.5 text-emerald-400 hover:bg-emerald-500/20 rounded-md transition-colors"
                              title={t('sidebar.batchExport')}
                              disabled={isExporting}
                            >
                              <Download size={14} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); confirmDelete(null); }}
                              className="p-1.5 text-red-400 hover:bg-red-500/20 rounded-md transition-colors"
                              title={t('sidebar.batchDelete')}
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleImport(); }}
                          className="p-1.5 text-inherit opacity-70 hover:opacity-100 rounded-md transition-colors"
                          title={t('sidebar.importSession')}
                          disabled={isImporting}
                        >
                          <Upload size={14} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCreateFolder(); }}
                          className="p-1.5 text-inherit opacity-70 hover:opacity-100 rounded-md transition-colors"
                          title={t('sidebar.newFolder')}
                        >
                          <FolderPlus size={14} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); createNewSession(); }}
                          className="p-1.5 text-inherit opacity-70 hover:opacity-100 rounded-md transition-colors"
                          title={t('sidebar.newSession')}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                  </button>

                  <div className={cn(
                    "grid transition-all duration-300 ease-in-out",
                    isChatCollapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
                  )}>
                  <div className="overflow-hidden">
                  <div className="bg-zinc-500/5 dark:bg-zinc-800/30 rounded-xl p-2 border border-zinc-200/60 dark:border-zinc-700/50 mt-1">
                    <div className="flex items-center gap-1 mb-1.5">
                      <div className="flex-1 flex items-center gap-1.5 bg-white/50 dark:bg-zinc-800/50 rounded-md px-2 py-1.5 border border-zinc-200/80 dark:border-zinc-600/50 focus-within:border-blue-500 transition-colors">
                        <Search size={12} className="text-zinc-500 shrink-0" />
                        <input
                          ref={searchInputRef}
                          type="text"
                          value={searchQuery}
                          onChange={(e) => handleSearchChange(e.target.value)}
                          placeholder={t('sidebar.searchPlaceholder')}
                          className="w-full bg-transparent border-none text-xs text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-500 focus:outline-none"
                        />
                        {searchQuery && (
                          <button
                            onClick={() => { setSearchQuery(''); setDebouncedQuery(''); }}
                            className="text-zinc-500 hover:text-zinc-300 shrink-0"
                          >
                            <X size={10} />
                          </button>
                        )}
                      </div>
                      <button
                        onClick={() => setSearchMode(searchMode === 'title' ? 'content' : 'title')}
                        className={cn(
                          "p-1 rounded transition-colors shrink-0",
                          searchMode === 'content' ? "text-blue-400 bg-blue-500/10" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                        )}
                        title={searchMode === 'title' ? t('sidebar.searchModeTitle') : t('sidebar.searchModeContent')}
                      >
                        <Filter size={12} />
                      </button>
                    </div>

                    <div className="flex flex-col gap-0.5 max-h-[calc(100vh-340px)] overflow-y-auto no-scrollbar">
                  {folders.filter(folder => !debouncedQuery || filteredSessions.some(s => s.folderId === folder.id)).map(folder => (
                    <div 
                      key={folder.id} 
                      className="flex flex-col"
                      data-folder-id={folder.id}
                    >
                      <div 
                        className={cn(
                          "group flex items-center justify-between p-2 rounded-md text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-500/10 dark:hover:bg-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-300 cursor-pointer transition-colors select-none",
                          dragState.isDragging && dragState.overFolderId === folder.id && "bg-blue-500/10 dark:bg-blue-500/20 border border-blue-400/50 dark:border-blue-500/30 ring-1 ring-blue-400/30"
                        )}
                        onClick={() => {
                          if (isMultiSelectMode) {
                            toggleFolderSelection(folder.id);
                          } else {
                            toggleFolder(folder.id);
                          }
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleEditStart(folder.id, folder.name, true);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setContextMenu({ x: e.clientX, y: e.clientY, targetId: folder.id, targetType: 'folder' });
                        }}
                      >
                        <div className="flex items-center gap-2 overflow-hidden flex-1">
                          {isMultiSelectMode && (
                            <div 
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleFolderSelection(folder.id);
                              }}
                              className={cn(
                                "w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                                selectedFolders.has(folder.id) ? "bg-blue-500 border-blue-500 text-white" : "border-zinc-600 hover:border-zinc-400"
                              )}
                            >
                              {selectedFolders.has(folder.id) && <div className="w-2 h-2 bg-blue-500 rounded-full" />}
                            </div>
                          )}
                          {folder.isExpanded ? <FolderOpen size={14} className="text-blue-400" /> : <Folder size={14} className="text-blue-400" />}
                          {editingFolderId === folder.id ? (
                            <div className="flex items-center gap-1 flex-1" onClick={e => e.stopPropagation()}>
                              <input
                                type="text"
                                value={editTitle}
                                draggable={false}
                                onDragStart={e => e.stopPropagation()}
                                onChange={e => setEditTitle(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleEditSave(folder.id, true);
                                  if (e.key === 'Escape') handleEditCancel();
                                }}
                                className="w-full bg-zinc-500/5 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded px-1 py-0.5 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-blue-500"
                                autoFocus
                              />
                              <button onClick={() => handleEditSave(folder.id, true)} className="text-emerald-500 hover:text-emerald-400">
                                <Check size={14} />
                              </button>
                              <button onClick={handleEditCancel} className="text-zinc-500 hover:text-zinc-400">
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <span className="truncate font-medium">{folder.name}</span>
                          )}
                        </div>
                      </div>
                      {folder.isExpanded && (
                        <div className="flex flex-col">
                          {folder.isClusterTask ? (
                            <>
                              {filteredSessions.filter(s => s.folderId === folder.id && s.activeAgents?.includes('nexus-architect')).map((session, idx) => renderSession(session, 1, false, false, idx))}
                              {filteredSessions.filter(s => s.folderId === folder.id && !s.activeAgents?.includes('nexus-architect')).map((session, index, array) => 
                                renderSession(session, 0, true, index === array.length - 1, index + 100)
                              )}
                            </>
                          ) : (
                            filteredSessions.filter(s => s.folderId === folder.id).map((session, index, array) => 
                              renderSession(session, 1, false, index === array.length - 1, index)
                            )
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {filteredSessions.filter(s => !s.folderId).map((session, idx) => renderSession(session, 0, false, false, idx))}
                </div>
                </div>
                  </div>
                  </div>
              </>
            ) : (
              <button 
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  "p-2.5 rounded-xl transition-all flex items-center gap-3",
                  activeTab === item.id 
                    ? "bg-blue-600 text-white shadow-md shadow-blue-900/20" 
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
                  isExpanded ? "justify-start px-3" : "justify-center"
                )}
                title={!isExpanded ? item.label : undefined}
              >
                <item.icon size={20} className="shrink-0" />
                {isExpanded && <span className="text-sm font-medium whitespace-nowrap">{item.label}</span>}
              </button>
            )}

            {isExpanded && item.id === 'agents' && (
            <div className={cn(
              "grid transition-all duration-300 ease-in-out",
              activeTab === 'agents' ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
            )}>
            <div className="overflow-hidden">
            <div className="mt-2 mb-4 flex flex-col gap-1 pl-1">
              <div className="flex items-center justify-between mb-2 px-2">
                <span className="text-xs text-zinc-500 font-medium uppercase tracking-wider">{t('sidebar.onlineAgents')}</span>
              </div>
              <div className="flex flex-col gap-1">
                {agents.filter(a => !a.parentId).map(agent => {
                  const children = agents.filter(child => child.parentId === agent.id);
                  const isAgentExpanded = expandedAgents.has(agent.id);
                  const Icon = iconMap[agent.avatar] || Bot;
                  
                  return (
                    <div key={agent.id} className="flex flex-col">
                      <div 
                        onClick={() => toggleAgentExpanded(agent.id)}
                        className="group flex items-center gap-3 p-2 rounded-md text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-500/10 dark:hover:bg-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-300 cursor-pointer transition-colors"
                      >
                        <div className="relative flex h-2 w-2 shrink-0">
                          {agent.status === 'working' && (
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          )}
                          <span className={cn(
                            "relative inline-flex rounded-full h-2 w-2",
                            agent.status === 'working' ? "bg-emerald-500" : 
                            agent.status === 'idle' ? "bg-blue-500" : "bg-zinc-500"
                          )}></span>
                        </div>
                        {agent.avatar?.startsWith('data:image') ? (
                          <img src={agent.avatar} alt={agent.name} className="w-4 h-4 object-cover rounded-sm shrink-0 opacity-90" />
                        ) : (
                          <Icon size={14} className="shrink-0 opacity-70" />
                        )}
                        <span className="truncate flex-1 font-medium">{agent.name}</span>
                        {children.length > 0 && (
                          isAgentExpanded ? <ChevronDown size={12} className="opacity-40" /> : <ChevronRight size={12} className="opacity-40" />
                        )}
                      </div>
                      
                      {children.length > 0 && isAgentExpanded && (
                        <div className="flex flex-col ml-4 pl-4 border-l border-zinc-200 dark:border-zinc-700 gap-1 mt-1">
                          {children.map(child => {
                            const ChildIcon = iconMap[child.avatar] || Bot;
                            return (
                              <div key={child.id} className="group flex items-center gap-3 p-1.5 rounded-md text-xs text-zinc-500 dark:text-zinc-400 hover:bg-zinc-500/10 dark:hover:bg-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-300 cursor-pointer transition-colors">
                                <div className="relative flex h-1.5 w-1.5 shrink-0">
                                  <span className={cn(
                                    "relative inline-flex rounded-full h-1.5 w-1.5",
                                    child.status === 'working' ? "bg-emerald-500" : 
                                    child.status === 'idle' ? "bg-blue-500" : "bg-zinc-500"
                                  )}></span>
                                </div>
                                {child.avatar?.startsWith('data:image') ? (
                                  <img src={child.avatar} alt={child.name} className="w-3.5 h-3.5 object-cover rounded-sm shrink-0 opacity-80" />
                                ) : (
                                  <ChildIcon size={12} className="shrink-0 opacity-60" />
                                )}
                                <span className="truncate flex-1">{child.name}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            </div>
            </div>
          )}
          </div>
          ))}
        </nav>

        <div className="flex flex-col gap-2 mt-auto pt-4 border-t border-zinc-700/50">
          <button 
            onClick={toggleDarkMode} 
            className={cn(
              "p-2.5 rounded-xl hover:bg-zinc-800 transition-colors flex items-center gap-3 text-zinc-400 hover:text-zinc-200",
              isExpanded ? "justify-start px-3" : "justify-center"
            )}
            title={!isExpanded ? t('sidebar.theme') : undefined}
          >
            {isDarkMode ? <Sun size={20} className="shrink-0" /> : <Moon size={20} className="shrink-0" />}
            {isExpanded && <span className="text-sm font-medium whitespace-nowrap">{t('sidebar.theme')}</span>}
          </button>
          
          <button 
            onClick={openSettings}
            className={cn(
              "p-2.5 rounded-xl transition-all flex items-center gap-3",
              "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
              isExpanded ? "justify-start px-3" : "justify-center"
            )}
            title={!isExpanded ? t('sidebar.settings') : undefined}
          >
            <Settings size={20} className="shrink-0" />
            {isExpanded && <span className="text-sm font-medium whitespace-nowrap">{t('sidebar.settings')}</span>}
          </button>
        </div>
      </aside>

      {dragState.isDragging && dragState.sessionId && (
        <div
          className="fixed z-[9998] pointer-events-none px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg shadow-xl opacity-90 whitespace-nowrap"
          style={{ left: dragState.currentX + 12, top: dragState.currentY + 12 }}
        >
          {sessions.find(s => s.id === dragState.sessionId)?.title}
        </div>
      )}

      {contextMenu && (
        <div
          className="fixed z-[9999]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600/80 rounded-lg shadow-2xl py-1.5 min-w-[160px] backdrop-blur-sm">
            {contextMenu.targetType === 'session' && (
              <>
                <button
                  onClick={() => {
                    handleExport(contextMenu.targetId, 'json');
                    setContextMenu(null);
                  }}
                  className="w-full px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-left flex items-center gap-2.5 transition-colors"
                >
                  <Download size={13} className="text-emerald-500 dark:text-emerald-400" />
                  <span>{t('sidebar.exportJSON')}</span>
                </button>
                <button
                  onClick={() => {
                    handleExport(contextMenu.targetId, 'markdown');
                    setContextMenu(null);
                  }}
                  className="w-full px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-left flex items-center gap-2.5 transition-colors"
                >
                  <FileText size={13} className="text-emerald-500 dark:text-emerald-400" />
                  <span>{t('sidebar.exportMarkdown')}</span>
                </button>
                <div className="my-1 border-t border-zinc-200 dark:border-zinc-700/60" />
              </>
            )}
            <button
              onClick={() => {
                if (contextMenu.targetType === 'folder') {
                  const folder = folders.find(f => f.id === contextMenu.targetId);
                  if (folder) handleEditStart(folder.id, folder.name, true);
                } else {
                  const session = sessions.find(s => s.id === contextMenu.targetId);
                  if (session) handleEditStart(session.id, session.title);
                }
                setContextMenu(null);
              }}
              className="w-full px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-left flex items-center gap-2.5 transition-colors"
            >
              <Edit2 size={13} className="text-blue-500 dark:text-blue-400" />
              <span>{t('sidebar.rename')}</span>
            </button>
            <div className="my-1 border-t border-zinc-200 dark:border-zinc-700/60" />
            <button
              onClick={() => {
                confirmDelete(contextMenu.targetId, contextMenu.targetType === 'folder');
                setContextMenu(null);
              }}
              className="w-full px-3 py-2 text-xs text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 text-left flex items-center gap-2.5 transition-colors"
            >
              <Trash2 size={13} />
              <span>{t('sidebar.delete')}</span>
            </button>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        title={folderToDelete ? t('sidebar.deleteFolder') : (sessionToDelete ? t('sidebar.deleteSession') : t('sidebar.batchDeleteConfirm'))}
        message={deleteModalMessage}
        onConfirm={handleDelete}
        onCancel={() => {
          setIsDeleteModalOpen(false);
          setSessionToDelete(null);
          setFolderToDelete(null);
        }}
      >
        {folderToDelete && (
          <div className="flex flex-col gap-2">
            <p className="text-zinc-600 dark:text-zinc-300">{t('sidebar.deleteFolderMsg')}</p>
            {folderDeleteSessions.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {t('sidebar.deleteFolderSessions', { count: folderDeleteSessions.length })}:
                </p>
                <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-2 border border-zinc-200 dark:border-zinc-600/50">
                  {folderDeleteSessions.map(s => {
                    const agent = s.activeAgents?.[0] ? agents.find(a => a.id === s.activeAgents![0]) : null;
                    const AgentIcon = agent ? (iconMap[agent.avatar] || Bot) : null;
                    return (
                      <div key={s.id} className="flex items-center gap-2 px-2 py-1 text-sm text-zinc-700 dark:text-zinc-300">
                        {agent && AgentIcon ? (
                          <AgentIcon size={13} className="shrink-0 opacity-70" />
                        ) : (
                          <MessageSquare size={13} className="shrink-0 opacity-50" />
                        )}
                        <span className="truncate">{s.title}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </ConfirmationModal>
    </>
  );
};
