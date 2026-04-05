import { ModelPricing } from '../types';

export const PREDEFINED_PRICING: Record<string, ModelPricing> = {
  'gpt-4o': { inputPrice: 2.5, outputPrice: 10, currency: 'USD', cacheHitPrice: 1.25 },
  'gpt-4o-mini': { inputPrice: 0.15, outputPrice: 0.6, currency: 'USD', cacheHitPrice: 0.075 },
  'gpt-4-turbo': { inputPrice: 10, outputPrice: 30, currency: 'USD', cacheHitPrice: 5 },
  'gpt-4': { inputPrice: 30, outputPrice: 60, currency: 'USD' },
  'gpt-3.5-turbo': { inputPrice: 0.5, outputPrice: 1.5, currency: 'USD' },
  
  'claude-3-opus': { inputPrice: 15, outputPrice: 75, currency: 'USD', cacheHitPrice: 1.5, cacheWritePrice: 18.75 },
  'claude-3-sonnet': { inputPrice: 3, outputPrice: 15, currency: 'USD', cacheHitPrice: 0.3, cacheWritePrice: 3.75 },
  'claude-3-haiku': { inputPrice: 0.25, outputPrice: 1.25, currency: 'USD', cacheHitPrice: 0.025, cacheWritePrice: 0.3125 },
  'claude-3-5-sonnet': { inputPrice: 3, outputPrice: 15, currency: 'USD', cacheHitPrice: 0.3, cacheWritePrice: 3.75 },
  'claude-3-5-haiku': { inputPrice: 0.8, outputPrice: 4, currency: 'USD', cacheHitPrice: 0.08, cacheWritePrice: 1 },
  'claude-sonnet-4-20250514': { inputPrice: 3, outputPrice: 15, currency: 'USD', cacheHitPrice: 0.3, cacheWritePrice: 3.75 },
  'claude-opus-4-20250514': { inputPrice: 15, outputPrice: 75, currency: 'USD', cacheHitPrice: 1.5, cacheWritePrice: 18.75 },
  
  'qwen-plus': { inputPrice: 0.0008, outputPrice: 0.002, currency: 'CNY' },
  'qwen-turbo': { inputPrice: 0.0003, outputPrice: 0.0006, currency: 'CNY' },
  'qwen-max': { inputPrice: 0.04, outputPrice: 0.12, currency: 'CNY', cacheHitPrice: 0.004 },
  'qwen-long': { inputPrice: 0.0005, outputPrice: 0.002, currency: 'CNY' },
  'qwen2.5-72b-instruct': { inputPrice: 0.004, outputPrice: 0.012, currency: 'CNY' },
  'qwen2.5-32b-instruct': { inputPrice: 0.0006, outputPrice: 0.002, currency: 'CNY' },
  'qwen2.5-14b-instruct': { inputPrice: 0.0003, outputPrice: 0.0006, currency: 'CNY' },
  'qwen2.5-7b-instruct': { inputPrice: 0.0001, outputPrice: 0.0002, currency: 'CNY' },
  
  'deepseek-chat': { inputPrice: 2, outputPrice: 8, currency: 'CNY', cacheHitPrice: 0.5 },
  'deepseek-coder': { inputPrice: 2, outputPrice: 8, currency: 'CNY', cacheHitPrice: 0.5 },
  'deepseek-reasoner': { inputPrice: 4, outputPrice: 16, currency: 'CNY', cacheHitPrice: 1 },
  
  'glm-4': { inputPrice: 0.1, outputPrice: 0.1, currency: 'CNY' },
  'glm-4-flash': { inputPrice: 0.001, outputPrice: 0.001, currency: 'CNY' },
  'glm-4-plus': { inputPrice: 0.05, outputPrice: 0.05, currency: 'CNY' },
  'glm-4-air': { inputPrice: 0.001, outputPrice: 0.001, currency: 'CNY' },
  'glm-4-long': { inputPrice: 0.001, outputPrice: 0.001, currency: 'CNY' },
  
  'abab6.5s-chat': { inputPrice: 0.3, outputPrice: 0.3, currency: 'CNY' },
  'abab6.5g-chat': { inputPrice: 0.6, outputPrice: 0.6, currency: 'CNY' },
  'abab6.5t-chat': { inputPrice: 0.015, outputPrice: 0.015, currency: 'CNY' },
  'abab5.5-chat': { inputPrice: 0.015, outputPrice: 0.015, currency: 'CNY' },
  
  'moonshot-v1-8k': { inputPrice: 0.012, outputPrice: 0.012, currency: 'CNY' },
  'moonshot-v1-32k': { inputPrice: 0.024, outputPrice: 0.024, currency: 'CNY' },
  'moonshot-v1-128k': { inputPrice: 0.06, outputPrice: 0.06, currency: 'CNY' },
  
  'MiMo-7B-RL': { inputPrice: 0, outputPrice: 0, currency: 'CNY' },
  
  'gemini-1.5-pro': { inputPrice: 1.25, outputPrice: 5, currency: 'USD', cacheHitPrice: 0.3125 },
  'gemini-1.5-flash': { inputPrice: 0.075, outputPrice: 0.3, currency: 'USD', cacheHitPrice: 0.01875 },
  'gemini-pro': { inputPrice: 0.5, outputPrice: 1.5, currency: 'USD' },
  'gemini-2.0-flash': { inputPrice: 0.1, outputPrice: 0.4, currency: 'USD', cacheHitPrice: 0.025 },
  
  'llama-3.1-405b': { inputPrice: 2.7, outputPrice: 2.7, currency: 'USD' },
  'llama-3.1-70b': { inputPrice: 0.55, outputPrice: 0.55, currency: 'USD' },
  'llama-3.1-8b': { inputPrice: 0.03, outputPrice: 0.03, currency: 'USD' },
  
  'mistral-large': { inputPrice: 2, outputPrice: 6, currency: 'USD' },
  'mistral-medium': { inputPrice: 2.7, outputPrice: 8.1, currency: 'USD' },
  'mistral-small': { inputPrice: 0.2, outputPrice: 0.6, currency: 'USD' },
};

export const SILICONFLOW_PRICING: Record<string, ModelPricing> = {
  'Qwen/Qwen2.5-7B-Instruct': { inputPrice: 0, outputPrice: 0, currency: 'CNY' },
  'Qwen/Qwen2.5-14B-Instruct': { inputPrice: 0.7, outputPrice: 0.7, currency: 'CNY' },
  'Qwen/Qwen2.5-32B-Instruct': { inputPrice: 1.26, outputPrice: 1.26, currency: 'CNY' },
  'Qwen/Qwen2.5-72B-Instruct': { inputPrice: 4.13, outputPrice: 4.13, currency: 'CNY' },
  'Qwen/Qwen3-8B': { inputPrice: 0, outputPrice: 0, currency: 'CNY' },
  'Qwen/Qwen3-14B': { inputPrice: 0.5, outputPrice: 2, currency: 'CNY' },
  'Qwen/Qwen3-32B': { inputPrice: 1, outputPrice: 4, currency: 'CNY' },
  'deepseek-ai/DeepSeek-V3': { inputPrice: 2, outputPrice: 8, currency: 'CNY' },
  'deepseek-ai/DeepSeek-R1': { inputPrice: 4, outputPrice: 16, currency: 'CNY' },
  'THUDM/glm-4-9b-chat': { inputPrice: 0, outputPrice: 0, currency: 'CNY' },
  'THUDM/GLM-4-32B-0414': { inputPrice: 1.89, outputPrice: 1.89, currency: 'CNY' },
  'Pro/Qwen/Qwen2.5-7B-Instruct': { inputPrice: 0.35, outputPrice: 0.35, currency: 'CNY' },
  'Pro/deepseek-ai/DeepSeek-V3': { inputPrice: 2, outputPrice: 8, currency: 'CNY' },
};

export const OPENROUTER_PRICING_CACHE: Record<string, ModelPricing> = {
  'openai/gpt-4o': { inputPrice: 2.5, outputPrice: 10, currency: 'USD' },
  'openai/gpt-4o-mini': { inputPrice: 0.15, outputPrice: 0.6, currency: 'USD' },
  'anthropic/claude-3.5-sonnet': { inputPrice: 3, outputPrice: 15, currency: 'USD', cacheHitPrice: 0.3, cacheWritePrice: 3.75 },
  'anthropic/claude-3.5-haiku': { inputPrice: 0.8, outputPrice: 4, currency: 'USD', cacheHitPrice: 0.08, cacheWritePrice: 1 },
  'google/gemini-2.0-flash-001': { inputPrice: 0.1, outputPrice: 0.4, currency: 'USD' },
  'deepseek/deepseek-chat': { inputPrice: 0.55, outputPrice: 2.19, currency: 'USD' },
  'meta-llama/llama-3.1-405b-instruct': { inputPrice: 2.7, outputPrice: 2.7, currency: 'USD' },
  'qwen/qwen-2.5-72b-instruct': { inputPrice: 0.9, outputPrice: 0.9, currency: 'USD' },
};

export const DMXAPI_PRICING: Record<string, ModelPricing> = {
  'gpt-4o': { inputPrice: 1.75, outputPrice: 7, currency: 'CNY' },
  'gpt-4o-mini': { inputPrice: 0.105, outputPrice: 0.42, currency: 'CNY' },
  'claude-3-5-sonnet-20241022': { inputPrice: 2.1, outputPrice: 10.5, currency: 'CNY' },
  'claude-3-5-haiku-20241022': { inputPrice: 0.56, outputPrice: 2.8, currency: 'CNY' },
  'gemini-2.0-flash': { inputPrice: 0.07, outputPrice: 0.28, currency: 'CNY' },
  'deepseek-chat': { inputPrice: 1.4, outputPrice: 5.6, currency: 'CNY', cacheHitPrice: 0.35 },
  'qwen-max': { inputPrice: 0.028, outputPrice: 0.084, currency: 'CNY' },
  'qwen-plus': { inputPrice: 0.00056, outputPrice: 0.0014, currency: 'CNY' },
};

export const BAILIAN_PRICING: Record<string, ModelPricing> = {
  'qwen-max': { inputPrice: 0.04, outputPrice: 0.12, currency: 'CNY', cacheHitPrice: 0.004 },
  'qwen-plus': { inputPrice: 0.0008, outputPrice: 0.002, currency: 'CNY' },
  'qwen-turbo': { inputPrice: 0.0003, outputPrice: 0.0006, currency: 'CNY' },
  'qwen-long': { inputPrice: 0.0005, outputPrice: 0.002, currency: 'CNY' },
  'qwq-plus': { inputPrice: 2, outputPrice: 6, currency: 'CNY' },
  'qwq-32b': { inputPrice: 2, outputPrice: 6, currency: 'CNY' },
};

export function getPricingForModel(modelId: string): ModelPricing | undefined {
  const normalizedId = modelId.toLowerCase();
  
  for (const [key, pricing] of Object.entries(PREDEFINED_PRICING)) {
    if (normalizedId.includes(key.toLowerCase()) || key.toLowerCase().includes(normalizedId)) {
      return pricing;
    }
  }
  
  return undefined;
}

export function getPricingForProviderModel(provider: string, modelId: string): ModelPricing | undefined {
  const normalizedId = modelId.toLowerCase();
  
  let pricingData: Record<string, ModelPricing> = PREDEFINED_PRICING;
  
  switch (provider) {
    case 'siliconflow':
      pricingData = SILICONFLOW_PRICING;
      break;
    case 'openrouter':
      pricingData = OPENROUTER_PRICING_CACHE;
      break;
    case 'dmxapi':
      pricingData = DMXAPI_PRICING;
      break;
    case 'bailian':
      pricingData = BAILIAN_PRICING;
      break;
  }
  
  for (const [key, pricing] of Object.entries(pricingData)) {
    const normalizedKey = key.toLowerCase();
    if (normalizedId === normalizedKey || normalizedId.includes(normalizedKey) || normalizedKey.includes(normalizedId)) {
      return pricing;
    }
  }
  
  return getPricingForModel(modelId);
}

export function formatPricingDisplay(pricing: ModelPricing): string {
  const currency = pricing.currency === 'USD' ? '$' : '¥';
  let display = `${currency}${pricing.inputPrice.toFixed(4)} / ${currency}${pricing.outputPrice.toFixed(4)} (in/out per 1M tokens)`;
  
  if (pricing.cacheHitPrice !== undefined) {
    display += ` [缓存命中: ${currency}${pricing.cacheHitPrice.toFixed(4)}]`;
  }
  
  return display;
}

export const PRICING_LAST_UPDATED = '2026-04-05';
