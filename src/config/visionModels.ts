export const VISION_CAPABLE_MODELS: string[] = [
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3.1-pro-preview',
  'gemini-3.1-flash-lite-preview',
  'gemini-3-flash-preview',

  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.4-nano',
  'gpt-5.2',
  'gpt-5.1',
  'gpt-5',
  'gpt-5-mini',
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4o',
  'gpt-4o-mini',
  'o3',
  'o4-mini',
  'o3-mini',
  'o1',
  'o1-mini',

  'claude-opus-4.6',
  'claude-sonnet-4.6',
  'claude-haiku-4.5',
  'claude-opus-4.5',
  'claude-sonnet-4.5',
  'claude-opus-4.1',
  'claude-sonnet-3.7',
  'claude-haiku-3.5',
  'claude-haiku-3',

  'glm-4.6v',
  'glm-4.6v-flashx',
  'glm-5v-turbo',

  'qwen-vl-max',
  'qwen-vl-plus',
  'qwen2-vl',
  'qwen2.5-vl',

  'minimax-m2.7',
  'minimax-m2.7-highspeed',

  'mimo-v2-pro',
  'mimo-v2-omni',
  'mimo-v2-flash',
];

export const VISION_CAPABLE_PROVIDERS: string[] = [
  'google',
  'openai',
  'anthropic',
];

export const NON_VISION_MODEL_PATTERNS: RegExp[] = [
  /^glm-4\.7$/i,
  /^glm-4\.7-flash/i,
  /^glm-4\.7-flashx/i,
  /^glm-5$/i,
  /^glm-5-turbo$/i,
  /^glm-4\.5-air$/i,
  /^glm-4-flash$/i,
  /^deepseek-chat$/i,
  /^deepseek-reasoner$/i,
  /^kimi-k2/i,
];

export function supportsVision(modelId: string, provider?: string): boolean {
  if (!modelId) return false;

  const normalizedModelId = modelId.toLowerCase();

  for (const pattern of NON_VISION_MODEL_PATTERNS) {
    if (pattern.test(normalizedModelId)) {
      return false;
    }
  }

  for (const visionModel of VISION_CAPABLE_MODELS) {
    if (normalizedModelId === visionModel.toLowerCase() ||
        normalizedModelId.includes(visionModel.toLowerCase()) ||
        visionModel.toLowerCase().includes(normalizedModelId)) {
      return true;
    }
  }

  if (normalizedModelId.includes('vision') || 
      normalizedModelId.includes('-vl') || 
      normalizedModelId.includes('-v-') ||
      normalizedModelId.endsWith('-v') ||
      normalizedModelId.includes('multimodal')) {
    return true;
  }

  if (provider && VISION_CAPABLE_PROVIDERS.includes(provider.toLowerCase())) {
    return true;
  }

  return false;
}

export function getVisionUnsupportedMessage(modelId: string, provider?: string): string {
  const providerName = provider ? getProviderDisplayName(provider) : '';
  
  if (provider?.toLowerCase() === 'zhipu') {
    return `当前模型 ${modelId} 不支持图片输入。请使用视觉模型如 glm-4.6v 或 glm-5v-turbo。`;
  }
  
  if (provider?.toLowerCase() === 'deepseek') {
    return `DeepSeek 模型暂不支持图片输入。请使用其他支持视觉的模型。`;
  }
  
  if (provider?.toLowerCase() === 'kimi') {
    return `Kimi 模型暂不支持图片输入。请使用其他支持视觉的模型。`;
  }
  
  return `当前模型 ${modelId}${providerName ? ` (${providerName})` : ''} 不支持图片输入。请切换到支持视觉的模型。`;
}

function getProviderDisplayName(provider: string): string {
  const providerNames: Record<string, string> = {
    'google': 'Google Gemini',
    'openai': 'OpenAI',
    'anthropic': 'Anthropic',
    'deepseek': 'DeepSeek',
    'zhipu': '智谱',
    'minimax': 'MiniMax',
    'kimi': 'Kimi',
    'xiaomi': '小米',
    'openrouter': 'OpenRouter',
    'dmxapi': 'DMXAPI',
    'siliconflow': '硅基流动',
    'bailian': '阿里云百炼',
  };
  
  return providerNames[provider.toLowerCase()] || provider;
}
