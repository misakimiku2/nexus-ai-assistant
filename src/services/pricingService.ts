import { ModelPricing } from '../types';
import { AGGREGATOR_PROVIDERS, ONLINE_PROVIDERS, isAggregatorProvider } from '../config/aggregatorProviders';

interface OpenRouterModel {
  id: string;
  name: string;
  pricing: {
    prompt: string;
    completion: string;
    image?: string;
    request?: string;
  };
  context_length: number;
}

interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

interface OpenAIModelsResponse {
  data: { id: string; object: string; owned_by?: string }[];
}

let openRouterModelsCache: OpenRouterModel[] | null = null;
let openRouterCacheTime: number = 0;
const CACHE_DURATION = 5 * 60 * 1000;

export async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  const now = Date.now();
  
  if (openRouterModelsCache && (now - openRouterCacheTime) < CACHE_DURATION) {
    return openRouterModelsCache;
  }
  
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data: OpenRouterModelsResponse = await response.json();
    openRouterModelsCache = data.data;
    openRouterCacheTime = now;
    return data.data;
  } catch (error) {
    console.error('Failed to fetch OpenRouter models:', error);
    return [];
  }
}

export async function fetchOpenRouterPricing(modelId: string): Promise<ModelPricing | null> {
  try {
    const models = await fetchOpenRouterModels();
    const model = models.find(m => m.id === modelId);
    
    if (model?.pricing) {
      const promptPrice = parseFloat(model.pricing.prompt) || 0;
      const completionPrice = parseFloat(model.pricing.completion) || 0;
      
      return {
        inputPrice: promptPrice * 1000000,
        outputPrice: completionPrice * 1000000,
        currency: 'USD',
      };
    }
    return null;
  } catch (error) {
    console.error('Failed to fetch OpenRouter pricing:', error);
    return null;
  }
}

export async function fetchModelsFromProvider(
  provider: string,
  apiKey: string
): Promise<{ models: string[]; error?: string }> {
  const providerConfig = ONLINE_PROVIDERS[provider];
  if (!providerConfig) {
    return { models: [], error: '未知的提供商' };
  }

  if (!providerConfig.supportsModelList) {
    return { models: [], error: '该提供商不支持获取模型列表，请手动输入模型ID' };
  }

  const apiUrl = providerConfig.apiUrl;
  if (!apiUrl) {
    return { models: [], error: '该提供商未配置 API 地址' };
  }

  try {
    let modelsEndpoint = apiUrl;
    
    if (provider === 'openrouter') {
      const openRouterModels = await fetchOpenRouterModels();
      return { models: openRouterModels.map(m => m.id) };
    }
    
    if (provider === 'zhipu') {
      modelsEndpoint = 'https://open.bigmodel.cn/api/paas/v4/models';
    } else if (apiUrl.includes('/v1')) {
      modelsEndpoint = apiUrl.replace(/\/v1.*$/, '/v1/models');
    } else if (!apiUrl.endsWith('/models')) {
      modelsEndpoint = apiUrl.replace(/\/$/, '') + '/models';
    }
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (provider === 'google') {
      headers['x-goog-api-key'] = apiKey;
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
    const response = await fetch(modelsEndpoint, {
      method: 'GET',
      headers,
    });
    
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.error?.message) {
          errorMessage = errorData.error.message;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch {
        const errorText = await response.text();
        if (errorText) errorMessage = errorText;
      }
      return { models: [], error: `API Key 无效或请求失败: ${errorMessage}` };
    }
    
    const data: OpenAIModelsResponse = await response.json();
    
    if (data.data && Array.isArray(data.data)) {
      const models = data.data
        .filter(m => m.object === 'model' || m.id)
        .map(m => m.id)
        .sort();
      return { models };
    }
    
    return { models: [], error: '未获取到任何模型' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '获取模型列表失败';
    console.error(`Failed to fetch models from ${provider}:`, error);
    return { models: [], error: `网络错误: ${errorMessage}` };
  }
}

export function getDefaultCurrencyForProvider(provider: string): 'USD' | 'CNY' {
  if (isAggregatorProvider(provider)) {
    return AGGREGATOR_PROVIDERS[provider]?.currency || 'USD';
  }
  
  const cnyProviders = ['zhipu', 'minimax', 'kimi', 'deepseek', 'bailian', 'siliconflow', 'dmxapi', 'xiaomi'];
  return cnyProviders.includes(provider) ? 'CNY' : 'USD';
}

export function getProviderPricingUrl(provider: string): string | undefined {
  if (isAggregatorProvider(provider)) {
    return AGGREGATOR_PROVIDERS[provider]?.pricingUrl;
  }
  
  const pricingUrls: Record<string, string> = {
    openai: 'https://openai.com/api/pricing',
    anthropic: 'https://www.anthropic.com/pricing',
    google: 'https://ai.google.dev/pricing',
    deepseek: 'https://api-docs.deepseek.com/quick_start/pricing',
    zhipu: 'https://open.bigmodel.cn/pricing',
    minimax: 'https://www.minimaxi.com/document/pricing',
    kimi: 'https://platform.moonshot.cn/docs/pricing',
  };
  
  return pricingUrls[provider];
}

export function getProviderApiUrl(provider: string): string {
  if (isAggregatorProvider(provider)) {
    return AGGREGATOR_PROVIDERS[provider]?.apiUrl || '';
  }
  
  return ONLINE_PROVIDERS[provider]?.apiUrl || '';
}
