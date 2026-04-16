import React, { createContext, useContext, useState, useCallback } from 'react';

export interface TerminalEntry {
  id: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  timestamp: number;
}

interface TerminalState {
  entries: TerminalEntry[];
  isOpen: boolean;
  addEntry: (entry: Omit<TerminalEntry, 'id'>) => void;
  clearEntries: () => void;
  setIsOpen: (open: boolean) => void;
}

interface TerminalProviderProps {
  children: React.ReactNode;
}

const TerminalContext = createContext<TerminalState | undefined>(undefined);

export const useTerminal = () => {
  const ctx = useContext(TerminalContext);
  if (!ctx) throw new Error('useTerminal must be used within TerminalProvider');
  return ctx;
};

export const TerminalProvider: React.FC<TerminalProviderProps> = ({ children }) => {
  const [entries, setEntries] = useState<TerminalEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const addEntry = useCallback((entry: Omit<TerminalEntry, 'id'>) => {
    const newEntry: TerminalEntry = {
      ...entry,
      id: `term_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    };
    setEntries(prev => [...prev, newEntry]);
  }, []);

  const clearEntries = useCallback(() => {
    setEntries([]);
  }, []);

  return (
    <TerminalContext.Provider value={{
      entries,
      isOpen,
      addEntry,
      clearEntries,
      setIsOpen,
    }}>
      {children}
    </TerminalContext.Provider>
  );
};
