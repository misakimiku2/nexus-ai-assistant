# 记忆演化能力（Memory Evolution）实现计划

## 概述

为认知记忆系统增加"记忆演化能力"，让记忆能够动态强化和遗忘，实现"越用越强化、不用就遗忘"的能力。

## 实现目标

* 记忆被成功检索并参与回答时自动强化

* 长期未使用的记忆自动衰减（保留强化效果）

* 低价值记忆逐步淘汰（软删除机制）

* 检索排序优先匹配当前问题，记忆权重作为修正项

***

## 一、数据层升级

### 1.1 数据库表结构变更

在 `memory_items` 表中新增字段：

| 字段                   | 类型      | 默认值        | 说明            |
| -------------------- | ------- | ---------- | ------------- |
| `score`              | REAL    | importance | 当前记忆权重（动态）    |
| `decay`              | REAL    | 根据 type 计算 | 衰减速率          |
| `is_active`          | INTEGER | 1          | 是否活跃（0=已标记淘汰） |
| `marked_inactive_at` | INTEGER | NULL       | 标记为不活跃的时间戳    |

### 1.2 Memory Type 衰减速率差异（重要）

不同类型记忆有不同的遗忘速率：

| MemoryType   | decay 默认值 | 说明                |
| ------------ | --------- | ----------------- |
| `identity`   | 0.001     | 几乎不忘（身份特征）        |
| `skill`      | 0.002     | 很难忘记（用户能力）        |
| `constraint` | 0.003     | 较难忘记（限制条件）        |
| `preference` | 0.005     | 中等偏慢（用户偏好）        |
| `fact`       | 0.01      | 标准速率（已知事实）        |
| `task`       | 0.02      | 较快遗忘（进行中任务，可能已完成） |

### 1.3 文件修改

**文件**: `src-tauri/src/memory/storage.rs`

* 修改 `initialize_database()` 添加新字段

* 修改 `add_memory()` 支持新字段写入

* 新增 `update_score()` 方法

* 新增 `mark_inactive()` 方法

* 新增 `delete_inactive_memories()` 方法

* 新增 `get_memories_for_decay()` 方法

* 新增 `batch_update_scores()` 方法

* 修改所有查询方法读取新字段

**文件**: `src-tauri/src/models/memory.rs`

* 在 `MemoryItem` 结构体中新增字段：

  * `score: f32`

  * `decay: f32`

  * `is_active: bool`

  * `marked_inactive_at: Option<i64>`

* 更新 `MemoryItem::new()` 初始化新字段

* 新增 `get_default_decay(memory_type: MemoryType) -> f32` 函数

* 新增 `EvolutionStats` 结构体

***

## 二、新增模块

### 2.1 MemoryEvolutionManager

**文件**: `src-tauri/src/memory/lifecycle.rs`（扩展现有文件）

新增 `MemoryEvolutionManager` 结构体，实现三个核心行为：

#### 2.1.1 reinforce（强化）

```rust
pub async fn reinforce(&self, memory_ids: &[String]) -> Result<usize, Box<dyn std::error::Error>>
```

**触发时机（关键修正）**：

* ❌ 不在 retrieval.rs 触发

* ✅ 在 ReActEngine 生成回答之后触发

**判断条件**：

```typescript
// 在 ReActEngine 中
if (memory 被注入 prompt 且参与回答) {
  reinforce(memory_ids)
}
```

**执行逻辑**：

* `score += 0.05`（上限 1.0）

* `access_count += 1`

* `last_accessed_at = now`

* 如果 `is_active == false`，恢复为 `true` 并清除 `marked_inactive_at`

#### 2.1.2 decay（遗忘）

```rust
pub async fn decay_all(&self) -> Result<DecayResult, Box<dyn std::error::Error>>
```

定期执行（启动时或每 N 分钟）。

**公式（关键修正）**：

❌ 错误写法（会重置强化）：

```
score = importance * exp(-decay * days_since_last_access)
```

✅ 正确写法（保留强化效果）：

```
score = score * exp(-decay * days_since_last_access)
```

**区别说明**：

| 写法                      | 结果                |
| ----------------------- | ----------------- |
| `importance * exp(...)` | ❌ 每次重置，强化白做       |
| `score * exp(...)`      | ✅ 真正"记忆衰减"，强化效果保留 |

**执行逻辑**：

* 遍历所有活跃记忆

* 按各自 decay 速率计算新 score

* 批量更新数据库

#### 2.1.3 prune（淘汰）

```rust
pub async fn prune(&self) -> Result<PruneResult, Box<dyn std::error::Error>>
```

两阶段淘汰机制：

**阶段一**：标记不活跃

```rust
if score < 0.3 && is_active {
    is_active = false;
    marked_inactive_at = now;
}
```

**阶段二**：真正删除

```rust
if score < 0.1 && !is_active && days_since_marked >= 7 {
    delete memory;
}
```

***

## 三、检索排序升级

### 3.1 修改 retrieval.rs

**文件**: `src-tauri/src/memory/retrieval.rs`

**评分公式（关键修正）**：

❌ 原公式（太激进）：

```
final_score = memory.score * 0.6 + similarity * 0.4
```

问题：更相信过去，强记忆 ≠ 当前相关

✅ 新公式（当前问题优先）：

```
final_score = similarity * 0.6 + memory.score * 0.4
```

**原则**：

* 当前问题优先（similarity 0.6）

* 记忆是修正项（score 0.4）

* 避免强记忆被错误优先返回

### 3.2 具体修改

1. 修改 `retrieve()` 方法中的评分计算逻辑
2. 过滤掉 `is_active == false` 的记忆
3. 更新 `ScoreComponents` 结构体：

```rust
pub struct ScoreComponents {
    pub similarity: f32,
    pub memory_score: f32,  // 改名，更清晰
}
```

***

## 四、Tauri Commands 新增

### 4.1 新增命令

**文件**: `src-tauri/src/commands/memory.rs`

```rust
#[tauri::command]
pub async fn reinforce_memories(
    ids: Vec<String>,
    state: State<'_, MemoryState>
) -> Result<usize, String>

#[tauri::command]
pub async fn decay_memories(
    state: State<'_, MemoryState>
) -> Result<DecayResult, String>

#[tauri::command]
pub async fn prune_memories_v2(
    state: State<'_, MemoryState>
) -> Result<PruneResult, String>

#[tauri::command]
pub async fn get_evolution_stats(
    state: State<'_, MemoryState>
) -> Result<EvolutionStats, String>
```

### 4.2 修改 MemoryState

**文件**: `src-tauri/src/commands/memory.rs`

在 `MemoryState` 中新增：

```rust
pub evolution: Arc<Mutex<MemoryEvolutionManager>>
```

***

## 五、前端 TypeScript 更新

### 5.1 类型定义

**文件**: `src/types.ts`

更新 `MemoryItem` 接口：

```typescript
interface MemoryItem {
  // ... 现有字段
  score: number;
  decay: number;
  isActive: boolean;
  markedInactiveAt?: number;
}
```

新增类型：

```typescript
interface DecayResult {
  processed: number;
  updated: number;
}

interface PruneResult {
  markedInactive: number;
  deleted: number;
}

interface EvolutionStats {
  activeCount: number;
  inactiveCount: number;
  avgScore: number;
  avgDecay: number;
}
```

### 5.2 TauriMemoryClient 更新

**文件**: `src/agent/memory/TauriMemoryClient.ts`

新增方法：

```typescript
static async reinforceMemories(ids: string[]): Promise<number>
static async decayMemories(): Promise<DecayResult>
static async pruneMemoriesV2(): Promise<PruneResult>
static async getEvolutionStats(): Promise<EvolutionStats>
```

***

## 六、触发机制（关键）

### 6.1 启动时执行

**文件**: `src-tauri/src/lib.rs`

在应用启动时：

1. 执行 `decay_all()` 更新所有记忆的 score
2. 执行 `prune()` 清理低价值记忆

### 6.2 回答后强化（核心修正）

**文件**: `src/agent/runtime/ReActEngine.ts`

在生成回答之后触发强化：

```typescript
// 伪代码
async generateResponse(query: string, memories: RetrievedMemory[]) {
  // 1. 注入记忆到 prompt
  const prompt = this.buildPrompt(query, memories);
  
  // 2. 生成回答
  const response = await this.llm.generate(prompt);
  
  // 3. 判断记忆是否参与回答（简化判断）
  const usedMemoryIds = this.detectUsedMemories(response, memories);
  
  // 4. 强化被使用的记忆
  if (usedMemoryIds.length > 0) {
    await TauriMemoryClient.reinforceMemories(usedMemoryIds);
  }
  
  return response;
}

// 简化判断：检查回答中是否包含记忆内容的关键词
detectUsedMemories(response: string, memories: RetrievedMemory[]): string[] {
  return memories
    .filter(m => {
      const keywords = m.item.content.split(' ').slice(0, 5).join(' ');
      return response.includes(keywords);
    })
    .map(m => m.item.id);
}
```

***

## 七、兼容性处理

### 7.1 数据迁移

在 `storage.rs` 的 `initialize_database()` 中：

* 检测旧表结构

* 自动添加新字段（ALTER TABLE）

* 为现有记忆设置默认值：

  * `score = importance`

  * `decay = get_default_decay(memory_type)`

  * `is_active = 1`

### 7.2 向后兼容

* `importance` 仍作为基础权重保留

* `score` 初始值等于 `importance`

* 现有 API 保持不变，仅新增方法

***

## 八、实现步骤

### Step 1: 数据模型更新

1. 修改 `models/memory.rs` 添加新字段和 `get_default_decay()` 函数
2. 修改 `storage.rs` 表结构和 CRUD 方法

### Step 2: 演化管理器实现

1. 在 `lifecycle.rs` 中实现 `MemoryEvolutionManager`
2. 实现 `reinforce`、`decay`、`prune` 三个核心方法
3. **确保 decay 公式使用** **`score * exp(...)`** **而非** **`importance * exp(...)`**

### Step 3: 检索逻辑更新

1. 修改 `retrieval.rs` 的评分公式
2. **确保 similarity 权重为 0.6，score 权重为 0.4**
3. 添加 `is_active` 过滤

### Step 4: Commands 暴露

1. 在 `commands/memory.rs` 添加新的 Tauri Commands
2. 更新 `MemoryState`

### Step 5: 前端适配

1. 更新 `types.ts` 类型定义
2. 更新 `TauriMemoryClient.ts` 添加新方法

### Step 6: ReActEngine 集成（关键）

1. 在 `ReActEngine.ts` 中添加强化触发逻辑
2. 实现简化版的 `detectUsedMemories()` 方法

### Step 7: 集成测试

1. 测试数据迁移
2. 测试强化/衰减/淘汰流程
3. **验证 decay 不会重置强化效果**
4. 测试检索排序

***

## 九、文件变更清单

| 文件                                      | 操作 | 说明                                                     |
| --------------------------------------- | -- | ------------------------------------------------------ |
| `src-tauri/src/models/memory.rs`        | 修改 | 添加 score、decay、is\_active 等字段，新增 get\_default\_decay() |
| `src-tauri/src/memory/storage.rs`       | 修改 | 表结构升级、新增方法                                             |
| `src-tauri/src/memory/lifecycle.rs`     | 修改 | 新增 MemoryEvolutionManager                              |
| `src-tauri/src/memory/retrieval.rs`     | 修改 | 更新评分公式（similarity 0.6 + score 0.4）                     |
| `src-tauri/src/commands/memory.rs`      | 修改 | 新增 Commands                                            |
| `src-tauri/src/lib.rs`                  | 修改 | 启动时执行演化逻辑                                              |
| `src/types.ts`                          | 修改 | 更新类型定义                                                 |
| `src/agent/memory/TauriMemoryClient.ts` | 修改 | 新增 API 方法                                              |
| `src/agent/runtime/ReActEngine.ts`      | 修改 | **新增强化触发逻辑**                                           |

***

## 十、关键修正总结

| 问题             | 原方案                                | 修正后                                |
| -------------- | ---------------------------------- | ---------------------------------- |
| reinforce 触发时机 | retrieval.rs 中触发                   | ReActEngine 生成回答后触发                |
| decay 公式       | `importance * exp(...)` ❌          | `score * exp(...)` ✅               |
| 检索权重           | `score * 0.6 + similarity * 0.4` ❌ | `similarity * 0.6 + score * 0.4` ✅ |
| Memory Type 差异 | 统一 decay = 0.01                    | 按类型设置不同 decay 值                    |

***

## 十一、预期效果

1. **强化效果**：参与回答的记忆 score 逐渐升高，强化效果在衰减后仍保留
2. **衰减效果**：长期未使用的记忆 score 逐渐降低，但不会重置之前的强化
3. **类型差异**：身份特征几乎不忘，任务类记忆较快遗忘
4. **淘汰效果**：低价值记忆先标记为不活跃，7天后自动删除
5. **检索优化**：当前问题优先匹配，记忆权重作为修正项

