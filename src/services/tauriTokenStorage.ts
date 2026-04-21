import { TokenUsageRecord } from '../types';

const DATA_DIR = 'nexus-ai-assistant';
const DATA_FILE = 'token-usage.json';

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

async function getDataFilePath(): Promise<string> {
  const isTauri = await checkTauriEnv();
  
  if (isTauri) {
    const { appDataDir, join } = await import('@tauri-apps/api/path');
    const appDataPath = await appDataDir();
    return await join(appDataPath, DATA_DIR, DATA_FILE);
  }
  return '';
}

async function ensureDataDir(): Promise<void> {
  const isTauri = await checkTauriEnv();
  if (!isTauri) return;
  
  const { appDataDir, join } = await import('@tauri-apps/api/path');
  const { mkdir, exists } = await import('@tauri-apps/plugin-fs');
  
  const appDataPath = await appDataDir();
  const dataDirPath = await join(appDataPath, DATA_DIR);
  
  if (!(await exists(dataDirPath))) {
    await mkdir(dataDirPath, { recursive: true });
  }
}

export async function addTokenRecord(record: TokenUsageRecord): Promise<void> {
  const records = await getAllTokenRecords();
  records.push(record);
  await saveAllTokenRecords(records);
}

export async function addTokenRecords(newRecords: TokenUsageRecord[]): Promise<void> {
  if (newRecords.length === 0) return;
  const records = await getAllTokenRecords();
  records.push(...newRecords);
  await saveAllTokenRecords(records);
}

export async function getAllTokenRecords(): Promise<TokenUsageRecord[]> {
  const isTauri = await checkTauriEnv();
  
  if (!isTauri) {
    return [];
  }
  
  try {
    const filePath = await getDataFilePath();
    const { exists, readFile } = await import('@tauri-apps/plugin-fs');
    
    if (!(await exists(filePath))) {
      return [];
    }
    
    const content = await readFile(filePath);
    const text = new TextDecoder().decode(content);
    return JSON.parse(text);
  } catch (error) {
    return [];
  }
}

async function saveAllTokenRecords(records: TokenUsageRecord[]): Promise<void> {
  const isTauri = await checkTauriEnv();
  
  if (!isTauri) {
    return;
  }
  
  try {
    await ensureDataDir();
    const filePath = await getDataFilePath();
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    
    const content = new TextEncoder().encode(JSON.stringify(records, null, 2));
    await writeFile(filePath, content);
  } catch (error) {
    // 保存失败
  }
}

export async function clearAllTokenRecords(): Promise<void> {
  await saveAllTokenRecords([]);
}

export async function getTokenRecordCount(): Promise<number> {
  const records = await getAllTokenRecords();
  return records.length;
}

export async function migrateFromIndexedDB(): Promise<number> {
  const isTauri = await checkTauriEnv();
  
  if (!isTauri) {
    return 0;
  }
  
  try {
    const { openDB } = await import('idb');
    const DB_NAME = 'nexus-token-usage';
    const STORE_NAME = 'tokenRecords';
    
    const db = await openDB(DB_NAME, 1);
    const records = await db.getAll(STORE_NAME);
    
    if (records.length === 0) return 0;
    
    const existingRecords = await getAllTokenRecords();
    const allRecords = [...existingRecords, ...records];
    await saveAllTokenRecords(allRecords);
    
    await db.clear(STORE_NAME);
    return records.length;
  } catch (error) {
    return 0;
  }
}

export async function migrateFromLocalStorage(): Promise<number> {
  const isTauri = await checkTauriEnv();
  
  if (!isTauri) {
    return 0;
  }
  
  const stored = localStorage.getItem('nexus_token_usage_records');
  if (!stored) return 0;
  
  try {
    const records = JSON.parse(stored);
    if (!Array.isArray(records) || records.length === 0) return 0;
    
    const existingRecords = await getAllTokenRecords();
    const allRecords = [...existingRecords, ...records];
    await saveAllTokenRecords(allRecords);
    
    localStorage.removeItem('nexus_token_usage_records');
    return records.length;
  } catch (error) {
    return 0;
  }
}

export async function getStorageInfo(): Promise<{ path: string; count: number }> {
  const filePath = await getDataFilePath();
  const count = await getTokenRecordCount();
  return { path: filePath, count };
}

export async function deleteTokenRecordsByModelId(modelId: string): Promise<number> {
  const records = await getAllTokenRecords();
  const filteredRecords = records.filter(r => r.modelId !== modelId);
  const deletedCount = records.length - filteredRecords.length;
  
  if (deletedCount > 0) {
    await saveAllTokenRecords(filteredRecords);
  }
  
  return deletedCount;
}

export async function updateTokenRecordsModelId(oldModelId: string, newModelId: string): Promise<number> {
  const records = await getAllTokenRecords();
  let updatedCount = 0;
  
  const updatedRecords = records.map(r => {
    if (r.modelId === oldModelId) {
      updatedCount++;
      return { ...r, modelId: newModelId };
    }
    return r;
  });
  
  if (updatedCount > 0) {
    await saveAllTokenRecords(updatedRecords);
  }
  
  return updatedCount;
}
