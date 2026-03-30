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

    if (this.config.skipToolCalls) {
      filtered = filtered.filter(m => !m.isToolCall);
    }

    if (this.config.userOnly) {
      filtered = filtered.filter(m => m.role === 'user');
    } else {
      filtered = filtered.filter(m => m.role === 'user' || m.role === 'assistant');
    }

    filtered = filtered.filter(m => m.content.trim().length >= this.config.minMessageLength);

    filtered = this.smartDeduplicate(filtered);

    filtered = filtered.slice(-this.config.maxMessages);

    console.log('[PreFilter] Filtered messages:', {
      input: messages.length,
      output: filtered.length,
    });

    return filtered;
  }

  private smartDeduplicate(messages: ConversationMessage[]): ConversationMessage[] {
    const seen = new Set<string>();
    const result: ConversationMessage[] = [];
    
    for (const msg of messages) {
      const normalized = msg.content.trim().toLowerCase().substring(0, 100);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        result.push(msg);
      }
    }
    
    return result;
  }

  formatForExtraction(messages: ConversationMessage[]): string {
    return messages
      .flatMap(m => {
        // 分句：按标点符号或者换行拆分
        return m.content
          .split(/([。.！!？?；;\n]+)/)
          .reduce((acc: string[], curr, index, arr) => {
            if (index % 2 === 0 && curr.trim()) {
              acc.push(curr.trim() + (arr[index + 1] || ''));
            }
            return acc;
          }, [])
          .filter(s => s.length >= this.config.minMessageLength)
          .map(s => `用户: ${s.trim()}`);
      })
      .join('\n');
  }
}

export const preFilterService = new PreFilterService();
