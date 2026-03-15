import React, { useState } from 'react';
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
  FileText
} from 'lucide-react';
import { NexusLogo } from './NexusLogo';
import { cn } from '../lib/utils';
import { useGlobalState } from '../context/GlobalStateContext';
import { ConfirmationModal } from './ConfirmationModal';
import { ChatSession } from '../types';

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
    agents
  } = useGlobalState();

  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set(agents.filter(a => !a.parentId).map(a => a.id)));

  // Drag and Drop State
  const [draggedSessionId, setDraggedSessionId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, sessionId: string) => {
    setDraggedSessionId(sessionId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDropOnFolder = (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (isMultiSelectMode && selectedSessions.size > 0) {
      selectedSessions.forEach(id => moveSessionToFolder(id, folderId));
      setSelectedSessions(new Set());
      setIsMultiSelectMode(false);
      setDraggedSessionId(null);
    } else if (draggedSessionId) {
      moveSessionToFolder(draggedSessionId, folderId);
      setDraggedSessionId(null);
    }
  };

  const handleDropOnRoot = (e: React.DragEvent) => {
    e.preventDefault();
    if (isMultiSelectMode && selectedSessions.size > 0) {
      selectedSessions.forEach(id => moveSessionToFolder(id, undefined));
      setSelectedSessions(new Set());
      setIsMultiSelectMode(false);
      setDraggedSessionId(null);
    } else if (draggedSessionId) {
      moveSessionToFolder(draggedSessionId, undefined);
      setDraggedSessionId(null);
    }
  };

  const handleEditStart = (id: string, currentTitle: string, isFolder: boolean = false) => {
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
      deleteFolder(folderToDelete);
    } else if (sessionToDelete) {
      deleteSession(sessionToDelete);
    } else if (selectedSessions.size > 0) {
      batchDeleteSessions(Array.from(selectedSessions));
      setSelectedSessions(new Set());
      setIsMultiSelectMode(false);
    }
    setIsDeleteModalOpen(false);
    setSessionToDelete(null);
    setFolderToDelete(null);
  };

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

    return (
      <div 
        key={`${session.id}-${index}`}
        draggable={editingSessionId !== session.id}
        onDragStart={(e) => handleDragStart(e, session.id)}
        className={cn(
          "relative group flex items-center justify-between p-2 rounded-md text-sm transition-all cursor-pointer",
          currentSessionId === session.id 
            ? "bg-blue-600 text-white font-medium shadow-sm" 
            : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-500/10 dark:hover:bg-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-300",
          level > 0 && !isClusterChild && "ml-4 pl-4",
          isClusterChild && "ml-8 pl-4 py-1.5"
        )}
        onClick={() => switchSession(session.id)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          handleEditStart(session.id, session.title);
        }}
      >
        {/* Tree Lines */}
        {level > 0 && !isClusterChild && (
          <div className="absolute left-0 top-0 bottom-0 w-4 pointer-events-none">
            {/* Vertical line segment */}
            <div className={cn(
              "absolute left-0 w-[2px] bg-zinc-300 dark:bg-zinc-600",
              isLastChild ? "top-0 h-1/2" : "top-0 h-full"
            )} />
            {/* Rounded connector */}
            <div className="absolute left-0 top-0 w-3 h-1/2 border-l-2 border-b-2 border-zinc-300 dark:border-zinc-600 rounded-bl-lg" />
          </div>
        )}

        {isClusterChild && (
          <div className="absolute left-0 top-0 bottom-0 w-5 pointer-events-none">
            {/* Vertical line segment */}
            <div className={cn(
              "absolute left-0 w-[2px] bg-zinc-300 dark:bg-zinc-600",
              isLastChild ? "top-0 h-1/2" : "top-0 h-full"
            )} />
            {/* Rounded connector */}
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
              {selectedSessions.has(session.id) && <div className="w-2 h-2 bg-white rounded-full" />}
            </div>
          )}
          
          {agent ? (
            <div 
              className={cn(
                "p-1 shrink-0 relative group/agent", 
                currentSessionId === session.id ? "text-white" : (agent.themeColor || '').split(' ')[0].replace('bg-', 'text-')
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
            <div className={cn("p-1 shrink-0", currentSessionId === session.id ? "text-white" : "text-zinc-400")}>
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
                  currentSessionId === session.id ? "text-white placeholder:text-white/50" : "text-zinc-800 dark:text-zinc-200"
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
            <span className={cn("truncate flex-1", currentSessionId === session.id ? "text-white" : "")}>
              {stripAgentName(session.title)}
            </span>
          )}
        </div>
        
        {!editingSessionId && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleEditStart(session.id, session.title);
              }}
              className={cn("p-1 transition-colors", currentSessionId === session.id ? "text-white/70 hover:text-white" : "text-zinc-500 hover:text-blue-400")}
            >
              <Edit2 size={12} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                confirmDelete(session.id);
              }}
              className={cn("p-1 transition-colors", currentSessionId === session.id ? "text-white/70 hover:text-white" : "text-zinc-500 hover:text-red-400")}
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <aside className={cn(
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

              {/* Chat Sessions List */}
              {isExpanded && item.id === 'chat' && activeTab === 'chat' && (
                <div 
                  className="mt-1 mb-4 flex flex-col gap-1 pl-4 border-l border-zinc-200 dark:border-zinc-700 ml-5"
                  onDragOver={handleDragOver}
                  onDrop={handleDropOnRoot}
                >
                  <div className="flex items-center justify-between mb-2 px-2">
                    <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-medium uppercase tracking-wider">
                      <MessageSquare size={12} className="shrink-0 opacity-70" />
                      <span>{t('sidebar.sessions')}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setIsMultiSelectMode(!isMultiSelectMode)}
                        className={cn(
                          "p-1 rounded transition-colors",
                          isMultiSelectMode ? "text-blue-400 bg-blue-500/10" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                        )}
                        title={t('sidebar.multiSelect')}
                      >
                        {isMultiSelectMode ? <CheckSquare size={14} /> : <Square size={14} />}
                      </button>
                      {isMultiSelectMode && selectedSessions.size > 0 && (
                        <button
                          onClick={() => confirmDelete(null)}
                          className="p-1 text-red-400 hover:bg-red-500/10 rounded transition-colors"
                          title={t('sidebar.batchDelete')}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                      <button
                        onClick={handleCreateFolder}
                        className="p-1 text-zinc-500 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                        title={t('sidebar.newFolder')}
                      >
                        <FolderPlus size={14} />
                      </button>
                      <button
                        onClick={createNewSession}
                        className="p-1 text-zinc-500 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                        title={t('sidebar.newSession')}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                  
                  {/* Folders */}
                  {folders.map(folder => (
                    <div 
                      key={folder.id} 
                      className="flex flex-col"
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDropOnFolder(e, folder.id)}
                    >
                      <div 
                        className="group flex items-center justify-between p-2 rounded-md text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-500/10 dark:hover:bg-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-300 cursor-pointer transition-colors"
                        onClick={() => toggleFolder(folder.id)}
                      >
                        <div className="flex items-center gap-2 overflow-hidden flex-1">
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
                        {!editingFolderId && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditStart(folder.id, folder.name, true);
                              }}
                              className="p-1 text-zinc-500 hover:text-blue-400 transition-colors"
                            >
                              <Edit2 size={12} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                confirmDelete(folder.id, true);
                              }}
                              className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        )}
                      </div>
                      {folder.isExpanded && (
                        <div className="flex flex-col">
                          {folder.isClusterTask ? (
                            <>
                              {/* Main Agent Session */}
                              {sessions.filter(s => s.folderId === folder.id && s.activeAgents?.includes('nexus-architect')).map((session, idx) => renderSession(session, 1, false, false, idx))}
                              {/* Sub Agent Sessions */}
                              {sessions.filter(s => s.folderId === folder.id && !s.activeAgents?.includes('nexus-architect')).map((session, index, array) => 
                                renderSession(session, 0, true, index === array.length - 1, index + 100)
                              )}
                            </>
                          ) : (
                            sessions.filter(s => s.folderId === folder.id).map((session, index, array) => 
                              renderSession(session, 1, false, index === array.length - 1, index)
                            )
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Root Sessions */}
                  {sessions.filter(s => !s.folderId).map((session, idx) => renderSession(session, 0, false, false, idx))}
                </div>
              )}

          {/* Agents List */}
          {isExpanded && item.id === 'agents' && activeTab === 'agents' && (
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

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        title={folderToDelete ? t('sidebar.deleteFolder') : (sessionToDelete ? t('sidebar.deleteSession') : t('sidebar.batchDeleteConfirm'))}
        message={folderToDelete ? t('sidebar.deleteFolderMsg') : (sessionToDelete ? t('sidebar.deleteSessionMsg') : t('sidebar.batchDeleteMsg', { count: selectedSessions.size }))}
        onConfirm={handleDelete}
        onCancel={() => {
          setIsDeleteModalOpen(false);
          setSessionToDelete(null);
          setFolderToDelete(null);
        }}
      />
    </>
  );
};
