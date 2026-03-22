import { invoke } from '@tauri-apps/api/core';
import {
  MemoryItem,
  MemoryType,
  RetrievalOptions,
  RetrievedMemory,
  TaskStatus,
  MemoryStats,
  DecayResult,
  PruneResult,
  EvolutionStats,
} from '../../types';

export class TauriMemoryClient {
  static async retrieveMemories(query: string, options: RetrievalOptions): Promise<RetrievedMemory[]> {
    console.log('[TauriMemoryClient] 开始检索记忆, query:', query.substring(0, 50), 'options:', options);
    try {
      const result = await invoke<RetrievedMemory[]>('retrieve_memories', { query, options });
      console.log('[TauriMemoryClient] 检索完成, 返回', result.length, '条记忆');
      return result;
    } catch (error) {
      console.error('[TauriMemoryClient] 检索失败:', error);
      throw error;
    }
  }

  static async addMemory(item: Omit<MemoryItem, 'id' | 'createdAt' | 'lastAccessedAt' | 'accessCount' | 'score' | 'decay' | 'isActive' | 'markedInactiveAt'>): Promise<void> {
    const now = Date.now();
    const defaultDecay = this.getDefaultDecay(item.memoryType);
    const fullItem: MemoryItem = {
      id: crypto.randomUUID(),
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0,
      score: item.importance,
      decay: defaultDecay,
      isActive: true,
      markedInactiveAt: undefined,
      ...item,
    };
    console.log('[TauriMemoryClient] 添加记忆:', fullItem.memoryType, fullItem.content.substring(0, 50));
    return invoke('add_memory', { item: fullItem });
  }

  private static getDefaultDecay(memoryType: MemoryType): number {
    switch (memoryType) {
      case 'identity': return 0.001;
      case 'skill': return 0.002;
      case 'constraint': return 0.003;
      case 'preference': return 0.005;
      case 'fact': return 0.01;
      case 'task': return 0.02;
      default: return 0.01;
    }
  }

  static async getAllMemories(): Promise<MemoryItem[]> {
    console.log('[TauriMemoryClient] 获取所有记忆');
    return invoke('get_all_memories');
  }

  static async getMemoriesByType(memoryType: MemoryType): Promise<MemoryItem[]> {
    console.log('[TauriMemoryClient] 获取指定类型记忆:', memoryType);
    return invoke('get_memories_by_type', { memoryType });
  }

  static async updateTaskStatus(
    id: string,
    status: TaskStatus,
    progress?: string,
    nextStep?: string
  ): Promise<void> {
    console.log('[TauriMemoryClient] 更新任务状态:', id, status);
    return invoke('update_task_status', { id, status, progress, nextStep: nextStep });
  }

  static async deleteMemory(id: string): Promise<void> {
    console.log('[TauriMemoryClient] 删除记忆:', id);
    return invoke('delete_memory', { id });
  }

  static async pruneMemories(): Promise<number> {
    console.log('[TauriMemoryClient] 清理低价值记忆');
    return invoke('prune_memories');
  }

  static async getMemoryStats(): Promise<MemoryStats> {
    console.log('[TauriMemoryClient] 获取记忆统计');
    return invoke('get_memory_stats');
  }

  static async initializeEmbeddingService(): Promise<void> {
    console.log('[TauriMemoryClient] 初始化向量服务');
    return invoke('initialize_embedding_service');
  }

  static async getEmbeddingDimension(): Promise<number> {
    return invoke('get_embedding_dimension');
  }

  static async reinforceMemories(ids: string[]): Promise<number> {
    console.log('[TauriMemoryClient] 强化记忆:', ids.length, '条');
    return invoke('reinforce_memories', { ids });
  }

  static async decayMemories(): Promise<DecayResult> {
    console.log('[TauriMemoryClient] 执行记忆衰减');
    return invoke('decay_memories');
  }

  static async pruneMemoriesV2(): Promise<PruneResult> {
    console.log('[TauriMemoryClient] 执行记忆淘汰');
    return invoke('prune_memories_v2');
  }

  static async runEvolutionCycle(): Promise<[DecayResult, PruneResult]> {
    console.log('[TauriMemoryClient] 执行完整演化周期');
    return invoke('run_evolution_cycle');
  }

  static async getEvolutionStats(): Promise<EvolutionStats> {
    console.log('[TauriMemoryClient] 获取演化统计');
    return invoke('get_evolution_stats');
  }
}

export class TauriSessionClient {
  static async saveSession(session: {
    id: string;
    title: string;
    folderId?: string;
    createdAt: number;
    updatedAt: number;
    activeAgents?: string[];
  }): Promise<void> {
    return invoke('save_session', { session });
  }

  static async loadSessions(): Promise<Array<{
    id: string;
    title: string;
    folderId?: string;
    createdAt: number;
    updatedAt: number;
    activeAgents?: string[];
  }>> {
    return invoke('load_sessions');
  }

  static async deleteSession(sessionId: string): Promise<void> {
    return invoke('delete_session', { sessionId });
  }

  static async saveMessages(sessionId: string, messages: Array<{
    id: string;
    sessionId: string;
    role: string;
    content: string;
    timestamp: number;
    metadata?: string;
  }>): Promise<void> {
    return invoke('save_messages', { sessionId, messages });
  }

  static async loadMessages(sessionId: string): Promise<Array<{
    id: string;
    sessionId: string;
    role: string;
    content: string;
    timestamp: number;
    metadata?: string;
  }>> {
    return invoke('load_messages', { sessionId });
  }

  static async saveFolder(folder: {
    id: string;
    name: string;
    isExpanded: boolean;
    createdAt: number;
  }): Promise<void> {
    return invoke('save_folder', { folder });
  }

  static async loadFolders(): Promise<Array<{
    id: string;
    name: string;
    isExpanded: boolean;
    createdAt: number;
  }>> {
    return invoke('load_folders');
  }

  static async deleteFolder(folderId: string): Promise<void> {
    return invoke('delete_folder', { folderId });
  }
}
