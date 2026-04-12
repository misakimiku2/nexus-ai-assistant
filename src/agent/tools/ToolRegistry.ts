import {
  ToolDefinition,
  ToolRegistryEntry,
  ChatCompletionTool,
  ToolExecutionResult,
} from './types';
import { getOverlappingMcpTools } from '../mcp/toolMapping';
import { isMcpTool, parseMcpToolName } from '../mcp/McpToolAdapter';

class ToolRegistryImpl {
  private tools: Map<string, ToolRegistryEntry> = new Map();
  private enabledTools: Set<string> = new Set();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      console.warn(`Tool "${tool.name}" is already registered. Overwriting.`);
    }

    const source = tool.source || 'builtin';
    this.tools.set(tool.name, {
      definition: tool,
      enabled: true,
      useCount: 0,
      source,
      mcpServerId: tool.mcpServerId,
      mcpOriginalName: tool.mcpOriginalName,
    });
    this.enabledTools.add(tool.name);
  }

  registerMcpTools(serverId: string, tools: ToolDefinition[]): void {
    for (const tool of tools) {
      tool.source = 'mcp';
      tool.mcpServerId = serverId;
      if (!tool.mcpOriginalName && isMcpTool(tool.name)) {
        const parsed = parseMcpToolName(tool.name);
        if (parsed) {
          tool.mcpOriginalName = parsed.toolName;
        }
      }
      this.register(tool);
    }
  }

  unregisterMcpTools(serverId: string): number {
    let count = 0;
    const toRemove: string[] = [];
    for (const [name, entry] of this.tools) {
      if (entry.source === 'mcp' && entry.mcpServerId === serverId) {
        toRemove.push(name);
      }
    }
    for (const name of toRemove) {
      this.tools.delete(name);
      this.enabledTools.delete(name);
      count++;
    }
    return count;
  }

  getMcpToolsForServer(serverId: string): ToolDefinition[] {
    const result: ToolDefinition[] = [];
    for (const entry of this.tools.values()) {
      if (entry.source === 'mcp' && entry.mcpServerId === serverId && entry.enabled) {
        result.push(entry.definition);
      }
    }
    return result;
  }

  getToolsBySource(source: 'builtin' | 'mcp'): ToolDefinition[] {
    return Array.from(this.tools.values())
      .filter((entry) => entry.source === source && entry.enabled)
      .map((entry) => entry.definition);
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
    const allEnabled = this.getAll();
    const mcpTools = allEnabled.filter(t => t.source === 'mcp');
    const builtinTools = allEnabled.filter(t => t.source !== 'mcp');

    const mcpOriginalNames: Array<{ name: string; serverId: string }> = [];
    for (const tool of mcpTools) {
      if (tool.mcpOriginalName && tool.mcpServerId) {
        mcpOriginalNames.push({ name: tool.mcpOriginalName, serverId: tool.mcpServerId });
      }
    }

    const overlappingMap = getOverlappingMcpTools(mcpOriginalNames);

    const filesystemBuiltinNames = new Set(['write_file', 'read_file', 'list_directory']);
    const excludedBuiltinNames = new Set<string>();
    for (const [builtinName] of overlappingMap) {
      if (!filesystemBuiltinNames.has(builtinName)) {
        excludedBuiltinNames.add(builtinName);
      }
    }

    const filteredBuiltin = builtinTools.filter(t => !excludedBuiltinNames.has(t.name));

    const result = [...filteredBuiltin, ...mcpTools];

    return result.map((tool) => ({
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

  isMcpTool(toolName: string): boolean {
    const entry = this.tools.get(toolName);
    return entry?.source === 'mcp';
  }

  getMcpServerId(toolName: string): string | undefined {
    const entry = this.tools.get(toolName);
    return entry?.mcpServerId;
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
