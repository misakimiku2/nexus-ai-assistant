import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Zap, 
  TrendingDown, 
  Trash2, 
  RefreshCw, 
  AlertTriangle,
  CheckCircle,
  Loader2,
  Shield,
  ShieldOff
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useMemoryState } from '../../hooks/useMemoryState';
import { DecayResult, PruneResult } from '../../types';

interface MemoryOperationsProps {
  isDarkMode: boolean;
}

export const MemoryOperations: React.FC<MemoryOperationsProps> = ({ isDarkMode }) => {
  const { t } = useTranslation();
  const { memories, reinforce, deleteMemory, decay, prune, runEvolutionCycle } = useMemoryState();
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<string | null>(null);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const activeMemories = memories.filter(m => m.isActive);
  const inactiveMemories = memories.filter(m => !m.isActive);
  const lowScoreMemories = memories.filter(m => m.score < 0.3);

  const showResult = (type: 'success' | 'error', message: string) => {
    setResult({ type, message });
    setTimeout(() => setResult(null), 3000);
  };

  const handleReinforceSelected = async () => {
    if (selectedIds.size === 0) return;
    
    setLoading('reinforce');
    try {
      const count = await reinforce(Array.from(selectedIds));
      showResult('success', t('memory.operations.reinforced', { count }));
      setSelectedIds(new Set());
    } catch (err) {
      showResult('error', `Failed to reinforce: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(null);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    
    if (!confirm(`${t('memory.operations.deleteSelected')}? (${selectedIds.size})`)) {
      return;
    }
    
    setLoading('delete');
    try {
      for (const id of selectedIds) {
        await deleteMemory(id);
      }
      showResult('success', t('memory.operations.deleted', { count: selectedIds.size }));
      setSelectedIds(new Set());
    } catch (err) {
      showResult('error', `Failed to delete: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(null);
    }
  };

  const handleDecay = async () => {
    setLoading('decay');
    try {
      const decayResult: DecayResult = await decay();
      showResult('success', t('memory.operations.decayComplete', { processed: decayResult.processed, updated: decayResult.updated }));
    } catch (err) {
      showResult('error', `Decay failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(null);
    }
  };

  const handlePrune = async () => {
    setLoading('prune');
    try {
      const pruneResult: PruneResult = await prune();
      showResult('success', t('memory.operations.pruneComplete', { marked: pruneResult.markedInactive, deleted: pruneResult.deleted }));
    } catch (err) {
      showResult('error', `Prune failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(null);
    }
  };

  const handleEvolutionCycle = async () => {
    setLoading('evolution');
    try {
      const [decayResult, pruneResult] = await runEvolutionCycle();
      showResult('success', t('memory.operations.evolutionComplete', { 
        decayUpdated: decayResult.updated, 
        pruneMarked: pruneResult.markedInactive, 
        pruneDeleted: pruneResult.deleted 
      }));
    } catch (err) {
      showResult('error', `Evolution failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(null);
    }
  };

  const handleClearLowScore = async () => {
    if (lowScoreMemories.length === 0) {
      showResult('success', t('memory.operations.noLowScore'));
      return;
    }
    
    if (!confirm(`${t('memory.operations.clear')} ${lowScoreMemories.length} ${t('memory.operations.lowScore')} ${t('memory.operations.memories')}?`)) {
      return;
    }
    
    setLoading('clear-low');
    try {
      for (const memory of lowScoreMemories) {
        await deleteMemory(memory.id);
      }
      showResult('success', t('memory.operations.deleted', { count: lowScoreMemories.length }));
    } catch (err) {
      showResult('error', `Failed to clear: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(null);
    }
  };

  const handleClearInactive = async () => {
    if (inactiveMemories.length === 0) {
      showResult('success', t('memory.operations.noInactive'));
      return;
    }
    
    if (!confirm(`${t('memory.operations.clear')} ${inactiveMemories.length} ${t('memory.operations.inactiveMemories')}?`)) {
      return;
    }
    
    setLoading('clear-inactive');
    try {
      for (const memory of inactiveMemories) {
        await deleteMemory(memory.id);
      }
      showResult('success', t('memory.operations.deleted', { count: inactiveMemories.length }));
    } catch (err) {
      showResult('error', `Failed to clear: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      {result && (
        <div className={cn(
          "flex items-center gap-2 px-4 py-3 rounded-lg",
          result.type === 'success'
            ? isDarkMode
              ? "bg-green-500/10 border border-green-500/20 text-green-400"
              : "bg-green-50 border border-green-200 text-green-600"
            : isDarkMode
              ? "bg-red-500/10 border border-red-500/20 text-red-400"
              : "bg-red-50 border border-red-200 text-red-600"
        )}>
          {result.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          <span className="text-sm">{result.message}</span>
        </div>
      )}

      <div className={cn(
        "rounded-lg border p-4",
        isDarkMode ? "bg-zinc-800/50 border-zinc-700" : "bg-zinc-50 border-zinc-200"
      )}>
        <h3 className={cn(
          "text-sm font-medium mb-3",
          isDarkMode ? "text-zinc-200" : "text-zinc-700"
        )}>
          {t('memory.operations.selectedMemories')} ({selectedIds.size})
        </h3>
        
        <div className="flex flex-wrap gap-2">
          <OperationButton
            icon={Zap}
            label={t('memory.operations.reinforceSelected')}
            onClick={handleReinforceSelected}
            disabled={selectedIds.size === 0}
            loading={loading === 'reinforce'}
            variant="primary"
            isDarkMode={isDarkMode}
          />
          <OperationButton
            icon={TrendingDown}
            label={t('memory.operations.reduceScore')}
            onClick={() => showResult('error', t('memory.operations.reduceScoreNotImplemented'))}
            disabled={selectedIds.size === 0}
            loading={loading === 'reduce'}
            variant="warning"
            isDarkMode={isDarkMode}
          />
          <OperationButton
            icon={Trash2}
            label={t('memory.operations.deleteSelected')}
            onClick={handleDeleteSelected}
            disabled={selectedIds.size === 0}
            loading={loading === 'delete'}
            variant="danger"
            isDarkMode={isDarkMode}
          />
        </div>

        <p className={cn(
          "mt-2 text-xs",
          isDarkMode ? "text-zinc-500" : "text-zinc-400"
        )}>
          {t('memory.operations.selectFromList')}
        </p>
      </div>

      <div className={cn(
        "rounded-lg border p-4",
        isDarkMode ? "bg-zinc-800/50 border-zinc-700" : "bg-zinc-50 border-zinc-200"
      )}>
        <h3 className={cn(
          "text-sm font-medium mb-3",
          isDarkMode ? "text-zinc-200" : "text-zinc-700"
        )}>
          {t('memory.operations.evolutionControls')}
        </h3>
        
        <div className="flex flex-wrap gap-2">
          <OperationButton
            icon={TrendingDown}
            label={t('memory.operations.runDecay')}
            onClick={handleDecay}
            loading={loading === 'decay'}
            variant="warning"
            isDarkMode={isDarkMode}
          />
          <OperationButton
            icon={Trash2}
            label={t('memory.operations.runPrune')}
            onClick={handlePrune}
            loading={loading === 'prune'}
            variant="danger"
            isDarkMode={isDarkMode}
          />
          <OperationButton
            icon={RefreshCw}
            label={t('memory.operations.fullEvolutionCycle')}
            onClick={handleEvolutionCycle}
            loading={loading === 'evolution'}
            variant="primary"
            isDarkMode={isDarkMode}
          />
        </div>

        <div className={cn(
          "mt-3 p-2 rounded text-xs",
          isDarkMode ? "bg-zinc-900/50 text-zinc-400" : "bg-zinc-100 text-zinc-500"
        )}>
          <div className="font-medium mb-1">{t('memory.operations.whatHappens')}:</div>
          <ul className="list-disc list-inside space-y-0.5">
            <li><strong>{t('memory.operations.runDecay')}:</strong> {t('memory.operations.decayDesc')}</li>
            <li><strong>{t('memory.operations.runPrune')}:</strong> {t('memory.operations.pruneDesc')}</li>
          </ul>
        </div>
      </div>

      <div className={cn(
        "rounded-lg border p-4",
        isDarkMode ? "bg-zinc-800/50 border-zinc-700" : "bg-zinc-50 border-zinc-200"
      )}>
        <h3 className={cn(
          "text-sm font-medium mb-3",
          isDarkMode ? "text-zinc-200" : "text-zinc-700"
        )}>
          {t('memory.operations.quickActions')}
        </h3>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className={cn("text-sm", isDarkMode ? "text-zinc-300" : "text-zinc-600")}>
              {t('memory.operations.lowScore')}: <strong>{lowScoreMemories.length}</strong> {t('memory.operations.memories')}
            </span>
            <OperationButton
              icon={Trash2}
              label={t('memory.operations.clear')}
              onClick={handleClearLowScore}
              loading={loading === 'clear-low'}
              variant="danger"
              size="sm"
              isDarkMode={isDarkMode}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <span className={cn("text-sm", isDarkMode ? "text-zinc-300" : "text-zinc-600")}>
              {t('memory.operations.inactiveMemories')}: <strong>{inactiveMemories.length}</strong> {t('memory.operations.memories')}
            </span>
            <OperationButton
              icon={Trash2}
              label={t('memory.operations.clear')}
              onClick={handleClearInactive}
              loading={loading === 'clear-inactive'}
              variant="danger"
              size="sm"
              isDarkMode={isDarkMode}
            />
          </div>
        </div>
      </div>

      <div className={cn(
        "rounded-lg border p-4",
        isDarkMode ? "bg-zinc-800/50 border-zinc-700" : "bg-zinc-50 border-zinc-200"
      )}>
        <h3 className={cn(
          "text-sm font-medium mb-3",
          isDarkMode ? "text-zinc-200" : "text-zinc-700"
        )}>
          {t('memory.operations.lockMemory')}
        </h3>
        
        <div className="flex items-center gap-2">
          <button
            disabled
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-sm opacity-50 cursor-not-allowed",
              isDarkMode ? "bg-zinc-700 text-zinc-400" : "bg-zinc-200 text-zinc-500"
            )}
          >
            <Shield size={14} />
            {t('memory.operations.lockSelected')}
          </button>
          <button
            disabled
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-sm opacity-50 cursor-not-allowed",
              isDarkMode ? "bg-zinc-700 text-zinc-400" : "bg-zinc-200 text-zinc-500"
            )}
          >
            <ShieldOff size={14} />
            {t('memory.operations.unlockSelected')}
          </button>
        </div>
        
        <p className={cn(
          "mt-2 text-xs",
          isDarkMode ? "text-zinc-500" : "text-zinc-400"
        )}>
          {t('memory.operations.lockedDesc')}
        </p>
      </div>
    </div>
  );
};

interface OperationButtonProps {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant: 'primary' | 'warning' | 'danger';
  size?: 'sm' | 'md';
  isDarkMode: boolean;
}

const OperationButton: React.FC<OperationButtonProps> = ({
  icon: Icon,
  label,
  onClick,
  disabled,
  loading,
  variant,
  size = 'md',
  isDarkMode,
}) => {
  const variantStyles = {
    primary: isDarkMode
      ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/30"
      : "bg-blue-100 text-blue-600 hover:bg-blue-200 border border-blue-200",
    warning: isDarkMode
      ? "bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 border border-yellow-500/30"
      : "bg-yellow-100 text-yellow-600 hover:bg-yellow-200 border border-yellow-200",
    danger: isDarkMode
      ? "bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
      : "bg-red-100 text-red-600 hover:bg-red-200 border border-red-200",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "flex items-center gap-2 rounded-lg font-medium transition-colors",
        size === 'sm' ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm",
        variantStyles[variant],
        (disabled || loading) && "opacity-50 cursor-not-allowed"
      )}
    >
      {loading ? <Loader2 size={size === 'sm' ? 12 : 14} className="animate-spin" /> : <Icon size={size === 'sm' ? 12 : 14} />}
      {label}
    </button>
  );
};
