import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { TokenUsageRecord } from '../types';

interface TokenDBSchema extends DBSchema {
  tokenRecords: {
    key: string;
    value: TokenUsageRecord;
    indexes: {
      'by-model': string;
      'by-timestamp': number;
      'by-model-timestamp': [string, number];
    };
  };
}

const DB_NAME = 'nexus-token-usage';
const DB_VERSION = 1;
const STORE_NAME = 'tokenRecords';

let dbPromise: Promise<IDBPDatabase<TokenDBSchema>> | null = null;

function getDB(): Promise<IDBPDatabase<TokenDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<TokenDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('by-model', 'modelId');
        store.createIndex('by-timestamp', 'timestamp');
        store.createIndex('by-model-timestamp', ['modelId', 'timestamp']);
      },
    });
  }
  return dbPromise;
}

export async function addTokenRecord(record: TokenUsageRecord): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, record);
}

export async function addTokenRecords(records: TokenUsageRecord[]): Promise<void> {
  if (records.length === 0) return;
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  await Promise.all([
    ...records.map(record => tx.store.put(record)),
    tx.done,
  ]);
}

export async function getAllTokenRecords(): Promise<TokenUsageRecord[]> {
  const db = await getDB();
  return db.getAll(STORE_NAME);
}

export async function getTokenRecordsByTimeRange(
  startTime: number,
  endTime?: number
): Promise<TokenUsageRecord[]> {
  const db = await getDB();
  const range = IDBKeyRange.bound(startTime, endTime || Date.now());
  return db.getAllFromIndex(STORE_NAME, 'by-timestamp', range);
}

export async function getTokenRecordsByModelAndTime(
  modelId: string,
  startTime: number,
  endTime?: number
): Promise<TokenUsageRecord[]> {
  const db = await getDB();
  const range = IDBKeyRange.bound(
    [modelId, startTime],
    [modelId, endTime || Date.now()]
  );
  return db.getAllFromIndex(STORE_NAME, 'by-model-timestamp', range);
}

export async function clearAllTokenRecords(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE_NAME);
}

export async function getTokenRecordCount(): Promise<number> {
  const db = await getDB();
  return db.count(STORE_NAME);
}

export async function migrateFromLocalStorage(): Promise<number> {
  const stored = localStorage.getItem('nexus_token_usage_records');
  if (!stored) return 0;
  
  try {
    const records = JSON.parse(stored);
    if (!Array.isArray(records) || records.length === 0) return 0;
    
    await addTokenRecords(records);
    localStorage.removeItem('nexus_token_usage_records');
    return records.length;
  } catch (error) {
    return 0;
  }
}

export async function deleteTokenRecordsByModelId(modelId: string): Promise<number> {
  const records = await getAllTokenRecords();
  const filteredRecords = records.filter(r => r.modelId !== modelId);
  const deletedCount = records.length - filteredRecords.length;
  
  if (deletedCount > 0) {
    const db = await getDB();
    await db.clear(STORE_NAME);
    if (filteredRecords.length > 0) {
      await addTokenRecords(filteredRecords);
    }
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
    const db = await getDB();
    await db.clear(STORE_NAME);
    await addTokenRecords(updatedRecords);
  }
  
  return updatedCount;
}
