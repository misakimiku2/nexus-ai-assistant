export interface JSONSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  description?: string;
  enum?: (string | number)[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;
  execute: (params: Record<string, unknown>) => Promise<ToolExecutionResult>;
  requiresAuth?: boolean;
  category?: 'filesystem' | 'network' | 'system' | 'utility' | 'mcp';
  examples?: ToolExample[];
  source?: 'builtin' | 'mcp';
  mcpServerId?: string;
  mcpOriginalName?: string;
}

export interface ToolExample {
  description: string;
  parameters: Record<string, unknown>;
  result: string;
}

export interface ToolExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ChatCompletionTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: JSONSchema;
  };
}

export interface ToolRegistryEntry {
  definition: ToolDefinition;
  enabled: boolean;
  lastUsed?: number;
  useCount: number;
  source: 'builtin' | 'mcp';
  mcpServerId?: string;
  mcpOriginalName?: string;
}

export interface BuiltinToolConfig {
  searchEnabled: boolean;
  filesystemEnabled: boolean;
  shellEnabled: boolean;
  networkEnabled: boolean;
  allowedPaths?: string[];
  blockedCommands?: string[];
}

export const DEFAULT_BUILTIN_TOOL_CONFIG: BuiltinToolConfig = {
  searchEnabled: true,
  filesystemEnabled: true,
  shellEnabled: true,
  networkEnabled: true,
  allowedPaths: [],
  blockedCommands: ['rm -rf', 'format', 'del /s', 'shutdown', 'reboot'],
};

export interface ContentChunk {
  index: number;
  content: string;
  is_last: boolean;
}

export interface FetchMetadata {
  length: number;
  domain: string;
  extraction_method: 'readability' | 'scraper' | 'fallback' | 'pdf-extract';
  chunk_count: number;
  truncated: boolean;
  content_type: string;
  page_count?: number;
  cached: boolean;
}

export interface FetchResult {
  success: boolean;
  title: string;
  content: string;
  summary?: string;
  content_chunks?: ContentChunk[];
  metadata: FetchMetadata;
  error?: string;
}

export interface FetchOptions {
  max_length?: number;
  timeout?: number;
  user_agent?: string;
  chunk_size?: number;
  use_cache?: boolean;
  force_refresh?: boolean;
  render_js?: boolean;
  js_render_timeout?: number;
}
