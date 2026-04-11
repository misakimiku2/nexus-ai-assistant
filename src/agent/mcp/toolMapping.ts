const TOOL_CAPABILITY_MAP: Record<string, string[]> = {
  'read_file': ['read_file', 'read', 'read_file_multiple', 'read_multiple_files'],
  'write_file': ['write_file', 'write', 'create_file', 'edit_file'],
  'list_directory': ['list_directory', 'list', 'directory_listing', 'list_directory'],
  'execute_shell': ['run_command', 'execute_command', 'shell_exec', 'execute_shell'],
  'web_search': ['search', 'web_search', 'brave_search', 'google_search', 'brave_web_search'],
  'fetch_url': ['fetch', 'fetch_url', 'scrape', 'scrape_webpage'],
};

const MCP_TOOL_TO_BUILTIN: Record<string, string> = {};

for (const [builtin, mcpNames] of Object.entries(TOOL_CAPABILITY_MAP)) {
  for (const mcpName of mcpNames) {
    MCP_TOOL_TO_BUILTIN[mcpName.toLowerCase()] = builtin;
  }
}

export function findOverlappingBuiltinTool(mcpToolName: string): string | null {
  return MCP_TOOL_TO_BUILTIN[mcpToolName.toLowerCase()] || null;
}

export function getOverlappingMcpTools(
  mcpTools: Array<{ name: string; serverId: string }>
): Map<string, { serverId: string; toolName: string }> {
  const result = new Map<string, { serverId: string; toolName: string }>();

  for (const tool of mcpTools) {
    const builtinName = findOverlappingBuiltinTool(tool.name);
    if (builtinName) {
      if (!result.has(builtinName)) {
        result.set(builtinName, { serverId: tool.serverId, toolName: tool.name });
      }
    }
  }

  return result;
}

export function shouldPreferMcp(builtinToolName: string, overlappingMap: Map<string, unknown>): boolean {
  return overlappingMap.has(builtinToolName);
}
