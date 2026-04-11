import React, { useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Blocks, Plus, Server, ShieldAlert, RefreshCw, Trash2, Eye, EyeOff, FileText, X, Pencil, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../lib/utils';
import { McpServer, McpServerConfig } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import { McpService } from '../agent/mcp/McpService';

interface McpControlCenterProps {
  mcpServers: McpServer[];
  setMcpServers: React.Dispatch<React.SetStateAction<McpServer[]>>;
  setIsAddMcpModalOpen: (open: boolean) => void;
  isDarkMode: boolean;
  onDisconnect?: (id: string) => void;
  onReconnect?: (id: string) => void;
  onRemove?: (id: string) => void;
  onRefreshTools?: () => void;
  onEditServer?: (server: McpServer) => void;
}

export const McpControlCenter: React.FC<McpControlCenterProps> = ({
  mcpServers,
  setMcpServers,
  setIsAddMcpModalOpen,
  isDarkMode,
  onDisconnect,
  onReconnect,
  onRemove,
  onRefreshTools,
  onEditServer,
}) => {
  const { t } = useTranslation();
  const [revealedEnvs, setRevealedEnvs] = React.useState<Set<string>>(new Set());
  const [expandedLogs, setExpandedLogs] = React.useState<Set<string>>(new Set());
  const [expandedTools, setExpandedTools] = React.useState<Set<string>>(new Set());
  const [serverLogs, setServerLogs] = React.useState<Record<string, string>>({});
  const [reconnectingServers, setReconnectingServers] = React.useState<Set<string>>(new Set());
  const [manualReconnecting, setManualReconnecting] = React.useState<Set<string>>(new Set());
  const [resourceUsage, setResourceUsage] = React.useState<Record<string, { pid: number; memoryKb: number; cpuPercent: number }>>({});
  const logTimersRef = useRef<Record<string, number>>({});
  const healthTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef<Record<string, number>>({});

  const toggleEnvReveal = (serverId: string) => {
    setRevealedEnvs(prev => {
      const next = new Set(prev);
      if (next.has(serverId)) next.delete(serverId);
      else next.add(serverId);
      return next;
    });
  };

  const toggleTools = (serverId: string) => {
    setExpandedTools(prev => {
      const next = new Set(prev);
      if (next.has(serverId)) next.delete(serverId);
      else next.add(serverId);
      return next;
    });
  };

  const toggleLog = useCallback(async (serverId: string) => {
    setExpandedLogs(prev => {
      const next = new Set(prev);
      if (next.has(serverId)) {
        next.delete(serverId);
        if (logTimersRef.current[serverId]) {
          clearInterval(logTimersRef.current[serverId]);
          delete logTimersRef.current[serverId];
        }
      } else {
        next.add(serverId);
        McpService.getServerStderr(serverId).then(log => {
          setServerLogs(prev => ({ ...prev, [serverId]: log }));
        }).catch(() => {});
        logTimersRef.current[serverId] = window.setInterval(async () => {
          try {
            const log = await McpService.getServerStderr(serverId);
            setServerLogs(prev => ({ ...prev, [serverId]: log }));
          } catch {}
        }, 2000);
      }
      return next;
    });
  }, []);

  const clearLog = useCallback(async (serverId: string) => {
    try {
      await McpService.clearServerStderr(serverId);
      setServerLogs(prev => ({ ...prev, [serverId]: '' }));
    } catch {}
  }, []);

  useEffect(() => {
    healthTimerRef.current = window.setInterval(async () => {
      try {
        const [results, usage] = await Promise.all([
          McpService.checkHealth(),
          McpService.getResourceUsage(),
        ]);
        setResourceUsage(usage);
        let needsUpdate = false;
        const updatedServers = mcpServers.map(server => {
          const healthResult = results.find(r => r.id === server.id);
          if (healthResult && healthResult.status !== server.status) {
            needsUpdate = true;
            const newStatus = healthResult.status as McpServer['status'];
            if (server.status === 'connected' && (newStatus === 'disconnected' || newStatus === 'error')) {
              autoReconnect(server.id);
            }
            return { ...server, status: newStatus, error: newStatus === 'error' ? 'Process crashed' : server.error };
          }
          return server;
        });
        if (needsUpdate) {
          setMcpServers(updatedServers);
        }
      } catch {}
    }, 10000);

    return () => {
      if (healthTimerRef.current) clearInterval(healthTimerRef.current);
      Object.values(logTimersRef.current).forEach(clearInterval);
    };
  }, [mcpServers, setMcpServers]);

  const handleReconnect = useCallback(async (serverId: string) => {
    setManualReconnecting(prev => new Set(prev).add(serverId));
    try {
      if (onReconnect) {
        await onReconnect(serverId);
      }
    } finally {
      setManualReconnecting(prev => {
        const next = new Set(prev);
        next.delete(serverId);
        return next;
      });
    }
  }, [onReconnect]);

  const autoReconnect = useCallback(async (serverId: string) => {
    const attempts = reconnectAttemptsRef.current[serverId] || 0;
    if (attempts >= 3) {
      reconnectAttemptsRef.current[serverId] = 0;
      return;
    }

    const delays = [5000, 10000, 20000];
    setReconnectingServers(prev => new Set(prev).add(serverId));

    setTimeout(async () => {
      try {
        if (onReconnect) {
          await onReconnect(serverId);
          reconnectAttemptsRef.current[serverId] = 0;
        }
      } catch {
        reconnectAttemptsRef.current[serverId] = attempts + 1;
        autoReconnect(serverId);
      } finally {
        setReconnectingServers(prev => {
          const next = new Set(prev);
          next.delete(serverId);
          return next;
        });
      }
    }, delays[attempts]);
  }, [onReconnect]);

  const statusColor = (status: McpServer['status']) => {
    switch (status) {
      case 'connected': return 'bg-emerald-500';
      case 'connecting': return 'bg-amber-500';
      case 'error': return 'bg-red-500';
      case 'disconnected': return 'bg-zinc-500';
    }
  };

  const statusText = (status: McpServer['status']) => {
    switch (status) {
      case 'connected': return t.mcp.status.connected;
      case 'connecting': return '连接中';
      case 'error': return '错误';
      case 'disconnected': return t.mcp.status.disconnected;
    }
  };

  return (
    <motion.div 
      key="mcp"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="h-full p-8 overflow-y-auto"
    >
      <div className="max-w-5xl mx-auto">
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
        
        {mcpServers.length === 0 && (
          <div className="text-center py-16 opacity-50">
            <Blocks size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">暂无 MCP 服务器</p>
            <p className="text-sm mt-2">点击"添加服务器"连接你的第一个 MCP 服务器</p>
          </div>
        )}

        <div className="columns-2 gap-4 space-y-4">
          {mcpServers.map(server => (
            <div key={server.id} className="glass p-5 rounded-2xl border border-zinc-500/10 break-inside-avoid mb-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-1.5 rounded-lg bg-zinc-500/10 shrink-0">
                    <Server size={18} className="text-indigo-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-medium text-base truncate">{server.name}</h3>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", statusColor(server.status))}></span>
                      <span className="text-[10px] opacity-60 uppercase tracking-wider">
                        {manualReconnecting.has(server.id) ? '重连中...' : reconnectingServers.has(server.id) ? '自动重连中...' : statusText(server.status)}
                      </span>
                      {server.error && (
                        <span className="text-[10px] text-red-400 truncate max-w-[120px]" title={server.error}>
                          {server.error}
                        </span>
                      )}
                      {resourceUsage[server.id] && (
                        <span className="text-[10px] opacity-40">
                          {(resourceUsage[server.id].memoryKb / 1024).toFixed(1)} MB · {resourceUsage[server.id].cpuPercent.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                {server.status === 'connected' && (
                  <button 
                    onClick={() => toggleLog(server.id)}
                    className={cn(
                      "p-1 text-xs rounded-md transition-colors",
                      expandedLogs.has(server.id) ? "bg-indigo-500/20 text-indigo-400" : "bg-zinc-500/10 hover:bg-zinc-500/20"
                    )}
                    title="查看日志"
                  >
                    <FileText size={12} />
                  </button>
                )}
                {onEditServer && (
                  <button 
                    onClick={() => onEditServer(server)}
                    className="p-1 text-xs rounded-md bg-zinc-500/10 hover:bg-zinc-500/20 transition-colors"
                    title="编辑"
                  >
                    <Pencil size={12} />
                  </button>
                )}
                {server.status === 'connected' && onDisconnect && (
                  <button 
                    onClick={() => onDisconnect(server.id)}
                    className="px-2 py-1 text-[10px] font-medium rounded-md bg-zinc-500/10 hover:bg-zinc-500/20 transition-colors"
                  >
                    {t.mcp.disconnect}
                  </button>
                )}
                {(server.status === 'disconnected' || server.status === 'error') && onReconnect && (
                  <button 
                    onClick={() => handleReconnect(server.id)}
                    disabled={manualReconnecting.has(server.id)}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 transition-colors",
                      manualReconnecting.has(server.id) && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <RefreshCw size={10} className={manualReconnecting.has(server.id) ? "animate-spin" : ""} />
                    {manualReconnecting.has(server.id) ? '重连中...' : '重连'}
                  </button>
                )}
                {onRemove && (
                  <button 
                    onClick={() => onRemove(server.id)}
                    className="p-1 text-xs rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                    title="删除"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>

              {server.command && (
                <div className="mb-2.5 px-2.5 py-1.5 rounded-lg bg-zinc-500/5 border border-zinc-500/10">
                  <code className="text-[11px] font-mono opacity-70 break-all">
                    {server.command} {server.args?.join(' ')}
                  </code>
                </div>
              )}

              {server.env && Object.keys(server.env).length > 0 && (
                <div className="mb-2.5 px-2.5 py-1.5 rounded-lg bg-zinc-500/5 border border-zinc-500/10">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[9px] font-medium opacity-40 uppercase tracking-wider">环境变量</span>
                    <button
                      onClick={() => toggleEnvReveal(server.id)}
                      className="p-0.5 opacity-40 hover:opacity-70 transition-opacity"
                    >
                      {revealedEnvs.has(server.id) ? <EyeOff size={9} /> : <Eye size={9} />}
                    </button>
                  </div>
                  <div className="space-y-0.5">
                    {Object.entries(server.env).map(([key, value]) => (
                      <div key={key} className="text-[11px] font-mono opacity-60">
                        <span className="text-indigo-400">{key}</span>=<span>{revealedEnvs.has(server.id) ? value : '••••••••'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {expandedLogs.has(server.id) && (
                <div className="mb-2.5 rounded-lg bg-zinc-500/5 border border-zinc-500/10 overflow-hidden">
                  <div className="flex items-center justify-between px-2.5 py-1 border-b border-zinc-500/10">
                    <span className="text-[9px] font-medium opacity-40 uppercase tracking-wider">服务器日志</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => clearLog(server.id)}
                        className="text-[9px] text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        清空
                      </button>
                      <button
                        onClick={() => toggleLog(server.id)}
                        className="p-0.5 opacity-40 hover:opacity-70 transition-opacity"
                      >
                        <X size={9} />
                      </button>
                    </div>
                  </div>
                  <pre className="px-2.5 py-1.5 text-[10px] font-mono opacity-60 max-h-32 overflow-y-auto whitespace-pre-wrap">
                    {serverLogs[server.id] || '(无日志)'}
                  </pre>
                </div>
              )}
              
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest opacity-40">{t.mcp.availableTools} ({server.tools.length})</h4>
                  <button
                    onClick={() => toggleTools(server.id)}
                    className="p-0.5 opacity-40 hover:opacity-70 transition-opacity"
                    title={expandedTools.has(server.id) ? '折叠工具' : '展开工具'}
                  >
                    {expandedTools.has(server.id) ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                </div>
                <AnimatePresence>
                  {expandedTools.has(server.id) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-2">
                        {server.tools.length === 0 && (
                          <div className="p-2.5 rounded-lg border border-dashed border-zinc-500/20 text-center">
                            <p className="text-[10px] opacity-40">{t.mcp.noTools}</p>
                          </div>
                        )}
                        {server.tools.map((tool, idx) => (
                          <div key={`${tool.name}-${idx}`} className={cn(
                            "flex items-start justify-between p-2.5 rounded-lg border border-zinc-500/10",
                            isDarkMode ? "bg-black/20" : "bg-zinc-100/80"
                          )}>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className={cn(
                                  "font-mono text-xs",
                                  isDarkMode ? "text-indigo-300" : "text-indigo-600"
                                )}>{tool.name}</span>
                                {tool.requiresAuth && (
                                  <span className="px-1 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-500 flex items-center gap-0.5">
                                    <ShieldAlert size={8} />
                                    {t.mcp.requiresAuth}
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] opacity-60 line-clamp-2">{tool.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};
