import React from 'react';
import { cn } from '../lib/utils';

interface NexusLogoProps {
  className?: string;
  size?: number;
}

export const NexusLogo: React.FC<NexusLogoProps> = ({ className, size = 24 }) => {
  return (
    <img 
      src="/logo.svg" 
      alt="Nexus Logo"
      className={cn("object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
};
