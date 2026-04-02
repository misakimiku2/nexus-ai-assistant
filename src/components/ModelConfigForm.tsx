import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Server, Cpu, Globe, Activity, RefreshCw, CheckCircle2, XCircle, X, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { ModelConfig } from '../types';

interface ModelConfigFormProps {
  isDarkMode: boolean;
  editingConfig?: ModelConfig | null;
  onSave: (config: Omit<ModelConfig, 'id' | 'createdAt' | 'priority'>) => void;
  onCancel: () => void;
  addLog: (message: string, type?: 'info' | 'error' | 'command') => void;
}

const onlineProviders: Record<string, { name: string; logo: string; models: string[]; apiKeyUrl: string }> = {
  google: { name: 'Google', logo: 'https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg', models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'], apiKeyUrl: 'https://aistudio.google.com/app/apikey' },
  openai: { name: 'OpenAI', logo: 'https://upload.wikimedia.org/wikipedia/commons/0/04/ChatGPT_logo.svg', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'], apiKeyUrl: 'https://platform.openai.com/api-keys' },
  anthropic: { name: 'Anthropic', logo: 'https://www.anthropic.com/favicon.ico', models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'], apiKeyUrl: 'https://console.anthropic.com/settings/keys' },
  alibaba: { name: 'Alibaba (Qwen)', logo: 'https://qwenlm.github.io/images/logo.png', models: ['qwen-max', 'qwen-plus', 'qwen-turbo'], apiKeyUrl: 'https://dashscope.console.aliyun.com/apiKey' },
  deepseek: { name: 'DeepSeek', logo: 'https://www.deepseek.com/favicon.ico', models: ['deepseek-chat', 'deepseek-reasoner'], apiKeyUrl: 'https://platform.deepseek.com/api_keys' },
};

type Provider = 'lm-studio' | 'ollama' | 'online';

export const ModelConfigForm: React.FC<ModelConfigFormProps> = ({
  isDarkMode,
  editingConfig,
  onSave,
  onCancel,
  addLog,
}) => {
  const [name, setName] = useState(editingConfig?.name || '');
  const [provider, setProvider] = useState<Provider>(editingConfig?.provider || 'lm-studio');
  const [apiUrl, setApiUrl] = useState(editingConfig?.apiUrl || 'http://localhost:1234/v1/chat/completions');
  const [modelId, setModelId] = useState(editingConfig?.modelId || '');
  const [apiKey, setApiKey] = useState(editingConfig?.apiKey || '');
  const [onlineProvider, setOnlineProvider] = useState(editingConfig?.onlineProvider || 'google');
  const [maxContextLength, setMaxContextLength] = useState(editingConfig?.maxContextLength || 4096);
  const [requestTimeout, setRequestTimeout] = useState(editingConfig?.timeout || 60);
  const [rpm, setRpm] = useState(editingConfig?.rpm || 60);
  const [inputPrice, setInputPrice] = useState(editingConfig?.pricing?.inputPrice || 0);
  const [outputPrice, setOutputPrice] = useState(editingConfig?.pricing?.outputPrice || 0);
  const [currency, setCurrency] = useState<'USD' | 'CNY'>('USD');
  const [isNameManuallyEdited, setIsNameManuallyEdited] = useState(false);
  
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [isOnlineProviderDropdownOpen, setIsOnlineProviderDropdownOpen] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [showPricingConfig, setShowPricingConfig] = useState(false);

  useEffect(() => {
    if (provider === 'online' && onlineProviders[onlineProvider]?.models.length > 0) {
      setModelId(onlineProviders[onlineProvider].models[0]);
    }
  }, [provider, onlineProvider]);

  useEffect(() => {
    if (provider === 'lm-studio') {
      setApiUrl('http://localhost:1234/v1/chat/completions');
    } else if (provider === 'ollama') {
      setApiUrl('http://localhost:11434/api/chat');
    }
  }, [provider]);

  useEffect(() => {
    if (modelId && !isNameManuallyEdited && !editingConfig) {
      setName(generateFriendlyName(modelId));
    }
  }, [modelId, isNameManuallyEdited, editingConfig]);

  const getBaseUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.host}/v1`;
    } catch {
      return url.replace('/chat/completions', '').replace('/api/chat', '');
    }
  };

  const generateFriendlyName = (modelId: string): string => {
    if (!modelId) return '';
    
    let name = modelId;
    
    if (name.includes('/')) {
      name = name.split('/').pop() || name;
    }
    
    name = name
      .replace(/[-_]/g, ' ')
      .replace(/\b(\w)/g, (char) => char.toUpperCase())
      .replace(/\s+/g, ' ')
      .trim();
    
    return name || modelId;
  };

  const fetchModels = async () => {
    setIsFetchingModels(true);
    try {
      const baseUrl = getBaseUrl(apiUrl);
      const response = await fetch(`${baseUrl}/models`);
      if (response.ok) {
        const data = await response.json();
        if (data?.data && Array.isArray(data.data)) {
          const models = data.data.map((m: any) => m.id).filter((id: string) => id?.trim());
          setAvailableModels(models);
          if (models.length > 0 && !modelId) {
            setModelId(models[0]);
            setIsNameManuallyEdited(false);
          }
          addLog(`成功获取到 ${models.length} 个模型`, 'info');
        }
      } else {
        throw new Error('Failed to fetch models');
      }
    } catch (error) {
      addLog('获取模型列表失败，请检查服务是否已启动', 'error');
    } finally {
      setIsFetchingModels(false);
    }
  };

  const testConnection = async () => {
    setIsTestingConnection(true);
    setConnectionStatus('idle');
    try {
      const baseUrl = getBaseUrl(apiUrl);
      const response = await fetch(`${baseUrl}/models`);
      if (response.ok) {
        setConnectionStatus('success');
        addLog('连接测试成功！', 'info');
        fetchModels();
      } else {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      setConnectionStatus('error');
      addLog(`连接测试失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim() || !modelId.trim()) {
      addLog('请填写模型名称和模型ID', 'error');
      return;
    }

    let status: 'active' | 'inactive' | 'error' = 'inactive';
    
    if (provider === 'online') {
      status = apiKey.trim() ? 'active' : 'inactive';
    } else {
      // 本地模型需要测试连接
      try {
        const baseUrl = getBaseUrl(apiUrl);
        const response = await fetch(`${baseUrl}/models`);
        if (response.ok) {
          status = 'active';
          addLog('连接验证成功', 'info');
        } else {
          status = 'error';
          addLog('连接验证失败', 'error');
        }
      } catch {
        status = 'error';
        addLog('连接验证失败，请检查服务是否已启动', 'error');
      }
    }

    onSave({
      name: name.trim(),
      modelId: modelId.trim(),
      provider,
      onlineProvider: provider === 'online' ? onlineProvider : undefined,
      apiUrl: provider !== 'online' ? apiUrl : undefined,
      apiKey: provider === 'online' ? apiKey : undefined,
      maxContextLength,
      timeout: requestTimeout,
      rpm,
      pricing: (provider === 'online' || showPricingConfig) && (inputPrice > 0 || outputPrice > 0) 
        ? { inputPrice, outputPrice, currency } 
        : undefined,
      status,
      lastConnected: status === 'active' ? Date.now() : undefined,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, maxHeight: 0 }}
      animate={{ opacity: 1, maxHeight: 1000 }}
      exit={{ opacity: 0, maxHeight: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={cn(
        "overflow-hidden rounded-xl border",
        isDarkMode ? "border-zinc-700" : "border-zinc-200"
      )}
    >
      <div className={cn(
        "p-5 space-y-5",
        isDarkMode ? "bg-zinc-800/50" : "bg-zinc-50"
      )}>
        <div className="flex items-center justify-between">
          <h4 className={cn(
            "text-sm font-medium",
            isDarkMode ? "text-zinc-200" : "text-zinc-900"
          )}>
            {editingConfig ? '编辑模型' : '添加新模型'}
          </h4>
          <button
            onClick={onCancel}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              isDarkMode
                ? "hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200"
                : "hover:bg-zinc-200 text-zinc-500 hover:text-zinc-700"
            )}
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className={cn(
              "text-xs font-medium",
              isDarkMode ? "text-zinc-300" : "text-zinc-600"
            )}>
              模型名称
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setIsNameManuallyEdited(true);
              }}
              placeholder="给模型起个名字"
              className={cn(
                "w-full border rounded-xl px-4 py-2.5 text-sm focus:ring-1 focus:ring-indigo-500/50 outline-none transition-all",
                isDarkMode
                  ? "bg-zinc-700 border-zinc-600 text-zinc-200 placeholder:text-zinc-500"
                  : "bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400"
              )}
            />
          </div>

          <div className="space-y-2">
            <label className={cn(
              "text-xs font-medium",
              isDarkMode ? "text-zinc-300" : "text-zinc-600"
            )}>
              提供商
            </label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'lm-studio' as Provider, icon: Server, label: 'LM Studio' },
                { id: 'ollama' as Provider, icon: Cpu, label: 'Ollama' },
                { id: 'online' as Provider, icon: Globe, label: '在线模型' },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => setProvider(p.id)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-2 p-3 rounded-xl border transition-all",
                    provider === p.id
                      ? "bg-indigo-500/10 border-indigo-500/50 text-indigo-500"
                      : isDarkMode
                        ? "bg-zinc-700/50 border-zinc-600 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                        : "bg-white border-zinc-300 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                  )}
                >
                  <p.icon size={20} />
                  <span className="text-xs font-medium">{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          {provider === 'online' ? (
            <>
              <div className="space-y-2">
                <label className={cn(
                  "text-xs font-medium",
                  isDarkMode ? "text-zinc-300" : "text-zinc-600"
                )}>
                  API Key
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="输入 API Key"
                    className={cn(
                      "flex-1 border rounded-xl px-4 py-2.5 text-sm focus:ring-1 focus:ring-indigo-500/50 outline-none transition-all",
                      isDarkMode
                        ? "bg-zinc-700 border-zinc-600 text-zinc-200"
                        : "bg-white border-zinc-300 text-zinc-900"
                    )}
                  />
                  <a
                    href={onlineProviders[onlineProvider]?.apiKeyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "px-4 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center whitespace-nowrap",
                      isDarkMode
                        ? "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
                        : "bg-zinc-200 hover:bg-zinc-300 text-zinc-700"
                    )}
                  >
                    获取
                  </a>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className={cn(
                    "text-xs font-medium",
                    isDarkMode ? "text-zinc-300" : "text-zinc-600"
                  )}>
                    厂商
                  </label>
                  <div className="relative">
                    <button
                      onClick={() => setIsOnlineProviderDropdownOpen(!isOnlineProviderDropdownOpen)}
                      className={cn(
                        "w-full flex items-center gap-2 border rounded-xl px-4 py-2.5 text-sm focus:ring-1 focus:ring-indigo-500/50 outline-none",
                        isDarkMode
                          ? "bg-zinc-700 border-zinc-600 text-zinc-200"
                          : "bg-white border-zinc-300 text-zinc-900"
                      )}
                    >
                      <img src={onlineProviders[onlineProvider]?.logo} alt="" className="w-5 h-5 rounded-sm" />
                      {onlineProviders[onlineProvider]?.name}
                    </button>
                    {isOnlineProviderDropdownOpen && (
                      <div className={cn(
                        "absolute z-10 w-full mt-1 border rounded-xl shadow-lg max-h-60 overflow-y-auto",
                        isDarkMode
                          ? "bg-zinc-800 border-zinc-700"
                          : "bg-white border-zinc-200"
                      )}>
                        {Object.entries(onlineProviders).map(([id, p]) => (
                          <button
                            key={id}
                            onClick={() => {
                              setOnlineProvider(id);
                              setModelId(p.models[0]);
                              setIsOnlineProviderDropdownOpen(false);
                              setIsNameManuallyEdited(false);
                            }}
                            className={cn(
                              "w-full flex items-center gap-2 px-4 py-2 text-sm",
                              isDarkMode
                                ? "hover:bg-zinc-700 text-zinc-200"
                                : "hover:bg-zinc-100 text-zinc-900"
                            )}
                          >
                            <img src={p.logo} alt="" className="w-5 h-5 rounded-sm" />
                            {p.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className={cn(
                    "text-xs font-medium",
                    isDarkMode ? "text-zinc-300" : "text-zinc-600"
                  )}>
                    模型
                  </label>
                  <div className="relative">
                    <button
                      onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                      className={cn(
                        "w-full flex items-center gap-2 border rounded-xl px-4 py-2.5 text-sm focus:ring-1 focus:ring-indigo-500/50 outline-none",
                        isDarkMode
                          ? "bg-zinc-700 border-zinc-600 text-zinc-200"
                          : "bg-white border-zinc-300 text-zinc-900"
                      )}
                    >
                      <img src={onlineProviders[onlineProvider]?.logo} alt="" className="w-5 h-5 rounded-sm" />
                      {modelId}
                    </button>
                    {isModelDropdownOpen && (
                      <div className={cn(
                        "absolute z-10 w-full mt-1 border rounded-xl shadow-lg max-h-60 overflow-y-auto",
                        isDarkMode
                          ? "bg-zinc-800 border-zinc-700"
                          : "bg-white border-zinc-200"
                      )}>
                        {onlineProviders[onlineProvider]?.models.map((model) => (
                          <button
                            key={model}
                            onClick={() => {
                              setModelId(model);
                              setIsModelDropdownOpen(false);
                              setIsNameManuallyEdited(false);
                            }}
                            className={cn(
                              "w-full flex items-center gap-2 px-4 py-2 text-sm",
                              isDarkMode
                                ? "hover:bg-zinc-700 text-zinc-200"
                                : "hover:bg-zinc-100 text-zinc-900"
                            )}
                          >
                            <img src={onlineProviders[onlineProvider]?.logo} alt="" className="w-5 h-5 rounded-sm" />
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
                <label className={cn(
                  "text-xs font-medium",
                  isDarkMode ? "text-zinc-300" : "text-zinc-600"
                )}>
                  API URL
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    placeholder="API 地址"
                    className={cn(
                      "flex-1 border rounded-xl px-4 py-2.5 text-sm focus:ring-1 focus:ring-indigo-500/50 outline-none transition-all",
                      isDarkMode
                        ? "bg-zinc-700 border-zinc-600 text-zinc-200"
                        : "bg-white border-zinc-300 text-zinc-900"
                    )}
                  />
                  <button
                    onClick={testConnection}
                    disabled={isTestingConnection}
                    className={cn(
                      "px-4 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50",
                      isDarkMode
                        ? "bg-zinc-700 hover:bg-zinc-600 text-zinc-200"
                        : "bg-zinc-200 hover:bg-zinc-300 text-zinc-800"
                    )}
                  >
                    {isTestingConnection ? (
                      <RefreshCw size={16} className="animate-spin" />
                    ) : (
                      <Activity size={16} />
                    )}
                    测试
                  </button>
                </div>
                {connectionStatus === 'success' && (
                  <p className="text-xs text-emerald-500 flex items-center gap-1 mt-1">
                    <CheckCircle2 size={12} /> 连接成功
                  </p>
                )}
                {connectionStatus === 'error' && (
                  <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                    <XCircle size={12} /> 连接失败
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className={cn(
                    "text-xs font-medium",
                    isDarkMode ? "text-zinc-300" : "text-zinc-600"
                  )}>
                    模型
                  </label>
                  <button
                    onClick={fetchModels}
                    disabled={isFetchingModels}
                    className={cn(
                      "text-xs flex items-center gap-1 disabled:opacity-50",
                      isDarkMode
                        ? "text-indigo-400 hover:text-indigo-300"
                        : "text-indigo-600 hover:text-indigo-500"
                    )}
                  >
                    <RefreshCw size={10} className={isFetchingModels ? "animate-spin" : ""} />
                    获取列表
                  </button>
                </div>
                {availableModels.length > 0 ? (
                  <select
                    value={modelId}
                    onChange={(e) => {
                      setModelId(e.target.value);
                      setIsNameManuallyEdited(false);
                    }}
                    className={cn(
                      "w-full border rounded-xl px-4 py-2.5 text-sm focus:ring-1 focus:ring-indigo-500/50 outline-none appearance-none",
                      isDarkMode
                        ? "bg-zinc-700 border-zinc-600 text-zinc-200"
                        : "bg-white border-zinc-300 text-zinc-900"
                    )}
                  >
                    {availableModels.map((model) => (
                      <option key={model} value={model}>{model}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={modelId}
                    onChange={(e) => {
                      setModelId(e.target.value);
                      setIsNameManuallyEdited(false);
                    }}
                    placeholder="输入模型名称"
                    className={cn(
                      "w-full border rounded-xl px-4 py-2.5 text-sm focus:ring-1 focus:ring-indigo-500/50 outline-none transition-all",
                      isDarkMode
                        ? "bg-zinc-700 border-zinc-600 text-zinc-200"
                        : "bg-white border-zinc-300 text-zinc-900"
                    )}
                  />
                )}
              </div>
            </>
          )}

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className={cn(
                "text-xs font-medium",
                isDarkMode ? "text-zinc-300" : "text-zinc-600"
              )}>
                最大上下文长度
              </label>
              <input
                type="number"
                value={maxContextLength}
                onChange={(e) => setMaxContextLength(parseInt(e.target.value) || 4096)}
                className={cn(
                  "w-24 border rounded-lg px-3 py-1.5 text-sm text-right focus:ring-1 focus:ring-indigo-500/50 outline-none",
                  isDarkMode
                    ? "bg-zinc-700 border-zinc-600 text-zinc-200"
                    : "bg-white border-zinc-300 text-zinc-900"
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
            <div className={cn(
              "flex justify-between text-[10px]",
              isDarkMode ? "text-zinc-500" : "text-zinc-400"
            )}>
              <span>1K</span>
              <span>32K</span>
              <span>128K</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className={cn(
                "text-xs font-medium",
                isDarkMode ? "text-zinc-300" : "text-zinc-600"
              )}>
                请求超时（秒）
              </label>
              <input
                type="number"
                min="10"
                max="600"
                value={requestTimeout}
                onChange={(e) => setRequestTimeout(parseInt(e.target.value) || 60)}
                className={cn(
                  "w-full border rounded-xl px-4 py-2.5 text-sm focus:ring-1 focus:ring-indigo-500/50 outline-none",
                  isDarkMode
                    ? "bg-zinc-700 border-zinc-600 text-zinc-200"
                    : "bg-white border-zinc-300 text-zinc-900"
                )}
              />
            </div>
            <div className="space-y-2">
              <label className={cn(
                "text-xs font-medium",
                isDarkMode ? "text-zinc-300" : "text-zinc-600"
              )}>
                RPM 限流（次/分钟）
              </label>
              <input
                type="number"
                min="0"
                max="1000"
                value={rpm}
                onChange={(e) => setRpm(parseInt(e.target.value) || 0)}
                className={cn(
                  "w-full border rounded-xl px-4 py-2.5 text-sm focus:ring-1 focus:ring-indigo-500/50 outline-none",
                  isDarkMode
                    ? "bg-zinc-700 border-zinc-600 text-zinc-200"
                    : "bg-white border-zinc-300 text-zinc-900"
                )}
              />
              <span className={cn(
                "text-[10px]",
                isDarkMode ? "text-zinc-500" : "text-zinc-400"
              )}>
                0 表示无限制
              </span>
            </div>
          </div>

          {provider !== 'online' && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowPricingConfig(!showPricingConfig)}
                className={cn(
                  "flex items-center justify-between w-full px-3 py-2 rounded-lg text-xs font-medium transition-colors",
                  isDarkMode
                    ? "bg-zinc-700/50 hover:bg-zinc-700 text-zinc-300"
                    : "bg-zinc-100 hover:bg-zinc-200 text-zinc-600"
                )}
              >
                <span>定价配置（测试功能）</span>
                {showPricingConfig ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              
              <AnimatePresence>
                {showPricingConfig && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-3 space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <span className={cn(
                            "text-[10px]",
                            isDarkMode ? "text-zinc-500" : "text-zinc-400"
                          )}>
                            输入价格
                          </span>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setCurrency(currency === 'USD' ? 'CNY' : 'USD')}
                              className={cn(
                                "absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium transition-colors",
                                isDarkMode
                                  ? "text-zinc-400 hover:text-zinc-200"
                                  : "text-zinc-500 hover:text-zinc-700"
                              )}
                            >
                              {currency === 'USD' ? '$' : '¥'}
                            </button>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={inputPrice}
                              onChange={(e) => setInputPrice(parseFloat(e.target.value) || 0)}
                              placeholder="0.00"
                              className={cn(
                                "w-full border rounded-xl py-2 text-sm focus:ring-1 focus:ring-indigo-500/50 outline-none",
                                isDarkMode
                                  ? "bg-zinc-700 border-zinc-600 text-zinc-200 pl-8 pr-4"
                                  : "bg-white border-zinc-300 text-zinc-900 pl-8 pr-4"
                              )}
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <span className={cn(
                            "text-[10px]",
                            isDarkMode ? "text-zinc-500" : "text-zinc-400"
                          )}>
                            输出价格
                          </span>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setCurrency(currency === 'USD' ? 'CNY' : 'USD')}
                              className={cn(
                                "absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium transition-colors",
                                isDarkMode
                                  ? "text-zinc-400 hover:text-zinc-200"
                                  : "text-zinc-500 hover:text-zinc-700"
                              )}
                            >
                              {currency === 'USD' ? '$' : '¥'}
                            </button>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={outputPrice}
                              onChange={(e) => setOutputPrice(parseFloat(e.target.value) || 0)}
                              placeholder="0.00"
                              className={cn(
                                "w-full border rounded-xl py-2 text-sm focus:ring-1 focus:ring-indigo-500/50 outline-none",
                                isDarkMode
                                  ? "bg-zinc-700 border-zinc-600 text-zinc-200 pl-8 pr-4"
                                  : "bg-white border-zinc-300 text-zinc-900 pl-8 pr-4"
                              )}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {provider === 'online' && (
            <div className="space-y-3">
              <label className={cn(
                "text-xs font-medium",
                isDarkMode ? "text-zinc-300" : "text-zinc-600"
              )}>
                定价配置（每百万tokens/{currency === 'USD' ? '美元' : '人民币'}）
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className={cn(
                    "text-[10px]",
                    isDarkMode ? "text-zinc-500" : "text-zinc-400"
                  )}>
                    输入价格
                  </span>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setCurrency(currency === 'USD' ? 'CNY' : 'USD')}
                      className={cn(
                        "absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium transition-colors",
                        isDarkMode
                          ? "text-zinc-400 hover:text-zinc-200"
                          : "text-zinc-500 hover:text-zinc-700"
                      )}
                    >
                      {currency === 'USD' ? '$' : '¥'}
                    </button>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={inputPrice}
                      onChange={(e) => setInputPrice(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className={cn(
                        "w-full border rounded-xl py-2 text-sm focus:ring-1 focus:ring-indigo-500/50 outline-none",
                        isDarkMode
                          ? "bg-zinc-700 border-zinc-600 text-zinc-200 pl-8 pr-4"
                          : "bg-white border-zinc-300 text-zinc-900 pl-8 pr-4"
                      )}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <span className={cn(
                    "text-[10px]",
                    isDarkMode ? "text-zinc-500" : "text-zinc-400"
                  )}>
                    输出价格
                  </span>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setCurrency(currency === 'USD' ? 'CNY' : 'USD')}
                      className={cn(
                        "absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium transition-colors",
                        isDarkMode
                          ? "text-zinc-400 hover:text-zinc-200"
                          : "text-zinc-500 hover:text-zinc-700"
                      )}
                    >
                      {currency === 'USD' ? '$' : '¥'}
                    </button>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={outputPrice}
                      onChange={(e) => setOutputPrice(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className={cn(
                        "w-full border rounded-xl py-2 text-sm focus:ring-1 focus:ring-indigo-500/50 outline-none",
                        isDarkMode
                          ? "bg-zinc-700 border-zinc-600 text-zinc-200 pl-8 pr-4"
                          : "bg-white border-zinc-300 text-zinc-900 pl-8 pr-4"
                      )}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onCancel}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-medium transition-colors",
              isDarkMode
                ? "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
                : "bg-zinc-200 hover:bg-zinc-300 text-zinc-700"
            )}
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-colors"
          >
            {editingConfig ? '保存修改' : '添加模型'}
          </button>
        </div>
      </div>
    </motion.div>
  );
};
