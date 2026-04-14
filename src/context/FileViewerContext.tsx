import React, { createContext, useContext, useState, useCallback } from 'react';

export interface FileTab {
  id: string;
  path: string;
  title: string;
  content: string;
  originalContent: string;
  isDirty: boolean;
  language: string;
  readOnly: boolean;
}

interface FileViewerState {
  tabs: FileTab[];
  activeTabId: string | null;
  openFile: (path: string, content?: string) => Promise<void>;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTabContent: (id: string, content: string) => void;
  saveTab: (id: string) => Promise<void>;
  saveAllDirty: () => Promise<void>;
}

interface FileViewerProviderProps {
  children: React.ReactNode;
  onFileOpen?: () => void;
}

const FileViewerContext = createContext<FileViewerState | undefined>(undefined);

export const useFileViewer = () => {
  const ctx = useContext(FileViewerContext);
  if (!ctx) throw new Error('useFileViewer must be used within FileViewerProvider');
  return ctx;
};

function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', go: 'go', java: 'java', c: 'c', cpp: 'cpp',
    h: 'c', hpp: 'cpp', cs: 'csharp', rb: 'ruby', php: 'php', swift: 'swift',
    kt: 'kotlin', scala: 'scala', r: 'r', sql: 'sql',
    html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less',
    json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml', xml: 'xml',
    md: 'markdown', markdown: 'markdown', txt: 'text',
    sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash',
    dockerfile: 'dockerfile', makefile: 'makefile',
    gitignore: 'plaintext', env: 'plaintext',
    svg: 'xml', ini: 'ini', cfg: 'ini', conf: 'ini',
  };
  if (ext === 'gitignore' || ext === 'dockerfile' || ext === 'makefile') return map[ext];
  return map[ext] || 'plaintext';
}

function getFileName(path: string): string {
  return path.replace(/\\/g, '/').split('/').pop() || path;
}

export const FileViewerProvider: React.FC<FileViewerProviderProps> = ({ children, onFileOpen }) => {
  const [tabs, setTabs] = useState<FileTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const openFile = useCallback(async (path: string, content?: string) => {
    onFileOpen?.();

    const existingTab = tabs.find(t => t.path === path);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      return;
    }

    let fileContent = content || '';
    let readOnly = false;
    const isUntitled = path === 'untitled' || !path.includes('/') && !path.includes('\\');

    if (!content && !isUntitled) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const result = await invoke<{ content: string; size: number }>('read_file', {
          path,
          encoding: 'utf-8',
        });
        fileContent = result.content;
      } catch {
        try {
          const response = await fetch(`file:///${path.replace(/\\/g, '/')}`);
          fileContent = await response.text();
        } catch {
          fileContent = `[无法读取文件: ${path}]`;
          readOnly = true;
        }
      }
    }

    const newTab: FileTab = {
      id: `file_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      path: isUntitled ? '' : path,
      title: isUntitled ? `未命名 ${tabs.length + 1}` : getFileName(path),
      content: fileContent,
      originalContent: fileContent,
      isDirty: false,
      language: isUntitled ? 'plaintext' : getLanguageFromPath(path),
      readOnly: isUntitled ? false : readOnly,
    };

    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }, [tabs, onFileOpen]);

  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      const newTabs = prev.filter(t => t.id !== id);
      if (activeTabId === id) {
        setActiveTabId(newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null);
      }
      return newTabs;
    });
  }, [activeTabId]);

  const setActiveTab = useCallback((id: string) => {
    setActiveTabId(id);
  }, []);

  const updateTabContent = useCallback((id: string, content: string) => {
    setTabs(prev => prev.map(t => {
      if (t.id !== id) return t;
      return { ...t, content, isDirty: content !== t.originalContent };
    }));
  }, []);

  const saveTab = useCallback(async (id: string) => {
    const tab = tabs.find(t => t.id === id);
    if (!tab || tab.readOnly) return;

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('write_file', {
        path: tab.path,
        content: tab.content,
        encoding: 'utf-8',
      });
      setTabs(prev => prev.map(t => {
        if (t.id !== id) return t;
        return { ...t, originalContent: t.content, isDirty: false };
      }));
    } catch (error) {
      console.error('Failed to save file:', error);
      throw error;
    }
  }, [tabs]);

  const saveAllDirty = useCallback(async () => {
    for (const tab of tabs) {
      if (tab.isDirty && !tab.readOnly) {
        await saveTab(tab.id);
      }
    }
  }, [tabs, saveTab]);

  return (
    <FileViewerContext.Provider value={{
      tabs,
      activeTabId,
      openFile,
      closeTab,
      setActiveTab,
      updateTabContent,
      saveTab,
      saveAllDirty,
    }}>
      {children}
    </FileViewerContext.Provider>
  );
};
