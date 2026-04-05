import { AggregatorProvider } from '../types';

export const AGGREGATOR_PROVIDERS: Record<string, AggregatorProvider> = {
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    logo: 'https://openrouter.ai/favicon.ico',
    apiUrl: 'https://openrouter.ai/api/v1',
    apiKeyUrl: 'https://openrouter.ai/keys',
    pricingUrl: 'https://openrouter.ai/models',
    supportsModelList: true,
    supportsPricingApi: true,
    currency: 'USD',
  },
  dmxapi: {
    id: 'dmxapi',
    name: 'DMXAPI',
    logo: 'https://dmxapi.cn/favicon.ico',
    apiUrl: 'https://api.dmxapi.cn/v1',
    apiKeyUrl: 'https://dmxapi.cn',
    pricingUrl: 'https://dmxapi.cn/pricing',
    supportsModelList: true,
    supportsPricingApi: false,
    currency: 'CNY',
  },
  siliconflow: {
    id: 'siliconflow',
    name: '硅基流动',
    logo: 'https://siliconflow.cn/favicon.ico',
    apiUrl: 'https://api.siliconflow.cn/v1',
    apiKeyUrl: 'https://cloud.siliconflow.cn',
    pricingUrl: 'https://siliconflow.cn/pricing',
    supportsModelList: true,
    supportsPricingApi: false,
    currency: 'CNY',
  },
  bailian: {
    id: 'bailian',
    name: '阿里云百炼',
    logo: 'https://www.aliyun.com/favicon.ico',
    apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKeyUrl: 'https://dashscope.console.aliyun.com/apiKey',
    pricingUrl: 'https://help.aliyun.com/zh/model-studio/billing-for-model-studio',
    supportsModelList: true,
    supportsPricingApi: false,
    currency: 'CNY',
  },
};

export const ONLINE_PROVIDERS: Record<string, { name: string; logo: string; models: string[]; apiKeyUrl: string; apiUrl: string; isAggregator?: boolean; supportsModelList?: boolean; isCustom?: boolean }> = {
  google: { name: 'Google', logo: 'https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg', models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'], apiKeyUrl: 'https://aistudio.google.com/app/apikey', apiUrl: 'https://generativelanguage.googleapis.com/v1beta', supportsModelList: true },
  openai: { name: 'OpenAI', logo: 'https://upload.wikimedia.org/wikipedia/commons/0/04/ChatGPT_logo.svg', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'], apiKeyUrl: 'https://platform.openai.com/api-keys', apiUrl: 'https://api.openai.com/v1', supportsModelList: true },
  anthropic: { name: 'Anthropic', logo: 'https://www.anthropic.com/favicon.ico', models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-sonnet-4-20250514', 'claude-opus-4-20250514'], apiKeyUrl: 'https://console.anthropic.com/settings/keys', apiUrl: 'https://api.anthropic.com/v1' },
  deepseek: { name: 'DeepSeek', logo: 'https://www.deepseek.com/favicon.ico', models: ['deepseek-chat', 'deepseek-reasoner'], apiKeyUrl: 'https://platform.deepseek.com/api_keys', apiUrl: 'https://api.deepseek.com/v1', supportsModelList: true },
  zhipu: { name: '智谱', logo: 'https://www.zhipuai.cn/favicon.ico', models: ['glm-4-plus', 'glm-4-air', 'glm-4-flash', 'glm-4-long'], apiKeyUrl: 'https://open.bigmodel.cn/api-keys', apiUrl: 'https://open.bigmodel.cn/api/paas/v4', supportsModelList: true },
  minimax: { name: 'MiniMax', logo: 'https://www.minimaxi.com/favicon.ico', models: ['abab6.5s-chat', 'abab6.5g-chat', 'abab6.5t-chat', 'abab5.5-chat'], apiKeyUrl: 'https://www.minimaxi.com/user-center/basic-information/interface-key', apiUrl: 'https://api.minimax.chat/v1', supportsModelList: true },
  kimi: { name: 'Kimi (月之暗面)', logo: 'https://www.moonshot.cn/favicon.ico', models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'], apiKeyUrl: 'https://platform.moonshot.cn/api-keys', apiUrl: 'https://api.moonshot.cn/v1', supportsModelList: true },
  xiaomi: { name: '小米 MiMo', logo: 'https://www.mi.com/favicon.ico', models: ['MiMo-7B-RL'], apiKeyUrl: 'https://xiaomi.com', apiUrl: '', supportsModelList: false },
  openrouter: { name: 'OpenRouter', logo: 'https://openrouter.ai/favicon.ico', models: [], apiKeyUrl: 'https://openrouter.ai/keys', apiUrl: 'https://openrouter.ai/api/v1', isAggregator: true, supportsModelList: true },
  dmxapi: { name: 'DMXAPI', logo: 'https://dmxapi.cn/favicon.ico', models: [], apiKeyUrl: 'https://dmxapi.cn', apiUrl: 'https://api.dmxapi.cn/v1', isAggregator: true, supportsModelList: true },
  siliconflow: { name: '硅基流动', logo: 'https://siliconflow.cn/favicon.ico', models: [], apiKeyUrl: 'https://cloud.siliconflow.cn', apiUrl: 'https://api.siliconflow.cn/v1', isAggregator: true, supportsModelList: true },
  bailian: { name: '阿里云百炼', logo: 'https://www.aliyun.com/favicon.ico', models: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen-long', 'qwq-plus', 'qwq-32b'], apiKeyUrl: 'https://dashscope.console.aliyun.com/apiKey', apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', isAggregator: true, supportsModelList: true },
  custom: { name: '自定义平台', logo: '', models: [], apiKeyUrl: '', apiUrl: '', isAggregator: true, supportsModelList: false, isCustom: true },
};

export function isAggregatorProvider(providerId: string): boolean {
  return ONLINE_PROVIDERS[providerId]?.isAggregator === true;
}
