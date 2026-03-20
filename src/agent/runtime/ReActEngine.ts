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
} from '../types';
import { ToolRegistry } from '../tools/ToolRegistry';
import {
  callLLMWithTools,
  streamLLMWithTools,
  executeToolCall,
  parseToolCallArguments,
  createSystemPromptForTools,
  FunctionCallingConfig,
} from '../llm/functionCalling';

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
- When you have the answer, respond directly to the user`;

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

        if (response.reasoningContent) {
          this.addReasoningStep('thought', response.reasoningContent);
        } else if (response.content) {
          this.addReasoningStep('thought', response.content);
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

    const messages: ConversationMessage[] = [
      { role: 'system', content: systemPrompt },
    ];

    for (const msg of this.context.conversationHistory) {
      messages.push(msg);
    }

    const lastMessage = messages[messages.length - 1];
    const lastUserMessage = this.context.conversationHistory
      .filter(m => m.role === 'user')
      .pop();
    
    if (!lastUserMessage || lastUserMessage.content !== userInput) {
      messages.push({ role: 'user', content: userInput });
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

    try {
      const stream = streamLLMWithTools(config, messages);

      for await (const chunk of stream) {
        if (this.abortController?.signal.aborted) {
          break;
        }

        if (chunk.type === 'reasoning_content' && typeof chunk.data === 'string') {
          accumulatedReasoningContent += chunk.data;
        } else if (chunk.type === 'content' && typeof chunk.data === 'string') {
          accumulatedContent += chunk.data;
          this.context.onContentChunk?.(chunk.data);
        } else if (chunk.type === 'tool_call' && typeof chunk.data === 'object' && 'id' in chunk.data) {
          const tc = chunk.data as ToolCallRequest;
          toolCallsMap.set(tc.id, tc);
        } else if (chunk.type === 'done' && typeof chunk.data === 'object') {
          const finalResponse = chunk.data as LLMResponse;
          return {
            content: accumulatedContent || finalResponse.content,
            reasoningContent: accumulatedReasoningContent || finalResponse.reasoningContent,
            toolCalls: toolCallsMap.size > 0 ? Array.from(toolCallsMap.values()) : finalResponse.toolCalls,
            finishReason: finalResponse.finishReason,
          };
        }
      }

      return {
        content: accumulatedContent,
        reasoningContent: accumulatedReasoningContent,
        toolCalls: toolCallsMap.size > 0 ? Array.from(toolCallsMap.values()) : undefined,
        finishReason: toolCallsMap.size > 0 ? 'tool_calls' : 'stop',
      };
    } catch (error) {
      console.error('Stream error:', error);
      return {
        content: accumulatedContent,
        reasoningContent: accumulatedReasoningContent,
        finishReason: 'error',
      };
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
    const params = parseToolCallArguments(toolCall.function.arguments);
    const requiresAuth = ToolRegistry.requiresAuth(toolName);

    const record: ToolCallRecord = {
      id: toolCall.id,
      toolName,
      parameters: params,
      status: 'pending',
      timestamp: Date.now(),
      requiresAuth,
    };

    this.state.toolCallHistory.push(record);
    this.context.onToolCall?.(record);
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
    this.addReasoningStep('action', `Calling tool: ${toolName}(${JSON.stringify(params)})`);

    try {
      const result = await executeToolCall({
        id: toolCall.id,
        type: 'function',
        function: toolCall.function,
      });

      record.result = {
        success: result.success,
        output: result.output,
        error: result.error,
      };
      record.status = result.success ? 'success' : 'error';

      this.addReasoningStep('observation', result.success ? result.output : `Error: ${result.error}`);

      return { output: result.output, error: result.error };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      record.status = 'error';
      record.result = { success: false, output: '', error: errorMessage };
      
      this.addReasoningStep('observation', `Error: ${errorMessage}`);
      return { output: '', error: errorMessage };
    }
  }

  private addReasoningStep(type: ReasoningStep['type'], content: string): void {
    this.stepCounter++;
    const step: ReasoningStep = {
      id: `step_${this.stepCounter}_${Date.now()}`,
      type,
      content,
      timestamp: Date.now(),
    };

    this.state.reasoningSteps.push(step);
    this.context.onReasoningStep?.(step);
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
