import { appDataDir, join } from '@tauri-apps/api/path';
import { mkdir, exists, readFile, writeFile, remove, readDir } from '@tauri-apps/plugin-fs';
import { ChatSession, ChatFolder, Attachment, Message } from '../types';
import { SessionStorageService, SessionMetadata, StoredAttachment } from './sessionStorage';

const DATA_DIR = 'nexus-ai-assistant';
const SESSIONS_DIR = 'sessions';
const ATTACHMENTS_DIR = 'attachments';
const SESSIONS_FILE = 'sessions.json';
const FOLDERS_FILE = 'folders.json';

export class TauriSessionStorage implements SessionStorageService {
  private dataDir: string = '';
  private sessionsDir: string = '';
  private attachmentsDir: string = '';
  private initialized: boolean = false;
  private writeQueue: Map<string, Promise<void>> = new Map();

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const appDataPath = await appDataDir();
      this.dataDir = await join(appDataPath, DATA_DIR);
      this.sessionsDir = await join(this.dataDir, SESSIONS_DIR);
      this.attachmentsDir = await join(this.dataDir, ATTACHMENTS_DIR);

      if (!(await exists(this.dataDir))) {
        await mkdir(this.dataDir, { recursive: true });
      }

      if (!(await exists(this.sessionsDir))) {
        await mkdir(this.sessionsDir, { recursive: true });
      }

      if (!(await exists(this.attachmentsDir))) {
        await mkdir(this.attachmentsDir, { recursive: true });
      }

      this.initialized = true;
      console.log('[TauriSessionStorage] 初始化完成, 数据目录:', this.dataDir);
    } catch (error) {
      console.error('[TauriSessionStorage] 初始化失败:', error);
      throw error;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private async getSessionsFilePath(): Promise<string> {
    return join(this.sessionsDir, SESSIONS_FILE);
  }

  private async getFoldersFilePath(): Promise<string> {
    return join(this.sessionsDir, FOLDERS_FILE);
  }

  private async getSessionDir(sessionId: string): Promise<string> {
    return join(this.sessionsDir, sessionId);
  }

  private async getMessagesFilePath(sessionId: string): Promise<string> {
    return join(this.sessionsDir, sessionId, 'messages.json');
  }

  private async getMetaFilePath(sessionId: string): Promise<string> {
    return join(this.sessionsDir, sessionId, 'meta.json');
  }

  private async getAttachmentDir(sessionId: string): Promise<string> {
    return join(this.attachmentsDir, sessionId);
  }

  private async readJsonFile<T>(filePath: string, defaultValue: T): Promise<T> {
    try {
      if (!(await exists(filePath))) {
        return defaultValue;
      }
      const content = await readFile(filePath);
      const text = new TextDecoder().decode(content);
      try {
        return JSON.parse(text);
      } catch (parseError) {
        console.warn('[TauriSessionStorage] JSON 解析失败，尝试修复:', filePath, parseError);
        const repaired = this.tryRepairJson(text, defaultValue);
        if (repaired !== null) {
          try {
            await this.writeJsonFile(filePath, repaired);
            console.log('[TauriSessionStorage] 已修复损坏的文件:', filePath);
          } catch (writeError) {
            console.error('[TauriSessionStorage] 修复文件写入失败:', filePath, writeError);
          }
          return repaired;
        }
        try {
          await this.writeJsonFile(filePath, defaultValue);
          console.log('[TauriSessionStorage] 已用默认值覆盖损坏的文件:', filePath);
        } catch (writeError) {
          console.error('[TauriSessionStorage] 覆盖文件写入失败:', filePath, writeError);
        }
        return defaultValue;
      }
    } catch (error) {
      console.error('[TauriSessionStorage] 读取文件失败:', filePath, error);
      return defaultValue;
    }
  }

  private tryRepairJson<T>(text: string, defaultValue: T): T | null {
    try {
      const isArray = Array.isArray(defaultValue);
      if (isArray) {
        const start = text.indexOf('[');
        const end = text.lastIndexOf(']');
        if (start !== -1 && end !== -1 && end > start) {
          const extracted = text.substring(start, end + 1);
          try {
            const parsed = JSON.parse(extracted);
            if (Array.isArray(parsed)) {
              return parsed as T;
            }
          } catch {
            const validItems: unknown[] = [];
            const objRegex = /\{\s*"/g;
            let match: RegExpExecArray | null;
            while ((match = objRegex.exec(extracted)) !== null) {
              const objStart = match.index;
              let depth = 0;
              let objEnd = -1;
              for (let i = objStart; i < extracted.length; i++) {
                if (extracted[i] === '{') depth++;
                else if (extracted[i] === '}') {
                  depth--;
                  if (depth === 0) {
                    objEnd = i;
                    break;
                  }
                }
              }
              if (objEnd !== -1) {
                const objStr = extracted.substring(objStart, objEnd + 1);
                try {
                  const obj = JSON.parse(objStr);
                  validItems.push(obj);
                } catch {
                  // skip corrupted object
                }
              }
            }
            if (validItems.length > 0) {
              return validItems as T;
            }
          }
        }
      } else {
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start !== -1 && end !== -1 && end > start) {
          const extracted = text.substring(start, end + 1);
          const parsed = JSON.parse(extracted);
          if (typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as T;
          }
        }
      }
    } catch {
      // repair failed
    }
    return null;
  }

  private async writeJsonFile<T>(filePath: string, data: T): Promise<void> {
    const existingWrite = this.writeQueue.get(filePath);
    if (existingWrite) {
      await existingWrite;
    }

    const writePromise = this._writeJsonFile(filePath, data);
    this.writeQueue.set(filePath, writePromise);

    try {
      await writePromise;
    } finally {
      this.writeQueue.delete(filePath);
    }
  }

  private async _writeJsonFile<T>(filePath: string, data: T): Promise<void> {
    try {
      const content = new TextEncoder().encode(JSON.stringify(data, null, 2));
      await writeFile(filePath, content);
    } catch (error) {
      console.error('[TauriSessionStorage] 写入文件失败:', filePath, error);
      throw error;
    }
  }

  async getAllSessions(): Promise<ChatSession[]> {
    await this.ensureInitialized();
    
    const sessionsPath = await this.getSessionsFilePath();
    const sessionsMetadata = await this.readJsonFile<SessionMetadata[]>(sessionsPath, []);
    
    const sessions: ChatSession[] = [];
    for (const meta of sessionsMetadata) {
      const session = await this.getSession(meta.id);
      if (session) {
        sessions.push(session);
      }
    }
    
    return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getSession(id: string): Promise<ChatSession | null> {
    await this.ensureInitialized();
    
    const sessionDir = await this.getSessionDir(id);
    if (!(await exists(sessionDir))) {
      return null;
    }

    const metaPath = await getMetaFilePath(id);
    const messagesPath = await this.getMessagesFilePath(id);

    const meta = await this.readJsonFile<Omit<ChatSession, 'messages'> | null>(metaPath, null);
    if (!meta) {
      return null;
    }

    const messages = await this.readJsonFile<Message[]>(messagesPath, []);

    return {
      ...meta,
      messages,
    };
  }

  async getSessionMetadata(id: string): Promise<SessionMetadata | null> {
    await this.ensureInitialized();
    
    const metaPath = await this.getMetaFilePath(id);
    const meta = await this.readJsonFile<Omit<ChatSession, 'messages'> | null>(metaPath, null);
    
    if (!meta) {
      return null;
    }

    const messagesPath = await this.getMessagesFilePath(id);
    const messages = await this.readJsonFile<Message[]>(messagesPath, []);

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
    await this.ensureInitialized();
    
    const sessionDir = await this.getSessionDir(session.id);
    if (!(await exists(sessionDir))) {
      await mkdir(sessionDir, { recursive: true });
    }

    const { messages, ...meta } = session;

    const metaPath = await this.getMetaFilePath(session.id);
    const messagesPath = await this.getMessagesFilePath(session.id);

    await Promise.all([
      this.writeJsonFile(metaPath, meta),
      this.writeJsonFile(messagesPath, messages),
    ]);

    await this.updateSessionsIndex(session);
  }

  async saveSessionMetadata(session: ChatSession): Promise<void> {
    await this.ensureInitialized();
    
    const sessionDir = await this.getSessionDir(session.id);
    if (!(await exists(sessionDir))) {
      await mkdir(sessionDir, { recursive: true });
    }

    const { messages, ...meta } = session;
    const metaPath = await this.getMetaFilePath(session.id);
    
    await this.writeJsonFile(metaPath, meta);
    await this.updateSessionsIndex(session);
  }

  private async updateSessionsIndex(session: ChatSession): Promise<void> {
    const sessionsPath = await this.getSessionsFilePath();
    const sessionsMetadata = await this.readJsonFile<SessionMetadata[]>(sessionsPath, []);
    
    const existingIndex = sessionsMetadata.findIndex(s => s.id === session.id);
    const newMetadata: SessionMetadata = {
      id: session.id,
      title: session.title,
      updatedAt: session.updatedAt,
      folderId: session.folderId,
      activeAgents: session.activeAgents,
      messageCount: session.messages?.length || 0,
    };

    if (existingIndex >= 0) {
      sessionsMetadata[existingIndex] = newMetadata;
    } else {
      sessionsMetadata.unshift(newMetadata);
    }

    sessionsMetadata.sort((a, b) => b.updatedAt - a.updatedAt);
    await this.writeJsonFile(sessionsPath, sessionsMetadata);
  }

  async deleteSession(id: string): Promise<void> {
    await this.ensureInitialized();
    
    const sessionDir = await this.getSessionDir(id);
    if (await exists(sessionDir)) {
      await remove(sessionDir, { recursive: true });
    }

    await this.deleteSessionAttachments(id);

    const sessionsPath = await this.getSessionsFilePath();
    const sessionsMetadata = await this.readJsonFile<SessionMetadata[]>(sessionsPath, []);
    const filtered = sessionsMetadata.filter(s => s.id !== id);
    await this.writeJsonFile(sessionsPath, filtered);
  }

  async batchDeleteSessions(ids: string[]): Promise<void> {
    await this.ensureInitialized();
    
    for (const id of ids) {
      await this.deleteSession(id);
    }
  }

  async getAllFolders(): Promise<ChatFolder[]> {
    await this.ensureInitialized();
    
    const foldersPath = await this.getFoldersFilePath();
    return this.readJsonFile<ChatFolder[]>(foldersPath, []);
  }

  async saveFolder(folder: ChatFolder): Promise<void> {
    await this.ensureInitialized();
    
    const foldersPath = await this.getFoldersFilePath();
    const folders = await this.getAllFolders();
    
    const existingIndex = folders.findIndex(f => f.id === folder.id);
    if (existingIndex >= 0) {
      folders[existingIndex] = folder;
    } else {
      folders.push(folder);
    }
    
    await this.writeJsonFile(foldersPath, folders);
  }

  async deleteFolder(id: string): Promise<void> {
    await this.ensureInitialized();
    
    const foldersPath = await this.getFoldersFilePath();
    const folders = await this.getAllFolders();
    const filtered = folders.filter(f => f.id !== id);
    await this.writeJsonFile(foldersPath, filtered);
  }

  async saveAttachment(sessionId: string, messageId: string, attachment: Attachment): Promise<StoredAttachment> {
    await this.ensureInitialized();
    
    const attachmentDir = await this.getAttachmentDir(sessionId);
    if (!(await exists(attachmentDir))) {
      await mkdir(attachmentDir, { recursive: true });
    }

    const extension = this.getFileExtension(attachment.name);
    const fileName = `${attachment.id}${extension}`;
    const filePath = await join(attachmentDir, fileName);

    const base64Data = this.extractBase64Data(attachment.data);
    const binaryData = this.base64ToUint8Array(base64Data);
    await writeFile(filePath, binaryData);

    const stored: StoredAttachment = {
      id: attachment.id,
      sessionId,
      messageId,
      type: attachment.type,
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size || binaryData.length,
      storagePath: filePath,
    };

    console.log('[TauriSessionStorage] 附件已保存:', filePath);
    return stored;
  }

  async getAttachment(sessionId: string, attachmentId: string): Promise<Attachment | null> {
    await this.ensureInitialized();
    
    const attachmentDir = await this.getAttachmentDir(sessionId);
    
    if (!(await exists(attachmentDir))) {
      return null;
    }

    const files = await readDir(attachmentDir);
    const targetFile = files.find(f => f.name.startsWith(attachmentId));
    
    if (!targetFile) {
      return null;
    }

    const filePath = await join(attachmentDir, targetFile.name);
    const content = await readFile(filePath);
    const base64 = this.uint8ArrayToBase64(content);
    const mimeType = this.getMimeTypeFromFileName(targetFile.name);
    
    return {
      id: attachmentId,
      type: mimeType.startsWith('image/') ? 'image' : 'document',
      name: targetFile.name,
      data: `data:${mimeType};base64,${base64}`,
      mimeType,
      size: content.length,
    };
  }

  async deleteAttachment(sessionId: string, attachmentId: string): Promise<void> {
    await this.ensureInitialized();
    
    const attachmentDir = await this.getAttachmentDir(sessionId);
    
    if (!(await exists(attachmentDir))) {
      return;
    }

    const files = await readDir(attachmentDir);
    const targetFile = files.find(f => f.name.startsWith(attachmentId));
    
    if (targetFile) {
      const filePath = await join(attachmentDir, targetFile.name);
      await remove(filePath);
    }
  }

  async deleteSessionAttachments(sessionId: string): Promise<void> {
    await this.ensureInitialized();
    
    const attachmentDir = await this.getAttachmentDir(sessionId);
    
    if (await exists(attachmentDir)) {
      await remove(attachmentDir, { recursive: true });
    }
  }

  async getMessages(sessionId: string): Promise<Message[]> {
    await this.ensureInitialized();
    
    const messagesPath = await this.getMessagesFilePath(sessionId);
    return this.readJsonFile<Message[]>(messagesPath, []);
  }

  async saveMessage(sessionId: string, message: Message): Promise<void> {
    await this.ensureInitialized();
    
    const messages = await this.getMessages(sessionId);
    messages.push(message);
    
    const messagesPath = await this.getMessagesFilePath(sessionId);
    await this.writeJsonFile(messagesPath, messages);
  }

  async updateMessage(sessionId: string, message: Message): Promise<void> {
    await this.ensureInitialized();
    
    const messages = await this.getMessages(sessionId);
    const index = messages.findIndex(m => m.id === message.id);
    
    if (index >= 0) {
      messages[index] = message;
      const messagesPath = await this.getMessagesFilePath(sessionId);
      await this.writeJsonFile(messagesPath, messages);
    }
  }

  async deleteMessage(sessionId: string, messageId: string): Promise<void> {
    await this.ensureInitialized();
    
    const messages = await this.getMessages(sessionId);
    const filtered = messages.filter(m => m.id !== messageId);
    
    const messagesPath = await this.getMessagesFilePath(sessionId);
    await this.writeJsonFile(messagesPath, filtered);
  }

  async getStorageInfo(): Promise<{ path?: string; sessionCount: number; totalSize?: number }> {
    await this.ensureInitialized();
    
    const sessionsPath = await this.getSessionsFilePath();
    const sessionsMetadata = await this.readJsonFile<SessionMetadata[]>(sessionsPath, []);
    
    return {
      path: this.dataDir,
      sessionCount: sessionsMetadata.length,
    };
  }

  async exportSession(id: string): Promise<string> {
    const session = await this.getSession(id);
    if (!session) {
      throw new Error('Session not found');
    }

    const attachments: { [key: string]: string } = {};
    const attachmentDir = await this.getAttachmentDir(id);
    
    if (await exists(attachmentDir)) {
      const files = await readDir(attachmentDir);
      for (const file of files) {
        const filePath = await join(attachmentDir, file.name);
        const content = await readFile(filePath);
        const base64 = this.uint8ArrayToBase64(content);
        attachments[file.name] = base64;
      }
    }

    const exportData = {
      version: 1,
      exportedAt: Date.now(),
      session,
      attachments,
    };

    return JSON.stringify(exportData, null, 2);
  }

  async importSession(data: string): Promise<ChatSession> {
    const importData = JSON.parse(data);
    
    if (importData.version !== 1) {
      throw new Error('Unsupported export version');
    }

    const session: ChatSession = {
      ...importData.session,
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      updatedAt: Date.now(),
    };

    await this.saveSession(session);

    if (importData.attachments) {
      const attachmentDir = await this.getAttachmentDir(session.id);
      if (!(await exists(attachmentDir))) {
        await mkdir(attachmentDir, { recursive: true });
      }

      for (const [fileName, base64] of Object.entries(importData.attachments)) {
        const filePath = await join(attachmentDir, fileName);
        const binaryData = this.base64ToUint8Array(base64 as string);
        await writeFile(filePath, binaryData);
      }
    }

    return session;
  }

  private getFileExtension(fileName: string): string {
    const parts = fileName.split('.');
    if (parts.length > 1) {
      return '.' + parts.pop();
    }
    return '';
  }

  private extractBase64Data(dataUrl: string): string {
    const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
    if (match) {
      return match[1];
    }
    return dataUrl;
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  private uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private getMimeTypeFromFileName(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const mimeTypes: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'bmp': 'image/bmp',
      'svg': 'image/svg+xml',
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'txt': 'text/plain',
      'csv': 'text/csv',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }
}

async function getMetaFilePath(sessionId: string): Promise<string> {
  const appDataPath = await appDataDir();
  return join(appDataPath, DATA_DIR, SESSIONS_DIR, sessionId, 'meta.json');
}
