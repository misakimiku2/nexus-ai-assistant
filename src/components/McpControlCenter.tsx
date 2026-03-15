import React from 'react';
import { motion } from 'motion/react';
import { Blocks, Plus, Server, ShieldAlert } from 'lucide-react';
import { cn } from '../lib/utils';
import { McpServer } from '../types';
import { useTranslation } from '../hooks/useTranslation';

interface McpControlCenterProps {
  mcpServers: McpServer[];
  setIsAddMcpModalOpen: (open: boolean) => void;
  isDarkMode: boolean;
}

export const McpControlCenter: React.FC<McpControlCenterProps> = ({
  mcpServers,
  setIsAddMcpModalOpen,
  isDarkMode
}) => {
  const { t } = useTranslation();
  return (
    <motion.div 
      key="mcp"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="h-full p-8 overflow-y-auto"
    >
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-semibold mb-2 flex items-center gap-3">
              <Blocks className="text-indigo-500" />
              {t.mcp.title}
            </h2>
            <p className="text-sm opacity-60">{t.mcp.desc}</p>
          </div>
          <button 
            onClick={() => setIsAddMcpModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-colors shadow-lg shadow-indigo-600/20"
          >
            <Plus size={16} />
            {t.mcp.addServer}
          </button>
        </div>
        
        <div className="grid gap-6">
          {mcpServers.map(server => (
            <div key={server.id} className="glass p-6 rounded-2xl border border-zinc-500/10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-zinc-500/10">
                    <Server size={20} className="text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="font-medium text-lg">{server.name}</h3>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={cn(
                        "w-2 h-2 rounded-full",
                        server.status === 'connected' ? "bg-emerald-500" : "bg-red-500"
                      )}></span>
                      <span className="text-xs opacity-60 uppercase tracking-wider">
                        {server.status === 'connected' ? t.mcp.status.connected : t.mcp.status.disconnected}
                      </span>
                    </div>
                  </div>
                </div>
                <button className="px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-500/10 hover:bg-zinc-500/20 transition-colors">
                  {t.mcp.disconnect}
                </button>
              </div>
              
              <div className="space-y-3 mt-6">
                <h4 className="text-xs font-bold uppercase tracking-widest opacity-40 mb-2">{t.mcp.availableTools}</h4>
                {server.tools.length === 0 && (
                  <div className="p-3 rounded-xl border border-dashed border-zinc-500/20 text-center">
                    <p className="text-xs opacity-40">{t.mcp.noTools}</p>
                  </div>
                )}
                {server.tools.map((tool, idx) => (
                  <div key={`${tool.name}-${idx}`} className={cn(
                    "flex items-start justify-between p-3 rounded-xl border border-zinc-500/10",
                    isDarkMode ? "bg-black/20" : "bg-zinc-100/80"
                  )}>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn(
                          "font-mono text-sm",
                          isDarkMode ? "text-indigo-300" : "text-indigo-600"
                        )}>{tool.name}</span>
                        {tool.requiresAuth && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-500 flex items-center gap-1">
                            <ShieldAlert size={10} />
                            {t.mcp.requiresAuth}
                          </span>
                        )}
                      </div>
                      <p className="text-xs opacity-60">{tool.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};
