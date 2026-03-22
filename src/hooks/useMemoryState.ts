import { useState, useEffect, useCallback } from 'react';
import { TauriMemoryClient } from '../agent/memory/TauriMemoryClient';
import { MemoryItem, MemoryStats, EvolutionStats, DecayResult, PruneResult } from '../types';
import { useMemoryUI } from '../context/MemoryUIContext';

interface UseMemoryStateReturn {
  memories: MemoryItem[];
  stats: MemoryStats | null;
  evolutionStats: EvolutionStats | null;
  loading: boolean;
  error: string | null;
  
  refresh: () => Promise<void>;
  reinforce: (ids: string[]) => Promise<number>;
  deleteMemory: (id: string) => Promise<void>;
  decay: () => Promise<DecayResult>;
  prune: () => Promise<PruneResult>;
  runEvolutionCycle: () => Promise<[DecayResult, PruneResult]>;
}

export const useMemoryState = (): UseMemoryStateReturn => {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [evolutionStats, setEvolutionStats] = useState<EvolutionStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { refreshTrigger, addDebugLog } = useMemoryUI();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const [memoriesData, statsData, evolutionData] = await Promise.all([
        TauriMemoryClient.getAllMemories(),
        TauriMemoryClient.getMemoryStats(),
        TauriMemoryClient.getEvolutionStats(),
      ]);
      
      setMemories(memoriesData);
      setStats(statsData);
      setEvolutionStats(evolutionData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load memories';
      setError(errorMessage);
      console.error('[useMemoryState] Error refreshing:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refreshTrigger]);

  const reinforce = useCallback(async (ids: string[]): Promise<number> => {
    if (ids.length === 0) return 0;
    
    addDebugLog('reinforce', { memoryIds: ids, count: ids.length });
    
    try {
      const result = await TauriMemoryClient.reinforceMemories(ids);
      addDebugLog('reinforce_complete', { memoryIds: ids, updatedCount: result });
      await refresh();
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to reinforce memories';
      setError(errorMessage);
      throw err;
    }
  }, [addDebugLog, refresh]);

  const deleteMemory = useCallback(async (id: string): Promise<void> => {
    addDebugLog('delete_memory', { memoryId: id });
    
    try {
      await TauriMemoryClient.deleteMemory(id);
      await refresh();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete memory';
      setError(errorMessage);
      throw err;
    }
  }, [addDebugLog, refresh]);

  const decay = useCallback(async (): Promise<DecayResult> => {
    addDebugLog('decay', {});
    
    try {
      const result = await TauriMemoryClient.decayMemories();
      addDebugLog('decay_complete', { processed: result.processed, updated: result.updated });
      await refresh();
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to decay memories';
      setError(errorMessage);
      throw err;
    }
  }, [addDebugLog, refresh]);

  const prune = useCallback(async (): Promise<PruneResult> => {
    addDebugLog('prune', {});
    
    try {
      const result = await TauriMemoryClient.pruneMemoriesV2();
      addDebugLog('prune_complete', { markedInactive: result.markedInactive, deleted: result.deleted });
      await refresh();
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to prune memories';
      setError(errorMessage);
      throw err;
    }
  }, [addDebugLog, refresh]);

  const runEvolutionCycle = useCallback(async (): Promise<[DecayResult, PruneResult]> => {
    addDebugLog('decay', {});
    addDebugLog('prune', {});
    
    try {
      const result = await TauriMemoryClient.runEvolutionCycle();
      addDebugLog('decay_complete', { processed: result[0].processed, updated: result[0].updated });
      addDebugLog('prune_complete', { markedInactive: result[1].markedInactive, deleted: result[1].deleted });
      await refresh();
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to run evolution cycle';
      setError(errorMessage);
      throw err;
    }
  }, [addDebugLog, refresh]);

  return {
    memories,
    stats,
    evolutionStats,
    loading,
    error,
    refresh,
    reinforce,
    deleteMemory,
    decay,
    prune,
    runEvolutionCycle,
  };
};
