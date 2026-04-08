import { useState, useEffect, useCallback, useRef } from 'react';
import { ChatSession, ChatFolder, Attachment, Message } from '../types';
import { getSessionStorage, SessionStorageService, StoredAttachment } from '../services/sessionStorage';

export interface UseSessionStorageResult {
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  storage: SessionStorageService | null;
  
  loadAllSessions: () => Promise<ChatSession[]>;
  loadSession: (id: string) => Promise<ChatSession | null>;
  saveSession: (session: ChatSession) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  batchDeleteSessions: (ids: string[]) => Promise<void>;
  
  loadAllFolders: () => Promise<ChatFolder[]>;
  saveFolder: (folder: ChatFolder) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  
  saveAttachment: (sessionId: string, messageId: string, attachment: Attachment) => Promise<StoredAttachment>;
  loadAttachment: (sessionId: string, attachmentId: string) => Promise<Attachment | null>;
  deleteAttachment: (sessionId: string, attachmentId: string) => Promise<void>;
  
  getStorageInfo: () => Promise<{ path?: string; sessionCount: number; totalSize?: number }>;
  
  exportSession: (id: string) => Promise<string>;
  importSession: (data: string) => Promise<ChatSession>;
}

export function useSessionStorage(): UseSessionStorageResult {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storage, setStorage] = useState<SessionStorageService | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    async function init() {
      try {
        setIsLoading(true);
        const storageService = await getSessionStorage();
        setStorage(storageService);
        setIsInitialized(true);
        console.log('[useSessionStorage] 存储服务初始化完成');
      } catch (err) {
        console.error('[useSessionStorage] 初始化失败:', err);
        setError(err instanceof Error ? err.message : '初始化存储服务失败');
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, []);

  const loadAllSessions = useCallback(async (): Promise<ChatSession[]> => {
    if (!storage) {
      console.warn('[useSessionStorage] 存储服务未初始化');
      return [];
    }
    
    try {
      const sessions = await storage.getAllSessions();
      console.log('[useSessionStorage] 加载了', sessions.length, '个会话');
      return sessions;
    } catch (err) {
      console.error('[useSessionStorage] 加载会话失败:', err);
      setError(err instanceof Error ? err.message : '加载会话失败');
      return [];
    }
  }, [storage]);

  const loadSession = useCallback(async (id: string): Promise<ChatSession | null> => {
    if (!storage) {
      return null;
    }
    
    try {
      return await storage.getSession(id);
    } catch (err) {
      console.error('[useSessionStorage] 加载会话失败:', err);
      setError(err instanceof Error ? err.message : '加载会话失败');
      return null;
    }
  }, [storage]);

  const saveSession = useCallback(async (session: ChatSession): Promise<void> => {
    if (!storage) {
      console.warn('[useSessionStorage] 存储服务未初始化，无法保存会话');
      return;
    }
    
    try {
      await storage.saveSession(session);
      console.log('[useSessionStorage] 会话已保存:', session.id);
    } catch (err) {
      console.error('[useSessionStorage] 保存会话失败:', err);
      setError(err instanceof Error ? err.message : '保存会话失败');
      throw err;
    }
  }, [storage]);

  const deleteSession = useCallback(async (id: string): Promise<void> => {
    if (!storage) {
      return;
    }
    
    try {
      await storage.deleteSession(id);
      console.log('[useSessionStorage] 会话已删除:', id);
    } catch (err) {
      console.error('[useSessionStorage] 删除会话失败:', err);
      setError(err instanceof Error ? err.message : '删除会话失败');
      throw err;
    }
  }, [storage]);

  const batchDeleteSessions = useCallback(async (ids: string[]): Promise<void> => {
    if (!storage) {
      return;
    }
    
    try {
      await storage.batchDeleteSessions(ids);
      console.log('[useSessionStorage] 批量删除了', ids.length, '个会话');
    } catch (err) {
      console.error('[useSessionStorage] 批量删除会话失败:', err);
      setError(err instanceof Error ? err.message : '批量删除会话失败');
      throw err;
    }
  }, [storage]);

  const loadAllFolders = useCallback(async (): Promise<ChatFolder[]> => {
    if (!storage) {
      return [];
    }
    
    try {
      return await storage.getAllFolders();
    } catch (err) {
      console.error('[useSessionStorage] 加载文件夹失败:', err);
      setError(err instanceof Error ? err.message : '加载文件夹失败');
      return [];
    }
  }, [storage]);

  const saveFolder = useCallback(async (folder: ChatFolder): Promise<void> => {
    if (!storage) {
      return;
    }
    
    try {
      await storage.saveFolder(folder);
    } catch (err) {
      console.error('[useSessionStorage] 保存文件夹失败:', err);
      setError(err instanceof Error ? err.message : '保存文件夹失败');
      throw err;
    }
  }, [storage]);

  const deleteFolder = useCallback(async (id: string): Promise<void> => {
    if (!storage) {
      return;
    }
    
    try {
      await storage.deleteFolder(id);
    } catch (err) {
      console.error('[useSessionStorage] 删除文件夹失败:', err);
      setError(err instanceof Error ? err.message : '删除文件夹失败');
      throw err;
    }
  }, [storage]);

  const saveAttachment = useCallback(async (
    sessionId: string,
    messageId: string,
    attachment: Attachment
  ): Promise<StoredAttachment> => {
    if (!storage) {
      throw new Error('存储服务未初始化');
    }
    
    try {
      const stored = await storage.saveAttachment(sessionId, messageId, attachment);
      console.log('[useSessionStorage] 附件已保存:', stored.id);
      return stored;
    } catch (err) {
      console.error('[useSessionStorage] 保存附件失败:', err);
      throw err;
    }
  }, [storage]);

  const loadAttachment = useCallback(async (
    sessionId: string,
    attachmentId: string
  ): Promise<Attachment | null> => {
    if (!storage) {
      return null;
    }
    
    try {
      return await storage.getAttachment(sessionId, attachmentId);
    } catch (err) {
      console.error('[useSessionStorage] 加载附件失败:', err);
      return null;
    }
  }, [storage]);

  const deleteAttachment = useCallback(async (
    sessionId: string,
    attachmentId: string
  ): Promise<void> => {
    if (!storage) {
      return;
    }
    
    try {
      await storage.deleteAttachment(sessionId, attachmentId);
    } catch (err) {
      console.error('[useSessionStorage] 删除附件失败:', err);
      throw err;
    }
  }, [storage]);

  const getStorageInfo = useCallback(async () => {
    if (!storage) {
      return { sessionCount: 0 };
    }
    
    try {
      return await storage.getStorageInfo();
    } catch (err) {
      console.error('[useSessionStorage] 获取存储信息失败:', err);
      return { sessionCount: 0 };
    }
  }, [storage]);

  const exportSession = useCallback(async (id: string): Promise<string> => {
    if (!storage) {
      throw new Error('存储服务未初始化');
    }

    try {
      const data = await storage.exportSession(id);
      console.log('[useSessionStorage] 会话已导出:', id);
      return data;
    } catch (err) {
      console.error('[useSessionStorage] 导出会话失败:', err);
      setError(err instanceof Error ? err.message : '导出会话失败');
      throw err;
    }
  }, [storage]);

  const importSession = useCallback(async (data: string): Promise<ChatSession> => {
    if (!storage) {
      throw new Error('存储服务未初始化');
    }

    try {
      const session = await storage.importSession(data);
      console.log('[useSessionStorage] 会话已导入:', session.id);
      return session;
    } catch (err) {
      console.error('[useSessionStorage] 导入会话失败:', err);
      setError(err instanceof Error ? err.message : '导入会话失败');
      throw err;
    }
  }, [storage]);

  return {
    isInitialized,
    isLoading,
    error,
    storage,
    loadAllSessions,
    loadSession,
    saveSession,
    deleteSession,
    batchDeleteSessions,
    loadAllFolders,
    saveFolder,
    deleteFolder,
    saveAttachment,
    loadAttachment,
    deleteAttachment,
    getStorageInfo,
    exportSession,
    importSession,
  };
}

export function createDebouncedSave(
  saveFn: (session: ChatSession) => Promise<void>,
  delay: number = 1000
): (session: ChatSession) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let pendingSession: ChatSession | null = null;

  return (session: ChatSession) => {
    pendingSession = session;
    
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(async () => {
      if (pendingSession) {
        try {
          await saveFn(pendingSession);
        } catch (err) {
          console.error('[DebouncedSave] 保存失败:', err);
        }
        pendingSession = null;
      }
      timeoutId = null;
    }, delay);
  };
}
