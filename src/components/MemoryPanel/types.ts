import { MemoryType, RetrievedMemory } from '../../types';

export type MemoryDebugLogType = 
  | 'retrieval_start'
  | 'retrieval_candidates'
  | 'retrieval_filtered'
  | 'retrieval_complete'
  | 'reinforce'
  | 'reinforce_complete'
  | 'decay'
  | 'decay_complete'
  | 'prune'
  | 'prune_complete'
  | 'add_memory'
  | 'delete_memory';

export interface MemoryDebugLogEntry {
  id: string;
  type: MemoryDebugLogType;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface MemoryUIState {
  debugMode: boolean;
  currentHits: RetrievedMemory[];
  debugLogs: MemoryDebugLogEntry[];
  refreshTrigger: number;
}

export type MemorySortField = 'score' | 'type' | 'createdAt' | 'lastAccessedAt' | 'accessCount';
export type MemorySortOrder = 'asc' | 'desc';

export interface MemoryFilterOptions {
  types?: MemoryType[];
  minScore?: number;
  maxScore?: number;
  isActive?: boolean;
  searchQuery?: string;
}

export type MemoryPanelTab = 'list' | 'hits' | 'logs' | 'operations' | 'candidates';

export const MEMORY_TYPE_LABELS: Record<MemoryType, string> = {
  identity: '身份特征',
  preference: '用户偏好',
  constraint: '限制条件',
  fact: '用户事实',
};

export const MEMORY_TYPE_COLORS: Record<MemoryType, string> = {
  identity: 'text-purple-400',
  preference: 'text-green-400',
  constraint: 'text-red-400',
  fact: 'text-blue-400',
};

export const MEMORY_TYPE_BG_COLORS: Record<MemoryType, string> = {
  identity: 'bg-purple-500/20',
  preference: 'bg-green-500/20',
  constraint: 'bg-red-500/20',
  fact: 'bg-blue-500/20',
};

export const LOG_TYPE_LABELS: Record<MemoryDebugLogType, string> = {
  retrieval_start: '检索开始',
  retrieval_candidates: '获取候选',
  retrieval_filtered: '过滤结果',
  retrieval_complete: '检索完成',
  reinforce: '强化触发',
  reinforce_complete: '强化完成',
  decay: '衰减执行',
  decay_complete: '衰减完成',
  prune: '淘汰执行',
  prune_complete: '淘汰完成',
  add_memory: '添加记忆',
  delete_memory: '删除记忆',
};

export const LOG_TYPE_COLORS: Record<MemoryDebugLogType, string> = {
  retrieval_start: 'text-blue-400',
  retrieval_candidates: 'text-blue-300',
  retrieval_filtered: 'text-orange-400',
  retrieval_complete: 'text-green-400',
  reinforce: 'text-yellow-400',
  reinforce_complete: 'text-green-400',
  decay: 'text-orange-400',
  decay_complete: 'text-green-400',
  prune: 'text-red-400',
  prune_complete: 'text-red-300',
  add_memory: 'text-cyan-400',
  delete_memory: 'text-red-400',
};
