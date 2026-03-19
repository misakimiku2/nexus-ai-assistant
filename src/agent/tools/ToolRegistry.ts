import {
  ToolDefinition,
  ToolRegistryEntry,
  ChatCompletionTool,
  ToolExecutionResult,
} from './types';

class ToolRegistryImpl {
  private tools: Map<string, ToolRegistryEntry> = new Map();
  private enabledTools: Set<string> = new Set();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      console.warn(`Tool "${tool.name}" is already registered. Overwriting.`);
    }

    this.tools.set(tool.name, {
      definition: tool,
      enabled: true,
      useCount: 0,
    });
    this.enabledTools.add(tool.name);
  }

  unregister(toolName: string): boolean {
    if (!this.tools.has(toolName)) {
      return false;
    }
    this.tools.delete(toolName);
    this.enabledTools.delete(toolName);
    return true;
  }

  enable(toolName: string): boolean {
    const entry = this.tools.get(toolName);
    if (!entry) return false;
    entry.enabled = true;
    this.enabledTools.add(toolName);
    return true;
  }

  disable(toolName: string): boolean {
    const entry = this.tools.get(toolName);
    if (!entry) return false;
    entry.enabled = false;
    this.enabledTools.delete(toolName);
    return true;
  }

  get(toolName: string): ToolDefinition | undefined {
    const entry = this.tools.get(toolName);
    return entry?.enabled ? entry.definition : undefined;
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values())
      .filter((entry) => entry.enabled)
      .map((entry) => entry.definition);
  }

  getAllEntries(): ToolRegistryEntry[] {
    return Array.from(this.tools.values());
  }

  getEnabledToolNames(): string[] {
    return Array.from(this.enabledTools);
  }

  async execute(
    toolName: string,
    params: Record<string, unknown>
  ): Promise<ToolExecutionResult> {
    const entry = this.tools.get(toolName);

    if (!entry) {
      return {
        success: false,
        output: '',
        error: `Tool "${toolName}" not found`,
      };
    }

    if (!entry.enabled) {
      return {
        success: false,
        output: '',
        error: `Tool "${toolName}" is disabled`,
      };
    }

    try {
      const result = await entry.definition.execute(params);
      entry.useCount++;
      entry.lastUsed = Date.now();
      return result;
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  buildOpenAITools(): ChatCompletionTool[] {
    return this.getAll().map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  has(toolName: string): boolean {
    return this.tools.has(toolName);
  }

  isEnabled(toolName: string): boolean {
    return this.enabledTools.has(toolName);
  }

  requiresAuth(toolName: string): boolean {
    const entry = this.tools.get(toolName);
    return entry?.definition.requiresAuth ?? false;
  }

  clear(): void {
    this.tools.clear();
    this.enabledTools.clear();
  }
}

export const ToolRegistry = new ToolRegistryImpl();

export function createTool(
  config: ToolDefinition
): ToolDefinition {
  return config;
}
