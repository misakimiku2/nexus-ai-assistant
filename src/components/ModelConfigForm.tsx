import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Globe, Activity, RefreshCw, CheckCircle2, XCircle, X, ChevronDown, ChevronRight, DollarSign, ExternalLink, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { ModelConfig, ModelPricing } from '../types';
import { ONLINE_PROVIDERS, isAggregatorProvider } from '../config/aggregatorProviders';
import { fetchOpenRouterPricing, fetchModelsFromProvider, getDefaultCurrencyForProvider, getProviderPricingUrl } from '../services/pricingService';
import { getPricingForProviderModel, PRICING_LAST_UPDATED } from '../data/modelPricing';
import { ModelLogo, ProviderLogo } from './ModelLogo';

interface ModelConfigFormProps {
  isDarkMode: boolean;
  editingConfig?: ModelConfig | null;
  onSave: (config: Omit<ModelConfig, 'id' | 'createdAt' | 'priority'>) => void;
  onCancel: () => void;
  addLog: (message: string, type?: 'info' | 'error' | 'command') => void;
}

const onlineProviders: Record<string, { name: string; models: string[]; apiKeyUrl: string; apiUrl: string; isAggregator?: boolean; supportsModelList?: boolean; isCustom?: boolean }> = {
  google: { name: 'Google', models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'], apiKeyUrl: 'https://aistudio.google.com/app/apikey', apiUrl: 'https://generativelanguage.googleapis.com/v1beta', supportsModelList: true },
  openai: { name: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'], apiKeyUrl: 'https://platform.openai.com/api-keys', apiUrl: 'https://api.openai.com/v1', supportsModelList: true },
  anthropic: { name: 'Anthropic', models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-sonnet-4-20250514', 'claude-opus-4-20250514'], apiKeyUrl: 'https://console.anthropic.com/settings/keys', apiUrl: 'https://api.anthropic.com/v1' },
  deepseek: { name: 'DeepSeek', models: ['deepseek-chat', 'deepseek-reasoner'], apiKeyUrl: 'https://platform.deepseek.com/api_keys', apiUrl: 'https://api.deepseek.com/v1', supportsModelList: true },
  zhipu: { name: '智谱', models: ['glm-4-plus', 'glm-4-air', 'glm-4-flash', 'glm-4-long'], apiKeyUrl: 'https://open.bigmodel.cn/api-keys', apiUrl: 'https://open.bigmodel.cn/api/paas/v4', supportsModelList: true },
  minimax: { name: 'MiniMax', models: ['abab6.5s-chat', 'abab6.5g-chat', 'abab6.5t-chat', 'abab5.5-chat'], apiKeyUrl: 'https://www.minimaxi.com/user-center/basic-information/interface-key', apiUrl: 'https://api.minimax.chat/v1', supportsModelList: true },
  kimi: { name: 'Kimi (月之暗面)', models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'], apiKeyUrl: 'https://platform.moonshot.cn/api-keys', apiUrl: 'https://api.moonshot.cn/v1', supportsModelList: true },
  xiaomi: { name: '小米 MiMo', models: ['MiMo-7B-RL'], apiKeyUrl: 'https://xiaomi.com', apiUrl: '', supportsModelList: false },
  openrouter: { name: 'OpenRouter', models: [], apiKeyUrl: 'https://openrouter.ai/keys', apiUrl: 'https://openrouter.ai/api/v1', isAggregator: true, supportsModelList: true },
  dmxapi: { name: 'DMXAPI', models: [], apiKeyUrl: 'https://dmxapi.cn', apiUrl: 'https://api.dmxapi.cn/v1', isAggregator: true, supportsModelList: true },
  siliconflow: { name: '硅基流动', models: [], apiKeyUrl: 'https://cloud.siliconflow.cn', apiUrl: 'https://api.siliconflow.cn/v1', isAggregator: true, supportsModelList: true },
  bailian: { name: '阿里云百炼', models: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen-long', 'qwq-plus', 'qwq-32b'], apiKeyUrl: 'https://dashscope.console.aliyun.com/apiKey', apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', isAggregator: true, supportsModelList: true },
  custom: { name: '自定义平台', models: [], apiKeyUrl: '', apiUrl: '', isAggregator: true, supportsModelList: false, isCustom: true },
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
  const [customApiUrl, setCustomApiUrl] = useState(editingConfig?.apiUrl || '');
  const [modelId, setModelId] = useState(editingConfig?.modelId || '');
  const [apiKey, setApiKey] = useState(editingConfig?.apiKey || '');
  const [onlineProvider, setOnlineProvider] = useState(editingConfig?.onlineProvider || 'google');
  const [maxContextLength, setMaxContextLength] = useState(editingConfig?.maxContextLength || 4096);
  const [requestTimeout, setRequestTimeout] = useState(editingConfig?.timeout || 60);
  const [rpm, setRpm] = useState(editingConfig?.rpm || 60);
  const [inputPrice, setInputPrice] = useState(editingConfig?.pricing?.inputPrice || 0);
  const [outputPrice, setOutputPrice] = useState(editingConfig?.pricing?.outputPrice || 0);
  const [cacheHitPrice, setCacheHitPrice] = useState(editingConfig?.pricing?.cacheHitPrice || 0);
  const [cacheWritePrice, setCacheWritePrice] = useState(editingConfig?.pricing?.cacheWritePrice || 0);
  const [currency, setCurrency] = useState<'USD' | 'CNY'>(editingConfig?.pricing?.currency || 'USD');
  const [isNameManuallyEdited, setIsNameManuallyEdited] = useState(false);
  
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [isFetchingOnlineModels, setIsFetchingOnlineModels] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [isOnlineProviderDropdownOpen, setIsOnlineProviderDropdownOpen] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [showPricingConfig, setShowPricingConfig] = useState(false);
  const [showCachePricing, setShowCachePricing] = useState(false);
  const [isFetchingPricing, setIsFetchingPricing] = useState(false);
  const [pricingSource, setPricingSource] = useState<'api' | 'predefined' | 'none'>('none');
  const [localLogs, setLocalLogs] = useState<{ message: string; type: 'info' | 'error' | 'success' }[]>([]);

  const localAddLog = useCallback((message: string, type: 'info' | 'error' | 'success' = 'info') => {
    setLocalLogs(prev => [...prev, { message, type }]);
    addLog(message, type === 'success' ? 'info' : type);
  }, [addLog]);

  useEffect(() => {
    if (provider === 'online') {
      setApiKey('');
      setFetchedModels([]);
      setModelId('');
      setCustomApiUrl('');
      const defaultCurrency = getDefaultCurrencyForProvider(onlineProvider);
      setCurrency(defaultCurrency);
      if (onlineProviders[onlineProvider]?.models.length > 0) {
        setModelId(onlineProviders[onlineProvider].models[0]);
      }
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

  const handleFetchPricing = useCallback(async () => {
    if (!modelId?.trim()) {
      localAddLog('请先选择或输入模型ID', 'error');
      return;
    }

    setIsFetchingPricing(true);
    setPricingSource('none');

    try {
      if (onlineProvider === 'openrouter') {
        const pricing = await fetchOpenRouterPricing(modelId);
        if (pricing) {
          setInputPrice(pricing.inputPrice);
          setOutputPrice(pricing.outputPrice);
          setCurrency(pricing.currency);
          if (pricing.cacheHitPrice) {
            setCacheHitPrice(pricing.cacheHitPrice);
            setShowCachePricing(true);
          }
          setPricingSource('api');
          localAddLog(`已从 OpenRouter API 获取价格信息`, 'success');
        } else {
          throw new Error('未找到该模型的价格信息');
        }
      } else {
        const pricing = getPricingForProviderModel(onlineProvider, modelId);
        if (pricing) {
          setInputPrice(pricing.inputPrice);
          setOutputPrice(pricing.outputPrice);
          setCurrency(pricing.currency);
          if (pricing.cacheHitPrice) {
            setCacheHitPrice(pricing.cacheHitPrice);
            setShowCachePricing(true);
          }
          if (pricing.cacheWritePrice) {
            setCacheWritePrice(pricing.cacheWritePrice);
          }
          setPricingSource('predefined');
          localAddLog(`已从预定义数据获取价格信息`, 'success');
        } else {
          localAddLog('未找到该模型的预定义价格，请手动输入', 'error');
        }
      }
    } catch (error) {
      localAddLog(`获取价格失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
    } finally {
      setIsFetchingPricing(false);
    }
  }, [modelId, onlineProvider, localAddLog]);

  const handleFetchOnlineModels = useCallback(async () => {
    if (!apiKey?.trim()) {
      localAddLog('请先输入 API Key', 'error');
      return;
    }

    setIsFetchingOnlineModels(true);
    setFetchedModels([]);

    try {
      const result = await fetchModelsFromProvider(onlineProvider, apiKey);
      
      if (result.error) {
        localAddLog(result.error, 'error');
      }
      
      if (result.models.length > 0) {
        setFetchedModels(result.models);
        localAddLog(`成功获取到 ${result.models.length} 个模型`, 'success');
      } else if (!result.error) {
        localAddLog('未获取到任何模型', 'error');
      }
    } catch (error) {
      localAddLog(`获取模型列表失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
    } finally {
      setIsFetchingOnlineModels(false);
    }
  }, [onlineProvider, apiKey, localAddLog]);

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
          localAddLog(`成功获取到 ${models.length} 个模型`, 'success');
        }
      } else {
        throw new Error('Failed to fetch models');
      }
    } catch (error) {
      localAddLog('获取模型列表失败，请检查服务是否已启动', 'error');
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
        localAddLog('连接测试成功！', 'success');
        fetchModels();
      } else {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      setConnectionStatus('error');
      localAddLog(`连接测试失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSubmit = async () => {
    if (!name?.trim() || !modelId?.trim()) {
      localAddLog('请填写模型名称和模型ID', 'error');
      return;
    }

    if (provider === 'online' && !apiKey?.trim()) {
      localAddLog('请输入 API Key', 'error');
      return;
    }

    if (provider === 'online' && onlineProviders[onlineProvider]?.isCustom && !customApiUrl?.trim()) {
      localAddLog('请输入 API 地址', 'error');
      return;
    }

    let status: 'active' | 'inactive' | 'error' = 'inactive';
    
    if (provider === 'online') {
      localAddLog('正在验证 API Key...', 'info');
      try {
        const result = await fetchModelsFromProvider(onlineProvider, apiKey);
        if (result.error) {
          status = 'error';
          localAddLog(`API Key 验证失败: ${result.error}`, 'error');
        } else if (result.models.length > 0 || onlineProviders[onlineProvider]?.isCustom) {
          status = 'active';
          localAddLog('API Key 验证成功', 'success');
        } else {
          status = 'inactive';
          localAddLog('API Key 验证成功，但未获取到模型列表', 'info');
        }
      } catch (error) {
        status = 'error';
        localAddLog(`验证失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
      }
    } else {
      try {
        const baseUrl = getBaseUrl(apiUrl);
        const response = await fetch(`${baseUrl}/models`);
        if (response.ok) {
          status = 'active';
          localAddLog('连接验证成功', 'success');
        } else {
          status = 'error';
          localAddLog('连接验证失败', 'error');
        }
      } catch {
        status = 'error';
        localAddLog('连接验证失败，请检查服务是否已启动', 'error');
      }
    }

    if (status === 'error') {
      return;
    }

    onSave({
      name: name?.trim() || '',
      modelId: modelId?.trim() || '',
      provider,
      onlineProvider: provider === 'online' ? onlineProvider : undefined,
      apiUrl: provider !== 'online' 
        ? apiUrl 
        : onlineProviders[onlineProvider]?.isCustom 
          ? customApiUrl 
          : undefined,
      apiKey: provider === 'online' ? apiKey : undefined,
      maxContextLength,
      timeout: requestTimeout,
      rpm,
      pricing: (provider === 'online' || showPricingConfig) && (inputPrice > 0 || outputPrice > 0) 
        ? { 
            inputPrice, 
            outputPrice, 
            currency,
            ...(cacheHitPrice > 0 ? { cacheHitPrice } : {}),
            ...(cacheWritePrice > 0 ? { cacheWritePrice } : {}),
          } 
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
                { id: 'lm-studio' as Provider, label: 'LM Studio' },
                { id: 'ollama' as Provider, label: 'Ollama' },
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
                  {'icon' in p && p.icon ? <p.icon size={20} /> : <ProviderLogo provider={p.id} size={20} />}
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
                  {onlineProviders[onlineProvider]?.apiKeyUrl && (
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
                  )}
                </div>
              </div>

              {onlineProviders[onlineProvider]?.isCustom && (
                <div className="space-y-2">
                  <label className={cn(
                    "text-xs font-medium",
                    isDarkMode ? "text-zinc-300" : "text-zinc-600"
                  )}>
                    API 地址
                  </label>
                  <input
                    type="text"
                    value={customApiUrl}
                    onChange={(e) => setCustomApiUrl(e.target.value)}
                    placeholder="输入 API 地址（如：https://api.example.com/v1）"
                    className={cn(
                      "w-full border rounded-xl px-4 py-2.5 text-sm focus:ring-1 focus:ring-indigo-500/50 outline-none transition-all",
                      isDarkMode
                        ? "bg-zinc-700 border-zinc-600 text-zinc-200"
                        : "bg-white border-zinc-300 text-zinc-900"
                    )}
                  />
                </div>
              )}

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
                      <ProviderLogo provider={onlineProvider} size={20} />
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
                            <ProviderLogo provider={id} size={20} />
                            {p.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className={cn(
                      "text-xs font-medium",
                      isDarkMode ? "text-zinc-300" : "text-zinc-600"
                    )}>
                      模型
                    </label>
                    {onlineProviders[onlineProvider]?.supportsModelList && (
                      <button
                        type="button"
                        onClick={handleFetchOnlineModels}
                        disabled={isFetchingOnlineModels || !apiKey?.trim()}
                        className={cn(
                          "text-xs flex items-center gap-1 disabled:opacity-50",
                          isDarkMode
                            ? "text-indigo-400 hover:text-indigo-300"
                            : "text-indigo-600 hover:text-indigo-500"
                        )}
                      >
                        <RefreshCw size={10} className={isFetchingOnlineModels ? "animate-spin" : ""} />
                        获取列表
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    {(fetchedModels.length > 0 || onlineProviders[onlineProvider]?.models.length > 0) ? (
                      <>
                        <button
                          onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                          className={cn(
                            "w-full flex items-center gap-2 border rounded-xl px-4 py-2.5 text-sm focus:ring-1 focus:ring-indigo-500/50 outline-none",
                            isDarkMode
                              ? "bg-zinc-700 border-zinc-600 text-zinc-200"
                              : "bg-white border-zinc-300 text-zinc-900"
                          )}
                        >
                          <ModelLogo provider={onlineProvider} modelId={modelId} size={20} />
                          {modelId || '选择模型'}
                        </button>
                        {isModelDropdownOpen && (
                          <div className={cn(
                            "absolute z-10 w-full mt-1 border rounded-xl shadow-lg max-h-60 overflow-y-auto",
                            isDarkMode
                              ? "bg-zinc-800 border-zinc-700"
                              : "bg-white border-zinc-200"
                          )}>
                            {(fetchedModels.length > 0 ? fetchedModels : onlineProviders[onlineProvider]?.models || []).map((model) => (
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
                                <ModelLogo provider={onlineProvider} modelId={model} size={20} />
                                {model}
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <input
                        type="text"
                        value={modelId}
                        onChange={(e) => {
                          setModelId(e.target.value);
                          setIsNameManuallyEdited(false);
                        }}
                        placeholder={onlineProviders[onlineProvider]?.isAggregator 
                          ? "输入模型ID（如：openai/gpt-4o）" 
                          : "输入模型名称"}
                        className={cn(
                          "w-full border rounded-xl px-4 py-2.5 text-sm focus:ring-1 focus:ring-indigo-500/50 outline-none transition-all",
                          isDarkMode
                            ? "bg-zinc-700 border-zinc-600 text-zinc-200 placeholder:text-zinc-500"
                            : "bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400"
                        )}
                      />
                    )}
                  </div>
                  {onlineProviders[onlineProvider]?.isAggregator && (
                    <p className={cn(
                      "text-[10px]",
                      isDarkMode ? "text-zinc-500" : "text-zinc-400"
                    )}>
                      聚合平台支持多种模型，请输入完整模型ID或点击"获取列表"
                    </p>
                  )}
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
              <div className="flex items-center justify-between">
                <label className={cn(
                  "text-xs font-medium",
                  isDarkMode ? "text-zinc-300" : "text-zinc-600"
                )}>
                  定价配置（每百万tokens/{currency === 'USD' ? '美元' : '人民币'}）
                </label>
                <div className="flex items-center gap-2">
                  {pricingSource !== 'none' && (
                    <span className={cn(
                      "text-[10px]",
                      isDarkMode ? "text-zinc-500" : "text-zinc-400"
                    )}>
                      {pricingSource === 'api' ? 'API获取' : '预定义数据'}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleFetchPricing}
                    disabled={isFetchingPricing || !modelId?.trim()}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-50",
                      isDarkMode
                        ? "bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400"
                        : "bg-indigo-100 hover:bg-indigo-200 text-indigo-600"
                    )}
                  >
                    {isFetchingPricing ? (
                      <RefreshCw size={12} className="animate-spin" />
                    ) : (
                      <DollarSign size={12} />
                    )}
                    获取价格
                  </button>
                  {getProviderPricingUrl(onlineProvider) && (
                    <a
                      href={getProviderPricingUrl(onlineProvider)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "p-1 rounded transition-colors",
                        isDarkMode
                          ? "hover:bg-zinc-700 text-zinc-400"
                          : "hover:bg-zinc-200 text-zinc-500"
                      )}
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className={cn(
                    "text-[10px]",
                    isDarkMode ? "text-zinc-500" : "text-zinc-400"
                  )}>
                    输入价格（缓存未命中）
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
                      value={inputPrice || ''}
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
                      value={outputPrice || ''}
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
              
              <button
                type="button"
                onClick={() => setShowCachePricing(!showCachePricing)}
                className={cn(
                  "flex items-center justify-between w-full px-3 py-2 rounded-lg text-xs font-medium transition-colors",
                  isDarkMode
                    ? "bg-zinc-700/50 hover:bg-zinc-700 text-zinc-300"
                    : "bg-zinc-100 hover:bg-zinc-200 text-zinc-600"
                )}
              >
                <span>缓存价格配置（可选）</span>
                {showCachePricing ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              
              <AnimatePresence>
                {showCachePricing && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-3 pt-2">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <span className={cn(
                            "text-[10px]",
                            isDarkMode ? "text-zinc-500" : "text-zinc-400"
                          )}>
                            缓存命中价格
                          </span>
                          <div className="relative">
                            <span className={cn(
                              "absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium",
                              isDarkMode ? "text-zinc-400" : "text-zinc-500"
                            )}>
                              {currency === 'USD' ? '$' : '¥'}
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={cacheHitPrice || ''}
                              onChange={(e) => setCacheHitPrice(parseFloat(e.target.value) || 0)}
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
                            缓存写入价格
                          </span>
                          <div className="relative">
                            <span className={cn(
                              "absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium",
                              isDarkMode ? "text-zinc-400" : "text-zinc-500"
                            )}>
                              {currency === 'USD' ? '$' : '¥'}
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={cacheWritePrice || ''}
                              onChange={(e) => setCacheWritePrice(parseFloat(e.target.value) || 0)}
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
                      <p className={cn(
                        "text-[10px]",
                        isDarkMode ? "text-zinc-500" : "text-zinc-400"
                      )}>
                        💡 缓存命中价格通常为输入价格的 10%-50%，缓存写入价格仅部分厂商支持
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              
              <p className={cn(
                "text-[10px]",
                isDarkMode ? "text-zinc-500" : "text-zinc-400"
              )}>
                价格数据最后更新: {PRICING_LAST_UPDATED}
              </p>
            </div>
          )}
        </div>

        <AnimatePresence mode="wait">
          {localLogs.length > 0 && (
            <motion.div
              key={localLogs[localLogs.length - 1].message}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
            >
              <div className={cn(
                "rounded-xl p-3 flex items-center gap-2 text-xs",
                localLogs[localLogs.length - 1].type === 'error' 
                  ? isDarkMode ? "bg-red-500/10 text-red-400" : "bg-red-50 text-red-600"
                  : localLogs[localLogs.length - 1].type === 'success'
                    ? isDarkMode ? "bg-green-500/10 text-green-400" : "bg-green-50 text-green-600"
                    : isDarkMode ? "bg-zinc-800/50 text-zinc-400" : "bg-zinc-100 text-zinc-600"
              )}>
                {localLogs[localLogs.length - 1].type === 'error' && <AlertCircle size={14} />}
                {localLogs[localLogs.length - 1].type === 'success' && <CheckCircle2 size={14} />}
                {localLogs[localLogs.length - 1].type === 'info' && <Activity size={14} />}
                {localLogs[localLogs.length - 1].message}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
