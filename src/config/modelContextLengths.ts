export const MODEL_CONTEXT_LENGTHS: Record<string, number> = {
  'gemini-2.5-pro': 1 * 1024 * 1024,
  'gemini-2.5-flash': 1 * 1024 * 1024,
  'gemini-2.5-flash-lite': 1 * 1024 * 1024,
  'gemini-3.1-pro': 1 * 1024 * 1024,
  'gemini-3.1-flash-lite': 1 * 1024 * 1024,
  'gemini-3-flash': 1 * 1024 * 1024,

  'gpt-5.4': 256 * 1024,
  'gpt-5.4-mini': 256 * 1024,
  'gpt-5.4-nano': 256 * 1024,
  'gpt-5.2': 256 * 1024,
  'gpt-5.1': 256 * 1024,
  'gpt-5': 256 * 1024,
  'gpt-5-mini': 256 * 1024,
  'gpt-4.1': 1 * 1024 * 1024,
  'gpt-4.1-mini': 1 * 1024 * 1024,
  'gpt-4o': 128 * 1024,
  'gpt-4o-mini': 128 * 1024,
  'o3': 200 * 1024,
  'o4-mini': 200 * 1024,
  'o3-mini': 200 * 1024,
  'o1': 200 * 1024,
  'o1-mini': 200 * 1024,

  'claude-opus-4.6': 1 * 1024 * 1024,
  'claude-sonnet-4.6': 1 * 1024 * 1024,
  'claude-haiku-4.5': 200 * 1024,
  'claude-opus-4.5': 1 * 1024 * 1024,
  'claude-sonnet-4.5': 1 * 1024 * 1024,
  'claude-opus-4.1': 1 * 1024 * 1024,
  'claude-sonnet-3.7': 200 * 1024,
  'claude-haiku-3.5': 200 * 1024,
  'claude-haiku-3': 200 * 1024,

  'deepseek-chat': 128 * 1024,
  'deepseek-reasoner': 128 * 1024,

  'glm-5': 200 * 1024,
  'glm-5-turbo': 200 * 1024,
  'glm-4.7': 128 * 1024,
  'glm-4.7-flash': 128 * 1024,
  'glm-4.7-flashx': 128 * 1024,
  'glm-4.6v': 128 * 1024,
  'glm-4.6v-flashx': 128 * 1024,
  'glm-5v-turbo': 200 * 1024,
  'glm-4.5-air': 128 * 1024,
  'glm-4-flash': 128 * 1024,

  'minimax-m2.7': 1 * 1024 * 1024,
  'minimax-m2.7-highspeed': 1 * 1024 * 1024,
  'minimax-m2.5': 204800,
  'minimax-m2.5-highspeed': 204800,
  'm2-her': 204800,

  'kimi-k2.5': 256 * 1024,
  'kimi-k2-0905-preview': 256 * 1024,
  'kimi-k2-0711-preview': 128 * 1024,
  'kimi-k2-turbo-preview': 256 * 1024,
  'kimi-k2-thinking': 256 * 1024,
  'kimi-k2-thinking-turbo': 256 * 1024,

  'mimo-v2-pro': 1 * 1024 * 1024,
  'mimo-v2-omni': 256 * 1024,
  'mimo-v2-flash': 256 * 1024,
  'mimo-v2-tts': 8 * 1024,

  'qwen-max': 32 * 1024,
  'qwen-plus': 128 * 1024,
  'qwen-turbo': 128 * 1024,
  'qwen-long': 1 * 1024 * 1024,
  'qwq-plus': 128 * 1024,
  'qwq-32b': 128 * 1024,
};

export const DEFAULT_CONTEXT_BY_PROVIDER: Record<string, number> = {
  'lm-studio': 256 * 1024,
  'ollama': 256 * 1024,
  'google': 1 * 1024 * 1024,
  'openai': 128 * 1024,
  'anthropic': 1 * 1024 * 1024,
  'deepseek': 128 * 1024,
  'zhipu': 128 * 1024,
  'minimax': 204800,
  'kimi': 256 * 1024,
  'xiaomi': 256 * 1024,
  'openrouter': 128 * 1024,
  'dmxapi': 128 * 1024,
  'siliconflow': 128 * 1024,
  'bailian': 128 * 1024,
  'custom': 128 * 1024,
};

export function getContextLengthForModel(modelId: string, provider?: string): number {
  const normalizedModelId = modelId.toLowerCase();
  
  for (const [key, length] of Object.entries(MODEL_CONTEXT_LENGTHS)) {
    if (normalizedModelId === key.toLowerCase() || 
        normalizedModelId.includes(key.toLowerCase()) ||
        key.toLowerCase().includes(normalizedModelId)) {
      return length;
    }
  }
  
  if (provider && DEFAULT_CONTEXT_BY_PROVIDER[provider]) {
    return DEFAULT_CONTEXT_BY_PROVIDER[provider];
  }
  
  return 128 * 1024;
}
