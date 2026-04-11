import { invoke } from '@tauri-apps/api/core';
import { McpServer, McpServerConfig, McpCallToolResult } from '../../types';

interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface McpToolWithServer {
  server_id: string;
  tool: McpToolDefinition;
}

interface McpServerInfo {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  tools: McpToolDefinition[];
  error?: string;
  enabled: boolean;
  toolTimeoutSecs: number;
  connectTimeoutSecs: number;
}

class McpServiceImpl {
  private servers: Map<string, McpServerInfo> = new Map();
  private listeners: Set<() => void> = new Set();

  onStateChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(l => l());
  }

  async addServer(config: McpServerConfig): Promise<McpServer> {
    const info = await invoke<McpServerInfo>('mcp_add_server', { config });
    this.servers.set(info.id, info);
    this.notifyListeners();
    return this.infoToServer(info);
  }

  async checkDuplicate(config: McpServerConfig): Promise<string | null> {
    const result = await invoke<string | null>('mcp_check_duplicate', { config });
    return result;
  }

  async removeServer(id: string): Promise<void> {
    await invoke('mcp_remove_server', { id });
    this.servers.delete(id);
    this.notifyListeners();
  }

  async connectServer(id: string): Promise<McpServer> {
    const info = await invoke<McpServerInfo>('mcp_connect_server', { id });
    this.servers.set(info.id, info);
    this.notifyListeners();
    return this.infoToServer(info);
  }

  async disconnectServer(id: string): Promise<McpServer> {
    const info = await invoke<McpServerInfo>('mcp_disconnect_server', { id });
    this.servers.set(info.id, info);
    this.notifyListeners();
    return this.infoToServer(info);
  }

  async refreshServers(): Promise<McpServer[]> {
    const infos = await invoke<McpServerInfo[]>('mcp_list_servers');
    this.servers.clear();
    for (const info of infos) {
      this.servers.set(info.id, info);
    }
    this.notifyListeners();
    return infos.map(i => this.infoToServer(i));
  }

  async listTools(serverId?: string): Promise<McpToolWithServer[]> {
    return invoke<McpToolWithServer[]>('mcp_list_tools', { serverId: serverId || null });
  }

  async callTool(serverId: string, toolName: string, arguments_?: Record<string, unknown>): Promise<McpCallToolResult> {
    return invoke<McpCallToolResult>('mcp_call_tool', {
      serverId,
      toolName,
      arguments: arguments_ || null,
    });
  }

  async getServerConfigs(): Promise<McpServerConfig[]> {
    return invoke<McpServerConfig[]>('mcp_get_server_configs');
  }

  async saveConfigs(): Promise<void> {
    await invoke('mcp_save_configs');
  }

  async loadConfigs(): Promise<McpServer[]> {
    const infos = await invoke<McpServerInfo[]>('mcp_load_configs');
    for (const info of infos) {
      this.servers.set(info.id, info);
    }
    this.notifyListeners();
    return infos.map(i => this.infoToServer(i));
  }

  async getServerStderr(id: string): Promise<string> {
    return invoke<string>('mcp_get_server_stderr', { id });
  }

  async clearServerStderr(id: string): Promise<void> {
    await invoke('mcp_clear_server_stderr', { id });
  }

  async checkHealth(): Promise<Array<{ id: string; status: string }>> {
    return invoke<Array<{ id: string; status: string }>>('mcp_check_health');
  }

  async getResourceUsage(): Promise<Record<string, { pid: number; memoryKb: number; cpuPercent: number }>> {
    return invoke<Record<string, { pid: number; memoryKb: number; cpuPercent: number }>>('mcp_get_resource_usage');
  }

  getServers(): McpServer[] {
    return Array.from(this.servers.values()).map(i => this.infoToServer(i));
  }

  getServer(id: string): McpServer | undefined {
    const info = this.servers.get(id);
    return info ? this.infoToServer(info) : undefined;
  }

  getConnectedServers(): McpServer[] {
    return this.getServers().filter(s => s.status === 'connected');
  }

  private infoToServer(info: McpServerInfo): McpServer {
    return {
      id: info.id,
      name: info.name,
      command: info.command,
      args: info.args,
      env: info.env,
      status: info.status,
      tools: info.tools.map(t => ({
        name: t.name,
        description: t.description || '',
        requiresAuth: false,
        inputSchema: t.inputSchema,
      })),
      error: info.error,
      enabled: info.enabled,
      toolTimeoutSecs: info.toolTimeoutSecs,
      connectTimeoutSecs: info.connectTimeoutSecs,
    };
  }
}

export const McpService = new McpServiceImpl();
export type { McpToolDefinition, McpToolWithServer, McpServerInfo };
