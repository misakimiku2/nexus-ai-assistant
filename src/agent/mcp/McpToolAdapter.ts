import { ToolDefinition, ToolExecutionResult, JSONSchema } from '../tools/types';
import { McpService, McpToolDefinition } from './McpService';

const MCP_TOOL_PREFIX = 'mcp__';

export function buildMcpToolName(serverId: string, toolName: string): string {
  const sanitizedServerId = serverId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${MCP_TOOL_PREFIX}${sanitizedServerId}__${toolName}`;
}

export function parseMcpToolName(fullName: string): { serverId: string; toolName: string } | null {
  if (!fullName.startsWith(MCP_TOOL_PREFIX)) return null;
  const rest = fullName.slice(MCP_TOOL_PREFIX.length);
  const separatorIndex = rest.indexOf('__');
  if (separatorIndex === -1) return null;
  return {
    serverId: rest.slice(0, separatorIndex),
    toolName: rest.slice(separatorIndex + 2),
  };
}

export function isMcpTool(toolName: string): boolean {
  return toolName.startsWith(MCP_TOOL_PREFIX);
}

export function adaptMcpTool(
  serverId: string,
  tool: McpToolDefinition,
  serverName: string
): ToolDefinition {
  const fullName = buildMcpToolName(serverId, tool.name);

  let description = `[MCP: ${serverName}] ${tool.description || tool.name}`;

  const restrictedTools = ['write_file', 'create_file', 'edit_file', 'read_file', 'list_directory'];
  if (restrictedTools.includes(tool.name)) {
    const builtinFallback = tool.name === 'read_file' ? 'read_file' :
                            tool.name === 'list_directory' ? 'list_directory' : 'write_file';
    description += ` Note: This tool is restricted to allowed directories configured for the MCP server. If it fails with "Access denied" or "path outside allowed directories", use the builtin ${builtinFallback} tool instead which has no directory restrictions.`;
  }

  return {
    name: fullName,
    description,
    parameters: adaptInputSchema(tool.inputSchema),
    category: 'mcp',
    execute: async (params: Record<string, unknown>): Promise<ToolExecutionResult> => {
      try {
        const result = await McpService.callTool(serverId, tool.name, params);
        if (result.isError) {
          return {
            success: false,
            output: '',
            error: result.content,
          };
        }
        return {
          success: true,
          output: result.content,
        };
      } catch (error) {
        return {
          success: false,
          output: '',
          error: `MCP tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
      }
    },
  } as ToolDefinition & { category: string; mcpServerId: string; mcpOriginalName: string };
}

function adaptInputSchema(schema?: Record<string, unknown>): JSONSchema {
  if (!schema) {
    return {
      type: 'object',
      properties: {},
    };
  }

  return {
    type: (schema.type as JSONSchema['type']) || 'object',
    properties: schema.properties as Record<string, JSONSchema> | undefined,
    required: schema.required as string[] | undefined,
    description: schema.description as string | undefined,
  };
}
