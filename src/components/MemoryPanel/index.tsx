import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Bug, BugOff, List, Target, FileText, Settings2, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useMemoryUI } from '../../context/MemoryUIContext';
import { useMemoryState } from '../../hooks/useMemoryState';
import { MemoryPanelTab } from './types';
import { MemoryList } from './MemoryList';
import { MemoryHits } from './MemoryHits';
import { MemoryDebugLog } from './MemoryDebugLog';
import { MemoryOperations } from './MemoryOperations';
import { MemoryStats } from './MemoryStats';

interface MemoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
}

export const MemoryPanel: React.FC<MemoryPanelProps> = ({ isOpen, onClose, isDarkMode }) => {
  const { t } = useTranslation();
  const { debugMode, toggleDebugMode } = useMemoryUI();
  const { loading, error, refresh, stats, evolutionStats } = useMemoryState();
  const [activeTab, setActiveTab] = useState<MemoryPanelTab>('list');

  const tabs: { id: MemoryPanelTab; label: string; icon: React.ElementType }[] = [
    { id: 'list', label: t('memory.tabs.list'), icon: List },
    { id: 'hits', label: t('memory.tabs.hits'), icon: Target },
    { id: 'logs', label: t('memory.tabs.logs'), icon: FileText },
    { id: 'operations', label: t('memory.tabs.operations'), icon: Settings2 },
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className={cn(
          "w-[90vw] h-[85vh] max-w-[1200px] rounded-xl shadow-2xl flex flex-col overflow-hidden",
          isDarkMode ? "bg-zinc-900 border border-zinc-700" : "bg-white border border-zinc-200"
        )}
      >
        <div
          className={cn(
            "flex items-center justify-between px-4 py-3 border-b shrink-0",
            isDarkMode ? "border-zinc-700 bg-zinc-800" : "border-zinc-200 bg-zinc-50"
          )}
        >
          <div className="flex items-center gap-3">
            <h2 className={cn("text-lg font-semibold", isDarkMode ? "text-zinc-100" : "text-zinc-800")}>
              {t('memory.title')}
            </h2>
            <button
              onClick={toggleDebugMode}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                debugMode
                  ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                  : isDarkMode
                    ? "bg-zinc-700 text-zinc-400 hover:bg-zinc-600"
                    : "bg-zinc-200 text-zinc-600 hover:bg-zinc-300"
              )}
            >
              {debugMode ? <Bug size={14} /> : <BugOff size={14} />}
              {debugMode ? t('memory.debugOn') : t('memory.debugOff')}
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              disabled={loading}
              className={cn(
                "p-2 rounded-md transition-colors",
                isDarkMode
                  ? "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
                  : "text-zinc-600 hover:text-zinc-800 hover:bg-zinc-200",
                loading && "opacity-50 cursor-not-allowed"
              )}
              title={t('memory.refresh')}
            >
              <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={onClose}
              className={cn(
                "p-2 rounded-md transition-colors",
                isDarkMode
                  ? "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
                  : "text-zinc-600 hover:text-zinc-800 hover:bg-zinc-200"
              )}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="shrink-0 px-4 py-3">
          <MemoryStats isDarkMode={isDarkMode} stats={stats} evolutionStats={evolutionStats} loading={loading} />
        </div>

        <div
          className={cn(
            "flex border-b shrink-0 px-4",
            isDarkMode ? "border-zinc-700" : "border-zinc-200"
          )}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                activeTab === tab.id
                  ? isDarkMode
                    ? "border-blue-500 text-blue-400"
                    : "border-blue-500 text-blue-600"
                  : isDarkMode
                    ? "border-transparent text-zinc-400 hover:text-zinc-200"
                    : "border-transparent text-zinc-500 hover:text-zinc-800"
              )}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-hidden">
          {error && (
            <div className="px-4 py-2 bg-red-500/10 text-red-400 text-sm border-b border-red-500/20">
              Error: {error}
            </div>
          )}
          
          <div className="h-full overflow-auto p-4">
            {activeTab === 'list' && <MemoryList isDarkMode={isDarkMode} debugMode={debugMode} />}
            {activeTab === 'hits' && <MemoryHits isDarkMode={isDarkMode} debugMode={debugMode} />}
            {activeTab === 'logs' && <MemoryDebugLog isDarkMode={isDarkMode} />}
            {activeTab === 'operations' && <MemoryOperations isDarkMode={isDarkMode} />}
          </div>
        </div>
      </div>
    </div>
  );
};
