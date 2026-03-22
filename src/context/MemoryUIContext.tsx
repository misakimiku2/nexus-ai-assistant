import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { RetrievedMemory } from '../types';
import { MemoryDebugLogEntry, MemoryDebugLogType } from '../components/MemoryPanel/types';

interface MemoryUIContextValue {
  debugMode: boolean;
  setDebugMode: (mode: boolean) => void;
  toggleDebugMode: () => void;
  
  currentHits: RetrievedMemory[];
  setCurrentHits: (hits: RetrievedMemory[]) => void;
  clearCurrentHits: () => void;
  
  debugLogs: MemoryDebugLogEntry[];
  addDebugLog: (type: MemoryDebugLogType, data: Record<string, unknown>) => void;
  clearDebugLogs: () => void;
  
  refreshTrigger: number;
  triggerRefresh: () => void;
}

const MemoryUIContext = createContext<MemoryUIContextValue | undefined>(undefined);

export const useMemoryUI = () => {
  const context = useContext(MemoryUIContext);
  if (!context) {
    throw new Error('useMemoryUI must be used within a MemoryUIProvider');
  }
  return context;
};

export const MemoryUIProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [debugMode, setDebugMode] = useState(false);
  const [currentHits, setCurrentHits] = useState<RetrievedMemory[]>([]);
  const [debugLogs, setDebugLogs] = useState<MemoryDebugLogEntry[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const toggleDebugMode = useCallback(() => {
    setDebugMode(prev => !prev);
  }, []);

  const clearCurrentHits = useCallback(() => {
    setCurrentHits([]);
  }, []);

  const addDebugLog = useCallback((type: MemoryDebugLogType, data: Record<string, unknown>) => {
    const entry: MemoryDebugLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      type,
      timestamp: Date.now(),
      data,
    };
    setDebugLogs(prev => [entry, ...prev].slice(0, 500));
  }, []);

  const clearDebugLogs = useCallback(() => {
    setDebugLogs([]);
  }, []);

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  return (
    <MemoryUIContext.Provider
      value={{
        debugMode,
        setDebugMode,
        toggleDebugMode,
        currentHits,
        setCurrentHits,
        clearCurrentHits,
        debugLogs,
        addDebugLog,
        clearDebugLogs,
        refreshTrigger,
        triggerRefresh,
      }}
    >
      {children}
    </MemoryUIContext.Provider>
  );
};
