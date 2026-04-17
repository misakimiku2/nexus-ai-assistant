import { Agent } from '../../types';
import {
  AgentExecutionContext,
  AgentExecutionState,
  AgentStatus,
  ConversationMessage,
  AgentConfig,
  DEFAULT_AGENT_CONFIG,
  ToolCallRecord,
  TaskPlan,
} from '../types';
import { ReActEngine } from './ReActEngine';
import { agentStateManager } from './AgentState';
import { initializeBuiltinTools } from '../tools/builtin';
import { ToolRegistry } from '../tools/ToolRegistry';
import { preprocessConversation, resetUrlPlaceholderCounter } from '../preprocess/urlDetector';
import { McpService } from '../mcp/McpService';
import { adaptMcpTool } from '../mcp/McpToolAdapter';
import { TaskPlanner } from '../planner/TaskPlanner';

export interface AgentRuntimeOptions {
  agent: Agent;
  config?: Partial<AgentConfig>;
  onStatusChange?: (status: AgentStatus) => void;
  onToolCall?: (record: { id: string; toolName: string; parameters: Record<string, unknown>; status: string; result?: { success: boolean; output: string; error?: string; metadata?: Record<string, unknown> } }) => void;
  onReasoningStep?: (step: { type: string; content: string }) => void;
  onReasoningStepUpdate?: (step: { id: string; type: string; content: string; isStreaming?: boolean }) => void;
  onRequestAuth?: (toolCall: { id: string; toolName: string; parameters: Record<string, unknown>; status: string }) => Promise<boolean>;
  onContentChunk?: (chunk: string) => void;
  onIterationCountChange?: (count: number) => void;
  onTokenUsage?: (usage: { inputTokens: number; outputTokens: number }) => void;
  onTaskPlanUpdate?: (plan: TaskPlan) => void;
}

let toolsInitialized = false;

export class AgentRuntime {
  private agent: Agent;
  private config: AgentConfig;
  private engine: ReActEngine | null = null;
  private callbacks: AgentRuntimeOptions;
  private currentPlan: TaskPlan | null = null;
  private aborted: boolean = false;

  constructor(options: AgentRuntimeOptions) {
    this.agent = options.agent;
    this.config = { ...DEFAULT_AGENT_CONFIG, ...options.config };
    this.callbacks = options;

    agentStateManager.initializeAgent(this.agent, this.config);
  }

  async initialize(): Promise<void> {
    if (!toolsInitialized) {
      ToolRegistry.clear();
      initializeBuiltinTools();
      toolsInitialized = true;
    } else {
      const allTools = ToolRegistry.getAllEntries();
      for (const entry of allTools) {
        if (!entry.enabled && entry.source === 'builtin') {
          ToolRegistry.enable(entry.definition.name);
        }
      }
    }

    for (const entry of ToolRegistry.getAllEntries()) {
      if (entry.source === 'mcp') {
        ToolRegistry.unregister(entry.definition.name);
      }
    }

    await this.registerMcpToolsForAgent();

    if (this.agent.tools) {
      const allTools = ToolRegistry.getAll();
      for (const tool of allTools) {
        if (tool.source !== 'mcp' && !this.agent.tools.includes(tool.name)) {
          ToolRegistry.disable(tool.name);
        }
      }
    }
  }

  async refreshTools(): Promise<void> {
    for (const entry of ToolRegistry.getAllEntries()) {
      if (entry.source === 'mcp') {
        ToolRegistry.unregister(entry.definition.name);
      }
    }

    await this.registerMcpToolsForAgent();

    if (this.agent.tools) {
      const allTools = ToolRegistry.getAll();
      for (const tool of allTools) {
        if (tool.source !== 'mcp' && !this.agent.tools.includes(tool.name)) {
          ToolRegistry.disable(tool.name);
        }
      }
    }

    console.log('[AgentRuntime] Tools refreshed, enabled tools:', ToolRegistry.getEnabledToolNames());
  }

  private async registerMcpToolsForAgent(): Promise<void> {
    const servers = McpService.getServers();
    const connectedServers = servers.filter(s => s.status === 'connected');

    if (connectedServers.length === 0) return;

    const mcpServerIds = this.agent.mcpServers;
    const serversToRegister = mcpServerIds
      ? connectedServers.filter(s => mcpServerIds.includes(s.id))
      : connectedServers;

    for (const server of serversToRegister) {
      const toolDefinitions = server.tools.map(tool =>
        adaptMcpTool(server.id, {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        }, server.name)
      );

      ToolRegistry.registerMcpTools(server.id, toolDefinitions);
      console.log(`[AgentRuntime] Registered ${toolDefinitions.length} MCP tools from server '${server.name}'`);
    }
  }

  async execute(
    userInput: string,
    conversationHistory: ConversationMessage[] = [],
    imageAttachments?: { data: string; name: string }[]
  ): Promise<string> {
    resetUrlPlaceholderCounter();
    this.aborted = false;
    const preprocessed = preprocessConversation(userInput, conversationHistory);
    
    console.log('[AgentRuntime] Preprocessed conversation:', {
      hasUrls: preprocessed.urlMap.size > 0,
      urlCount: preprocessed.urlMap.size,
    });

    const planner = new TaskPlanner({
      apiUrl: this.agent.apiUrl || 'http://localhost:1234/v1/chat/completions',
      modelName: this.agent.modelId || 'local-model',
      apiKey: this.agent.apiKey,
      temperature: 0.3,
      isGeminiModel: this.agent.onlineProvider === 'google' ||
                     this.agent.modelId?.toLowerCase().includes('gemini'),
      availableTools: ToolRegistry.getEnabledToolNames(),
    });

    this.callbacks.onStatusChange?.('thinking');
    const plan = await planner.plan(userInput, preprocessed.messages as ConversationMessage[]);
    this.currentPlan = plan;

    if (plan.steps.length > 1) {
      this.callbacks.onTaskPlanUpdate?.(plan);
    }

    const preprocessedData = {
      processedUserInput: preprocessed.processedUserInput,
      messages: preprocessed.messages as ConversationMessage[],
      urlMap: preprocessed.urlMap,
    };

    if (plan.steps.length <= 1) {
      return this.executeSingleTask(preprocessedData, imageAttachments);
    }

    return this.executePlannedTasks(plan, planner, preprocessedData, imageAttachments);
  }

  private async executeSingleTask(
    preprocessed: { processedUserInput: string; messages: ConversationMessage[]; urlMap: Map<string, string> },
    imageAttachments?: { data: string; name: string }[]
  ): Promise<string> {
    const context = this.buildExecutionContext(preprocessed, imageAttachments);
    this.engine = new ReActEngine(context);
    return this.engine.run(preprocessed.processedUserInput);
  }

  private async executePlannedTasks(
    plan: TaskPlan,
    planner: TaskPlanner,
    preprocessed: { processedUserInput: string; messages: ConversationMessage[]; urlMap: Map<string, string> },
    imageAttachments?: { data: string; name: string }[]
  ): Promise<string> {
    const results: string[] = [];
    let currentMessages = [...preprocessed.messages] as ConversationMessage[];
    const MAX_CONTEXT_MESSAGES = 12;

    for (let i = 0; i < plan.steps.length; i++) {
      if (this.aborted) {
        plan = planner.updateStepStatus(plan, plan.steps[i].id, 'failed', undefined, 'Execution aborted by user');
        this.currentPlan = plan;
        this.callbacks.onTaskPlanUpdate?.(plan);
        break;
      }

      const step = plan.steps[i];

      const deps = step.dependsOn || [];
      const depsMet = deps.every(depId => {
        const depStep = plan.steps.find(s => s.id === depId);
        return depStep && depStep.status === 'completed';
      });

      if (!depsMet) {
        plan = planner.updateStepStatus(plan, step.id, 'failed', undefined, 'Dependency not met');
        this.currentPlan = plan;
        this.callbacks.onTaskPlanUpdate?.(plan);
        continue;
      }

      plan = planner.updateStepStatus(plan, step.id, 'in_progress');
      this.currentPlan = plan;
      this.callbacks.onTaskPlanUpdate?.(plan);

      const stepContext = this.buildStepContext(step, plan, preprocessed, currentMessages, imageAttachments);
      this.engine = new ReActEngine(stepContext);

      try {
        const stepInput = this.buildStepInput(step, plan, results);
        const stepResult = await this.engine.run(stepInput);

        plan = planner.updateStepStatus(plan, step.id, 'completed', stepResult);
        this.currentPlan = plan;
        this.callbacks.onTaskPlanUpdate?.(plan);

        results.push(`## ${step.title}\n${stepResult}`);

        currentMessages.push({
          role: 'assistant',
          content: stepResult,
        });

        if (currentMessages.length > MAX_CONTEXT_MESSAGES) {
          const systemMsgs = currentMessages.filter(m => m.role === 'system');
          const nonSystemMsgs = currentMessages.filter(m => m.role !== 'system');
          const keptNonSystem = nonSystemMsgs.slice(-(MAX_CONTEXT_MESSAGES - systemMsgs.length));
          currentMessages = [...systemMsgs, ...keptNonSystem];
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        plan = planner.updateStepStatus(plan, step.id, 'failed', undefined, errorMsg);
        this.currentPlan = plan;
        this.callbacks.onTaskPlanUpdate?.(plan);

        results.push(`## ${step.title}\n❌ Failed: ${errorMsg}`);

        currentMessages.push({
          role: 'assistant',
          content: `Step "${step.title}" failed: ${errorMsg}`,
        });

        if (currentMessages.length > MAX_CONTEXT_MESSAGES) {
          const systemMsgs = currentMessages.filter(m => m.role === 'system');
          const nonSystemMsgs = currentMessages.filter(m => m.role !== 'system');
          const keptNonSystem = nonSystemMsgs.slice(-(MAX_CONTEXT_MESSAGES - systemMsgs.length));
          currentMessages = [...systemMsgs, ...keptNonSystem];
        }
      }
    }

    return this.aggregateResults(plan, results);
  }

  private buildStepInput(
    step: { id: string; title: string; description: string; toolHint?: string },
    plan: TaskPlan,
    previousResults: string[]
  ): string {
    const completedSteps = plan.steps.filter(s => s.status === 'completed');
    const contextParts: string[] = [];

    if (completedSteps.length > 0) {
      const MAX_CONTEXT_CHARS = 4000;
      contextParts.push('[INSTRUCTION: Below is context from previously completed steps. Do NOT repeat or echo this information in your response. Use it only as background knowledge.]');

      let usedChars = 0;
      for (let i = completedSteps.length - 1; i >= 0; i--) {
        const cs = completedSteps[i];
        const titleLine = `Completed: ${cs.title}`;
        let resultLine = '';

        if (cs.result) {
          if (completedSteps.length <= 3) {
            const maxResultLen = Math.min(2000, MAX_CONTEXT_CHARS - usedChars - titleLine.length);
            const truncated = cs.result.length > maxResultLen
              ? cs.result.substring(0, maxResultLen) + '\n...[truncated]'
              : cs.result;
            resultLine = truncated;
          } else {
            const maxSummaryLen = Math.min(500, MAX_CONTEXT_CHARS - usedChars - titleLine.length);
            const summary = cs.result.length > maxSummaryLen
              ? cs.result.substring(0, maxSummaryLen) + '\n...[summary truncated]'
              : cs.result;
            resultLine = summary;
          }
        }

        const entryChars = titleLine.length + (resultLine ? resultLine.length + 1 : 0);
        if (usedChars + entryChars > MAX_CONTEXT_CHARS && i < completedSteps.length - 1) {
          const omittedCount = i + 1;
          contextParts.push(`[... ${omittedCount} earlier step(s) omitted for context efficiency ...]`);
          break;
        }

        contextParts.push(titleLine);
        if (resultLine) contextParts.push(resultLine);
        usedChars += entryChars;
      }
    }

    contextParts.push('[INSTRUCTION: Your current task is below. Focus ONLY on completing this specific task. Do NOT echo the task description back. Just do the work and report results.]');
    contextParts.push(step.description);

    if (step.toolHint) {
      contextParts.push(`Suggested tool: ${step.toolHint}`);
    }

    const remainingSteps = plan.steps.filter(
      s => s.status === 'pending' || s.status === 'in_progress'
    );
    if (remainingSteps.length > 0) {
      contextParts.push('[Context: Other remaining steps in the overall plan]');
      for (const rs of remainingSteps) {
        if (rs.id !== step.id) {
          contextParts.push(`- ${rs.title}: ${rs.description}`);
        }
      }
    }

    return contextParts.join('\n');
  }

  private buildStepContext(
    step: { id: string; title: string; description: string; toolHint?: string },
    plan: TaskPlan,
    preprocessed: { processedUserInput: string; messages: ConversationMessage[]; urlMap: Map<string, string> },
    currentMessages: ConversationMessage[],
    imageAttachments?: { data: string; name: string }[]
  ): AgentExecutionContext {
    const context = this.buildExecutionContext(
      { processedUserInput: preprocessed.processedUserInput, messages: currentMessages, urlMap: preprocessed.urlMap },
      imageAttachments
    );

    context.currentTaskPlan = plan;

    return context;
  }

  private buildExecutionContext(
    preprocessed: { processedUserInput: string; messages: ConversationMessage[]; urlMap: Map<string, string> },
    imageAttachments?: { data: string; name: string }[]
  ): AgentExecutionContext {
    return {
      agent: this.agent,
      userInput: preprocessed.processedUserInput,
      originalUserInput: preprocessed.processedUserInput,
      conversationHistory: preprocessed.messages as ConversationMessage[],
      availableTools: ToolRegistry.getEnabledToolNames(),
      preprocessedUrls: preprocessed.urlMap,
      imageAttachments,
      onStatusChange: (status) => {
        agentStateManager.updateStatus(this.agent.id, status);
        this.callbacks.onStatusChange?.(status);
      },
      onToolCall: (record: ToolCallRecord) => {
        agentStateManager.addToolCallRecord(this.agent.id, record);
        this.callbacks.onToolCall?.({
          id: record.id,
          toolName: record.toolName,
          parameters: record.parameters,
          status: record.status,
          result: record.result,
        });
      },
      onReasoningStep: (step) => {
        agentStateManager.addReasoningStep(this.agent.id, step);
        this.callbacks.onReasoningStep?.(step);
      },
      onReasoningStepUpdate: (step) => {
        agentStateManager.updateReasoningStep(this.agent.id, step);
        this.callbacks.onReasoningStepUpdate?.(step);
      },
      onRequestAuth: async (toolCall: ToolCallRecord) => {
        if (this.callbacks.onRequestAuth) {
          return this.callbacks.onRequestAuth({
            id: toolCall.id,
            toolName: toolCall.toolName,
            parameters: toolCall.parameters,
            status: toolCall.status,
          });
        }
        return false;
      },
      onContentChunk: (chunk: string) => {
        this.callbacks.onContentChunk?.(chunk);
      },
      onIterationCountChange: (count: number) => {
        this.callbacks.onIterationCountChange?.(count);
      },
      onTokenUsage: (usage) => {
        this.callbacks.onTokenUsage?.(usage);
      },
      onTaskPlanUpdate: (plan) => {
        this.currentPlan = plan;
        this.callbacks.onTaskPlanUpdate?.(plan);
      },
    };
  }

  private aggregateResults(plan: TaskPlan, results: string[]): string {
    if (results.length === 0) {
      return 'No tasks were completed.';
    }

    if (results.length === 1) {
      return results[0];
    }

    const completedSteps = plan.steps.filter(s => s.status === 'completed');
    const failedSteps = plan.steps.filter(s => s.status === 'failed');

    let summary = `## 任务执行总结\n\n`;
    summary += `✅ 已完成: ${completedSteps.length}/${plan.steps.length} 个步骤\n`;
    if (failedSteps.length > 0) {
      summary += `❌ 失败: ${failedSteps.length} 个步骤\n`;
    }
    summary += '\n---\n\n';
    summary += results.join('\n\n---\n\n');

    return summary;
  }

  getCurrentPlan(): TaskPlan | null {
    return this.currentPlan;
  }

  abort(): void {
    this.aborted = true;
    this.engine?.abort();
    agentStateManager.updateStatus(this.agent.id, 'failed');
  }

  getState(): AgentExecutionState | undefined {
    return agentStateManager.getState(this.agent.id);
  }

  getStatus(): AgentStatus {
    return agentStateManager.getState(this.agent.id)?.status ?? 'idle';
  }

  reset(): void {
    this.aborted = false;
    this.engine?.abort();
    this.currentPlan = null;
    agentStateManager.resetAgent(this.agent.id);
    this.engine = null;
  }

  updateConfig(newConfig: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...newConfig };
    agentStateManager.initializeAgent(this.agent, this.config);
  }
}

let defaultRuntime: AgentRuntime | null = null;

export function initializeDefaultRuntime(
  agent: Agent,
  options?: Omit<AgentRuntimeOptions, 'agent'>
): AgentRuntime {
  defaultRuntime = new AgentRuntime({ agent, ...options });
  return defaultRuntime;
}

export function getDefaultRuntime(): AgentRuntime | null {
  return defaultRuntime;
}

export { agentStateManager };
