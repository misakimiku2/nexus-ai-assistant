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
  supportsStreamOptions?: boolean;  // 是否支持 stream_options (OpenAI支持, Gemini等不支持)
  isGeminiModel?: boolean;  // 是否为 Google Gemini 模型（需要特殊处理）
  includeThoughts?: boolean;  // 是否包含思考内容 (Gemini 3/2.5 支持)
}

export interface StreamCallbacks {
  onContent?: (content: string) => void;
  onToolCall?: (toolCall: ToolCallRequest) => void;
  onComplete?: (response: LLMResponse) => void;
  onError?: (error: Error) => void;
  onTokenUsage?: (usage: { inputTokens: number; outputTokens: number }) => void;
}

/**
 * 转换消息格式以兼容 Google Gemini API
 * 
 * Gemini API 有以下特殊要求：
 * 1. tool 消息的 content 必须是 JSON 对象（google.protobuf.Struct），纯文本会导致 400 错误
 * 2. tool 消息必须包含 name 字段
 * 3. assistant 消息中的 tool_calls 格式需要特殊处理
 * 4. 图片消息需要使用 inlineData 格式（OpenAI 兼容端点对 image_url 支持有限）
 */
function transformMessagesForGemini(messages: ConversationMessage[]): Record<string, unknown>[] {
  return messages.map(msg => {
    const transformed: Record<string, unknown> = {
      role: msg.role,
    };

    if (msg.role === 'tool') {
      // Gemini 要求 tool 消息的 content 必须是有效的 JSON 对象
      // 如果 content 是纯文本，将其包装为 JSON 对象
      const rawContent = msg.content;
      
      if (typeof rawContent === 'string') {
        // 尝试解析为 JSON，如果失败则包装为对象
        try {
          JSON.parse(rawContent);
          transformed.content = rawContent;
        } catch {
          // 纯文本内容，包装为 JSON 对象以满足 Gemini 要求
          transformed.content = JSON.stringify({ result: rawContent });
        }
      } else if (Array.isArray(rawContent)) {
        // ContentPart 数组，转换为字符串后处理
        const textContent = rawContent
          .filter(part => part.type === 'text')
          .map(part => part.text)
          .join('');
        
        try {
          JSON.parse(textContent);
          transformed.content = textContent;
        } catch {
          transformed.content = JSON.stringify({ result: textContent });
        }
      } else {
        transformed.content = rawContent;
      }

      // 确保 tool_call_id 和 name 字段存在（Gemini 要求）
      if (msg.toolCallId) {
        transformed.tool_call_id = msg.toolCallId;
      }
      if (msg.name) {
        transformed.name = msg.name;
      }
    } else if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      // Assistant 消息包含工具调用
      // Gemini 要求特定的格式，特别是必须保留 thought_signature
      transformed.content = msg.content || null;
      transformed.tool_calls = msg.toolCalls.map(tc => {
        const tcOutput: Record<string, unknown> = {
          id: tc.id,
          type: tc.type,
          function: tc.function,
        };
        
        // Gemini 3 Thought Signature: 必须原样返回
        // 如果没有签名（比如从其他模型迁移或首次调用），使用 dummy 值
        // 参考: https://ai.google.dev/gemini-api/docs/thought-signatures
        if (tc.thoughtSignature) {
          tcOutput.extra_content = {
            google: {
              thought_signature: tc.thoughtSignature,
            },
          };
          console.log('[functionCalling] Preserving thought_signature for tool call:', tc.id);
        } else {
          // 没有原始签名时，使用 dummy 值跳过验证
          // 这适用于：从非 Gemini 模型迁移的对话、或首次调用
          tcOutput.extra_content = {
            google: {
              thought_signature: 'skip_thought_signature_validator',
            },
          };
        }
        
        return tcOutput;
      });
    } else if (msg.role === 'user' && Array.isArray(msg.content)) {
      // User 消息包含多模态内容（文本 + 图片）
      // Gemini OpenAI 兼容端点支持标准的 image_url 格式，无需转换
      // 参考: https://ai.google.dev/gemini-api/docs/openai
      transformed.content = msg.content;
      console.log('[functionCalling] User message with multimodal content for Gemini:', {
        partCount: msg.content.length,
        parts: msg.content.map(p => ({
          type: p.type,
          hasText: !!p.text,
          hasImageUrl: !!p.image_url?.url,
          imageUrlPrefix: p.image_url?.url?.substring(0, 50) + '...'
        }))
      });
    } else {
      // 其他消息类型（system, user without images, assistant without tool_calls）
      transformed.content = msg.content;
    }

    return transformed;
  });
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
  try {
    return JSON.parse(argsString);
  } catch {
    console.error('Failed to parse tool call arguments:', argsString);
    return {};
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

  const body = {
    model: config.modelName,
    messages,
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
      let errorMessage = `API request failed: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.error?.message) {
          errorMessage = errorData.error.message;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        } else if (typeof errorData.error === 'string') {
          errorMessage = errorData.error;
        }
      } catch {
        // Ignore JSON parse errors, use default message
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;
    const finishReason = data.choices?.[0]?.finish_reason || 'stop';

    const usage = data.usage;
    if (usage && callbacks?.onTokenUsage) {
      callbacks.onTokenUsage({
        inputTokens: usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0,
      });
    }

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
      content: `模型请求失败: ${err.message}`,
      finishReason: 'error',
      error: err.message,
    };
  }
}

export async function* streamLLMWithTools(
  config: FunctionCallingConfig,
  messages: ConversationMessage[],
  callbacks?: StreamCallbacks
): AsyncGenerator<{ type: 'content' | 'reasoning_content' | 'tool_call' | 'done' | 'usage'; data: string | ToolCallRequest | LLMResponse | { inputTokens: number; outputTokens: number } }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const tools = buildToolsForLLM();

  const body: Record<string, unknown> = {
    model: config.modelName,
    messages,
    temperature: config.temperature ?? 0.7,
    tools: tools.length > 0 ? tools : undefined,
    stream: true,
  };

  // Gemini 兼容性处理：移除不支持的参数
  if (config.isGeminiModel) {
    // Google Gemini OpenAI 兼容端点不支持以下参数：
    // - max_tokens: 使用默认值
    // - tool_choice: Gemini 自动决定是否使用工具
    // 这些参数会导致 400 Bad Request 错误
    console.log('[functionCalling] Using Gemini-compatible mode (removing unsupported params)');
    
    // Gemini 思考配置：启用思考总结
    // 参考: https://ai.google.dev/gemini-api/docs/openai (Thinking 部分)
    // 使用 extra_body 字段传递 Gemini 特定配置
    if (config.includeThoughts !== false) {
      body.extra_body = {
        google: {
          thinking_config: {
            include_thoughts: true
          }
        }
      };
      console.log('[functionCalling] Enabled Gemini thinking with extra_body.google.thinking_config');
    }
  } else {
    // 非 Gemini 模型：添加完整参数
    body.max_tokens = config.maxTokens;
    body.tool_choice = tools.length > 0 ? 'auto' : undefined;
  }

  // 只有支持的 API (如 OpenAI) 才添加 stream_options
  // Google Gemini 等兼容端点不支持此参数，会导致 400 错误
  if (config.supportsStreamOptions && !config.isGeminiModel) {
    body.stream_options = { include_usage: true };
  }

  // Gemini 兼容性处理：转换消息格式
  // Google Gemini API 要求 tool 消息的 content 必须是 JSON 对象（google.protobuf.Struct）
  // 纯文本字符串会导致 400 INVALID_ARGUMENT 错误
  if (config.isGeminiModel) {
    body.messages = transformMessagesForGemini(messages);
    console.log('[functionCalling] Messages transformed for Gemini compatibility');
  }

  console.log('[functionCalling] Request config:', {
    apiUrl: config.apiUrl,
    modelName: config.modelName,
    hasApiKey: !!config.apiKey,
    supportsStreamOptions: config.supportsStreamOptions,
    isGeminiModel: config.isGeminiModel,
    bodyKeys: Object.keys(body),
    hasTools: !!body.tools,
    toolCount: Array.isArray(body.tools) ? body.tools.length : 0,
    messageCount: messages.length,
  });

  // 对于 Gemini 模型，记录详细的消息内容用于调试
  if (config.isGeminiModel) {
    console.log('[functionCalling] Messages for Gemini (debug):', JSON.stringify(messages.map(m => ({
      role: m.role,
      hasContent: !!m.content,
      contentType: typeof m.content,
      contentLength: typeof m.content === 'string' ? m.content.length : Array.isArray(m.content) ? m.content.length : 0,
      hasToolCalls: !!(m as {toolCalls?: unknown}).toolCalls,
      toolCallCount: (m as {toolCalls?: unknown[]}).toolCalls?.length || 0,
      toolCallId: (m as {toolCallId?: string}).toolCallId,
      name: (m as {name?: string}).name,
    })), null, 2));
    
    // 检查图片消息格式
    const userMsgWithImage = messages.find(m => 
      m.role === 'user' && Array.isArray(m.content) && 
      m.content.some(p => p.type === 'image_url')
    );
    if (userMsgWithImage && Array.isArray(userMsgWithImage.content)) {
      const imagePart = userMsgWithImage.content.find(p => p.type === 'image_url');
      if (imagePart?.image_url?.url) {
        const imageUrl = imagePart.image_url.url;
        console.log('[functionCalling] Image URL format check:', {
          startsWithData: imageUrl.startsWith('data:'),
          urlLength: imageUrl.length,
          urlPrefix: imageUrl.substring(0, 100),
          estimatedSizeKB: Math.round(imageUrl.length * 0.75 / 1024), // Base64 约为原始大小的 4/3
        });
      }
    }
  }

  const response = await fetch(config.apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let errorMessage = `API request failed: ${response.status} ${response.statusText}`;
    let errorDetails: unknown = null;
    try {
      const errorData = await response.json();
      errorDetails = errorData;
      console.error('[functionCalling] API Error Details:', JSON.stringify(errorData, null, 2));
      if (errorData.error?.message) {
        errorMessage = errorData.error.message;
      } else if (errorData.message) {
        errorMessage = errorData.message;
      } else if (typeof errorData.error === 'string') {
        errorMessage = errorData.error;
      }
    } catch (e) {
      console.error('[functionCalling] Failed to parse error response:', e);
    }
    throw new Error(errorMessage);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let accumulatedContent = '';
  let accumulatedReasoningContent = '';
  const toolCallsMap = new Map<string, ToolCallRequest>();
  let receivedDoneSignal = false;
  let usageData: { prompt_tokens: number; completion_tokens: number } | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') {
          receivedDoneSignal = true;
          
          if (usageData && callbacks?.onTokenUsage) {
            callbacks.onTokenUsage({
              inputTokens: usageData.prompt_tokens || 0,
              outputTokens: usageData.completion_tokens || 0,
            });
          } else if (callbacks?.onTokenUsage) {
            const messagesStr = JSON.stringify(messages);
            const cjkCount = (messagesStr.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g) || []).length;
            const nonCjkLength = messagesStr.length - cjkCount;
            const estimatedInputTokens = Math.ceil(cjkCount / 1.5 + nonCjkLength / 4);
            const totalOutput = accumulatedContent + accumulatedReasoningContent;
            const outCjkCount = (totalOutput.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g) || []).length;
            const outNonCjkLength = totalOutput.length - outCjkCount;
            const estimatedOutputTokens = Math.ceil(outCjkCount / 1.5 + outNonCjkLength / 4);
            callbacks.onTokenUsage({
              inputTokens: estimatedInputTokens,
              outputTokens: estimatedOutputTokens,
            });
          }
          
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

          // 调试：记录 Gemini 返回的完整 delta 结构
          if (config.isGeminiModel && delta) {
            const deltaKeys = Object.keys(delta);
            
            // 详细记录 extra_content 结构
            if (delta?.extra_content) {
              const isThought = delta.extra_content.google?.thought === true;
              if (isThought) {
                console.log('[functionCalling] Gemini thinking content detected, content length:', delta.content?.length || 0);
              }
            }
          }

          if (json.usage) {
            usageData = json.usage;
            console.log('[functionCalling] Received usage data from API:', usageData);
          }

          if (delta?.reasoning_content) {
            accumulatedReasoningContent += delta.reasoning_content;
            yield { type: 'reasoning_content', data: delta.reasoning_content };
          }

          // Gemini 思考内容处理
          // Gemini 3/2.5 模型通过 extra_content.google.thought 标识思考内容
          // 当 thought === true 时，delta.content 包含的是思考文本
          if (delta?.thoughts && Array.isArray(delta.thoughts)) {
            for (const thought of delta.thoughts) {
              if (thought?.text) {
                accumulatedReasoningContent += thought.text;
                yield { type: 'reasoning_content', data: thought.text };
                console.log('[functionCalling] Received Gemini thought:', thought.text.substring(0, 100) + '...');
              }
            }
          }

          // Gemini 通过 extra_content.google.thought 标志区分思考和正常内容
          const isGeminiThought = config.isGeminiModel && 
            (delta as Record<string, unknown>)?.extra_content !== undefined &&
            ((delta as Record<string, unknown>).extra_content as Record<string, unknown>)?.google !== undefined &&
            (((delta as Record<string, unknown>).extra_content as Record<string, unknown>).google as Record<string, unknown>)?.thought === true;

          if (delta?.content) {
            if (isGeminiThought) {
              // 这是 Gemini 的思考内容
              accumulatedReasoningContent += delta.content;
              yield { type: 'reasoning_content', data: delta.content };
            } else {
              // 正常回复内容
              accumulatedContent += delta.content;
              yield { type: 'content', data: delta.content };
            }
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
                
                // 提取 Gemini 3 Thought Signature（位于 extra_content.google.thought_signature）
                // 这是 Gemini 3 模型的强制要求，必须在后续请求中原样返回
                if ((tc as Record<string, unknown>)?.extra_content) {
                  const extraContent = (tc as Record<string, unknown>).extra_content as Record<string, unknown>;
                  if (extraContent?.google) {
                    const googleData = extraContent.google as Record<string, unknown>;
                    if (googleData?.thought_signature && typeof googleData.thought_signature === 'string') {
                      existing.thoughtSignature = googleData.thought_signature;
                      console.log('[functionCalling] Extracted Gemini thought_signature for tool call:', id);
                    }
                  }
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

  // If stream ended without receiving [DONE] signal, it's an error
  if (!receivedDoneSignal) {
    const errorResponse: LLMResponse = {
      content: accumulatedContent || '模型连接中断，未收到完整响应。可能是网络问题或模型服务异常。',
      reasoningContent: accumulatedReasoningContent,
      toolCalls: toolCallsMap.size > 0 ? Array.from(toolCallsMap.values()) : undefined,
      finishReason: 'error',
      error: 'Stream ended unexpectedly without [DONE] signal',
    };
    yield { type: 'done', data: errorResponse };
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
