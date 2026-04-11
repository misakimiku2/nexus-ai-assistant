import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Blocks, X, Plus, Trash2, ChevronDown, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { MCP_PRESETS, McpPreset } from '../data/mcpPresets';

interface EnvVar {
  key: string;
  value: string;
}

interface AddMcpModalProps {
  isOpen: boolean;
  onClose: () => void;
  newMcpName: string;
  setNewMcpName: (name: string) => void;
  newMcpCommand: string;
  setNewMcpCommand: (command: string) => void;
  newMcpArgs: string;
  setNewMcpArgs: (args: string) => void;
  envVars: EnvVar[];
  setEnvVars: (vars: EnvVar[]) => void;
  toolTimeout: number;
  setToolTimeout: (timeout: number) => void;
  connectTimeout: number;
  setConnectTimeout: (timeout: number) => void;
  isConnecting: boolean;
  isEditing: boolean;
  error: string | null;
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
  envVars,
  setEnvVars,
  toolTimeout,
  setToolTimeout,
  connectTimeout,
  setConnectTimeout,
  isConnecting,
  isEditing,
  error,
  onAdd,
  isDarkMode
}) => {
  const [showPresets, setShowPresets] = useState(false);
  const argsRef = useRef<HTMLTextAreaElement>(null);

  const addEnvVar = () => {
    setEnvVars([...envVars, { key: '', value: '' }]);
  };

  const removeEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
  };

  const updateEnvVar = (index: number, field: 'key' | 'value', val: string) => {
    const updated = [...envVars];
    updated[index] = { ...updated[index], [field]: val };
    setEnvVars(updated);
  };

  const applyPreset = (preset: McpPreset) => {
    setNewMcpName(preset.name);
    setNewMcpCommand(preset.command);
    setNewMcpArgs(preset.args.join(' '));
    if (preset.envKeys.length > 0) {
      setEnvVars(preset.envKeys.map(key => ({ key, value: '' })));
    } else {
      setEnvVars([]);
    }
    setShowPresets(false);
    requestAnimationFrame(() => autoResize(argsRef.current));
  };

  const autoResize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 10 * 24) + 'px';
  }, []);

  const handleArgsChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewMcpArgs(e.target.value);
    autoResize(e.target);
  }, [setNewMcpArgs, autoResize]);

  const inputClass = cn(
    "w-full border border-zinc-500/20 rounded-xl px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500/50 outline-none",
    isDarkMode ? "bg-zinc-900/30" : "bg-zinc-100/50"
  );

  const envInputClass = cn(
    "flex-1 border border-zinc-500/20 rounded-lg px-2 py-1.5 text-xs font-mono focus:ring-1 focus:ring-indigo-500/50 outline-none",
    isDarkMode ? "bg-zinc-900/30" : "bg-zinc-100/50"
  );

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
            className="glass w-full max-w-md rounded-2xl p-6 shadow-2xl border border-zinc-500/20 max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Blocks size={18} className="text-indigo-500" />
                {isEditing ? '编辑 MCP 服务器' : '添加 MCP 服务器'}
              </h3>
              <button onClick={onClose} className="p-1 hover:bg-zinc-500/10 rounded-lg transition-colors">
                <X size={18} />
              </button>
            </div>
            
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{error}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium opacity-70">从预设选择</label>
                  <button
                    onClick={() => setShowPresets(!showPresets)}
                    className={cn(
                      "flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors",
                      showPresets ? "bg-indigo-500/20 text-indigo-400" : "hover:bg-zinc-500/10 opacity-60"
                    )}
                  >
                    <ChevronDown size={12} className={cn("transition-transform", showPresets && "rotate-180")} />
                    预设
                  </button>
                </div>
                <AnimatePresence>
                  {showPresets && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="grid grid-cols-2 gap-2 py-2">
                        {MCP_PRESETS.map(preset => (
                          <button
                            key={preset.id}
                            onClick={() => applyPreset(preset)}
                            className={cn(
                              "text-left p-2.5 rounded-xl border transition-colors",
                              isDarkMode
                                ? "border-zinc-500/20 hover:border-indigo-500/40 hover:bg-indigo-500/5"
                                : "border-zinc-300 hover:border-indigo-400 hover:bg-indigo-50"
                            )}
                          >
                            <div className="text-xs font-medium">{preset.name}</div>
                            <div className="text-[10px] opacity-40 mt-0.5 line-clamp-2">{preset.description}</div>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium opacity-70">服务器名称 (Name)</label>
                <input 
                  type="text" 
                  value={newMcpName}
                  onChange={e => setNewMcpName(e.target.value)}
                  placeholder="例如: mcp-server-github"
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium opacity-70">启动命令 (Command)</label>
                <input 
                  type="text" 
                  value={newMcpCommand}
                  onChange={e => setNewMcpCommand(e.target.value)}
                  placeholder="例如: npx, node, python"
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium opacity-70">参数 (Arguments)</label>
                <textarea 
                  ref={argsRef}
                  value={newMcpArgs}
                  onChange={handleArgsChange}
                  placeholder="例如: -y @modelcontextprotocol/server-filesystem /path"
                  rows={1}
                  className={cn(
                    "w-full border border-zinc-500/20 rounded-xl px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500/50 outline-none resize-none overflow-hidden",
                    isDarkMode ? "bg-zinc-900/30" : "bg-zinc-100/50"
                  )}
                  style={{ height: 'auto', minHeight: '38px', maxHeight: '240px' }}
                />
                <p className="text-xs opacity-40 mt-1">用空格分隔各参数，含空格的路径用引号包裹，如: -y @pkg "C:\My Path"</p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium opacity-70">环境变量 (Environment)</label>
                  <button
                    onClick={addEnvVar}
                    className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-400 transition-colors"
                  >
                    <Plus size={12} />
                    添加
                  </button>
                </div>
                {envVars.length > 0 && (
                  <div className="space-y-2">
                    {envVars.map((env, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={env.key}
                          onChange={e => updateEnvVar(index, 'key', e.target.value)}
                          placeholder="KEY"
                          className={envInputClass}
                        />
                        <span className="text-xs opacity-30">=</span>
                        <input
                          type="text"
                          value={env.value}
                          onChange={e => updateEnvVar(index, 'value', e.target.value)}
                          placeholder="value"
                          className={envInputClass}
                        />
                        <button
                          onClick={() => removeEnvVar(index)}
                          className="p-1 text-red-400 hover:text-red-300 transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium opacity-70">工具执行超时 (秒)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={10}
                    max={300}
                    value={toolTimeout}
                    onChange={e => setToolTimeout(Math.max(10, Math.min(300, parseInt(e.target.value) || 60)))}
                    className={cn(
                      "w-24 border border-zinc-500/20 rounded-lg px-2 py-1.5 text-xs text-center focus:ring-1 focus:ring-indigo-500/50 outline-none",
                      isDarkMode ? "bg-zinc-900/30" : "bg-zinc-100/50"
                    )}
                  />
                  <span className="text-xs opacity-40">10-300秒，默认60秒</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium opacity-70">连接超时 (秒)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={10}
                    max={120}
                    value={connectTimeout}
                    onChange={e => setConnectTimeout(Math.max(10, Math.min(120, parseInt(e.target.value) || 30)))}
                    className={cn(
                      "w-24 border border-zinc-500/20 rounded-lg px-2 py-1.5 text-xs text-center focus:ring-1 focus:ring-indigo-500/50 outline-none",
                      isDarkMode ? "bg-zinc-900/30" : "bg-zinc-100/50"
                    )}
                  />
                  <span className="text-xs opacity-40">10-120秒，默认30秒</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button 
                onClick={onClose}
                disabled={isConnecting}
                className="flex-1 px-4 py-2 rounded-xl bg-zinc-500/10 hover:bg-zinc-500/20 text-sm font-medium transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button 
                onClick={onAdd}
                disabled={!newMcpName || !newMcpCommand || isConnecting}
                className="flex-1 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {isConnecting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    {isEditing ? '保存中...' : '连接中...'}
                  </>
                ) : (
                  isEditing ? '保存并重连' : '添加并连接'
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
