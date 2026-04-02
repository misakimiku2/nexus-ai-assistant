import React from 'react';
import { NexusLogo } from './NexusLogo';
import { 
  Trash2, 
  PanelRightClose, 
  PanelRightOpen, 
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Users
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useGlobalState } from '../context/GlobalStateContext';
import { useTranslation } from '../hooks/useTranslation';

interface HeaderProps {
  isToolPanelOpen: boolean;
  setIsToolPanelOpen: (open: boolean) => void;
  isSidebarExpanded: boolean;
  setIsSidebarExpanded: (open: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({
  isToolPanelOpen,
  setIsToolPanelOpen,
  isSidebarExpanded,
  setIsSidebarExpanded
}) => {
  const { currentTokenCount, clearHistory, simulateTest, simulateClusterTest, maxContextLength } = useGlobalState();
  const { t } = useTranslation();

  return (
    <header 
      data-tauri-drag-region
      className={cn(
        "h-12 flex items-center justify-between px-6 glass border-t-0 border-x-0",
        !isToolPanelOpen && "pr-[90px]"
      )}
    >
      <div className="flex items-center gap-4">
        <button 
          onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
          className="p-2 rounded-lg hover:bg-zinc-500/10 transition-colors text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          title={isSidebarExpanded ? t.header.collapseSidebar : t.header.expandSidebar}
        >
          {isSidebarExpanded ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>
        <div className="flex items-center gap-3">
          <NexusLogo size={32} />
          <h1 className="font-bold text-base tracking-tight bg-gradient-to-r from-blue-500 to-indigo-600 bg-clip-text text-transparent">NEXUS AI</h1>
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-bold uppercase tracking-wider">{t.common.local}</span>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 bg-zinc-500/5 p-1 rounded-lg">
          <button 
            onClick={simulateTest}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 transition-colors"
            title={t.header.unitTestTitle}
          >
            <Play size={14} />
            <span>{t.header.unitTest}</span>
          </button>
          <button 
            onClick={simulateClusterTest}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-500 transition-colors"
            title={t.header.clusterTestTitle}
          >
            <Users size={14} />
            <span>{t.header.clusterTest}</span>
          </button>
        </div>
        <button 
          onClick={clearHistory}
          className="p-2 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors"
          title={t.header.clearHistory}
        >
          <Trash2 size={18} />
        </button>
        <button 
          onClick={() => setIsToolPanelOpen(!isToolPanelOpen)}
          className="p-2 rounded-lg hover:bg-zinc-500/10 transition-colors text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          {isToolPanelOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
        </button>
      </div>
    </header>
  );
};
