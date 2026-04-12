import {
  TaskPlan,
  TaskPlanStep,
  ConversationMessage,
} from '../types';
import { callLLMWithTools, FunctionCallingConfig } from '../llm/functionCalling';

const PLANNING_SYSTEM_PROMPT = `You are a task planning assistant. Your job is to break down complex user requests into a structured, step-by-step execution plan.

## Rules
1. Each step should be a single, focused, actionable task
2. Steps should be ordered in logical execution sequence
3. Each step should have a clear, concise title and a detailed description
4. If a step depends on the result of a previous step, indicate it in dependsOn
5. For simple requests that don't need decomposition, create a single step
6. Be specific about what each step should accomplish
7. Consider tool availability when planning steps

## Available Tools
{{AVAILABLE_TOOLS}}

## Output Format
You MUST respond with ONLY a valid JSON object, no markdown, no explanation, no code fences. The format must be:
{
  "needsPlanning": boolean,
  "reasoning": "brief explanation of why this does or doesn't need planning",
  "steps": [
    {
      "id": "step_1",
      "title": "Short title for this step",
      "description": "Detailed description of what to do in this step",
      "toolHint": "suggested tool name or empty string",
      "dependsOn": []
    }
  ]
}

## Examples

Simple request -> single step:
{
  "needsPlanning": false,
  "reasoning": "This is a straightforward question that can be answered directly",
  "steps": [
    {
      "id": "step_1",
      "title": "Answer the question",
      "description": "Provide a direct answer to the user's question",
      "toolHint": "",
      "dependsOn": []
    }
  ]
}

Complex request -> multiple steps:
{
  "needsPlanning": true,
  "reasoning": "This requires multiple distinct operations that should be executed sequentially",
  "steps": [
    {
      "id": "step_1",
      "title": "Analyze project structure",
      "description": "Read and analyze the project directory structure and key configuration files",
      "toolHint": "list_directory",
      "dependsOn": []
    },
    {
      "id": "step_2",
      "title": "Identify issues",
      "description": "Based on the analysis, identify specific issues that need to be fixed",
      "toolHint": "read_file",
      "dependsOn": ["step_1"]
    },
    {
      "id": "step_3",
      "title": "Apply fixes",
      "description": "Implement the identified fixes and modifications",
      "toolHint": "write_file",
      "dependsOn": ["step_2"]
    }
  ]
}`;

export interface TaskPlannerConfig {
  apiUrl: string;
  modelName: string;
  apiKey?: string;
  temperature?: number;
  isGeminiModel?: boolean;
  availableTools: string[];
}

export class TaskPlanner {
  private config: TaskPlannerConfig;

  constructor(config: TaskPlannerConfig) {
    this.config = config;
  }

  async plan(
    userInput: string,
    conversationHistory: ConversationMessage[] = []
  ): Promise<TaskPlan> {
    const planId = `plan_${Date.now()}`;
    const toolsList = this.config.availableTools.join(', ');
    const systemPrompt = PLANNING_SYSTEM_PROMPT.replace(
      '{{AVAILABLE_TOOLS}}',
      toolsList
    );

    const messages: ConversationMessage[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-6),
      {
        role: 'user',
        content: `Please create an execution plan for the following request:\n\n${userInput}`,
      },
    ];

    const llmConfig: FunctionCallingConfig = {
      apiUrl: this.config.apiUrl,
      modelName: this.config.modelName,
      apiKey: this.config.apiKey,
      temperature: this.config.temperature ?? 0.3,
      isGeminiModel: this.config.isGeminiModel,
    };

    try {
      const response = await callLLMWithTools(llmConfig, messages);

      if (response.finishReason === 'error') {
        return this.createFallbackPlan(planId, userInput, response.error || 'Planning failed');
      }

      const content = response.content || '';
      const planData = this.parsePlanResponse(content);

      const steps: TaskPlanStep[] = planData.steps.map((step, index) => ({
        id: step.id || `step_${index + 1}`,
        title: step.title,
        description: step.description,
        status: 'pending' as const,
        toolHint: step.toolHint || undefined,
        dependsOn: step.dependsOn || [],
      }));

      return {
        id: planId,
        goal: userInput,
        steps,
        status: steps.length > 1 ? 'planning' : 'executing',
        currentStepIndex: 0,
        createdAt: Date.now(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createFallbackPlan(planId, userInput, errorMessage);
    }
  }

  private parsePlanResponse(content: string): {
    needsPlanning: boolean;
    reasoning: string;
    steps: Array<{
      id: string;
      title: string;
      description: string;
      toolHint?: string;
      dependsOn?: string[];
    }>;
  } {
    let jsonStr = content.trim();

    const jsonBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonBlockMatch) {
      jsonStr = jsonBlockMatch[1].trim();
    }

    const jsonStart = jsonStr.indexOf('{');
    const jsonEnd = jsonStr.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1);
    }

    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed.steps && Array.isArray(parsed.steps)) {
        return {
          needsPlanning: parsed.needsPlanning ?? parsed.steps.length > 1,
          reasoning: parsed.reasoning || '',
          steps: parsed.steps.map(
            (step: Record<string, unknown>, index: number) => ({
              id: (step.id as string) || `step_${index + 1}`,
              title: (step.title as string) || `Step ${index + 1}`,
              description: (step.description as string) || '',
              toolHint: (step.toolHint as string) || undefined,
              dependsOn: Array.isArray(step.dependsOn)
                ? (step.dependsOn as string[])
                : [],
            })
          ),
        };
      }
    } catch {
      // JSON parse failed
    }

    return {
      needsPlanning: false,
      reasoning: 'Failed to parse planning response, using fallback',
      steps: [
        {
          id: 'step_1',
          title: 'Execute task',
          description: content.substring(0, 200),
        },
      ],
    };
  }

  private createFallbackPlan(
    planId: string,
    userInput: string,
    error: string
  ): TaskPlan {
    return {
      id: planId,
      goal: userInput,
      steps: [
        {
          id: 'step_1',
          title: 'Execute task',
          description: userInput,
          status: 'pending',
        },
      ],
      status: 'executing',
      currentStepIndex: 0,
      createdAt: Date.now(),
    };
  }

  updateStepStatus(
    plan: TaskPlan,
    stepId: string,
    status: TaskPlanStep['status'],
    result?: string,
    error?: string
  ): TaskPlan {
    const steps = plan.steps.map((step) => {
      if (step.id === stepId) {
        return {
          ...step,
          status,
          result: result ?? step.result,
          error: error ?? step.error,
        };
      }
      return step;
    });

    const currentStepIndex = steps.findIndex((s) => s.id === stepId);
    const allCompleted = steps.every(
      (s) => s.status === 'completed' || s.status === 'failed'
    );
    const anyFailed = steps.some((s) => s.status === 'failed');

    let planStatus: TaskPlan['status'] = plan.status;
    if (allCompleted) {
      planStatus = anyFailed ? 'failed' : 'completed';
    } else if (status === 'in_progress') {
      planStatus = 'executing';
    }

    return {
      ...plan,
      steps,
      status: planStatus,
      currentStepIndex:
        currentStepIndex !== -1 ? currentStepIndex : plan.currentStepIndex,
      completedAt: allCompleted ? Date.now() : undefined,
    };
  }

  getNextStep(plan: TaskPlan): TaskPlanStep | null {
    const completedIds = new Set(
      plan.steps
        .filter((s) => s.status === 'completed')
        .map((s) => s.id)
    );

    for (const step of plan.steps) {
      if (step.status !== 'pending') continue;

      const depsMet = (step.dependsOn || []).every((depId) =>
        completedIds.has(depId)
      );
      if (depsMet) {
        return step;
      }
    }

    return null;
  }

  getStepProgress(plan: TaskPlan): number {
    if (plan.steps.length === 0) return 0;
    const completed = plan.steps.filter(
      (s) => s.status === 'completed'
    ).length;
    const inProgress = plan.steps.filter(
      (s) => s.status === 'in_progress'
    ).length;
    return Math.round(
      ((completed + inProgress * 0.5) / plan.steps.length) * 100
    );
  }
}
