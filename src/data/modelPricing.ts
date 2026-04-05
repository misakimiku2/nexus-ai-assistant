import { ModelPricing } from '../types';

export const PREDEFINED_PRICING: Record<string, ModelPricing> = {
  'gpt-4o': { inputPrice: 2.5, outputPrice: 10, currency: 'USD' },
  'gpt-4o-mini': { inputPrice: 0.15, outputPrice: 0.6, currency: 'USD' },
  'gpt-4-turbo': { inputPrice: 10, outputPrice: 30, currency: 'USD' },
  'gpt-4': { inputPrice: 30, outputPrice: 60, currency: 'USD' },
  'gpt-3.5-turbo': { inputPrice: 0.5, outputPrice: 1.5, currency: 'USD' },
  'claude-3-opus': { inputPrice: 15, outputPrice: 75, currency: 'USD' },
  'claude-3-sonnet': { inputPrice: 3, outputPrice: 15, currency: 'USD' },
  'claude-3-haiku': { inputPrice: 0.25, outputPrice: 1.25, currency: 'USD' },
  'claude-3-5-sonnet': { inputPrice: 3, outputPrice: 15, currency: 'USD' },
  'claude-3-5-haiku': { inputPrice: 0.8, outputPrice: 4, currency: 'USD' },
  'qwen-plus': { inputPrice: 0.0008, outputPrice: 0.002, currency: 'CNY' },
  'qwen-turbo': { inputPrice: 0.0003, outputPrice: 0.0006, currency: 'CNY' },
  'qwen-max': { inputPrice: 0.04, outputPrice: 0.12, currency: 'CNY' },
  'qwen2.5-72b-instruct': { inputPrice: 0.004, outputPrice: 0.012, currency: 'CNY' },
  'qwen2.5-32b-instruct': { inputPrice: 0.0006, outputPrice: 0.002, currency: 'CNY' },
  'qwen2.5-14b-instruct': { inputPrice: 0.0003, outputPrice: 0.0006, currency: 'CNY' },
  'qwen2.5-7b-instruct': { inputPrice: 0.0001, outputPrice: 0.0002, currency: 'CNY' },
  'deepseek-chat': { inputPrice: 0.001, outputPrice: 0.002, currency: 'CNY' },
  'deepseek-coder': { inputPrice: 0.001, outputPrice: 0.002, currency: 'CNY' },
  'deepseek-reasoner': { inputPrice: 0.004, outputPrice: 0.016, currency: 'CNY' },
  'glm-4': { inputPrice: 0.1, outputPrice: 0.1, currency: 'CNY' },
  'glm-4-flash': { inputPrice: 0.001, outputPrice: 0.001, currency: 'CNY' },
  'glm-4-plus': { inputPrice: 0.05, outputPrice: 0.05, currency: 'CNY' },
  'gemini-1.5-pro': { inputPrice: 1.25, outputPrice: 5, currency: 'USD' },
  'gemini-1.5-flash': { inputPrice: 0.075, outputPrice: 0.3, currency: 'USD' },
  'gemini-pro': { inputPrice: 0.5, outputPrice: 1.5, currency: 'USD' },
  'llama-3.1-405b': { inputPrice: 2.7, outputPrice: 2.7, currency: 'USD' },
  'llama-3.1-70b': { inputPrice: 0.55, outputPrice: 0.55, currency: 'USD' },
  'llama-3.1-8b': { inputPrice: 0.03, outputPrice: 0.03, currency: 'USD' },
  'mistral-large': { inputPrice: 2, outputPrice: 6, currency: 'USD' },
  'mistral-medium': { inputPrice: 2.7, outputPrice: 8.1, currency: 'USD' },
  'mistral-small': { inputPrice: 0.2, outputPrice: 0.6, currency: 'USD' },
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

export function formatPricingDisplay(pricing: ModelPricing): string {
  const currency = pricing.currency === 'USD' ? '$' : '¥';
  return `${currency}${pricing.inputPrice.toFixed(4)} / ${currency}${pricing.outputPrice.toFixed(4)} (in/out per 1M tokens)`;
}
