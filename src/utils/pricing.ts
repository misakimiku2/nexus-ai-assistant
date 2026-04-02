import { ModelPricing } from '../types';

export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  pricing: ModelPricing | undefined
): number {
  if (!pricing) return 0;
  
  const inputCost = (inputTokens / 1000000) * pricing.inputPrice;
  const outputCost = (outputTokens / 1000000) * pricing.outputPrice;
  
  return inputCost + outputCost;
}

export function formatCost(cost: number, currency: 'USD' | 'CNY' = 'USD'): string {
  if (currency === 'CNY') {
    const cnyCost = cost * getExchangeRate();
    if (cnyCost < 0.01) {
      return `¥${cnyCost.toFixed(6)}`;
    }
    return `¥${cnyCost.toFixed(4)}`;
  }
  
  if (cost < 0.01) {
    return `$${cost.toFixed(6)}`;
  }
  return `$${cost.toFixed(4)}`;
}

let cachedExchangeRate: number | null = null;
let lastFetchTime: number = 0;
const CACHE_DURATION = 3600000;

export function getExchangeRate(): number {
  if (cachedExchangeRate !== null && Date.now() - lastFetchTime < CACHE_DURATION) {
    return cachedExchangeRate;
  }
  
  return 7.2;
}

export function setExchangeRate(rate: number): void {
  cachedExchangeRate = rate;
  lastFetchTime = Date.now();
}

export async function fetchExchangeRate(): Promise<number> {
  try {
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    if (response.ok) {
      const data = await response.json();
      const rate = data.rates?.CNY || 7.2;
      setExchangeRate(rate);
      return rate;
    }
  } catch {
    console.warn('Failed to fetch exchange rate, using default');
  }
  return getExchangeRate();
}

export function formatTokenCount(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(2)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

export function estimateTokensFromText(text: string): number {
  return Math.ceil(text.length / 4);
}
