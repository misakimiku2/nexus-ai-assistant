import React, { useState } from 'react';
import { Plus, Command, PanelRightOpen, PanelRightClose, X, FileText, Code, Database, Terminal } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from '../hooks/useTranslation';

interface Tab {
  id: string;
  title: string;
  type: 'doc' | 'code' | 'data' | 'terminal';
}

interface CanvasWorkspaceProps {
  isDarkMode: boolean;
  isToolPanelOpen: boolean;
  setIsToolPanelOpen: (open: boolean) => void;
}

export const CanvasWorkspace: React.FC<CanvasWorkspaceProps> = ({ 
  isDarkMode,
  isToolPanelOpen,
  setIsToolPanelOpen
}) => {
  const { t } = useTranslation();
  const [tabs, setTabs] = useState<Tab[]>([
    { id: '1', title: `${t.canvas.workspace} 1`, type: 'doc' }
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('1');

  const addTab = () => {
    const newId = Date.now().toString() + Math.random().toString(36).substring(2, 9);
    const newTab: Tab = {
      id: newId,
      title: `${t.canvas.newWorkspace} ${tabs.length + 1}`,
      type: 'doc'
    };
    setTabs([...tabs, newTab]);
    setActiveTabId(newId);
  };

  const closeTab = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (tabs.length === 1) return;
    
    const newTabs = tabs.filter(t => t.id !== id);
    setTabs(newTabs);
    
    if (activeTabId === id) {
      setActiveTabId(newTabs[newTabs.length - 1].id);
    }
  };

  const getTabIcon = (type: Tab['type']) => {
    switch (type) {
      case 'code': return <Code size={14} />;
      case 'data': return <Database size={14} />;
      case 'terminal': return <Terminal size={14} />;
      default: return <FileText size={14} />;
    }
  };

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, x: 20, flex: 0 }}
      animate={{ opacity: 1, x: 0, flex: 1 }}
      exit={{ opacity: 0, x: 20, flex: 0 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className={cn(
        "flex flex-col min-w-0 h-full overflow-hidden",
        isDarkMode ? "bg-zinc-800" : "bg-zinc-50"
      )}
    >
      {/* Top Tabs */}
      <div className={cn(
        "h-12 border-b flex items-center px-4 gap-1 shrink-0 overflow-x-auto no-scrollbar",
        isDarkMode ? "border-zinc-600 bg-zinc-700/50" : "border-zinc-200 bg-white"
      )}>
        <div className="flex items-center gap-1">
          {tabs.map((tab) => (
            <div 
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 cursor-pointer transition-all group",
                activeTabId === tab.id 
                  ? (isDarkMode ? "bg-zinc-700 text-zinc-200" : "bg-zinc-100 text-zinc-800")
                  : "text-zinc-500 hover:bg-zinc-500/5"
              )}
            >
              <div className={cn(
                "w-1.5 h-1.5 rounded-full",
                activeTabId === tab.id ? "bg-emerald-500" : "bg-zinc-500/30"
              )}></div>
              <span className="whitespace-nowrap">{tab.title}</span>
              {tabs.length > 1 && (
                <button 
                  onClick={(e) => closeTab(e, tab.id)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded-sm hover:bg-zinc-500/20 transition-all"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>

        <button 
          onClick={addTab}
          className={cn(
            "p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-600 text-zinc-500 transition-colors shrink-0"
          )}
          title={t.canvas.createWorkspace}
        >
          <Plus size={16} />
        </button>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <button 
            onClick={() => setIsToolPanelOpen(!isToolPanelOpen)}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              isDarkMode ? "hover:bg-zinc-700 text-zinc-400" : "hover:bg-zinc-100 text-zinc-500"
            )}
            title={isToolPanelOpen ? t.canvas.closeToolbar : t.canvas.openToolbar}
          >
            {isToolPanelOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
          </button>
        </div>
      </div>

      {/* Canvas Content */}
      <AnimatePresence mode="wait">
        <motion.div 
          key={activeTabId}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="flex-1 overflow-auto p-6 flex flex-col items-center justify-center"
        >
          <div className={cn("w-24 h-24 rounded-full flex items-center justify-center mb-6 border border-transparent", isDarkMode ? "bg-zinc-700 border-zinc-600/50" : "bg-zinc-200")}>
            <Command size={40} className={cn(isDarkMode ? "text-zinc-400" : "text-zinc-500")} />
          </div>
          <h3 className="text-xl font-medium mb-2">{tabs.find(t => t.id === activeTabId)?.title}</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md text-center">
            {t.canvas.placeholder}
          </p>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
};
