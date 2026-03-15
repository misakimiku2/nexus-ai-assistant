import React, { useState } from 'react';
import { cn } from '../lib/utils';
import { AGENTS } from '../data/agents';
import { Bot, Cpu, Database, Globe, Shield, Layout, Terminal, Activity, Zap, MessageSquare, Plus, Server } from 'lucide-react';
import { NexusLogo } from './NexusLogo';
import { useGlobalState } from '../context/GlobalStateContext';
import { AgentConfigModal } from './AgentConfigModal';
import { Agent } from '../types';

interface AgentClusterViewProps {
  isDarkMode: boolean;
  onStartChatWithAgent: (agentId: string) => void;
}

const iconMap: Record<string, React.ElementType> = {
  Cpu,
  NexusLogo,
  Database,
  Globe,
  Shield,
  Layout,
  Terminal,
  Bot
};

const TOOL_NAMES: Record<string, string> = {
  'file_management': '文件管理',
  'terminal': '终端执行',
  'web_search': '网络搜索',
  'github': 'GitHub 集成'
};

export const AgentClusterView: React.FC<AgentClusterViewProps> = ({ isDarkMode, onStartChatWithAgent }) => {
  const { agents, addAgent, updateAgent, mcpServers } = useGlobalState();
  const [configuringAgentId, setConfiguringAgentId] = useState<string | null>(null);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);

  const displayAgents = agents && agents.length > 0 ? agents : AGENTS;
  
  // Find main agents (those without parentId)
  const mainAgents = displayAgents.filter(a => !a.parentId);
  
  // Find children for a given parent
  const getChildren = (parentId: string) => displayAgents.filter(a => a.parentId === parentId);

  const handleConfigureAgent = (agentId: string) => {
    setConfiguringAgentId(agentId);
    setIsConfigModalOpen(true);
  };

  const handleAddAgentCluster = () => {
    setConfiguringAgentId(null);
    setIsConfigModalOpen(true);
  };

  const handleSaveAgent = (agent: Agent) => {
    if (configuringAgentId) {
      updateAgent(agent.id, agent);
    } else {
      addAgent(agent);
    }
  };

  const renderAgentCard = (agent: any, isChild: boolean = false) => {
    const Icon = iconMap[agent.avatar] || Bot;
    const children = getChildren(agent.id);
    const isExpanded = expandedAgentId === agent.id;

    return (
      <div key={agent.id} className="flex flex-col gap-4">
        <div 
          className={cn(
            "relative group rounded-2xl border p-6 transition-all duration-300 hover:shadow-xl cursor-pointer",
            isDarkMode 
              ? "bg-zinc-700/50 border-zinc-600 hover:border-zinc-500" 
              : "bg-white border-zinc-200 hover:border-zinc-300",
            isChild && "ml-8 scale-95"
          )}
          onClick={() => {
            if (!isChild && children.length > 0) {
              setExpandedAgentId(isExpanded ? null : agent.id);
            }
          }}
        >
          <div className="flex justify-between items-start mb-4">
            <div className={cn(
              "rounded-xl border overflow-hidden shrink-0 flex items-center justify-center", 
              agent.themeColor,
              agent.avatar?.startsWith('data:image') ? "w-12 h-12 p-0" : "w-12 h-12 p-3"
            )}>
              {agent.avatar?.startsWith('data:image') ? (
                <img src={agent.avatar} alt={agent.name} className="w-full h-full object-cover rounded-xl" />
              ) : (
                <Icon size={24} />
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                {agent.status}
              </span>
              <div className="relative flex h-3 w-3">
                {agent.status === 'working' && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span className={cn(
                  "relative inline-flex rounded-full h-3 w-3",
                  agent.status === 'working' ? "bg-emerald-500" : 
                  agent.status === 'idle' ? "bg-blue-500" : "bg-zinc-500"
                )}></span>
              </div>
            </div>
          </div>

          <h3 className="text-xl font-semibold mb-1">{agent.name}</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium mb-3">{agent.role}</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-300 mb-6 line-clamp-2">
            {agent.description}
          </p>

          <div className="flex flex-wrap gap-2 mb-6">
            {(agent.tools && agent.tools.length > 0 ? agent.tools : agent.capabilities || []).map((item: string, idx: number) => (
              <span 
                key={`${item}-${idx}`} 
                className={cn(
                  "text-xs px-2 py-1 rounded-md border",
                  isDarkMode ? "bg-zinc-700 border-zinc-600 text-zinc-300" : "bg-zinc-100 border-zinc-200 text-zinc-700"
                )}
              >
                {TOOL_NAMES[item] || item}
              </span>
            ))}
            {agent.mcpServers?.map((serverId: string) => {
              const server = mcpServers.find(s => s.id === serverId);
              return (
                <span 
                  key={serverId} 
                  className={cn(
                    "text-xs px-2 py-1 rounded-md border flex items-center gap-1",
                    isDarkMode ? "bg-emerald-900/30 border-emerald-800 text-emerald-400" : "bg-emerald-100 border-emerald-200 text-emerald-700"
                  )}
                >
                  <Server size={10} />
                  {server ? server.name : serverId}
                </span>
              );
            })}
          </div>

          <div className="flex gap-3 mt-auto">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onStartChatWithAgent(agent.id);
              }}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors",
                isDarkMode 
                  ? "bg-zinc-700 hover:bg-zinc-600 text-zinc-200" 
                  : "bg-zinc-100 hover:bg-zinc-200 text-zinc-800"
              )}
            >
              <MessageSquare size={16} />
              发起对话
            </button>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                handleConfigureAgent(agent.id);
              }}
              className={cn(
                "p-2 rounded-lg transition-colors",
                isDarkMode 
                  ? "bg-zinc-700 hover:bg-zinc-600 text-zinc-400 hover:text-zinc-200" 
                  : "bg-zinc-100 hover:bg-zinc-200 text-zinc-500 hover:text-zinc-800"
              )}
              title="配置 Agent"
            >
              <Zap size={16} />
            </button>
          </div>
          
          {!isChild && children.length > 0 && (
            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-blue-600 text-white text-[10px] rounded-full font-bold uppercase tracking-tighter shadow-lg">
              {isExpanded ? "点击收起集群" : `点击展开集群 (${children.length})`}
            </div>
          )}
        </div>

        {isExpanded && children.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pl-4 border-l-2 border-blue-500/30 ml-6 animate-in slide-in-from-top-4 duration-300">
            {children.map(child => renderAgentCard(child, true))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={cn(
      "flex-1 w-full overflow-y-auto p-6 md:p-10 scroll-smooth",
      isDarkMode ? "bg-zinc-800" : "bg-zinc-50"
    )}>
      <div className="max-w-6xl mx-auto pb-20">
        <div className="flex items-center justify-between mb-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                <Activity size={24} />
              </div>
              <h1 className="text-3xl font-bold tracking-tight">AI Agent 集群</h1>
            </div>
            <p className="text-zinc-500 dark:text-zinc-400 max-w-2xl">
              Nexus 核心代理集群。点击主 Agent 可展开集群层级关系，查看子 Agent 专家模型。
            </p>
          </div>
          <button
            onClick={handleAddAgentCluster}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm"
          >
            <Plus size={18} />
            添加 Agent 集群
          </button>
        </div>

        <div className="grid grid-cols-1 gap-8">
          {mainAgents.map(agent => renderAgentCard(agent))}
        </div>
      </div>

      <AgentConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        agentId={configuringAgentId}
        agents={displayAgents}
        onSave={handleSaveAgent}
        isDarkMode={isDarkMode}
      />
    </div>
  );
};
