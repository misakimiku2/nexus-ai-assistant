import { MemoryItem, MemoryScore } from '../../types';

export class MemoryScoreCalculator {
  calculate(memory: MemoryItem): MemoryScore {
    const now = Date.now();
    const ageInDays = (now - memory.createdAt) / (1000 * 60 * 60 * 24);
    
    const halfLifeDays = 30;
    const decay = Math.pow(0.5, ageInDays / halfLifeDays);
    
    const accessBonus = Math.min(memory.accessCount * 0.01, 0.2);
    
    const final = memory.importance * decay + accessBonus;

    return {
      base: memory.importance,
      decay,
      access: accessBonus,
      final: Math.min(final, 1.0),
    };
  }

  calculateBatch(memories: MemoryItem[]): Map<string, MemoryScore> {
    const scores = new Map<string, MemoryScore>();
    
    for (const memory of memories) {
      scores.set(memory.id, this.calculate(memory));
    }
    
    return scores;
  }

  sortByScore(memories: MemoryItem[]): MemoryItem[] {
    return [...memories].sort((a, b) => {
      const scoreA = this.calculate(a);
      const scoreB = this.calculate(b);
      return scoreB.final - scoreA.final;
    });
  }

  filterByMinScore(memories: MemoryItem[], minScore: number): MemoryItem[] {
    return memories.filter(m => {
      const score = this.calculate(m);
      return score.final >= minScore;
    });
  }

  getLowScoreMemories(memories: MemoryItem[], minScore: number): MemoryItem[] {
    return memories.filter(m => {
      const score = this.calculate(m);
      return score.final < minScore;
    });
  }
}

export const memoryScoreCalculator = new MemoryScoreCalculator();
