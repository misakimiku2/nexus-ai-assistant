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
  google: { name: 'Google', logo: 'https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg', models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.1-pro', 'gemini-3.1-flash-lite', 'gemini-3-flash'], apiKeyUrl: 'https://aistudio.google.com/app/apikey', apiUrl: 'https://generativelanguage.googleapis.com/v1beta', supportsModelList: true },
  openai: { name: 'OpenAI', logo: 'https://upload.wikimedia.org/wikipedia/commons/0/04/ChatGPT_logo.svg', models: ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5.2', 'gpt-5.1', 'gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini', 'o3', 'o4-mini', 'o3-mini', 'o1', 'o1-mini'], apiKeyUrl: 'https://platform.openai.com/api-keys', apiUrl: 'https://api.openai.com/v1', supportsModelList: true },
  anthropic: { name: 'Anthropic', logo: 'https://www.anthropic.com/favicon.ico', models: ['claude-opus-4.6', 'claude-sonnet-4.6', 'claude-haiku-4.5', 'claude-opus-4.5', 'claude-sonnet-4.5', 'claude-opus-4.1', 'claude-sonnet-3.7', 'claude-haiku-3.5', 'claude-haiku-3'], apiKeyUrl: 'https://console.anthropic.com/settings/keys', apiUrl: 'https://api.anthropic.com/v1', supportsModelList: true },
  deepseek: { name: 'DeepSeek', logo: 'https://www.deepseek.com/favicon.ico', models: ['deepseek-chat', 'deepseek-reasoner'], apiKeyUrl: 'https://platform.deepseek.com/api_keys', apiUrl: 'https://api.deepseek.com/v1', supportsModelList: true },
  zhipu: { name: '智谱', logo: 'https://www.zhipuai.cn/favicon.ico', models: ['glm-5', 'glm-5-turbo', 'glm-4.7', 'glm-4.7-flash', 'glm-4.7-flashx', 'glm-4.6v', 'glm-4.6v-flashx', 'glm-5v-turbo', 'glm-4.5-air', 'glm-4-flash'], apiKeyUrl: 'https://open.bigmodel.cn/api-keys', apiUrl: 'https://open.bigmodel.cn/api/paas/v4', supportsModelList: true },
  minimax: { name: 'MiniMax', logo: 'https://www.minimaxi.com/favicon.ico', models: ['MiniMax-M2.7', 'MiniMax-M2.7-highspeed', 'MiniMax-M2.5', 'MiniMax-M2.5-highspeed', 'M2-her'], apiKeyUrl: 'https://www.minimaxi.com/user-center/basic-information/interface-key', apiUrl: 'https://api.minimax.chat/v1', supportsModelList: true },
  kimi: { name: 'Kimi (月之暗面)', logo: 'https://www.moonshot.cn/favicon.ico', models: ['kimi-k2.5', 'kimi-k2-0905-preview', 'kimi-k2-0711-preview', 'kimi-k2-turbo-preview', 'kimi-k2-thinking', 'kimi-k2-thinking-turbo'], apiKeyUrl: 'https://platform.moonshot.cn/api-keys', apiUrl: 'https://api.moonshot.cn/v1', supportsModelList: true },
  xiaomi: { name: '小米 MiMo', logo: 'https://www.mi.com/favicon.ico', models: ['mimo-v2-pro', 'mimo-v2-omni', 'mimo-v2-flash', 'mimo-v2-tts'], apiKeyUrl: 'https://xiaomi.com', apiUrl: '', supportsModelList: false },
  openrouter: { name: 'OpenRouter', logo: 'https://openrouter.ai/favicon.ico', models: [], apiKeyUrl: 'https://openrouter.ai/keys', apiUrl: 'https://openrouter.ai/api/v1', isAggregator: true, supportsModelList: true },
  dmxapi: { name: 'DMXAPI', logo: 'https://dmxapi.cn/favicon.ico', models: [], apiKeyUrl: 'https://dmxapi.cn', apiUrl: 'https://api.dmxapi.cn/v1', isAggregator: true, supportsModelList: true },
  siliconflow: { name: '硅基流动', logo: 'https://siliconflow.cn/favicon.ico', models: [], apiKeyUrl: 'https://cloud.siliconflow.cn', apiUrl: 'https://api.siliconflow.cn/v1', isAggregator: true, supportsModelList: true },
  bailian: { name: '阿里云百炼', logo: 'https://www.aliyun.com/favicon.ico', models: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen-long', 'qwq-plus', 'qwq-32b', 'glm-4.7', 'glm-4-flash'], apiKeyUrl: 'https://dashscope.console.aliyun.com/apiKey', apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', isAggregator: true, supportsModelList: true },
  custom: { name: '自定义平台', logo: '', models: [], apiKeyUrl: '', apiUrl: '', isAggregator: true, supportsModelList: false, isCustom: true },
};

export function isAggregatorProvider(providerId: string): boolean {
  return ONLINE_PROVIDERS[providerId]?.isAggregator === true;
}
