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
  CandidateMemory,
  CandidateStatus,
  ExtractionResult,
  ExtractionConfig,
  ConversationMessage,
  DedupDecision,
  PipelineResult,
  EvolutionResult,
} from '../../types';

export class TauriMemoryClient {
  static async retrieveMemories(query: string, options?: Partial<RetrievalOptions>): Promise<RetrievedMemory[]> {
    const defaultOptions: RetrievalOptions = {
      topK: 10,
      minImportance: 0.3,
      minSimilarity: 0.3,
      onlyActive: true,
      modelType: undefined,
      memoryTypes: undefined,
      sessionId: undefined,
    };
    const finalOptions = { ...defaultOptions, ...options };
    console.log('[TauriMemoryClient] 开始检索记忆, query:', query.substring(0, 50), 'options:', finalOptions);
    try {
      const result = await invoke<RetrievedMemory[]>('retrieve_memories', { query, options: finalOptions });
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

  static async shouldExtractMemories(
    messages: ConversationMessage[],
    config?: Partial<ExtractionConfig>
  ): Promise<boolean> {
    const defaultConfig: ExtractionConfig = {
      minMessageCount: 4,
      minConversationLength: 200,
      skipToolCallMessages: true,
    };
    return invoke('should_extract_memories', { 
      messages, 
      config: { ...defaultConfig, ...config } 
    });
  }

  static async getPendingCandidates(): Promise<CandidateMemory[]> {
    console.log('[TauriMemoryClient] 获取待审核候选记忆');
    return invoke('get_pending_candidates');
  }

  static async acceptCandidate(id: string): Promise<MemoryItem> {
    console.log('[TauriMemoryClient] 接受候选记忆:', id);
    return invoke('accept_candidate', { id });
  }

  static async rejectCandidate(id: string): Promise<void> {
    console.log('[TauriMemoryClient] 拒绝候选记忆:', id);
    return invoke('reject_candidate', { id });
  }

  static async acceptAllCandidates(): Promise<MemoryItem[]> {
    console.log('[TauriMemoryClient] 接受所有候选记忆');
    return invoke('accept_all_candidates');
  }

  static async addCandidateMemory(candidate: Omit<CandidateMemory, 'id' | 'createdAt' | 'status'>): Promise<string> {
    const fullCandidate: CandidateMemory = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      status: 'pending',
      ...candidate,
    };
    console.log('[TauriMemoryClient] 添加候选记忆:', fullCandidate.memoryType, fullCandidate.content.substring(0, 50));
    return invoke('add_candidate_memory', { candidate: fullCandidate });
  }

  static async clearOldCandidates(maxAgeHours: number): Promise<number> {
    console.log('[TauriMemoryClient] 清理旧候选记忆, maxAgeHours:', maxAgeHours);
    return invoke('clear_old_candidates', { maxAgeHours });
  }

  static async getEmbeddingProvider(): Promise<string> {
    console.log('[TauriMemoryClient] 获取 Embedding Provider');
    return invoke('get_embedding_provider');
  }

  static async recomputeAllEmbeddings(): Promise<number> {
    console.log('[TauriMemoryClient] 重新计算所有向量');
    return invoke('recompute_all_embeddings');
  }

  static async getStoredEmbeddingDimension(): Promise<number | null> {
    console.log('[TauriMemoryClient] 获取存储的向量维度');
    return invoke('get_stored_embedding_dimension');
  }

  static async clearAllEmbeddings(): Promise<number> {
    console.log('[TauriMemoryClient] 清除所有向量');
    return invoke('clear_all_embeddings');
  }

  static async getAvailableEmbeddingModels(): Promise<Array<[string, string, number]>> {
    console.log('[TauriMemoryClient] 获取可用的 Embedding 模型列表');
    return invoke('get_available_embedding_models');
  }

  static async initializeEmbeddingWithModel(modelId: string): Promise<void> {
    console.log('[TauriMemoryClient] 初始化 Embedding 模型:', modelId);
    return invoke('initialize_embedding_with_model', { modelId });
  }

  static async dedupCandidate(id: string): Promise<DedupDecision> {
    console.log('[TauriMemoryClient] Candidate 阶段去重:', id);
    return invoke('dedup_candidate', { id });
  }

  static async dedupAccept(id: string): Promise<DedupDecision> {
    console.log('[TauriMemoryClient] Accept 阶段去重:', id);
    return invoke('dedup_accept', { id });
  }

  static async executeDedupPipeline(id: string, decision: DedupDecision): Promise<PipelineResult> {
    console.log('[TauriMemoryClient] 执行去重 Pipeline:', id);
    return invoke('execute_dedup_pipeline', { id, decision });
  }

  static async runMemoryEvolution(): Promise<EvolutionResult> {
    console.log('[TauriMemoryClient] 执行完整记忆演化周期');
    return invoke('run_memory_evolution');
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
