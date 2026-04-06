import { ModelPricing } from '../types';

export const PREDEFINED_PRICING: Record<string, ModelPricing> = {
  // OpenAI GPT 系列 (最新价格)
  'gpt-5.4': { inputPrice: 2.5, outputPrice: 15, currency: 'USD' },
  'gpt-5.4-mini': { inputPrice: 0.75, outputPrice: 4.5, currency: 'USD' },
  'gpt-5.4-nano': { inputPrice: 0.2, outputPrice: 1.25, currency: 'USD' },
  'gpt-5.4-pro': { inputPrice: 30, outputPrice: 180, currency: 'USD' },
  'gpt-5.2': { inputPrice: 1.75, outputPrice: 14, currency: 'USD' },
  'gpt-5.2-pro': { inputPrice: 21, outputPrice: 168, currency: 'USD' },
  'gpt-5.1': { inputPrice: 1.25, outputPrice: 10, currency: 'USD' },
  'gpt-5': { inputPrice: 1.25, outputPrice: 10, currency: 'USD' },
  'gpt-5-mini': { inputPrice: 0.25, outputPrice: 2, currency: 'USD' },
  'gpt-5-nano': { inputPrice: 0.05, outputPrice: 0.4, currency: 'USD' },
  'gpt-5-pro': { inputPrice: 15, outputPrice: 120, currency: 'USD' },
  'gpt-4.1': { inputPrice: 2, outputPrice: 8, currency: 'USD' },
  'gpt-4.1-mini': { inputPrice: 0.4, outputPrice: 1.6, currency: 'USD' },
  'gpt-4.1-nano': { inputPrice: 0.1, outputPrice: 0.4, currency: 'USD' },
  'gpt-4o': { inputPrice: 2.5, outputPrice: 10, currency: 'USD', cacheHitPrice: 1.25 },
  'gpt-4o-mini': { inputPrice: 0.15, outputPrice: 0.6, currency: 'USD', cacheHitPrice: 0.075 },
  'gpt-4-turbo': { inputPrice: 10, outputPrice: 30, currency: 'USD', cacheHitPrice: 5 },
  'gpt-4': { inputPrice: 30, outputPrice: 60, currency: 'USD' },
  'gpt-3.5-turbo': { inputPrice: 0.5, outputPrice: 1.5, currency: 'USD' },

  // OpenAI O 系列 (推理模型)
  'o1': { inputPrice: 15, outputPrice: 60, currency: 'USD', cacheHitPrice: 7.5 },
  'o1-pro': { inputPrice: 150, outputPrice: 600, currency: 'USD' },
  'o3': { inputPrice: 2, outputPrice: 8, currency: 'USD', cacheHitPrice: 0.5 },
  'o3-pro': { inputPrice: 20, outputPrice: 80, currency: 'USD' },
  'o4-mini': { inputPrice: 1.1, outputPrice: 4.4, currency: 'USD', cacheHitPrice: 0.275 },
  'o3-mini': { inputPrice: 1.1, outputPrice: 4.4, currency: 'USD', cacheHitPrice: 0.55 },
  'o1-mini': { inputPrice: 1.1, outputPrice: 4.4, currency: 'USD', cacheHitPrice: 0.55 },

  // Anthropic Claude 系列 (最新价格)
  'claude-opus-4.6': { inputPrice: 5, outputPrice: 25, currency: 'USD', cacheHitPrice: 0.5, cacheWritePrice: 6.25 },
  'claude-sonnet-4.6': { inputPrice: 3, outputPrice: 15, currency: 'USD', cacheHitPrice: 0.3, cacheWritePrice: 3.75 },
  'claude-haiku-4.5': { inputPrice: 1, outputPrice: 5, currency: 'USD', cacheHitPrice: 0.1, cacheWritePrice: 1.25 },
  'claude-opus-4.5': { inputPrice: 5, outputPrice: 25, currency: 'USD', cacheHitPrice: 0.5, cacheWritePrice: 6.25 },
  'claude-sonnet-4.5': { inputPrice: 3, outputPrice: 15, currency: 'USD', cacheHitPrice: 0.3, cacheWritePrice: 3.75 },
  'claude-opus-4.1': { inputPrice: 15, outputPrice: 75, currency: 'USD', cacheHitPrice: 1.5, cacheWritePrice: 18.75 },
  'claude-sonnet-3.7': { inputPrice: 3, outputPrice: 15, currency: 'USD', cacheHitPrice: 0.3, cacheWritePrice: 3.75 },
  'claude-haiku-3.5': { inputPrice: 0.8, outputPrice: 4, currency: 'USD', cacheHitPrice: 0.08, cacheWritePrice: 1 },
  'claude-haiku-3': { inputPrice: 0.25, outputPrice: 1.25, currency: 'USD', cacheHitPrice: 0.03, cacheWritePrice: 0.30 },

  // Google Gemini 系列 (最新价格)
  'gemini-2.5-pro': { inputPrice: 1.25, outputPrice: 10, currency: 'USD', cacheHitPrice: 0.125 },
  'gemini-2.5-flash': { inputPrice: 0.3, outputPrice: 2.5, currency: 'USD', cacheHitPrice: 0.03 },
  'gemini-2.5-flash-lite': { inputPrice: 0.1, outputPrice: 0.4, currency: 'USD', cacheHitPrice: 0.01 },
  'gemini-3.1-pro': { inputPrice: 2, outputPrice: 12, currency: 'USD', cacheHitPrice: 0.2 },
  'gemini-3.1-flash-lite': { inputPrice: 0.25, outputPrice: 1.5, currency: 'USD', cacheHitPrice: 0.025 },
  'gemini-3-flash': { inputPrice: 0.5, outputPrice: 3, currency: 'USD', cacheHitPrice: 0.05 },
  'gemini-2.0-flash': { inputPrice: 0.1, outputPrice: 0.4, currency: 'USD', cacheHitPrice: 0.025 },
  'gemini-1.5-pro': { inputPrice: 1.25, outputPrice: 5, currency: 'USD', cacheHitPrice: 0.3125 },
  'gemini-1.5-flash': { inputPrice: 0.075, outputPrice: 0.3, currency: 'USD', cacheHitPrice: 0.01875 },
  'gemini-pro': { inputPrice: 0.5, outputPrice: 1.5, currency: 'USD' },

  // DeepSeek 系列 (双货币)
  'deepseek-chat': {
    inputPrice: 2, outputPrice: 3, currency: 'CNY',
    usdPricing: { inputPrice: 0.28, outputPrice: 0.42 },
    cnyPricing: { inputPrice: 2, outputPrice: 3 },
    cacheHitPrice: 0.2,
  },
  'deepseek-reasoner': {
    inputPrice: 2, outputPrice: 3, currency: 'CNY',
    usdPricing: { inputPrice: 0.28, outputPrice: 0.42 },
    cnyPricing: { inputPrice: 2, outputPrice: 3 },
    cacheHitPrice: 0.2,
  },
  'deepseek-coder': { inputPrice: 2, outputPrice: 8, currency: 'CNY' },
  'deepseek-v3': { inputPrice: 2, outputPrice: 8, currency: 'CNY' },
  'deepseek-r1': { inputPrice: 4, outputPrice: 16, currency: 'CNY' },

  // 智谱 GLM 系列 (双货币)
  'glm-5': {
    inputPrice: 4, outputPrice: 18, currency: 'CNY',
    usdPricing: { inputPrice: 1, outputPrice: 3.2 },
    cnyPricing: { inputPrice: 4, outputPrice: 18 },
    cacheHitPrice: 1,
  },
  'glm-5-turbo': {
    inputPrice: 5, outputPrice: 22, currency: 'CNY',
    usdPricing: { inputPrice: 1.2, outputPrice: 4 },
    cnyPricing: { inputPrice: 5, outputPrice: 22 },
    cacheHitPrice: 1.2,
  },
  'glm-4.7': {
    inputPrice: 2, outputPrice: 8, currency: 'CNY',
    usdPricing: { inputPrice: 0.6, outputPrice: 2.2 },
    cnyPricing: { inputPrice: 2, outputPrice: 8 },
    cacheHitPrice: 0.4,
  },
  'glm-4.7-flash': { inputPrice: 0, outputPrice: 0, currency: 'CNY' },
  'glm-4.7-flashx': { 
    inputPrice: 0.5, outputPrice: 3, currency: 'CNY', 
    usdPricing: { inputPrice: 0.07, outputPrice: 0.4 }, 
    cacheHitPrice: 0.1,
  },
  'glm-4.6': { inputPrice: 2, outputPrice: 8, currency: 'CNY', usdPricing: { inputPrice: 0.6, outputPrice: 2.2 } },
  'glm-4.6v': { inputPrice: 1, outputPrice: 3, currency: 'CNY', usdPricing: { inputPrice: 0.3, outputPrice: 0.9 } },
  'glm-4.6v-flash': { inputPrice: 0, outputPrice: 0, currency: 'CNY' },
  'glm-4.6v-flashx': { inputPrice: 0.15, outputPrice: 1.5, currency: 'CNY', usdPricing: { inputPrice: 0.04, outputPrice: 0.4 } },
  'glm-5v-turbo': {
    inputPrice: 5, outputPrice: 22, currency: 'CNY',
    usdPricing: { inputPrice: 1.2, outputPrice: 4 },
    cnyPricing: { inputPrice: 5, outputPrice: 22 }
  },
  'glm-4.5': { inputPrice: 2, outputPrice: 8, currency: 'CNY', usdPricing: { inputPrice: 0.6, outputPrice: 2.2 } },
  'glm-4.5v': { inputPrice: 2, outputPrice: 6, currency: 'CNY', usdPricing: { inputPrice: 0.6, outputPrice: 1.8 } },
  'glm-4.5-air': { inputPrice: 0.8, outputPrice: 2, currency: 'CNY', usdPricing: { inputPrice: 0.2, outputPrice: 1.1 } },
  'glm-4-air': { inputPrice: 0.8, outputPrice: 2, currency: 'CNY' },
  'glm-4-flash': { inputPrice: 0, outputPrice: 0, currency: 'CNY' },
  'glm-4-plus': { inputPrice: 2, outputPrice: 8, currency: 'CNY' },
  'glm-4': { inputPrice: 2, outputPrice: 8, currency: 'CNY' },
  'glm-4-long': { inputPrice: 0.5, outputPrice: 1, currency: 'CNY' },

  // Kimi 系列 (双货币)
  'kimi-k2.5': {
    inputPrice: 4, outputPrice: 21, currency: 'CNY',
    usdPricing: { inputPrice: 0.60, outputPrice: 3.00 },
    cnyPricing: { inputPrice: 4, outputPrice: 21 },
    cacheHitPrice: 0.70,
  },
  'kimi-k2-0905-preview': {
    inputPrice: 4, outputPrice: 16, currency: 'CNY',
    usdPricing: { inputPrice: 0.60, outputPrice: 2.50 },
    cnyPricing: { inputPrice: 4, outputPrice: 16 },
    cacheHitPrice: 1,
  },
  'kimi-k2-0711-preview': {
    inputPrice: 4, outputPrice: 16, currency: 'CNY',
    usdPricing: { inputPrice: 0.60, outputPrice: 2.50 },
    cnyPricing: { inputPrice: 4, outputPrice: 16 },
    cacheHitPrice: 1,
  },
  'kimi-k2-turbo-preview': {
    inputPrice: 8, outputPrice: 58, currency: 'CNY',
    usdPricing: { inputPrice: 1.15, outputPrice: 8.00 },
    cnyPricing: { inputPrice: 8, outputPrice: 58 },
    cacheHitPrice: 1,
  },
  'kimi-k2-thinking': {
    inputPrice: 4, outputPrice: 16, currency: 'CNY',
    usdPricing: { inputPrice: 0.60, outputPrice: 2.50 },
    cnyPricing: { inputPrice: 4, outputPrice: 16 },
    cacheHitPrice: 1,
  },
  'kimi-k2-thinking-turbo': {
    inputPrice: 8, outputPrice: 58, currency: 'CNY',
    usdPricing: { inputPrice: 1.15, outputPrice: 8.00 },
    cnyPricing: { inputPrice: 8, outputPrice: 58 },
    cacheHitPrice: 1,
  },
  'moonshot-v1-8k': { inputPrice: 3, outputPrice: 9, currency: 'CNY' },
  'moonshot-v1-32k': { inputPrice: 6, outputPrice: 18, currency: 'CNY' },
  'moonshot-v1-128k': { inputPrice: 15, outputPrice: 45, currency: 'CNY' },

  // MiniMax 系列 (双货币)
  'minimax-m2.7': {
    inputPrice: 2.1, outputPrice: 8.4, currency: 'CNY',
    usdPricing: { inputPrice: 0.30, outputPrice: 1.20 },
    cnyPricing: { inputPrice: 2.1, outputPrice: 8.4 },
    cacheHitPrice: 0.42, cacheWritePrice: 2.625,
  },
  'minimax-m2.7-highspeed': {
    inputPrice: 4.2, outputPrice: 16.8, currency: 'CNY',
    usdPricing: { inputPrice: 0.60, outputPrice: 2.40 },
    cnyPricing: { inputPrice: 4.2, outputPrice: 16.8 },
    cacheHitPrice: 0.42, cacheWritePrice: 2.625,
  },
  'minimax-m2.5': {
    inputPrice: 2.1, outputPrice: 8.4, currency: 'CNY',
    usdPricing: { inputPrice: 0.30, outputPrice: 1.20 },
    cnyPricing: { inputPrice: 2.1, outputPrice: 8.4 },
    cacheHitPrice: 0.21, cacheWritePrice: 2.625,
  },
  'minimax-m2.5-highspeed': {
    inputPrice: 4.2, outputPrice: 16.8, currency: 'CNY',
    usdPricing: { inputPrice: 0.60, outputPrice: 2.40 },
    cnyPricing: { inputPrice: 4.2, outputPrice: 16.8 },
    cacheHitPrice: 0.21, cacheWritePrice: 2.625,
  },
  'minimax-m2-her': {
    inputPrice: 2.1, outputPrice: 8.4, currency: 'CNY',
    usdPricing: { inputPrice: 0.30, outputPrice: 1.20 },
    cnyPricing: { inputPrice: 2.1, outputPrice: 8.4 }
  },
  'minimax-m2': { inputPrice: 2.1, outputPrice: 8.4, currency: 'CNY' },
  'minimax-m2.1': { inputPrice: 2.1, outputPrice: 8.4, currency: 'CNY' },
  'abab6.5s-chat': { inputPrice: 2.1, outputPrice: 8.4, currency: 'CNY' },
  'abab6.5g-chat': { inputPrice: 4.2, outputPrice: 16.8, currency: 'CNY' },
  'abab6.5t-chat': { inputPrice: 0.525, outputPrice: 2.1, currency: 'CNY' },

  // 小米 MiMo 系列 (双货币)
  'mimo-v2-pro': {
    inputPrice: 7, outputPrice: 21, currency: 'CNY',
    usdPricing: { inputPrice: 1.00, outputPrice: 3.00 },
    cnyPricing: { inputPrice: 7, outputPrice: 21 },
    cacheHitPrice: 1.40,
  },
  'mimo-v2-omni': {
    inputPrice: 2.8, outputPrice: 14, currency: 'CNY',
    usdPricing: { inputPrice: 0.40, outputPrice: 2.00 },
    cnyPricing: { inputPrice: 2.8, outputPrice: 14 },
    cacheHitPrice: 0.56,
  },
  'mimo-v2-flash': {
    inputPrice: 0.7, outputPrice: 2.1, currency: 'CNY',
    usdPricing: { inputPrice: 0.10, outputPrice: 0.30 },
    cnyPricing: { inputPrice: 0.7, outputPrice: 2.1 },
    cacheHitPrice: 0.07,
  },
  'mimo-v2-tts': { inputPrice: 0, outputPrice: 0, currency: 'CNY' },
  'mimo-7b-rl': { inputPrice: 0, outputPrice: 0, currency: 'CNY' },

  // 通义千问系列
  'qwen-plus': { inputPrice: 0.8, outputPrice: 2, currency: 'CNY', cacheHitPrice: 0.08 },
  'qwen-turbo': { inputPrice: 0.3, outputPrice: 0.6, currency: 'CNY' },
  'qwen-max': { inputPrice: 40, outputPrice: 120, currency: 'CNY', cacheHitPrice: 4 },
  'qwen-long': { inputPrice: 0.5, outputPrice: 2, currency: 'CNY' },
  'qwen2.5-72b-instruct': { inputPrice: 4, outputPrice: 12, currency: 'CNY' },
  'qwen2.5-32b-instruct': { inputPrice: 0.6, outputPrice: 2, currency: 'CNY' },
  'qwen2.5-14b-instruct': { inputPrice: 0.3, outputPrice: 0.6, currency: 'CNY' },
  'qwen2.5-7b-instruct': { inputPrice: 0.1, outputPrice: 0.2, currency: 'CNY' },
  'qwen3-8b': { inputPrice: 0, outputPrice: 0, currency: 'CNY' },
  'qwen3-14b': { inputPrice: 0.5, outputPrice: 2, currency: 'CNY' },
  'qwen3-32b': { inputPrice: 1, outputPrice: 4, currency: 'CNY' },

  // Meta Llama 系列
  'llama-3.1-405b': { inputPrice: 2.7, outputPrice: 2.7, currency: 'USD' },
  'llama-3.1-70b': { inputPrice: 0.55, outputPrice: 0.55, currency: 'USD' },
  'llama-3.1-8b': { inputPrice: 0.03, outputPrice: 0.03, currency: 'USD' },
  'llama-3.3-70b': { inputPrice: 0.88, outputPrice: 0.88, currency: 'USD' },
  'llama-3-8b': { inputPrice: 0.2, outputPrice: 0.2, currency: 'USD' },
  'llama-3-70b': { inputPrice: 0.65, outputPrice: 2.75, currency: 'USD' },

  // Mistral 系列
  'mistral-large': { inputPrice: 2, outputPrice: 6, currency: 'USD' },
  'mistral-medium': { inputPrice: 2.7, outputPrice: 8.1, currency: 'USD' },
  'mistral-small': { inputPrice: 0.2, outputPrice: 0.6, currency: 'USD' },
  'mistral-nemo': { inputPrice: 0.15, outputPrice: 0.15, currency: 'USD' },
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
  'openai/gpt-5.4': { inputPrice: 2.5, outputPrice: 15, currency: 'USD' },
  'openai/gpt-5.4-mini': { inputPrice: 0.75, outputPrice: 4.5, currency: 'USD' },
  'openai/gpt-4o': { inputPrice: 2.5, outputPrice: 10, currency: 'USD' },
  'openai/gpt-4o-mini': { inputPrice: 0.15, outputPrice: 0.6, currency: 'USD' },
  'openai/o3': { inputPrice: 2, outputPrice: 8, currency: 'USD' },
  'openai/o1': { inputPrice: 15, outputPrice: 60, currency: 'USD' },
  'anthropic/claude-opus-4.6': { inputPrice: 5, outputPrice: 25, currency: 'USD', cacheHitPrice: 0.5, cacheWritePrice: 6.25 },
  'anthropic/claude-sonnet-4.6': { inputPrice: 3, outputPrice: 15, currency: 'USD', cacheHitPrice: 0.3, cacheWritePrice: 3.75 },
  'anthropic/claude-haiku-4.5': { inputPrice: 1, outputPrice: 5, currency: 'USD', cacheHitPrice: 0.1, cacheWritePrice: 1.25 },
  'anthropic/claude-3.5-sonnet': { inputPrice: 3, outputPrice: 15, currency: 'USD', cacheHitPrice: 0.3, cacheWritePrice: 3.75 },
  'anthropic/claude-3.5-haiku': { inputPrice: 0.8, outputPrice: 4, currency: 'USD', cacheHitPrice: 0.08, cacheWritePrice: 1 },
  'google/gemini-2.5-pro': { inputPrice: 1.25, outputPrice: 10, currency: 'USD', cacheHitPrice: 0.125 },
  'google/gemini-2.5-flash': { inputPrice: 0.3, outputPrice: 2.5, currency: 'USD', cacheHitPrice: 0.03 },
  'google/gemini-2.0-flash-001': { inputPrice: 0.1, outputPrice: 0.4, currency: 'USD', cacheHitPrice: 0.025 },
  'google/gemini-1.5-pro': { inputPrice: 1.25, outputPrice: 5, currency: 'USD', cacheHitPrice: 0.3125 },
  'google/gemini-1.5-flash': { inputPrice: 0.075, outputPrice: 0.3, currency: 'USD', cacheHitPrice: 0.01875 },
  'deepseek/deepseek-chat': { inputPrice: 0.28, outputPrice: 0.42, currency: 'USD' },
  'deepseek/deepseek-r1': { inputPrice: 0.55, outputPrice: 2.19, currency: 'USD' },
  'meta-llama/llama-3.3-70b-instruct': { inputPrice: 0.88, outputPrice: 0.88, currency: 'USD' },
  'meta-llama/llama-3.1-405b-instruct': { inputPrice: 2.7, outputPrice: 2.7, currency: 'USD' },
  'meta-llama/llama-3.1-70b-instruct': { inputPrice: 0.55, outputPrice: 0.55, currency: 'USD' },
  'qwen/qwen-2.5-72b-instruct': { inputPrice: 0.9, outputPrice: 0.9, currency: 'USD' },
  'qwen/qwen-2.5-32b-instruct': { inputPrice: 0.4, outputPrice: 0.4, currency: 'USD' },
  'mistralai/mistral-large': { inputPrice: 2, outputPrice: 6, currency: 'USD' },
};

export const DMXAPI_PRICING: Record<string, ModelPricing> = {
  'gpt-5.4': { inputPrice: 1.75, outputPrice: 10.5, currency: 'CNY' },
  'gpt-5.4-mini': { inputPrice: 0.525, outputPrice: 3.15, currency: 'CNY' },
  'gpt-4o': { inputPrice: 1.75, outputPrice: 7, currency: 'CNY' },
  'gpt-4o-mini': { inputPrice: 0.105, outputPrice: 0.42, currency: 'CNY' },
  'claude-opus-4.6': { inputPrice: 3.5, outputPrice: 17.5, currency: 'CNY', cacheHitPrice: 0.35, cacheWritePrice: 4.375 },
  'claude-sonnet-4.6': { inputPrice: 2.1, outputPrice: 10.5, currency: 'CNY', cacheHitPrice: 0.21, cacheWritePrice: 2.625 },
  'claude-haiku-4.5': { inputPrice: 0.7, outputPrice: 3.5, currency: 'CNY', cacheHitPrice: 0.07, cacheWritePrice: 0.875 },
  'claude-3.5-sonnet-20241022': { inputPrice: 2.1, outputPrice: 10.5, currency: 'CNY' },
  'claude-3.5-haiku-20241022': { inputPrice: 0.56, outputPrice: 2.8, currency: 'CNY' },
  'gemini-2.5-pro': { inputPrice: 0.875, outputPrice: 7, currency: 'CNY', cacheHitPrice: 0.0875 },
  'gemini-2.5-flash': { inputPrice: 0.21, outputPrice: 1.75, currency: 'CNY', cacheHitPrice: 0.021 },
  'gemini-2.0-flash': { inputPrice: 0.07, outputPrice: 0.28, currency: 'CNY' },
  'gemini-1.5-pro': { inputPrice: 0.875, outputPrice: 3.5, currency: 'CNY' },
  'gemini-1.5-flash': { inputPrice: 0.0525, outputPrice: 0.21, currency: 'CNY' },
  'deepseek-chat': { inputPrice: 1.4, outputPrice: 2.1, currency: 'CNY' },
  'deepseek-reasoner': { inputPrice: 1.4, outputPrice: 2.1, currency: 'CNY' },
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
  'glm-4.7': { inputPrice: 2, outputPrice: 8, currency: 'CNY' },
  'glm-4-plus': { inputPrice: 2, outputPrice: 8, currency: 'CNY' },
  'glm-4-flash': { inputPrice: 0, outputPrice: 0, currency: 'CNY' },
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
  let display = `${currency}${pricing.inputPrice.toFixed(2)} / ${currency}${pricing.outputPrice.toFixed(2)} (in/out per 1M tokens)`;

  if (pricing.cacheHitPrice !== undefined) {
    display += ` [缓存命中: ${currency}${pricing.cacheHitPrice.toFixed(2)}]`;
  }

  if (pricing.usdPricing) {
    display += ` [USD: $${pricing.usdPricing.inputPrice.toFixed(2)} / $${pricing.usdPricing.outputPrice.toFixed(2)}]`;
  }

  return display;
}

export const PRICING_LAST_UPDATED = '2026-04-06';
