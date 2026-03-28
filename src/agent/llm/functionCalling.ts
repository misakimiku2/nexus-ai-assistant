import {
  LLMResponse,
  ConversationMessage,
  ToolCallRequest,
  ToolCall,
} from '../types';
import { ToolRegistry } from '../tools/ToolRegistry';
import { ToolExecutionResult } from '../tools/types';

export interface FunctionCallingConfig {
  apiUrl: string;
  modelName: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface StreamCallbacks {
  onContent?: (content: string) => void;
  onToolCall?: (toolCall: ToolCallRequest) => void;
  onComplete?: (response: LLMResponse) => void;
  onError?: (error: Error) => void;
}

function buildMultimodalContent(message: ConversationMessage): string | Array<{ type: string; text?: string; image_url?: { url: string } }> {
  if (message.attachments && message.attachments.length > 0) {
    const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
    
    if (message.content) {
      contentParts.push({ type: 'text', text: message.content });
    }
    
    for (const attachment of message.attachments) {
      if (attachment.type === 'image') {
        contentParts.push({
          type: 'image_url',
          image_url: { url: attachment.data }
        });
      } else {
        contentParts.push({
          type: 'text',
          text: `[附件: ${attachment.name}]`
        });
      }
    }
    
    return contentParts;
  }
  
  return message.content;
}

function convertMessagesForAPI(messages: ConversationMessage[]): Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }> {
  return messages.map(m => ({
    role: m.role,
    content: buildMultimodalContent(m),
    ...(m.name && { name: m.name }),
    ...(m.toolCallId && { tool_call_id: m.toolCallId }),
    ...(m.toolCalls && { tool_calls: m.toolCalls }),
  }));
}

export function buildToolsForLLM(): { type: 'function'; function: { name: string; description: string; parameters: unknown } }[] {
  return ToolRegistry.buildOpenAITools();
}

export function parseToolCalls(response: unknown): ToolCall[] {
  const toolCalls: ToolCall[] = [];
  
  try {
    const resp = response as {
      choices?: Array<{
        message?: {
          tool_calls?: Array<{
            id: string;
            type: string;
            function: {
              name: string;
              arguments: string;
            };
          }>;
        };
      }>;
    };

    const message = resp.choices?.[0]?.message;
    if (message?.tool_calls) {
      for (const tc of message.tool_calls) {
        toolCalls.push({
          id: tc.id || `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          type: 'function',
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        });
      }
    }
  } catch (error) {
    console.error('Failed to parse tool calls:', error);
  }

  return toolCalls;
}

export function parseToolCallArguments(argsString: string): Record<string, unknown> {
  if (!argsString || argsString.trim() === '') {
    console.warn('[parseToolCallArguments] Empty arguments string received from LLM');
    return { _invalid: true, _reason: 'empty_arguments' };
  }

  try {
    const parsed = JSON.parse(argsString);
    if (typeof parsed !== 'object' || parsed === null) {
      console.warn('[parseToolCallArguments] Parsed arguments is not an object:', parsed);
      return { _invalid: true, _reason: 'not_an_object' };
    }
    return parsed;
  } catch (error) {
    console.error('[parseToolCallArguments] Failed to parse tool call arguments:', argsString, error);
    return { _invalid: true, _reason: 'parse_error', _raw: argsString };
  }
}

export async function executeToolCall(toolCall: ToolCall): Promise<ToolExecutionResult> {
  const toolName = toolCall.function.name;
  const params = parseToolCallArguments(toolCall.function.arguments);

  return ToolRegistry.execute(toolName, params);
}

export async function executeToolCalls(
  toolCalls: ToolCall[]
): Promise<Map<string, ToolExecutionResult>> {
  const results = new Map<string, ToolExecutionResult>();

  await Promise.all(
    toolCalls.map(async (tc) => {
      const result = await executeToolCall(tc);
      results.set(tc.id, result);
    })
  );

  return results;
}

export function buildToolResultMessages(
  toolCalls: ToolCall[],
  results: Map<string, ToolExecutionResult>
): ConversationMessage[] {
  return toolCalls.map((tc) => ({
    role: 'tool' as const,
    content: results.get(tc.id)?.output || 'Tool execution failed',
    toolCallId: tc.id,
    name: tc.function.name,
  }));
}

export async function callLLMWithTools(
  config: FunctionCallingConfig,
  messages: ConversationMessage[],
  callbacks?: StreamCallbacks
): Promise<LLMResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const tools = buildToolsForLLM();

  const apiMessages = convertMessagesForAPI(messages);

  const body = {
    model: config.modelName,
    messages: apiMessages,
    temperature: config.temperature ?? 0.7,
    max_tokens: config.maxTokens,
    tools: tools.length > 0 ? tools : undefined,
    tool_choice: tools.length > 0 ? 'auto' : undefined,
    stream: false,
  };

  try {
    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;
    const finishReason = data.choices?.[0]?.finish_reason || 'stop';

    const toolCalls = parseToolCalls(data);

    const llmResponse: LLMResponse = {
      content: message?.content || '',
      toolCalls: toolCalls.length > 0 ? toolCalls.map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: tc.function,
      })) : undefined,
      finishReason: finishReason === 'tool_calls' ? 'tool_calls' : 
                    finishReason === 'length' ? 'length' : 'stop',
    };

    callbacks?.onComplete?.(llmResponse);
    return llmResponse;
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    callbacks?.onError?.(err);
    return {
      content: '',
      finishReason: 'error',
    };
  }
}

export async function* streamLLMWithTools(
  config: FunctionCallingConfig,
  messages: ConversationMessage[]
): AsyncGenerator<{ type: 'content' | 'reasoning_content' | 'tool_call' | 'done'; data: string | ToolCallRequest | LLMResponse }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const tools = buildToolsForLLM();

  const apiMessages = convertMessagesForAPI(messages);

  const body = {
    model: config.modelName,
    messages: apiMessages,
    temperature: config.temperature ?? 0.7,
    max_tokens: config.maxTokens,
    tools: tools.length > 0 ? tools : undefined,
    tool_choice: tools.length > 0 ? 'auto' : undefined,
    stream: true,
  };

  const response = await fetch(config.apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let accumulatedContent = '';
  let accumulatedReasoningContent = '';
  const toolCallsMap = new Map<string, ToolCallRequest>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') {
          const finalResponse: LLMResponse = {
            content: accumulatedContent,
            reasoningContent: accumulatedReasoningContent,
            toolCalls: toolCallsMap.size > 0 ? Array.from(toolCallsMap.values()) : undefined,
            finishReason: toolCallsMap.size > 0 ? 'tool_calls' : 'stop',
          };
          yield { type: 'done', data: finalResponse };
          return;
        }

        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta;

          if (delta?.reasoning_content) {
            accumulatedReasoningContent += delta.reasoning_content;
            yield { type: 'reasoning_content', data: delta.reasoning_content };
          }

          if (delta?.content) {
            accumulatedContent += delta.content;
            yield { type: 'content', data: delta.content };
          }

          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const id = tc.id;
              
              if (id && !toolCallsMap.has(id)) {
                toolCallsMap.set(id, {
                  id,
                  type: 'function',
                  function: { name: '', arguments: '' },
                });
              }
              
              let existing: ToolCallRequest | undefined;
              if (id) {
                existing = toolCallsMap.get(id);
              } else if (toolCallsMap.size === 1) {
                existing = Array.from(toolCallsMap.values())[0];
              }
              
              if (existing) {
                if (tc.function?.name) {
                  existing.function.name = tc.function.name;
                }
                if (tc.function?.arguments) {
                  existing.function.arguments += tc.function.arguments;
                }
                yield { type: 'tool_call', data: existing };
              }
            }
          }
        } catch {
          // Ignore parse errors for incomplete chunks
        }
      }
    }
  }
}

export function createSystemPromptForTools(basePrompt: string): string {
  const tools = ToolRegistry.getAll();
  
  if (tools.length === 0) {
    return basePrompt;
  }

  const toolDescriptions = tools
    .map((t) => `- ${t.name}: ${t.description}`)
    .join('\n');

  return `${basePrompt}

You have access to the following tools:
${toolDescriptions}

When you need to use a tool, respond with a tool call. The user will see the results and you can continue the conversation based on those results.`;
}
