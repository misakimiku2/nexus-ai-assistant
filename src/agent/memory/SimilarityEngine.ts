import { 
  MemoryItem, 
  SimilarityDecision, 
  SimilarityThresholds, 
  DEFAULT_SIMILARITY_THRESHOLDS,
  RetrievedMemory
} from '../../types';
import { ParsedMemory } from './MemoryModelClient';

export interface SimilaritySearchResult {
  memory: MemoryItem;
  similarity: number;
}

export interface MergeResult {
  success: boolean;
  content: string;
  wasMerged: boolean;
}

export class SimilarityEngine {
  private thresholds: SimilarityThresholds;
  private generateEmbedding: ((content: string) => Promise<number[]>) | null = null;
  private searchSimilarMemories: ((embedding: number[], topK: number) => Promise<RetrievedMemory[]>) | null = null;
  private updateMemory: ((memoryId: string, updates: Partial<MemoryItem>) => Promise<void>) | null = null;
  private boostMemory: ((memoryId: string, amount: number) => Promise<void>) | null = null;

  constructor(thresholds: SimilarityThresholds = DEFAULT_SIMILARITY_THRESHOLDS) {
    this.thresholds = thresholds;
  }

  setEmbeddingFunction(fn: (content: string) => Promise<number[]>): void {
    this.generateEmbedding = fn;
  }

  setSearchFunction(fn: (embedding: number[], topK: number) => Promise<RetrievedMemory[]>): void {
    this.searchSimilarMemories = fn;
  }

  setUpdateMemoryFunction(fn: (memoryId: string, updates: Partial<MemoryItem>) => Promise<void>): void {
    this.updateMemory = fn;
  }

  setBoostMemoryFunction(fn: (memoryId: string, amount: number) => Promise<void>): void {
    this.boostMemory = fn;
  }

  async findSimilarMemories(
    embedding: number[],
    totalMemories: number = 100
  ): Promise<SimilaritySearchResult[]> {
    if (!this.searchSimilarMemories) {
      console.warn('[SimilarityEngine] Search function not set');
      return [];
    }

    try {
      const topK = this.calculateDynamicTopK(totalMemories);
      
      const searchResults = await this.searchSimilarMemories(embedding, topK);

      return searchResults.map(result => ({
        memory: result.item,
        similarity: result.score,
      }));
    } catch (error) {
      console.error('[SimilarityEngine] Search failed:', error);
      return [];
    }
  }

  private calculateDynamicTopK(totalMemories: number): number {
    return Math.min(50, Math.max(10, Math.floor(totalMemories * 0.05)));
  }

  filterByType(
    results: SimilaritySearchResult[],
    memoryType: string
  ): SimilaritySearchResult[] {
    return results.filter(r => r.memory.memoryType === memoryType);
  }

  makeDecision(
    candidate: ParsedMemory,
    similarMemories: SimilaritySearchResult[]
  ): SimilarityDecision {
    const typeMatched = this.filterByType(similarMemories, candidate.type);

    if (typeMatched.length === 0) {
      return {
        action: 'insert',
        similarity: 0,
        reason: 'No similar memories found for this type',
      };
    }

    const topMatch = typeMatched[0];
    const similarity = topMatch.similarity;

    if (similarity > this.thresholds.duplicate) {
      return {
        action: 'skip',
        targetMemory: topMatch.memory,
        similarity,
        reason: `Duplicate detected (similarity: ${similarity.toFixed(3)} > ${this.thresholds.duplicate}, same type)`,
      };
    }

    if (similarity > this.thresholds.merge) {
      return {
        action: 'merge',
        targetMemory: topMatch.memory,
        similarity,
        reason: `Similar memory found (similarity: ${similarity.toFixed(3)} > ${this.thresholds.merge})`,
      };
    }

    return {
      action: 'insert',
      similarity,
      reason: `New memory (similarity: ${similarity.toFixed(3)} < ${this.thresholds.merge})`,
    };
  }

  async processCandidate(
    candidate: ParsedMemory,
    totalMemories: number = 100
  ): Promise<{
    decision: SimilarityDecision;
    similarMemories: SimilaritySearchResult[];
  }> {
    let embedding = candidate.embedding;
    
    if (!embedding && this.generateEmbedding) {
      console.warn('[SimilarityEngine] No cached embedding, generating...');
      embedding = await this.generateEmbedding(candidate.span);
      candidate.embedding = embedding;
    }

    if (!embedding) {
      return {
        decision: {
          action: 'insert',
          similarity: 0,
          reason: 'No embedding available',
        },
        similarMemories: [],
      };
    }

    const similarMemories = await this.findSimilarMemories(embedding, totalMemories);
    const decision = this.makeDecision(candidate, similarMemories);

    console.log('[SimilarityEngine] Decision:', {
      content: candidate.span.substring(0, 50),
      type: candidate.type,
      action: decision.action,
      similarity: decision.similarity.toFixed(3),
      reason: decision.reason,
    });

    return { decision, similarMemories };
  }

  async executeBoost(memoryId: string, boostAmount: number = 0.05): Promise<void> {
    if (!this.boostMemory) {
      console.warn('[SimilarityEngine] Boost function not set');
      return;
    }

    try {
      await this.boostMemory(memoryId, boostAmount);
      console.log('[SimilarityEngine] Boosted memory:', memoryId);
    } catch (error) {
      console.error('[SimilarityEngine] Boost failed:', error);
    }
  }

  async executeMerge(
    existing: MemoryItem,
    candidate: ParsedMemory
  ): Promise<MergeResult> {
    const mergedContent = this.conservativeMerge(existing.content, candidate.span);
    const mergedImportance = Math.max(existing.importance, candidate.importance);

    const wasMerged = mergedContent !== existing.content;

    if (!wasMerged) {
      console.log('[SimilarityEngine] Merge failed: no inclusion relationship');
      return {
        success: false,
        content: existing.content,
        wasMerged: false,
      };
    }

    if (!this.updateMemory || !this.generateEmbedding) {
      console.warn('[SimilarityEngine] Update functions not set');
      return {
        success: false,
        content: existing.content,
        wasMerged: false,
      };
    }

    try {
      const newEmbedding = await this.generateEmbedding(mergedContent);
      
      await this.updateMemory(existing.id, {
        content: mergedContent,
        importance: mergedImportance,
        embedding: newEmbedding,
      });

      console.log('[SimilarityEngine] Merged memory:', existing.id);
      return {
        success: true,
        content: mergedContent,
        wasMerged: true,
      };
    } catch (error) {
      console.error('[SimilarityEngine] Merge failed:', error);
      throw error;
    }
  }

  private conservativeMerge(existing: string, newContent: string): string {
    if (existing.includes(newContent)) {
      return existing;
    }
    
    if (newContent.includes(existing)) {
      return newContent;
    }

    return existing;
  }

  updateThresholds(thresholds: Partial<SimilarityThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  getThresholds(): SimilarityThresholds {
    return this.thresholds;
  }
}

export const similarityEngine = new SimilarityEngine();
