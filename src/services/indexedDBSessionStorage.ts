import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { ChatSession, ChatFolder, Attachment, Message } from '../types';
import { SessionStorageService, SessionMetadata, StoredAttachment } from './sessionStorage';

interface SessionDBSchema extends DBSchema {
  sessions: {
    key: string;
    value: {
      id: string;
      title: string;
      updatedAt: number;
      folderId?: string;
      activeAgents?: string[];
    };
    indexes: {
      'by-updated': number;
      'by-folder': string;
    };
  };
  
  messages: {
    key: string;
    value: Message & { sessionId: string };
    indexes: {
      'by-session': string;
      'by-session-time': [string, number];
    };
  };
  
  folders: {
    key: string;
    value: ChatFolder;
  };
  
  attachments: {
    key: string;
    value: {
      id: string;
      sessionId: string;
      messageId: string;
      type: 'image' | 'document';
      name: string;
      data: Blob;
      mimeType: string;
      size: number;
    };
    indexes: {
      'by-session': string;
    };
  };
}

const DB_NAME = 'nexus-sessions';
const DB_VERSION = 1;

export class IndexedDBSessionStorage implements SessionStorageService {
  private db: IDBPDatabase<SessionDBSchema> | null = null;
  private initialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.db = await openDB<SessionDBSchema>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains('sessions')) {
            const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
            sessionStore.createIndex('by-updated', 'updatedAt');
            sessionStore.createIndex('by-folder', 'folderId');
          }

          if (!db.objectStoreNames.contains('messages')) {
            const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
            messageStore.createIndex('by-session', 'sessionId');
            messageStore.createIndex('by-session-time', ['sessionId', 'timestamp']);
          }

          if (!db.objectStoreNames.contains('folders')) {
            db.createObjectStore('folders', { keyPath: 'id' });
          }

          if (!db.objectStoreNames.contains('attachments')) {
            const attachmentStore = db.createObjectStore('attachments', { keyPath: 'id' });
            attachmentStore.createIndex('by-session', 'sessionId');
          }
        },
      });

      this.initialized = true;
      console.log('[IndexedDBSessionStorage] 初始化完成');
    } catch (error) {
      console.error('[IndexedDBSessionStorage] 初始化失败:', error);
      throw error;
    }
  }

  private ensureDb(): IDBPDatabase<SessionDBSchema> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }

  async getAllSessions(): Promise<ChatSession[]> {
    const db = this.ensureDb();
    
    const sessionMetas = await db.getAll('sessions');
    const sessions: ChatSession[] = [];

    for (const meta of sessionMetas) {
      const messages = await this.getMessages(meta.id);
      sessions.push({
        ...meta,
        messages,
      });
    }

    return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getSession(id: string): Promise<ChatSession | null> {
    const db = this.ensureDb();
    
    const meta = await db.get('sessions', id);
    if (!meta) {
      return null;
    }

    const messages = await this.getMessages(id);

    return {
      ...meta,
      messages,
    };
  }

  async getSessionMetadata(id: string): Promise<SessionMetadata | null> {
    const db = this.ensureDb();
    
    const meta = await db.get('sessions', id);
    if (!meta) {
      return null;
    }

    const messages = await this.getMessages(id);

    return {
      id: meta.id,
      title: meta.title,
      updatedAt: meta.updatedAt,
      folderId: meta.folderId,
      activeAgents: meta.activeAgents,
      messageCount: messages.length,
    };
  }

  async saveSession(session: ChatSession): Promise<void> {
    const db = this.ensureDb();
    
    const { messages, ...meta } = session;

    await db.put('sessions', meta);

    const tx = db.transaction('messages', 'readwrite');
    const existingMessages = await tx.store.index('by-session').getAll(session.id);
    
    for (const msg of existingMessages) {
      await tx.store.delete(msg.id);
    }

    for (const message of messages) {
      await tx.store.put({ ...message, sessionId: session.id });
    }
    await tx.done;
  }

  async saveSessionMetadata(session: ChatSession): Promise<void> {
    const db = this.ensureDb();
    
    const { messages, ...meta } = session;
    await db.put('sessions', meta);
  }

  async deleteSession(id: string): Promise<void> {
    const db = this.ensureDb();
    
    await db.delete('sessions', id);

    const tx = db.transaction('messages', 'readwrite');
    const messages = await tx.store.index('by-session').getAll(IDBKeyRange.only(id));
    for (const msg of messages) {
      await tx.store.delete(msg.id);
    }
    await tx.done;

    await this.deleteSessionAttachments(id);
  }

  async batchDeleteSessions(ids: string[]): Promise<void> {
    const db = this.ensureDb();
    
    for (const id of ids) {
      await this.deleteSession(id);
    }
  }

  async getAllFolders(): Promise<ChatFolder[]> {
    const db = this.ensureDb();
    return db.getAll('folders');
  }

  async saveFolder(folder: ChatFolder): Promise<void> {
    const db = this.ensureDb();
    await db.put('folders', folder);
  }

  async deleteFolder(id: string): Promise<void> {
    const db = this.ensureDb();
    await db.delete('folders', id);
  }

  async saveAttachment(sessionId: string, messageId: string, attachment: Attachment): Promise<StoredAttachment> {
    const db = this.ensureDb();
    
    const base64Data = this.extractBase64Data(attachment.data);
    const blob = this.base64ToBlob(base64Data, attachment.mimeType);

    const stored = {
      id: attachment.id,
      sessionId,
      messageId,
      type: attachment.type,
      name: attachment.name,
      data: blob,
      mimeType: attachment.mimeType,
      size: attachment.size || blob.size,
    };

    await db.put('attachments', stored);

    return {
      id: attachment.id,
      sessionId,
      messageId,
      type: attachment.type,
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: stored.size,
      storageKey: attachment.id,
    };
  }

  async getAttachment(sessionId: string, attachmentId: string): Promise<Attachment | null> {
    const db = this.ensureDb();
    
    const stored = await db.get('attachments', attachmentId);
    
    if (!stored || stored.sessionId !== sessionId) {
      return null;
    }

    const base64 = await this.blobToBase64(stored.data);

    return {
      id: stored.id,
      type: stored.type,
      name: stored.name,
      data: `data:${stored.mimeType};base64,${base64}`,
      mimeType: stored.mimeType,
      size: stored.size,
    };
  }

  async deleteAttachment(sessionId: string, attachmentId: string): Promise<void> {
    const db = this.ensureDb();
    
    const stored = await db.get('attachments', attachmentId);
    if (stored && stored.sessionId === sessionId) {
      await db.delete('attachments', attachmentId);
    }
  }

  async deleteSessionAttachments(sessionId: string): Promise<void> {
    const db = this.ensureDb();
    
    const tx = db.transaction('attachments', 'readwrite');
    const attachments = await tx.store.index('by-session').getAll(IDBKeyRange.only(sessionId));
    
    for (const att of attachments) {
      await tx.store.delete(att.id);
    }
    await tx.done;
  }

  async getMessages(sessionId: string): Promise<Message[]> {
    const db = this.ensureDb();
    
    const messages = await db.getAllFromIndex('messages', 'by-session', sessionId);
    return messages.sort((a, b) => a.timestamp - b.timestamp);
  }

  async saveMessage(sessionId: string, message: Message): Promise<void> {
    const db = this.ensureDb();
    await db.put('messages', { ...message, sessionId });
  }

  async updateMessage(sessionId: string, message: Message): Promise<void> {
    const db = this.ensureDb();
    await db.put('messages', { ...message, sessionId });
  }

  async deleteMessage(sessionId: string, messageId: string): Promise<void> {
    const db = this.ensureDb();
    await db.delete('messages', messageId);
  }

  async getStorageInfo(): Promise<{ path?: string; sessionCount: number; totalSize?: number }> {
    const db = this.ensureDb();
    
    const sessions = await db.getAll('sessions');
    
    return {
      sessionCount: sessions.length,
    };
  }

  async exportSession(id: string): Promise<string> {
    const session = await this.getSession(id);
    if (!session) {
      throw new Error('Session not found');
    }

    const db = this.ensureDb();
    const attachments = await db.getAllFromIndex('attachments', 'by-session', id);
    
    const attachmentsData: { [key: string]: string } = {};
    for (const att of attachments) {
      const base64 = await this.blobToBase64(att.data);
      attachmentsData[att.id] = base64;
    }

    const exportData = {
      version: 1,
      exportedAt: Date.now(),
      session,
      attachments: attachmentsData,
    };

    return JSON.stringify(exportData, null, 2);
  }

  async importSession(data: string): Promise<ChatSession> {
    const importData = JSON.parse(data);
    
    if (importData.version !== 1) {
      throw new Error('Unsupported export version');
    }

    const db = this.ensureDb();
    
    const session: ChatSession = {
      ...importData.session,
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      updatedAt: Date.now(),
    };

    await this.saveSession(session);

    if (importData.attachments) {
      for (const [attId, base64] of Object.entries(importData.attachments)) {
        const originalAtt = importData.session.messages
          .flatMap((m: Message) => m.attachments || [])
          .find((a: Attachment) => a.id === attId);
        
        if (originalAtt) {
          const blob = this.base64ToBlob(base64 as string, originalAtt.mimeType);
          await db.put('attachments', {
            id: attId,
            sessionId: session.id,
            messageId: '',
            type: originalAtt.type,
            name: originalAtt.name,
            data: blob,
            mimeType: originalAtt.mimeType,
            size: blob.size,
          });
        }
      }
    }

    return session;
  }

  private extractBase64Data(dataUrl: string): string {
    const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
    if (match) {
      return match[1];
    }
    return dataUrl;
  }

  private base64ToBlob(base64: string, mimeType: string): Blob {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        const match = base64.match(/^data:[^;]+;base64,(.+)$/);
        resolve(match ? match[1] : base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}
