import React from 'react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

interface AgentRadarChartProps {
  temperature: number;
  toolsCount: number;
  knowledgeFoldersCount: number;
  backstoryLength: number;
  isDarkMode: boolean;
}

const AgentRadarChart: React.FC<AgentRadarChartProps> = ({
  temperature,
  toolsCount,
  knowledgeFoldersCount,
  backstoryLength,
  isDarkMode
}) => {
  // Normalize values to 0-1
  const logic = Math.max(0, 1 - temperature);
  const tools = Math.min(toolsCount / 5, 1); // Assuming 5 tools max
  const knowledge = Math.min(knowledgeFoldersCount / 3, 1); // Assuming 3 folders max
  const backstory = Math.min(backstoryLength / 500, 1);
  const execution = 0.7; // Fixed execution power

  const labels = ['逻辑', '工具', '知识', '背景', '执行'];
  const data = [logic, tools, knowledge, backstory, execution];
  
  const points = data.map((val, i) => {
    const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
    const radius = val * 60; // Reduced radius to make space for labels
    return `${Math.cos(angle) * radius + 100},${Math.sin(angle) * radius + 100}`;
  }).join(' ');

  return (
    <div className="relative w-64 h-64 mx-auto">
      <svg viewBox="0 0 200 200" className="w-full h-full">
        {/* Background grid */}
        {Array.from({ length: 3 }).map((_, level) => {
          const scale = (level + 1) / 3;
          const radius = 60 * scale;
          return (
            <polygon
              key={level}
              points={Array.from({ length: 5 }).map((_, i) => {
                const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
                return `${Math.cos(angle) * radius + 100},${Math.sin(angle) * radius + 100}`;
              }).join(' ')}
              className={cn("fill-none stroke-zinc-500/20", isDarkMode ? "stroke-zinc-700" : "stroke-zinc-300")}
              strokeWidth="1"
            />
          );
        })}
        
        {/* Radial lines */}
        {Array.from({ length: 5 }).map((_, i) => {
          const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
          const x = Math.cos(angle) * 60 + 100;
          const y = Math.sin(angle) * 60 + 100;
          return (
            <line
              key={i}
              x1="100"
              y1="100"
              x2={x}
              y2={y}
              className={cn("stroke-zinc-500/20", isDarkMode ? "stroke-zinc-700" : "stroke-zinc-300")}
              strokeWidth="1"
            />
          );
        })}
        
        {/* Data polygon */}
        <motion.polygon
          initial={{ points: "100,100 100,100 100,100 100,100 100,100" }}
          animate={{ points: points }}
          transition={{ type: "spring", stiffness: 100, damping: 20 }}
          className="fill-blue-500/20 stroke-blue-500"
          strokeWidth="1.5"
        />

        {/* Labels */}
        {labels.map((label, i) => {
          const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
          const x = Math.cos(angle) * 80 + 100;
          const y = Math.sin(angle) * 80 + 100;
          return (
            <text
              key={label}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              className={cn("text-[10px] font-bold", isDarkMode ? "fill-zinc-400" : "fill-zinc-600")}
            >
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
};

export default AgentRadarChart;
