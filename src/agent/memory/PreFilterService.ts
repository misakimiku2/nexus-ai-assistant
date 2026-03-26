import { ConversationMessage, PreFilterConfig, DEFAULT_PREFILTER_CONFIG } from '../../types';

export class PreFilterService {
  private config: PreFilterConfig;

  constructor(config: PreFilterConfig = DEFAULT_PREFILTER_CONFIG) {
    this.config = config;
  }

  updateConfig(config: Partial<PreFilterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): PreFilterConfig {
    return this.config;
  }

  filter(messages: ConversationMessage[]): ConversationMessage[] {
    let filtered = messages;

    filtered = filtered.filter(m => m.content.length >= this.config.minMessageLength);
    
    if (this.config.skipToolCalls) {
      filtered = filtered.filter(m => !m.isToolCall);
    }

    filtered = filtered.filter(m => m.role === 'user' || m.role === 'assistant');

    filtered = this.exactDeduplicate(filtered);

    filtered = filtered.slice(-this.config.maxMessages);

    console.log('[PreFilter] Filtered messages:', {
      input: messages.length,
      output: filtered.length,
    });

    return filtered;
  }

  private exactDeduplicate(messages: ConversationMessage[]): ConversationMessage[] {
    const seen = new Set<string>();
    const result: ConversationMessage[] = [];
    
    for (const msg of messages) {
      const normalized = msg.content.trim().toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        result.push(msg);
      }
    }
    
    return result;
  }

  formatForExtraction(messages: ConversationMessage[]): string {
    return messages
      .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
      .join('\n\n');
  }
}

export const preFilterService = new PreFilterService();
