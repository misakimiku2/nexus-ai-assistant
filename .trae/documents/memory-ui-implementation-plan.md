# Memory UI 可视化面板实现计划

## 一、概述

为现有的 Memory System 增加图形化可视化面板，目标是"可理解性 + 可调试性"，而非美观优先。

## 二、设计原则遵守

1. ✅ UI 必须服务于"理解系统行为"
2. ✅ 不允许 UI 反向影响 Memory 数据结构
3. ✅ 所有数据必须直接来自现有 Memory System
4. ✅ UI 设计必须可扩展
5. ✅ 必须支持 Debug 模式切换

## 三、技术方案

### 3.1 文件结构

```
src/
├── components/
│   └── MemoryPanel/
│       ├── index.tsx              # 主入口组件
│       ├── MemoryList.tsx         # Memory List 模块
│       ├── MemoryHits.tsx         # 本轮命中 Memory 模块
│       ├── MemoryDebugLog.tsx     # Debug Log 模块
│       ├── MemoryOperations.tsx   # 操作面板模块
│       ├── MemoryStats.tsx        # 统计概览
│       └── types.ts               # 组件内部类型定义
├── hooks/
│   └── useMemoryState.ts          # Memory 状态管理 Hook
├── context/
│   └── MemoryUIContext.tsx        # Memory UI 全局状态（Debug模式、命中记录等）
```

### 3.2 数据流设计

```
┌─────────────────────────────────────────────────────────────┐
│                    MemoryUIContext                           │
│  - debugMode: boolean                                        │
│  - currentHits: RetrievedMemory[]                            │
│  - debugLogs: MemoryDebugLogEntry[]                          │
│  - refreshTrigger: number                                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   useMemoryState Hook                        │
│  - memories: MemoryItem[]                                    │
│  - stats: MemoryStats                                        │
│  - evolutionStats: EvolutionStats                            │
│  - loading: boolean                                          │
│  - error: string | null                                      │
│                                                              │
│  Methods:                                                    │
│  - refresh()                                                 │
│  - reinforce(id)                                             │
│  - reduceScore(id, amount)                                   │
│  - delete(id)                                                │
│  - lock(id) / unlock(id)                                     │
│  - decay()                                                   │
│  - prune()                                                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  TauriMemoryClient (现有)                    │
│  - getAllMemories()                                          │
│  - getMemoryStats()                                          │
│  - getEvolutionStats()                                       │
│  - reinforceMemories()                                       │
│  - deleteMemory()                                            │
│  - decayMemories()                                           │
│  - pruneMemoriesV2()                                         │
│  - runEvolutionCycle()                                       │
└─────────────────────────────────────────────────────────────┘
```

## 四、模块详细设计

### 4.1 MemoryPanel 主组件

**功能**：
- 作为 Memory UI 的容器
- 管理 Debug/Simple 模式切换
- 协调子组件状态

**Props**：
```typescript
interface MemoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
}
```

**UI 结构**：
```
┌─────────────────────────────────────────────────────────────┐
│  Memory Panel                              [Debug] [×]      │
├─────────────────────────────────────────────────────────────┤
│  [Stats Overview]                                            │
│  Total: 42 | Active: 38 | Avg Score: 0.72                   │
├─────────────────────────────────────────────────────────────┤
│  [Tabs: List | Hits | Logs | Operations]                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [Tab Content Area]                                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 MemoryList 组件

**功能**：
- 展示所有 MemoryItem
- 按 score 排序（默认）
- 按 type 筛选
- 搜索（基于 content）

**数据来源**：
- `TauriMemoryClient.getAllMemories()`

**UI 结构**：
```
┌─────────────────────────────────────────────────────────────┐
│  [Search Input]                    [Type Filter Dropdown]   │
├─────────────────────────────────────────────────────────────┤
│  Sort: [Score ▼] [Type] [Created] [Last Accessed]          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 🟢 identity | Score: 0.95 | Decay: 0.001           │   │
│  │ 用户偏好使用 TypeScript 进行开发...                  │   │
│  │ Access: 12 | Last: 2026-03-22                       │   │
│  │ [Debug] embedding: [0.12, 0.45, ...]                │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 🟡 task | Score: 0.65 | Decay: 0.02                │   │
│  │ 正在实现 Memory UI 可视化面板...                     │   │
│  │ Status: in_progress | Progress: 40%                 │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**每条 Memory 显示字段**：

| 字段 | Simple Mode | Debug Mode |
|------|-------------|------------|
| content (摘要) | ✅ | ✅ |
| type | ✅ (图标) | ✅ (文字+图标) |
| score | ✅ | ✅ |
| decay | ❌ | ✅ |
| access_count | ✅ | ✅ |
| last_accessed_at | ✅ (相对时间) | ✅ (完整时间戳) |
| is_active | ✅ (状态指示器) | ✅ |
| importance | ❌ | ✅ |
| embedding | ❌ | ✅ (前5维预览) |
| created_at | ❌ | ✅ |
| source_session_id | ❌ | ✅ |
| metadata | ❌ | ✅ (任务详情) |

### 4.3 MemoryHits 组件（核心）

**功能**：
- 展示"当前这次对话中被检索并使用的 memory"
- 必须基于 retrieval 结果生成

**数据来源**：
- 从 ReActEngine 的 `retrievedMemories` 获取
- 需要在 ReActEngine 中添加回调来传递命中数据

**实现方案**：
1. 在 `ReActEngine` 中添加 `onMemoryRetrieved` 回调
2. 在 `MemoryUIContext` 中存储 `currentHits`
3. MemoryHits 组件从 Context 读取

**UI 结构**：
```
┌─────────────────────────────────────────────────────────────┐
│  This Turn Memory Hits (5 memories retrieved)               │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │ #1 | Final Score: 0.87                              │   │
│  │ Similarity: 0.92 | Memory Score: 0.75              │   │
│  │ Type: preference                                    │   │
│  │ Content: 用户偏好使用 TypeScript...                  │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ #2 | Final Score: 0.81                              │   │
│  │ Similarity: 0.85 | Memory Score: 0.72              │   │
│  │ Type: task                                          │   │
│  │ Content: 正在实现 Memory UI...                       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**每条命中 Memory 显示字段**：

| 字段 | 说明 |
|------|------|
| rank | 排名（1, 2, 3...） |
| content | 记忆内容 |
| similarity | 语义相似度 |
| memory.score | 记忆动态权重 |
| final_score | 检索排序分数 (similarity × 0.6 + score × 0.4) |
| type | 记忆类型 |

### 4.4 MemoryDebugLog 组件

**功能**：
- 展示 Memory 系统行为日志
- 结构化展示（不是 console.log dump）
- 按时间排序
- 可折叠

**日志类型**：
```typescript
type MemoryDebugLogType = 
  | 'retrieval_start'      // 检索开始
  | 'retrieval_candidates' // 候选 memory
  | 'retrieval_filtered'   // 过滤结果
  | 'retrieval_complete'   // 检索完成
  | 'reinforce'            // 强化触发
  | 'decay'                // 衰减执行
  | 'prune'                // 淘汰执行
  | 'add_memory'           // 添加记忆
  | 'delete_memory';       // 删除记忆

interface MemoryDebugLogEntry {
  id: string;
  type: MemoryDebugLogType;
  timestamp: number;
  data: Record<string, unknown>;
}
```

**UI 结构**：
```
┌─────────────────────────────────────────────────────────────┐
│  Memory Debug Log                        [Clear] [Export]   │
├─────────────────────────────────────────────────────────────┤
│  ▼ 2026-03-23 10:30:15 - retrieval_complete                │
│    ┌───────────────────────────────────────────────────┐   │
│    │ Query: "帮我实现 Memory UI"                        │   │
│    │ Candidates: 15 → Filtered: 5                      │   │
│    │ Top 3 scores: [0.87, 0.81, 0.75]                  │   │
│    └───────────────────────────────────────────────────┘   │
│                                                              │
│  ▶ 2026-03-23 10:30:10 - retrieval_candidates              │
│    Found 15 candidates from storage                         │
│                                                              │
│  ▼ 2026-03-23 10:29:55 - reinforce                         │
│    ┌───────────────────────────────────────────────────┐   │
│    │ Memory IDs: [id-1, id-2, id-3]                    │   │
│    │ Score changes: +0.05 each                          │   │
│    └───────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 4.5 MemoryOperations 组件

**功能**：
- 每条 memory 提供手动操作
- 手动强化（reinforce）
- 手动降低权重（减 score）
- 删除
- 锁定（避免被 prune）

**操作按钮**：
```typescript
interface MemoryOperation {
  id: string;
  label: string;
  icon: React.ComponentType;
  action: () => Promise<void>;
  confirm?: string;  // 需要确认的消息
  danger?: boolean;  // 危险操作样式
}
```

**UI 结构**：
```
┌─────────────────────────────────────────────────────────────┐
│  Memory Operations                                          │
├─────────────────────────────────────────────────────────────┤
│  Selected: 3 memories                                       │
│                                                              │
│  [Reinforce Selected] [Reduce Score] [Delete Selected]      │
│                                                              │
│  ─────────────────────────────────────────────────────────  │
│                                                              │
│  Evolution Controls:                                         │
│  [Run Decay] [Run Prune] [Run Full Evolution Cycle]         │
│                                                              │
│  ─────────────────────────────────────────────────────────  │
│                                                              │
│  Quick Actions:                                              │
│  [Clear Low Score (<0.3)] [Clear Inactive]                  │
└─────────────────────────────────────────────────────────────┘
```

### 4.6 MemoryStats 组件

**功能**：
- 统计概览
- 快速了解 Memory 系统状态

**数据来源**：
- `TauriMemoryClient.getMemoryStats()`
- `TauriMemoryClient.getEvolutionStats()`

**UI 结构**：
```
┌─────────────────────────────────────────────────────────────┐
│  Memory Statistics                                           │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │
│  │ Total   │  │ Active  │  │ Avg     │  │ Avg     │       │
│  │   42    │  │   38    │  │ Score   │  │ Decay   │       │
│  │         │  │         │  │  0.72   │  │  0.008  │       │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘       │
│                                                              │
│  By Type:                                                    │
│  identity    ████████████ 12                                │
│  fact        ██████████ 10                                  │
│  preference  ████████ 8                                     │
│  task        ██████ 6                                       │
│  constraint  ████ 4                                         │
│  skill       ██ 2                                           │
└─────────────────────────────────────────────────────────────┘
```

## 五、实现步骤

### 阶段一：基础架构（Day 1）

1. **创建 MemoryUIContext**
   - 文件：`src/context/MemoryUIContext.tsx`
   - 管理 Debug 模式、命中记录、Debug 日志

2. **创建 useMemoryState Hook**
   - 文件：`src/hooks/useMemoryState.ts`
   - 封装 TauriMemoryClient 调用
   - 提供状态管理和操作方法

3. **创建 MemoryPanel 主组件**
   - 文件：`src/components/MemoryPanel/index.tsx`
   - 基础布局和 Tab 切换

### 阶段二：核心模块（Day 2）

4. **实现 MemoryList 组件**
   - 文件：`src/components/MemoryPanel/MemoryList.tsx`
   - 列表展示、排序、筛选、搜索

5. **实现 MemoryStats 组件**
   - 文件：`src/components/MemoryPanel/MemoryStats.tsx`
   - 统计概览展示

### 阶段三：命中记录（Day 3）

6. **修改 ReActEngine**
   - 文件：`src/agent/runtime/ReActEngine.ts`
   - 添加 `onMemoryRetrieved` 回调
   - 传递检索结果到 MemoryUIContext

7. **实现 MemoryHits 组件**
   - 文件：`src/components/MemoryPanel/MemoryHits.tsx`
   - 展示本轮命中 Memory

### 阶段四：Debug 日志（Day 4）

8. **实现 MemoryDebugLog 组件**
   - 文件：`src/components/MemoryPanel/MemoryDebugLog.tsx`
   - 结构化日志展示

9. **在关键位置添加日志记录**
   - ReActEngine：检索过程
   - TauriMemoryClient：强化、衰减、淘汰

### 阶段五：操作面板（Day 5）

10. **实现 MemoryOperations 组件**
    - 文件：`src/components/MemoryPanel/MemoryOperations.tsx`
    - 手动操作功能

11. **后端新增 API（如需要）**
    - `reduce_memory_score` - 手动降低权重
    - `lock_memory` / `unlock_memory` - 锁定/解锁记忆

### 阶段六：集成与测试（Day 6）

12. **集成到主应用**
    - 在 Sidebar 添加 Memory 入口
    - 或在 Header 添加快捷按钮

13. **测试验收**
    - 验证所有验收标准

## 六、后端 API 变更

### 6.1 新增 Tauri Commands（可选）

如果需要"锁定"功能，需要新增：

```rust
// src-tauri/src/commands/memory.rs

#[tauri::command]
pub async fn reduce_memory_score(
    id: String,
    amount: f32,
    state: State<'_, MemoryState>,
) -> Result<(), String> {
    let storage = state.storage.lock().await;
    storage.reduce_memory_score(&id, amount).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn lock_memory(
    id: String,
    locked: bool,
    state: State<'_, MemoryState>,
) -> Result<(), String> {
    let storage = state.storage.lock().await;
    storage.lock_memory(&id, locked).await.map_err(|e| e.to_string())
}
```

### 6.2 数据库变更（如需要锁定功能）

```sql
ALTER TABLE memory_items ADD COLUMN is_locked INTEGER DEFAULT 0;
```

**注意**：锁定功能为可选实现，如暂不实现，UI 可显示"暂不支持"提示。

## 七、前端类型定义

### 7.1 新增类型（src/components/MemoryPanel/types.ts）

```typescript
export type MemoryDebugLogType = 
  | 'retrieval_start'
  | 'retrieval_candidates'
  | 'retrieval_filtered'
  | 'retrieval_complete'
  | 'reinforce'
  | 'decay'
  | 'prune'
  | 'add_memory'
  | 'delete_memory';

export interface MemoryDebugLogEntry {
  id: string;
  type: MemoryDebugLogType;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface MemoryUIState {
  debugMode: boolean;
  currentHits: RetrievedMemory[];
  debugLogs: MemoryDebugLogEntry[];
  refreshTrigger: number;
}

export type MemorySortField = 'score' | 'type' | 'createdAt' | 'lastAccessedAt' | 'accessCount';
export type MemorySortOrder = 'asc' | 'desc';

export interface MemoryFilterOptions {
  types?: MemoryType[];
  minScore?: number;
  maxScore?: number;
  isActive?: boolean;
  searchQuery?: string;
}
```

## 八、验收标准检查

完成后，UI 必须能够回答以下问题：

| 问题 | 对应模块 | 数据来源 |
|------|----------|----------|
| 哪些 memory 被用于当前回答 | MemoryHits | ReActEngine.retrievedMemories |
| 每条 memory 的检索依据 | MemoryHits | RetrievedMemory.components |
| 哪些 memory 被过滤及原因 | MemoryDebugLog | retrieval 过程日志 |
| 是否发生了 reinforce/decay/prune | MemoryDebugLog | evolution 日志 |
| memory 的 score 变化趋势 | MemoryList + Debug Mode | MemoryItem.score |

## 九、禁止事项清单

- ❌ 不实现复杂可视化（图谱 / 节点网络）
- ❌ 不引入重型 UI 库（使用现有 lucide-react + tailwind）
- ❌ 不为 UI 修改 Memory 数据结构
- ❌ 不过度美化（功能优先）

## 十、依赖项

无需新增依赖，使用现有：
- React 19
- lucide-react（图标）
- tailwindcss（样式）
- @tauri-apps/api（Tauri Invoke）
