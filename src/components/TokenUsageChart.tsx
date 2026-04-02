import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { cn } from '../lib/utils';
import { ModelConfig, TokenUsageRecord } from '../types';

interface TokenUsageChartProps {
  isDarkMode: boolean;
  modelConfigs: ModelConfig[];
  tokenUsageRecords: TokenUsageRecord[];
  isLoading?: boolean;
  timeRange: 'day' | 'week' | 'month' | 'year';
  onTimeRangeChange: (range: 'day' | 'week' | 'month' | 'year') => void;
}

interface ChartDataPoint {
  time: string;
  fullTime?: string;
  [key: string]: number | string | undefined;
}

const COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#14b8a6',
  '#f97316',
  '#06b6d4',
  '#d936c0',
  '#9333ea',
  '#84cc16',
];

export const TokenUsageChart: React.FC<TokenUsageChartProps> = ({
  isDarkMode,
  modelConfigs,
  tokenUsageRecords,
  isLoading = false,
  timeRange,
  onTimeRangeChange,
}) => {
  const getTimeRangeConfig = () => {
    switch (timeRange) {
      case 'day':
        return { 
          points: 24, 
          intervalMs: 3600000,
          formatOptions: { hour: '2-digit', minute: '2-digit' } as Intl.DateTimeFormatOptions,
          fullFormatOptions: { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' } as Intl.DateTimeFormatOptions,
        };
      case 'week':
        return { 
          points: 7, 
          intervalMs: 86400000,
          formatOptions: { month: '2-digit', day: '2-digit' } as Intl.DateTimeFormatOptions,
          fullFormatOptions: { year: 'numeric', month: '2-digit', day: '2-digit' } as Intl.DateTimeFormatOptions,
        };
      case 'month':
        return { 
          points: 30, 
          intervalMs: 86400000,
          formatOptions: { month: '2-digit', day: '2-digit' } as Intl.DateTimeFormatOptions,
          fullFormatOptions: { year: 'numeric', month: '2-digit', day: '2-digit' } as Intl.DateTimeFormatOptions,
        };
      case 'year':
        return { 
          points: 12, 
          intervalMs: 0,
          formatOptions: { year: 'numeric', month: '2-digit' } as Intl.DateTimeFormatOptions,
          fullFormatOptions: { year: 'numeric', month: '2-digit' } as Intl.DateTimeFormatOptions,
        };
      default:
        return { 
          points: 24, 
          intervalMs: 3600000,
          formatOptions: { hour: '2-digit', minute: '2-digit' } as Intl.DateTimeFormatOptions,
          fullFormatOptions: { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' } as Intl.DateTimeFormatOptions,
        };
    }
  };

  const { modelIdToIndex, displayModels } = useMemo(() => {
    const allModelIdsInRecords = new Set(tokenUsageRecords.map(r => r.modelId));
    const map = new Map<string, number>();
    const models: typeof modelConfigs = [];
    
    const activeModels = modelConfigs.filter(m => m.status === 'active');
    
    if (activeModels.length > 0) {
      activeModels.forEach((m, i) => {
        map.set(m.id, i);
        if (m.modelId) {
          map.set(m.modelId, i);
        }
        models.push(m);
      });
    } else {
      modelConfigs.forEach((m, i) => {
        map.set(m.id, i);
        if (m.modelId) {
          map.set(m.modelId, i);
        }
        models.push(m);
      });
    }
    
    allModelIdsInRecords.forEach(modelId => {
      if (!map.has(modelId)) {
        const index = models.length;
        map.set(modelId, index);
        models.push({
          id: modelId,
          modelId: modelId,
          name: modelId,
          status: 'active',
          provider: 'lm-studio',
          apiUrl: '',
          maxContextLength: 4096,
          timeout: 60,
          rpm: 60,
          createdAt: Date.now(),
          priority: index,
        });
      }
    });
    
    return { modelIdToIndex: map, displayModels: models };
  }, [modelConfigs, tokenUsageRecords]);

  const chartData = useMemo((): ChartDataPoint[] => {
    const config = getTimeRangeConfig();
    const now = Date.now();
    const timeLabels: { startTime: number; endTime: number; label: string; fullLabel: string }[] = [];
    
    for (let i = config.points - 1; i >= 0; i--) {
      let startTime: number;
      let endTime: number;
      let date: Date;
      
      if (timeRange === 'day') {
        startTime = now - (i + 1) * config.intervalMs;
        endTime = now - i * config.intervalMs;
        date = new Date(endTime);
      } else if (timeRange === 'week' || timeRange === 'month') {
        startTime = now - (i + 1) * config.intervalMs;
        endTime = now - i * config.intervalMs;
        date = new Date(endTime);
      } else if (timeRange === 'year') {
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth();
        const currentYear = currentDate.getFullYear();
        
        let targetMonth = currentMonth - i;
        let targetYear = currentYear;
        
        while (targetMonth < 0) {
          targetMonth += 12;
          targetYear -= 1;
        }
        
        date = new Date(targetYear, targetMonth, 1);
        startTime = date.getTime();
        endTime = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999).getTime();
      } else {
        startTime = now - (i + 1) * config.intervalMs;
        endTime = now - i * config.intervalMs;
        date = new Date(endTime);
      }
      
      timeLabels.push({
        startTime,
        endTime,
        label: date.toLocaleString('zh-CN', config.formatOptions),
        fullLabel: date.toLocaleString('zh-CN', config.fullFormatOptions),
      });
    }

    const data: ChartDataPoint[] = timeLabels.map(({ startTime, endTime, label, fullLabel }) => {
      const point: ChartDataPoint = { time: label, fullTime: fullLabel };
      
      displayModels.forEach((_, index) => {
        point[`model_${index}`] = null;
      });
      
      const recordsInRange = tokenUsageRecords.filter(
        r => r.timestamp >= startTime && r.timestamp <= endTime
      );
      
      recordsInRange.forEach(record => {
        const modelIndex = modelIdToIndex.get(record.modelId);
        if (modelIndex !== undefined) {
          const key = `model_${modelIndex}`;
          const currentValue = point[key];
          point[key] = (currentValue === null ? 0 : currentValue as number) + record.inputTokens + record.outputTokens;
        }
      });
      
      return point;
    });

    return data;
  }, [tokenUsageRecords, timeRange, displayModels, modelIdToIndex]);

  const modelNames = useMemo(() => {
    return displayModels.map((m, i) => ({ 
      id: m.id,
      name: m.name, 
      color: COLORS[i % COLORS.length], 
      dataKey: `model_${i}` 
    }));
  }, [displayModels]);

  const stats = useMemo(() => {
    const now = Date.now();
    let startTime: number;
    
    switch (timeRange) {
      case 'day':
        startTime = now - 24 * 60 * 60 * 1000;
        break;
      case 'week':
        startTime = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case 'month':
        startTime = now - 30 * 24 * 60 * 60 * 1000;
        break;
      case 'year':
        startTime = now - 365 * 24 * 60 * 60 * 1000;
        break;
      default:
        startTime = 0;
    }
    
    const filteredRecords = tokenUsageRecords.filter(r => r.timestamp >= startTime);
    
    return {
      totalInputTokens: filteredRecords.reduce((sum, r) => sum + r.inputTokens, 0),
      totalOutputTokens: filteredRecords.reduce((sum, r) => sum + r.outputTokens, 0),
      totalCost: filteredRecords.reduce((sum, r) => sum + r.cost, 0),
    };
  }, [tokenUsageRecords, timeRange]);

  const hasData = useMemo(() => {
    return chartData.some(point => 
      Object.entries(point).some(([key, value]) => 
        key.startsWith('model_') && typeof value === 'number' && value > 0
      )
    );
  }, [chartData]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const total = payload.reduce((sum: number, entry: any) => sum + (entry.value || 0), 0);
      
      return (
        <div className={cn(
          "px-3 py-2 rounded-lg shadow-lg max-w-xs",
          isDarkMode ? "bg-zinc-800 text-zinc-200 border border-zinc-700" : "bg-white text-zinc-900 border border-zinc-200"
        )}>
          <p className="text-xs font-medium mb-1">{payload[0]?.payload?.fullTime || label}</p>
          {payload.map((entry: any, index: number) => (
            entry.value > 0 && (
              <p key={index} className="text-sm flex items-center gap-2">
                <span 
                  className="w-2 h-2 rounded-full" 
                  style={{ backgroundColor: entry.color }}
                />
                {entry.name}: <span className="font-mono">{(entry.value as number).toLocaleString()}</span> tokens
              </p>
            )
          ))}
          {payload.length > 1 && (
            <p className="text-sm font-medium mt-1 pt-1 border-t border-zinc-600">
              总计: <span className="font-mono">{total.toLocaleString()}</span> tokens
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  if (modelNames.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h4 className={cn(
            "text-sm font-medium",
            isDarkMode ? "text-zinc-200" : "text-zinc-900"
          )}>
            Token 使用统计
          </h4>
          <div className="flex gap-1">
            {(['day', 'week', 'month', 'year']).map((range) => (
              <button
                key={range}
                onClick={() => onTimeRangeChange(range as 'day' | 'week' | 'month' | 'year')}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-medium transition-colors",
                  timeRange === range
                    ? "bg-indigo-500 text-white"
                    : isDarkMode
                      ? "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                      : "bg-zinc-200 text-zinc-600 hover:bg-zinc-300"
                )}
              >
                {range === 'day' ? '天' : range === 'week' ? '周' : range === 'month' ? '月' : '年'}
              </button>
            ))}
          </div>
        </div>

        <div className={cn(
          "h-64 rounded-xl p-4 flex items-center justify-center",
          isDarkMode ? "bg-zinc-800/50" : "bg-zinc-50"
        )}>
          <p className={cn(
            "text-sm",
            isDarkMode ? "text-zinc-500" : "text-zinc-400"
          )}>
            暂无可用模型，请先添加并启用模型
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h4 className={cn(
          "text-sm font-medium",
          isDarkMode ? "text-zinc-200" : "text-zinc-900"
        )}>
          Token 使用统计
        </h4>
        <div className="flex gap-1">
          {(['day', 'week', 'month', 'year']).map((range) => (
            <button
              key={range}
              onClick={() => onTimeRangeChange(range as 'day' | 'week' | 'month' | 'year')}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-medium transition-colors",
                timeRange === range
                  ? "bg-indigo-500 text-white"
                  : isDarkMode
                    ? "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                    : "bg-zinc-200 text-zinc-600 hover:bg-zinc-300"
              )}
            >
              {range === 'day' ? '天' : range === 'week' ? '周' : range === 'month' ? '月' : '年'}
            </button>
          ))}
        </div>
      </div>

      <div className={cn(
        "h-72 rounded-xl p-4 relative [&_svg]:focus:outline-none",
        isDarkMode ? "bg-zinc-800/50" : "bg-zinc-50"
      )}>
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className={cn(
                "text-xs",
                isDarkMode ? "text-zinc-400" : "text-zinc-500"
              )}>
                正在加载数据...
              </p>
            </div>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={280} className="[&_svg]:focus:outline-none">
              <LineChart 
                data={chartData} 
                margin={{ left: -25, right: 10, top: 5, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#374151' : '#e5e7eb'} />
                <XAxis 
                  dataKey="time" 
                  tick={{ fill: isDarkMode ? '#71717a' : '#a1a1aa', fontSize: 10, angle: -45, textAnchor: 'end' }}
                  tickLine={{ stroke: isDarkMode ? '#374151' : '#e5e7eb' }}
                  axisLine={{ stroke: isDarkMode ? '#374151' : '#e5e7eb' }}
                  height={60}
                  interval={0}
                  allowDuplicatedCategory={false}
                />
                <YAxis 
                  tick={{ fill: isDarkMode ? '#71717a' : '#a1a1aa', fontSize: 10 }}
                  tickLine={{ stroke: isDarkMode ? '#374151' : '#e5e7eb' }}
                  axisLine={{ stroke: isDarkMode ? '#374151' : '#e5e7eb' }}
                  tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}K` : value}
                />
                <Tooltip content={<CustomTooltip />} />
                {modelNames.map((model) => (
                  <Line
                    key={model.dataKey}
                    type="monotone"
                    dataKey={model.dataKey}
                    name={model.name}
                    stroke={model.color}
                    strokeWidth={2}
                    dot={{ r: 3, strokeWidth: 2, fill: model.color }}
                    activeDot={{ r: 5, strokeWidth: 2, fill: model.color }}
                    isAnimationActive={true}
                    animationDuration={500}
                    animationEasing="ease-out"
                    connectNulls={true}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
            
            {!hasData && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p className={cn(
                  "text-xs",
                  isDarkMode ? "text-zinc-600" : "text-zinc-400"
                )}>
                  暂无使用数据
                </p>
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex items-center justify-between pt-4">
        <div className="flex flex-wrap gap-4">
          {modelNames.map((model) => (
            <div key={model.name} className="flex items-center gap-2.5">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: model.color }}
              />
              <span className={cn(
                "text-xs",
                isDarkMode ? "text-zinc-300" : "text-zinc-600"
              )}>
                {model.name}
              </span>
            </div>
          ))}
        </div>
        
        <div className="text-right">
          <p className={cn(
            "text-xs",
            isDarkMode ? "text-zinc-400" : "text-zinc-500"
          )}>
            总消耗: <span className="font-mono font-bold">{(stats.totalInputTokens + stats.totalOutputTokens).toLocaleString()}</span> tokens
          </p>
          <p className={cn(
            "text-xs mt-1",
            isDarkMode ? "text-zinc-300" : "text-zinc-600"
          )}>
            预估费用: ${stats.totalCost.toFixed(4)} 美元
          </p>
        </div>
      </div>
    </div>
  );
};
