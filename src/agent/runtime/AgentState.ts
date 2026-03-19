import { Agent } from '../../types';
import {
  AgentExecutionState,
  AgentStatus,
  Task,
  ToolCallRecord,
  ReasoningStep,
  AgentConfig,
  DEFAULT_AGENT_CONFIG,
} from '../types';

export class AgentStateManager {
  private states: Map<string, AgentExecutionState> = new Map();
  private configs: Map<string, AgentConfig> = new Map();

  initializeAgent(agent: Agent, config?: Partial<AgentConfig>): void {
    const state: AgentExecutionState = {
      agentId: agent.id,
      status: 'idle',
      taskQueue: [],
      completedTasks: [],
      reasoningSteps: [],
      toolCallHistory: [],
      iterationCount: 0,
      maxIterations: config?.maxIterations ?? DEFAULT_AGENT_CONFIG.maxIterations,
      startTime: 0,
      lastUpdateTime: Date.now(),
    };

    this.states.set(agent.id, state);
    this.configs.set(agent.id, { ...DEFAULT_AGENT_CONFIG, ...config });
  }

  getState(agentId: string): AgentExecutionState | undefined {
    return this.states.get(agentId);
  }

  getConfig(agentId: string): AgentConfig | undefined {
    return this.configs.get(agentId);
  }

  updateStatus(agentId: string, status: AgentStatus): void {
    const state = this.states.get(agentId);
    if (state) {
      state.status = status;
      state.lastUpdateTime = Date.now();
    }
  }

  addTask(agentId: string, task: Task): void {
    const state = this.states.get(agentId);
    if (state) {
      state.taskQueue.push(task);
    }
  }

  updateTask(agentId: string, taskId: string, updates: Partial<Task>): void {
    const state = this.states.get(agentId);
    if (!state) return;

    const taskIndex = state.taskQueue.findIndex((t) => t.id === taskId);
    if (taskIndex !== -1) {
      state.taskQueue[taskIndex] = { ...state.taskQueue[taskIndex], ...updates };
    }
  }

  completeTask(agentId: string, taskId: string, result?: string): void {
    const state = this.states.get(agentId);
    if (!state) return;

    const taskIndex = state.taskQueue.findIndex((t) => t.id === taskId);
    if (taskIndex !== -1) {
      const task = state.taskQueue.splice(taskIndex, 1)[0];
      task.status = 'completed';
      task.result = result;
      task.completedAt = Date.now();
      state.completedTasks.push(task);
    }
  }

  failTask(agentId: string, taskId: string, error: string): void {
    const state = this.states.get(agentId);
    if (!state) return;

    const taskIndex = state.taskQueue.findIndex((t) => t.id === taskId);
    if (taskIndex !== -1) {
      const task = state.taskQueue.splice(taskIndex, 1)[0];
      task.status = 'failed';
      task.error = error;
      task.completedAt = Date.now();
      state.completedTasks.push(task);
    }
  }

  addToolCallRecord(agentId: string, record: ToolCallRecord): void {
    const state = this.states.get(agentId);
    if (state) {
      state.toolCallHistory.push(record);
    }
  }

  addReasoningStep(agentId: string, step: ReasoningStep): void {
    const state = this.states.get(agentId);
    if (state) {
      state.reasoningSteps.push(step);
    }
  }

  incrementIteration(agentId: string): number {
    const state = this.states.get(agentId);
    if (state) {
      state.iterationCount++;
      state.lastUpdateTime = Date.now();
      return state.iterationCount;
    }
    return 0;
  }

  resetAgent(agentId: string): void {
    const state = this.states.get(agentId);
    if (state) {
      state.status = 'idle';
      state.taskQueue = [];
      state.completedTasks = [];
      state.reasoningSteps = [];
      state.toolCallHistory = [];
      state.iterationCount = 0;
      state.startTime = 0;
      state.lastUpdateTime = Date.now();
    }
  }

  removeAgent(agentId: string): void {
    this.states.delete(agentId);
    this.configs.delete(agentId);
  }

  getActiveAgents(): string[] {
    return Array.from(this.states.entries())
      .filter(([_, state]) => state.status !== 'idle')
      .map(([id]) => id);
  }

  getAgentStats(agentId: string): {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    totalToolCalls: number;
    successfulToolCalls: number;
    averageIterations: number;
  } | undefined {
    const state = this.states.get(agentId);
    if (!state) return undefined;

    const completed = state.completedTasks.filter((t) => t.status === 'completed').length;
    const failed = state.completedTasks.filter((t) => t.status === 'failed').length;
    const successfulTools = state.toolCallHistory.filter(
      (tc) => tc.status === 'success'
    ).length;

    return {
      totalTasks: state.taskQueue.length + state.completedTasks.length,
      completedTasks: completed,
      failedTasks: failed,
      totalToolCalls: state.toolCallHistory.length,
      successfulToolCalls: successfulTools,
      averageIterations: state.iterationCount,
    };
  }
}

export const agentStateManager = new AgentStateManager();
