import {
  AgentExecutionContext,
  AgentExecutionState,
  AgentStatus,
  Task,
  ReasoningStep,
  ToolCallRecord,
  ConversationMessage,
  LLMResponse,
  ToolCallRequest,
  DEFAULT_AGENT_CONFIG,
  ContentPart,
} from '../types';
import { ToolRegistry } from '../tools/ToolRegistry';
import {
  callLLMWithTools,
  streamLLMWithTools,
  parseToolCallArguments,
  createSystemPromptForTools,
  FunctionCallingConfig,
} from '../llm/functionCalling';
import { isUrlPlaceholder, getOriginalUrl } from '../preprocess/urlDetector';
import { fetchMemoryManager } from '../memory';

const REACT_SYSTEM_PROMPT = `You are an intelligent agent that uses the ReAct (Reasoning + Acting) framework to solve problems.

## Current Date
Today's date is: {{CURRENT_DATE}}
When searching for recent news or information, use the current year ({{CURRENT_YEAR}}) in your search queries.

For each step, you should:
1. **Thought**: Think about what you need to do next
2. **Action**: If you need to use a tool, call it with appropriate parameters
3. **Observation**: You will receive the result of your action

Continue this loop until you have a final answer for the user.

When you have gathered enough information to answer the user's question, provide your final answer directly without calling any more tools.

Important rules:
- Always think before acting
- Use tools when you need external information or to perform actions
- When searching for news or recent information, ALWAYS include the current year {{CURRENT_YEAR}} in your search query
- If a tool call fails, try a different approach
- Be concise in your thoughts
- When you have the answer, respond directly to the user

## 工具使用规则（非常重要）

**优先级规则**：
1. 如果网页内容已在上下文中提供 → **直接使用，禁止再次调用工具**
2. 如果用户询问已获取内容的相关问题 → **基于已有内容回答，不要再调用 search**
3. 只有在以下情况才允许调用 fetch_url 或 web_search：
   - 用户明确要求获取新内容
   - 信息明显缺失且不在上下文中
   - 用户要求刷新/更新信息

**禁止重复调用**：
- 如果某个 URL 的内容已在上下文中，禁止再次调用 fetch_url
- 如果用户问题是关于已获取内容的总结/分析，禁止调用 web_search
- 每次调用工具前，先检查上下文中是否已有相关信息`;

export class ReActEngine {
  private context: AgentExecutionContext;
  private state: AgentExecutionState;
  private abortController: AbortController | null = null;
  private stepCounter: number = 0;

  constructor(context: AgentExecutionContext) {
    this.context = context;
    this.state = this.initializeState();
  }

  private initializeState(): AgentExecutionState {
    return {
      agentId: this.context.agent.id,
      status: 'idle',
      taskQueue: [],
      completedTasks: [],
      reasoningSteps: [],
      toolCallHistory: [],
      iterationCount: 0,
      maxIterations: DEFAULT_AGENT_CONFIG.maxIterations,
      startTime: Date.now(),
      lastUpdateTime: Date.now(),
    };
  }

  async run(userInput: string): Promise<string> {
    this.abortController = new AbortController();
    this.updateStatus('thinking');
    this.state.startTime = Date.now();

    const messages: ConversationMessage[] = this.buildInitialMessages(userInput);

    try {
      while (this.state.iterationCount < this.state.maxIterations) {
        if (this.abortController.signal.aborted) {
          this.updateStatus('failed');
          return 'Execution was cancelled by user.';
        }

        this.state.iterationCount++;
        this.state.lastUpdateTime = Date.now();
        this.context.onIterationCountChange?.(this.state.iterationCount);

        const response = await this.callLLMStream(messages);

        if (response.finishReason === 'error') {
          this.updateStatus('failed');
          throw new Error(response.error || response.content || '模型请求失败');
        }

        if (!response.toolCalls || response.toolCalls.length === 0) {
          this.updateStatus('completed');
          return response.content || 'Task completed.';
        }

        for (const toolCall of response.toolCalls) {
          const result = await this.handleToolCall(toolCall);
          
          messages.push({
            role: 'assistant',
            content: response.content || '',
            toolCalls: response.toolCalls,
          });

          messages.push({
            role: 'tool',
            content: result.output || result.error || 'No output',
            toolCallId: toolCall.id,
            name: toolCall.function.name,
          });
        }

        this.updateStatus('thinking');
      }

      this.updateStatus('completed');
      return 'Maximum iterations reached. Task may not be fully completed.';
    } catch (error) {
      this.updateStatus('failed');
      throw error;
    }
  }

  private buildInitialMessages(userInput: string): ConversationMessage[] {
    const basePrompt = this.context.agent.systemPrompt || '';
    const currentDate = new Date().toLocaleDateString('zh-CN', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      weekday: 'long'
    });
    const currentYear = new Date().getFullYear();
    
    let systemPrompt = `${REACT_SYSTEM_PROMPT}\n\n${basePrompt}`;
    systemPrompt = systemPrompt.replace(/\{\{CURRENT_DATE\}\}/g, currentDate);
    systemPrompt = systemPrompt.replace(/\{\{CURRENT_YEAR\}\}/g, String(currentYear));
    systemPrompt = createSystemPromptForTools(systemPrompt);

    const memoryContext = fetchMemoryManager.generateContextPrompt();
    if (memoryContext) {
      systemPrompt = `${systemPrompt}\n\n${memoryContext}`;
    }

    const messages: ConversationMessage[] = [
      { role: 'system', content: systemPrompt },
    ];

    for (const msg of this.context.conversationHistory) {
      messages.push(msg);
    }

    const lastUserMessage = this.context.conversationHistory
      .filter(m => m.role === 'user')
      .pop();
    
    const lastMessageText = typeof lastUserMessage?.content === 'string' 
      ? lastUserMessage.content 
      : (lastUserMessage?.content as ContentPart[])?.find((c: ContentPart) => c.type === 'text')?.text || '';
    
    if (!lastUserMessage || lastMessageText !== userInput) {
      const imageAttachments = this.context.imageAttachments;
      
      if (imageAttachments && imageAttachments.length > 0) {
        const content: ContentPart[] = [{ type: 'text', text: userInput }];
        for (const img of imageAttachments) {
          content.push({
            type: 'image_url',
            image_url: { url: img.data }
          });
        }
        messages.push({ role: 'user', content });
      } else {
        messages.push({ role: 'user', content: userInput });
      }
    }

    return messages;
  }

  private async callLLMStream(messages: ConversationMessage[]): Promise<LLMResponse> {
    const config: FunctionCallingConfig = {
      apiUrl: this.context.agent.apiUrl || 'http://localhost:1234/v1/chat/completions',
      modelName: this.context.agent.modelId || 'local-model',
      apiKey: this.context.agent.apiKey,
      temperature: this.context.agent.temperature ?? 0.7,
    };

    let accumulatedContent = '';
    let accumulatedReasoningContent = '';
    const toolCallsMap = new Map<string, ToolCallRequest>();
    let currentThoughtStepId: string | null = null;
    let hasToolCalls = false;
    let isResponding = false;

    try {
      const stream = streamLLMWithTools(config, messages, {
        onTokenUsage: this.context.onTokenUsage,
      });

      for await (const chunk of stream) {
        if (this.abortController?.signal.aborted) {
          break;
        }

        if (chunk.type === 'reasoning_content' && typeof chunk.data === 'string') {
          accumulatedReasoningContent += chunk.data;
          if (!currentThoughtStepId) {
            currentThoughtStepId = this.addReasoningStep('thought', accumulatedReasoningContent, { isStreaming: true });
          } else {
            this.updateReasoningStep(currentThoughtStepId, accumulatedReasoningContent, true);
          }
        } else if (chunk.type === 'content' && typeof chunk.data === 'string') {
          accumulatedContent += chunk.data;
          if (!hasToolCalls && !isResponding) {
            isResponding = true;
            this.updateStatus('responding');
          }
          this.context.onContentChunk?.(chunk.data);
        } else if (chunk.type === 'tool_call' && typeof chunk.data === 'object' && 'id' in chunk.data) {
          hasToolCalls = true;
          const tc = chunk.data as ToolCallRequest;
          toolCallsMap.set(tc.id, tc);
        } else if (chunk.type === 'done' && typeof chunk.data === 'object') {
          if (currentThoughtStepId) {
            this.finalizeReasoningStep(currentThoughtStepId);
          }
          const finalResponse = chunk.data as LLMResponse;
          return {
            content: accumulatedContent || finalResponse.content,
            reasoningContent: accumulatedReasoningContent || finalResponse.reasoningContent,
            toolCalls: toolCallsMap.size > 0 ? Array.from(toolCallsMap.values()) : finalResponse.toolCalls,
            finishReason: finalResponse.finishReason,
            error: finalResponse.error,
          };
        }
      }

      if (currentThoughtStepId) {
        this.finalizeReasoningStep(currentThoughtStepId);
      }

      return {
        content: accumulatedContent,
        reasoningContent: accumulatedReasoningContent,
        toolCalls: toolCallsMap.size > 0 ? Array.from(toolCallsMap.values()) : undefined,
        finishReason: toolCallsMap.size > 0 ? 'tool_calls' : 'stop',
      };
    } catch (error) {
      console.error('Stream error:', error);
      if (currentThoughtStepId) {
        this.finalizeReasoningStep(currentThoughtStepId);
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(errorMessage);
    }
  }

  private async callLLM(messages: ConversationMessage[]): Promise<LLMResponse> {
    const config: FunctionCallingConfig = {
      apiUrl: this.context.agent.apiUrl || 'http://localhost:1234/v1/chat/completions',
      modelName: this.context.agent.modelId || 'local-model',
      apiKey: this.context.agent.apiKey,
      temperature: this.context.agent.temperature ?? 0.7,
    };

    return callLLMWithTools(config, messages);
  }

  private async handleToolCall(toolCall: ToolCallRequest): Promise<{ output: string; error?: string }> {
    const toolName = toolCall.function.name;
    let params = parseToolCallArguments(toolCall.function.arguments);
    const requiresAuth = ToolRegistry.requiresAuth(toolName);

    console.log('[ReActEngine] Tool call:', toolName, 'params:', params);
    console.log('[ReActEngine] preprocessedUrls:', this.context.preprocessedUrls ? Object.fromEntries(this.context.preprocessedUrls) : 'undefined');

    if (this.context.preprocessedUrls && params.url && typeof params.url === 'string') {
      console.log('[ReActEngine] Checking if URL is placeholder:', params.url, 'isPlaceholder:', isUrlPlaceholder(params.url));
      if (isUrlPlaceholder(params.url)) {
        const originalUrl = getOriginalUrl(params.url, this.context.preprocessedUrls);
        console.log('[ReActEngine] Original URL from map:', originalUrl);
        if (originalUrl) {
          console.log(`[ReActEngine] Replacing URL placeholder: ${params.url} -> ${originalUrl}`);
          params = { ...params, url: originalUrl };
        }
      }
    }

    if (this.context.preprocessedUrls && params.query && typeof params.query === 'string') {
      if (isUrlPlaceholder(params.query)) {
        const originalUrl = getOriginalUrl(params.query, this.context.preprocessedUrls);
        if (originalUrl) {
          console.log(`[ReActEngine] Detected URL placeholder in query, redirecting to fetch_url: ${originalUrl}`);
          return { 
            output: '', 
            error: `检测到 URL 占位符 "${params.query}"，请使用 fetch_url 工具获取网页内容，而不是 web_search。正确的调用方式：fetch_url(url: "${params.query}")` 
          };
        }
      }
    }

    if (toolName === 'fetch_url' && params.url && typeof params.url === 'string') {
      const forceRefresh = params.force_refresh === true;
      if (!forceRefresh && fetchMemoryManager.has(params.url)) {
        const cached = fetchMemoryManager.get(params.url);
        if (cached) {
          console.log(`[ReActEngine] Returning cached content for: ${params.url}`);
          const output = `## ${cached.title}\n来源: ${cached.url}\n类型: ${cached.contentType}\n\n---\n\n${cached.content}\n\n(来自内存缓存)`;
          this.addReasoningStep('action', '', { toolName, toolParams: params, executionStatus: 'completed' });
          this.addReasoningStep('observation', '从内存缓存返回内容');
          return { output };
        }
      }
    }

    const record: ToolCallRecord = {
      id: toolCall.id,
      toolName,
      parameters: params,
      status: 'pending',
      timestamp: Date.now(),
      requiresAuth,
    };

    this.state.toolCallHistory.push(record);
    this.updateStatus('acting');

    if (requiresAuth && !DEFAULT_AGENT_CONFIG.enableAutoAuth) {
      this.updateStatus('waiting_auth');
      record.status = 'waiting_auth';
      
      if (this.context.onRequestAuth) {
        const approved = await this.context.onRequestAuth(record);
        record.approvedByUser = approved;
        
        if (!approved) {
          record.status = 'error';
          return { output: '', error: 'User denied authorization for this tool call.' };
        }
      }
    }

    record.status = 'executing';
    const actionStepId = this.addReasoningStep('action', '', { toolName, toolParams: params, executionStatus: 'executing' });

    try {
      const result = await ToolRegistry.execute(toolName, params);

      record.result = {
        success: result.success,
        output: result.output,
        error: result.error,
      };
      record.status = result.success ? 'success' : 'error';

      this.updateActionStepStatus(actionStepId, 'completed');

      let observationData: Array<{ title: string; url: string; snippet?: string }> | undefined;
      if (result.success && result.output && toolName === 'web_search') {
        try {
          const parsed = JSON.parse(result.output);
          if (Array.isArray(parsed)) {
            observationData = parsed.map((item: any) => ({
              title: item.title || item.name || 'Unknown',
              url: item.url || item.link || '',
              snippet: item.snippet || item.description || item.content || '',
            }));
          }
        } catch {
          // If parsing fails, fall back to raw output
        }
      }

      if (result.success && toolName === 'fetch_url' && params.url && result.metadata) {
        const metadata = result.metadata as {
          title?: string;
          domain?: string;
          contentLength?: number;
          contentType?: string;
          pageCount?: number;
        };
        fetchMemoryManager.add({
          url: params.url as string,
          title: metadata.title || 'Untitled',
          content: result.output || '',
          contentType: metadata.contentType,
          pageCount: metadata.pageCount,
        });
      }

      this.addReasoningStep('observation', result.success ? '' : `Error: ${result.error}`, { observationData });

      this.context.onToolCall?.(record);

      return { output: result.output, error: result.error };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      record.status = 'error';
      record.result = { success: false, output: '', error: errorMessage };
      
      this.updateActionStepStatus(actionStepId, 'completed');
      this.addReasoningStep('observation', `Error: ${errorMessage}`);
      
      this.context.onToolCall?.(record);
      
      return { output: '', error: errorMessage };
    }
  }

  private addReasoningStep(
    type: ReasoningStep['type'], 
    content: string, 
    options?: { 
      customId?: string; 
      isStreaming?: boolean;
      toolName?: string;
      toolParams?: Record<string, unknown>;
      observationData?: Array<{ title: string; url: string; snippet?: string }>;
      executionStatus?: 'executing' | 'completed';
    }
  ): string {
    this.stepCounter++;
    const stepId = options?.customId || `step_${this.stepCounter}_${Date.now()}`;
    const step: ReasoningStep = {
      id: stepId,
      type,
      content,
      timestamp: Date.now(),
      isStreaming: options?.isStreaming ?? false,
      toolName: options?.toolName,
      toolParams: options?.toolParams,
      observationData: options?.observationData,
      executionStatus: options?.executionStatus,
    };

    this.state.reasoningSteps.push(step);
    this.context.onReasoningStep?.(step);
    return stepId;
  }

  private updateActionStepStatus(stepId: string, status: 'executing' | 'completed'): void {
    const step = this.state.reasoningSteps.find(s => s.id === stepId);
    if (step && step.type === 'action') {
      step.executionStatus = status;
      this.context.onReasoningStepUpdate?.(step);
    }
  }

  private updateReasoningStep(stepId: string, content: string, isStreaming: boolean = true): void {
    const step = this.state.reasoningSteps.find(s => s.id === stepId);
    if (step) {
      step.content = content;
      step.isStreaming = isStreaming;
      this.context.onReasoningStepUpdate?.(step);
    }
  }

  private finalizeReasoningStep(stepId: string): void {
    const step = this.state.reasoningSteps.find(s => s.id === stepId);
    if (step) {
      step.isStreaming = false;
      this.context.onReasoningStepUpdate?.(step);
    }
  }

  private updateStatus(status: AgentStatus): void {
    this.state.status = status;
    this.state.lastUpdateTime = Date.now();
    this.context.onStatusChange?.(status);
  }

  getState(): AgentExecutionState {
    return { ...this.state };
  }

  abort(): void {
    this.abortController?.abort();
    this.updateStatus('failed');
  }
}

export function createReActEngine(context: AgentExecutionContext): ReActEngine {
  return new ReActEngine(context);
}
