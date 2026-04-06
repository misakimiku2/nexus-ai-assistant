import { useState, useEffect, useCallback, useRef } from 'react';
import { TokenUsageRecord, ModelConfig } from '../types';
import { calculateCost } from '../utils/pricing';

import {
  addTokenRecord as idbAddTokenRecord,
  getAllTokenRecords as idbGetAllTokenRecords,
  clearAllTokenRecords as idbClearAllTokenRecords,
  migrateFromLocalStorage as idbMigrateFromLocalStorage,
  deleteTokenRecordsByModelId as idbDeleteTokenRecordsByModelId,
  updateTokenRecordsModelId as idbUpdateTokenRecordsModelId,
} from '../services/tokenStorage';

import {
  addTokenRecord as tauriAddTokenRecord,
  getAllTokenRecords as tauriGetAllTokenRecords,
  clearAllTokenRecords as tauriClearAllTokenRecords,
  migrateFromLocalStorage as tauriMigrateFromLocalStorage,
  migrateFromIndexedDB as tauriMigrateFromIndexedDB,
  getStorageInfo,
  deleteTokenRecordsByModelId as tauriDeleteTokenRecordsByModelId,
  updateTokenRecordsModelId as tauriUpdateTokenRecordsModelId,
} from '../services/tauriTokenStorage';

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

export function useTokenStorage(modelConfigs: ModelConfig[]) {
  const [records, setRecords] = useState<TokenUsageRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMigrating, setIsMigrating] = useState(false);
  const [storagePath, setStoragePath] = useState<string>('');
  const isInitialized = useRef(false);

  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;
    
    async function init() {
      setIsLoading(true);
      setIsMigrating(true);
      
      const isTauri = await checkTauriEnv();
      console.log('[TokenStorage] Tauri环境:', isTauri);
      
      if (isTauri) {
        console.log('[TokenStorage] 开始迁移localStorage数据...');
        const localStorageMigrated = await tauriMigrateFromLocalStorage();
        console.log('[TokenStorage] localStorage迁移结果:', localStorageMigrated);
        
        console.log('[TokenStorage] 开始迁移IndexedDB数据...');
        const indexedDBMigrated = await tauriMigrateFromIndexedDB();
        console.log('[TokenStorage] IndexedDB迁移结果:', indexedDBMigrated);
        
        const info = await getStorageInfo();
        setStoragePath(info.path);
        console.log('[TokenStorage] 存储路径:', info.path);
      } else {
        const migratedCount = await idbMigrateFromLocalStorage();
        if (migratedCount > 0) {
          console.log(`[TokenStorage] 迁移了 ${migratedCount} 条记录从localStorage到IndexedDB`);
        }
      }
      
      setIsMigrating(false);
      
      const allRecords = isTauri 
        ? await tauriGetAllTokenRecords() 
        : await idbGetAllTokenRecords();
      
      console.log('[TokenStorage] 加载了', allRecords.length, '条记录');
      allRecords.forEach((r, i) => {
        console.log(`[TokenStorage] 记录${i + 1}:`, {
          modelId: r.modelId,
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
          timestamp: new Date(r.timestamp).toLocaleString(),
          cost: r.cost,
        });
      });
      setRecords(allRecords);
      setIsLoading(false);
    }
    
    init();
  }, []);

  const addRecord = useCallback(async (record: Omit<TokenUsageRecord, 'id'>) => {
    console.log('[TokenStorage] addRecord called with:', record);
    const model = modelConfigs.find(m => m.id === record.modelId);
    const cost = record.cost ?? calculateCost(record.inputTokens, record.outputTokens, model?.pricing);
    console.log('[TokenStorage] Calculated cost:', cost, 'model found:', !!model);
    
    const newRecord: TokenUsageRecord = {
      ...record,
      cost,
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
    };
    console.log('[TokenStorage] New record created:', newRecord);
    
    const isTauri = await checkTauriEnv();
    if (isTauri) {
      await tauriAddTokenRecord(newRecord);
    } else {
      await idbAddTokenRecord(newRecord);
    }
    
    setRecords(prev => {
      const updated = [...prev, newRecord];
      console.log('[TokenStorage] Updated records count:', updated.length);
      return updated;
    });
  }, [modelConfigs]);

  const getStats = useCallback((
    modelId?: string,
    timeRange?: 'day' | 'week' | 'month' | 'year'
  ) => {
    const now = Date.now();
    let startTime: number;
    
    switch (timeRange) {
      case 'day':
        startTime = now - 24 * 60 * 60 * 1000;
        break;
      case 'week':
        startTime = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case 'month':
        startTime = now - 30 * 24 * 60 * 60 * 1000;
        break;
      case 'year':
        startTime = now - 365 * 24 * 60 * 60 * 1000;
        break;
      default:
        startTime = 0;
    }
    
    const filteredRecords = records.filter(r => {
      const matchesTime = r.timestamp >= startTime;
      const matchesModel = modelId ? r.modelId === modelId : true;
      return matchesTime && matchesModel;
    });
    
    return {
      totalInputTokens: filteredRecords.reduce((sum, r) => sum + r.inputTokens, 0),
      totalOutputTokens: filteredRecords.reduce((sum, r) => sum + r.outputTokens, 0),
      totalCost: filteredRecords.reduce((sum, r) => sum + r.cost, 0),
    };
  }, [records]);

  const clearRecords = useCallback(async () => {
    const isTauri = await checkTauriEnv();
    if (isTauri) {
      await tauriClearAllTokenRecords();
    } else {
      await idbClearAllTokenRecords();
    }
    setRecords([]);
  }, []);

  const refreshRecords = useCallback(async () => {
    const isTauri = await checkTauriEnv();
    const allRecords = isTauri 
      ? await tauriGetAllTokenRecords() 
      : await idbGetAllTokenRecords();
    setRecords(allRecords);
  }, []);

  const deleteRecordsByModelId = useCallback(async (modelId: string) => {
    const isTauri = await checkTauriEnv();
    const deletedCount = isTauri 
      ? await tauriDeleteTokenRecordsByModelId(modelId)
      : await idbDeleteTokenRecordsByModelId(modelId);
    
    if (deletedCount > 0) {
      setRecords(prev => prev.filter(r => r.modelId !== modelId));
    }
    
    return deletedCount;
  }, []);

  const updateRecordsModelId = useCallback(async (oldModelId: string, newModelId: string) => {
    const isTauri = await checkTauriEnv();
    const updatedCount = isTauri
      ? await tauriUpdateTokenRecordsModelId(oldModelId, newModelId)
      : await idbUpdateTokenRecordsModelId(oldModelId, newModelId);
    
    if (updatedCount > 0) {
      setRecords(prev => prev.map(r => 
        r.modelId === oldModelId ? { ...r, modelId: newModelId } : r
      ));
    }
    
    return updatedCount;
  }, []);

  return {
    records,
    isLoading,
    isMigrating,
    storagePath,
    addRecord,
    getStats,
    clearRecords,
    refreshRecords,
    deleteRecordsByModelId,
    updateRecordsModelId,
  };
}
