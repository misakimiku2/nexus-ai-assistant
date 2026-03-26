import { TauriMemoryClient } from './TauriMemoryClient';
import {
  MemoryType,
  RetrievedMemory,
  MemoryItem,
  TaskStatus,
  AgentConfig,
} from '../../types';

const TASK_START_PATTERNS = [
  /我要做/,
  /我正在/,
  /帮我/,
  /我需要/,
  /I want to/i,
  /I'm working on/i,
  /Help me/i,
  /I need to/i,
];

const TASK_COMPLETE_PATTERNS = [
  /完成了/,
  /做好了/,
  /解决了/,
  /finished/i,
  /done/i,
  /completed/i,
];

const DEFAULT_CONFIG: Required<AgentConfig> = {
  autoMemory: true,
  autoMemoryExtraction: true,
  extractionInterval: 3,
  autoTaskTracking: true,
  taskDetectionPatterns: [],
  autoRouting: true,
  customRoutingRules: [],
  maxMemoryInjection: 5,
  minImportanceThreshold: 0.3,
};

export class DefaultAgentLayer {
  private config: Required<AgentConfig>;
  private messageCount: number = 0;
  private lastExtractionCount: number = 0;

  constructor(config?: AgentConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async processUserInput(
    userInput: string,
    currentTasks: MemoryItem[]
  ): Promise<{
    newTasks: MemoryItem[];
    updatedTasks: Array<{ id: string; updates: Partial<MemoryItem> }>;
  }> {
    if (!this.config.autoTaskTracking) {
      return { newTasks: [], updatedTasks: [] };
    }

    const newTasks: MemoryItem[] = [];
    const updatedTasks: Array<{ id: string; updates: Partial<MemoryItem> }> = [];

    for (const pattern of TASK_START_PATTERNS) {
      if (pattern.test(userInput)) {
        const taskContent = this.extractTaskContent(userInput);
        const existingTask = currentTasks.find(
          (t) => t.content.toLowerCase().includes(taskContent.toLowerCase())
        );

        if (!existingTask) {
          const newTask = await this.createTask(taskContent);
          newTasks.push(newTask);
        }
        break;
      }
    }

    for (const task of currentTasks) {
      if (this.isRelatedToTask(userInput, task)) {
        const progress = this.extractProgress(userInput);
        const nextStep = this.inferNextStep(userInput);

        updatedTasks.push({
          id: task.id,
          updates: {
            metadata: {
              ...task.metadata,
              status: 'in_progress' as TaskStatus,
              progress: progress || task.metadata?.progress,
              next_step: nextStep || task.metadata?.next_step,
            },
          },
        });

        for (const pattern of TASK_COMPLETE_PATTERNS) {
          if (pattern.test(userInput)) {
            updatedTasks[updatedTasks.length - 1].updates.metadata = {
              ...updatedTasks[updatedTasks.length - 1].updates.metadata,
              status: 'done' as TaskStatus,
            };
            break;
          }
        }
      }
    }

    return { newTasks, updatedTasks };
  }

  private extractTaskContent(userInput: string): string {
    const patterns = [
      /(?:我要做|我正在|帮我|我需要|I want to|I'm working on|Help me|I need to)\s*(.+?)(?:[。.!?]|$)/i,
    ];

    for (const pattern of patterns) {
      const match = userInput.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return userInput.slice(0, 50);
  }

  private isRelatedToTask(userInput: string, task: MemoryItem): boolean {
    const taskKeywords = task.content.toLowerCase().split(/\s+/);
    const inputLower = userInput.toLowerCase();
    return taskKeywords.some((keyword) => keyword.length > 2 && inputLower.includes(keyword));
  }

  private extractProgress(userInput: string): string {
    const progressMatch = userInput.match(/(?:进度|进展|progress)[:：]?\s*(.+?)(?:[。.]|$)/i);
    return progressMatch ? progressMatch[1].trim() : '';
  }

  private inferNextStep(userInput: string): string {
    const nextStepMatch = userInput.match(/(?:下一步|next)[:：]?\s*(.+?)(?:[。.]|$)/i);
    return nextStepMatch ? nextStepMatch[1].trim() : '';
  }

  private async createTask(content: string): Promise<MemoryItem> {
    const now = Date.now();
    return {
      id: crypto.randomUUID(),
      content,
      memoryType: 'task',
      importance: 0.7,
      score: 0.7,
      decay: 0.02,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: now,
      accessCount: 0,
      version: 1,
      parentIds: [],
      metadata: {
        status: 'in_progress',
        progress: '',
        next_step: '',
      },
    };
  }

  defaultMemoryRouting(query: string): MemoryType[] {
    if (!this.config.autoRouting) {
      return ['task', 'constraint'];
    }

    const queryLower = query.toLowerCase();

    const taskKeywords = ['任务', '进度', '下一步', '完成', 'task', 'progress', 'todo', 'doing'];
    const preferenceKeywords = ['偏好', '喜欢', '习惯', 'prefer', 'like', 'habit', 'want'];
    const problemKeywords = ['问题', '解决', '如何', '怎么', 'problem', 'solve', 'how', 'help'];

    if (taskKeywords.some((k) => queryLower.includes(k))) {
      return ['task'];
    }

    if (preferenceKeywords.some((k) => queryLower.includes(k))) {
      return ['preference'];
    }

    if (problemKeywords.some((k) => queryLower.includes(k))) {
      return ['constraint', 'skill'];
    }

    return ['task', 'constraint'];
  }

  async retrieveMemories(query: string, modelType?: 'local' | 'online'): Promise<RetrievedMemory[]> {
    if (!this.config.autoMemory) {
      console.log('[DefaultAgentLayer] 自动记忆已禁用，跳过检索');
      return [];
    }

    const memoryTypes = this.defaultMemoryRouting(query);
    console.log('[DefaultAgentLayer] 开始检索记忆, 路由类型:', memoryTypes, '模型类型:', modelType);
    
    const memories = await TauriMemoryClient.retrieveMemories(query, {
      topK: this.config.maxMemoryInjection,
      memoryTypes,
      minImportance: this.config.minImportanceThreshold,
      modelType,
    });

    console.log('[DefaultAgentLayer] 检索到', memories.length, '条相关记忆');
    return memories;
  }

  formatMemoriesForAutoInjection(memories: RetrievedMemory[]): string {
    const sections: string[] = [];

    const tasks = memories.filter((m) => m.item.memoryType === 'task');
    if (tasks.length > 0) {
      sections.push('## Relevant Task State');
      for (const t of tasks) {
        const meta = t.item.metadata;
        sections.push(`- ${t.item.content} [${meta?.status || 'unknown'}]`);
        if (meta?.progress) sections.push(`  进展: ${meta.progress}`);
        if (meta?.next_step) sections.push(`  下一步: ${meta.next_step}`);
      }
    }

    const constraints = memories.filter((m) => m.item.memoryType === 'constraint');
    if (constraints.length > 0) {
      sections.push('## Constraints');
      for (const c of constraints) {
        sections.push(`- ${c.item.content}`);
      }
    }

    const preferences = memories.filter((m) => m.item.memoryType === 'preference');
    if (preferences.length > 0) {
      sections.push('## Preferences');
      for (const p of preferences) {
        sections.push(`- ${p.item.content}`);
      }
    }

    return sections.join('\n');
  }

  formatMemoriesForPrompt(memories: RetrievedMemory[]): string {
    if (memories.length === 0) return '';

    const lines: string[] = [
      '## 【Relevant Memories】',
      '',
      '以下是与你当前对话相关的记忆信息，请参考这些信息来更好地理解用户：',
      '',
    ];

    const identity = memories.filter((m) => m.item.memoryType === 'identity');
    const facts = memories.filter((m) => m.item.memoryType === 'fact');
    const preferences = memories.filter((m) => m.item.memoryType === 'preference');
    const tasks = memories.filter((m) => m.item.memoryType === 'task');
    const constraints = memories.filter((m) => m.item.memoryType === 'constraint');
    const skills = memories.filter((m) => m.item.memoryType === 'skill');

    if (identity.length > 0) {
      lines.push('### 身份特征');
      identity.forEach((i) => lines.push(`- ${i.item.content}`));
      lines.push('');
    }

    if (facts.length > 0) {
      lines.push('### 已知事实');
      facts.forEach((f) => lines.push(`- ${f.item.content}`));
      lines.push('');
    }

    if (preferences.length > 0) {
      lines.push('### 用户偏好');
      preferences.forEach((p) => lines.push(`- ${p.item.content}`));
      lines.push('');
    }

    if (tasks.length > 0) {
      lines.push('### 进行中的任务');
      tasks.forEach((t) => {
        const meta = t.item.metadata;
        if (meta) {
          lines.push(`- ${t.item.content} [${meta.status}]`);
          if (meta.progress) lines.push(`  进展: ${meta.progress}`);
          if (meta.next_step) lines.push(`  下一步: ${meta.next_step}`);
        } else {
          lines.push(`- ${t.item.content}`);
        }
      });
      lines.push('');
    }

    if (constraints.length > 0) {
      lines.push('### 限制条件');
      constraints.forEach((c) => lines.push(`- ${c.item.content}`));
      lines.push('');
    }

    if (skills.length > 0) {
      lines.push('### 用户能力');
      skills.forEach((s) => lines.push(`- ${s.item.content}`));
      lines.push('');
    }

    return lines.join('\n');
  }

  shouldTriggerExtraction(): boolean {
    if (!this.config.autoMemoryExtraction) {
      return false;
    }

    this.messageCount++;
    return this.messageCount >= this.lastExtractionCount + this.config.extractionInterval;
  }

  markExtractionComplete(): void {
    this.lastExtractionCount = this.messageCount;
  }

  getConstraintAwarenessPrompt(constraints: RetrievedMemory[]): string {
    if (constraints.length === 0) return '';

    const constraintText = constraints.map((c) => `- ${c.item.content}`).join('\n');

    return `
## Constraint Awareness

请在回答时自动考虑用户的限制条件（constraints），并调整输出复杂度和方案。

例如：
- 如果用户计算资源有限，优先推荐轻量级方案
- 如果用户时间有限，优先提供快速解决方案
- 如果用户技术能力有限，避免过于复杂的实现

当前用户约束：
${constraintText}
`;
  }
}

export const defaultAgentLayer = new DefaultAgentLayer();
