import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Blocks, X } from 'lucide-react';
import { cn } from '../lib/utils';

interface AddMcpModalProps {
  isOpen: boolean;
  onClose: () => void;
  newMcpName: string;
  setNewMcpName: (name: string) => void;
  newMcpCommand: string;
  setNewMcpCommand: (command: string) => void;
  newMcpArgs: string;
  setNewMcpArgs: (args: string) => void;
  onAdd: () => void;
  isDarkMode: boolean;
}

export const AddMcpModal: React.FC<AddMcpModalProps> = ({
  isOpen,
  onClose,
  newMcpName,
  setNewMcpName,
  newMcpCommand,
  setNewMcpCommand,
  newMcpArgs,
  setNewMcpArgs,
  onAdd,
  isDarkMode
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="glass w-full max-w-md rounded-2xl p-6 shadow-2xl border border-zinc-500/20"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Blocks size={18} className="text-indigo-500" />
                添加 MCP 服务器
              </h3>
              <button onClick={onClose} className="p-1 hover:bg-zinc-500/10 rounded-lg transition-colors">
                <X size={18} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium opacity-70">服务器名称 (Name)</label>
                <input 
                  type="text" 
                  value={newMcpName}
                  onChange={e => setNewMcpName(e.target.value)}
                  placeholder="例如: mcp-server-github"
                  className={cn(
                    "w-full border border-zinc-500/20 rounded-xl px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500/50 outline-none",
                    isDarkMode ? "bg-zinc-900/30" : "bg-zinc-100/50"
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium opacity-70">启动命令 (Command)</label>
                <input 
                  type="text" 
                  value={newMcpCommand}
                  onChange={e => setNewMcpCommand(e.target.value)}
                  placeholder="例如: npx, node, python"
                  className={cn(
                    "w-full border border-zinc-500/20 rounded-xl px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500/50 outline-none",
                    isDarkMode ? "bg-zinc-900/30" : "bg-zinc-100/50"
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium opacity-70">参数 (Arguments)</label>
                <input 
                  type="text" 
                  value={newMcpArgs}
                  onChange={e => setNewMcpArgs(e.target.value)}
                  placeholder="例如: -y @modelcontextprotocol/server-github"
                  className={cn(
                    "w-full border border-zinc-500/20 rounded-xl px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500/50 outline-none",
                    isDarkMode ? "bg-zinc-900/30" : "bg-zinc-100/50"
                  )}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button 
                onClick={onClose}
                className="flex-1 px-4 py-2 rounded-xl bg-zinc-500/10 hover:bg-zinc-500/20 text-sm font-medium transition-colors"
              >
                取消
              </button>
              <button 
                onClick={onAdd}
                disabled={!newMcpName || !newMcpCommand}
                className="flex-1 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
              >
                添加并连接
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
