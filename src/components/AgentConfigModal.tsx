import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, Settings, Brain, Wrench, Database as DatabaseIcon, Check, Cpu, Terminal, Globe, FileCode, FolderOpen, Zap, Bot, Shield, Layout, Server, RefreshCw } from 'lucide-react';
import { NexusLogo } from './NexusLogo';
import AgentRadarChart from './AgentRadarChart';
import { cn } from '../lib/utils';
import { Agent, ModelProvider } from '../types';
import { useGlobalState } from '../context/GlobalStateContext';
import { ImageCropper } from './ImageCropper';
import { AnimatePresence, motion } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import { useTranslation } from '../hooks/useTranslation';

const ONLINE_PROVIDERS: Record<string, { url: string; models: string[]; apiKeyUrl: string; name: string }> = {
  google: {
    url: 'https://generativelanguage.googleapis.com/v1beta/models/',
    models: ['gemini-3-flash-preview', 'gemini-3.1-pro-preview'],
    apiKeyUrl: 'https://aistudio.google.com/',
    name: 'Google Gemini'
  }
};

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

interface AgentConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentId: string | null;
  agents: Agent[];
  onSave: (agent: Agent) => void;
  isDarkMode: boolean;
}

export const AgentConfigModal: React.FC<AgentConfigModalProps> = ({
  isOpen,
  onClose,
  agentId,
  agents,
  onSave,
  isDarkMode
}) => {
  const { t } = useTranslation();
  const { mcpServers } = useGlobalState();

  const AVAILABLE_TOOLS = useMemo(() => [
    { id: 'file_management', name: t.agentConfig.capabilities.toolList.file_management.name, description: t.agentConfig.capabilities.toolList.file_management.desc, icon: FileCode },
    { id: 'terminal', name: t.agentConfig.capabilities.toolList.terminal.name, description: t.agentConfig.capabilities.toolList.terminal.desc, icon: Terminal },
    { id: 'web_search', name: t.agentConfig.capabilities.toolList.web_search.name, description: t.agentConfig.capabilities.toolList.web_search.desc, icon: Globe },
    { id: 'github', name: t.agentConfig.capabilities.toolList.github.name, description: t.agentConfig.capabilities.toolList.github.desc, icon: Cpu },
  ], [t]);

  const AVAILABLE_FOLDERS = useMemo(() => [
    { id: 'folder-1', name: t.sidebar.newFolder, icon: FolderOpen },
    { id: 'folder-2', name: t.sidebar.newFolder, icon: FolderOpen },
    { id: 'folder-3', name: t.sidebar.newFolder, icon: FolderOpen },
  ], [t]);

  const [formData, setFormData] = useState<Partial<Agent>>({});
  const [showPresetAvatars, setShowPresetAvatars] = useState(false);
  const [croppingImage, setCroppingImage] = useState<string | null>(null);
  const [isManualOverride, setIsManualOverride] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [promptDescription, setPromptDescription] = useState('');

  const handleGenerateAgent = async () => {
    if (!promptDescription) return;
    setIsGenerating(true);
    setIsPromptModalOpen(false);
    try {
      let generatedData;
      
      // Model-agnostic generation logic
      if (formData.modelProvider === 'gemini') {
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `${t.agentConfig.generate.modalTitle}: ${promptDescription}`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                role: { type: Type.STRING },
                description: { type: Type.STRING },
                goal: { type: Type.STRING },
                backstory: { type: Type.STRING },
              },
              required: ["name", "role", "description", "goal", "backstory"],
            },
          },
        });
        generatedData = JSON.parse(response.text || "{}");
      } else {
        // Fallback for Ollama/LM Studio/Other
        const apiUrl = formData.apiUrl || 'http://localhost:11434';
        if (!apiUrl) {
          alert(t.settings.connectionError.replace('{error}', 'API URL is missing'));
          return;
        }
        
        // Ensure we don't double up the path
        const baseUrl = apiUrl.endsWith('/v1/chat/completions') 
          ? apiUrl 
          : `${apiUrl.replace(/\/$/, '')}/v1/chat/completions`;
        
        try {
          const response = await fetch(baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: formData.modelId || 'llama3',
              messages: [
                {
                  role: 'system',
                  content: 'You are an Agent configuration generator. Please return only a JSON object containing name, role, description, goal, backstory fields. Do not include any other explanation.'
                },
                {
                  role: 'user',
                  content: `Based on description: ${promptDescription}`
                }
              ],
              stream: false
            })
          });
          
          if (!response.ok) {
            throw new Error(`API Request Failed: ${response.statusText}`);
          }
          
          const data = await response.json();
          const content = data.choices[0].message.content;
          // Simple parsing for non-Gemini models
          const jsonMatch = content.match(/\{.*\}/s);
          generatedData = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
        } catch (fetchError) {
          console.error("Fetch error:", fetchError);
          throw new Error(t.settings.connectionError.replace('{error}', 'Network error'));
        }
      }

      setFormData(prev => ({ ...prev, ...generatedData }));
      setPromptDescription('');
    } catch (error) {
      console.error("Generate Agent failed:", error);
      alert(t.common.error);
    } finally {
      setIsGenerating(false);
    }
  };

  const generatePreviewPrompt = () => {
    return t.agentConfig.personality.systemPromptTemplate
      .replace('{name}', formData.name || 'Agent')
      .replace('{role}', formData.role || t.agentConfig.personality.defaultRole)
      .replace('{goal}', formData.goal || t.common.none)
      .replace('{backstory}', formData.backstory || t.common.none);
  };

  // Removed useEffect that caused infinite loop

  useEffect(() => {
    if (isOpen && agentId) {
      const agent = agents.find(a => a.id === agentId);
      if (agent) {
        setFormData({
          ...agent,
          temperature: agent.temperature ?? 0.7,
          modelProvider: agent.modelProvider || 'lm-studio',
          modelId: agent.modelId || '',
          tools: agent.tools || [],
          mcpServers: agent.mcpServers || [],
          enableRag: agent.enableRag || false,
          knowledgeFolders: agent.knowledgeFolders || []
        });
      }
    } else if (isOpen && !agentId) {
      // New agent
      setFormData({
        id: `agent-${Date.now()}`,
        name: '',
        role: '',
        description: '',
        goal: '',
        backstory: '',
        systemPrompt: '',
        avatar: 'Bot',
        status: 'idle',
        capabilities: [],
        themeColor: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
        temperature: 0.7,
        modelProvider: 'lm-studio',
        modelId: '',
        tools: [],
        mcpServers: [],
        enableRag: false,
        knowledgeFolders: []
      });
    }
  }, [isOpen, agentId, agents]);

  if (!isOpen) return null;

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCroppingImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    let newFormData = { ...formData };

    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      newFormData = { ...newFormData, [name]: checked };
    } else if (type === 'range') {
      newFormData = { ...newFormData, [name]: parseFloat(value) };
    } else {
      newFormData = { ...newFormData, [name]: value };
    }

    // Auto-update systemPrompt if not manually overridden
    if (!isManualOverride && ['name', 'role', 'goal', 'backstory'].includes(name)) {
      newFormData.systemPrompt = t.agentConfig.personality.systemPromptTemplate
        .replace('{name}', newFormData.name || 'Agent')
        .replace('{role}', newFormData.role || t.agentConfig.personality.defaultRole)
        .replace('{goal}', newFormData.goal || t.common.none)
        .replace('{backstory}', newFormData.backstory || t.common.none);
    }

    setFormData(newFormData);
  };

  const handleToolToggle = (toolId: string) => {
    setFormData(prev => {
      const currentTools = prev.tools || [];
      if (currentTools.includes(toolId)) {
        return { ...prev, tools: currentTools.filter(id => id !== toolId) };
      } else {
        return { ...prev, tools: [...currentTools, toolId] };
      }
    });
  };

  const handleMcpServerToggle = (serverId: string) => {
    setFormData(prev => {
      const currentServers = prev.mcpServers || [];
      if (currentServers.includes(serverId)) {
        return { ...prev, mcpServers: currentServers.filter(id => id !== serverId) };
      } else {
        return { ...prev, mcpServers: [...currentServers, serverId] };
      }
    });
  };

  const handleFolderToggle = (folderId: string) => {
    setFormData(prev => {
      const currentFolders = prev.knowledgeFolders || [];
      if (currentFolders.includes(folderId)) {
        return { ...prev, knowledgeFolders: currentFolders.filter(id => id !== folderId) };
      } else {
        return { ...prev, knowledgeFolders: [...currentFolders, folderId] };
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.id && formData.name && formData.role) {
      onSave(formData as Agent);
      onClose();
    }
  };

  const inputClass = cn(
    "w-full px-4 py-3 rounded-xl border transition-all duration-300 outline-none font-medium",
    isDarkMode 
      ? "bg-zinc-700/50 border-zinc-600 focus:border-blue-500/50 focus:bg-zinc-700 focus:ring-4 focus:ring-blue-500/10 text-zinc-100 placeholder:text-zinc-600" 
      : "bg-zinc-50 border-zinc-200 focus:border-blue-500/50 focus:bg-white focus:ring-4 focus:ring-blue-500/10 text-zinc-900 placeholder:text-zinc-400"
  );

  const labelClass = "text-xs font-bold uppercase tracking-wider mb-2 block opacity-70";

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-md">
        <div 
          className={cn(
            "w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] relative",
            isDarkMode ? "bg-zinc-800 border border-zinc-600/80" : "bg-white border border-zinc-200"
          )}
        >
        {/* Header */}
        <div className={cn(
          "flex items-center justify-between p-6 border-b shrink-0 relative overflow-hidden",
          isDarkMode ? "border-zinc-600/80 bg-zinc-700/30" : "border-zinc-200 bg-zinc-50/50"
        )}>
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500 opacity-80" />
          <div className="flex items-center gap-4">
            <div className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center border",
              isDarkMode ? "bg-zinc-700 border-zinc-600 text-blue-400" : "bg-white border-zinc-200 text-blue-500"
            )}>
              <Zap size={24} className={agentId ? "text-amber-500" : "text-blue-500"} />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">
                {agentId ? t.agentConfig.editAgent : t.agentConfig.newAgent}
              </h2>
              <p className="text-sm opacity-60 mt-0.5">
                {agentId ? t.agentConfig.editAgent : t.agentConfig.newAgent}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className={cn(
              "p-2.5 rounded-xl transition-all duration-200",
              isDarkMode ? "hover:bg-zinc-700 text-zinc-400 hover:text-white" : "hover:bg-zinc-200 text-zinc-500 hover:text-zinc-900"
            )}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-12 custom-scrollbar">
          <form id="agent-config-form" onSubmit={handleSubmit} className="space-y-12">
            
            {/* Section 1: General */}
            <section className="space-y-6">
              <div className="flex items-center justify-between border-b pb-4 border-zinc-200 dark:border-zinc-600/80">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 text-blue-500 rounded-xl">
                    <Settings size={20} />
                  </div>
                  <h3 className="text-lg font-bold tracking-tight">{t.agentConfig.tabs.basic}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPromptModalOpen(true)}
                  disabled={isGenerating}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition-all disabled:opacity-50"
                >
                  {isGenerating ? <RefreshCw size={16} className="animate-spin" /> : <Bot size={16} />}
                  {isGenerating ? t.agentConfig.generate.generating : t.agentConfig.generate.btn}
                </button>
              </div>
              
              <div className="flex flex-col md:flex-row gap-6">
                {/* Left: Avatar */}
                <div className="w-full md:w-48 shrink-0 flex flex-col">
                  <label className={labelClass}>{t.agentConfig.basic.avatar}</label>
                  <div className={cn(
                    "relative aspect-square w-full rounded-2xl border flex items-center justify-center text-6xl transition-colors group",
                    isDarkMode ? "bg-zinc-700 border-zinc-600 text-zinc-400" : "bg-zinc-50 border-zinc-200 text-zinc-400"
                  )}>
                    {formData.avatar && formData.avatar.startsWith('data:image') ? (
                      <img src={formData.avatar} alt="Avatar" className="w-full h-full object-cover rounded-2xl" />
                    ) : (
                      <>
                        {formData.avatar === 'Bot' && <Bot size={64} />}
                        {formData.avatar === 'Cpu' && <Cpu size={64} />}
                        {formData.avatar === 'NexusLogo' && <NexusLogo size={64} />}
                        {formData.avatar === 'Database' && <DatabaseIcon size={64} />}
                        {formData.avatar === 'Globe' && <Globe size={64} />}
                        {formData.avatar === 'Shield' && <Shield size={64} />}
                        {formData.avatar === 'Layout' && <Layout size={64} />}
                        {formData.avatar === 'Terminal' && <Terminal size={64} />}
                        {!['Bot', 'Cpu', 'NexusLogo', 'Database', 'Globe', 'Shield', 'Layout', 'Terminal'].includes(formData.avatar || '') && <Bot size={64} />}
                      </>
                    )}

                    {/* Hidden file input for custom avatar */}
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      title="点击上传自定义头像"
                      onChange={handleAvatarUpload}
                    />

                    {/* Preset selection button */}
                    <button 
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowPresetAvatars(!showPresetAvatars); }}
                      className="absolute bottom-2 right-2 p-2 rounded-xl bg-blue-500 text-white shadow-lg hover:bg-blue-600 transition-colors z-20"
                    >
                      <Layout size={16} />
                    </button>

                    {/* Preset avatars popover */}
                    {showPresetAvatars && (
                      <div className="absolute bottom-12 right-0 p-2 bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-xl shadow-xl z-30 grid grid-cols-3 gap-2 w-48">
                        {['Bot', 'Cpu', 'NexusLogo', 'Database', 'Globe', 'Shield', 'Layout', 'Terminal'].map(icon => (
                          <button
                            key={icon}
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setFormData(prev => ({ ...prev, avatar: icon }));
                              setShowPresetAvatars(false);
                            }}
                            className={cn(
                              "p-2 rounded-lg flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-600 transition-colors",
                              formData.avatar === icon ? "bg-blue-50 dark:bg-blue-900/20 text-blue-500" : "text-zinc-500 dark:text-zinc-400"
                            )}
                          >
                            {icon === 'Bot' && <Bot size={20} />}
                            {icon === 'Cpu' && <Cpu size={20} />}
                            {icon === 'NexusLogo' && <NexusLogo size={20} />}
                            {icon === 'Database' && <DatabaseIcon size={20} />}
                            {icon === 'Globe' && <Globe size={20} />}
                            {icon === 'Shield' && <Shield size={20} />}
                            {icon === 'Layout' && <Layout size={20} />}
                            {icon === 'Terminal' && <Terminal size={20} />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Name, Role, Parent, Goal */}
                <div className="flex-1 flex flex-col justify-between">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div>
                      <label className={labelClass}>{t.agentConfig.basic.name}</label>
                      <input
                        type="text"
                        name="name"
                        value={formData.name || ''}
                        onChange={handleChange}
                        required
                        className={inputClass}
                        placeholder={t.agentConfig.basic.name}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>{t.agentConfig.basic.role}</label>
                      <input
                        type="text"
                        name="role"
                        value={formData.role || ''}
                        onChange={handleChange}
                        required
                        className={inputClass}
                        placeholder={t.agentConfig.basic.role}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>{t.sidebar.agents}</label>
                      <select
                        name="parentId"
                        value={formData.parentId || ''}
                        onChange={handleChange}
                        className={inputClass}
                      >
                        <option value="">{t.common.none}</option>
                        {agents.filter(a => a.id !== formData.id).map(a => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>{t.agentConfig.personality.goal}</label>
                    <textarea
                      name="goal"
                      value={formData.goal || ''}
                      onChange={handleChange}
                      rows={2}
                      className={cn(inputClass, "resize-none")}
                      placeholder={t.agentConfig.personality.goalPlaceholder}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className={labelClass}>{t.agentConfig.personality.backstory}</label>
                <textarea
                  name="backstory"
                  value={formData.backstory || ''}
                  onChange={handleChange}
                  rows={3}
                  className={cn(inputClass, "resize-none")}
                  placeholder={t.agentConfig.personality.backstoryPlaceholder}
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className={labelClass}>{t.toolPanel.params.systemPrompt}</label>
                  <button
                    type="button"
                    onClick={() => setIsManualOverride(!isManualOverride)}
                    title={isManualOverride ? t.common.confirm : t.common.edit}
                    className={cn(
                      "text-xs font-bold px-3 py-1 rounded-md transition-all flex items-center gap-1.5",
                      isManualOverride 
                        ? "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20" 
                        : "bg-zinc-500/10 text-zinc-500 hover:bg-zinc-500/20"
                    )}
                  >
                    {isManualOverride ? <Check size={12} /> : <Settings size={12} />}
                    {isManualOverride ? t.common.confirm : t.common.edit}
                  </button>
                </div>
                <textarea
                  name="systemPrompt"
                  value={formData.systemPrompt || ''}
                  onChange={handleChange}
                  rows={4}
                  readOnly={!isManualOverride}
                  className={cn(inputClass, "resize-none", !isManualOverride && "opacity-70 cursor-not-allowed")}
                  placeholder={t.toolPanel.params.promptPlaceholder}
                />
              </div>
            </section>

            {/* Section 2: Brain */}
            <section className="space-y-6">
              <div className="flex items-center gap-3 border-b pb-4 border-zinc-200 dark:border-zinc-600/80">
                <div className="p-2 bg-purple-500/10 text-purple-500 rounded-xl">
                  <Brain size={20} />
                </div>
                <h3 className="text-lg font-bold tracking-tight">{t.agentConfig.tabs.brain}</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div>
                    <label className={labelClass}>{t.agentConfig.model.provider}</label>
                    <div className="flex gap-2 p-1 bg-zinc-100 dark:bg-zinc-700/50 rounded-xl">
                      {['ollama', 'lm-studio', 'online'].map(provider => (
                        <button
                          key={provider}
                          type="button"
                          onClick={() => {
                            const newProvider = provider;
                            setFormData(prev => {
                              const updates: Partial<Agent> = { modelProvider: newProvider };
                              if (newProvider === 'online') {
                                const onlineProv = prev.onlineProvider || 'google';
                                updates.onlineProvider = onlineProv;
                                updates.apiUrl = prev.apiUrl || ONLINE_PROVIDERS[onlineProv].url;
                                updates.modelId = prev.modelId || ONLINE_PROVIDERS[onlineProv].models[0];
                              } else if (newProvider === 'ollama') {
                                updates.apiUrl = prev.apiUrl || 'http://localhost:11434/api/chat';
                              } else if (newProvider === 'lm-studio') {
                                updates.apiUrl = prev.apiUrl || 'http://localhost:1234/v1/chat/completions';
                              }
                              return { ...prev, ...updates };
                            });
                          }}
                          className={cn(
                            "flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200",
                            formData.modelProvider === provider 
                              ? "bg-white dark:bg-zinc-600 shadow-sm text-zinc-900 dark:text-zinc-100" 
                              : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                          )}
                        >
                          {provider === 'ollama' ? 'Ollama' : provider === 'lm-studio' ? 'LM Studio' : t.agentConfig.model.providerOnline}
                        </button>
                      ))}
                    </div>
                  </div>

                  {formData.modelProvider === 'online' && (
                    <div className="space-y-4">
                      <div>
                        <label className={labelClass}>{t.agentConfig.model.provider}</label>
                        <select
                          value={formData.onlineProvider || 'google'}
                          onChange={(e) => {
                            const provider = e.target.value;
                            const providerData = ONLINE_PROVIDERS[provider];
                            setFormData(prev => ({
                              ...prev,
                              onlineProvider: provider,
                              apiUrl: providerData.url,
                              modelId: providerData.models[0]
                            }));
                          }}
                          className={inputClass}
                        >
                          {Object.entries(ONLINE_PROVIDERS).map(([key, data]) => (
                            <option key={key} value={key}>{data.name}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                        <label className={labelClass}>{t.agentConfig.model.apiUrl}</label>
                        <input
                          type="text"
                          name="apiUrl"
                          value={formData.apiUrl || ONLINE_PROVIDERS[formData.onlineProvider || 'google'].url}
                          onChange={handleChange}
                          className={inputClass}
                          placeholder={t.agentConfig.model.apiUrl}
                        />
                      </div>

                      <div>
                        <label className={labelClass}>{t.agentConfig.model.apiKey}</label>
                        <div className="flex gap-2">
                          <input
                            type="password"
                            name="apiKey"
                            value={formData.apiKey || ''}
                            onChange={handleChange}
                            className={cn(inputClass, "flex-1")}
                            placeholder={t.agentConfig.model.apiKey}
                          />
                          <a
                            href={ONLINE_PROVIDERS[formData.onlineProvider || 'google'].apiKeyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-3 bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-300 rounded-xl font-medium transition-colors whitespace-nowrap flex items-center justify-center"
                          >
                            {t.common.edit}
                          </a>
                        </div>
                      </div>

                      <div>
                        <label className={labelClass}>{t.agentConfig.model.modelName}</label>
                        <div className="flex gap-2">
                          <select
                            name="modelId"
                            value={formData.modelId || ''}
                            onChange={handleChange}
                            className={cn(inputClass, "w-1/2")}
                          >
                            {ONLINE_PROVIDERS[formData.onlineProvider || 'google'].models.map(model => (
                              <option key={model} value={model}>{model}</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            name="modelId"
                            value={formData.modelId || ''}
                            onChange={handleChange}
                            className={cn(inputClass, "w-1/2")}
                            placeholder={t.agentConfig.model.modelName}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {formData.modelProvider !== 'online' && (
                    <div className="space-y-4">
                      <div>
                        <label className={labelClass}>{t.agentConfig.model.apiUrl}</label>
                        <input
                          type="text"
                          name="apiUrl"
                          value={formData.apiUrl || (formData.modelProvider === 'ollama' ? 'http://localhost:11434/api/chat' : 'http://localhost:1234/v1/chat/completions')}
                          onChange={handleChange}
                          className={inputClass}
                          placeholder={t.agentConfig.model.apiUrl}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>{t.agentConfig.model.modelName}</label>
                        <input
                          type="text"
                          name="modelId"
                          value={formData.modelId || ''}
                          onChange={handleChange}
                          className={inputClass}
                          placeholder={t.agentConfig.model.modelName}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="pt-6">
                    <AgentRadarChart 
                      temperature={formData.temperature || 0.7}
                      toolsCount={(formData.tools?.length || 0) + (formData.mcpServers?.length || 0)}
                      knowledgeFoldersCount={formData.knowledgeFolders?.length || 0}
                      backstoryLength={formData.backstory?.length || 0}
                      isDarkMode={isDarkMode}
                    />
                  </div>

                  <div className="flex justify-between items-center">
                    <label className={cn(labelClass, "mb-0")}>{t.toolPanel.params.temperature}</label>
                    <span className="text-sm font-mono bg-purple-500/10 text-purple-500 px-2.5 py-1 rounded-lg font-bold">
                      {formData.temperature?.toFixed(2) || '0.70'}
                    </span>
                  </div>
                  <input
                    type="range"
                    name="temperature"
                    min="0"
                    max="1"
                    step="0.05"
                    value={formData.temperature || 0.7}
                    onChange={handleChange}
                    className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer dark:bg-zinc-700 accent-purple-500"
                  />
                  <div className="flex justify-between text-xs opacity-50 font-medium">
                    <span>0.0 ({t.toolPanel.params.tempPrecise})</span>
                    <span>1.0 ({t.toolPanel.params.tempCreative})</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 3: Capabilities */}
            <section className="space-y-6">
              <div className="flex items-center gap-3 border-b pb-4 border-zinc-200 dark:border-zinc-600/80">
                <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-xl">
                  <Wrench size={20} />
                </div>
                <h3 className="text-lg font-bold tracking-tight">{t.agentConfig.tabs.capabilities}</h3>
              </div>
              
              <div>
                <label className={labelClass}>{t.agentConfig.capabilities.tools}</label>
                <p className="text-xs opacity-50 mb-4 font-medium">{t.agentConfig.capabilities.toolsDesc}</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {AVAILABLE_TOOLS.map((tool, idx) => {
                    const isSelected = formData.tools?.includes(tool.id);
                    const ToolIcon = tool.icon;
                    return (
                      <div 
                        key={`${tool.id}-${idx}`}
                        onClick={() => handleToolToggle(tool.id)}
                        className={cn(
                          "relative overflow-hidden flex items-start gap-4 p-4 rounded-2xl border cursor-pointer transition-all duration-300 group",
                          isSelected 
                            ? (isDarkMode ? "bg-emerald-500/10 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.1)]" : "bg-emerald-50 border-emerald-300 shadow-sm") 
                            : (isDarkMode ? "bg-zinc-700/50 border-zinc-600 hover:border-zinc-600 hover:bg-zinc-700/50" : "bg-white border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50")
                        )}
                      >
                        <div className={cn(
                          "mt-0.5 shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border transition-colors duration-300",
                          isSelected
                            ? "bg-emerald-500 border-emerald-500 text-white"
                            : (isDarkMode ? "bg-zinc-700 border-zinc-600 text-zinc-400" : "bg-zinc-100 border-zinc-200 text-zinc-500")
                        )}>
                          <ToolIcon size={20} />
                        </div>
                        <div className="flex-1">
                          <div className={cn("text-sm font-bold mb-1 transition-colors", isSelected ? "text-emerald-600 dark:text-emerald-400" : "")}>
                            {tool.name}
                          </div>
                          <div className="text-xs opacity-60 leading-relaxed font-medium">{tool.description}</div>
                        </div>
                        
                        {/* Checkmark indicator */}
                        <div className={cn(
                          "absolute top-4 right-4 w-5 h-5 rounded-full border flex items-center justify-center transition-all duration-300",
                          isSelected 
                            ? "bg-emerald-500 border-emerald-500 text-white scale-100 opacity-100" 
                            : "border-zinc-300 dark:border-zinc-600 scale-90 opacity-50"
                        )}>
                          {isSelected && <Check size={12} strokeWidth={3} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {mcpServers.length > 0 && (
                <div>
                  <label className={labelClass}>{t.agentConfig.capabilities.mcp}</label>
                  <p className="text-xs opacity-50 mb-4 font-medium">{t.agentConfig.capabilities.mcpDesc}</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {mcpServers.map((server, idx) => {
                      const isSelected = formData.mcpServers?.includes(server.id);
                      return (
                        <div 
                          key={`${server.id}-${idx}`}
                          onClick={() => handleMcpServerToggle(server.id)}
                          className={cn(
                            "relative overflow-hidden flex items-start gap-4 p-4 rounded-2xl border cursor-pointer transition-all duration-300 group",
                            isSelected 
                              ? (isDarkMode ? "bg-emerald-500/10 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.1)]" : "bg-emerald-50 border-emerald-300 shadow-sm") 
                              : (isDarkMode ? "bg-zinc-700/50 border-zinc-600 hover:border-zinc-600 hover:bg-zinc-700/50" : "bg-white border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50")
                          )}
                        >
                          <div className={cn(
                            "mt-0.5 shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border transition-colors duration-300",
                            isSelected
                              ? "bg-emerald-500 border-emerald-500 text-white"
                              : (isDarkMode ? "bg-zinc-700 border-zinc-600 text-zinc-400" : "bg-zinc-100 border-zinc-200 text-zinc-500")
                          )}>
                            <Server size={20} />
                          </div>
                          <div className="flex-1">
                            <div className={cn("text-sm font-bold mb-1 transition-colors", isSelected ? "text-emerald-600 dark:text-emerald-400" : "")}>
                              {server.name}
                            </div>
                            <div className="text-xs opacity-60 leading-relaxed font-medium">
                              {server.tools.length} 个可用工具
                            </div>
                          </div>
                          
                          {/* Checkmark indicator */}
                          <div className={cn(
                            "absolute top-4 right-4 w-5 h-5 rounded-full border flex items-center justify-center transition-all duration-300",
                            isSelected 
                              ? "bg-emerald-500 border-emerald-500 text-white scale-100 opacity-100" 
                              : "border-zinc-300 dark:border-zinc-600 scale-90 opacity-50"
                          )}>
                            {isSelected && <Check size={12} strokeWidth={3} />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            {/* Section 4: Memory */}
            <section className="space-y-6">
              <div className="flex items-center gap-3 border-b pb-4 border-zinc-200 dark:border-zinc-600/80">
                <div className="p-2 bg-amber-500/10 text-amber-500 rounded-xl">
                  <DatabaseIcon size={20} />
                </div>
                <h3 className="text-lg font-bold tracking-tight">{t.agentConfig.memory.title}</h3>
              </div>

              <div className={cn(
                "flex items-center justify-between p-5 rounded-2xl border transition-colors",
                isDarkMode ? "bg-zinc-700/50 border-zinc-600" : "bg-zinc-50 border-zinc-200"
              )}>
                <div>
                  <div className="text-sm font-bold">{t.agentConfig.memory.enableRag}</div>
                  <div className="text-xs opacity-60 mt-1 font-medium">{t.agentConfig.memory.enableRagDesc}</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    name="enableRag"
                    checked={formData.enableRag || false}
                    onChange={handleChange}
                    className="sr-only peer" 
                  />
                  <div className="w-12 h-6 bg-zinc-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-zinc-600 peer-checked:bg-amber-500"></div>
                </label>
              </div>

              <div>
                <label className={labelClass}>{t.agentConfig.memory.folders}</label>
                <p className="text-xs opacity-50 mb-4 font-medium">{t.agentConfig.memory.foldersDesc}</p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {AVAILABLE_FOLDERS.map(folder => {
                    const isSelected = formData.knowledgeFolders?.includes(folder.id);
                    return (
                      <label 
                        key={folder.id}
                        className={cn(
                          "flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all duration-200",
                          isSelected
                            ? (isDarkMode ? "bg-amber-500/10 border-amber-500/50" : "bg-amber-50 border-amber-300")
                            : (isDarkMode ? "bg-zinc-700/50 border-zinc-600 hover:border-zinc-600" : "bg-white border-zinc-200 hover:border-zinc-300")
                        )}
                      >
                        <div className={cn(
                          "w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors",
                          isSelected 
                            ? "bg-amber-500 border-amber-500 text-white" 
                            : (isDarkMode ? "border-zinc-600 bg-zinc-700" : "border-zinc-300 bg-white")
                        )}>
                          {isSelected && <Check size={14} strokeWidth={3} />}
                        </div>
                        <div className="flex items-center gap-2 overflow-hidden">
                          <folder.icon size={16} className={isSelected ? "text-amber-500" : "text-zinc-500"} />
                          <span className={cn("text-sm font-medium truncate", isSelected ? (isDarkMode ? "text-amber-400" : "text-amber-700") : "")}>
                            {folder.name}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </section>

          </form>
        </div>

        {/* Footer */}
        <div className={cn(
          "flex items-center justify-end gap-3 p-6 border-t shrink-0 relative",
          isDarkMode ? "border-zinc-600/80 bg-zinc-700/30" : "border-zinc-200 bg-zinc-50/50"
        )}>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "px-6 py-2.5 rounded-xl font-bold transition-all duration-200",
              isDarkMode 
                ? "hover:bg-zinc-700 text-zinc-400 hover:text-white" 
                : "hover:bg-zinc-200 text-zinc-600 hover:text-zinc-900"
            )}
          >
            取消
          </button>
          <button
            type="submit"
            form="agent-config-form"
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all duration-200 shadow-[0_0_15px_rgba(37,99,235,0.3)] hover:shadow-[0_0_20px_rgba(59,130,246,0.5)]"
          >
            <Save size={18} />
            保存配置
          </button>
        </div>
      </div>
      </div>

      <AnimatePresence>
        {croppingImage && (
          <ImageCropper
            image={croppingImage}
            aspect={1}
            isDarkMode={isDarkMode}
            onCropComplete={(croppedImage) => {
              setFormData(prev => ({ ...prev, avatar: croppedImage }));
              setCroppingImage(null);
            }}
            onCancel={() => setCroppingImage(null)}
          />
        )}
        {isPromptModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white dark:bg-zinc-700 rounded-2xl p-6 w-full max-w-md shadow-2xl"
            >
              <h3 className="text-lg font-bold mb-4">AI 自动生成 Agent</h3>
              <textarea
                value={promptDescription}
                onChange={(e) => setPromptDescription(e.target.value)}
                placeholder="请输入您想生成的 Agent 描述，例如：一个擅长编写 Python 代码的助手..."
                className="w-full h-32 p-3 rounded-lg border border-zinc-200 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-700 mb-4"
              />
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setIsPromptModalOpen(false)}
                  className="px-4 py-2 text-sm font-bold text-zinc-500 hover:text-zinc-700"
                >
                  取消
                </button>
                <button
                  onClick={handleGenerateAgent}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-500"
                >
                  开始生成
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
