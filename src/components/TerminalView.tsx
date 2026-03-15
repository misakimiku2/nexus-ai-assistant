import React from 'react';
import { motion } from 'motion/react';
import { Terminal } from 'lucide-react';
import { NexusLogo } from './NexusLogo';
import { cn } from '../lib/utils';
import { useGlobalState } from '../context/GlobalStateContext';
import { useTranslation } from '../hooks/useTranslation';

interface TerminalViewProps {
  isDarkMode: boolean;
}

export const TerminalView: React.FC<TerminalViewProps> = ({ isDarkMode }) => {
  const { t } = useTranslation();
  const { logs, currentTokenCount } = useGlobalState();

  return (
    <motion.div 
      key="terminal"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="h-full p-8 flex flex-col"
    >
      <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold flex items-center gap-3">
            <Terminal className="text-indigo-500" />
            {t.terminal.title}
          </h2>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-500 font-mono text-sm">
            <NexusLogo size={16} />
            <span>{(t.terminal.tokenUsage || '').replace('{count}', currentTokenCount.toString())}</span>
          </div>
        </div>
        <div className={cn(
          "flex-1 glass rounded-2xl p-6 font-mono text-sm overflow-y-auto border-zinc-700",
          isDarkMode ? "bg-black/60" : "bg-zinc-100/80"
        )}>
          <div className="space-y-2">
            <div className="text-emerald-500">{t.terminal.initComplete}</div>
            <div className={isDarkMode ? "text-zinc-500" : "text-zinc-600"}>{t.terminal.waiting}</div>
            {logs.map((log) => (
              <div key={log.id} className={cn(
                "flex gap-3",
                log.type === 'error' ? (isDarkMode ? "text-red-400" : "text-red-600") : 
                log.type === 'command' ? (isDarkMode ? "text-indigo-400" : "text-indigo-600") : 
                (isDarkMode ? "text-zinc-400" : "text-zinc-600")
              )}>
                <span className="opacity-30 shrink-0">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                <span className="break-all">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
};
