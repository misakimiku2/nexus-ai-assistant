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
  'gpt-4o': OpenAI,
  'gpt-4o-mini': OpenAI,
  'gpt-4-turbo': OpenAI,
  'gpt-4': OpenAI,
  'gpt-3.5-turbo': OpenAI,
  'claude-3-5-sonnet': Claude,
  'claude-3-5-haiku': Claude,
  'claude-sonnet-4': Claude,
  'claude-opus-4': Claude,
  'gemini-2.0-flash': Gemini,
  'gemini-1.5-pro': Gemini,
  'gemini-1.5-flash': Gemini,
  'gemini-pro': Gemini,
  'deepseek-chat': DeepSeek,
  'deepseek-reasoner': DeepSeek,
  'glm-4': Zhipu,
  'glm-4-plus': Zhipu,
  'glm-4-air': Zhipu,
  'glm-4-flash': Zhipu,
  'glm-4-long': Zhipu,
  'qwen-max': Qwen,
  'qwen-plus': Qwen,
  'qwen-turbo': Qwen,
  'qwen-long': Qwen,
  'qwq-plus': Qwen,
  'qwq-32b': Qwen,
  'moonshot-v1-8k': Moonshot,
  'moonshot-v1-32k': Moonshot,
  'moonshot-v1-128k': Moonshot,
  'abab6.5s-chat': Minimax,
  'abab6.5g-chat': Minimax,
  'abab6.5t-chat': Minimax,
  'abab5.5-chat': Minimax,
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
    
    if (normalizedModelId.includes('gpt') || normalizedModelId.includes('o1') || normalizedModelId.includes('o3')) {
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
    if (normalizedModelId.includes('abab') || normalizedModelId.includes('minimax')) {
      return <Minimax size={size} />;
    }
    if (normalizedModelId.includes('llama')) {
      return <Meta size={size} />;
    }
    if (normalizedModelId.includes('mistral')) {
      return <Mistral size={size} />;
    }
  }
  
  if (provider) {
    const IconComponent = providerIconMap[provider];
    if (IconComponent) {
      return <IconComponent size={size} />;
    }
  }
  
  return (
    <div 
      style={{ 
        width: size, 
        height: size, 
        borderRadius: '4px',
        backgroundColor: 'currentColor',
        opacity: 0.3,
      }} 
    />
  );
};

interface ProviderLogoProps {
  provider: string;
  size?: number;
}

export const ProviderLogo: React.FC<ProviderLogoProps> = ({ 
  provider, 
  size = 24,
}) => {
  const IconComponent = providerIconMap[provider];
  
  if (IconComponent) {
    return <IconComponent size={size} />;
  }
  
  return null;
};

export const getProviderLogoComponent = (provider: string): React.FC<{ size?: number }> | undefined => {
  return providerIconMap[provider];
};

export const getModelLogoComponent = (modelId: string): React.FC<{ size?: number }> | undefined => {
  const normalizedModelId = modelId.toLowerCase();
  
  for (const [key, IconComponent] of Object.entries(modelIconMap)) {
    if (normalizedModelId.includes(key.toLowerCase()) || key.toLowerCase().includes(normalizedModelId)) {
      return IconComponent;
    }
  }
  
  return undefined;
};
