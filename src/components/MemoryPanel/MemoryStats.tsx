import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { MemoryStats as MemoryStatsType, EvolutionStats } from '../../types';

interface MemoryStatsProps {
  isDarkMode: boolean;
  stats: MemoryStatsType | null;
  evolutionStats: EvolutionStats | null;
  loading: boolean;
}

export const MemoryStats: React.FC<MemoryStatsProps> = ({
  isDarkMode,
  stats,
  evolutionStats,
  loading,
}) => {
  const { t } = useTranslation();

  if (loading && !stats) {
    return (
      <div className={cn(
        "flex items-center justify-center py-4",
        isDarkMode ? "text-zinc-400" : "text-zinc-500"
      )}>
        Loading...
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const formatValue = (value: number | undefined | null, decimals: number = 2): string => {
    if (value === undefined || value === null || isNaN(value)) {
      return '-';
    }
    return value.toFixed(decimals);
  };

  const statCards = [
    { label: t('memory.stats.total'), value: stats.totalCount, color: 'text-blue-400' },
    { label: t('memory.stats.active'), value: evolutionStats?.activeCount ?? '-', color: 'text-green-400' },
    { label: t('memory.stats.inactive'), value: evolutionStats?.inactiveCount ?? '-', color: 'text-zinc-400' },
    { label: t('memory.stats.avgScore'), value: formatValue(evolutionStats?.avgScore, 2), color: 'text-yellow-400' },
    { label: t('memory.stats.avgDecay'), value: formatValue(evolutionStats?.avgDecay, 4), color: 'text-orange-400' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className={cn(
              "flex flex-col items-center px-4 py-2 rounded-lg min-w-[80px]",
              isDarkMode ? "bg-zinc-800" : "bg-zinc-100"
            )}
          >
            <span className={cn("text-xl font-bold", stat.color)}>{stat.value}</span>
            <span className={cn(
              "text-xs",
              isDarkMode ? "text-zinc-400" : "text-zinc-500"
            )}>{stat.label}</span>
          </div>
        ))}
      </div>

      {stats.byType && Object.keys(stats.byType).length > 0 && (
        <div className={cn(
          "flex flex-wrap gap-2 text-xs",
          isDarkMode ? "text-zinc-400" : "text-zinc-500"
        )}>
          <span className="font-medium">{t('memory.stats.byType')}:</span>
          {Object.entries(stats.byType).map(([type, count]) => (
            <span
              key={type}
              className={cn(
                "px-2 py-0.5 rounded",
                isDarkMode ? "bg-zinc-800" : "bg-zinc-200"
              )}
            >
              {t(`memory.types.${type}`)}: {count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
