import { describe, it, expect } from 'vitest';
import {
  buildMcpToolName,
  parseMcpToolName,
  isMcpTool,
  adaptMcpTool,
} from '../McpToolAdapter';
import {
  findOverlappingBuiltinTool,
  getOverlappingMcpTools,
  shouldPreferMcp,
} from '../toolMapping';

describe('McpToolAdapter', () => {
  describe('buildMcpToolName', () => {
    it('should build MCP tool name with server ID and tool name', () => {
      expect(buildMcpToolName('fs-server', 'read_file')).toBe('mcp__fs-server__read_file');
    });

    it('should sanitize server ID with special characters', () => {
      expect(buildMcpToolName('my-server.v2', 'search')).toBe('mcp__my-server_v2__search');
    });

    it('should handle simple names', () => {
      expect(buildMcpToolName('abc', 'def')).toBe('mcp__abc__def');
    });
  });

  describe('parseMcpToolName', () => {
    it('should parse valid MCP tool name', () => {
      const result = parseMcpToolName('mcp__fs-server__read_file');
      expect(result).toEqual({ serverId: 'fs-server', toolName: 'read_file' });
    });

    it('should return null for non-MCP tool name', () => {
      expect(parseMcpToolName('read_file')).toBeNull();
      expect(parseMcpToolName('web_search')).toBeNull();
    });

    it('should return null for MCP prefix without separator', () => {
      expect(parseMcpToolName('mcp__noseparator')).toBeNull();
    });

    it('should handle tool name with underscores', () => {
      const result = parseMcpToolName('mcp__server__read_file_multiple');
      expect(result).toEqual({ serverId: 'server', toolName: 'read_file_multiple' });
    });
  });

  describe('isMcpTool', () => {
    it('should return true for MCP tools', () => {
      expect(isMcpTool('mcp__server__tool')).toBe(true);
    });

    it('should return false for builtin tools', () => {
      expect(isMcpTool('read_file')).toBe(false);
      expect(isMcpTool('web_search')).toBe(false);
    });
  });

  describe('adaptMcpTool', () => {
    it('should adapt MCP tool definition to ToolDefinition format', () => {
      const tool = adaptMcpTool('fs-server', {
        name: 'read_file',
        description: 'Read a file from disk',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path' },
          },
          required: ['path'],
        },
      }, 'Filesystem Server');

      expect(tool.name).toBe('mcp__fs-server__read_file');
      expect(tool.description).toContain('[MCP: Filesystem Server]');
      expect(tool.description).toContain('Read a file from disk');
      expect(tool.parameters.type).toBe('object');
      expect(tool.parameters.properties).toBeDefined();
      expect(tool.parameters.required).toEqual(['path']);
    });

    it('should handle tool without inputSchema', () => {
      const tool = adaptMcpTool('server', {
        name: 'ping',
        description: 'Ping the server',
      }, 'Test Server');

      expect(tool.name).toBe('mcp__server__ping');
      expect(tool.parameters.type).toBe('object');
      expect(tool.parameters.properties).toEqual({});
    });

    it('should handle tool without description', () => {
      const tool = adaptMcpTool('server', {
        name: 'noop',
      }, 'Test Server');

      expect(tool.description).toContain('noop');
    });
  });
});

describe('toolMapping', () => {
  describe('findOverlappingBuiltinTool', () => {
    it('should find overlapping builtin tool for read_file', () => {
      expect(findOverlappingBuiltinTool('read_file')).toBe('read_file');
    });

    it('should find overlapping builtin tool for write_file', () => {
      expect(findOverlappingBuiltinTool('write_file')).toBe('write_file');
    });

    it('should find overlapping for MCP filesystem read variant', () => {
      expect(findOverlappingBuiltinTool('read')).toBe('read_file');
      expect(findOverlappingBuiltinTool('read_multiple_files')).toBe('read_file');
    });

    it('should find overlapping for search tools', () => {
      expect(findOverlappingBuiltinTool('brave_search')).toBe('web_search');
      expect(findOverlappingBuiltinTool('brave_web_search')).toBe('web_search');
    });

    it('should return null for non-overlapping tools', () => {
      expect(findOverlappingBuiltinTool('create_issue')).toBeNull();
      expect(findOverlappingBuiltinTool('send_email')).toBeNull();
    });

    it('should be case insensitive', () => {
      expect(findOverlappingBuiltinTool('Read_File')).toBe('read_file');
      expect(findOverlappingBuiltinTool('WEB_SEARCH')).toBe('web_search');
    });
  });

  describe('getOverlappingMcpTools', () => {
    it('should find overlapping tools', () => {
      const mcpTools = [
        { name: 'read_file', serverId: 'fs-server' },
        { name: 'write_file', serverId: 'fs-server' },
        { name: 'create_issue', serverId: 'github-server' },
      ];

      const result = getOverlappingMcpTools(mcpTools);
      expect(result.size).toBe(2);
      expect(result.get('read_file')).toEqual({ serverId: 'fs-server', toolName: 'read_file' });
      expect(result.get('write_file')).toEqual({ serverId: 'fs-server', toolName: 'write_file' });
    });

    it('should return empty map when no overlaps', () => {
      const mcpTools = [
        { name: 'create_issue', serverId: 'github-server' },
        { name: 'send_email', serverId: 'email-server' },
      ];

      const result = getOverlappingMcpTools(mcpTools);
      expect(result.size).toBe(0);
    });

    it('should pick first MCP tool for duplicate builtin mapping', () => {
      const mcpTools = [
        { name: 'read_file', serverId: 'fs-server-1' },
        { name: 'read_file', serverId: 'fs-server-2' },
      ];

      const result = getOverlappingMcpTools(mcpTools);
      expect(result.size).toBe(1);
      expect(result.get('read_file')?.serverId).toBe('fs-server-1');
    });
  });

  describe('shouldPreferMcp', () => {
    it('should return true when builtin tool has MCP alternative', () => {
      const overlappingMap = getOverlappingMcpTools([
        { name: 'read_file', serverId: 'fs-server' },
      ]);
      expect(shouldPreferMcp('read_file', overlappingMap)).toBe(true);
    });

    it('should return false when no MCP alternative', () => {
      const overlappingMap = getOverlappingMcpTools([
        { name: 'create_issue', serverId: 'github-server' },
      ]);
      expect(shouldPreferMcp('read_file', overlappingMap)).toBe(false);
    });
  });
});
