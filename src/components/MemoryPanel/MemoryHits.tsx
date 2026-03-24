import React from 'react';
import { useTranslation } from 'react-i18next';
import { Target, Hash, TrendingUp, BarChart3 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useMemoryUI } from '../../context/MemoryUIContext';

interface MemoryHitsProps {
  isDarkMode: boolean;
  debugMode: boolean;
}

export const MemoryHits: React.FC<MemoryHitsProps> = ({ isDarkMode, debugMode }) => {
  const { t } = useTranslation();
  const { currentHits } = useMemoryUI();

  if (currentHits.length === 0) {
    return (
      <div className={cn(
        "flex flex-col items-center justify-center py-12 text-center",
        isDarkMode ? "text-zinc-500" : "text-zinc-400"
      )}>
        <Target size={48} className="mb-4 opacity-30" />
        <p className="text-lg font-medium mb-2">{t('memory.hits.noHits')}</p>
        <p className="text-sm">
          {t('memory.hits.noHitsDesc')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg",
        isDarkMode ? "bg-blue-500/10 border border-blue-500/20" : "bg-blue-50 border border-blue-200"
      )}>
        <Target size={16} className="text-blue-400" />
        <span className={cn("text-sm font-medium", isDarkMode ? "text-blue-400" : "text-blue-600")}>
          {currentHits.length} {t('memory.hits.memoriesRetrieved')}
        </span>
      </div>

      <div className="space-y-3">
        {currentHits.map((hit, index) => {
          const similarity = hit.components?.similarity ?? 0;
          const memoryScore = hit.components?.memoryScore ?? 0;
          const score = hit.score ?? 0;
          
          return (
          <div
            key={hit.item.id}
            className={cn(
              "rounded-lg border p-4",
              isDarkMode
                ? "bg-zinc-800/50 border-zinc-700"
                : "bg-zinc-50 border-zinc-200"
            )}
          >
            <div className="flex items-start gap-3">
              <div className={cn(
                "flex items-center justify-center w-8 h-8 rounded-full shrink-0 font-bold text-sm",
                isDarkMode ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-600"
              )}>
                #{index + 1}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className={cn(
                    "px-2 py-0.5 rounded text-xs font-medium",
                    "bg-blue-500/20 text-blue-400"
                  )}>
                    {t(`memory.types.${hit.item.memoryType}`)}
                  </span>
                </div>

                <div className={cn(
                  "text-sm mb-3",
                  isDarkMode ? "text-zinc-200" : "text-zinc-700"
                )}>
                  {hit.item.content}
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <ScoreCard
                    label={t('memory.hits.finalScore')}
                    value={score.toFixed(3)}
                    icon={TrendingUp}
                    color="text-yellow-400"
                    isDarkMode={isDarkMode}
                    debugMode={debugMode}
                    formula="similarity × 0.6 + score × 0.4"
                  />
                  <ScoreCard
                    label={t('memory.hits.similarity')}
                    value={similarity.toFixed(3)}
                    icon={BarChart3}
                    color="text-blue-400"
                    isDarkMode={isDarkMode}
                    debugMode={debugMode}
                    description="Semantic similarity to query"
                  />
                  <ScoreCard
                    label={t('memory.hits.memoryScore')}
                    value={memoryScore.toFixed(3)}
                    icon={Hash}
                    color="text-green-400"
                    isDarkMode={isDarkMode}
                    debugMode={debugMode}
                    description="Dynamic weight of memory"
                  />
                </div>

                {debugMode && (
                  <div className={cn(
                    "mt-3 p-2 rounded text-xs font-mono space-y-1",
                    isDarkMode ? "bg-zinc-900/50 text-zinc-400" : "bg-zinc-100 text-zinc-500"
                  )}>
                    <div>ID: {hit.item.id}</div>
                    <div>
                      Calculation: {similarity.toFixed(3)} × 0.6 + {memoryScore.toFixed(3)} × 0.4 = {score.toFixed(3)}
                    </div>
                    <div>
                      Access Count: {hit.item.accessCount} | Last Accessed: {new Date(hit.item.lastAccessedAt).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
};

interface ScoreCardProps {
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
  isDarkMode: boolean;
  debugMode: boolean;
  formula?: string;
  description?: string;
}

const ScoreCard: React.FC<ScoreCardProps> = ({
  label,
  value,
  icon: Icon,
  color,
  isDarkMode,
  debugMode,
  formula,
  description,
}) => {
  return (
    <div className={cn(
      "flex flex-col p-2 rounded",
      isDarkMode ? "bg-zinc-900/50" : "bg-zinc-100"
    )}>
      <div className="flex items-center gap-1 mb-1">
        <Icon size={12} className={color} />
        <span className={cn(
          "text-xs",
          isDarkMode ? "text-zinc-400" : "text-zinc-500"
        )}>{label}</span>
      </div>
      <span className={cn("text-lg font-bold font-mono", color)}>
        {value}
      </span>
      {debugMode && (formula || description) && (
        <span className={cn(
          "text-[10px] mt-1",
          isDarkMode ? "text-zinc-500" : "text-zinc-400"
        )}>
          {formula || description}
        </span>
      )}
    </div>
  );
};
