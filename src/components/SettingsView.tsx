import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, Save, RotateCcw, CheckCircle2, XCircle, RefreshCw, Activity, X, Database, Server, Globe, UploadCloud, FileText, User, Languages, Type, MessageSquare, Camera, Mic, Cpu, Minimize2, Power } from 'lucide-react';
import { NexusLogo } from './NexusLogo';
import { useGlobalState } from '../context/GlobalStateContext';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';
import { ImageCropper } from './ImageCropper';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { VoiceSettings } from './VoiceSettings';

const CapabilitiesRadarChart = ({ temperature, toolsCount, contextWindow, ragFilesCount }: { temperature: number, toolsCount: number, contextWindow: number, ragFilesCount: number }) => {
  const data = [
    { subject: 'Intelligence', A: Math.max(0, 1 - temperature), fullMark: 1 },
    { subject: 'Tools', A: Math.min(toolsCount / 10, 1), fullMark: 1 },
    { subject: 'Memory', A: Math.min(contextWindow / 128000, 1), fullMark: 1 },
    { subject: 'Knowledge', A: Math.min(ragFilesCount / 20, 1), fullMark: 1 },
  ];

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
          <PolarGrid stroke="#71717a" />
          <PolarAngleAxis dataKey="subject" tick={{ fill: '#a1a1aa', fontSize: 12 }} />
          <PolarRadiusAxis angle={30} domain={[0, 1]} tick={false} axisLine={false} />
          <Radar
            name="Capabilities"
            dataKey="A"
            stroke="#6366f1"
            strokeWidth={2}
            fill="#6366f1"
            fillOpacity={0.2}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};

interface SettingsViewProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  lmStudioUrl: string;
  setLmStudioUrl: (url: string) => void;
  ollamaUrl: string;
  setOllamaUrl: (url: string) => void;
  modelName: string;
  setModelName: (name: string) => void;
  maxContextLength: number;
  setMaxContextLength: (length: number) => void;
  temperature: number;
  setTemperature: (temp: number) => void;
  systemPrompt: string;
  setSystemPrompt: (prompt: string) => void;
  modelProvider: ModelProvider;
  setModelProvider: (provider: ModelProvider) => void;
  onReset: () => void;
}

type SettingsCategory = 'ai-models' | 'rag' | 'user-settings' | 'voice';
export type ModelProvider = 'lm-studio' | 'ollama' | 'online';

export const SettingsView: React.FC<SettingsViewProps> = ({
  isOpen,
  onClose,
  isDarkMode,
  lmStudioUrl,
  setLmStudioUrl,
  ollamaUrl,
  setOllamaUrl,
  modelName,
  setModelName,
  maxContextLength,
  setMaxContextLength,
  temperature,
  setTemperature,
  systemPrompt,
  setSystemPrompt,
  modelProvider,
  setModelProvider,
  onReset
}) => {
  const { 
    addLog,
    userName, setUserName,
    aiName, setAiName,
    userAvatar, setUserAvatar,
    aiAvatar, setAiAvatar,
    language, setLanguage,
    fontFamily, setFontFamily,
    closeWindowAskEveryTime, setCloseWindowAskEveryTime,
    closeWindowAction, setCloseWindowAction
  } = useGlobalState();
  const { t } = useTranslation();
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('user-settings');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [onlineApiKey, setOnlineApiKey] = useState('');
  const [onlineProvider, setOnlineProvider] = useState<string>('google');
  const [onlineModel, setOnlineModel] = useState<string>('gemini-3-flash-preview');
  
  const onlineProviders = {
    google: { name: 'Google', logo: 'https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg', models: ['gemini-3-flash-preview', 'gemini-3.1-pro-preview'], apiKeyUrl: 'https://aistudio.google.com/app/apikey' },
    openai: { name: 'OpenAI', logo: 'https://upload.wikimedia.org/wikipedia/commons/0/04/ChatGPT_logo.svg', models: ['gpt-4o', 'gpt-4o-2024-11-20', 'o1', 'o3-mini'], apiKeyUrl: 'https://platform.openai.com/api-keys' },
    anthropic: { name: 'Anthropic', logo: 'https://www.anthropic.com/favicon.ico', models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'], apiKeyUrl: 'https://console.anthropic.com/settings/keys' },
    alibaba: { name: 'Alibaba (Qwen)', logo: 'https://qwenlm.github.io/images/logo.png', models: ['qwen-max-2025-01-25', 'qwen-plus-2025-01-25', 'qwen-turbo-2025-01-25'], apiKeyUrl: 'https://dashscope.console.aliyun.com/apiKey' },
    deepseek: { name: 'DeepSeek', logo: 'https://www.deepseek.com/favicon.ico', models: ['deepseek-chat', 'deepseek-reasoner'], apiKeyUrl: 'https://platform.deepseek.com/api_keys' },
    zhipu: { name: 'Zhipu (Z.ai)', logo: 'https://open.bigmodel.cn/favicon.ico', models: ['glm-4-plus', 'glm-4-flash', 'glm-4-long'], apiKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys' },
    minimax: { name: 'MiniMax', logo: 'https://www.minimax.chat/favicon.ico', models: ['minimax-01', 'abab6.5s'], apiKeyUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key' },
    moonshot: { name: 'Moonshot (Kimi)', logo: 'https://kimi.moonshot.cn/favicon.ico', models: ['moonshot-v1-8k', 'moonshot-v1-32k'], apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys' }
  };
  
  // RAG Settings State (Mock for now)
  const [ragEnabled, setRagEnabled] = useState(false);
  const [embeddingModel, setEmbeddingModel] = useState('nomic-embed-text');
  const [chunkSize, setChunkSize] = useState(1000);
  const [overlap, setOverlap] = useState(200);
  const [topK, setTopK] = useState(4);
  const [ragPrompt, setRagPrompt] = useState('使用以下提供的上下文来回答用户的问题。如果你不知道答案，请直接说不知道，不要试图编造答案。\n\n上下文:\n{context}');
  
  // File Upload State
  const [isDragging, setIsDragging] = useState(false);
  const [ragFiles, setRagFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Avatar Cropping State
  const [croppingImage, setCroppingImage] = useState<string | null>(null);
  const [croppingTarget, setCroppingTarget] = useState<'user' | 'ai' | null>(null);
  const userAvatarInputRef = useRef<HTMLInputElement>(null);
  const aiAvatarInputRef = useRef<HTMLInputElement>(null);

  // Helper to get base URL from chat completions URL
  const getBaseUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.host}/v1`;
    } catch (e) {
      // Fallback if URL parsing fails
      return url.replace('/chat/completions', '');
    }
  };

  const fetchModels = async () => {
    setIsFetchingModels(true);
    try {
      const baseUrl = getBaseUrl(lmStudioUrl);
      const response = await fetch(`${baseUrl}/models`);
      if (response.ok) {
        const data = await response.json();
        if (data && data.data && Array.isArray(data.data)) {
          const models = data.data.map((m: any) => m.id).filter((id: string) => id && id.trim() !== '');
          setAvailableModels(models);
          if (models.length > 0 && !models.includes(modelName)) {
            setModelName(models[0]);
          }
          addLog(`成功获取到 ${models.length} 个模型`, 'info');
        }
      } else {
        throw new Error('Failed to fetch models');
      }
    } catch (error) {
      console.error("Error fetching models:", error);
      addLog('获取模型列表失败，请检查 LM Studio 是否已启动并开启 Server', 'error');
    } finally {
      setIsFetchingModels(false);
    }
  };

  const testConnection = async () => {
    setIsTestingConnection(true);
    setConnectionStatus('idle');
    try {
      const baseUrl = getBaseUrl(lmStudioUrl);
      const response = await fetch(`${baseUrl}/models`);
      if (response.ok) {
        setConnectionStatus('success');
        addLog('连接测试成功！', 'info');
        // Auto fetch models on successful test
        fetchModels();
      } else {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error("Connection test failed:", error);
      setConnectionStatus('error');
      addLog(`连接测试失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSave = () => {
    setSaveStatus('saving');
    // Simulate save delay for visual feedback
    setTimeout(() => {
      setSaveStatus('saved');
      addLog('设置已保存', 'info');
      setTimeout(() => {
        setSaveStatus('idle');
        onClose();
      }, 1000);
    }, 500);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setRagFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setRagFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const handleAvatarFileSelect = (e: React.ChangeEvent<HTMLInputElement>, target: 'user' | 'ai') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setCroppingImage(reader.result as string);
        setCroppingTarget(target);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCropComplete = (croppedImage: string) => {
    if (croppingTarget === 'user') {
      setUserAvatar(croppedImage);
    } else if (croppingTarget === 'ai') {
      setAiAvatar(croppedImage);
    }
    setCroppingImage(null);
    setCroppingTarget(null);
  };

  const removeFile = (index: number) => {
    setRagFiles(prev => prev.filter((_, i) => i !== index));
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          key="settings-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
        >
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className={cn(
              "relative w-full max-w-5xl h-[85vh] flex flex-col sm:flex-row border rounded-2xl shadow-2xl overflow-hidden",
              isDarkMode ? "bg-zinc-800 border-zinc-700" : "bg-white border-zinc-200"
            )}
          >
            {/* Sidebar */}
            <div className={cn(
              "w-full sm:w-64 border-b sm:border-b-0 sm:border-r p-4 flex flex-col",
              isDarkMode ? "bg-zinc-800/50 border-zinc-700" : "bg-zinc-50 border-zinc-200"
            )}>
              <div className="flex items-center justify-between sm:justify-start gap-3 mb-8 px-2">
                <NexusLogo size={32} />
                <h2 className={cn("text-xl font-semibold", isDarkMode ? "text-zinc-100" : "text-zinc-900")}>{t('settings.title')}</h2>
                <button onClick={onClose} className={cn(
                  "sm:hidden p-2 rounded-lg transition-colors",
                  isDarkMode ? "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200"
                )}>
                  <X size={20} />
                </button>
              </div>
              
              <nav className="flex flex-row sm:flex-col gap-2 overflow-x-auto sm:overflow-x-visible pb-2 sm:pb-0">
                <button
                  onClick={() => setActiveCategory('user-settings')}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all whitespace-nowrap",
                    activeCategory === 'user-settings' 
                      ? "bg-indigo-500/10 text-indigo-500 dark:text-indigo-400" 
                      : isDarkMode 
                        ? "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                        : "text-zinc-600 hover:bg-zinc-200/50 hover:text-zinc-900"
                  )}
                >
                  <User size={18} />
                  {t('settings.categories.user')}
                </button>
                <button
                  onClick={() => setActiveCategory('ai-models')}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all whitespace-nowrap",
                    activeCategory === 'ai-models' 
                      ? "bg-indigo-500/10 text-indigo-500 dark:text-indigo-400" 
                      : isDarkMode 
                        ? "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                        : "text-zinc-600 hover:bg-zinc-200/50 hover:text-zinc-900"
                  )}
                >
                  <NexusLogo size={18} />
                  {t('settings.categories.ai')}
                </button>
                <button
                  onClick={() => setActiveCategory('rag')}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all whitespace-nowrap",
                    activeCategory === 'rag' 
                      ? "bg-indigo-500/10 text-indigo-500 dark:text-indigo-400" 
                      : isDarkMode 
                        ? "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                        : "text-zinc-600 hover:bg-zinc-200/50 hover:text-zinc-900"
                  )}
                >
                  <Database size={18} />
                  {t('settings.categories.rag')}
                </button>
                <button
                  onClick={() => setActiveCategory('voice')}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all whitespace-nowrap",
                    activeCategory === 'voice' 
                      ? "bg-indigo-500/10 text-indigo-500 dark:text-indigo-400" 
                      : isDarkMode 
                        ? "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                        : "text-zinc-600 hover:bg-zinc-200/50 hover:text-zinc-900"
                  )}
                >
                  <Mic size={18} />
                  {t('settings.categories.voice')}
                </button>
              </nav>
            </div>

            {/* Content Area */}
            <div className={cn(
              "flex-1 flex flex-col h-full overflow-hidden",
              isDarkMode ? "bg-zinc-800" : "bg-white"
            )}>
              <div className={cn(
                "flex items-center justify-between p-6 border-b",
                isDarkMode ? "border-zinc-700/50" : "border-zinc-100"
              )}>
                <h3 className={cn("text-lg font-medium", isDarkMode ? "text-zinc-100" : "text-zinc-900")}>
                  {activeCategory === 'user-settings' ? t('settings.user.header') : activeCategory === 'ai-models' ? t('settings.ai.header') : activeCategory === 'rag' ? t('settings.rag.header') : t('settings.voice.header')}
                </h3>
                <button onClick={onClose} className={cn(
                  "hidden sm:block p-2 rounded-lg transition-colors",
                  isDarkMode ? "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
                )}>
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-3xl mx-auto space-y-8">
                  {activeCategory === 'voice' && <VoiceSettings isDarkMode={isDarkMode} />}
                  
                  {activeCategory === 'user-settings' && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-8"
                    >
                      {/* Profile Settings */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <section className="space-y-4">
                          <h4 className={cn("text-xs font-bold uppercase tracking-widest", isDarkMode ? "text-zinc-400" : "text-zinc-500")}>{t('settings.user.profile')}</h4>
                          <div className={cn(
                            "p-5 border rounded-2xl space-y-4",
                            isDarkMode ? "bg-zinc-700/30 border-zinc-600/50" : "bg-zinc-50 border-zinc-200"
                          )}>
                            <div className="flex items-center gap-4">
                              <div className="relative group">
                                <div 
                                  className="relative cursor-pointer overflow-hidden rounded-2xl border-2 border-indigo-500/20 group-hover:border-indigo-500/50 transition-all"
                                  onClick={() => userAvatarInputRef.current?.click()}
                                >
                                  <img src={userAvatar} alt="User" className="w-16 h-16 object-cover rounded-2xl" />
                                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Camera size={20} className="text-white" />
                                  </div>
                                </div>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const seed = Math.random().toString(36).substring(7);
                                    setUserAvatar(`https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`);
                                  }}
                                  className="absolute -bottom-1 -right-1 p-1.5 bg-indigo-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-10"
                                  title={t('settings.user.random')}
                                >
                                  <RefreshCw size={12} />
                                </button>
                                <input 
                                  type="file" 
                                  ref={userAvatarInputRef} 
                                  className="hidden" 
                                  accept="image/*" 
                                  onChange={(e) => handleAvatarFileSelect(e, 'user')}
                                />
                              </div>
                              <div className="flex-1 space-y-1">
                                <label htmlFor="userName" className={cn("text-xs font-medium", isDarkMode ? "text-zinc-300" : "text-zinc-600")}>{t('settings.user.userName')}</label>
                                <input 
                                  id="userName"
                                  name="userName"
                                  type="text" 
                                  value={userName}
                                  onChange={(e) => setUserName(e.target.value)}
                                  className={cn(
                                    "w-full border rounded-xl px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500/50 outline-none transition-all",
                                    isDarkMode ? "bg-zinc-700 border-zinc-600 text-zinc-200" : "bg-white border-zinc-300 text-zinc-900"
                                  )}
                                />
                              </div>
                            </div>
                          </div>
                        </section>

                        <section className="space-y-4">
                          <h4 className={cn("text-xs font-bold uppercase tracking-widest", isDarkMode ? "text-zinc-400" : "text-zinc-500")}>{t('settings.user.aiProfile')}</h4>
                          <div className={cn(
                            "p-5 border rounded-2xl space-y-4",
                            isDarkMode ? "bg-zinc-700/30 border-zinc-600/50" : "bg-zinc-50 border-zinc-200"
                          )}>
                            <div className="flex items-center gap-4">
                              <div className="relative group">
                                <div 
                                  className="relative cursor-pointer overflow-hidden rounded-2xl border-2 border-indigo-500/20 group-hover:border-indigo-500/50 transition-all"
                                  onClick={() => aiAvatarInputRef.current?.click()}
                                >
                                  <img src={aiAvatar} alt="AI" className="w-16 h-16 object-cover rounded-2xl" />
                                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Camera size={20} className="text-white" />
                                  </div>
                                </div>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const seed = Math.random().toString(36).substring(7);
                                    setAiAvatar(`https://api.dicebear.com/7.x/bottts/svg?seed=${seed}`);
                                  }}
                                  className="absolute -bottom-1 -right-1 p-1.5 bg-indigo-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-10"
                                  title={t('settings.user.random')}
                                >
                                  <RefreshCw size={12} />
                                </button>
                                <input 
                                  type="file" 
                                  ref={aiAvatarInputRef} 
                                  className="hidden" 
                                  accept="image/*" 
                                  onChange={(e) => handleAvatarFileSelect(e, 'ai')}
                                />
                              </div>
                              <div className="flex-1 space-y-1">
                                <label htmlFor="aiName" className={cn("text-xs font-medium", isDarkMode ? "text-zinc-300" : "text-zinc-600")}>{t('settings.user.aiName')}</label>
                                <input 
                                  id="aiName"
                                  name="aiName"
                                  type="text" 
                                  value={aiName}
                                  onChange={(e) => setAiName(e.target.value)}
                                  className={cn(
                                    "w-full border rounded-xl px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500/50 outline-none transition-all",
                                    isDarkMode ? "bg-zinc-700 border-zinc-600 text-zinc-200" : "bg-white border-zinc-300 text-zinc-900"
                                  )}
                                />
                              </div>
                            </div>
                          </div>
                        </section>
                      </div>

                      {/* App Preferences */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <section className="space-y-4">
                          <h4 className={cn("text-xs font-bold uppercase tracking-widest", isDarkMode ? "text-zinc-400" : "text-zinc-500")}>{t('settings.user.region')}</h4>
                          <div className={cn(
                            "p-5 border rounded-2xl space-y-4",
                            isDarkMode ? "bg-zinc-700/30 border-zinc-600/50" : "bg-zinc-50 border-zinc-200"
                          )}>
                            <div className="flex items-center gap-3">
                              <Languages size={18} className="text-indigo-500" />
                              <select
                                id="language"
                                name="language"
                                value={language}
                                onChange={(e) => setLanguage(e.target.value)}
                                className={cn(
                                  "flex-1 border rounded-xl px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500/50 outline-none appearance-none",
                                  isDarkMode ? "bg-zinc-700 border-zinc-600 text-zinc-200" : "bg-white border-zinc-300 text-zinc-900"
                                )}
                              >
                                <option value="zh">简体中文 (Chinese)</option>
                                <option value="en">English (US)</option>
                                <option value="ja">日本語 (Japanese)</option>
                              </select>
                            </div>
                          </div>
                        </section>

                        <section className="space-y-4">
                          <h4 className={cn("text-xs font-bold uppercase tracking-widest", isDarkMode ? "text-zinc-400" : "text-zinc-500")}>{t('settings.user.font')}</h4>
                          <div className={cn(
                            "p-5 border rounded-2xl space-y-4",
                            isDarkMode ? "bg-zinc-700/30 border-zinc-600/50" : "bg-zinc-50 border-zinc-200"
                          )}>
                            <div className="flex items-center gap-3">
                              <Type size={18} className="text-indigo-500" />
                              <select
                                id="fontFamily"
                                name="fontFamily"
                                value={fontFamily}
                                onChange={(e) => setFontFamily(e.target.value)}
                                className={cn(
                                  "flex-1 border rounded-xl px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500/50 outline-none appearance-none",
                                  isDarkMode ? "bg-zinc-700 border-zinc-600 text-zinc-200" : "bg-white border-zinc-300 text-zinc-900"
                                )}
                              >
                                <option value="Inter">{t('settings.user.fontInter')}</option>
                                <option value="'JetBrains Mono', monospace">{t('settings.user.fontJetBrains')}</option>
                                <option value="'Space Grotesk', sans-serif">{t('settings.user.fontSpace')}</option>
                                <option value="'Noto Sans SC', sans-serif">{t('settings.user.fontNoto')}</option>
                                <option value="'LINE Seed JP', sans-serif">{t('settings.user.fontLine')}</option>
                                <option value="system-ui">{t('settings.user.fontSystem')}</option>
                              </select>
                            </div>
                          </div>
                        </section>
                      </div>

                      {/* Chat Preview */}
                      <section className="space-y-4">
                        <h4 className={cn("text-xs font-bold uppercase tracking-widest", isDarkMode ? "text-zinc-400" : "text-zinc-500")}>{t('settings.user.preview')}</h4>
                        <div className={cn(
                          "p-6 border rounded-2xl space-y-6",
                          isDarkMode ? "bg-zinc-700/20 border-zinc-600/50" : "bg-zinc-50/50 border-zinc-200"
                        )} style={{ fontFamily }}>
                          {/* AI Message Preview */}
                          <div className="flex gap-4">
                            <img src={aiAvatar} alt="AI" className="w-10 h-10 rounded-xl object-cover shrink-0" />
                            <div className="space-y-1.5 max-w-[80%]">
                              <div className="flex items-center gap-2">
                                <span className={cn("text-xs font-bold", isDarkMode ? "text-zinc-300" : "text-zinc-700")}>{aiName}</span>
                                <span className="text-[10px] px-1.5 py-0.5 bg-indigo-500/10 text-indigo-500 rounded uppercase font-bold tracking-tighter">AI</span>
                              </div>
                              <div className={cn(
                                "px-4 py-3 rounded-2xl rounded-tl-none text-sm shadow-sm",
                                isDarkMode ? "bg-zinc-700 text-zinc-200" : "bg-white text-zinc-800 border border-zinc-200"
                              )}>
                                你好！我是 {aiName}。看到这个预览了吗？所有的修改都会实时反映在这里。
                              </div>
                            </div>
                          </div>

                          {/* User Message Preview */}
                          <div className="flex gap-4 flex-row-reverse">
                            <img src={userAvatar} alt="User" className="w-10 h-10 rounded-xl object-cover shrink-0" />
                            <div className="space-y-1.5 max-w-[80%] flex flex-col items-end">
                              <div className="flex items-center gap-2">
                                <span className={cn("text-xs font-bold", isDarkMode ? "text-zinc-300" : "text-zinc-700")}>{userName}</span>
                              </div>
                              <div className={cn(
                                "px-4 py-3 rounded-2xl rounded-tr-none text-sm shadow-sm bg-indigo-600 text-white"
                              )}>
                                看起来很棒，{aiName}！我喜欢这个新头像和字体。
                              </div>
                            </div>
                          </div>
                        </div>
                      </section>

                      {/* Close Window Settings */}
                      <section className="space-y-4">
                        <h4 className={cn("text-xs font-bold uppercase tracking-widest", isDarkMode ? "text-zinc-400" : "text-zinc-500")}>{t('settings.user.closeWindow')}</h4>
                        <div className={cn(
                          "p-5 border rounded-2xl space-y-4",
                          isDarkMode ? "bg-zinc-700/30 border-zinc-600/50" : "bg-zinc-50 border-zinc-200"
                        )}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                "p-2 rounded-lg",
                                isDarkMode ? "bg-zinc-600" : "bg-zinc-200"
                              )}>
                                <Minimize2 size={16} className="text-indigo-500" />
                              </div>
                              <div>
                                <p className={cn("text-sm font-medium", isDarkMode ? "text-zinc-200" : "text-zinc-800")}>{t('settings.user.closeWindowAction')}</p>
                                <p className={cn("text-xs", isDarkMode ? "text-zinc-400" : "text-zinc-500")}>{t('settings.user.closeWindowActionDesc')}</p>
                              </div>
                            </div>
                            <select
                              id="closeWindowAction"
                              name="closeWindowAction"
                              value={closeWindowAction}
                              onChange={(e) => setCloseWindowAction(e.target.value as 'minimize' | 'close')}
                              className={cn(
                                "border rounded-xl px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500/50 outline-none appearance-none cursor-pointer",
                                isDarkMode ? "bg-zinc-700 border-zinc-600 text-zinc-200" : "bg-white border-zinc-300 text-zinc-900"
                              )}
                            >
                              <option value="minimize">{t('settings.user.closeWindowMinimize')}</option>
                              <option value="close">{t('settings.user.closeWindowClose')}</option>
                            </select>
                          </div>

                          <div className={cn("border-t pt-4", isDarkMode ? "border-zinc-600/50" : "border-zinc-200")} />

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                "p-2 rounded-lg",
                                isDarkMode ? "bg-zinc-600" : "bg-zinc-200"
                              )}>
                                <Power size={16} className="text-indigo-500" />
                              </div>
                              <div>
                                <p className={cn("text-sm font-medium", isDarkMode ? "text-zinc-200" : "text-zinc-800")}>{t('settings.user.closeWindowAskEveryTime')}</p>
                                <p className={cn("text-xs", isDarkMode ? "text-zinc-400" : "text-zinc-500")}>{t('settings.user.closeWindowAskEveryTimeDesc')}</p>
                              </div>
                            </div>
                            <label htmlFor="closeWindowAskEveryTime" className="relative inline-flex items-center cursor-pointer">
                              <input 
                                id="closeWindowAskEveryTime"
                                name="closeWindowAskEveryTime"
                                type="checkbox" 
                                className="sr-only peer" 
                                checked={closeWindowAskEveryTime} 
                                onChange={(e) => setCloseWindowAskEveryTime(e.target.checked)} 
                              />
                              <div className={cn(
                                "w-9 h-5 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500",
                                isDarkMode ? "bg-zinc-600" : "bg-zinc-300"
                              )}></div>
                            </label>
                          </div>
                        </div>
                      </section>
                    </motion.div>
                  )}

                      {activeCategory === 'ai-models' && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="space-y-8"
                        >
                          {/* Provider Selection */}
                          <section className="space-y-4">
                            <h4 className={cn("text-xs font-bold uppercase tracking-widest", isDarkMode ? "text-zinc-400" : "text-zinc-500")}>{t('settings.ai.provider')}</h4>
                            <div className="grid grid-cols-3 gap-3">
                              {[
                                { id: 'lm-studio', icon: Server, label: 'LM Studio' },
                                { id: 'ollama', icon: Cpu, label: 'Ollama' },
                                { id: 'online', icon: Globe, label: t('settings.ai.online') || '在线模型' },
                              ].map((provider) => (
                            <button
                              key={provider.id}
                              onClick={() => setModelProvider(provider.id as ModelProvider)}
                              className={cn(
                                "flex flex-col items-center justify-center gap-2 p-4 rounded-xl border transition-all",
                                modelProvider === provider.id
                                  ? "bg-indigo-500/10 border-indigo-500/50 text-indigo-500 dark:text-indigo-400"
                                  : isDarkMode
                                    ? "bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                                    : "bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                              )}
                            >
                              <provider.icon size={24} />
                              <span className="text-sm font-medium">{provider.label}</span>
                            </button>
                          ))}
                        </div>
                      </section>

                      <section className="space-y-4">
                        <h4 className={cn("text-xs font-bold uppercase tracking-widest", isDarkMode ? "text-zinc-400" : "text-zinc-500")}>{t('settings.ai.connectionSettings')}</h4>
                        <div className={cn(
                          "grid gap-4 p-5 border rounded-2xl",
                          isDarkMode ? "bg-zinc-700/30 border-zinc-600/50" : "bg-zinc-50 border-zinc-200"
                        )}>
                          {modelProvider === 'online' ? (
                            <>
                              <div className="space-y-2">
                                <label htmlFor="onlineApiKey" className={cn("text-xs font-medium", isDarkMode ? "text-zinc-300" : "text-zinc-600")}>{t('settings.ai.apiKey')}</label>
                                <div className="flex gap-2">
                                  <input 
                                    id="onlineApiKey"
                                    name="onlineApiKey"
                                    type="password" 
                                    value={onlineApiKey}
                                    onChange={(e) => setOnlineApiKey(e.target.value)}
                                    placeholder={t('settings.ai.apiKeyPlaceholder')}
                                    className={cn(
                                      "flex-1 border rounded-xl px-4 py-2.5 text-sm focus:ring-1 focus:ring-indigo-500/50 outline-none transition-all",
                                      isDarkMode ? "bg-zinc-700 border-zinc-600 text-zinc-200" : "bg-white border-zinc-300 text-zinc-900"
                                    )}
                                  />
                                  <a
                                    href={onlineProviders[onlineProvider as keyof typeof onlineProviders].apiKeyUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={cn(
                                      "px-4 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center whitespace-nowrap",
                                      isDarkMode 
                                        ? "bg-zinc-700 hover:bg-zinc-600 text-zinc-300" 
                                        : "bg-zinc-200 hover:bg-zinc-300 text-zinc-700"
                                    )}
                                  >
                                    {t('settings.ai.getApiKey')}
                                  </a>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2 relative">
                                  <label htmlFor="onlineProvider" className={cn("text-xs font-medium", isDarkMode ? "text-zinc-300" : "text-zinc-600")}>{t('settings.ai.vendor')}</label>
                                  <div className="relative">
                                    <button
                                      id="onlineProvider"
                                      name="onlineProvider"
                                      type="button"
                                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                      className={cn(
                                        "w-full flex items-center gap-2 border rounded-xl px-4 py-2.5 text-sm focus:ring-1 focus:ring-indigo-500/50 outline-none appearance-none",
                                        isDarkMode ? "bg-zinc-700 border-zinc-600 text-zinc-200" : "bg-white border-zinc-300 text-zinc-900"
                                      )}
                                    >
                                      <img src={onlineProviders[onlineProvider as keyof typeof onlineProviders].logo} alt="" className="w-5 h-5 rounded-sm" />
                                      {onlineProviders[onlineProvider as keyof typeof onlineProviders].name}
                                    </button>
                                    {isDropdownOpen && (
                                      <div className="absolute z-10 w-full mt-1 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl shadow-lg">
                                        {Object.entries(onlineProviders).map(([id, p]) => (
                                          <button
                                            key={id}
                                            type="button"
                                            onClick={() => {
                                              setOnlineProvider(id);
                                              setOnlineModel(p.models[0]);
                                              setIsDropdownOpen(false);
                                            }}
                                            className="w-full flex items-center gap-2 px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-600 text-sm"
                                          >
                                            <img src={p.logo} alt="" className="w-5 h-5 rounded-sm" />
                                            {p.name}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="space-y-2 relative">
                                  <label htmlFor="onlineModel" className={cn("text-xs font-medium", isDarkMode ? "text-zinc-300" : "text-zinc-600")}>{t('settings.ai.model')}</label>
                                  <div className="relative">
                                    <button
                                      id="onlineModel"
                                      name="onlineModel"
                                      type="button"
                                      onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                                      className={cn(
                                        "w-full flex items-center gap-2 border rounded-xl px-4 py-2.5 text-sm focus:ring-1 focus:ring-indigo-500/50 outline-none appearance-none",
                                        isDarkMode ? "bg-zinc-700 border-zinc-600 text-zinc-200" : "bg-white border-zinc-300 text-zinc-900"
                                      )}
                                    >
                                      <img src={onlineProviders[onlineProvider as keyof typeof onlineProviders].logo} alt="" className="w-5 h-5 rounded-sm" />
                                      {onlineModel}
                                    </button>
                                    {isModelDropdownOpen && (
                                      <div className="absolute z-10 w-full mt-1 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                                        {onlineProviders[onlineProvider as keyof typeof onlineProviders].models.filter(m => m && m.trim() !== '').map((model, idx) => (
                                          <button
                                            key={model || `model-${idx}`}
                                            type="button"
                                            onClick={() => {
                                              setOnlineModel(model);
                                              setIsModelDropdownOpen(false);
                                            }}
                                            className="w-full flex items-center gap-2 px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-600 text-sm"
                                          >
                                            <img src={onlineProviders[onlineProvider as keyof typeof onlineProviders].logo} alt="" className="w-5 h-5 rounded-sm" />
                                            {model}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="space-y-2">
                                <label htmlFor="apiUrl" className={cn("text-xs font-medium", isDarkMode ? "text-zinc-300" : "text-zinc-600")}>{t('settings.ai.apiUrl')}</label>
                                <div className="flex gap-2">
                                  <input 
                                    id="apiUrl"
                                    name="apiUrl"
                                    type="text" 
                                    value={modelProvider === 'ollama' ? ollamaUrl : lmStudioUrl}
                                    onChange={(e) => {
                                      if (modelProvider === 'ollama') setOllamaUrl(e.target.value);
                                      else setLmStudioUrl(e.target.value);
                                    }}
                                    className={cn(
                                      "flex-1 border rounded-xl px-4 py-2.5 text-sm focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 outline-none transition-all",
                                      isDarkMode ? "bg-zinc-700 border-zinc-600 text-zinc-200" : "bg-white border-zinc-300 text-zinc-900"
                                    )}
                                  />
                                  <button 
                                    onClick={testConnection}
                                    disabled={isTestingConnection}
                                    className={cn(
                                      "px-4 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50",
                                      isDarkMode ? "bg-zinc-700 hover:bg-zinc-600 text-zinc-200" : "bg-zinc-200 hover:bg-zinc-300 text-zinc-800"
                                    )}
                                  >
                                    {isTestingConnection ? <RefreshCw size={16} className="animate-spin" /> : <Activity size={16} />}
                                    {t('settings.ai.testConnection')}
                                  </button>
                                </div>
                                {connectionStatus === 'success' && <p className="text-xs text-emerald-500 flex items-center gap-1 mt-1"><CheckCircle2 size={12} /> {t('settings.ai.connectionSuccess')}</p>}
                                {connectionStatus === 'error' && <p className="text-xs text-red-500 flex items-center gap-1 mt-1"><XCircle size={12} /> {t('settings.ai.connectionError')}</p>}
                              </div>
                              
                              <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                  <label htmlFor="modelNameInput" className={cn("text-xs font-medium", isDarkMode ? "text-zinc-300" : "text-zinc-600")}>{t('settings.ai.modelName')}</label>
                                  <button 
                                    onClick={fetchModels} 
                                    disabled={isFetchingModels}
                                    className="text-xs text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 flex items-center gap-1 disabled:opacity-50"
                                  >
                                    <RefreshCw size={10} className={isFetchingModels ? "animate-spin" : ""} />
                                    {t('settings.ai.fetchModels')}
                                  </button>
                                </div>
                                {availableModels.length > 0 ? (
                                  <select
                                    id="modelNameInput"
                                    name="modelNameInput"
                                    value={modelName}
                                    onChange={(e) => setModelName(e.target.value)}
                                    className={cn(
                                      "w-full border rounded-xl px-4 py-2.5 text-sm focus:ring-1 focus:ring-indigo-500/50 outline-none appearance-none",
                                      isDarkMode ? "bg-zinc-700 border-zinc-600 text-zinc-200" : "bg-white border-zinc-300 text-zinc-900"
                                    )}
                                  >
                                    {availableModels.filter(m => m && m.trim() !== '').map((model, idx) => (
                                      <option key={model || `model-${idx}`} value={model}>{model}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <input 
                                    id="modelNameInput"
                                    name="modelNameInput"
                                    type="text" 
                                    value={modelName}
                                    onChange={(e) => setModelName(e.target.value)}
                                    placeholder={t('settings.ai.modelNamePlaceholder')}
                                    className={cn(
                                      "w-full border rounded-xl px-4 py-2.5 text-sm focus:ring-1 focus:ring-indigo-500/50 outline-none transition-all",
                                      isDarkMode ? "bg-zinc-700 border-zinc-600 text-zinc-200" : "bg-white border-zinc-300 text-zinc-900"
                                    )}
                                  />
                                )}
                              </div>
                            </>
                          )}

                          <div className="space-y-4 pt-2">
                            <div className="flex justify-between items-center">
                              <label htmlFor="maxContextLength" className={cn("text-xs font-medium", isDarkMode ? "text-zinc-300" : "text-zinc-600")}>{t('settings.ai.maxContextLength')}</label>
                              <input 
                                id="maxContextLength"
                                name="maxContextLength"
                                type="number" 
                                value={maxContextLength}
                                onChange={(e) => setMaxContextLength(parseInt(e.target.value) || 4096)}
                                className={cn(
                                  "w-24 border rounded-lg px-3 py-1.5 text-sm text-right focus:ring-1 focus:ring-indigo-500/50 outline-none",
                                  isDarkMode ? "bg-zinc-700 border-zinc-600 text-zinc-200" : "bg-white border-zinc-300 text-zinc-900"
                                )}
                              />
                            </div>
                            <input 
                              type="range" 
                              min="1024" 
                              max="128000" 
                              step="1024"
                              value={maxContextLength}
                              onChange={(e) => setMaxContextLength(parseInt(e.target.value))}
                              className="w-full accent-indigo-500"
                            />
                            <div className={cn("flex justify-between text-[10px]", isDarkMode ? "text-zinc-400" : "text-zinc-500")}>
                              <span>1K</span>
                              <span>32K</span>
                              <span>128K</span>
                            </div>
                          </div>
                        </div>
                      </section>
                    </motion.div>
                  )}

                  {activeCategory === 'rag' && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-6"
                    >
                      {/* Core Config */}
                      <div className={cn(
                        "p-5 border rounded-2xl space-y-4",
                        isDarkMode ? "bg-zinc-700/30 border-zinc-600/50" : "bg-zinc-50 border-zinc-200"
                      )}>
                        <div className="flex items-center justify-between">
                          <h4 className={cn("text-sm font-medium flex items-center gap-2", isDarkMode ? "text-zinc-200" : "text-zinc-900")}>
                            <Database size={16} className="text-indigo-500 dark:text-indigo-400" />
                            {t('settings.rag.coreConfig')}
                          </h4>
                          <label htmlFor="ragEnabled" className="relative inline-flex items-center cursor-pointer">
                            <input 
                              id="ragEnabled"
                              name="ragEnabled"
                              type="checkbox" 
                              className="sr-only peer" 
                              checked={ragEnabled} 
                              onChange={(e) => setRagEnabled(e.target.checked)} 
                            />
                            <div className={cn(
                              "w-9 h-5 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500",
                              isDarkMode ? "bg-zinc-600" : "bg-zinc-300"
                            )}></div>
                          </label>
                        </div>
                        
                        <div className={cn("space-y-2 transition-opacity", !ragEnabled && "opacity-50 pointer-events-none")}>
                          <label htmlFor="embeddingModel" className={cn("text-xs font-medium", isDarkMode ? "text-zinc-300" : "text-zinc-600")}>{t('settings.rag.embeddingModel')}</label>
                          <select
                            id="embeddingModel"
                            name="embeddingModel"
                            value={embeddingModel}
                            onChange={(e) => setEmbeddingModel(e.target.value)}
                            className={cn(
                              "w-full border rounded-xl px-4 py-2.5 text-sm focus:ring-1 focus:ring-indigo-500/50 outline-none appearance-none",
                              isDarkMode ? "bg-zinc-700 border-zinc-600 text-zinc-200" : "bg-white border-zinc-300 text-zinc-900"
                            )}
                          >
                            <option value="nomic-embed-text">nomic-embed-text</option>
                            <option value="bge-m3">bge-m3</option>
                            <option value="text-embedding-3-small">text-embedding-3-small</option>
                          </select>
                          <p className={cn("text-[10px]", isDarkMode ? "text-zinc-400" : "text-zinc-500")}>{t('settings.rag.embeddingModelHint')}</p>
                        </div>
                      </div>

                      {/* Knowledge Base Files */}
                      <div className={cn(
                        "p-5 border rounded-2xl space-y-4 transition-opacity",
                        isDarkMode ? "bg-zinc-700/30 border-zinc-600/50" : "bg-zinc-50 border-zinc-200",
                        !ragEnabled && "opacity-50 pointer-events-none"
                      )}>
                        <h4 className={cn("text-sm font-medium flex items-center gap-2", isDarkMode ? "text-zinc-200" : "text-zinc-900")}>
                          <FileText size={16} className="text-indigo-500 dark:text-indigo-400" />
                          {t('settings.rag.knowledgeBaseFiles')}
                        </h4>

                        <div
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          onDrop={handleDrop}
                          onClick={() => fileInputRef.current?.click()}
                          className={cn(
                            "border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all",
                            isDragging 
                              ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10" 
                              : isDarkMode
                                ? "border-zinc-600 hover:border-indigo-500 hover:bg-zinc-800/50"
                                : "border-zinc-300 hover:border-indigo-400 hover:bg-zinc-100"
                          )}
                        >
                          <input 
                            type="file" 
                            ref={fileInputRef} 
                            onChange={handleFileSelect} 
                            className="hidden" 
                            multiple 
                          />
                          <UploadCloud size={32} className={isDragging ? "text-indigo-500" : (isDarkMode ? "text-zinc-400" : "text-zinc-500")} />
                          <div className="text-center">
                            <p className={cn("text-sm font-medium", isDarkMode ? "text-zinc-300" : "text-zinc-700")}>
                              {t('settings.rag.uploadHint')}
                            </p>
                            <p className={cn("text-xs mt-1", isDarkMode ? "text-zinc-500" : "text-zinc-500")}>
                              {t('settings.rag.supportedFormats')}
                            </p>
                          </div>
                        </div>

                        {ragFiles.length > 0 && (
                          <div className="space-y-2 mt-4">
                            <h5 className={cn("text-xs font-medium", isDarkMode ? "text-zinc-300" : "text-zinc-600")}>{t('settings.rag.uploadedFiles')} ({ragFiles.length})</h5>
                            <div className="max-h-32 overflow-y-auto space-y-2 pr-2">
                              {ragFiles.map((file, idx) => (
                                <div key={`${file.name}-${idx}`} className={cn(
                                  "flex items-center justify-between border rounded-lg p-2.5",
                                  isDarkMode ? "bg-zinc-700 border-zinc-600" : "bg-white border-zinc-200"
                                )}>
                                  <div className="flex items-center gap-2 overflow-hidden">
                                    <FileText size={14} className="text-indigo-500 shrink-0" />
                                    <span className={cn("text-xs truncate", isDarkMode ? "text-zinc-300" : "text-zinc-700")}>{file.name}</span>
                                  </div>
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                                    className={cn(
                                      "p-1 rounded-md transition-colors",
                                      isDarkMode ? "text-zinc-400 hover:text-red-500 hover:bg-red-500/10" : "text-zinc-400 hover:text-red-500 hover:bg-red-50"
                                    )}
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Indexing Strategy */}
                      <div className={cn(
                        "p-5 border rounded-2xl space-y-6 transition-opacity",
                        isDarkMode ? "bg-zinc-700/30 border-zinc-600/50" : "bg-zinc-50 border-zinc-200",
                        !ragEnabled && "opacity-50 pointer-events-none"
                      )}>
                        <h4 className={cn("text-sm font-medium flex items-center gap-2", isDarkMode ? "text-zinc-200" : "text-zinc-900")}>
                          <Cpu size={16} className="text-indigo-500 dark:text-indigo-400" />
                          {t('settings.rag.indexingStrategy')}
                        </h4>
                        
                        <div className="space-y-4">
                          <div className="flex justify-between items-center">
                            <label htmlFor="chunkSize" className={cn("text-xs font-medium", isDarkMode ? "text-zinc-300" : "text-zinc-600")}>{t('settings.rag.chunkSize')}</label>
                            <span className="text-xs font-mono text-indigo-500 dark:text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded-md">
                              {chunkSize}
                            </span>
                          </div>
                          <input 
                            id="chunkSize"
                            name="chunkSize"
                            type="range" 
                            min="200" 
                            max="2000" 
                            step="100"
                            value={chunkSize}
                            onChange={(e) => setChunkSize(parseInt(e.target.value))}
                            className="w-full accent-indigo-500"
                          />
                          <div className="flex justify-between items-center">
                            <span className={cn("text-[10px]", isDarkMode ? "text-zinc-400" : "text-zinc-500")}>{t('settings.rag.chunkSizeHintSmall')}</span>
                            <span className="text-[10px] text-amber-600 dark:text-amber-500/80 bg-amber-500/10 px-2 py-0.5 rounded">
                              {t('settings.rag.estimatedTokens', { count: Math.round(chunkSize * 1.3) })}
                            </span>
                            <span className={cn("text-[10px]", isDarkMode ? "text-zinc-400" : "text-zinc-500")}>{t('settings.rag.chunkSizeHintLarge')}</span>
                          </div>
                        </div>

                        <div className="space-y-4 pt-2">
                          <div className="flex justify-between items-center">
                            <label htmlFor="overlap" className={cn("text-xs font-medium", isDarkMode ? "text-zinc-300" : "text-zinc-600")}>{t('settings.rag.overlap')}</label>
                            <span className="text-xs font-mono text-indigo-500 dark:text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded-md">
                              {overlap}
                            </span>
                          </div>
                          <input 
                            id="overlap"
                            name="overlap"
                            type="range" 
                            min="0" 
                            max="500" 
                            step="50"
                            value={overlap}
                            onChange={(e) => setOverlap(parseInt(e.target.value))}
                            className="w-full accent-indigo-500"
                          />
                          <p className={cn("text-[10px]", isDarkMode ? "text-zinc-400" : "text-zinc-500")}>{t('settings.rag.overlapHint')}</p>
                        </div>
                      </div>

                      {/* Retrieval Optimization */}
                      <div className={cn(
                        "p-5 border rounded-2xl space-y-4 transition-opacity",
                        isDarkMode ? "bg-zinc-700/30 border-zinc-600/50" : "bg-zinc-50 border-zinc-200",
                        !ragEnabled && "opacity-50 pointer-events-none"
                      )}>
                        <h4 className={cn("text-sm font-medium flex items-center gap-2", isDarkMode ? "text-zinc-200" : "text-zinc-900")}>
                          <Globe size={16} className="text-indigo-500 dark:text-indigo-400" />
                          {t('settings.rag.retrievalOptimization')}
                        </h4>
                        
                        <div className="space-y-4">
                          <div className="flex justify-between items-center">
                            <label htmlFor="topK" className={cn("text-xs font-medium", isDarkMode ? "text-zinc-300" : "text-zinc-600")}>{t('settings.rag.topK')}</label>
                            <span className="text-xs font-mono text-indigo-500 dark:text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded-md">
                              {topK}
                            </span>
                          </div>
                          <input 
                            id="topK"
                            name="topK"
                            type="range" 
                            min="1" 
                            max="10" 
                            step="1"
                            value={topK}
                            onChange={(e) => setTopK(parseInt(e.target.value))}
                            className="w-full accent-indigo-500"
                          />
                          <p className={cn("text-[10px]", isDarkMode ? "text-zinc-400" : "text-zinc-500")}>{t('settings.rag.topKHint')}</p>
                        </div>

                        <div className="space-y-2 pt-2">
                          <label htmlFor="ragPrompt" className={cn("text-xs font-medium", isDarkMode ? "text-zinc-300" : "text-zinc-600")}>{t('settings.rag.systemPrompt')}</label>
                          <textarea 
                            id="ragPrompt"
                            name="ragPrompt"
                            value={ragPrompt}
                            onChange={(e) => setRagPrompt(e.target.value)}
                            rows={4}
                            className={cn(
                              "w-full border rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-indigo-500/50 outline-none resize-none",
                              isDarkMode ? "bg-zinc-700 border-zinc-600 text-zinc-200" : "bg-white border-zinc-300 text-zinc-900"
                            )}
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}

                </div>
              </div>

              {/* Footer */}
              <div className={cn(
                "p-4 border-t flex justify-end gap-3",
                isDarkMode ? "border-zinc-700/50 bg-zinc-800/80" : "border-zinc-200 bg-zinc-50/80"
              )}>
                <button 
                  onClick={onReset}
                  className={cn(
                    "px-4 py-2 rounded-xl text-sm font-medium transition-colors",
                    isDarkMode ? "bg-zinc-700 hover:bg-zinc-600 text-zinc-300" : "bg-zinc-200 hover:bg-zinc-300 text-zinc-700"
                  )}
                >
                  {t('settings.footer.reset')}
                </button>
                <button 
                  onClick={handleSave}
                  disabled={saveStatus === 'saving'}
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-all flex items-center gap-2 disabled:opacity-80"
                >
                  {saveStatus === 'saving' ? (
                    <RefreshCw size={16} className="animate-spin" />
                  ) : saveStatus === 'saved' ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <Save size={16} />
                  )}
                  {saveStatus === 'saving' ? t('settings.footer.saving') : saveStatus === 'saved' ? t('settings.footer.saved') : t('settings.footer.save')}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
      <AnimatePresence>
        {croppingImage && (
          <ImageCropper 
            key="image-cropper"
            image={croppingImage}
            isDarkMode={isDarkMode}
            onCropComplete={handleCropComplete}
            onCancel={() => {
              setCroppingImage(null);
              setCroppingTarget(null);
            }}
          />
        )}
      </AnimatePresence>
    </AnimatePresence>
  );
};
