import { ChatSession, ChatFolder, Attachment, Message } from '../types';

export interface SessionMetadata {
  id: string;
  title: string;
  updatedAt: number;
  folderId?: string;
  activeAgents?: string[];
  messageCount: number;
}

export interface StoredAttachment {
  id: string;
  sessionId: string;
  messageId: string;
  type: 'image' | 'document';
  name: string;
  mimeType: string;
  size: number;
  storagePath?: string;
  storageKey?: string;
}

export interface SessionStorageService {
  initialize(): Promise<void>;
  
  getAllSessions(): Promise<ChatSession[]>;
  getSession(id: string): Promise<ChatSession | null>;
  getSessionMetadata(id: string): Promise<SessionMetadata | null>;
  saveSession(session: ChatSession): Promise<void>;
  saveSessionMetadata(session: ChatSession): Promise<void>;
  deleteSession(id: string): Promise<void>;
  batchDeleteSessions(ids: string[]): Promise<void>;
  
  getAllFolders(): Promise<ChatFolder[]>;
  saveFolder(folder: ChatFolder): Promise<void>;
  deleteFolder(id: string): Promise<void>;
  
  saveAttachment(sessionId: string, messageId: string, attachment: Attachment): Promise<StoredAttachment>;
  getAttachment(sessionId: string, attachmentId: string): Promise<Attachment | null>;
  deleteAttachment(sessionId: string, attachmentId: string): Promise<void>;
  deleteSessionAttachments(sessionId: string): Promise<void>;
  
  getMessages(sessionId: string): Promise<Message[]>;
  saveMessage(sessionId: string, message: Message): Promise<void>;
  updateMessage(sessionId: string, message: Message): Promise<void>;
  deleteMessage(sessionId: string, messageId: string): Promise<void>;
  
  getStorageInfo(): Promise<{ path?: string; sessionCount: number; totalSize?: number }>;
  
  exportSession(id: string): Promise<string>;
  importSession(data: string): Promise<ChatSession>;
}

let storageServiceInstance: SessionStorageService | null = null;
let isTauriEnv: boolean | null = null;

async function checkTauriEnv(): Promise<boolean> {
  if (isTauriEnv !== null) return isTauriEnv;
  try {
    const { isTauri } = await import('@tauri-apps/api/core');
    isTauriEnv = isTauri();
    return isTauriEnv;
  } catch {
    isTauriEnv = false;
    return false;
  }
}

export async function getSessionStorage(): Promise<SessionStorageService> {
  if (storageServiceInstance) {
    return storageServiceInstance;
  }
  
  const isTauri = await checkTauriEnv();
  
  if (isTauri) {
    const { TauriSessionStorage } = await import('./tauriSessionStorage');
    storageServiceInstance = new TauriSessionStorage();
  } else {
    const { IndexedDBSessionStorage } = await import('./indexedDBSessionStorage');
    storageServiceInstance = new IndexedDBSessionStorage();
  }
  
  await storageServiceInstance.initialize();
  
  return storageServiceInstance;
}

export function resetStorageService(): void {
  storageServiceInstance = null;
}
