import React from 'react';
import {
  OpenAI,
  Anthropic,
  Google,
  DeepSeek,
  Zhipu,
  Moonshot,
  Minimax,
  LmStudio,
  Ollama,
  OpenRouter,
  Meta,
  Mistral,
  Gemini,
  Claude,
  Qwen,
  XiaomiMiMo,
  SiliconCloud,
  Bailian,
} from '@lobehub/icons';
import { Bot } from 'lucide-react';

const providerIconMap: Record<string, React.FC<{ size?: number }> | undefined> = {
  google: Google,
  openai: OpenAI,
  anthropic: Anthropic,
  deepseek: DeepSeek,
  zhipu: Zhipu,
  minimax: Minimax,
  kimi: Moonshot,
  xiaomi: XiaomiMiMo,
  openrouter: OpenRouter,
  dmxapi: undefined,
  siliconflow: SiliconCloud,
  bailian: Bailian,
  custom: Bot as unknown as React.FC<{ size?: number }>,
  'lm-studio': LmStudio,
  ollama: Ollama,
};

const modelIconMap: Record<string, React.FC<{ size?: number }>> = {
  'gpt-5.4': OpenAI,
  'gpt-5.4-mini': OpenAI,
  'gpt-5.4-nano': OpenAI,
  'gpt-5.2': OpenAI,
  'gpt-5.2-pro': OpenAI,
  'gpt-5.1': OpenAI,
  'gpt-5': OpenAI,
  'gpt-5-mini': OpenAI,
  'gpt-4.1': OpenAI,
  'gpt-4.1-mini': OpenAI,
  'gpt-4o': OpenAI,
  'gpt-4o-mini': OpenAI,
  'o3': OpenAI,
  'o4-mini': OpenAI,
  'o3-mini': OpenAI,
  'o1': OpenAI,
  'o1-mini': OpenAI,
  'claude-opus-4.6': Claude,
  'claude-sonnet-4.6': Claude,
  'claude-haiku-4.5': Claude,
  'claude-opus-4.5': Claude,
  'claude-sonnet-4.5': Claude,
  'claude-opus-4.1': Claude,
  'claude-sonnet-3.7': Claude,
  'claude-haiku-3.5': Claude,
  'claude-haiku-3': Claude,
  'gemini-2.5-pro': Gemini,
  'gemini-2.5-flash': Gemini,
  'gemini-2.5-flash-lite': Gemini,
  'gemini-3.1-pro': Gemini,
  'gemini-3.1-flash-lite': Gemini,
  'gemini-3-flash': Gemini,
  'deepseek-chat': DeepSeek,
  'deepseek-reasoner': DeepSeek,
  'glm-5': Zhipu,
  'glm-5-turbo': Zhipu,
  'glm-4.7': Zhipu,
  'glm-4.7-flash': Zhipu,
  'glm-4.7-flashx': Zhipu,
  'glm-4.6v': Zhipu,
  'glm-4.6v-flashx': Zhipu,
  'glm-5v-turbo': Zhipu,
  'glm-4.5-air': Zhipu,
  'glm-4-flash': Zhipu,
  'kimi-k2.5': Moonshot,
  'kimi-k2-0905-preview': Moonshot,
  'kimi-k2-0711-preview': Moonshot,
  'kimi-k2-turbo-preview': Moonshot,
  'kimi-k2-thinking': Moonshot,
  'kimi-k2-thinking-turbo': Moonshot,
  'minimax-m2.7': Minimax,
  'minimax-m2.7-highspeed': Minimax,
  'minimax-m2.5': Minimax,
  'minimax-m2.5-highspeed': Minimax,
  'm2-her': Minimax,
  'mimo-v2-pro': XiaomiMiMo,
  'mimo-v2-omni': XiaomiMiMo,
  'mimo-v2-flash': XiaomiMiMo,
  'mimo-v2-tts': XiaomiMiMo,
};

interface ModelLogoProps {
  provider?: string;
  modelId?: string;
  size?: number;
}

export const ModelLogo: React.FC<ModelLogoProps> = ({ 
  provider,
  modelId,
  size = 24,
}) => {
  if (modelId) {
    const normalizedModelId = modelId.toLowerCase();
    
    for (const [key, IconComponent] of Object.entries(modelIconMap)) {
      if (normalizedModelId.includes(key.toLowerCase()) || key.toLowerCase().includes(normalizedModelId)) {
        return <IconComponent size={size} />;
      }
    }
    
    if (normalizedModelId.includes('gpt') || normalizedModelId.includes('o1') || normalizedModelId.includes('o3') || normalizedModelId.includes('o4-mini')) {
      return <OpenAI size={size} />;
    }
    
    if (normalizedModelId.includes('claude')) {
      return <Claude size={size} />;
    }
    
    if (normalizedModelId.includes('gemini')) {
      return <Gemini size={size} />;
    }
    
    if (normalizedModelId.includes('deepseek')) {
      return <DeepSeek size={size} />;
    }
    
    if (normalizedModelId.includes('glm') || normalizedModelId.includes('chatglm')) {
      return <Zhipu size={size} />;
    }
    
    if (normalizedModelId.includes('qwen') || normalizedModelId.includes('qwq')) {
      return <Qwen size={size} />;
    }
    
    if (normalizedModelId.includes('moonshot') || normalizedModelId.includes('kimi')) {
      return <Moonshot size={size} />;
    }
    
    if (normalizedModelId.includes('abab') || normalizedModelId.includes('minimax') || normalizedModelId.includes('m2-her') || normalizedModelId.includes('m2.5') || normalizedModelId.includes('m2.7')) {
      return <Minimax size={size} />;
    }
    
    if (normalizedModelId.includes('llama')) {
      return <Meta size={size} />;
    }
    
    if (normalizedModelId.includes('mistral')) {
      return <Mistral size={size} />;
    }
    
    if (normalizedModelId.includes('mimo')) {
      return <XiaomiMiMo size={size} />;
    }
  }

  if (provider) {
    const IconComponent = providerIconMap[provider];
    if (IconComponent) {
      return <IconComponent size={size} />;
    }
  }
  
  return <Bot size={size} />;
};

export const ProviderLogo: React.FC<ModelLogoProps> = ({ 
  provider,
  size = 24,
}) => {
  const IconComponent = providerIconMap[provider || ''];
  if (IconComponent) {
    return <IconComponent size={size} />;
  }
  return <Bot size={size} />;
};
