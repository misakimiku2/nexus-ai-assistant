# Token统计存储升级到IndexedDB计划

## 背景

当前Token使用统计数据存储在localStorage中，存在以下限制：
- localStorage容量限制约5-10MB
- 同步API会阻塞主线程
- 大量数据时性能下降
- 无法高效查询和索引

升级到IndexedDB的优势：
- 存储容量大（通常无限制或数百MB）
- 异步API，不阻塞主线程
- 支持索引，查询效率高
- 支持事务，数据一致性更好

## 技术选型

使用 **idb** 库（轻量级Promise封装，约1.5KB）

理由：
- 轻量级，不增加太多包体积
- Promise-based API，易于使用
- TypeScript类型支持良好
- 社区广泛使用，稳定可靠

## 实现步骤

### 第一步：安装依赖
```bash
npm install idb
```

### 第二步：创建IndexedDB服务模块

创建文件 `src/services/tokenStorage.ts`：

```typescript
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

// 数据库实例缓存
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

// 添加记录
export async function addTokenRecord(record: TokenUsageRecord): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, record);
}

// 批量添加记录
export async function addTokenRecords(records: TokenUsageRecord[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  await Promise.all([
    ...records.map(record => tx.store.put(record)),
    tx.done,
  ]);
}

// 获取所有记录
export async function getAllTokenRecords(): Promise<TokenUsageRecord[]> {
  const db = await getDB();
  return db.getAll(STORE_NAME);
}

// 按时间范围获取记录
export async function getTokenRecordsByTimeRange(
  startTime: number,
  endTime?: number
): Promise<TokenUsageRecord[]> {
  const db = await getDB();
  const range = IDBKeyRange.bound(startTime, endTime || Date.now());
  return db.getAllFromIndex(STORE_NAME, 'by-timestamp', range);
}

// 按模型和时间范围获取记录
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

// 清除所有记录
export async function clearAllTokenRecords(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE_NAME);
}

// 获取记录总数
export async function getTokenRecordCount(): Promise<number> {
  const db = await getDB();
  return db.count(STORE_NAME);
}

// 迁移localStorage数据到IndexedDB
export async function migrateFromLocalStorage(): Promise<number> {
  const stored = localStorage.getItem('nexus_token_usage_records');
  if (!stored) return 0;
  
  try {
    const records = JSON.parse(stored);
    if (!Array.isArray(records) || records.length === 0) return 0;
    
    await addTokenRecords(records);
    localStorage.removeItem('nexus_token_usage_records');
    return records.length;
  } catch {
    return 0;
  }
}
```

### 第三步：创建React Hook

创建文件 `src/hooks/useTokenStorage.ts`：

```typescript
import { useState, useEffect, useCallback } from 'react';
import { TokenUsageRecord } from '../types';
import {
  addTokenRecord,
  getAllTokenRecords,
  getTokenRecordsByTimeRange,
  getTokenRecordsByModelAndTime,
  clearAllTokenRecords,
  migrateFromLocalStorage,
} from '../services/tokenStorage';
import { calculateCost } from '../utils/pricing';
import { ModelConfig } from '../types';

export function useTokenStorage(modelConfigs: ModelConfig[]) {
  const [records, setRecords] = useState<TokenUsageRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMigrating, setIsMigrating] = useState(false);

  // 初始化：迁移数据并加载
  useEffect(() => {
    async function init() {
      setIsLoading(true);
      setIsMigrating(true);
      
      // 检查并迁移localStorage数据
      const migratedCount = await migrateFromLocalStorage();
      if (migratedCount > 0) {
        console.log(`[TokenStorage] 迁移了 ${migratedCount} 条记录从localStorage到IndexedDB`);
      }
      
      setIsMigrating(false);
      
      // 加载所有记录
      const allRecords = await getAllTokenRecords();
      setRecords(allRecords);
      setIsLoading(false);
    }
    
    init();
  }, []);

  // 添加记录
  const addRecord = useCallback(async (record: Omit<TokenUsageRecord, 'id'>) => {
    const model = modelConfigs.find(m => m.id === record.modelId);
    const cost = record.cost ?? calculateCost(record.inputTokens, record.outputTokens, model?.pricing);
    
    const newRecord: TokenUsageRecord = {
      ...record,
      cost,
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
    };
    
    await addTokenRecord(newRecord);
    setRecords(prev => [...prev, newRecord]);
  }, [modelConfigs]);

  // 获取统计
  const getStats = useCallback(async (
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
    
    let filteredRecords: TokenUsageRecord[];
    
    if (modelId) {
      filteredRecords = await getTokenRecordsByModelAndTime(modelId, startTime);
    } else if (startTime > 0) {
      filteredRecords = await getTokenRecordsByTimeRange(startTime);
    } else {
      filteredRecords = records;
    }
    
    return {
      totalInputTokens: filteredRecords.reduce((sum, r) => sum + r.inputTokens, 0),
      totalOutputTokens: filteredRecords.reduce((sum, r) => sum + r.outputTokens, 0),
      totalCost: filteredRecords.reduce((sum, r) => sum + r.cost, 0),
    };
  }, [records]);

  // 清除所有记录
  const clearRecords = useCallback(async () => {
    await clearAllTokenRecords();
    setRecords([]);
  }, []);

  return {
    records,
    isLoading,
    isMigrating,
    addRecord,
    getStats,
    clearRecords,
  };
}
```

### 第四步：修改GlobalStateContext

修改 `src/context/GlobalStateContext.tsx`：

1. 导入新的hook
2. 替换localStorage相关逻辑
3. 保持API兼容性

关键修改点：
- 移除 `tokenUsageRecords` 的useState初始化
- 使用 `useTokenStorage` hook
- 添加loading状态处理
- 保持现有的API接口不变

### 第五步：更新TokenUsageChart组件

修改 `src/components/TokenUsageChart.tsx`：

1. 添加loading状态显示
2. 处理异步数据加载
3. 保持现有UI逻辑

### 第六步：测试验证

1. 测试数据迁移（从localStorage到IndexedDB）
2. 测试新数据添加
3. 测试数据查询
4. 测试数据清除
5. 测试跨会话数据持久化

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `package.json` | 修改 | 添加idb依赖 |
| `src/services/tokenStorage.ts` | 新建 | IndexedDB服务模块 |
| `src/hooks/useTokenStorage.ts` | 新建 | Token存储Hook |
| `src/context/GlobalStateContext.tsx` | 修改 | 集成新的存储方案 |
| `src/components/TokenUsageChart.tsx` | 修改 | 添加loading状态 |

## 注意事项

1. **数据迁移**：首次运行时自动将localStorage数据迁移到IndexedDB
2. **向后兼容**：迁移完成后清除localStorage中的旧数据
3. **错误处理**：IndexedDB操作失败时提供降级方案
4. **性能优化**：使用索引加速查询，避免全表扫描

## 回滚方案

如果IndexedDB出现问题，可以：
1. 恢复GlobalStateContext.tsx到localStorage版本
2. 数据仍在IndexedDB中，可通过浏览器开发者工具导出
