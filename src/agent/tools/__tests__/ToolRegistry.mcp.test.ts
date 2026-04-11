import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from '../ToolRegistry';
import { buildMcpToolName, isMcpTool } from '../../mcp/McpToolAdapter';

describe('ToolRegistry MCP Support', () => {
  beforeEach(() => {
    ToolRegistry.clear();
  });

  it('should register and identify MCP tools', () => {
    const mcpTool = {
      name: buildMcpToolName('fs-server', 'read_file'),
      description: '[MCP: FS] Read a file',
      parameters: { type: 'object' as const, properties: {} },
      execute: async () => ({ success: true, output: 'test' }),
      source: 'mcp' as const,
      mcpServerId: 'fs-server',
      mcpOriginalName: 'read_file',
    };

    ToolRegistry.register(mcpTool);
    expect(ToolRegistry.has(mcpTool.name)).toBe(true);
    expect(ToolRegistry.isMcpTool(mcpTool.name)).toBe(true);
    expect(ToolRegistry.getMcpServerId(mcpTool.name)).toBe('fs-server');
  });

  it('should register MCP tools in batch', () => {
    const tools = [
      {
        name: buildMcpToolName('fs-server', 'read_file'),
        description: '[MCP: FS] Read',
        parameters: { type: 'object' as const, properties: {} },
        execute: async () => ({ success: true, output: '' }),
      },
      {
        name: buildMcpToolName('fs-server', 'write_file'),
        description: '[MCP: FS] Write',
        parameters: { type: 'object' as const, properties: {} },
        execute: async () => ({ success: true, output: '' }),
      },
    ];

    ToolRegistry.registerMcpTools('fs-server', tools);
    expect(ToolRegistry.has(tools[0].name)).toBe(true);
    expect(ToolRegistry.has(tools[1].name)).toBe(true);
    expect(ToolRegistry.getMcpToolsForServer('fs-server').length).toBe(2);
  });

  it('should unregister MCP tools by server ID', () => {
    const tools = [
      {
        name: buildMcpToolName('fs-server', 'read_file'),
        description: '[MCP: FS] Read',
        parameters: { type: 'object' as const, properties: {} },
        execute: async () => ({ success: true, output: '' }),
      },
    ];

    ToolRegistry.registerMcpTools('fs-server', tools);
    expect(ToolRegistry.getMcpToolsForServer('fs-server').length).toBe(1);

    const count = ToolRegistry.unregisterMcpTools('fs-server');
    expect(count).toBe(1);
    expect(ToolRegistry.getMcpToolsForServer('fs-server').length).toBe(0);
  });

  it('should get tools by source', () => {
    const builtinTool = {
      name: 'calculate',
      description: 'Calculate',
      parameters: { type: 'object' as const, properties: {} },
      execute: async () => ({ success: true, output: '' }),
      source: 'builtin' as const,
    };

    const mcpTool = {
      name: buildMcpToolName('server', 'tool'),
      description: '[MCP] Tool',
      parameters: { type: 'object' as const, properties: {} },
      execute: async () => ({ success: true, output: '' }),
      source: 'mcp' as const,
    };

    ToolRegistry.register(builtinTool);
    ToolRegistry.register(mcpTool);

    expect(ToolRegistry.getToolsBySource('builtin').length).toBe(1);
    expect(ToolRegistry.getToolsBySource('mcp').length).toBe(1);
  });

  it('should exclude overlapping builtin tools in buildOpenAITools', () => {
    const builtinReadFile = {
      name: 'read_file',
      description: 'Read a file',
      parameters: { type: 'object' as const, properties: {} },
      execute: async () => ({ success: true, output: '' }),
      source: 'builtin' as const,
    };

    const builtinCalculate = {
      name: 'calculate',
      description: 'Calculate',
      parameters: { type: 'object' as const, properties: {} },
      execute: async () => ({ success: true, output: '' }),
      source: 'builtin' as const,
    };

    const mcpReadFile = {
      name: buildMcpToolName('fs-server', 'read_file'),
      description: '[MCP: FS] Read a file',
      parameters: { type: 'object' as const, properties: {} },
      execute: async () => ({ success: true, output: '' }),
      source: 'mcp' as const,
      mcpServerId: 'fs-server',
      mcpOriginalName: 'read_file',
    };

    ToolRegistry.register(builtinReadFile);
    ToolRegistry.register(builtinCalculate);
    ToolRegistry.register(mcpReadFile);

    const openaiTools = ToolRegistry.buildOpenAITools();
    const toolNames = openaiTools.map(t => t.function.name);

    expect(toolNames).toContain('calculate');
    expect(toolNames).toContain(buildMcpToolName('fs-server', 'read_file'));
    expect(toolNames).not.toContain('read_file');
  });
});
