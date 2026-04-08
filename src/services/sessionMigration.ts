import { ChatSession, ChatFolder } from '../types';
import { getSessionStorage, SessionStorageService } from './sessionStorage';

const MIGRATION_KEY = 'nexus_session_migration_completed';
const LEGACY_SESSIONS_KEY = 'nexus_sessions';
const LEGACY_FOLDERS_KEY = 'nexus_folders';

export async function checkMigrationNeeded(): Promise<boolean> {
  const migrationCompleted = localStorage.getItem(MIGRATION_KEY);
  if (migrationCompleted === 'true') {
    return false;
  }

  const legacySessions = localStorage.getItem(LEGACY_SESSIONS_KEY);
  const legacyFolders = localStorage.getItem(LEGACY_FOLDERS_KEY);
  
  return !!(legacySessions || legacyFolders);
}

export async function migrateFromLocalStorage(): Promise<{
  sessionsMigrated: number;
  foldersMigrated: number;
}> {
  const result = {
    sessionsMigrated: 0,
    foldersMigrated: 0,
  };

  const migrationCompleted = localStorage.getItem(MIGRATION_KEY);
  if (migrationCompleted === 'true') {
    console.log('[Migration] 迁移已完成，跳过');
    return result;
  }

  try {
    const storage = await getSessionStorage();
    
    const legacySessionsData = localStorage.getItem(LEGACY_SESSIONS_KEY);
    if (legacySessionsData) {
      try {
        const sessions: ChatSession[] = JSON.parse(legacySessionsData);
        console.log('[Migration] 发现', sessions.length, '个会话需要迁移');
        
        for (const session of sessions) {
          try {
            await storage.saveSession(session);
            result.sessionsMigrated++;
          } catch (err) {
            console.error('[Migration] 迁移会话失败:', session.id, err);
          }
        }
        
        localStorage.removeItem(LEGACY_SESSIONS_KEY);
        console.log('[Migration] 会话迁移完成:', result.sessionsMigrated);
      } catch (err) {
        console.error('[Migration] 解析会话数据失败:', err);
      }
    }

    const legacyFoldersData = localStorage.getItem(LEGACY_FOLDERS_KEY);
    if (legacyFoldersData) {
      try {
        const folders: ChatFolder[] = JSON.parse(legacyFoldersData);
        console.log('[Migration] 发现', folders.length, '个文件夹需要迁移');
        
        for (const folder of folders) {
          try {
            await storage.saveFolder(folder);
            result.foldersMigrated++;
          } catch (err) {
            console.error('[Migration] 迁移文件夹失败:', folder.id, err);
          }
        }
        
        localStorage.removeItem(LEGACY_FOLDERS_KEY);
        console.log('[Migration] 文件夹迁移完成:', result.foldersMigrated);
      } catch (err) {
        console.error('[Migration] 解析文件夹数据失败:', err);
      }
    }

    localStorage.setItem(MIGRATION_KEY, 'true');
    console.log('[Migration] 迁移流程完成');
  } catch (err) {
    console.error('[Migration] 迁移失败:', err);
    throw err;
  }

  return result;
}

export async function getMigrationStatus(): Promise<{
  needed: boolean;
  sessionsCount: number;
  foldersCount: number;
}> {
  const status = {
    needed: false,
    sessionsCount: 0,
    foldersCount: 0,
  };

  const migrationCompleted = localStorage.getItem(MIGRATION_KEY);
  if (migrationCompleted === 'true') {
    return status;
  }

  const legacySessionsData = localStorage.getItem(LEGACY_SESSIONS_KEY);
  if (legacySessionsData) {
    try {
      const sessions: ChatSession[] = JSON.parse(legacySessionsData);
      status.sessionsCount = sessions.length;
      status.needed = true;
    } catch {
      // ignore
    }
  }

  const legacyFoldersData = localStorage.getItem(LEGACY_FOLDERS_KEY);
  if (legacyFoldersData) {
    try {
      const folders: ChatFolder[] = JSON.parse(legacyFoldersData);
      status.foldersCount = folders.length;
      status.needed = true;
    } catch {
      // ignore
    }
  }

  return status;
}

export function markMigrationCompleted(): void {
  localStorage.setItem(MIGRATION_KEY, 'true');
}
