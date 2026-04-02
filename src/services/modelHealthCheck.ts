import { ModelConfig } from '../types';

export interface HealthCheckResult {
  status: 'active' | 'error';
  error?: string;
  latency?: number;
  timestamp: number;
}

export async function checkModelHealth(config: ModelConfig): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const timeout = (config.timeout || 60) * 1000;
  
  try {
    if (config.provider === 'online') {
      return await checkOnlineModelHealth(config, timeout, startTime);
    } else {
      return await checkLocalModelHealth(config, timeout, startTime);
    }
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      latency: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }
}

async function checkLocalModelHealth(config: ModelConfig, timeout: number, startTime: number): Promise<HealthCheckResult> {
  const apiUrl = config.apiUrl || getDefaultApiUrl(config.provider);
  const baseUrl = getBaseUrl(apiUrl);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      return {
        status: 'active',
        latency: Date.now() - startTime,
        timestamp: Date.now(),
      };
    } else {
      return {
        status: 'error',
        error: `HTTP ${response.status}: ${response.statusText}`,
        latency: Date.now() - startTime,
        timestamp: Date.now(),
      };
    }
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        status: 'error',
        error: 'Connection timeout',
        latency: Date.now() - startTime,
        timestamp: Date.now(),
      };
    }
    
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Connection failed',
      latency: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }
}

async function checkOnlineModelHealth(config: ModelConfig, timeout: number, startTime: number): Promise<HealthCheckResult> {
  if (!config.apiKey) {
    return {
      status: 'error',
      error: 'API key is required for online models',
      latency: 0,
      timestamp: Date.now(),
    };
  }
  
  const apiUrl = getOnlineModelApiUrl(config.onlineProvider);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (config.onlineProvider === 'anthropic') {
    headers['x-api-key'] = config.apiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(`${apiUrl}/models`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      return {
        status: 'active',
        latency: Date.now() - startTime,
        timestamp: Date.now(),
      };
    } else if (response.status === 401) {
      return {
        status: 'error',
        error: 'Invalid API key',
        latency: Date.now() - startTime,
        timestamp: Date.now(),
      };
    } else {
      return {
        status: 'active',
        latency: Date.now() - startTime,
        timestamp: Date.now(),
      };
    }
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        status: 'error',
        error: 'Connection timeout',
        latency: Date.now() - startTime,
        timestamp: Date.now(),
      };
    }
    
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Connection failed',
      latency: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }
}

function getDefaultApiUrl(provider: 'lm-studio' | 'ollama' | 'online'): string {
  switch (provider) {
    case 'lm-studio':
      return 'http://localhost:1234/v1/chat/completions';
    case 'ollama':
      return 'http://localhost:11434/api/chat';
    default:
      return '';
  }
}

function getBaseUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.host}/v1`;
  } catch {
    return url.replace('/chat/completions', '').replace('/api/chat', '');
  }
}

function getOnlineModelApiUrl(provider?: string): string {
  switch (provider) {
    case 'google':
      return 'https://generativelanguage.googleapis.com/v1beta';
    case 'openai':
      return 'https://api.openai.com/v1';
    case 'anthropic':
      return 'https://api.anthropic.com/v1';
    case 'alibaba':
      return 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    case 'deepseek':
      return 'https://api.deepseek.com/v1';
    case 'zhipu':
      return 'https://open.bigmodel.cn/api/paas/v4';
    case 'minimax':
      return 'https://api.minimax.chat/v1';
    case 'moonshot':
      return 'https://api.moonshot.cn/v1';
    default:
      return 'https://api.openai.com/v1';
  }
}

export async function checkAllModelsHealth(
  configs: ModelConfig[],
  onProgress?: (modelId: string, result: HealthCheckResult) => void
): Promise<Map<string, HealthCheckResult>> {
  const results = new Map<string, HealthCheckResult>();
  
  for (const config of configs) {
    const result = await checkModelHealth(config);
    results.set(config.id, result);
    onProgress?.(config.id, result);
  }
  
  return results;
}
