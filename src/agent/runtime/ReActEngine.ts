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

const MAX_CONSECUTIVE_IDENTICAL_CALLS = 3;
const MAX_CONSECUTIVE_EMPTY_ACTIONS = 3;
const MAX_CONSECUTIVE_SIMILAR_ACTIONS = 5;
const MAX_STEP_ITERATIONS = 10;
const REASONING_UPDATE_THROTTLE_MS = 100;

const INFO_RETRIEVAL_TOOLS = new Set([
  'web_search', 'fetch_url', 'http_request',
  'brave_search', 'google_search', 'brave_web_search',
  'scrape', 'scrape_webpage', 'web_extract', 'web_crawl', 'web_map',
]);

function getToolCategory(toolName: string): string {
  if (INFO_RETRIEVAL_TOOLS.has(toolName)) return 'info_retrieval';
  if (toolName.includes('search') || toolName.includes('fetch') || toolName.includes('scrape')) return 'info_retrieval';
  if (toolName === 'read_file' || toolName === 'list_directory') return 'filesystem';
  if (toolName === 'write_file' || toolName === 'create_file' || toolName === 'edit_file') return 'file_write';
  if (toolName === 'execute_shell' || toolName === 'run_command') return 'shell';
  return toolName;
}

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
- NEVER repeat the same action if it has already been attempted. If a tool call failed or returned no useful results, try a completely different approach instead of retrying the same thing.
- If you find yourself unable to make progress after 2-3 attempts, summarize what you have found and provide the best answer you can.

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
  private lastReasoningUpdateTime: number = 0;
  private pendingReasoningUpdate: ReasoningStep | null = null;
  private reasoningUpdateTimer: ReturnType<typeof setTimeout> | null = null;
  private consecutiveIdenticalCalls: Map<string, number> = new Map();
  private consecutiveEmptyActions: number = 0;
  private consecutiveSimilarActions: number = 0;
  private lastToolCategory: string | null = null;

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

  private isAborted(): boolean {
    return this.abortController?.signal.aborted === true;
  }

  async run(userInput: string): Promise<string> {
    this.abortController = new AbortController();
    this.updateStatus('thinking');
    this.state.startTime = Date.now();
    this.consecutiveIdenticalCalls.clear();
    this.consecutiveEmptyActions = 0;
    this.consecutiveSimilarActions = 0;
    this.lastToolCategory = null;

    const messages: ConversationMessage[] = this.buildInitialMessages(userInput);
    let allContent = '';

    try {
      while (this.state.iterationCount < this.state.maxIterations) {
        if (this.isAborted()) {
          this.flushReasoningUpdate();
          this.updateStatus('failed');
          return allContent || 'Execution was cancelled by user.';
        }

        this.state.iterationCount++;
        this.state.lastUpdateTime = Date.now();
        this.context.onIterationCountChange?.(this.state.iterationCount);

        const response = await this.callLLMStream(messages);

        if (this.isAborted()) {
          this.flushReasoningUpdate();
          this.updateStatus('failed');
          return allContent || 'Execution was cancelled by user.';
        }

        if (response.finishReason === 'error') {
          this.flushReasoningUpdate();
          this.updateStatus('failed');
          throw new Error(response.error || response.content || '模型请求失败');
        }

        if (response.content) {
          allContent += response.content;
        }

        if (!response.toolCalls || response.toolCalls.length === 0) {
          this.flushReasoningUpdate();
          this.updateStatus('completed');
          return allContent || 'Task completed.';
        }

        for (const toolCall of response.toolCalls) {
          if (this.isAborted()) {
            this.flushReasoningUpdate();
            this.updateStatus('failed');
            return allContent || 'Execution was cancelled by user.';
          }

          const callKey = `${toolCall.function.name}:${toolCall.function.arguments}`;
          const callCount = (this.consecutiveIdenticalCalls.get(callKey) || 0) + 1;
          this.consecutiveIdenticalCalls.set(callKey, callCount);

          if (callCount >= MAX_CONSECUTIVE_IDENTICAL_CALLS) {
            this.flushReasoningUpdate();
            this.finalizeExecutingToolCalls();
            this.addReasoningStep('error', `检测到重复调用 ${toolCall.function.name} 已达 ${callCount} 次，自动终止循环。`);
            this.updateStatus('completed');
            return allContent || `任务执行因检测到重复操作而终止。已尝试 ${this.state.iterationCount} 轮迭代。`;
          }

          const result = await this.handleToolCall(toolCall);

          if (this.isAborted()) {
            this.flushReasoningUpdate();
            this.updateStatus('failed');
            return allContent || 'Execution was cancelled by user.';
          }

          const isUnproductiveResult = !result.output || 
            result.output.trim().length === 0 ||
            result.output.includes("doesn't work properly") ||
            result.output.includes('Please enable JavaScript') ||
            result.output.includes('Access denied') ||
            result.output.includes('path outside allowed directories') ||
            result.error;

          if (isUnproductiveResult) {
            this.consecutiveEmptyActions++;
          } else {
            this.consecutiveEmptyActions = 0;
          }

          if (this.consecutiveEmptyActions >= MAX_CONSECUTIVE_EMPTY_ACTIONS) {
            this.flushReasoningUpdate();
            this.finalizeExecutingToolCalls();
            this.addReasoningStep('error', `连续 ${this.consecutiveEmptyActions} 次工具调用无有效结果，自动终止循环。`);
            this.updateStatus('completed');
            return allContent || `任务执行因连续空结果而终止。已尝试 ${this.state.iterationCount} 轮迭代。`;
          }

          const toolCategory = getToolCategory(toolCall.function.name);
          if (toolCategory === this.lastToolCategory) {
            this.consecutiveSimilarActions++;
          } else {
            this.consecutiveSimilarActions = 0;
          }
          this.lastToolCategory = toolCategory;

          if (this.consecutiveSimilarActions >= MAX_CONSECUTIVE_SIMILAR_ACTIONS) {
            this.flushReasoningUpdate();
            this.finalizeExecutingToolCalls();
            this.addReasoningStep('error', `连续 ${this.consecutiveSimilarActions} 次使用同类工具 (${toolCategory})，可能陷入循环，自动终止。`);
            this.updateStatus('completed');
            return allContent || `任务执行因检测到重复操作模式而终止。已尝试 ${this.state.iterationCount} 轮迭代。`;
          }

          if (this.context.currentTaskPlan && this.state.iterationCount >= MAX_STEP_ITERATIONS) {
            this.flushReasoningUpdate();
            this.finalizeExecutingToolCalls();
            this.addReasoningStep('error', `当前步骤已执行 ${this.state.iterationCount} 轮迭代，超过单步骤最大限制 ${MAX_STEP_ITERATIONS}，自动终止。`);
            this.updateStatus('completed');
            return allContent || `当前步骤执行超过最大迭代限制。已尝试 ${this.state.iterationCount} 轮迭代。`;
          }

          this.emitToolProgress(toolCall.function.name, result, result.observationData);

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

        this.flushReasoningUpdate();
        this.updateStatus('thinking');
      }

      this.flushReasoningUpdate();
      this.updateStatus('completed');
      return allContent || 'Maximum iterations reached. Task may not be fully completed.';
    } catch (error) {
      this.flushReasoningUpdate();
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

    if (this.context.currentTaskPlan) {
      const plan = this.context.currentTaskPlan;
      const currentStep = plan.steps.find(s => s.status === 'in_progress');
      if (currentStep) {
        systemPrompt += `\n\n[TASK PLAN CONTEXT - This is internal context, do NOT echo or repeat these headings in your response]\n`;
        systemPrompt += `You are executing a multi-step task plan. Current step: "${currentStep.title}".\n`;
        systemPrompt += `Focus ONLY on completing this step. Do not deviate to other steps.\n`;
        if (currentStep.toolHint) {
          systemPrompt += `Suggested tool: ${currentStep.toolHint}\n`;
        }
        systemPrompt += `\nPlan overview:\n`;
        for (const step of plan.steps) {
          const statusIcon = step.status === 'completed' ? '✅' :
                             step.status === 'in_progress' ? '🔄' :
                             step.status === 'failed' ? '❌' : '⏳';
          systemPrompt += `- ${statusIcon} ${step.title}${step.id === currentStep.id ? ' (current step)' : ''}\n`;
        }
      }
    }

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

  private throttledReasoningStepUpdate(step: ReasoningStep): void {
    const now = Date.now();
    this.pendingReasoningUpdate = step;

    if (now - this.lastReasoningUpdateTime >= REASONING_UPDATE_THROTTLE_MS) {
      this.flushReasoningUpdate();
    } else if (!this.reasoningUpdateTimer) {
      this.reasoningUpdateTimer = setTimeout(() => {
        this.flushReasoningUpdate();
      }, REASONING_UPDATE_THROTTLE_MS);
    }
  }

  private flushReasoningUpdate(): void {
    if (this.reasoningUpdateTimer) {
      clearTimeout(this.reasoningUpdateTimer);
      this.reasoningUpdateTimer = null;
    }
    if (this.pendingReasoningUpdate) {
      this.context.onReasoningStepUpdate?.(this.pendingReasoningUpdate);
      this.pendingReasoningUpdate = null;
      this.lastReasoningUpdateTime = Date.now();
    }
  }

  private async callLLMStream(messages: ConversationMessage[]): Promise<LLMResponse> {
    const isOpenAICompatible = this.context.agent.onlineProvider === 'openai' ||
                               this.context.agent.modelProvider === 'lmstudio' ||
                               this.context.agent.modelProvider === 'ollama' ||
                               !this.context.agent.onlineProvider;
    
    const isGeminiModel = this.context.agent.onlineProvider === 'google' ||
                           this.context.agent.modelId?.toLowerCase().includes('gemini');
    
    const config: FunctionCallingConfig = {
      apiUrl: this.context.agent.apiUrl || 'http://localhost:1234/v1/chat/completions',
      modelName: this.context.agent.modelId || 'local-model',
      apiKey: this.context.agent.apiKey,
      temperature: this.context.agent.temperature ?? 0.7,
      supportsStreamOptions: isOpenAICompatible,
      isGeminiModel,
      includeThoughts: isGeminiModel,
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
        if (this.isAborted()) {
          break;
        }

        if (chunk.type === 'reasoning_content' && typeof chunk.data === 'string') {
          accumulatedReasoningContent += chunk.data;
          if (!currentThoughtStepId) {
            currentThoughtStepId = this.addReasoningStep('thought', accumulatedReasoningContent, { isStreaming: true });
          } else {
            this.updateReasoningStepThrottled(currentThoughtStepId, accumulatedReasoningContent, true);
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
    const isOpenAICompatible = this.context.agent.onlineProvider === 'openai' ||
                               this.context.agent.modelProvider === 'lmstudio' ||
                               this.context.agent.modelProvider === 'ollama' ||
                               !this.context.agent.onlineProvider;
    
    const isGeminiModel = this.context.agent.onlineProvider === 'google' ||
                           this.context.agent.modelId?.toLowerCase().includes('gemini');
    
    const config: FunctionCallingConfig = {
      apiUrl: this.context.agent.apiUrl || 'http://localhost:1234/v1/chat/completions',
      modelName: this.context.agent.modelId || 'local-model',
      apiKey: this.context.agent.apiKey,
      temperature: this.context.agent.temperature ?? 0.7,
      supportsStreamOptions: isOpenAICompatible,
      isGeminiModel,
    };

    return callLLMWithTools(config, messages);
  }

  private async handleToolCall(toolCall: ToolCallRequest): Promise<{ output: string; error?: string; observationData?: Array<{ title: string; url: string; snippet?: string }> }> {
    const toolName = toolCall.function.name;
    let params = parseToolCallArguments(toolCall.function.arguments);
    const requiresAuth = ToolRegistry.requiresAuth(toolName);

    if (this.context.preprocessedUrls && params.url && typeof params.url === 'string') {
      if (isUrlPlaceholder(params.url)) {
        const originalUrl = getOriginalUrl(params.url, this.context.preprocessedUrls);
        if (originalUrl) {
          params = { ...params, url: originalUrl };
        }
      }
    }

    if (this.context.preprocessedUrls && params.query && typeof params.query === 'string') {
      if (isUrlPlaceholder(params.query)) {
        const originalUrl = getOriginalUrl(params.query, this.context.preprocessedUrls);
        if (originalUrl) {
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
          const output = `## ${cached.title}\n来源: ${cached.url}\n类型: ${cached.contentType}\n\n---\n\n${cached.content}\n\n(来自内存缓存)`;
          this.addReasoningStep('tool_result', '', { toolName, toolParams: params, executionStatus: 'completed' });
          this.addReasoningStep('tool_result', '从内存缓存返回内容');
          return { output, observationData: undefined };
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

    if (this.isAborted()) {
      return { output: '', error: 'Execution was cancelled by user.' };
    }

    record.status = 'executing';
    const displayParams = this.truncateToolParams(toolName, params);
    const actionStepId = this.addReasoningStep('tool_start', '', { toolName, toolParams: displayParams, executionStatus: 'executing' });
    this.emitToolStart(toolName, params);

    try {
      const result = await ToolRegistry.execute(toolName, params);

      if (this.isAborted()) {
        return { output: result.output || '', error: 'Execution was cancelled by user.' };
      }

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
          let jsonStr = result.output;
          if (result.output.includes('AI Answer:') && result.output.includes('Search Results:')) {
            const searchResultsIndex = result.output.indexOf('Search Results:');
            if (searchResultsIndex !== -1) {
              jsonStr = result.output.substring(searchResultsIndex + 'Search Results:'.length).trim();
            }
          }
          const parsed = JSON.parse(jsonStr);
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

      this.addReasoningStep(result.success ? 'tool_result' : 'error', result.success ? '' : `Error: ${result.error}`, { observationData });

      this.context.onToolCall?.(record);

      return { output: result.output, error: result.error, observationData };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      record.status = 'error';
      record.result = { success: false, output: '', error: errorMessage };
      
      this.updateActionStepStatus(actionStepId, 'completed');
      this.addReasoningStep('error', `Error: ${errorMessage}`);
      
      this.context.onToolCall?.(record);
      
      return { output: '', error: errorMessage, observationData: undefined };
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
    if (step && (step.type === 'action' || step.type === 'tool_start')) {
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

  private updateReasoningStepThrottled(stepId: string, content: string, isStreaming: boolean = true): void {
    const step = this.state.reasoningSteps.find(s => s.id === stepId);
    if (step) {
      step.content = content;
      step.isStreaming = isStreaming;
      this.throttledReasoningStepUpdate(step);
    }
  }

  private finalizeReasoningStep(stepId: string): void {
    this.flushReasoningUpdate();
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

  private emitToolProgress(
    toolName: string,
    result: { output: string; error?: string },
    observationData?: Array<{ title: string; url: string; snippet?: string }>
  ): void {
    if (!this.context.currentTaskPlan) return;

    const plan = this.context.currentTaskPlan;
    const currentStep = plan.steps.find(s => s.status === 'in_progress');
    if (!currentStep) return;

    const summary = this.formatToolSummary(toolName, result);
    const toolStatus = result.error ? 'failed' : 'completed';

    const truncatedResult = result.output && result.output.length > 500
      ? result.output.substring(0, 500) + '...'
      : result.output;

    const existingCalls = currentStep.toolCalls || [];
    const updatedCalls = [
      ...existingCalls.filter(tc => tc.toolName !== toolName || tc.status !== 'executing'),
      {
        toolName,
        status: toolStatus as 'completed' | 'failed',
        summary,
        result: truncatedResult || undefined,
        error: result.error || undefined,
        observationData: observationData && observationData.length > 0 ? observationData : undefined,
      },
    ];

    currentStep.toolCalls = updatedCalls;

    this.context.onTaskPlanUpdate?.({
      ...plan,
      steps: plan.steps.map(s =>
        s.id === currentStep.id ? { ...s, toolCalls: updatedCalls } : s
      ),
    });
  }

  private emitToolStart(toolName: string, params: Record<string, unknown>): void {
    if (!this.context.currentTaskPlan) return;

    const plan = this.context.currentTaskPlan;
    const currentStep = plan.steps.find(s => s.status === 'in_progress');
    if (!currentStep) return;

    const summary = this.formatToolStartSummary(toolName, params);
    const filePath = this.extractFilePath(toolName, params);
    const existingCalls = currentStep.toolCalls || [];
    const updatedCalls = [
      ...existingCalls,
      { toolName, status: 'executing' as const, summary, filePath },
    ];

    currentStep.toolCalls = updatedCalls;

    this.context.onTaskPlanUpdate?.({
      ...plan,
      steps: plan.steps.map(s =>
        s.id === currentStep.id ? { ...s, toolCalls: updatedCalls } : s
      ),
    });
  }

  private extractFilePath(toolName: string, params: Record<string, unknown>): string | undefined {
    const builtinFileTools = ['write_file', 'read_file', 'list_directory', 'create_file', 'edit_file', 'delete_file'];
    if (builtinFileTools.includes(toolName) && params.path && typeof params.path === 'string') {
      return params.path;
    }
    if (params.path && typeof params.path === 'string' && /^[A-Za-z]:\\|^\//.test(params.path as string)) {
      return params.path as string;
    }
    if (params.file_path && typeof params.file_path === 'string') {
      return params.file_path;
    }
    if (params.destination && typeof params.destination === 'string') {
      return params.destination;
    }
    return undefined;
  }

  private formatToolSummary(
    toolName: string,
    result: { output: string; error?: string }
  ): string {
    if (result.error) {
      return `${toolName} 失败: ${result.error.substring(0, 80)}`;
    }

    switch (toolName) {
      case 'web_search': {
        const queryMatch = result.output.match(/"query":\s*"([^"]+)"/);
        const query = queryMatch ? queryMatch[1] : '';
        return query ? `搜索完成: ${query}` : '搜索完成';
      }
      case 'fetch_url':
        return '网页内容已获取';
      case 'read_file':
        return '文件已读取';
      case 'write_file':
        return '文件已写入';
      case 'list_directory':
        return '目录列表已获取';
      case 'execute_shell':
        return '命令已执行';
      case 'calculate':
        return '计算完成';
      default:
        return `${toolName} 完成`;
    }
  }

  private formatToolStartSummary(toolName: string, params: Record<string, unknown>): string {
    switch (toolName) {
      case 'web_search':
        return params.query ? `搜索: ${String(params.query).substring(0, 50)}` : '正在搜索...';
      case 'fetch_url':
        return params.url ? `获取: ${String(params.url).substring(0, 50)}` : '正在获取网页...';
      case 'read_file':
        return params.path ? `读取: ${String(params.path).substring(0, 50)}` : '正在读取文件...';
      case 'write_file':
        return params.path ? `写入: ${String(params.path).substring(0, 50)}` : '正在写入文件...';
      case 'list_directory':
        return params.path ? `列出: ${String(params.path).substring(0, 50)}` : '正在列出目录...';
      case 'execute_shell':
        return params.command ? `执行: ${String(params.command).substring(0, 50)}` : '正在执行命令...';
      default:
        return `正在执行 ${toolName}...`;
    }
  }

  private truncateToolParams(toolName: string, params: Record<string, unknown>): Record<string, unknown> {
    const LARGE_PARAM_TOOLS = new Set(['write_file', 'create_file', 'edit_file']);
    if (LARGE_PARAM_TOOLS.has(toolName) && params.content && typeof params.content === 'string') {
      const content = params.content as string;
      if (content.length > 100) {
        return {
          ...params,
          content: content.substring(0, 100) + `... [${content.length} 字符已省略]`,
        };
      }
    }
    if (params.query && typeof params.query === 'string' && (params.query as string).length > 80) {
      return { ...params, query: (params.query as string).substring(0, 80) + '...' };
    }
    if (params.url && typeof params.url === 'string' && (params.url as string).length > 80) {
      return { ...params, url: (params.url as string).substring(0, 80) + '...' };
    }
    return params;
  }

  private finalizeExecutingToolCalls(): void {
    if (!this.context.currentTaskPlan) return;

    const plan = this.context.currentTaskPlan;
    const currentStep = plan.steps.find(s => s.status === 'in_progress');
    if (!currentStep || !currentStep.toolCalls) return;

    const hasExecuting = currentStep.toolCalls.some(tc => tc.status === 'executing');
    if (!hasExecuting) return;

    const updatedCalls = currentStep.toolCalls.map(tc =>
      tc.status === 'executing'
        ? { ...tc, status: 'failed' as const, error: '任务被终止' }
        : tc
    );

    currentStep.toolCalls = updatedCalls;

    this.context.onTaskPlanUpdate?.({
      ...plan,
      steps: plan.steps.map(s =>
        s.id === currentStep.id ? { ...s, toolCalls: updatedCalls } : s
      ),
    });
  }

  getState(): AgentExecutionState {
    return { ...this.state };
  }

  abort(): void {
    this.flushReasoningUpdate();
    this.finalizeExecutingToolCalls();
    this.abortController?.abort();
    this.updateStatus('failed');
  }
}

export function createReActEngine(context: AgentExecutionContext): ReActEngine {
  return new ReActEngine(context);
}
