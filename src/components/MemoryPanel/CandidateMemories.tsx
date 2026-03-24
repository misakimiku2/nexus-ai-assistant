import React, { useState, useEffect, useCallback } from 'react';
import { Check, X, CheckCheck, Trash2, RefreshCw, Brain, Clock, Tag } from 'lucide-react';
import { TauriMemoryClient } from '../../agent/memory/TauriMemoryClient';
import { CandidateMemory } from '../../types';
import { cn } from '../../lib/utils';

interface CandidateMemoriesProps {
  className?: string;
}

export function CandidateMemories({ className }: CandidateMemoriesProps) {
  const [candidates, setCandidates] = useState<CandidateMemory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCandidates = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await TauriMemoryClient.getPendingCandidates();
      setCandidates(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load candidates');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCandidates();
    const interval = setInterval(loadCandidates, 30000);
    return () => clearInterval(interval);
  }, [loadCandidates]);

  const handleAccept = async (id: string) => {
    try {
      await TauriMemoryClient.acceptCandidate(id);
      setCandidates(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept candidate');
    }
  };

  const handleReject = async (id: string) => {
    try {
      await TauriMemoryClient.rejectCandidate(id);
      setCandidates(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject candidate');
    }
  };

  const handleAcceptAll = async () => {
    try {
      await TauriMemoryClient.acceptAllCandidates();
      setCandidates([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept all candidates');
    }
  };

  const getMemoryTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      identity: '身份',
      fact: '事实',
      preference: '偏好',
      task: '任务',
      constraint: '限制',
      skill: '能力',
    };
    return labels[type] || type;
  };

  const getMemoryTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      identity: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      fact: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      preference: 'bg-green-500/20 text-green-400 border-green-500/30',
      task: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      constraint: 'bg-red-500/20 text-red-400 border-red-500/30',
      skill: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    };
    return colors[type] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (candidates.length === 0 && !isLoading) {
    return (
      <div className={cn('p-4', className)}>
        <div className="flex items-center gap-2 mb-4">
          <Brain className="w-5 h-5 text-blue-400" />
          <h3 className="text-sm font-medium text-zinc-300">候选记忆</h3>
        </div>
        <div className="text-sm text-zinc-500 text-center py-4">
          暂无待审核的候选记忆
        </div>
      </div>
    );
  }

  return (
    <div className={cn('p-4', className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-blue-400" />
          <h3 className="text-sm font-medium text-zinc-300">候选记忆</h3>
          <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
            {candidates.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadCandidates}
            disabled={isLoading}
            className="p-1.5 rounded-md hover:bg-zinc-700/50 transition-colors"
            title="刷新"
          >
            <RefreshCw className={cn('w-4 h-4 text-zinc-400', isLoading && 'animate-spin')} />
          </button>
          {candidates.length > 1 && (
            <button
              onClick={handleAcceptAll}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded-md hover:bg-green-500/30 transition-colors"
            >
              <CheckCheck className="w-3 h-3" />
              全部接受
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-3 p-2 bg-red-500/10 border border-red-500/20 rounded-md text-xs text-red-400">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {candidates.map(candidate => (
          <div
            key={candidate.id}
            className="p-3 bg-zinc-800/50 border border-zinc-700/50 rounded-lg"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn(
                  'text-xs px-2 py-0.5 rounded border',
                  getMemoryTypeColor(candidate.memoryType)
                )}>
                  <Tag className="w-3 h-3 inline mr-1" />
                  {getMemoryTypeLabel(candidate.memoryType)}
                </span>
                <span className="text-xs text-zinc-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatTime(candidate.createdAt)}
                </span>
                <span className="text-xs text-zinc-500">
                  置信度: {(candidate.confidence * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            <p className="text-sm text-zinc-300 mb-3 leading-relaxed">
              {candidate.content}
            </p>

            <div className="flex items-center justify-between">
              <div className="text-xs text-zinc-500">
                重要性: {candidate.importance.toFixed(2)}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleReject(candidate.id)}
                  className="p-1.5 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                  title="拒绝"
                >
                  <X className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleAccept(candidate.id)}
                  className="p-1.5 rounded-md bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
                  title="接受"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
