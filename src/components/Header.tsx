import React from 'react';
import { NexusLogo } from './NexusLogo';
import { 
  Trash2, 
  PanelRightClose, 
  PanelRightOpen, 
  PanelLeftClose,
  PanelLeftOpen
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
  const { currentTokenCount, clearHistory, maxContextLength, activeModel, modelConfigs } = useGlobalState();
  const { t } = useTranslation();
  
  // 判断是否为本地模型 (LM Studio 或 Ollama)
  // 优先使用启用的模型，如果没有启用则按顺位取第一个模型
  const modelToCheck = activeModel || (modelConfigs.length > 0 ? modelConfigs[0] : null);
  const isLocalModel = !modelToCheck || modelToCheck.provider === 'lm-studio' || modelToCheck.provider === 'ollama';

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
          <h1 className="font-bold text-base tracking-tight bg-gradient-to-r from-blue-500 to-indigo-600 bg-clip-text text-transparent">I.R.I.S.</h1>
          <span className={cn(
            "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
            isLocalModel 
              ? "bg-emerald-500/10 text-emerald-500" 
              : "bg-blue-500/10 text-blue-500"
          )}>
            {isLocalModel ? t.common.local : "在线"}
          </span>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
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
