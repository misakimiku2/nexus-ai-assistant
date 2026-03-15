import React from 'react';
import { cn } from '../lib/utils';

interface NexusLogoProps {
  className?: string;
  size?: number;
}

export const NexusLogo: React.FC<NexusLogoProps> = ({ className, size = 24 }) => {
  return (
    <div 
      className={cn("relative flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg 
        viewBox="0 0 100 100" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        <defs>
          <linearGradient id="nexus-grad-primary" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" /> {/* indigo-500 */}
            <stop offset="100%" stopColor="#a855f7" /> {/* purple-500 */}
          </linearGradient>
          <linearGradient id="nexus-grad-secondary" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" /> {/* emerald-500 */}
            <stop offset="100%" stopColor="#3b82f6" /> {/* blue-500 */}
          </linearGradient>
          <filter id="nexus-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Outer Ring / Orbit */}
        <circle 
          cx="50" cy="50" r="45" 
          stroke="currentColor" 
          strokeWidth="1" 
          strokeDasharray="4 4" 
          className="opacity-20"
        />

        {/* Connection Paths */}
        <path 
          d="M50 15 C70 15 85 30 85 50 C85 70 70 85 50 85" 
          stroke="url(#nexus-grad-primary)" 
          strokeWidth="6" 
          strokeLinecap="round"
          className="opacity-80"
        />
        <path 
          d="M50 85 C30 85 15 70 15 50 C15 30 30 15 50 15" 
          stroke="url(#nexus-grad-secondary)" 
          strokeWidth="6" 
          strokeLinecap="round"
          className="opacity-80"
        />

        {/* Central Nexus Core */}
        <circle 
          cx="50" cy="50" r="18" 
          fill="url(#nexus-grad-primary)" 
          filter="url(#nexus-glow)"
        />
        
        {/* Inner Core Detail */}
        <circle 
          cx="50" cy="50" r="8" 
          fill="white" 
          className="opacity-40"
        />

        {/* Floating Nodes */}
        <circle cx="50" cy="15" r="4" fill="#6366f1" />
        <circle cx="85" cy="50" r="4" fill="#a855f7" />
        <circle cx="50" cy="85" r="4" fill="#10b981" />
        <circle cx="15" cy="50" r="4" fill="#3b82f6" />
      </svg>
    </div>
  );
};
