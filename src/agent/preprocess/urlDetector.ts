import { invoke } from '@tauri-apps/api/core';
import { FetchResult } from '../tools/types';
import { ContentPart } from '../types';

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;

export interface DetectedUrl {
  url: string;
  startIndex: number;
  endIndex: number;
}

export interface UrlContext {
  url: string;
  title?: string;
  content?: string;
  success: boolean;
  error?: string;
}

export interface ProcessedMessage {
  originalMessage: string;
  urlContexts: UrlContext[];
  hasUrls: boolean;
}

export interface PreprocessedInput {
  originalMessage: string;
  cleanedMessage: string;
  detectedUrls: DetectedUrl[];
  urlMap: Map<string, string>;
}

let urlPlaceholderCounter = 0;

function generateUrlPlaceholder(): string {
  urlPlaceholderCounter += 1;
  return `__URL_PLACEHOLDER_${urlPlaceholderCounter}__`;
}

export function resetUrlPlaceholderCounter(): void {
  urlPlaceholderCounter = 0;
}

export interface PreprocessedConversation {
  messages: Array<{ role: string; content: string | ContentPart[] }>;
  urlMap: Map<string, string>;
  processedUserInput: string;
}

function extractTextFromContent(content: string | ContentPart[]): string {
  if (typeof content === 'string') {
    return content;
  }
  const textPart = content.find(part => part.type === 'text');
  return textPart?.text || '';
}

export function preprocessConversation(
  currentUserInput: string,
  conversationHistory: Array<{ role: string; content: string | ContentPart[] }>
): PreprocessedConversation {
  const urlMap = new Map<string, string>();
  const processedMessages: Array<{ role: string; content: string | ContentPart[] }> = [];
  
  for (const msg of conversationHistory) {
    if (typeof msg.content === 'string') {
      const processed = processTextWithUrls(msg.content, urlMap);
      processedMessages.push({
        role: msg.role,
        content: processed,
      });
    } else {
      const contentParts: ContentPart[] = msg.content.map(part => {
        if (part.type === 'text' && part.text) {
          return { ...part, text: processTextWithUrls(part.text, urlMap) };
        }
        return part;
      });
      processedMessages.push({
        role: msg.role,
        content: contentParts,
      });
    }
  }
  
  const processedUserInput = processTextWithUrls(currentUserInput, urlMap);
  
  console.log('[preprocessConversation] Total URLs in map:', urlMap.size);
  console.log('[preprocessConversation] URL Map:', Object.fromEntries(urlMap));
  
  return {
    messages: processedMessages,
    urlMap,
    processedUserInput,
  };
}

function processTextWithUrls(text: string, urlMap: Map<string, string>): string {
  const detectedUrls = detectUrls(text);
  
  if (detectedUrls.length === 0) {
    return text;
  }
  
  let result = text;
  const sortedUrls = [...detectedUrls].sort((a, b) => b.startIndex - a.startIndex);
  
  for (const detected of sortedUrls) {
    const existingEntry = [...urlMap.entries()].find(([_, url]) => url === detected.url);
    
    let placeholder: string;
    if (existingEntry) {
      placeholder = existingEntry[0];
    } else {
      placeholder = generateUrlPlaceholder();
      urlMap.set(placeholder, detected.url);
    }
    
    result = 
      result.slice(0, detected.startIndex) + 
      placeholder + 
      result.slice(detected.endIndex);
  }
  
  return result;
}

export function preprocessInput(text: string): PreprocessedInput {
  const detectedUrls = detectUrls(text);
  const urlMap = new Map<string, string>();
  
  if (detectedUrls.length === 0) {
    return {
      originalMessage: text,
      cleanedMessage: text,
      detectedUrls: [],
      urlMap,
    };
  }
  
  let cleanedMessage = text;
  const sortedUrls = [...detectedUrls].sort((a, b) => b.startIndex - a.startIndex);
  
  for (const detected of sortedUrls) {
    const placeholder = generateUrlPlaceholder();
    urlMap.set(placeholder, detected.url);
    
    cleanedMessage = 
      cleanedMessage.slice(0, detected.startIndex) + 
      placeholder + 
      cleanedMessage.slice(detected.endIndex);
  }
  
  console.log('[preprocessInput] Detected URLs:', detectedUrls.map(u => u.url));
  console.log('[preprocessInput] URL Map:', Object.fromEntries(urlMap));
  
  return {
    originalMessage: text,
    cleanedMessage,
    detectedUrls,
    urlMap,
  };
}

export function replaceUrlPlaceholders(
  text: string, 
  urlMap: Map<string, string>
): string {
  let result = text;
  
  for (const [placeholder, originalUrl] of urlMap) {
    result = result.split(placeholder).join(originalUrl);
  }
  
  return result;
}

export function isUrlPlaceholder(text: string): boolean {
  return /^__URL_PLACEHOLDER_\d+__$/.test(text);
}

export function getOriginalUrl(placeholder: string, urlMap: Map<string, string>): string | undefined {
  return urlMap.get(placeholder);
}

export function detectUrls(text: string): DetectedUrl[] {
  const urls: DetectedUrl[] = [];
  let match;

  while ((match = URL_REGEX.exec(text)) !== null) {
    urls.push({
      url: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  return urls;
}

export function shouldAutoFetch(text: string): boolean {
  const urls = detectUrls(text);
  return urls.length > 0;
}

export function getUrlsToPrefetch(text: string, maxUrls: number = 3): string[] {
  const urls = detectUrls(text);
  return urls.slice(0, maxUrls).map((u) => u.url);
}

export async function prefetchUrls(urls: string[]): Promise<UrlContext[]> {
  const prefetchPromises = urls.map(async (url) => {
    try {
      const result = await invoke<FetchResult>('fetch_url', {
        url,
        options: {
          max_length: 8000,
        },
      });

      return {
        url,
        title: result.title,
        content: result.content,
        success: result.success,
        error: result.error,
      };
    } catch (error) {
      return {
        url,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  return Promise.all(prefetchPromises);
}

export async function processMessageForUrls(
  message: string,
  maxUrls: number = 3
): Promise<ProcessedMessage> {
  const detectedUrls = detectUrls(message);

  if (detectedUrls.length === 0) {
    return {
      originalMessage: message,
      urlContexts: [],
      hasUrls: false,
    };
  }

  const urlsToFetch = detectedUrls.slice(0, maxUrls).map((u) => u.url);
  const urlContexts = await prefetchUrls(urlsToFetch);

  return {
    originalMessage: message,
    urlContexts,
    hasUrls: true,
  };
}

export function formatUrlContextsForPrompt(contexts: UrlContext[]): string {
  if (contexts.length === 0) {
    return '';
  }

  const formattedContexts = contexts
    .filter((ctx) => ctx.success && ctx.content)
    .map((ctx, index) => {
      return `[网页 ${index + 1}] ${ctx.title || '无标题'}
URL: ${ctx.url}
内容:
${ctx.content}
`;
    });

  if (formattedContexts.length === 0) {
    return '';
  }

  return `
以下是用户消息中包含的网页内容，请基于这些内容回答用户问题：

${formattedContexts.join('\n---\n')}
`;
}
