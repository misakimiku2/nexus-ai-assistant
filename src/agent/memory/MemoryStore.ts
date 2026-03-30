import { MemoryItem, RetrievedMemory, MemoryStats } from '../../types';
import { SimilarityEngine, similarityEngine } from './SimilarityEngine';
import { ParsedMemory } from './MemoryModelClient';
import { memoryScoreCalculator } from './MemoryScoreCalculator';

export interface StoreResult {
  accepted: MemoryItem[];
  skipped: { content: string; reason: string }[];
  merged: { existing: MemoryItem; newContent: string }[];
}

export interface MemoryStoreConfig {
  generateEmbedding: (content: string) => Promise<number[]>;
  searchSimilarMemories: (embedding: number[], topK: number) => Promise<RetrievedMemory[]>;
  addMemory: (memory: MemoryItem) => Promise<void>;
  updateMemory: (memoryId: string, updates: Partial<MemoryItem>) => Promise<void>;
  boostMemory: (memoryId: string, amount: number) => Promise<void>;
  getMemoryStats: () => Promise<MemoryStats>;
}

export class MemoryStore {
  private similarityEngine: SimilarityEngine;
  private config: MemoryStoreConfig | null = null;

  constructor() {
    this.similarityEngine = similarityEngine;
  }

  setConfig(config: MemoryStoreConfig): void {
    this.config = config;
    this.similarityEngine.setEmbeddingFunction(config.generateEmbedding);
    this.similarityEngine.setSearchFunction(config.searchSimilarMemories);
    this.similarityEngine.setUpdateMemoryFunction(config.updateMemory);
    this.similarityEngine.setBoostMemoryFunction(config.boostMemory);
  }

  async storeCandidates(
    candidates: ParsedMemory[],
    sessionId: string
  ): Promise<StoreResult> {
    const result: StoreResult = {
      accepted: [],
      skipped: [],
      merged: [],
    };

    if (!this.config) {
      console.error('[MemoryStore] Config not set');
      return result;
    }

    await this.generateEmbeddingsParallel(candidates);

    const totalMemories = await this.getTotalMemories();

    for (const candidate of candidates) {
      try {
        const { decision } = await this.similarityEngine.processCandidate(candidate, totalMemories);

        switch (decision.action) {
          case 'skip':
            await this.similarityEngine.executeBoost(decision.targetMemory!.id, 0.05);
            result.skipped.push({
              content: candidate.span,
              reason: decision.reason,
            });
            break;

          case 'merge':
            const mergeResult = await this.similarityEngine.executeMerge(
              decision.targetMemory!,
              candidate
            );
            
            if (mergeResult.wasMerged) {
              result.merged.push({
                existing: decision.targetMemory!,
                newContent: candidate.span,
              });
            } else {
              console.log('[MemoryStore] Merge failed, fallback to insert');
              const memory = await this.insertMemory(candidate, sessionId);
              if (memory) {
                result.accepted.push(memory);
              }
            }
            break;

          case 'insert':
            const memory = await this.insertMemory(candidate, sessionId);
            if (memory) {
              result.accepted.push(memory);
            }
            break;
        }
      } catch (error) {
        console.error('[MemoryStore] Failed to process candidate:', error);
      }
    }

    console.log('[MemoryStore] Store result:', {
      accepted: result.accepted.length,
      skipped: result.skipped.length,
      merged: result.merged.length,
    });

    return result;
  }

  private async generateEmbeddingsParallel(candidates: ParsedMemory[]): Promise<void> {
    if (!this.config) return;

    await Promise.all(
      candidates.map(async (c) => {
        if (!c.embedding) {
          c.embedding = await this.config!.generateEmbedding(c.span);
        }
      })
    );
  }

  private async getTotalMemories(): Promise<number> {
    if (!this.config) return 100;
    
    try {
      const stats = await this.config.getMemoryStats();
      return stats.totalCount;
    } catch {
      return 100;
    }
  }

  private async insertMemory(
    candidate: ParsedMemory,
    sessionId: string
  ): Promise<MemoryItem | null> {
    if (!this.config) return null;

    try {
      const embedding = candidate.embedding || 
        await this.config.generateEmbedding(candidate.span);
      
      const memory: MemoryItem = {
        id: crypto.randomUUID(),
        content: candidate.span,
        memoryType: candidate.type,
        importance: candidate.importance,
        score: candidate.importance,
        decay: 1.0,
        isActive: true,
        embedding,
        sourceSessionId: sessionId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 1,
        version: 1,
        parentIds: [],
      };

      const score = memoryScoreCalculator.calculate(memory);
      memory.score = score.final;

      await this.config.addMemory(memory);
      
      return memory;
    } catch (error) {
      console.error('[MemoryStore] Insert failed:', error);
      return null;
    }
  }
}

export const memoryStore = new MemoryStore();
